// backend/src/accounts/accounts.service.ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingNoteType,
  AccountingPartyType,
  BankReconcileStatus,
  GstTreatment,
  LedgerEntryType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PurchaseBillStatus,
} from '@prisma/client';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { resolveItemDetails } from '../common/resolve-item-details';
import { CostTableService } from '../cost-table/cost-table.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { HrService } from '../hr/hr.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BillingService } from '../billing/billing.service';

type AccountsUser = { id: string; role: string; email: string };

// Sanket is the super-admin — he can approve any order with no restrictions
const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';

type UpdatePendingPaymentDto = {
  amount?: number;
  method?: PaymentMethod;
  paymentAccountId?: string;
  referenceNumber?: string | null;
  notes?: string | null;
  paymentDate?: string;
};

type CreatePurchaseBillDto = {
  vendorId: string;
  billNumber: string;
  billDate?: string;
  dueDate?: string;
  subtotal: number;
  taxableAmount?: number;
  gstRatePct?: number;
  gstTreatment?: GstTreatment;
  notes?: string;
};

type CreateVendorPaymentDto = {
  vendorId: string;
  purchaseBillId?: string;
  paymentAccountId: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  notes?: string;
  paymentDate?: string;
};

type CreateAccountingNoteDto = {
  noteType: AccountingNoteType;
  partyType: AccountingPartyType;
  customerId?: string;
  vendorId?: string;
  invoiceId?: string;
  purchaseBillId?: string;
  reason: string;
  taxableAmount: number;
  gstRatePct?: number;
  gstTreatment?: GstTreatment;
  noteDate?: string;
};

function assertAccountsUser(user: AccountsUser) {
  if (!['ADMIN', 'ACCOUNTS'].includes(user.role)) {
    throw new ForbiddenException('Accounts approval is restricted to accounts/admin users');
  }
}

@Injectable()
export class AccountsService {
  constructor(
    private prisma: PrismaService,
    private whatsapp: WhatsAppService,
    private costTable: CostTableService,
    private loyalty: LoyaltyService,
    private hr: HrService,
    private notifications: NotificationsService,
    private billing: BillingService,
  ) {}

  private readonly companyState = (process.env.COMPANY_GST_STATE ?? 'Maharashtra').trim().toLowerCase();

  private money(value: unknown) {
    const n = Number(value ?? 0);
    if (!Number.isFinite(n)) throw new BadRequestException('Invalid amount');
    return Math.round(n * 100) / 100;
  }

  private parseDate(value?: string) {
    if (!value) return undefined;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Invalid date');
    return date;
  }

  private gstTreatmentForState(state?: string | null): GstTreatment {
    if (!state) return GstTreatment.INTRA_STATE;
    return state.trim().toLowerCase() === this.companyState
      ? GstTreatment.INTRA_STATE
      : GstTreatment.INTER_STATE;
  }

  private splitGst(taxableAmount: number, gstRatePct: number, gstTreatment: GstTreatment) {
    const taxAmount = this.money((taxableAmount * gstRatePct) / 100);
    if (gstTreatment === GstTreatment.INTER_STATE) {
      return { cgstAmount: 0, sgstAmount: 0, igstAmount: taxAmount, taxAmount };
    }
    const half = this.money(taxAmount / 2);
    return { cgstAmount: half, sgstAmount: this.money(taxAmount - half), igstAmount: 0, taxAmount };
  }

