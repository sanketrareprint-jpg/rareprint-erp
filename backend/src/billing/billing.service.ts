// backend/src/billing/billing.service.ts
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { buildInvoicePdf, InvoicePdfCompanyProfile, InvoicePdfData } from './invoice-pdf';
import { courierGstSplit, COURIER_SAC } from '../common/sync-invoice-courier-charge';
import { LIVE_PURCHASE_BILL_WHERE, ON_ACCOUNT_VENDOR_PAYMENT_WHERE, PAYABLE_VENDOR_NOTE_WHERE } from '../common/vendor-payable';
import { buildReceiptVoucherPdf } from './receipt-pdf';
import { registerInvoiceFonts } from './pdf-fonts';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { extractSizeFromNote } from '../common/resolve-item-details';
import { sanitizePhone } from '../orders/orders.service';
import { GSTIN_FORMAT } from '../orders/dto/create-order.dto';
import { OrderStatus } from '@prisma/client';

// Same SUPER_ADMIN_EMAIL convention as accounts.service.ts / dashboard.service.ts.
const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';
// Fits the two-line remark row on the Cancelled Invoice PDF.
const CANCELLATION_REMARK_MAX_LENGTH = 250;

// ── SystemConfig keys for Company Profile ───────────────────────────────────
// Same "individual key per setting" convention as loyalty.service.ts's CFG
// map — findMany + fallback, no JSON blobs, so any single field can be
// tuned via the settings screen without touching the rest.
const CFG = {
  COMPANY_NAME: 'billing.companyName',
  COMPANY_ADDRESS: 'billing.companyAddress',
  COMPANY_PHONE: 'billing.companyPhone',
  COMPANY_EMAIL: 'billing.companyEmail',
  COMPANY_GSTIN: 'billing.companyGstin',
  COMPANY_STATE: 'billing.companyState',
  BANK_NAME: 'billing.bankName',
  BANK_ACCOUNT_NUMBER: 'billing.bankAccountNumber',
  BANK_IFSC: 'billing.bankIfsc',
  BANK_ACCOUNT_HOLDER_NAME: 'billing.bankAccountHolderName',
  DEFAULT_TERMS: 'billing.defaultTermsAndConditions',
  LOGO_URL: 'billing.logoUrl',
  SIGNATURE_URL: 'billing.signatureUrl',
  INVOICE_PREFIX: 'billing.invoicePrefix',
};

// Deliberately blank, not guessed — the real registered company address is
// still unconfirmed (sample invoice vs. Google listing disagree on pincode,
// see Billing_Module_Build_Prompt.md §8). Leaving these blank means the PDF
// clearly shows "not set" instead of printing a possibly-wrong address.
const DEFAULTS: Record<string, string> = {
  [CFG.COMPANY_NAME]: '',
  [CFG.COMPANY_ADDRESS]: '',
  [CFG.COMPANY_PHONE]: '',
  [CFG.COMPANY_EMAIL]: '',
  [CFG.COMPANY_GSTIN]: '',
  [CFG.COMPANY_STATE]: 'Maharashtra', // confirmed single-state, 2026-08-17
  [CFG.BANK_NAME]: '',
  [CFG.BANK_ACCOUNT_NUMBER]: '',
  [CFG.BANK_IFSC]: '',
  [CFG.BANK_ACCOUNT_HOLDER_NAME]: '',
  [CFG.DEFAULT_TERMS]: '',
  [CFG.LOGO_URL]: '',
  [CFG.SIGNATURE_URL]: '',
  [CFG.INVOICE_PREFIX]: '',
};

// Receipt voucher "Received In" column: the customer sees the bank account
// (bank name + last 4 digits), never the internal account name (e.g. "GST
// BANK", or a staff member's name on a cash account) — requested 2026-09-26.
function receiptAccountLabel(account: { name: string; accountType: string | null; accountNumber: string | null; bankName: string | null } | null): string | null {
  if (!account) return null;
  const digits = (account.accountNumber ?? '').replace(/\D/g, '');
  if (digits) return `${account.bankName ? `${account.bankName} ` : ''}A/c XX${digits.slice(-4)}`;
  if (account.accountType === 'CASH') return 'Cash';
  if (account.accountType === 'COURIER_COD') return 'Courier COD';
  return account.name;
}

// Printed "Payment Mode" labels for the PaymentMethod enum (receipt voucher).
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank Transfer',
  UPI: 'UPI',
  CHEQUE: 'Cheque',
  CARD: 'Card',
};

export interface CompanyProfile {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyGstin: string;
  companyState: string;
  bankName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  bankAccountHolderName: string;
  defaultTermsAndConditions: string;
  logoUrl: string | null;
  signatureUrl: string | null;
  invoicePrefix: string;
}

// Invoice.cancelledSnapshot — written by AccountsService.approveCancellation
// just before a whole-order cancellation zeroes the invoice.
interface CancelledInvoiceSnapshot {
  subtotal: number;
  totalAmount: number;
  items: {
    productName: string;
    sku: string | null;
    hsnSac: string | null;
    productionNotes: string | null;
    quantity: number;
    unitPrice: number;
    taxableAmount: number;
    gstRatePct: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    lineTotal: number;
  }[];
}