  private async createInvoiceAndLedger(tx: any, order: any) {
    const existing = await tx.invoice.findUnique({ where: { orderId: order.id } });
    if (existing) return existing;

    const payments = order.payments ?? [];
    const paidAmount = this.money(
      payments
        .filter((p: any) => p.verificationStatus === 'VERIFIED')
        .reduce((sum: number, payment: any) => sum + Number(payment.amount), 0),
    );
    const gstTreatment = this.gstTreatmentForState(order.customer?.state);
    const subtotal = this.money(order.subtotal);
    const discountAmount = this.money(order.discount);
    const taxableAmount = this.money(subtotal - discountAmount + Number(order.shippingCharge ?? 0));
    const taxAmount = this.money(order.taxAmount);
    const fallbackGst = taxableAmount > 0 ? (taxAmount / taxableAmount) * 100 : 0;
    const invoiceSplit = taxAmount > 0
      ? this.splitGst(taxableAmount, fallbackGst, gstTreatment)
      : { cgstAmount: 0, sgstAmount: 0, igstAmount: 0, taxAmount: 0 };
    const totalAmount = this.money(order.grandTotal);

    const invoice = await tx.invoice.create({
      data: {
        orderId: order.id,
        invoiceNumber: order.orderNumber,
        subtotal,
        discountAmount,
        taxableAmount,
        cgstAmount: invoiceSplit.cgstAmount,
        sgstAmount: invoiceSplit.sgstAmount,
        igstAmount: invoiceSplit.igstAmount,
        taxAmount,
        totalAmount,
        paidAmount,
        balanceAmount: this.money(totalAmount - paidAmount),
        gstTreatment,
        dueDate: order.expectedDelivery ?? null,
        notes: 'Auto-generated from accounts approval. Invoice number follows order number.',
      },
    });

    for (const item of order.items) {
      const itemTaxable = this.money(Number(item.lineTotal) - Number(item.taxAmount ?? 0));
      const itemGst = this.splitGst(itemTaxable, Number(item.taxRatePct ?? 0), gstTreatment);
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productName: item.product.name,
          sku: item.product.sku,
          hsnSac: null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.lineDiscount,
          taxableAmount: itemTaxable,
          gstRatePct: item.taxRatePct,
          cgstAmount: itemGst.cgstAmount,
          sgstAmount: itemGst.sgstAmount,
          igstAmount: itemGst.igstAmount,
          lineTotal: item.lineTotal,
        },
      });
    }

    await tx.accountingLedgerEntry.createMany({
      data: [
        {
          entryType: LedgerEntryType.SALE,
          accountName: 'Customer Receivable',
          debitAmount: totalAmount,
          creditAmount: 0,
          narration: `Invoice ${order.orderNumber} raised to ${order.customer.businessName}`,
          referenceType: 'INVOICE',
          referenceId: invoice.id,
          customerId: order.customerId,
          orderId: order.id,
          invoiceId: invoice.id,
        },
        {
          entryType: LedgerEntryType.SALE,
          accountName: 'Sales',
          debitAmount: 0,
          creditAmount: taxableAmount,
          narration: `Sales booked for invoice ${order.orderNumber}`,
          referenceType: 'INVOICE',
          referenceId: invoice.id,
          customerId: order.customerId,
          orderId: order.id,
          invoiceId: invoice.id,
        },
        ...(taxAmount > 0 ? [{
          entryType: LedgerEntryType.GST,
          accountName: 'Output GST',
          debitAmount: 0,
          creditAmount: taxAmount,
          narration: `GST output booked for invoice ${order.orderNumber}`,
          referenceType: 'INVOICE',
          referenceId: invoice.id,
          customerId: order.customerId,
          orderId: order.id,
          invoiceId: invoice.id,
        }] : []),
      ],
    });

    return invoice;
  }

  private async refreshOrderPaymentStatus(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });
    if (!order) return;

    const totalPaid = order.payments
      .filter((p) => p.verificationStatus === 'VERIFIED')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    const grandTotal = Number(order.grandTotal);
    const paymentStatus =
      totalPaid >= grandTotal ? PaymentStatus.PAID :
      totalPaid > 0 ? PaymentStatus.PARTIALLY_PAID :
      PaymentStatus.PENDING;

    await this.prisma.order.update({ where: { id: orderId }, data: { paymentStatus } });
  }

  async getPendingOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_APPROVAL },
      include: {
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: { include: { product: true, offerCode: true } },
        payments: {
          include: { paymentAccount: true },
          orderBy: { paymentDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const productIds = Array.from(new Set(
      orders.flatMap((order) => order.items.map((item) => item.productId)),
    ));
    const slabs = await this.prisma.productCostSlab.findMany({
      where: { productId: { in: productIds } },
      orderBy: { minQuantity: 'asc' },
    });
    const slabsByProductId = slabs.reduce((map, slab) => {
      const rows = map.get(slab.productId) ?? [];
      rows.push(slab);
      map.set(slab.productId, rows);
      return map;
    }, new Map<string, typeof slabs>());

    return orders.map((order) => {
      const totalPaid  = order.payments
        .filter((p) => p.verificationStatus === 'VERIFIED')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const grandTotal = Number(order.grandTotal);
      const balanceDue = Math.max(0, grandTotal - totalPaid);

      return {
        id: order.id,
        orderNo: order.orderNumber,
        isTest: order.isTest,
        customerName:  order.customer.businessName,
        customerPhone: order.customer.phone ?? '',
        customerEmail: order.customer.email,
        customerGstNumber: order.customer.gstNumber ?? null,
        shippingAddress: order.customer.shippingAddress ?? order.customer.billingAddress ?? null,
        salesAgentName: order.salesAgent?.fullName ?? null,
        customerAddress: [
          order.customer.billingAddress,
          order.customer.shippingAddress,
        ].filter(Boolean).join(' | ') || null,
        products: order.items.map((i) => `${i.product.name} (×${i.quantity})`).join(', '),
        items: order.items.map((i) => {
          const matchingSlab = (slabsByProductId.get(i.productId) ?? [])
            .filter((slab) =>
              slab.minQuantity <= i.quantity &&
              (slab.maxQuantity == null || slab.maxQuantity >= i.quantity),
            )
            .sort((a, b) => b.minQuantity - a.minQuantity)[0];
          const unitPrice = Number(i.unitPrice);
          const lineTotal = Number(i.lineTotal);
          const rawSlabCost = matchingSlab ? Number(matchingSlab.unitPrice) : null;
          const costPerUnit = rawSlabCost == null
            ? null
            : rawSlabCost > unitPrice
              ? rawSlabCost / matchingSlab.minQuantity
              : rawSlabCost;
          const costTotal = costPerUnit == null ? null : costPerUnit * i.quantity;
          const marginTotal = costTotal == null ? null : lineTotal - costTotal;
          const marginPct = marginTotal == null || lineTotal <= 0
            ? null
            : (marginTotal / lineTotal) * 100;

          return {
            productName:     i.product.name,
            productDescription: i.product.description,
            sku:             i.product.sku,
            sizeInches:      i.product.sizeInches,
            gsm:             i.product.gsm,
            sides:           i.product.sides,
            quantity:        i.quantity,
            unitPrice,
            lineTotal,
            productionNotes: i.productionNotes,
            artworkNotes:    i.artworkNotes,
            costPerUnit: costPerUnit == null ? null : Number(costPerUnit.toFixed(4)),
            costTotal: costTotal == null ? null : Number(costTotal.toFixed(2)),
            marginTotal: marginTotal == null ? null : Number(marginTotal.toFixed(2)),
            marginPct: marginPct == null ? null : Number(marginPct.toFixed(2)),
            offerCode: (i as any).offerCode ? {
              code: (i as any).offerCode.code,
              offerType: (i as any).offerCode.offerType,
              description: (i as any).offerCode.description,
              discountAmount: (i as any).offerCode.discountAmount ? Number((i as any).offerCode.discountAmount) : null,
            } : null,
          };
        }),
        totalAmount: grandTotal,
        totalPaid,
        balanceDue,
        orderDate: order.orderDate.toISOString(),
        notes: order.notes,
        hasPendingPayments: order.payments.some((p) => p.verificationStatus === 'PENDING_VERIFICATION'),
        advancePct: grandTotal > 0
          ? Math.min(100, (totalPaid / grandTotal) * 100)
          : 100,
        payments: order.payments.map((p) => ({
          id: p.id,
          date: p.paymentDate.toISOString(),
          amount: Number(p.amount),
          method: p.method,
          referenceNumber: p.referenceNumber,
          notes: p.notes,
          accountName: p.paymentAccount.name,
          verificationStatus: p.verificationStatus,
        })),
      };
    });
  }

  async getPendingDispatchOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_DISPATCH_APPROVAL },
      include: {
        customer: true,
        salesAgent: { select: { id: true, fullName: true } },
        items: { include: { product: true } },
        payments: {
          include: { paymentAccount: true },
          orderBy: { paymentDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orders.map((order) => {
      const totalPaid  = order.payments
        .filter((p) => p.verificationStatus === 'VERIFIED')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const grandTotal = Number(order.grandTotal);
      const balanceDue = grandTotal - totalPaid;
      const customerCredit = Math.max(0, totalPaid - grandTotal);

      const courierMatch      = order.notes?.match(/Courier(?:\s+charges)?:\s*₹?([\d.]+)/i);
      const paymentTypeMatch  = order.notes?.match(/\b(COD|Prepaid)\b/i);
      const codAmountMatch     = order.notes?.match(/COD(?:\s+amount)?:\s*₹?([\d.]+)/i);
      const courierCharge = courierMatch ? parseFloat(courierMatch[1]) : null;
      const courierCreditApplied = courierCharge == null ? 0 : Math.min(customerCredit, courierCharge);
      const netCourierCharge = courierCharge == null ? null : courierCharge - courierCreditApplied;

      // Only show the item(s) actually covered by THIS dispatch submission,
      // not every item on the order — an order can now be submitted one
      // ready item at a time (see submitDispatchBatch), so showing all
      // items here made a single-item submission look like the whole order
      // was pending approval. Empty/missing list (older orders, or a
      // submission that genuinely covered everything) falls back to
      // showing every item, unchanged from before.
      const submittedIds: string[] = (order as any).pendingDispatchItemIds ?? [];
      const itemsForApproval = submittedIds.length > 0
        ? order.items.filter((i) => submittedIds.includes(i.id))
        : order.items;

      return {
        id: order.id,
        orderNo: order.orderNumber,
        isTest: order.isTest,
        customerName:  order.customer.businessName,
        customerPhone: order.customer.phone ?? '',
        customerEmail: order.customer.email,
        shippingAddress: order.customer.shippingAddress ?? order.customer.billingAddress ?? null,
        salesAgentName: order.salesAgent?.fullName ?? null,
        items: itemsForApproval.map((i) => {
          // Prefer the item's own productionNotes (an order can override the
          // product's catalog defaults per-line) and fall back to the
          // product's own sizeInches/gsm/paperType/sides otherwise -- this
          // tab used to only ever show the product's defaults, ignoring any
          // per-order override, and never showed Paper at all.
          const { size, gsm, paper, sides, printingType } = resolveItemDetails(i.productionNotes, i.product);
          return {
            productName:     i.product.name,
            productDescription: i.product.description,
            sku:             i.product.sku,
            sizeInches:      size,
            gsm,
            paper,
            sides,
            printingType,
            quantity:        i.quantity,
            unitPrice:       Number(i.unitPrice),
            lineTotal:       Number(i.lineTotal),
            productionNotes: i.productionNotes,
            artworkNotes:    i.artworkNotes,
          };
        }),
        totalAmount: grandTotal,
        totalPaid,
        balanceDue,
        orderDate: order.orderDate.toISOString(),
        notes: order.notes,
        courierCharge,
        courierCreditApplied,
        netCourierCharge,
        paymentType:   paymentTypeMatch ? paymentTypeMatch[1].toUpperCase() : null,
        codAmount:     codAmountMatch ? parseFloat(codAmountMatch[1]) : null,
        dispatchProductPhoto: (order as any).dispatchProductPhoto ?? null,
        dispatchBillPhoto:    (order as any).dispatchBillPhoto ?? null,
        payments: order.payments.map((p) => ({
          id: p.id,
          date: p.paymentDate.toISOString(),
          amount: Number(p.amount),
          method: p.method,
          referenceNumber: p.referenceNumber,
          notes: p.notes,
          accountName: p.paymentAccount.name,
        })),
      };
    });
  }

  // ── Approve order → WhatsApp "Approved ✅" ────────────────────────────────
  async approveOrder(orderId: string, user: AccountsUser, overrideReason?: string) {
    assertAccountsUser(user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
        payments: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only pending accounts approval orders can be approved');
    }

    // Items with an offer code are free items — skip all cost/margin checks for them
    const offerItems = new Set(order.items.filter((i) => (i as any).offerCodeId).map((i) => i.id));
    const billableItems = order.items.filter((i) => !offerItems.has(i.id));

    // Sanket (super-admin) can approve any order with no restrictions whatsoever
    const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

    // If an override reason is provided (e.g. free stickers, combo discount), skip cost/margin checks
    const isOverride = !!overrideReason?.trim();

    // ── Rule: All payments must be verified before approval (hard block, all users) ──
    const unverifiedPayments = order.payments.filter(
      (p) => p.verificationStatus === 'PENDING_VERIFICATION',
    );
    if (unverifiedPayments.length > 0) {
      throw new BadRequestException(
        `Cannot approve: ${unverifiedPayments.length} payment(s) are still pending verification. Verify all receipts before approving the order.`,
      );
    }

    // ── Rule: Minimum 40% advance required (super-admin bypasses) ───────────────
    const totalVerifiedPaid = order.payments
      .filter((p) => p.verificationStatus === 'VERIFIED')
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const grandTotal = Number(order.grandTotal);
    const advancePct = grandTotal > 0 ? (totalVerifiedPaid / grandTotal) * 100 : 100;
    if (!isSuperAdmin && advancePct < 40) {
      throw new BadRequestException(
        `Cannot approve: only ${advancePct.toFixed(1)}% advance received (₹${totalVerifiedPaid.toLocaleString('en-IN')} of ₹${grandTotal.toLocaleString('en-IN')}). Minimum 40% required. Only super-admin can approve below this threshold.`,
      );
    }

    // Block approval if any billable item has no cost slab
    const productIds = billableItems.map((i) => i.productId);
    const allCostSlabs = productIds.length
      ? await this.prisma.productCostSlab.findMany({ where: { productId: { in: productIds } } })
      : [];

    if (!isSuperAdmin && !isOverride) {
      const productsWithCost = new Set(allCostSlabs.map((s) => s.productId));
      const missingCostItems = billableItems.filter((i) => !productsWithCost.has(i.productId));
      if (missingCostItems.length > 0) {
        const skus = missingCostItems.map((i) => (i.product as any)?.sku ?? i.productId).join(', ');
        throw new BadRequestException(
          `Cannot approve: cost data is missing for ${missingCostItems.length} item(s) — ${skus}. Please add cost slabs in the Cost Table first.`,
        );
      }

      // Block approval if any billable item's margin is below the minimum approval margin
      const settings = this.costTable.getSettings();
      const lowMarginItems: string[] = [];
      for (const item of billableItems) {
        const qty = item.quantity;
        const matchingSlab = allCostSlabs
          .filter(
            (s) =>
              s.productId === item.productId &&
              s.minQuantity <= qty &&
              (s.maxQuantity == null || s.maxQuantity >= qty),
          )
          .sort((a, b) => b.minQuantity - a.minQuantity)[0];
        if (!matchingSlab) continue;

        const rawCost = Number(matchingSlab.unitPrice);
        // Derived from lineTotal/quantity rather than the stored
        // item.unitPrice field -- unitPrice can drift from what was
        // actually charged (e.g. the order's TOTAL amount typed into the
        // unit-price box by mistake) while lineTotal is what was really
        // invoiced, so it's the more robust basis both for this cost-slab
        // heuristic and for the margin% gate below. A real incident: Order
        // #1540 (Nikita Paul, Aug 2026) had unitPrice=5227 with
        // lineTotal=5227 for qty=5000 (should have been ~1.05/unit) --
        // trusting that corrupted unitPrice here would have shown a wildly
        // wrong margin% on this exact approval gate.
        const salePerUnit = item.quantity > 0 ? Number(item.lineTotal) / item.quantity : Number(item.unitPrice);
        const costPerUnit = rawCost > salePerUnit ? rawCost / matchingSlab.minQuantity : rawCost;
        const marginPct = salePerUnit > 0 ? ((salePerUnit - costPerUnit) / salePerUnit) * 100 : 0;

        if (marginPct < settings.minApprovalMarginPct) {
          const sku = (item.product as any)?.sku ?? item.productId;
          lowMarginItems.push(`${sku} (margin: ${marginPct.toFixed(1)}%)`);
        }
      }
      if (lowMarginItems.length > 0) {
        throw new BadRequestException(
          `Cannot approve: margin is below the minimum ${settings.minApprovalMarginPct}% for item(s) — ${lowMarginItems.join(', ')}. Adjust the sale price or cost slab.`,
        );
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.APPROVED },
      });
      const invoice = await this.createInvoiceAndLedger(tx, order);
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: OrderStatus.PENDING_APPROVAL,
          toStatus: OrderStatus.APPROVED,
          changedById: user.id,
          reason: isOverride
            ? `Accounts approved order with override: ${overrideReason}`
            : 'Accounts approved order and generated invoice',
          metadata: { invoiceNumber: order.orderNumber, ...(isOverride ? { overrideReason } : {}) },
        },
      });
      return { approved, invoice };
    });

    void this.whatsapp.sendInvoiceGenerated({
      customerName: order.customer.businessName,
      customerPhone: order.customer.phone ?? '',
      invoiceNumber: result.invoice.invoiceNumber,
      invoiceDate: result.invoice.issueDate.toISOString().slice(0, 10),
      totalAmount: Number(result.invoice.totalAmount),
      gstAmount: Number(result.invoice.taxAmount),
      balanceAmount: Number(result.invoice.balanceAmount),
      agentName: order.salesAgent?.fullName ?? 'Rareprint Team',
    }).then((sent) => this.prisma.invoice.update({
      where: { id: result.invoice.id },
      data: {
        whatsappStatus: sent ? 'SENT' : 'FAILED',
        whatsappSentAt: sent ? new Date() : null,
        whatsappError: sent ? null : 'AiSensy invoice message failed or customer phone missing',
      },
    }).catch(() => undefined));

    // Send the invoice PDF itself as a WhatsApp document attachment — the
    // call above is a text-only notification, this is the actual bill PDF
    // going out "as soon as the order is approved and invoice is generated"
    // per the Billing module requirement. Uses the approved "invoice_pdf_erp"
    // AiSensy template (2026-08-29) via BillingService.sendInvoicePdfDocument
    // — fire-and-forget, never throws, so it can't regress order approval
    // even if AiSensy is down or the customer has no phone on file.
    this.billing
      .sendInvoicePdfDocument(result.invoice.id, order.customer.businessName, order.customer.phone ?? '')
      .catch((err) => console.error(`Invoice PDF WhatsApp send failed for order ${orderId}:`, err));

    // Loyalty points earn on invoicing. Fire-and-forget with its own catch so
    // a loyalty bug never blocks order approval — the order/invoice are
    // already committed above.
    this.loyalty.earnForOrder(orderId).catch((err) =>
      console.error(`Loyalty earnForOrder failed for order ${orderId}:`, err),
    );

    // If the sales agent requested a loyalty-points redemption when creating
    // the order (see CreateOrderDto.requestedLoyaltyRedemption), apply it now
    // that the invoice exists — same fire-and-forget pattern as earn above.
    const requestedRedemption = Number((order as any).requestedLoyaltyRedemption ?? 0);
    if (requestedRedemption > 0) {
      this.loyalty.redeemForOrder(orderId, requestedRedemption).catch((err) =>
        console.error(`Loyalty redeemForOrder failed for order ${orderId}:`, err),
      );
    }

    return result.approved;
  }

  async rejectOrder(orderId: string, reason: string) {
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.CANCELLED },
    });
    // No-op unless points were already earned on this order (e.g. rejected
    // after a prior approval was undone some other way) — safe either way.
    this.loyalty.reverseForOrder(orderId, reason || 'Order rejected/cancelled').catch((err) =>
      console.error(`Loyalty reverseForOrder failed for order ${orderId}:`, err),
    );
    return updated;
  }

  // ── Cancellation requests (agent requests via OrdersService.requestCancellation,
  //    only while item(s) are still NOT_PRINTED — Accounts approves or rejects here) ──

  async getPendingCancellations() {
    const orders = await this.prisma.order.findMany({
      where: ({ cancellationRequestedAt: { not: null } } as any),
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
      orderBy: ({ cancellationRequestedAt: 'desc' } as any),
    });
    return orders.map((order) => {
      const pendingIds: string[] = (order as any).pendingCancelItemIds ?? [];
      const isWholeOrder = pendingIds.length === 0;
      const targetItems = isWholeOrder ? order.items : order.items.filter((i) => pendingIds.includes(i.id));
      return {
        id: order.id,
        orderNo: order.orderNumber,
        customerName: order.customer.businessName,
        salesAgentName: order.salesAgent?.fullName ?? null,
        isWholeOrder,
        requestedByName: (order as any).cancellationRequestedByName ?? null,
        requestedAt: (order as any).cancellationRequestedAt,
        reason: (order as any).cancellationReason ?? null,
        items: targetItems.map((i) => ({
          id: i.id,
          productName: i.product.name,
          quantity: i.quantity,
          lineTotal: Number(i.lineTotal),
        })),
        amountAffected: this.money(targetItems.reduce((s, i) => s + Number(i.lineTotal), 0)),
        orderTotal: Number(order.grandTotal),
      };
    });
  }

  // Rebuilds the linked Invoice (totals + line items) to reflect only
  // `remainingItems` — reused for both whole-order cancellation (called with
  // an empty array, which zeroes the invoice out) and item-level
  // cancellation (called with whatever items are left). InvoiceItem rows
  // have no FK back to OrderItem (they're a denormalized snapshot taken at
  // invoice-creation time), so delete-and-recreate from the current item set
  // is simpler and safer than trying to match/patch individual rows. Posts a
  // CREDIT_NOTE ledger entry for the amount actually removed, same account
  // ("Customer Receivable") the original SALE entry debited in
  // createInvoiceAndLedger, so the books stay balanced. paidAmount is left
  // untouched — money already received doesn't un-receive itself; a genuine
  // refund is a separate manual accounts action, out of scope here.
  private async reconcileInvoiceToRemainingItems(
    tx: any,
    invoice: any,
    order: any,
    remainingItems: any[],
    narration: string,
  ) {
    const gstTreatment = invoice.gstTreatment as GstTreatment;
    const oldTotal = this.money(invoice.totalAmount);

    const newSubtotal = this.money(remainingItems.reduce((s, i) => s + Number(i.lineTotal), 0));
    const discountAmount = this.money(invoice.discountAmount);
    const shippingCharge = Number(order.shippingCharge ?? 0);
    const newTaxableAmount = Math.max(0, this.money(newSubtotal - discountAmount + shippingCharge));

    let cgst = 0, sgst = 0, igst = 0, tax = 0;
    const itemRows = remainingItems.map((item) => {
      const itemTaxable = this.money(Number(item.lineTotal) - Number(item.taxAmount ?? 0));
      const split = this.splitGst(itemTaxable, Number(item.taxRatePct ?? 0), gstTreatment);
      cgst += split.cgstAmount; sgst += split.sgstAmount; igst += split.igstAmount; tax += split.taxAmount;
      return { item, itemTaxable, split };
    });

    const newTotalAmount = this.money(newTaxableAmount + tax);
    const paidAmount = this.money(invoice.paidAmount);
    const newBalance = this.money(newTotalAmount - paidAmount);

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        subtotal: newSubtotal,
        taxableAmount: newTaxableAmount,
        cgstAmount: this.money(cgst),
        sgstAmount: this.money(sgst),
        igstAmount: this.money(igst),
        taxAmount: this.money(tax),
        totalAmount: newTotalAmount,
        balanceAmount: newBalance,
      },
    });

    await tx.invoiceItem.deleteMany({ where: { invoiceId: invoice.id } });
    for (const { item, itemTaxable, split } of itemRows) {
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          productName: item.product?.name ?? 'Item',
          sku: item.product?.sku ?? null,
          hsnSac: null,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.lineDiscount,
          taxableAmount: itemTaxable,
          gstRatePct: item.taxRatePct,
          cgstAmount: split.cgstAmount,
          sgstAmount: split.sgstAmount,
          igstAmount: split.igstAmount,
          lineTotal: item.lineTotal,
        },
      });
    }

    const removedAmount = this.money(oldTotal - newTotalAmount);
    if (removedAmount > 0) {
      await tx.accountingLedgerEntry.create({
        data: {
          entryType: LedgerEntryType.CREDIT_NOTE,
          accountName: 'Customer Receivable',
          debitAmount: 0,
          creditAmount: removedAmount,
          narration: `${narration} — invoice ${invoice.invoiceNumber} reduced by ₹${removedAmount}`,
          referenceType: 'INVOICE',
          referenceId: invoice.id,
          customerId: order.customerId,
          orderId: order.id,
          invoiceId: invoice.id,
        },
      });
    }
  }

  async approveCancellation(orderId: string, user: AccountsUser) {
    assertAccountsUser(user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, items: { include: { product: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!(order as any).cancellationRequestedAt) {
      throw new BadRequestException('This order has no pending cancellation request');
    }

    const pendingIds: string[] = (order as any).pendingCancelItemIds ?? [];
    const isWholeOrder = pendingIds.length === 0;
    const targetItems = isWholeOrder ? order.items : order.items.filter((i) => pendingIds.includes(i.id));
    const invoice = await this.prisma.invoice.findUnique({ where: { orderId } });

    return this.prisma.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { id: { in: targetItems.map((i) => i.id) } },
        data: ({ cancelledAt: new Date() } as any),
      });

      const clearedRequestFields = ({
        cancellationRequestedAt: null,
        cancellationRequestedByName: null,
        cancellationReason: null,
        pendingCancelItemIds: [],
      } as any);

      let updated;
      if (isWholeOrder) {
        updated = await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED, ...clearedRequestFields },
        });
        if (invoice) {
          await this.reconcileInvoiceToRemainingItems(tx, invoice, order, [], 'Whole order cancelled');
        }
        // Reverse loyalty points earned on this order — matches rejectOrder's
        // behavior for a whole-order cancellation. Not done for the
        // item-level branch below: LoyaltyService only supports reversing an
        // entire order's EARN transaction, not a proportional per-item share.
        this.loyalty.reverseForOrder(orderId, (order as any).cancellationReason || 'Order cancelled').catch((err) =>
          console.error(`Loyalty reverseForOrder failed for order ${orderId}:`, err),
        );
      } else {
        const remainingItems = order.items.filter((i) => !targetItems.some((t) => t.id === i.id));
        const removedSubtotal = targetItems.reduce((s, i) => s + Number(i.lineTotal), 0);
        const removedTax = targetItems.reduce((s, i) => s + Number(i.taxAmount ?? 0), 0);
        updated = await tx.order.update({
          where: { id: orderId },
          data: ({
            subtotal: Math.max(0, this.money(Number(order.subtotal) - removedSubtotal)),
            taxAmount: Math.max(0, this.money(Number(order.taxAmount) - removedTax)),
            grandTotal: Math.max(0, this.money(Number(order.grandTotal) - removedSubtotal - removedTax)),
            ...clearedRequestFields,
          } as any),
        });
        if (invoice) {
          await this.reconcileInvoiceToRemainingItems(
            tx, invoice, order, remainingItems,
            `${targetItems.length} item(s) cancelled`,
          );
        }
      }

      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: isWholeOrder ? OrderStatus.CANCELLED : order.status,
          changedById: user.id,
          reason: isWholeOrder
            ? 'Accounts approved cancellation of the whole order'
            : `Accounts approved cancellation of ${targetItems.length} item(s): ${targetItems.map((i) => i.product.name).join(', ')}`,
        },
      });

      return updated;
    });
  }

  async rejectCancellation(orderId: string, reason: string, user: AccountsUser) {
    assertAccountsUser(user);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!(order as any).cancellationRequestedAt) {
      throw new BadRequestException('This order has no pending cancellation request');
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: ({
        cancellationRequestedAt: null,
        cancellationRequestedByName: null,
        cancellationReason: null,
        pendingCancelItemIds: [],
      } as any),
    });
    await this.prisma.statusLog.create({
      data: {
        orderId,
        fromStatus: order.status,
        toStatus: order.status,
        changedById: user.id,
        reason: `Accounts rejected cancellation request: ${reason || 'no reason given'}`,
      },
    });
    return updated;
  }

  // ── Return order to accounts (back to PENDING_APPROVAL) ──────────────────
  async returnToAccounts(orderId: string, reason: string, user: AccountsUser) {
    assertAccountsUser(user);
    const RETURNABLE: OrderStatus[] = [
      OrderStatus.APPROVED,
      OrderStatus.IN_PRODUCTION,
    ];
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!RETURNABLE.includes(order.status)) {
      throw new BadRequestException(
        `Only APPROVED or IN_PRODUCTION orders can be returned to accounts (current status: ${order.status})`,
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PENDING_APPROVAL },
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.PENDING_APPROVAL,
          changedById: user.id,
          reason: reason || 'Returned to accounts for re-approval',
        },
      });
      return updated;
    });
  }

  // ── Approve dispatch → WhatsApp "Ready for Dispatch 📦" ──────────────────
  async approveDispatch(orderId: string, user: AccountsUser) {
    assertAccountsUser(user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        salesAgent: { select: { fullName: true } },
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING_DISPATCH_APPROVAL) {
      throw new NotFoundException('Order is not pending dispatch approval');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const approved = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.READY_FOR_DISPATCH },
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: OrderStatus.PENDING_DISPATCH_APPROVAL,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
          changedById: user.id,
          reason: 'Accounts approved dispatch',
        },
      });
      return approved;
    });

    // Fire-and-forget WhatsApp
    void this.whatsapp.sendOrderUpdate({
      customerName:  order.customer.businessName,
      customerPhone: order.customer.phone ?? '',
      orderNo:       order.orderNumber,
      product:       order.items.map(i => i.product.name).join(', '),
      status:        WhatsAppService.statusLabel(OrderStatus.READY_FOR_DISPATCH),
      agentName:     order.salesAgent?.fullName ?? 'Rareprint Team',
    });

    return updated;
  }

  async rejectDispatch(orderId: string, reason: string, userId?: string) {
    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to reject this dispatch');
    }
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { salesAgent: { select: { id: true, fullName: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    // This must only ever apply to a fresh dispatch submission still
    // awaiting approval — calling it on an order that's already past this
    // stage would incorrectly reset an approved order back to APPROVED.
    if (order.status !== OrderStatus.PENDING_DISPATCH_APPROVAL) {
      throw new BadRequestException(`Only PENDING_DISPATCH_APPROVAL orders can be rejected (current status: ${order.status})`);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.APPROVED,
          // Free up the rejected items so they can be resubmitted. Approving
          // deliberately leaves pendingDispatchItemIds populated (that's
          // what correctly keeps an approved order out of the agent's
          // resubmission list in orders.service.ts's getOrdersWithReadyItems
          // — see the big comment there) — but rejection is the opposite:
          // the whole point is to let the agent fix something and resubmit,
          // so the lock must be cleared here specifically.
          ...({ pendingDispatchItemIds: [] } as any),
        },
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: order.status,
          toStatus: OrderStatus.APPROVED,
          // Was the literal string 'system' before -- StatusLog.changedById
          // has an FK to User, and there's no User row with id 'system', so
          // every single call to this endpoint failed with a P2003 foreign
          // key violation. Now uses the real logged-in user's id (threaded
          // through from the controller), falling back to null (the column
          // is nullable) if it's ever missing.
          changedById: userId ?? null,
          reason: `Dispatch rejected: ${reason.trim()}`,
        },
      });
      return result;
    });

    if (order.salesAgent?.id) {
      try {
        await this.notifications.notifyDispatchRejected({
          agentId: order.salesAgent.id,
          agentName: order.salesAgent.fullName,
          orderId: order.id,
          orderNo: order.orderNumber,
          reason: reason.trim(),
        });
      } catch (e) {
        // Non-blocking: the rejection itself already succeeded above.
      }
    }

    return updated;
  }

  async getVendorStatements() {
    const jobWorks = await this.prisma.jobWork.findMany({
      include: {
        vendor: true,
        orderItem: {
          include: {
            product: true,
            order: { include: { customer: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const sheetStages = await this.prisma.sheetStageVendor.findMany({
      include: {
        vendor: true,
        sheet: {
          include: {
            items: {
              include: {
                orderItem: {
                  include: {
                    product: true,
                    order: { include: { customer: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const jwEntries = jobWorks.map(jw => ({
      id: jw.id,
      type: 'JOBWORK' as const,
      vendorId: jw.vendorId,
      vendorName: jw.vendor.name,
      description: jw.description,
      cost: Number(jw.cost),
      vendorInvoiceNo: jw.vendorInvoiceNo,
      isPaid: jw.isPaid,
      paidAt: jw.paidAt,
      createdAt: jw.createdAt,
      status: jw.status,
      productName: jw.orderItem.product.name,
      productSku: jw.orderItem.product.sku,
      quantity: jw.orderItem.quantity,
      orderNo: (jw.orderItem.order as any).orderNumber,
      customerName: (jw.orderItem.order as any).customer.businessName,
      productionNotes: jw.orderItem.productionNotes,
    }));

    const ssEntries = sheetStages.map(ss => ({
      id: ss.id,
      type: 'SHEET_STAGE' as const,
      vendorId: ss.vendorId,
      vendorName: ss.vendor.name,
      description: ss.description,
      cost: Number(ss.cost),
      vendorInvoiceNo: ss.vendorInvoiceNo,
      isPaid: ss.isPaid,
      paidAt: ss.paidAt,
      createdAt: ss.createdAt,
      status: null,
      stage: ss.stage,
      sheetNo: ss.sheet.sheetNo,
      sheetGsm: ss.sheet.gsm,
      sheetSize: ss.sheet.sizeInches,
      products: ss.sheet.items.map(si => ({
        productName: si.orderItem.product.name,
        orderNo: (si.orderItem.order as any).orderNumber,
        customerName: (si.orderItem.order as any).customer.businessName,
        quantity: si.quantityOnSheet,
      })),
    }));

    return [...jwEntries, ...ssEntries].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  async markJobWorkPaid(id: string) {
    return this.prisma.jobWork.update({
      where: { id },
      data: { isPaid: true, paidAt: new Date() },
    });
  }

  async markSheetStagePaid(id: string) {
    return this.prisma.sheetStageVendor.update({
      where: { id },
      data: { isPaid: true, paidAt: new Date() },
    });
  }


  async getPendingPayments() {
    const payments = await this.prisma.payment.findMany({
      where: { verificationStatus: 'PENDING_VERIFICATION' },
      include: {
        order: { include: { customer: true, salesAgent: { select: { fullName: true } } } },
        paymentAccount: true,
        receivedBy: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map(p => ({
      id: p.id,
      orderId: p.orderId,
      orderNo: (p.order as any).orderNumber,
      customerName: (p.order as any).customer.businessName,
      customerPhone: (p.order as any).customer.phone,
      salesAgentName: (p.order as any).salesAgent?.fullName ?? null,
      amount: Number(p.amount),
      method: p.method,
      referenceNumber: p.referenceNumber,
      notes: p.notes,
      paymentDate: p.paymentDate,
      paymentAccountId: p.paymentAccountId,
      paymentAccountName: p.paymentAccount.name,
      receivedByName: p.receivedBy?.fullName ?? null,
      verificationStatus: p.verificationStatus,
      createdAt: p.createdAt,
    }));
  }

  async getPaymentAccounts() {
    return this.prisma.paymentAccount.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        bankName: true,
        accountType: true,
        upiId: true,
      },
    });
  }

  async getAccountingSummary() {
    const [invoices, purchaseBills, notes, ledger] = await Promise.all([
      this.prisma.invoice.findMany({
        // order.isTest excludes dummy QA orders (see Orders > Test Order)
        // from every accounting total — they must never touch real GST,
        // receivable, or sales figures.
        where: { status: 'ISSUED', order: { isTest: false } },
        select: { totalAmount: true, paidAmount: true, balanceAmount: true, taxAmount: true },
      }),
      this.prisma.purchaseBill.findMany({
        where: { status: { not: PurchaseBillStatus.CANCELLED } },
        select: { totalAmount: true, paidAmount: true, balanceAmount: true, taxAmount: true },
      }),
      this.prisma.accountingNote.findMany({
        where: { status: 'ISSUED' },
        select: { noteType: true, totalAmount: true, taxAmount: true },
      }),
      this.prisma.accountingLedgerEntry.findMany({
        // Test-order ledger postings (e.g. "Invoice ... raised to TEST
        // CUSTOMER (DELETE ME)") were still showing up in this recent-activity
        // feed even though every OTHER accounting total here already excludes
        // isTest — entries with no linked order (purchase bills, manual notes,
        // etc.) are kept as-is via the orderId: null branch.
        where: { OR: [{ orderId: null }, { order: { isTest: false } }] },
        orderBy: { entryDate: 'desc' },
        take: 50,
      }),
    ]);

    const sum = (rows: { [key: string]: unknown }[], key: string) =>
      rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);

    return {
      sales: {
        invoiceCount: invoices.length,
        total: sum(invoices, 'totalAmount'),
        paid: sum(invoices, 'paidAmount'),
        receivable: sum(invoices, 'balanceAmount'),
        outputGst: sum(invoices, 'taxAmount'),
      },
      purchases: {
        billCount: purchaseBills.length,
        total: sum(purchaseBills, 'totalAmount'),
        paid: sum(purchaseBills, 'paidAmount'),
        payable: sum(purchaseBills, 'balanceAmount'),
        inputGst: sum(purchaseBills, 'taxAmount'),
      },
      notes: {
        creditNotes: notes.filter(n => n.noteType === AccountingNoteType.CREDIT_NOTE).length,
        debitNotes: notes.filter(n => n.noteType === AccountingNoteType.DEBIT_NOTE).length,
        creditAmount: sum(notes.filter(n => n.noteType === AccountingNoteType.CREDIT_NOTE), 'totalAmount'),
        debitAmount: sum(notes.filter(n => n.noteType === AccountingNoteType.DEBIT_NOTE), 'totalAmount'),
      },
      gst: {
        netPayableEstimate: sum(invoices, 'taxAmount') - sum(purchaseBills, 'taxAmount'),
      },
      recentLedger: ledger.map(row => ({
        ...row,
        debitAmount: Number(row.debitAmount),
        creditAmount: Number(row.creditAmount),
      })),
    };
  }

  async getInvoices() {
    const invoices = await this.prisma.invoice.findMany({
      // Keep test-order invoices out of the accountant-facing Invoices list —
      // they still exist in the DB (so the invoice-generation flow itself is
      // testable) but must never show up here or count toward any total.
      where: { order: { isTest: false } },
      include: {
        order: { include: { customer: true, salesAgent: { select: { fullName: true } } } },
        items: true,
      },
      orderBy: { issueDate: 'desc' },
      take: 200,
    });
    return invoices.map(inv => ({
      id: inv.id,
      customerId: inv.order.customer.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      customerName: inv.order.customer.businessName,
      customerPhone: inv.order.customer.phone,
      gstNumber: inv.order.customer.gstNumber,
      gstTreatment: inv.gstTreatment,
      subtotal: Number(inv.subtotal),
      taxableAmount: Number(inv.taxableAmount),
      cgstAmount: Number(inv.cgstAmount),
      sgstAmount: Number(inv.sgstAmount),
      igstAmount: Number(inv.igstAmount),
      taxAmount: Number(inv.taxAmount),
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      balanceAmount: Number(inv.balanceAmount),
      status: inv.status,
      whatsappStatus: inv.whatsappStatus,
      whatsappSentAt: inv.whatsappSentAt,
      salesAgentName: inv.order.salesAgent?.fullName ?? null,
      items: inv.items.map(item => ({
        productName: item.productName,
        sku: item.sku,
        hsnSac: item.hsnSac,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        gstRatePct: Number(item.gstRatePct),
        lineTotal: Number(item.lineTotal),
      })),
    }));
  }

  async getPurchaseBills() {
    const bills = await this.prisma.purchaseBill.findMany({
      include: { vendor: true, payments: true },
      orderBy: { billDate: 'desc' },
      take: 200,
    });
    return bills.map(bill => ({
      id: bill.id,
      vendorId: bill.vendorId,
      vendorName: bill.vendor.name,
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      dueDate: bill.dueDate,
      subtotal: Number(bill.subtotal),
      taxableAmount: Number(bill.taxableAmount),
      cgstAmount: Number(bill.cgstAmount),
      sgstAmount: Number(bill.sgstAmount),
      igstAmount: Number(bill.igstAmount),
      taxAmount: Number(bill.taxAmount),
      totalAmount: Number(bill.totalAmount),
      paidAmount: Number(bill.paidAmount),
      balanceAmount: Number(bill.balanceAmount),
      gstTreatment: bill.gstTreatment,
      status: bill.status,
      notes: bill.notes,
      paymentCount: bill.payments.length,
    }));
  }

  async createPurchaseBill(user: AccountsUser, data: CreatePurchaseBillDto) {
    assertAccountsUser(user);
    const subtotal = this.money(data.subtotal);
    const taxableAmount = this.money(data.taxableAmount ?? subtotal);
    const gstTreatment = data.gstTreatment ?? GstTreatment.INTRA_STATE;
    const gst = this.splitGst(taxableAmount, Number(data.gstRatePct ?? 0), gstTreatment);
    const totalAmount = this.money(taxableAmount + gst.taxAmount);

    return this.prisma.$transaction(async (tx) => {
      const bill = await tx.purchaseBill.create({
        data: {
          vendorId: data.vendorId,
          billNumber: data.billNumber.trim(),
          billDate: this.parseDate(data.billDate) ?? new Date(),
          dueDate: this.parseDate(data.dueDate),
          subtotal,
          taxableAmount,
          cgstAmount: gst.cgstAmount,
          sgstAmount: gst.sgstAmount,
          igstAmount: gst.igstAmount,
          taxAmount: gst.taxAmount,
          totalAmount,
          balanceAmount: totalAmount,
          gstTreatment,
          notes: data.notes?.trim() || null,
        },
      });
      await tx.accountingLedgerEntry.createMany({
        data: [
          {
            entryType: LedgerEntryType.PURCHASE,
            accountName: 'Purchases / Job Work',
            debitAmount: taxableAmount,
            creditAmount: 0,
            narration: `Purchase bill ${bill.billNumber}`,
            referenceType: 'PURCHASE_BILL',
            referenceId: bill.id,
            vendorId: bill.vendorId,
            purchaseBillId: bill.id,
          },
          ...(gst.taxAmount > 0 ? [{
            entryType: LedgerEntryType.GST,
            accountName: 'Input GST',
            debitAmount: gst.taxAmount,
            creditAmount: 0,
            narration: `Input GST for purchase bill ${bill.billNumber}`,
            referenceType: 'PURCHASE_BILL',
            referenceId: bill.id,
            vendorId: bill.vendorId,
            purchaseBillId: bill.id,
          }] : []),
          {
            entryType: LedgerEntryType.PURCHASE,
            accountName: 'Vendor Payable',
            debitAmount: 0,
            creditAmount: totalAmount,
            narration: `Payable booked for purchase bill ${bill.billNumber}`,
            referenceType: 'PURCHASE_BILL',
            referenceId: bill.id,
            vendorId: bill.vendorId,
            purchaseBillId: bill.id,
          },
        ],
      });
      return bill;
    });
  }

  async createVendorPayment(user: AccountsUser, data: CreateVendorPaymentDto) {
    assertAccountsUser(user);
    const amount = this.money(data.amount);
    if (amount <= 0) throw new BadRequestException('Payment amount must be greater than zero');

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.vendorPayment.create({
        data: {
          vendorId: data.vendorId,
          purchaseBillId: data.purchaseBillId || null,
          paymentAccountId: data.paymentAccountId,
          amount,
          method: data.method,
          referenceNumber: data.referenceNumber?.trim() || null,
          notes: data.notes?.trim() || null,
          paymentDate: this.parseDate(data.paymentDate) ?? new Date(),
        },
        include: { paymentAccount: true },
      });

      if (data.purchaseBillId) {
        const payments = await tx.vendorPayment.findMany({ where: { purchaseBillId: data.purchaseBillId } });
        const paidAmount = this.money(payments.reduce((sum, p) => sum + Number(p.amount), 0));
        const bill = await tx.purchaseBill.findUnique({ where: { id: data.purchaseBillId } });
        if (bill) {
          const balance = this.money(Number(bill.totalAmount) - paidAmount);
          await tx.purchaseBill.update({
            where: { id: bill.id },
            data: {
              paidAmount,
              balanceAmount: balance,
              status: balance <= 0 ? PurchaseBillStatus.PAID : PurchaseBillStatus.PARTIALLY_PAID,
            },
          });
        }
      }

      await tx.accountingLedgerEntry.createMany({
        data: [
          {
            entryType: LedgerEntryType.PAYMENT_OUT,
            accountName: 'Vendor Payable',
            debitAmount: amount,
            creditAmount: 0,
            narration: `Vendor payment to ${data.vendorId}`,
            referenceType: 'VENDOR_PAYMENT',
            referenceId: payment.id,
            vendorId: data.vendorId,
            purchaseBillId: data.purchaseBillId || null,
          },
          {
            entryType: LedgerEntryType.PAYMENT_OUT,
            accountName: payment.paymentAccount.name,
            debitAmount: 0,
            creditAmount: amount,
            narration: 'Vendor payment from bank/cash',
            referenceType: 'VENDOR_PAYMENT',
            referenceId: payment.id,
            vendorId: data.vendorId,
            purchaseBillId: data.purchaseBillId || null,
          },
        ],
      });
      return payment;
    });
  }

  async getAccountingNotes() {
    const notes = await this.prisma.accountingNote.findMany({
      include: { customer: true, vendor: true, invoice: true, purchaseBill: true },
      orderBy: { noteDate: 'desc' },
      take: 200,
    });
    return notes.map(note => ({
      id: note.id,
      noteNumber: note.noteNumber,
      noteType: note.noteType,
      partyType: note.partyType,
      partyName: note.customer?.businessName ?? note.vendor?.name ?? 'Unknown',
      referenceNumber: note.invoice?.invoiceNumber ?? note.purchaseBill?.billNumber ?? null,
      noteDate: note.noteDate,
      reason: note.reason,
      taxableAmount: Number(note.taxableAmount),
      taxAmount: Number(note.taxAmount),
      totalAmount: Number(note.totalAmount),
      status: note.status,
    }));
  }

  async createAccountingNote(user: AccountsUser, data: CreateAccountingNoteDto) {
    assertAccountsUser(user);
    if (data.partyType === AccountingPartyType.CUSTOMER && !data.customerId) {
      throw new BadRequestException('Customer is required for customer note');
    }
    if (data.partyType === AccountingPartyType.VENDOR && !data.vendorId) {
      throw new BadRequestException('Vendor is required for vendor note');
    }
    const taxableAmount = this.money(data.taxableAmount);
    const gstTreatment = data.gstTreatment ?? GstTreatment.INTRA_STATE;
    const gst = this.splitGst(taxableAmount, Number(data.gstRatePct ?? 0), gstTreatment);
    const totalAmount = this.money(taxableAmount + gst.taxAmount);
    const prefix = data.noteType === AccountingNoteType.CREDIT_NOTE ? 'CN' : 'DN';
    const noteNumber = `${prefix}-${Date.now()}`;

    return this.prisma.$transaction(async (tx) => {
      const note = await tx.accountingNote.create({
        data: {
          noteNumber,
          noteType: data.noteType,
          partyType: data.partyType,
          customerId: data.customerId || null,
          vendorId: data.vendorId || null,
          invoiceId: data.invoiceId || null,
          purchaseBillId: data.purchaseBillId || null,
          noteDate: this.parseDate(data.noteDate) ?? new Date(),
          reason: data.reason.trim(),
          taxableAmount,
          cgstAmount: gst.cgstAmount,
          sgstAmount: gst.sgstAmount,
          igstAmount: gst.igstAmount,
          taxAmount: gst.taxAmount,
          totalAmount,
        },
      });

      const entryType = data.noteType === AccountingNoteType.CREDIT_NOTE
        ? LedgerEntryType.CREDIT_NOTE
        : LedgerEntryType.DEBIT_NOTE;
      const partyAccount = data.partyType === AccountingPartyType.CUSTOMER
        ? 'Customer Receivable'
        : 'Vendor Payable';
      const isCreditForCustomer = data.noteType === AccountingNoteType.CREDIT_NOTE && data.partyType === AccountingPartyType.CUSTOMER;
      await tx.accountingLedgerEntry.createMany({
        data: [
          {
            entryType,
            accountName: partyAccount,
            debitAmount: isCreditForCustomer ? 0 : totalAmount,
            creditAmount: isCreditForCustomer ? totalAmount : 0,
            narration: `${data.noteType.replace('_', ' ')} ${noteNumber}: ${data.reason}`,
            referenceType: 'ACCOUNTING_NOTE',
            referenceId: note.id,
            customerId: data.customerId || null,
            vendorId: data.vendorId || null,
            invoiceId: data.invoiceId || null,
            purchaseBillId: data.purchaseBillId || null,
          },
          {
            entryType,
            accountName: data.noteType === AccountingNoteType.CREDIT_NOTE ? 'Sales Return / Adjustment' : 'Debit Note Income / Adjustment',
            debitAmount: isCreditForCustomer ? totalAmount : 0,
            creditAmount: isCreditForCustomer ? 0 : totalAmount,
            narration: `${data.noteType.replace('_', ' ')} ${noteNumber}`,
            referenceType: 'ACCOUNTING_NOTE',
            referenceId: note.id,
            customerId: data.customerId || null,
            vendorId: data.vendorId || null,
            invoiceId: data.invoiceId || null,
            purchaseBillId: data.purchaseBillId || null,
          },
        ],
      });

      if (data.invoiceId) {
        const invoice = await tx.invoice.findUnique({ where: { id: data.invoiceId } });
        if (invoice) {
          const currentBalance = Number(invoice.balanceAmount);
          const nextBalance = data.noteType === AccountingNoteType.CREDIT_NOTE
            ? Math.max(0, this.money(currentBalance - totalAmount))
            : this.money(currentBalance + totalAmount);
          await tx.invoice.update({
            where: { id: invoice.id },
            data: { balanceAmount: nextBalance },
          });
        }
      }

      if (data.purchaseBillId) {
        const bill = await tx.purchaseBill.findUnique({ where: { id: data.purchaseBillId } });
        if (bill) {
          const currentBalance = Number(bill.balanceAmount);
          const nextBalance = data.noteType === AccountingNoteType.CREDIT_NOTE
            ? this.money(currentBalance + totalAmount)
            : Math.max(0, this.money(currentBalance - totalAmount));
          await tx.purchaseBill.update({
            where: { id: bill.id },
            data: {
              balanceAmount: nextBalance,
              status: nextBalance <= 0 ? PurchaseBillStatus.PAID : bill.status,
            },
          });
        }
      }
      return note;
    });
  }

  async getCustomerOutstanding() {
    const rows = await this.prisma.$queryRaw<any[]>`
      WITH order_paid AS (
        SELECT
          p."orderId",
          COALESCE(SUM(p.amount), 0) AS "paidAmount"
        FROM "Payment" p
        WHERE p."verificationStatus" = 'VERIFIED'
        GROUP BY p."orderId"
      ),
      order_balances AS (
        SELECT
          o.id,
          o."orderNumber",
          o."customerId",
          o."salesAgentId",
          o."orderDate",
          o.status,
          o."grandTotal",
          COALESCE(op."paidAmount", 0) AS "paidAmount",
          GREATEST(o."grandTotal" - COALESCE(op."paidAmount", 0), 0) AS "balanceAmount"
        FROM "Order" o
        LEFT JOIN order_paid op ON op."orderId" = o.id
        WHERE o.status NOT IN ('DRAFT', 'CANCELLED') AND COALESCE(o."isTest", false) = false
      ),
      order_item_statuses AS (
        SELECT
          oi."orderId",
          STRING_AGG(DISTINCT oi."itemProductionStage"::text, ', ' ORDER BY oi."itemProductionStage"::text) AS "productStatuses"
        FROM "OrderItem" oi
        GROUP BY oi."orderId"
      )
      SELECT
        c.id AS "customerId",
        c."businessName" AS "customerName",
        c.phone AS "customerPhone",
        c.email AS "customerEmail",
        SUM(ob."grandTotal") AS "totalAmount",
        SUM(ob."paidAmount") AS "paidAmount",
        SUM(ob."balanceAmount") AS "outstandingAmount",
        COUNT(*)::int AS "orderCount",
        MAX(ob."orderDate") AS "lastOrderDate",
        STRING_AGG(ob."orderNumber", ', ' ORDER BY ob."orderDate" DESC) AS "orderNumbers",
        STRING_AGG(DISTINCT ob.status::text, ', ' ORDER BY ob.status::text) AS "orderStatuses",
        STRING_AGG(ob."orderNumber", ', ' ORDER BY ob."orderDate" DESC)
          FILTER (WHERE ob.status IN ('READY_FOR_DISPATCH', 'DELIVERED') AND ob."balanceAmount" > 0) AS "reminderOrderNumbers",
        COALESCE(
          SUM(ob."balanceAmount")
            FILTER (WHERE ob.status IN ('READY_FOR_DISPATCH', 'DELIVERED') AND ob."balanceAmount" > 0),
          0
        ) AS "reminderAmount",
        STRING_AGG(DISTINCT ois."productStatuses", ', ') AS "productStatuses",
        STRING_AGG(DISTINCT u."fullName", ', ' ORDER BY u."fullName") AS "sellerNames"
      FROM order_balances ob
      JOIN "Customer" c ON c.id = ob."customerId"
      LEFT JOIN order_item_statuses ois ON ois."orderId" = ob.id
      LEFT JOIN "User" u ON u.id = ob."salesAgentId"
      GROUP BY c.id, c."businessName", c.phone, c.email
      HAVING SUM(ob."balanceAmount") > 0
      ORDER BY SUM(ob."balanceAmount") DESC, c."businessName" ASC
    `;

    return rows.map(row => ({
      ...row,
      totalAmount: Number(row.totalAmount),
      paidAmount: Number(row.paidAmount),
      outstandingAmount: Number(row.outstandingAmount),
      reminderAmount: Number(row.reminderAmount),
      canSendReminder: Number(row.reminderAmount) > 0 && Boolean(row.customerPhone),
      productStatuses: Array.from(new Set(String(row.productStatuses ?? '').split(', ').filter(Boolean))).join(', '),
      orderStatuses: Array.from(new Set(String(row.orderStatuses ?? '').split(', ').filter(Boolean))).join(', '),
      reminderOrderNumbers: row.reminderOrderNumbers ?? '',
      sellerNames: Array.from(new Set(String(row.sellerNames ?? '').split(', ').filter(Boolean))).join(', '),
    }));
  }

  async getOutstandingOrderShipments() {
    // Returns shipment/courier info for all orders that still have an outstanding balance
    const rows = await this.prisma.$queryRaw<any[]>`
      SELECT
        o.id AS "orderId",
        o."orderNumber" AS "orderNo",
        o."customerId",
        s.id AS "shipmentId",
        s."awbNumber",
        s."carrierName" AS "courierPlatform",
        s."lrNumber" AS "courierOrderId",
        s."dispatchType",
        s."trackingNumber",
        s.notes AS "shipmentNotes",
        s."createdAt" AS "shipmentCreatedAt"
      FROM "Order" o
      LEFT JOIN "Shipment" s ON s."orderId" = o.id
      WHERE o.status NOT IN ('DRAFT', 'CANCELLED')
        AND (
          o."grandTotal" - COALESCE((
            SELECT SUM(p.amount) FROM "Payment" p
            WHERE p."orderId" = o.id AND p."verificationStatus" = 'VERIFIED'
          ), 0)
        ) > 0
      ORDER BY o."orderDate" DESC
    `;
    return rows.map(row => ({
      orderId: row.orderId,
      orderNo: row.orderNo,
      customerId: row.customerId,
      shipmentId: row.shipmentId ?? null,
      awbNumber: row.awbNumber ?? null,
      courierPlatform: row.courierPlatform ?? null,
      courierOrderId: row.courierOrderId ?? null,
      dispatchType: row.dispatchType ?? null,
      trackingNumber: row.trackingNumber ?? null,
      shipmentNotes: row.shipmentNotes ?? null,
      shipmentCreatedAt: row.shipmentCreatedAt ?? null,
      isCourierBooked: !!(row.awbNumber || row.trackingNumber),
    }));
  }

  async markOrderAsCod(orderId: string, data: {
    awbNumber?: string;
    courierPlatform: string;
    courierOrderId?: string;
  }) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');

    // Check if a COD_MANUAL shipment already exists for this order
    const existingManualShipment = await this.prisma.shipment.findFirst({
      where: { orderId, dispatchType: 'COD_MANUAL' },
    });

    if (existingManualShipment) {
      // Update existing
      return this.prisma.shipment.update({
        where: { id: existingManualShipment.id },
        data: {
          awbNumber: data.awbNumber ?? null,
          carrierName: data.courierPlatform,
          lrNumber: data.courierOrderId ?? null,
        },
      });
    }

    // Create new COD manual shipment record
    const shipmentNumber = `COD-${order.orderNumber}-${Date.now()}`;
    return this.prisma.shipment.create({
      data: {
        orderId,
        shipmentNumber,
        dispatchType: 'COD_MANUAL',
        carrierName: data.courierPlatform,
        awbNumber: data.awbNumber ?? null,
        lrNumber: data.courierOrderId ?? null,
        notes: `Manual COD booking. Platform: ${data.courierPlatform}${data.courierOrderId ? `, Order ID: ${data.courierOrderId}` : ''}${data.awbNumber ? `, AWB: ${data.awbNumber}` : ''}`,
      },
    });
  }

  async sendBalanceReminder(customerId: string, user: AccountsUser) {
    assertAccountsUser(user);
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        orders: {
          where: { status: { in: [OrderStatus.READY_FOR_DISPATCH, OrderStatus.DELIVERED] }, isTest: false },
          include: {
            salesAgent: { select: { fullName: true } },
            payments: { where: { verificationStatus: 'VERIFIED' } },
          },
          orderBy: { orderDate: 'desc' },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!customer.phone) throw new BadRequestException('Customer has no phone number');

    const eligibleOrders = customer.orders
      .map(order => {
        const paid = order.payments.reduce((sum, p) => sum + Number(p.amount), 0);
        const balance = Math.max(0, Number(order.grandTotal) - paid);
        return { order, balance };
      })
      .filter(({ balance }) => balance > 0);

    if (eligibleOrders.length === 0) {
      throw new BadRequestException('No Ready or Delivered order has balance due for this customer');
    }

    const balanceAmount = eligibleOrders.reduce((sum, row) => sum + row.balance, 0);
    const orderNos = eligibleOrders.map(row => row.order.orderNumber).join(', ');
    const agentName = eligibleOrders[0]?.order.salesAgent?.fullName ?? 'Rareprint Team';
    const sent = await this.whatsapp.sendBalancePaymentReminder({
      customerName: customer.businessName,
      customerPhone: customer.phone,
      orderNos,
      balanceAmount,
      agentName,
    });

    if (!sent) throw new BadRequestException('Could not send WhatsApp reminder');
    return { success: true, orderNos, balanceAmount };
  }

  async updatePendingPayment(id: string, user: AccountsUser, data: UpdatePendingPaymentDto) {
    assertAccountsUser(user);
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment receipt not found');
    if (payment.verificationStatus !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Only pending receipts can be edited');
    }

    const updateData: Record<string, unknown> = {};
    if (data.amount !== undefined) {
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new BadRequestException('Payment amount must be greater than zero');
      }
      updateData.amount = amount;
    }

    if (data.method !== undefined) {
      if (!Object.values(PaymentMethod).includes(data.method)) {
        throw new BadRequestException('Invalid payment method');
      }
      updateData.method = data.method;
    }

    if (data.paymentAccountId !== undefined) {
      const account = await this.prisma.paymentAccount.findFirst({
        where: { id: data.paymentAccountId, isActive: true },
      });
      if (!account) throw new BadRequestException('Select an active payment account');
      updateData.paymentAccountId = data.paymentAccountId;
    }

    if (data.paymentDate !== undefined) {
      const paymentDate = new Date(data.paymentDate);
      if (Number.isNaN(paymentDate.getTime())) {
        throw new BadRequestException('Invalid payment date');
      }
      updateData.paymentDate = paymentDate;
    }

    if (data.referenceNumber !== undefined) {
      updateData.referenceNumber = data.referenceNumber?.trim() || null;
    }
    if (data.notes !== undefined) {
      updateData.notes = data.notes?.trim() || null;
    }

    return this.prisma.payment.update({
      where: { id },
      data: updateData,
      include: { paymentAccount: true },
    });
  }

  async verifyPayment(id: string, verifiedById: string, referenceNumber?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        order: {
          include: {
            customer: true,
            payments: { where: { verificationStatus: 'VERIFIED' } },
          },
        },
        paymentAccount: true,
      },
    });
    if (!payment) throw new NotFoundException('Payment receipt not found');
    if (payment.verificationStatus !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Only pending receipts can be verified');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const verified = await tx.payment.update({
        where: { id },
        data: {
          verificationStatus: 'VERIFIED',
          verifiedById,
          verifiedAt: new Date(),
          ...(referenceNumber !== undefined ? { referenceNumber: referenceNumber.trim() || null } : {}),
        },
      });

      const verifiedPayments = await tx.payment.findMany({
        where: { orderId: payment.orderId, verificationStatus: 'VERIFIED' },
      });
      const totalPaid = this.money(verifiedPayments.reduce((sum, p) => sum + Number(p.amount), 0));
      const grandTotal = this.money((payment.order as any).grandTotal);
      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          paymentStatus:
            totalPaid >= grandTotal ? PaymentStatus.PAID :
            totalPaid > 0 ? PaymentStatus.PARTIALLY_PAID :
            PaymentStatus.PENDING,
        },
      });

      const invoice = await tx.invoice.findUnique({ where: { orderId: payment.orderId } });
      if (invoice) {
        await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: totalPaid,
            balanceAmount: this.money(Number(invoice.totalAmount) - totalPaid),
          },
        });
        await tx.accountingLedgerEntry.createMany({
          data: [
            {
              entryType: LedgerEntryType.PAYMENT_IN,
              accountName: payment.paymentAccount.name,
              debitAmount: payment.amount,
              creditAmount: 0,
              narration: `Payment received for invoice ${invoice.invoiceNumber}`,
              referenceType: 'PAYMENT',
              referenceId: payment.id,
              customerId: (payment.order as any).customerId,
              orderId: payment.orderId,
              invoiceId: invoice.id,
            },
            {
              entryType: LedgerEntryType.PAYMENT_IN,
              accountName: 'Customer Receivable',
              debitAmount: 0,
              creditAmount: payment.amount,
              narration: `Receivable adjusted for invoice ${invoice.invoiceNumber}`,
              referenceType: 'PAYMENT',
              referenceId: payment.id,
              customerId: (payment.order as any).customerId,
              orderId: payment.orderId,
              invoiceId: invoice.id,
            },
          ],
        });
      }

      return verified;
    });

    return updated;
  }

  async rejectPayment(id: string, verifiedById: string, reason: string) {
    return this.prisma.payment.update({
      where: { id },
      data: {
        verificationStatus: 'REJECTED',
        verifiedById,
        verifiedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }

  async deletePayment(id: string, user: AccountsUser) {
    assertAccountsUser(user);
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundException('Payment receipt not found');

    await this.prisma.payment.delete({ where: { id } });
    await this.refreshOrderPaymentStatus(payment.orderId);
    return { success: true, orderId: payment.orderId };
  }

  async getPaymentHistory() {
  const payments = await this.prisma.$queryRaw<any[]>`
    SELECT 
      p.id, p."orderId", p.amount, p.method, p."referenceNumber",
      p."paymentDate", p."verificationStatus", p."verifiedAt", p."rejectionReason",
      o."orderNumber" as "orderNo",
      c."businessName" as "customerName",
      c.phone as "customerPhone",
      sa."fullName" as "salesAgentName",
      pa.name as "paymentAccountName",
      vb."fullName" as "verifiedByName"
    FROM "Payment" p
    JOIN "Order" o ON p."orderId" = o.id
    JOIN "Customer" c ON o."customerId" = c.id
    LEFT JOIN "User" sa ON o."salesAgentId" = sa.id
    JOIN "PaymentAccount" pa ON p."paymentAccountId" = pa.id
    LEFT JOIN "User" vb ON p."verifiedById" = vb.id
    WHERE p."verificationStatus" IN ('VERIFIED', 'REJECTED')
    ORDER BY p."verifiedAt" DESC
  `;
  return payments.map(p => ({
    ...p,
    amount: Number(p.amount),
  }));
  }

  // ── Sample Kit Methods ────────────────────────────────────────────────────

  async getSampleOrders() {
    const orders = await (this.prisma.order as any).findMany({
      where: {
        isSample: true,
        status: { in: [OrderStatus.PENDING_APPROVAL, OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION, OrderStatus.READY_FOR_DISPATCH, OrderStatus.DISPATCHED] },
      },
      include: {
        customer: { select: { businessName: true, phone: true, billingAddress: true, city: true, state: true, pincode: true } },
        salesAgent: { select: { fullName: true } },
        items: { include: { product: { select: { name: true, sku: true } } } },
        payments: { select: { amount: true, verificationStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
    }) as any[];

    return orders.map((o: any) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      samplePaymentType: o.samplePaymentType ?? null,
      paymentStatus: o.paymentStatus,
      grandTotal: Number(o.grandTotal),
      createdAt: o.createdAt,
      notes: o.notes ?? null,
      customer: {
        businessName: o.customer?.businessName,
        phone: o.customer?.phone,
        address: o.customer?.billingAddress,
        city: o.customer?.city,
        state: o.customer?.state,
        pincode: o.customer?.pincode,
      },
      salesAgentName: o.salesAgent?.fullName ?? null,
      itemCount: o.items.length,
      items: o.items.map((i: any) => ({ productName: i.product.name, sku: i.product.sku, quantity: i.quantity })),
      totalPaid: (o.payments as any[])
        .filter((p) => p.verificationStatus === 'VERIFIED')
        .reduce((sum, p) => sum + Number(p.amount), 0),
    }));
  }

  async approveSampleOrder(orderId: string, paymentReceived: boolean, user: AccountsUser) {
    assertAccountsUser(user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, salesAgent: { select: { fullName: true } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!(order as any).isSample) throw new BadRequestException('Order is not a sample order');
    if (order.status !== OrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only orders in PENDING_APPROVAL status can be approved');
    }

    const paymentType = paymentReceived ? 'PREPAID' : 'COD';

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.READY_FOR_DISPATCH,
          productionStage: 'READY_FOR_DISPATCH',
          samplePaymentType: paymentType,
        } as any,
      });
      await tx.orderItem.updateMany({
        where: { orderId },
        data: { itemProductionStage: 'READY_FOR_DISPATCH' } as any,
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: OrderStatus.PENDING_APPROVAL,
          toStatus: OrderStatus.READY_FOR_DISPATCH,
          changedById: user.id,
          reason: `Accounts approved sample kit — dispatching as ${paymentType}`,
        },
      });
      return result;
    });

    return { ...updated, samplePaymentType: paymentType };
  }

  async rejectSampleOrder(orderId: string, reason: string, userId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Only PENDING_APPROVAL sample orders can be rejected');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.CANCELLED },
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: OrderStatus.PENDING_APPROVAL,
          toStatus: OrderStatus.CANCELLED,
          // Same bug as rejectDispatch above: 'system' isn't a real User.id
          // and changedById has an FK to User, so this always failed with a
          // P2003 violation. Uses the real logged-in user now.
          changedById: userId ?? null,
          reason: reason || 'Sample order rejected by accounts',
        },
      });
      return updated;
    });
  }

  async dispatchSampleOrder(orderId: string, trackingNumber: string | undefined, user: AccountsUser) {
    assertAccountsUser(user);
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (!(order as any).isSample) throw new BadRequestException('Not a sample order');
    if (order.status !== OrderStatus.READY_FOR_DISPATCH) {
      throw new BadRequestException('Order must be in READY_FOR_DISPATCH status to dispatch');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.DISPATCHED, notes: trackingNumber ? `Tracking: ${trackingNumber}` : order.notes } as any,
      });
      await tx.statusLog.create({
        data: {
          orderId,
          fromStatus: OrderStatus.READY_FOR_DISPATCH,
          toStatus: OrderStatus.DISPATCHED,
          changedById: user.id,
          reason: trackingNumber ? `Sample kit dispatched — tracking: ${trackingNumber}` : 'Sample kit dispatched',
        },
      });
      return updated;
    });
  }

  // ── Payment Verification (Accounts > Bank Statement debit sign-off) ────────
  // Every matched/needs-review DEBIT bank entry needs a two-step sign-off:
  // an accountant/admin clicks "Checked" (one-way, they can't undo it), then
  // only Sanket (super-admin) sees a "Rechecked" action, which moves the
  // entry out of the queue and into Accounts > Payment History. The FKs live
  // on BankTransaction — see migration 20260723140000_add_payment_verification_workflow.

  private readonly paymentVerificationStatuses: BankReconcileStatus[] = [
    BankReconcileStatus.MATCHED_PAYMENT,
    BankReconcileStatus.MATCHED_VENDOR,
    BankReconcileStatus.MATCHED_EXPENSE,
    BankReconcileStatus.MATCHED_COMMISSION,
    BankReconcileStatus.MANUAL_REVIEW,
  ];

  private readonly paymentVerificationInclude = {
    matchedPayment: {
      select: {
        id: true,
        amount: true,
        referenceNumber: true,
        order: { select: { orderNumber: true, customer: { select: { businessName: true } } } },
      },
    },
    matchedVendor: { select: { id: true, name: true } },
    expenseCategory: { select: { id: true, name: true } },
    matchedCommissionVerification: {
      select: { year: true, month: true, agent: { select: { fullName: true } } },
    },
    checkedBy: { select: { id: true, fullName: true } },
    recheckedBy: { select: { id: true, fullName: true } },
  } as const;

  private readonly monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  private mapPaymentVerificationEntry(t: any) {
    let vendorOrExpenseName: string | null = null;
    if (t.matchedVendor) vendorOrExpenseName = t.matchedVendor.name;
    else if (t.expenseCategory) vendorOrExpenseName = t.expenseCategory.name;
    else if (t.matchedCommissionVerification) {
      vendorOrExpenseName = `Commission — ${t.matchedCommissionVerification.agent.fullName}`;
    } else if (t.matchedPayment?.order?.customer?.businessName) {
      vendorOrExpenseName = `${t.matchedPayment.order.customer.businessName} (${t.matchedPayment.order.orderNumber})`;
    }
    // The accountant's free-text label (typed directly in the Payment
    // Verification queue) always wins over the auto-matched name.
    if (t.vendorExpenseOverride) vendorOrExpenseName = t.vendorExpenseOverride;

    const commissionInfo = t.matchedCommissionVerification
      ? {
          agentName: t.matchedCommissionVerification.agent.fullName,
          month: this.monthNames[t.matchedCommissionVerification.month - 1] ?? String(t.matchedCommissionVerification.month),
          year: t.matchedCommissionVerification.year,
          label: `Commission & Salary — ${this.monthNames[t.matchedCommissionVerification.month - 1]} ${t.matchedCommissionVerification.year}`,
        }
      : null;

    const expensePeriod: Date | null = t.expensePeriod ?? null;

    return {
      id: t.id,
      txnDate: t.txnDate,
      description: t.description,
      amount: Number(t.amount),
      balance: Number(t.balance),
      crDr: t.crDr,
      reconcileStatus: t.reconcileStatus,
      vendorOrExpenseName,
      commissionInfo,
      accountantNote: t.accountantNote,
      expensePeriod: expensePeriod ? expensePeriod.toISOString() : null,
      expensePeriodLabel: expensePeriod
        ? `${this.monthNames[expensePeriod.getUTCMonth()]} ${expensePeriod.getUTCFullYear()}`
        : null,
      checkedById: t.checkedById,
      checkedByName: t.checkedBy?.fullName ?? null,
      checkedAt: t.checkedAt,
      recheckedById: t.recheckedById,
      recheckedByName: t.recheckedBy?.fullName ?? null,
      recheckedAt: t.recheckedAt,
    };
  }

  /** GET /accounts/payment-verification — the active queue (not yet rechecked), latest entry first. */
  async getPaymentVerificationQueue() {
    const txns = await this.prisma.bankTransaction.findMany({
      where: {
        crDr: 'DR',
        reconcileStatus: { in: this.paymentVerificationStatuses },
        recheckedAt: null,
      },
      orderBy: [{ txnDate: 'desc' }, { srl: 'desc' }, { createdAt: 'desc' }],
      include: this.paymentVerificationInclude,
    });
    return txns.map((t) => this.mapPaymentVerificationEntry(t));
  }

  /** GET /accounts/payment-verification-history — entries Sanket has rechecked, most recently rechecked first. */
  async getPaymentVerificationHistory(filters?: { vendorId?: string; expenseCategoryId?: string }) {
    const where: any = {
      crDr: 'DR',
      reconcileStatus: { in: this.paymentVerificationStatuses },
      recheckedAt: { not: null },
    };
    if (filters?.vendorId) where.matchedVendorId = filters.vendorId;
    if (filters?.expenseCategoryId) where.expenseCategoryId = filters.expenseCategoryId;

    const txns = await this.prisma.bankTransaction.findMany({
      where,
      orderBy: [{ recheckedAt: 'desc' }],
      include: this.paymentVerificationInclude,
    });
    return txns.map((t) => this.mapPaymentVerificationEntry(t));
  }

  async updatePaymentVerificationNote(id: string, user: AccountsUser, note: string) {
    assertAccountsUser(user);
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException('Bank transaction not found');
    if ((txn as any).recheckedAt) {
      throw new BadRequestException('This entry has moved to Payment History and can no longer be edited');
    }
    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data: { accountantNote: note } as any,
      include: this.paymentVerificationInclude,
    });
    return this.mapPaymentVerificationEntry(updated);
  }

  async updatePaymentVerificationVendorExpense(id: string, user: AccountsUser, label: string) {
    assertAccountsUser(user);
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException('Bank transaction not found');
    if ((txn as any).checkedAt) {
      throw new BadRequestException('This entry has already been checked and can no longer be edited');
    }
    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data: { vendorExpenseOverride: label || null } as any,
      include: this.paymentVerificationInclude,
    });
    return this.mapPaymentVerificationEntry(updated);
  }

  async updatePaymentVerificationExpenseMonth(id: string, user: AccountsUser, period: string | null) {
    assertAccountsUser(user);
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException('Bank transaction not found');
    if ((txn as any).checkedAt) {
      throw new BadRequestException('This entry has already been checked and can no longer be edited');
    }
    let expensePeriod: Date | null = null;
    if (period) {
      const match = /^(\d{4})-(\d{2})$/.exec(period);
      if (!match) throw new BadRequestException('Expected month in YYYY-MM format');
      expensePeriod = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
    }
    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data: { expensePeriod } as any,
      include: this.paymentVerificationInclude,
    });
    return this.mapPaymentVerificationEntry(updated);
  }

  async checkPaymentVerification(id: string, user: AccountsUser) {
    assertAccountsUser(user);
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException('Bank transaction not found');
    if ((txn as any).checkedAt) {
      throw new BadRequestException('This entry has already been checked');
    }
    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data: { checkedById: user.id, checkedAt: new Date() } as any,
      include: this.paymentVerificationInclude,
    });
    return this.mapPaymentVerificationEntry(updated);
  }

  /** Undo a "Checked" mark — reopens the entry's Vendor/Expense, Expense Month and Note fields for editing. */
  async uncheckPaymentVerification(id: string, user: AccountsUser) {
    assertAccountsUser(user);
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException('Bank transaction not found');
    if ((txn as any).recheckedAt) {
      throw new BadRequestException('This entry has already been verified and moved to Payment History — it can no longer be unchecked');
    }
    if (!(txn as any).checkedAt) {
      throw new BadRequestException('This entry has not been checked yet');
    }
    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data: { checkedById: null, checkedAt: null } as any,
      include: this.paymentVerificationInclude,
    });
    return this.mapPaymentVerificationEntry(updated);
  }

  async recheckPaymentVerification(id: string, user: AccountsUser) {
    if (user.email !== SUPER_ADMIN_EMAIL) {
      throw new ForbiddenException('Only Sanket can verify and move this entry to Payment History');
    }
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id } });
    if (!txn) throw new NotFoundException('Bank transaction not found');
    if ((txn as any).recheckedAt) {
      throw new BadRequestException('This entry has already been verified');
    }
    // Sanket does Check + Verify in a single click: if nobody has checked
    // this entry yet, stamp him as both the checker and the verifier at
    // once instead of forcing a separate "Checked" click first. If someone
    // else already checked it, that original checkedBy/checkedAt is left
    // untouched — only recheckedBy/recheckedAt get set here.
    const now = new Date();
    const data: any = { recheckedById: user.id, recheckedAt: now };
    if (!(txn as any).checkedAt) {
      data.checkedById = user.id;
      data.checkedAt = now;
    }
    const updated = await this.prisma.bankTransaction.update({
      where: { id },
      data,
      include: this.paymentVerificationInclude,
    });
    return this.mapPaymentVerificationEntry(updated);
  }

  // ── Expense Tracker (Accounts > Expense Tracker) ──────────────────────────
  // Accrual view: what expense BELONGS to a given calendar month, split into
  // Paid vs Balance, regardless of when it was actually paid — e.g. June
  // salary that doesn't get paid out until July is still June's expense.
  // Combines three sources that already exist elsewhere in the app:
  //   • Vendor/Expense — the same Payment Verification entries as the
  //     Accounts > Payment Verification tab, bucketed by expensePeriod (the
  //     accountant's "which month does this belong to" override) falling
  //     back to the transaction date when no override was set. "Paid" =
  //     Sanket has verified it (recheckedAt set, i.e. moved to Payment
  //     History); "Balance" = still sitting in the queue.
  //   • Salary — HrService.salarySummary is the live accrued figure (there
  //     is no other persisted "salary paid" record anywhere in the app).
  //     "Paid" comes from BankTransaction rows tagged salaryForUserId /
  //     salaryYear / salaryMonth via markSalaryPaid below — the only place
  //     a salary payment is ever actually recorded.
  //   • Commission — CostTableService.getAllAgentsCommissionSummary is the
  //     accrued figure (agent.bonus for the selected month); "paid" is
  //     whichever agents already have this month in their existing
  //     paidMonths (the pre-existing Commission "Mark as Paid" flow).
  //
  // Sanket's own salary is a special case per his instruction: he has no
  // fixed monthly figure at all, so there's no "accrued vs paid" split for
  // him — his row is pure cash-basis, literally whatever bank withdrawals
  // get tagged to him for that month, no more and no less.
  //
  // Known caveat: if a sales agent's salary+commission is paid out to them
  // as a single combined bank transfer (already tagged MATCHED_COMMISSION
  // in Payment Verification, labelled "Commission & Salary" there), their
  // Salary row here will still show as unpaid/balance unless that same
  // transaction (or another one) is also separately tagged via
  // markSalaryPaid. This tracker does not attempt to infer that a
  // commission payout also covered salary.
  async getExpenseTracker(year: number, month: number) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    // Commission payouts are already their own bucket below (accrued from
    // CostTableService, not from the transaction amount) — excluding
    // MATCHED_COMMISSION here avoids double-counting the same expense once
    // as "Vendor/Expense" and again as "Commission".
    const vendorExpenseStatuses = this.paymentVerificationStatuses.filter((s) => s !== BankReconcileStatus.MATCHED_COMMISSION);

    const [vendorTxns, salarySummary, commissionSummary, salaryTaggedTxns, employees] = await Promise.all([
      this.prisma.bankTransaction.findMany({
        where: {
          crDr: 'DR',
          reconcileStatus: { in: vendorExpenseStatuses },
          OR: [
            { expensePeriod: { gte: monthStart, lt: monthEnd } },
            { expensePeriod: null, txnDate: { gte: monthStart, lt: monthEnd } },
          ],
        },
        orderBy: [{ txnDate: 'desc' }],
        include: this.paymentVerificationInclude,
      }),
      this.hr.salarySummary(year, month).catch(() => ({ totalSalary: 0, employees: [] as any[] })),
      this.costTable.getAllAgentsCommissionSummary(year, month).catch(() => ({ agents: [] as any[] })),
      (this.prisma.bankTransaction as any).findMany({
        where: { salaryYear: year, salaryMonth: month, salaryForUserId: { not: null } },
        include: { salaryForUser: { select: { id: true, fullName: true, email: true } } },
        orderBy: { txnDate: 'asc' },
      }),
      this.prisma.employee.findMany({ select: { id: true, userId: true } }),
    ]);
    const sanketUser = await this.prisma.user.findUnique({ where: { email: SUPER_ADMIN_EMAIL }, select: { id: true } });

    // ── Vendor / Expense ─────────────────────────────────────────────────
    const vendorEntries = vendorTxns.map((t) => this.mapPaymentVerificationEntry(t));
    const vendorAccrued = vendorEntries.reduce((s, e) => s + e.amount, 0);
    const vendorPaid = vendorEntries.filter((e) => e.recheckedAt).reduce((s, e) => s + e.amount, 0);

    // ── Salary — split Sanket's tagged withdrawals out from regular staff ──
    const sanketTagged = (salaryTaggedTxns as any[]).filter((t) => t.salaryForUser?.email === SUPER_ADMIN_EMAIL);
    const staffTagged = (salaryTaggedTxns as any[]).filter((t) => t.salaryForUser?.email !== SUPER_ADMIN_EMAIL);

    const paidByUserId = new Map<string, number>();
    for (const t of staffTagged) {
      const uid = t.salaryForUserId as string;
      paidByUserId.set(uid, (paidByUserId.get(uid) ?? 0) + Number(t.amount));
    }
    const employeeIdToUserId = new Map(employees.map((e) => [e.id, e.userId]));

    const salaryByEmployee = (salarySummary as any).employees.map((row: any) => {
      const userId = employeeIdToUserId.get(row.employeeId) ?? null;
      const paid = userId ? Math.min(row.salary, paidByUserId.get(userId) ?? 0) : 0;
      return {
        employeeId: row.employeeId,
        fullName: row.fullName,
        designation: row.designation,
        userId,
        accrued: row.salary,
        paid,
        balance: Math.max(0, row.salary - paid),
        taggable: !!userId,
      };
    });
    const staffSalaryAccrued = salaryByEmployee.reduce((s: number, r: any) => s + r.accrued, 0);
    const staffSalaryPaid = salaryByEmployee.reduce((s: number, r: any) => s + r.paid, 0);

    const sanketAmount = sanketTagged.reduce((s, t) => s + Number(t.amount), 0);
    const sanketTransactions = sanketTagged.map((t) => ({
      id: t.id, txnDate: t.txnDate, description: t.description, amount: Number(t.amount),
    }));

    const salaryAccrued = staffSalaryAccrued + sanketAmount;
    const salaryPaid = staffSalaryPaid + sanketAmount;

    // ── Commission ───────────────────────────────────────────────────────
    const commissionAgents = (commissionSummary as any).agents.map((a: any) => ({
      id: a.id,
      name: a.name,
      accrued: a.bonus,
      paid: a.paidMonths.includes(monthKey) ? a.bonus : 0,
    }));
    const commissionAccrued = commissionAgents.reduce((s: number, a: any) => s + a.accrued, 0);
    const commissionPaid = commissionAgents.reduce((s: number, a: any) => s + a.paid, 0);

    const totalAccrued = vendorAccrued + salaryAccrued + commissionAccrued;
    const totalPaid = vendorPaid + salaryPaid + commissionPaid;

    return {
      year, month,
      vendorExpense: { accrued: vendorAccrued, paid: vendorPaid, balance: vendorAccrued - vendorPaid, entries: vendorEntries },
      salary: {
        accrued: salaryAccrued, paid: salaryPaid, balance: salaryAccrued - salaryPaid,
        byEmployee: salaryByEmployee,
        sanket: { userId: sanketUser?.id ?? null, amount: sanketAmount, transactions: sanketTransactions },
      },
      commission: { accrued: commissionAccrued, paid: commissionPaid, balance: commissionAccrued - commissionPaid, byAgent: commissionAgents },
      total: { accrued: totalAccrued, paid: totalPaid, balance: totalAccrued - totalPaid },
    };
  }

  /** Tag one bank transaction as the (or a) salary payment for `userId` for `year`/`month`. */
  async markSalaryPaid(userId: string, year: number, month: number, transactionId: string, reconciledById: string) {
    const txn = await this.prisma.bankTransaction.findUnique({ where: { id: transactionId } });
    if (!txn) throw new NotFoundException('Bank transaction not found');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
    if (!user) throw new NotFoundException('User not found');
    await (this.prisma.bankTransaction as any).update({
      where: { id: transactionId },
      data: {
        reconcileStatus: 'MATCHED_SALARY',
        salaryForUserId: userId,
        salaryYear: year,
        salaryMonth: month,
        matchedVendorId: null,
        expenseCategoryId: null,
        matchedCommissionVerificationId: null,
        reviewNote: `Salary payout — ${user.fullName}, ${month}/${year}`,
        reconciledById,
        reconciledAt: new Date(),
      },
    });
    return { success: true };
  }

  /** Untag a specific transaction previously marked as a salary payment. */
  async unmarkSalaryPaid(transactionId: string) {
    const txn = await (this.prisma.bankTransaction as any).findUnique({ where: { id: transactionId } });
    if (!txn || !txn.salaryForUserId) return { success: true };
    await (this.prisma.bankTransaction as any).update({
      where: { id: transactionId },
      data: {
        reconcileStatus: 'UNMATCHED',
        salaryForUserId: null,
        salaryYear: null,
        salaryMonth: null,
        reviewNote: null,
        reconciledById: null,
        reconciledAt: null,
      },
    });
    return { success: true };
  }
}