// Invoice PDFs number in Indian financial years (1 Apr – 31 Mar), judged in
// IST so an invoice raised just after midnight on 1 April isn't put in the
// previous year by the server's UTC clock.
const IST_OFFSET_MS = 330 * 60 * 1000;
const FINANCIAL_YEAR_START_MONTH = 3; // April, 0-based

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService,
  ) {}

  // ── Company Profile (SystemConfig-backed) ───────────────────────────────
  async getCompanyProfile(): Promise<CompanyProfile> {
    const rows = await (this.prisma as any).systemConfig.findMany({
      where: { key: { in: Object.values(CFG) } },
    });
    const map = Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
    const get = (key: string) => map[key] ?? DEFAULTS[key] ?? '';
    return {
      companyName: get(CFG.COMPANY_NAME),
      companyAddress: get(CFG.COMPANY_ADDRESS),
      companyPhone: get(CFG.COMPANY_PHONE),
      companyEmail: get(CFG.COMPANY_EMAIL),
      companyGstin: get(CFG.COMPANY_GSTIN),
      companyState: get(CFG.COMPANY_STATE),
      bankName: get(CFG.BANK_NAME),
      bankAccountNumber: get(CFG.BANK_ACCOUNT_NUMBER),
      bankIfsc: get(CFG.BANK_IFSC),
      bankAccountHolderName: get(CFG.BANK_ACCOUNT_HOLDER_NAME),
      defaultTermsAndConditions: get(CFG.DEFAULT_TERMS),
      logoUrl: get(CFG.LOGO_URL) || null,
      signatureUrl: get(CFG.SIGNATURE_URL) || null,
      invoicePrefix: get(CFG.INVOICE_PREFIX),
    };
  }

  async updateCompanyProfile(dto: UpdateCompanyProfileDto): Promise<CompanyProfile> {
    const fieldToKey: Record<string, string> = {
      companyName: CFG.COMPANY_NAME,
      companyAddress: CFG.COMPANY_ADDRESS,
      companyPhone: CFG.COMPANY_PHONE,
      companyEmail: CFG.COMPANY_EMAIL,
      companyGstin: CFG.COMPANY_GSTIN,
      companyState: CFG.COMPANY_STATE,
      bankName: CFG.BANK_NAME,
      bankAccountNumber: CFG.BANK_ACCOUNT_NUMBER,
      bankIfsc: CFG.BANK_IFSC,
      bankAccountHolderName: CFG.BANK_ACCOUNT_HOLDER_NAME,
      defaultTermsAndConditions: CFG.DEFAULT_TERMS,
      invoicePrefix: CFG.INVOICE_PREFIX,
    };

    const pairs: [string, string][] = [];
    for (const [field, key] of Object.entries(fieldToKey)) {
      const value = (dto as any)[field];
      if (value !== undefined) pairs.push([key, String(value)]);
    }

    await Promise.all(
      pairs.map(([key, value]) =>
        (this.prisma as any).systemConfig.upsert({
          where: { key },
          create: { key, value },
          update: { value },
        }),
      ),
    );
    return this.getCompanyProfile();
  }

  private async setImageConfig(key: string, dataUrl: string) {
    await (this.prisma as any).systemConfig.upsert({
      where: { key },
      create: { key, value: dataUrl },
      update: { value: dataUrl },
    });
  }

  async updateLogo(file: Express.Multer.File): Promise<CompanyProfile> {
    if (!file) throw new BadRequestException('No file uploaded');
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    await this.setImageConfig(CFG.LOGO_URL, dataUrl);
    return this.getCompanyProfile();
  }

  async updateSignature(file: Express.Multer.File): Promise<CompanyProfile> {
    if (!file) throw new BadRequestException('No file uploaded');
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    await this.setImageConfig(CFG.SIGNATURE_URL, dataUrl);
    return this.getCompanyProfile();
  }

  // ── Invoices ─────────────────────────────────────────────────────────────
  // Same base shape/exclusions as AccountsService.getInvoices() (test orders
  // excluded, same field set) — this module reuses that data, doesn't
  // duplicate its business rules.
  async listInvoices(filters: { from?: string; to?: string; customerId?: string; status?: string; search?: string; gstType?: string; all?: boolean }) {
    const where: any = { order: { isTest: false } };
    if (filters.from || filters.to) {
      where.issueDate = {};
      if (filters.from) where.issueDate.gte = new Date(filters.from);
      if (filters.to) where.issueDate.lte = new Date(filters.to);
    }
    if (filters.customerId) where.order = { ...where.order, customerId: filters.customerId };
    if (filters.status) where.status = filters.status;
    // GST registration of the party: registered = customer has a GSTIN
    // (the invoice PDF prints the customer's GSTIN), unregistered = none.
    if (filters.gstType === 'registered') {
      where.order = { ...where.order, customer: { AND: [{ gstNumber: { not: null } }, { gstNumber: { not: '' } }] } };
    } else if (filters.gstType === 'unregistered') {
      where.order = { ...where.order, customer: { OR: [{ gstNumber: null }, { gstNumber: '' }] } };
    }

    // search moved into the Prisma `where` (was: fetch the latest 500 by
    // issueDate, THEN filter those 500 in JS by search term) — root-caused
    // 2026-09-04: that order meant a search for an older invoice/customer/
    // phone that fell outside the 500 most-recent invoices could never
    // match, even though it exists in the database. Filtering in the query
    // itself means the 500 cap applies to the already-matched rows instead.
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { order: { customer: { businessName: { contains: search, mode: 'insensitive' } } } },
        { order: { customer: { phone: { contains: search } } } },
      ];
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        order: { include: { customer: true, salesAgent: { select: { fullName: true } } } },
        items: true,
      },
      orderBy: { issueDate: 'desc' },
      // all=true is the Excel report export: every invoice matching the
      // filters, not just the latest 500 shown on screen.
      take: filters.all ? undefined : 500,
    });

    const rows = invoices.map((inv) => ({
      id: inv.id,
      orderId: inv.orderId,
      customerId: inv.order.customer.id,
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      customerName: inv.order.customer.businessName,
      customerPhone: inv.order.customer.phone,
      gstNumber: inv.order.customer.gstNumber,
      customerCity: inv.order.customer.city,
      customerState: inv.order.customer.state,
      gstTreatment: inv.gstTreatment,
      subtotal: Number(inv.subtotal),
      discountAmount: Number(inv.discountAmount),
      taxableAmount: Number(inv.taxableAmount),
      cgstAmount: Number(inv.cgstAmount),
      sgstAmount: Number(inv.sgstAmount),
      igstAmount: Number(inv.igstAmount),
      taxAmount: Number(inv.taxAmount),
      totalAmount: Number(inv.totalAmount),
      paidAmount: Number(inv.paidAmount),
      balanceAmount: Number(inv.balanceAmount),
      status: inv.status,
      // Whole order cancelled — order.status also covers invoices cancelled
      // before Invoice.status was set on cancellation (2026-10-06).
      cancelled: inv.status === 'CANCELLED' || inv.order.status === 'CANCELLED',
      cancellationReason: (inv as any).cancellationReason ?? null,
      whatsappStatus: inv.whatsappStatus,
      whatsappSentAt: inv.whatsappSentAt,
      salesAgentName: inv.order.salesAgent?.fullName ?? null,
    }));

    return rows;
  }

  private async loadInvoiceForPdf(invoiceId: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        order: { include: { customer: true, salesAgent: { select: { fullName: true } } } },
        items: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  // "RP/2026-27/1723" — Company Profile prefix / financial year of the issue
  // date / stored number. Printed on the invoice PDF only: Invoice.invoiceNumber
  // stays the plain order number, which search, receipts (RV-<number>) and
  // bank matching key on. No prefix configured → the plain number, as before.
  private displayInvoiceNumber(prefix: string, issueDate: Date, invoiceNumber: string): string {
    const trimmedPrefix = prefix.trim();
    if (!trimmedPrefix) return invoiceNumber;
    const ist = new Date(new Date(issueDate).getTime() + IST_OFFSET_MS);
    const startYear = ist.getUTCMonth() >= FINANCIAL_YEAR_START_MONTH ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
    const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
    return `${trimmedPrefix}/${startYear}-${endYearShort}/${invoiceNumber}`;
  }

  private formatDate(d: Date): string {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  async generateInvoicePdf(invoiceId: string, termsOverride?: string, agentNameOverride?: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.loadInvoiceForPdf(invoiceId);
    const company = await this.getCompanyProfile();

    // Previous/Current Balance — reuses getPartyLedger()'s running-balance
    // calc (single source of truth, see CLAUDE.md §17) rather than a second
    // formula. currentBalance is this invoice's cumulative running balance;
    // previousBalance is that minus this invoice's own balance.
    const ledger = await this.getPartyLedger(invoice.order.customerId);
    const ledgerEntry = ledger.entries.find((e) => e.invoiceId === invoice.id);
    const currentBalance = ledgerEntry ? ledgerEntry.runningBalance : Number(invoice.balanceAmount);
    const previousBalance = currentBalance - Number(invoice.balanceAmount);

    const customer = invoice.order.customer;
    const customerAddress = [customer.billingAddress, customer.city, customer.state, customer.pincode]
      .map((v) => (v ?? '').toString().trim())
      .filter(Boolean)
      .join(', ');

    // A cancelled invoice (whole order cancelled) prints as a Cancelled
    // Invoice. Its live rows were zeroed by the cancellation, so the PDF
    // shows the items/totals snapshotted just before that (AccountsService.
    // approveCancellation) — invoices cancelled before the snapshot existed
    // have none and print their (empty) live rows. order.status covers those
    // older cancellations, whose Invoice.status was never set.
    const isCancelled = invoice.status === 'CANCELLED' || invoice.order.status === 'CANCELLED';
    const cancelledSnapshot = isCancelled ? ((invoice as any).cancelledSnapshot as CancelledInvoiceSnapshot | null) : null;
    const billedItems = cancelledSnapshot?.items ?? invoice.items;

    // Invoices raised before Product.hsnCode existed have hsnSac = null on
    // every item; show the product's current HSN (matched by the snapshotted
    // SKU) on the PDF without rewriting the stored invoice rows.
    const skusWithoutHsn = billedItems.filter((i) => !i.hsnSac && i.sku).map((i) => i.sku as string);
    const productHsnBySku = new Map<string, string | null>(
      skusWithoutHsn.length
        ? (await this.prisma.product.findMany({ where: { sku: { in: skusWithoutHsn } }, select: { sku: true, hsnCode: true } }))
            .map((p) => [p.sku, p.hsnCode])
        : [],
    );

    const pdfData: InvoicePdfData = {
      invoiceNumber: this.displayInvoiceNumber(company.invoicePrefix, invoice.issueDate, invoice.invoiceNumber),
      issueDate: this.formatDate(invoice.issueDate),
      gstTreatment: invoice.gstTreatment as any,
      subtotal: Number(cancelledSnapshot?.subtotal ?? invoice.subtotal),
      totalAmount: Number(cancelledSnapshot?.totalAmount ?? invoice.totalAmount),
      paidAmount: Number(invoice.paidAmount),
      balanceAmount: Number(invoice.balanceAmount),
      previousBalance,
      currentBalance,
      agentName: agentNameOverride ?? invoice.order.salesAgent?.fullName ?? '',
      termsAndConditions: termsOverride ?? company.defaultTermsAndConditions,
      customerName: customer.businessName,
      customerAddress,
      customerPhone: customer.phone ?? '',
      customerState: customer.state ?? '',
      customerGstin: customer.gstNumber ?? '',
      cancelled: isCancelled,
      cancellationReason: isCancelled ? ((invoice as any).cancellationReason ?? null) : null,
      items: billedItems.map((item) => ({
        productName: item.productName,
        hsnSac: item.hsnSac || (item.sku ? productHsnBySku.get(item.sku) ?? null : null),
        productDetails: item.productionNotes ?? null,
        size: extractSizeFromNote(item.productionNotes),
        quantity: item.quantity,
        unit: 'PCS', // no per-item unit field in schema today; matches how these products are counted elsewhere
        unitPrice: Number(item.unitPrice),
        gstRatePct: Number(item.gstRatePct),
        cgstAmount: Number(item.cgstAmount),
        sgstAmount: Number(item.sgstAmount),
        igstAmount: Number(item.igstAmount),
        taxableAmount: Number(item.taxableAmount),
        lineTotal: Number(item.lineTotal),
      })),
      company: company as InvoicePdfCompanyProfile,
    };

    // Courier charge taken from the customer, billed on the invoice
    // (Invoice.courierCharge — already included in totalAmount, incl. 18% GST).
    // Shown as its own row so the customer sees what the extra amount is for;
    // Sub Total includes it like the order lines.
    const courierCharge = Number(invoice.courierCharge ?? 0);
    if (courierCharge > 0) {
      const courierGst = courierGstSplit(courierCharge, invoice.gstTreatment);
      pdfData.items.push({
        productName: 'Courier Charges',
        hsnSac: COURIER_SAC,
        productDetails: null,
        size: null,
        quantity: 1,
        unit: 'NOS',
        unitPrice: courierCharge,
        gstRatePct: courierGst.gstRatePct,
        cgstAmount: courierGst.cgstAmount,
        sgstAmount: courierGst.sgstAmount,
        igstAmount: courierGst.igstAmount,
        taxableAmount: courierGst.taxableAmount,
        lineTotal: courierCharge,
      });
      pdfData.subtotal = Number(cancelledSnapshot?.subtotal ?? invoice.subtotal) + courierCharge;
    }

    const buffer = await buildInvoicePdf(pdfData);
    return { buffer, filename: `Invoice_${invoice.invoiceNumber}.pdf` };
  }

  // ── Receipt Vouchers ────────────────────────────────────────────────────
  // One receipt voucher per invoiced order, listing every VERIFIED payment
  // (₹0 rows skipped — e.g. a COD payment whose whole amount was courier
  // freight after the 2026-09-24 freight correction)
  // against it. Read-only view over existing Payment rows — nothing is
  // stored, so the voucher always reflects exactly what Accounts has
  // verified. Received/balance are summed from those same verified Payment
  // rows (same rule AccountsService.verifyPayment uses to set
  // Invoice.paidAmount) so the voucher's lines and its totals can never
  // disagree. Voucher number = "RV-" + invoice number (which is itself the
  // order number, see Billing_Module_Spec.md §4.3) — no new sequence.
  // Same paise rounding as AccountsService.money() — avoids float artifacts
  // (e.g. a "-0.00" balance) when summing Decimal payment amounts as numbers.
  private toPaise(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private receiptNumberFor(invoiceNumber: string): string {
    return `RV-${invoiceNumber}`;
  }

  async listReceiptVouchers(filters: { search?: string }) {
    const where: any = {
      order: { isTest: false, payments: { some: { verificationStatus: 'VERIFIED', amount: { gt: 0 } } } },
    };
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { order: { customer: { businessName: { contains: search, mode: 'insensitive' } } } },
        { order: { customer: { phone: { contains: search } } } },
      ];
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: {
        order: {
          include: {
            customer: true,
            payments: { where: { verificationStatus: 'VERIFIED', amount: { gt: 0 } }, orderBy: { paymentDate: 'asc' } },
          },
        },
      },
      orderBy: { issueDate: 'desc' },
      take: 500,
    });

    return invoices.map((inv) => {
      const payments = inv.order.payments;
      const receivedAmount = this.toPaise(payments.reduce((sum, p) => sum + Number(p.amount), 0));
      const invoiceAmount = Number(inv.totalAmount);
      return {
        orderId: inv.orderId,
        invoiceId: inv.id,
        receiptNumber: this.receiptNumberFor(inv.invoiceNumber),
        receiptDate: payments[payments.length - 1].paymentDate,
        invoiceNumber: inv.invoiceNumber,
        customerName: inv.order.customer.businessName,
        customerPhone: inv.order.customer.phone,
        paymentCount: payments.length,
        invoiceAmount,
        receivedAmount,
        balanceAmount: this.toPaise(invoiceAmount - receivedAmount),
      };
    });
  }

  async generateReceiptVoucherPdf(orderId: string): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { orderId },
      include: {
        order: {
          include: {
            customer: true,
            payments: {
              where: { verificationStatus: 'VERIFIED', amount: { gt: 0 } },
              orderBy: { paymentDate: 'asc' },
              include: { paymentAccount: { select: { name: true, accountType: true, accountNumber: true, bankName: true } } },
            },
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('No invoice found for this order — a receipt voucher needs an approved, invoiced order');
    const payments = invoice.order.payments;
    if (payments.length === 0) throw new BadRequestException('No verified payments on this order yet — nothing to issue a receipt for');

    const company = await this.getCompanyProfile();
    const customer = invoice.order.customer;
    const customerAddress = [customer.billingAddress, customer.city, customer.state, customer.pincode]
      .map((v) => (v ?? '').toString().trim())
      .filter(Boolean)
      .join(', ');
    const receivedAmount = this.toPaise(payments.reduce((sum, p) => sum + Number(p.amount), 0));
    const invoiceAmount = Number(invoice.totalAmount);
    const receiptNumber = this.receiptNumberFor(invoice.invoiceNumber);

    const buffer = await buildReceiptVoucherPdf({
      receiptNumber,
      receiptDate: this.formatDate(payments[payments.length - 1].paymentDate),
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: this.formatDate(invoice.issueDate),
      invoiceAmount,
      receivedAmount,
      balanceAmount: this.toPaise(invoiceAmount - receivedAmount),
      customerName: customer.businessName,
      customerAddress,
      customerPhone: customer.phone ?? '',
      customerGstin: customer.gstNumber ?? '',
      payments: payments.map((p) => ({
        paymentDate: this.formatDate(p.paymentDate),
        method: PAYMENT_METHOD_LABELS[p.method] ?? p.method,
        referenceNumber: p.referenceNumber,
        accountName: receiptAccountLabel(p.paymentAccount),
        amount: Number(p.amount),
      })),
      company: company as InvoicePdfCompanyProfile,
    });
    return { buffer, filename: `Receipt_${receiptNumber}.pdf` };
  }

  // ── Parties (customer ledger) ───────────────────────────────────────────
  // One party can exist as several Customer rows whose phone is the same
  // number in different formats (e.g. "9140580244" and "+91 91405 80244" —
  // older/other create paths didn't normalise it). The Parties list and
  // statement treat rows as one party only when all of these match:
  //   - phone, normalised (sanitizePhone) to the same 10-digit number
  //   - name, ignoring case, spaces and punctuation
  //   - GSTIN: rows with a GSTIN must share it; a blank GSTIN doesn't block
  //     the match, unless the name+phone set holds two different GSTINs —
  //     then only rows with the same GSTIN group and blank ones stay apart.
  // So two different businesses sharing one number stay separate. The rows
  // themselves are not merged.
  private partyPhone(phone: string | null): string | null {
    const normalised = sanitizePhone(phone ?? '');
    return normalised.length === 10 ? normalised : null;
  }

  // Customer id → party key. Rows with the same key are one party.
  private partyKeys(rows: { id: string; businessName: string; phone: string | null; gstNumber: string | null }[]): Map<string, string> {
    const buckets = new Map<string, { id: string; gst: string | null }[]>();
    const keys = new Map<string, string>();
    for (const r of rows) {
      const phone = this.partyPhone(r.phone);
      const name = r.businessName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!phone || !name) {
        keys.set(r.id, `id:${r.id}`);
        continue;
      }
      const bucketKey = `${phone}|${name}`;
      const bucket = buckets.get(bucketKey) ?? [];
      bucket.push({ id: r.id, gst: r.gstNumber?.trim().toUpperCase() || null });
      buckets.set(bucketKey, bucket);
    }
    for (const [bucketKey, bucket] of buckets) {
      const gstins = new Set(bucket.map((r) => r.gst).filter(Boolean));
      for (const r of bucket) {
        if (gstins.size <= 1) keys.set(r.id, bucketKey);
        else keys.set(r.id, r.gst ? `${bucketKey}|${r.gst}` : `id:${r.id}`);
      }
    }
    return keys;
  }

  // Candidates are limited to rows with a non-test invoice — the same rows
  // listParties() groups — so the statement always covers exactly the rows
  // merged into that party's list row.
  private async partyCustomerIds(customer: { id: string; businessName: string; phone: string | null; gstNumber: string | null }): Promise<string[]> {
    const phone = this.partyPhone(customer.phone);
    if (!phone) return [customer.id];
    const candidates = await this.prisma.$queryRaw<{ id: string; businessName: string; phone: string | null; gstNumber: string | null }[]>`
      SELECT c.id, c."businessName", c.phone, c."gstNumber" FROM "Customer" c
      WHERE regexp_replace(COALESCE(c.phone, ''), '[^0-9]', '', 'g') LIKE ${'%' + phone}
        AND EXISTS (SELECT 1 FROM "Invoice" i JOIN "Order" o ON o.id = i."orderId" WHERE o."customerId" = c.id AND o."isTest" = false)`;
    const rows = candidates.some((c) => c.id === customer.id) ? candidates : [customer, ...candidates];
    const keys = this.partyKeys(rows);
    const ownKey = keys.get(customer.id);
    return rows.filter((r) => keys.get(r.id) === ownKey).map((r) => r.id);
  }

  async listParties() {
    const invoices = await this.prisma.invoice.findMany({
      where: { order: { isTest: false } },
      include: { order: { include: { customer: true } } },
    });

    const customers = new Map(invoices.map((inv) => [inv.order.customer.id, inv.order.customer]));
    const partyKeys = this.partyKeys(Array.from(customers.values()));

    const byParty = new Map<string, { customerId: string; customerName: string; phone: string | null; totalBilled: number; totalReceived: number; balanceDue: number; invoiceCount: number }>();
    for (const inv of invoices) {
      const c = inv.order.customer;
      const phone = this.partyPhone(c.phone);
      const key = partyKeys.get(c.id)!;
      let row = byParty.get(key);
      if (!row) {
        row = { customerId: c.id, customerName: c.businessName, phone: c.phone, totalBilled: 0, totalReceived: 0, balanceDue: 0, invoiceCount: 0 };
        byParty.set(key, row);
      } else if (row.customerId !== c.id && c.phone === phone && row.phone !== phone) {
        // Represent the party by the row whose phone is stored already
        // normalised — the one Create Order matches new orders to.
        row.customerId = c.id;
        row.customerName = c.businessName;
        row.phone = c.phone;
      }
      row.totalBilled += Number(inv.totalAmount);
      row.totalReceived += Number(inv.paidAmount);
      row.balanceDue += Number(inv.balanceAmount);
      row.invoiceCount += 1;
    }

    return Array.from(byParty.values()).sort((a, b) => b.balanceDue - a.balanceDue);
  }

  // Sundry Creditors (Billing > Parties) — the parties we owe money to, as
  // opposed to listParties() above, which is the customers (Sundry Debtors).
  //   • Vendors/suppliers: every Vendor row (job-work vendors, presses and
  //     paper suppliers all live in that one table).
  //       Billed  = non-cancelled PurchaseBills' totals
  //       Paid    = those bills' paidAmount + "on account" payments (no bill
  //                 picked — the bill is optional on the payment form — or
  //                 made against a bill later cancelled), which never reach
  //                 any bill's paidAmount
  //       Notes   = ISSUED vendor credit/debit notes; createAccountingNote
  //                 debits Vendor Payable for both types, so both reduce it
  //       Balance = Billed − Paid − Notes (negative = advance with vendor)
  //     Same rule (common/vendor-payable.ts) as Accounts' Payable card, so the
  //     totals match. Read-only: PurchaseBill balances are not changed.
  //   • Employees: listed only, no balance — salary owed isn't stored
  //     anywhere (HR computes it live from attendance). "Salary Paid" is the
  //     sum of bank transactions tagged to the employee's login user
  //     (salaryForUserId) plus those tagged to the employee directly
  //     (salaryForEmployeeId, used when there is no login) — the only place a
  //     salary payment is recorded. Tagged users with no
  //     Employee record still get a row so their payouts aren't hidden —
  //     except the superadmin, whose tagged withdrawals are the owner's own
  //     pay (see AccountsService.getExpenseTracker), not a creditor.
  // Admin/Accounts only: it exposes vendor payables and salary payouts.
  async listCreditors(user: { role?: string; email?: string }) {
    const isSuperAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
    if (!isSuperAdmin && !['ADMIN', 'ACCOUNTS'].includes(user?.role ?? '')) {
      throw new ForbiddenException('Sundry creditors are visible to admin/accounts users only');
    }

    const [vendors, employees, salaryPaid, salaryPaidByEmployee] = await Promise.all([
      this.prisma.vendor.findMany({
        select: {
          id: true, name: true, phone: true, gstNumber: true, isActive: true, isPress: true,
          purchaseBills: {
            where: LIVE_PURCHASE_BILL_WHERE,
            select: { totalAmount: true, paidAmount: true },
          },
          vendorPayments: {
            where: ON_ACCOUNT_VENDOR_PAYMENT_WHERE,
            select: { amount: true },
          },
          creditDebitNotes: {
            where: PAYABLE_VENDOR_NOTE_WHERE,
            select: { totalAmount: true },
          },
        },
      }),
      this.prisma.employee.findMany({
        select: { id: true, employeeCode: true, fullName: true, designation: true, mobileNumber: true, status: true, userId: true },
      }),
      this.prisma.bankTransaction.groupBy({
        by: ['salaryForUserId'],
        where: { salaryForUserId: { not: null } },
        _sum: { amount: true },
      }),
      this.prisma.bankTransaction.groupBy({
        by: ['salaryForEmployeeId'],
        where: { salaryForEmployeeId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    // Amounts are 2-decimal Decimals; round the float sums back to paise.
    const toPaise = (n: number) => Math.round(n * 100) / 100;
    const sumOf = <T>(rows: T[], amount: (row: T) => unknown) => toPaise(rows.reduce((sum, r) => sum + Number(amount(r)), 0));

    const vendorRows = vendors
      .map((v) => {
        const totalBilled = sumOf(v.purchaseBills, (b) => b.totalAmount);
        const onAccountPaid = sumOf(v.vendorPayments, (p) => p.amount);
        const totalPaid = toPaise(sumOf(v.purchaseBills, (b) => b.paidAmount) + onAccountPaid);
        const notesAdjusted = sumOf(v.creditDebitNotes, (n) => n.totalAmount);
        return {
          vendorId: v.id,
          name: v.name,
          phone: v.phone,
          gstNumber: v.gstNumber,
          isActive: v.isActive,
          isPress: v.isPress,
          billCount: v.purchaseBills.length,
          totalBilled,
          totalPaid,
          onAccountPaid,
          notesAdjusted,
          balanceDue: toPaise(totalBilled - totalPaid - notesAdjusted),
        };
      })
      // Inactive vendors with nothing on record are just clutter here.
      .filter((v) => v.isActive || v.billCount > 0 || v.onAccountPaid > 0 || v.notesAdjusted > 0)
      .sort((a, b) => b.balanceDue - a.balanceDue || a.name.localeCompare(b.name));

    const paidByUserId = new Map(salaryPaid.map((row) => [row.salaryForUserId as string, toPaise(Number(row._sum.amount ?? 0))]));
    const paidByEmployeeId = new Map(salaryPaidByEmployee.map((row) => [row.salaryForEmployeeId as string, Number(row._sum.amount ?? 0)]));
    const employeeUserIds = new Set(employees.map((e) => e.userId).filter(Boolean));
    const unlinkedPaidUserIds = [...paidByUserId.keys()].filter((id) => !employeeUserIds.has(id));
    const unlinkedUsers = unlinkedPaidUserIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: unlinkedPaidUserIds } },
          select: { id: true, fullName: true, email: true, phone: true },
        })
      : [];

    const employeeRows = [
      ...employees.map((e) => ({
        employeeId: e.id as string | null,
        employeeCode: e.employeeCode as string | null,
        name: e.fullName,
        designation: e.designation as string | null,
        phone: e.mobileNumber,
        status: e.status as string,
        salaryPaid: toPaise((e.userId ? paidByUserId.get(e.userId) ?? 0 : 0) + (paidByEmployeeId.get(e.id) ?? 0)),
      })),
      ...unlinkedUsers
        .filter((u) => u.email?.toLowerCase() !== SUPER_ADMIN_EMAIL)
        .map((u) => ({
          employeeId: null,
          employeeCode: null,
          name: u.fullName || u.email,
          designation: null,
          phone: u.phone,
          status: 'NO_HR_RECORD',
          salaryPaid: paidByUserId.get(u.id) ?? 0,
        })),
    ].sort((a, b) => Number(a.status !== 'ACTIVE') - Number(b.status !== 'ACTIVE') || a.name.localeCompare(b.name));

    return { vendors: vendorRows, employees: employeeRows };
  }

  // Party-edit lock (Sanket, 2026-09-25): once ANY of a party's orders has
  // been dispatched, its name/phone/GSTIN/address are already on a shipped
  // invoice, label and receipt, so only the superadmin and ADMIN may change
  // them. Before that, ACCOUNTS can too. "Dispatched" = order status past
  // dispatch, or any item individually shipped (partial dispatch). Test
  // orders don't count. Returns up to 5 of those order numbers (newest first)
  // so the UI can say which order locked it.
  private async dispatchedOrdersForParty(customerId: string): Promise<string[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        isTest: false,
        OR: [
          { status: { in: [OrderStatus.PARTIALLY_DISPATCHED, OrderStatus.DISPATCHED, OrderStatus.DELIVERED] } },
          { items: { some: { dispatchedAt: { not: null } } } },
        ],
      },
      select: { orderNumber: true },
      orderBy: { orderDate: 'desc' },
      take: 5,
    });
    return orders.map((o) => o.orderNumber);
  }

  private canEditParty(user: { role?: string; email?: string } | undefined, dispatchedOrders: string[]): boolean {
    if (!user) return false;
    if (user.email?.toLowerCase() === SUPER_ADMIN_EMAIL) return true;
    if (user.role === 'ADMIN') return true;
    return user.role === 'ACCOUNTS' && dispatchedOrders.length === 0;
  }

  // `user` is passed only by the Parties screen (statement + edit) so it can
  // show whether Edit is allowed; the invoice PDF path leaves it out and
  // skips the extra query.
  async getPartyLedger(customerId: string, user?: { role?: string; email?: string }) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const dispatchedOrders = user ? await this.dispatchedOrdersForParty(customerId) : [];
    // Every Customer row that is this same party (see partyCustomerIds).
    const partyIds = await this.partyCustomerIds(customer);

    // Invoice.paidAmount/balanceAmount are already the source of truth for
    // verified payments (kept in sync by AccountsService's payment
    // verification flow) — no need to re-aggregate Payment rows here.
    const invoices = await this.prisma.invoice.findMany({
      where: { order: { customerId: { in: partyIds }, isTest: false } },
      orderBy: { issueDate: 'asc' },
    });

    let runningBalance = 0;
    const entries = invoices.map((inv) => {
      runningBalance += Number(inv.totalAmount) - Number(inv.paidAmount);
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        issueDate: inv.issueDate,
        totalAmount: Number(inv.totalAmount),
        paidAmount: Number(inv.paidAmount),
        balanceAmount: Number(inv.balanceAmount),
        status: inv.status,
        runningBalance,
      };
    });

    // Voucher-wise statement (Billing > Parties, statement PDF/Excel): one
    // Sale row per invoice (debit) and one Receipt row per VERIFIED payment on
    // those invoiced orders (credit), in date order with a running balance.
    // Same scope as `entries` above — verified payments on invoiced orders sum
    // to Invoice.paidAmount (checked 2026-09-28: 533 invoices, 0 mismatches) —
    // so totals agree. `entries` stays as-is: the invoice PDF's Previous/Current
    // Balance reads it.
    const company = await this.getCompanyProfile();
    const payments = await this.prisma.payment.findMany({
      where: { verificationStatus: 'VERIFIED', order: { customerId: { in: partyIds }, isTest: false, invoice: { isNot: null } } },
      include: { order: { select: { invoice: { select: { invoiceNumber: true } } } } },
    });
    const voucherRows = [
      ...invoices.map((inv) => ({
        date: inv.issueDate,
        type: 'Sale' as const,
        voucherNo: this.displayInvoiceNumber(company.invoicePrefix, inv.issueDate, inv.invoiceNumber),
        particulars: `Invoice ${inv.invoiceNumber}`,
        debit: Number(inv.totalAmount),
        credit: 0,
      })),
      ...payments.map((p) => ({
        date: p.paymentDate,
        type: 'Receipt' as const,
        voucherNo: this.receiptNumberFor(p.order.invoice!.invoiceNumber),
        particulars: [PAYMENT_METHOD_LABELS[p.method] ?? p.method, p.referenceNumber].filter(Boolean).join(' · '),
        debit: 0,
        credit: Number(p.amount),
      })),
    ].sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
      || (a.type === b.type ? 0 : a.type === 'Sale' ? -1 : 1));
    let voucherBalance = 0;
    const vouchers = voucherRows.map((v) => {
      voucherBalance = this.toPaise(voucherBalance + v.debit - v.credit);
      return { ...v, balance: voucherBalance };
    });

    return {
      customer: {
        id: customer.id,
        businessName: customer.businessName,
        phone: customer.phone,
        gstNumber: customer.gstNumber,
        state: customer.state,
        billingAddress: customer.billingAddress,
        city: customer.city,
        pincode: customer.pincode,
      },
      entries,
      vouchers,
      totalBilled: entries.reduce((sum, e) => sum + e.totalAmount, 0),
      totalReceived: entries.reduce((sum, e) => sum + e.paidAmount, 0),
      balanceDue: entries.reduce((sum, e) => sum + e.balanceAmount, 0),
      ...(user ? { editLock: { dispatchedOrders, canEdit: this.canEditParty(user, dispatchedOrders) } } : {}),
    };
  }

  // Billing > Invoices "Remark" on a cancelled invoice — the reason printed
  // on the Cancelled Invoice PDF. Prefilled from the cancel request when the
  // order was cancelled; this lets Accounts add one for invoices cancelled
  // before that existed, or correct it. Same roles as updateParty. Only the
  // remark changes — no amounts, items or ledger rows are touched.
  async updateCancellationRemark(invoiceId: string, remark: string | undefined, user: { role: string; email?: string }) {
    const isSuperAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
    if (!isSuperAdmin && !['ADMIN', 'ACCOUNTS'].includes(user?.role)) {
      throw new ForbiddenException('Only admin/accounts users can edit the cancellation remark');
    }
    const text = typeof remark === 'string' ? remark.trim() : '';
    if (!text) throw new BadRequestException('Remark is required');
    if (text.length > CANCELLATION_REMARK_MAX_LENGTH) {
      throw new BadRequestException(`Remark must be at most ${CANCELLATION_REMARK_MAX_LENGTH} characters`);
    }
    const invoice = await this.prisma.invoice.findUnique({ where: { id: invoiceId }, include: { order: { select: { status: true } } } });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status !== 'CANCELLED' && invoice.order.status !== 'CANCELLED') {
      throw new BadRequestException('Only a cancelled invoice can have a cancellation remark');
    }
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { cancellationReason: text } as any });
    return { id: invoiceId, cancellationReason: text };
  }

  // Billing > Parties "Edit". Writes the single Customer row, which every
  // order (past and present), invoice and receipt reads live — orders keep no
  // copy of the name/phone/GSTIN — so one edit here updates all of them.
  // Same normalisation as order create/edit (orders.service.ts): uppercase
  // name/address/city/state, digits-only phone, GSTIN format check.
  // ADMIN/ACCOUNTS (the roles Billing is shown to by default) until any of
  // the party's orders is dispatched; after that superadmin and ADMIN only —
  // see dispatchedOrdersForParty().
  async updateParty(
    customerId: string,
    dto: { businessName?: string; phone?: string; gstNumber?: string; billingAddress?: string; city?: string; state?: string; pincode?: string },
    user: { role: string; email?: string },
  ) {
    const isSuperAdmin = user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL;
    if (!isSuperAdmin && !['ADMIN', 'ACCOUNTS'].includes(user?.role)) {
      throw new ForbiddenException('Only admin/accounts users can edit party details');
    }
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (!isSuperAdmin && user?.role !== 'ADMIN') {
      const dispatchedOrders = await this.dispatchedOrdersForParty(customerId);
      if (dispatchedOrders.length > 0) {
        throw new ForbiddenException(`Order ${dispatchedOrders[0]} for this party is already dispatched — only an admin can edit party details now`);
      }
    }

    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : undefined);
    const data: Record<string, string | null> = {};

    const name = text(dto.businessName);
    if (name !== undefined) {
      if (!name) throw new BadRequestException('Party name cannot be empty');
      data.businessName = name.toUpperCase();
      // Order create/edit always keep contactPerson equal to the name; keep
      // that in step unless someone set a different contact person on purpose.
      if (!customer.contactPerson || customer.contactPerson === customer.businessName) {
        data.contactPerson = data.businessName;
      }
    }

    const rawPhone = text(dto.phone);
    if (rawPhone !== undefined) {
      const phone = sanitizePhone(rawPhone);
      if (!phone || phone.length !== 10) throw new BadRequestException('Phone must be a 10-digit mobile number');
      // Create Order matches existing customers by phone, so two parties
      // sharing one number would get their orders mixed up. Only checked
      // when the number actually changes — the edit form resends the phone
      // on every save, and a pre-existing duplicate must not block e.g. an
      // address-only edit.
      if (phone !== sanitizePhone(customer.phone ?? '')) {
        const clash = await this.prisma.customer.findFirst({
          where: { phone, id: { not: customerId } },
          select: { businessName: true },
        });
        if (clash) throw new BadRequestException(`Phone ${phone} is already used by ${clash.businessName}`);
      }
      data.phone = phone;
    }

    const gst = text(dto.gstNumber);
    if (gst !== undefined) {
      const gstUpper = gst.toUpperCase();
      if (gstUpper && !GSTIN_FORMAT.test(gstUpper)) {
        throw new BadRequestException('GST Number must be a valid 15-character GSTIN (e.g. 27AAAAA0000A1Z5)');
      }
      data.gstNumber = gstUpper || null;
    }

    const pincode = text(dto.pincode);
    if (pincode !== undefined) {
      if (pincode && !/^\d{6}$/.test(pincode)) throw new BadRequestException('Pincode must be 6 digits');
      data.pincode = pincode || null;
    }

    for (const field of ['billingAddress', 'city', 'state'] as const) {
      const value = text(dto[field]);
      if (value !== undefined) data[field] = value ? value.toUpperCase() : null;
    }

    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to update');
    await this.prisma.customer.update({ where: { id: customerId }, data });
    return this.getPartyLedger(customerId, user);
  }

  // Simple tabular PDF — deliberately plainer than the branded tax invoice
  // (§1's detailed layout is for a single invoice; a party statement is an
  // internal accounts-team document, not something handed to the customer,
  // so it doesn't need the same branding effort).
  async generatePartyStatementPdf(customerId: string): Promise<{ buffer: Buffer; filename: string }> {
    const ledger = await this.getPartyLedger(customerId);
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    registerInvoiceFonts(doc); // DejaVu Sans — Helvetica has no ₹ glyph, see pdf-fonts.ts

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('error', reject);
      doc.on('end', () => resolve(Buffer.concat(chunks)));

      doc.font('Body-Bold').fontSize(16).text('Party Statement', { align: 'center' });
      doc.moveDown(0.3);
      doc.font('Body').fontSize(10).text(ledger.customer.businessName, { align: 'center' });
      if (ledger.customer.phone) doc.text(ledger.customer.phone, { align: 'center' });
      doc.moveDown();

      // Voucher-wise, date first: Date | Type | Voucher No | Particulars |
      // Debit | Credit | Balance (see getPartyLedger's `vouchers`).
      const startX = 40;
      const cols = [
        { label: 'Date', x: 0, w: 58 },
        { label: 'Type', x: 58, w: 46 },
        { label: 'Voucher No', x: 104, w: 90 },
        { label: 'Particulars', x: 194, w: 100 },
        { label: 'Debit (₹)', x: 294, w: 66, right: true },
        { label: 'Credit (₹)', x: 360, w: 66, right: true },
        { label: 'Balance (₹)', x: 426, w: 69, right: true },
      ];
      // One line per cell: long text (UPI references have no spaces) is cut by
      // character with "…" — PDFKit's own ellipsis cuts at word boundaries and
      // wraps, which dropped the whole reference and overlapped the next row.
      const fitCell = (text: string, width: number) => {
        if (doc.widthOfString(text) <= width) return text;
        let keep = text.length;
        while (keep > 0 && doc.widthOfString(`${text.slice(0, keep)}…`) > width) keep--;
        return `${text.slice(0, keep)}…`;
      };
      const drawRow = (values: string[]) => {
        cols.forEach((c, i) => doc.text(fitCell(values[i], c.w - 4), startX + c.x, y, { width: c.w - 4, align: c.right ? 'right' : 'left', lineBreak: false }));
      };
      let y = doc.y;
      const drawHeader = () => {
        doc.font('Body-Bold').fontSize(9);
        drawRow(cols.map((c) => c.label));
        y += 16;
        doc.moveTo(startX, y).lineTo(555, y).stroke();
        y += 6;
        doc.font('Body').fontSize(9);
      };
      drawHeader();

      for (const v of ledger.vouchers) {
        if (y > 780) { doc.addPage(); y = 40; drawHeader(); }
        drawRow([
          this.formatDate(v.date),
          v.type,
          v.voucherNo,
          v.particulars,
          v.debit ? v.debit.toFixed(2) : '',
          v.credit ? v.credit.toFixed(2) : '',
          v.balance.toFixed(2),
        ]);
        y += 16;
      }

      y += 8;
      doc.moveTo(startX, y).lineTo(555, y).stroke();
      y += 10;
      doc.font('Body-Bold').fontSize(10);
      doc.text(`Total Billed: ₹${ledger.totalBilled.toFixed(2)}    Total Received: ₹${ledger.totalReceived.toFixed(2)}    Balance Due: ₹${ledger.balanceDue.toFixed(2)}`, startX, y, { width: 495 });

      doc.end();
    });

    return { buffer, filename: `Statement_${ledger.customer.businessName.replace(/[^a-zA-Z0-9]+/g, '_')}.pdf` };
  }

  // ── GST summary ──────────────────────────────────────────────────────────
  async getGstSummary(from?: string, to?: string) {
    const where: any = { order: { isTest: false }, status: 'ISSUED' };
    if (from || to) {
      where.issueDate = {};
      if (from) where.issueDate.gte = new Date(from);
      if (to) where.issueDate.lte = new Date(to);
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      include: { items: true },
    });

    let taxableAmount = 0, cgst = 0, sgst = 0, igst = 0;
    const byHsn = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number }>();

    for (const inv of invoices) {
      for (const item of inv.items) {
        taxableAmount += Number(item.taxableAmount);
        cgst += Number(item.cgstAmount);
        sgst += Number(item.sgstAmount);
        igst += Number(item.igstAmount);

        const key = item.hsnSac ?? '-';
        const g = byHsn.get(key) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        g.taxable += Number(item.taxableAmount);
        g.cgst += Number(item.cgstAmount);
        g.sgst += Number(item.sgstAmount);
        g.igst += Number(item.igstAmount);
        byHsn.set(key, g);
      }
      // Courier charge billed on the invoice (not an InvoiceItem), incl. GST.
      const courierCharge = Number(inv.courierCharge ?? 0);
      if (courierCharge > 0) {
        const c = courierGstSplit(courierCharge, inv.gstTreatment);
        taxableAmount += c.taxableAmount; cgst += c.cgstAmount; sgst += c.sgstAmount; igst += c.igstAmount;
        const g = byHsn.get(COURIER_SAC) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        g.taxable += c.taxableAmount; g.cgst += c.cgstAmount; g.sgst += c.sgstAmount; g.igst += c.igstAmount;
        byHsn.set(COURIER_SAC, g);
      }
    }

    return {
      invoiceCount: invoices.length,
      taxableAmount,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      totalTax: cgst + sgst + igst,
      hsnWise: Array.from(byHsn.entries()).map(([hsnSac, v]) => ({ hsnSac, ...v, totalTax: v.cgst + v.sgst + v.igst })),
    };
  }

  // ── WhatsApp PDF sharing ────────────────────────────────────────────────
  // Signed, short-lived token so the PDF can be fetched by AiSensy's servers
  // without exposing every invoice at a guessable unauthenticated URL. Reuses
  // JWT_SECRET (already required at boot by auth.config.ts) instead of adding
  // a new secret env var.
  private signPublicToken(invoiceId: string, expiresAt: number): string {
    const secret = process.env.JWT_SECRET ?? '';
    const sig = createHmac('sha256', secret).update(`${invoiceId}.${expiresAt}`).digest('hex');
    return `${expiresAt}.${sig}`;
  }

  verifyPublicToken(invoiceId: string, token: string): boolean {
    const [expiresAtStr, sig] = String(token ?? '').split('.');
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || !sig || Date.now() > expiresAt) return false;
    const expected = this.signPublicToken(invoiceId, expiresAt).split('.')[1];
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  // Signed, short-lived (15 min) public URL AiSensy's servers can fetch the
  // invoice PDF from. Defaults to the known production backend domain
  // (matches the fallback already used across frontend/lib/api.ts etc.) so
  // this works without any extra Railway env var; BACKEND_PUBLIC_URL can
  // still override it (e.g. for a staging deploy).
  getSignedInvoicePdfUrl(invoiceId: string): string | null {
    const publicBaseUrl = (process.env.BACKEND_PUBLIC_URL ?? 'https://rareprint-erp-production.up.railway.app').trim();
    if (!publicBaseUrl) return null;
    const expiresAt = Date.now() + 15 * 60 * 1000;
    const token = this.signPublicToken(invoiceId, expiresAt);
    return `${publicBaseUrl.replace(/\/$/, '')}/billing/invoices/${invoiceId}/pdf/public?token=${encodeURIComponent(token)}`;
  }

  // Sends the invoice PDF as a WhatsApp document attachment (see
  // WhatsAppService.sendInvoiceDocument) using the approved "invoice_pdf_erp"
  // AiSensy template (2026-08-29). Deliberately never throws: this is
  // called fire-and-forget from order approval (see
  // AccountsService.approveOrder) and must never be able to fail that flow
  // — a missing phone number or an AiSensy-side rejection just comes back
  // as {sent:false, skipped/errorMessage} instead of throwing.
  async sendInvoicePdfDocument(
    invoiceId: string,
    customerName: string,
    customerPhone: string,
  ): Promise<{ sent: boolean; skipped?: string; errorMessage?: string }> {
    try {
      if (!customerPhone) return { sent: false, skipped: 'customer has no phone number on file' };
      const pdfUrl = this.getSignedInvoicePdfUrl(invoiceId);
      if (!pdfUrl) return { sent: false, skipped: 'BACKEND_PUBLIC_URL not configured' };

      const invoice = await this.loadInvoiceForPdf(invoiceId);
      const result = await this.whatsapp.sendInvoiceDocument({
        customerName,
        customerPhone,
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl,
      });
      return result;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`sendInvoicePdfDocument failed for invoice ${invoiceId}: ${reason}`);
      return { sent: false, errorMessage: reason };
    }
  }

  // Manual "Share via WhatsApp" button: sends the invoice PDF as a document
  // attachment when configured (see sendInvoicePdfDocument above), otherwise
  // falls back to the same text-only notification the system already sends
  // automatically on approval — so this button always does *something*
  // useful, even before the AiSensy document template exists.
  async shareInvoiceViaWhatsapp(invoiceId: string): Promise<{ sent: boolean; withPdf: boolean }> {
    const invoice = await this.loadInvoiceForPdf(invoiceId);
    const customer = invoice.order.customer;
    if (!customer.phone) throw new BadRequestException('Customer has no phone number on file');

    const pdfResult = await this.sendInvoicePdfDocument(invoiceId, customer.businessName, customer.phone);
    if (pdfResult.sent) {
      return { sent: true, withPdf: true };
    }
    if (pdfResult.skipped) {
      this.logger.warn(`Invoice ${invoice.invoiceNumber}: WhatsApp PDF skipped (${pdfResult.skipped}) — sending text-only notification instead.`);
    } else if (pdfResult.errorMessage) {
      this.logger.warn(`Invoice ${invoice.invoiceNumber}: WhatsApp PDF failed (${pdfResult.errorMessage}) — sending text-only notification instead.`);
    }

    const sent = await this.whatsapp.sendInvoiceGenerated({
      customerName: customer.businessName,
      customerPhone: customer.phone,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: this.formatDate(invoice.issueDate),
      totalAmount: Number(invoice.totalAmount),
      balanceAmount: Number(invoice.balanceAmount),
      gstAmount: Number(invoice.taxAmount),
      agentName: invoice.order.salesAgent?.fullName ?? 'Rareprint Team',
    });

    return { sent, withPdf: false };
  }
}
