// backend/src/marketing-roi/marketing-roi.service.ts
//
// "Ad ROI" tab for the Marketing module — cross-checks AiSensy contacts
// created in a given month against ERP customers/orders to show how ad
// spend (Meta + AiSensy) turned into actual sales and profit.
//
// Data sources (nothing new to upload beyond spend numbers):
//  - ImportedContact.createdOnAt: contacts "created" that month, from the
//    same AiSensy "Export Contacts" CSV the call-compliance module already
//    imports (see call-compliance/aisensy-contacts-parser.ts). Uploading the
//    CSV here delegates to CallComplianceService.importContactsCsv so both
//    features read/write the exact same table — the user only uploads once.
//  - Customer.phone / phone2, matched (last-10-digit, same normalization as
//    the AiSensy parser) against that month's contact phones, to find which
//    contacts became ERP customers.
//  - Order.grandTotal for "total sale"; profit uses the same per-product
//    cost-slab math as cost-table.service.ts's computeOrderGrossProfit,
//    reimplemented here as a single batched query (fetching all matched
//    orders' items/cost-slabs at once) instead of one Prisma round-trip per
//    order, to keep a 12-month report fast. If the cost-slab formula in
//    cost-table.service.ts ever changes, mirror the change in
//    lineCostTotal() below.
//  - MarketingRoiSpend: the only new table — one row per month holding the
//    Meta Ads spend + AiSensy subscription/spend the user enters by hand.
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CallComplianceService } from '../call-compliance/call-compliance.service';

export interface MonthRoi {
  monthKey: string; // "YYYY-MM"
  label: string; // "July 2026"
  metaAdSpend: number;
  aisensySpend: number;
  totalSpend: number;
  notes: string | null;
  contactsCreated: number;
  convertedCustomers: number;
  conversionRatioPct: number; // e.g. 3 for "3/100"
  totalSale: number;
  totalProfit: number;
  ordersMatched: number;
  ordersMissingCost: number;
  roiVsSaleX: number | null; // sale / spend, e.g. 4.2 => "4.2x"
  roiVsProfitX: number | null; // profit / spend
  costPerConversion: number | null;
}

@Injectable()
export class MarketingRoiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly callCompliance: CallComplianceService,
  ) {}

  // ─── Contacts CSV upload — shared with call-compliance ──────────────────
  async importContactsCsv(file: Express.Multer.File, importedById: string) {
    return this.callCompliance.importContactsCsv(file, importedById);
  }

  // ─── Spend entry ──────────────────────────────────────────────────────
  async upsertSpend(monthKey: string, body: { metaAdSpend?: number; aisensySpend?: number; notes?: string }, userId: string) {
    this.assertMonthKey(monthKey);
    await (this.prisma as any).marketingRoiSpend.upsert({
      where: { monthKey },
      create: {
        monthKey,
        metaAdSpend: body.metaAdSpend ?? 0,
        aisensySpend: body.aisensySpend ?? 0,
        notes: body.notes || null,
        createdById: userId,
      },
      update: {
        ...(body.metaAdSpend != null ? { metaAdSpend: body.metaAdSpend } : {}),
        ...(body.aisensySpend != null ? { aisensySpend: body.aisensySpend } : {}),
        ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
      },
    });
    return this.getMonthRoi(monthKey);
  }

  // ─── ROI report ───────────────────────────────────────────────────────
  //
  // Originally this called getMonthRoi() once per month in a loop — each
  // call independently re-fetched the *entire* Customer table and then a
  // fresh Order query for whichever customers matched. For a 12-month report
  // that's 12x redundant full-table customer scans plus 12 separate order
  // queries, which measured at ~27s end-to-end in production (Customer/Order
  // have grown enough that this stopped being "fine at small scale"). The
  // page would sit on "Loading ROI data..." that whole time, and if a user
  // refreshed or looked away before it resolved, it looked like the numbers
  // just weren't there.
  //
  // Fetches customers, contacts, and orders ONCE regardless of how many
  // months are requested, then buckets everything in memory.
  async listMonths(count = 12): Promise<MonthRoi[]> {
    const monthKeys = this.recentMonthKeys(count); // most recent first
    const rangeStart = this.monthRange(monthKeys[monthKeys.length - 1]).start;
    const rangeEnd = this.monthRange(monthKeys[0]).end;

    const [spendRows, contacts, customers] = await Promise.all([
      (this.prisma as any).marketingRoiSpend.findMany({ where: { monthKey: { in: monthKeys } } }),
      (this.prisma as any).importedContact.findMany({
        where: { createdOnAt: { gte: rangeStart, lt: rangeEnd } },
        select: { phone: true, createdOnAt: true },
      }),
      this.prisma.customer.findMany({
        where: { OR: [{ phone: { not: null } }, { phone2: { not: null } }] },
        select: { id: true, phone: true, phone2: true },
      }),
    ]);

    const spendByMonth = new Map<string, any>(spendRows.map((r: any) => [r.monthKey, r]));

    // Bucket contact phones by month — createdOnAt is a single timestamp per
    // ImportedContact row (unique on phone), so each contact lands in exactly
    // one month here.
    const phonesByMonth = new Map<string, Set<string>>();
    for (const key of monthKeys) phonesByMonth.set(key, new Set());
    for (const c of contacts as { phone: string; createdOnAt: Date }[]) {
      const key = this.toMonthKey(c.createdOnAt);
      phonesByMonth.get(key)?.add(c.phone);
    }

    // phone -> customerId, built once instead of per month.
    const customerIdByPhone = new Map<string, string>();
    for (const cust of customers) {
      if (cust.phone) customerIdByPhone.set(this.normalizeLast10(cust.phone), cust.id);
      if (cust.phone2) customerIdByPhone.set(this.normalizeLast10(cust.phone2), cust.id);
    }

    const matchedCustomerIdsByMonth = new Map<string, Set<string>>();
    const allMatchedCustomerIds = new Set<string>();
    for (const key of monthKeys) {
      const ids = new Set<string>();
      for (const phone of phonesByMonth.get(key) ?? []) {
        const custId = customerIdByPhone.get(phone);
        if (custId) { ids.add(custId); allMatchedCustomerIds.add(custId); }
      }
      matchedCustomerIdsByMonth.set(key, ids);
    }

    // Queried unconditionally — `in: []` when nothing matched just resolves
    // to no rows, and keeps `orders` a single stable type.
    const orders = await this.prisma.order.findMany({
      where: {
        customerId: { in: [...allMatchedCustomerIds] },
        isTest: false,
        isSample: false,
        status: { not: 'CANCELLED' as any },
      },
      select: {
        id: true,
        customerId: true,
        grandTotal: true,
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            product: { select: { costSlabs: { select: { minQuantity: true, maxQuantity: true, unitPrice: true } } } },
          },
        },
      },
    });
    const ordersByCustomerId = new Map<string, typeof orders>();
    for (const order of orders) {
      if (!ordersByCustomerId.has(order.customerId)) ordersByCustomerId.set(order.customerId, []);
      ordersByCustomerId.get(order.customerId)!.push(order);
    }

    return monthKeys.map((monthKey) => {
      const spendRow = spendByMonth.get(monthKey);
      const metaAdSpend = Number(spendRow?.metaAdSpend ?? 0);
      const aisensySpend = Number(spendRow?.aisensySpend ?? 0);
      const totalSpend = metaAdSpend + aisensySpend;
      const contactsCreated = phonesByMonth.get(monthKey)?.size ?? 0;

      let convertedCustomers = 0;
      let totalSale = 0;
      let totalProfit = 0;
      let ordersMatched = 0;
      let ordersMissingCost = 0;

      for (const custId of matchedCustomerIdsByMonth.get(monthKey) ?? []) {
        const custOrders = ordersByCustomerId.get(custId);
        if (!custOrders?.length) continue;
        convertedCustomers++;
        for (const order of custOrders) {
          totalSale += Number(order.grandTotal);
          ordersMatched++;
          let costTotal = 0;
          let missingCost = false;
          for (const item of order.items as any[]) {
            const lineCost = this.lineCostTotal(item);
            if (lineCost == null) { missingCost = true; continue; }
            costTotal += lineCost;
          }
          if (missingCost) ordersMissingCost++;
          else totalProfit += Number(order.grandTotal) - costTotal;
        }
      }

      const conversionRatioPct = contactsCreated > 0 ? Number(((convertedCustomers / contactsCreated) * 100).toFixed(1)) : 0;
      const roiVsSaleX = totalSpend > 0 ? Number((totalSale / totalSpend).toFixed(2)) : null;
      const roiVsProfitX = totalSpend > 0 ? Number((totalProfit / totalSpend).toFixed(2)) : null;
      const costPerConversion = convertedCustomers > 0 ? Number((totalSpend / convertedCustomers).toFixed(2)) : null;

      return {
        monthKey,
        label: this.monthLabel(monthKey),
        metaAdSpend,
        aisensySpend,
        totalSpend: Number(totalSpend.toFixed(2)),
        notes: spendRow?.notes ?? null,
        contactsCreated,
        convertedCustomers,
        conversionRatioPct,
        totalSale: Number(totalSale.toFixed(2)),
        totalProfit: Number(totalProfit.toFixed(2)),
        ordersMatched,
        ordersMissingCost,
        roiVsSaleX,
        roiVsProfitX,
        costPerConversion,
      };
    });
  }

  async getMonthRoi(monthKey: string): Promise<MonthRoi> {
    this.assertMonthKey(monthKey);
    const { start, end } = this.monthRange(monthKey);

    const [spendRow, contacts] = await Promise.all([
      (this.prisma as any).marketingRoiSpend.findUnique({ where: { monthKey } }),
      (this.prisma as any).importedContact.findMany({
        where: { createdOnAt: { gte: start, lt: end } },
        select: { phone: true },
      }),
    ]);

    const metaAdSpend = Number(spendRow?.metaAdSpend ?? 0);
    const aisensySpend = Number(spendRow?.aisensySpend ?? 0);
    const totalSpend = metaAdSpend + aisensySpend;
    const contactsCreated = contacts.length;
    const phoneSet = new Set<string>(contacts.map((c: any) => c.phone));

    let convertedCustomers = 0;
    let totalSale = 0;
    let totalProfit = 0;
    let ordersMatched = 0;
    let ordersMissingCost = 0;

    if (phoneSet.size > 0) {
      const customers = await this.prisma.customer.findMany({
        where: { OR: [{ phone: { not: null } }, { phone2: { not: null } }] },
        select: { id: true, phone: true, phone2: true },
      });
      const matchedCustomerIds = customers
        .filter((c) => (c.phone && phoneSet.has(this.normalizeLast10(c.phone))) || (c.phone2 && phoneSet.has(this.normalizeLast10(c.phone2))))
        .map((c) => c.id);

      if (matchedCustomerIds.length > 0) {
        const orders = await this.prisma.order.findMany({
          where: {
            customerId: { in: matchedCustomerIds },
            isTest: false,
            isSample: false,
            status: { not: 'CANCELLED' as any },
          },
          select: {
            id: true,
            customerId: true,
            grandTotal: true,
            items: {
              select: {
                quantity: true,
                unitPrice: true,
                lineTotal: true,
                product: { select: { costSlabs: { select: { minQuantity: true, maxQuantity: true, unitPrice: true } } } },
              },
            },
          },
        });

        const convertedSet = new Set<string>();
        for (const order of orders) {
          convertedSet.add(order.customerId);
          totalSale += Number(order.grandTotal);
          ordersMatched++;

          let costTotal = 0;
          let missingCost = false;
          for (const item of order.items as any[]) {
            const lineCost = this.lineCostTotal(item);
            if (lineCost == null) {
              missingCost = true;
              continue;
            }
            costTotal += lineCost;
          }
          if (missingCost) {
            ordersMissingCost++;
          } else {
            totalProfit += Number(order.grandTotal) - costTotal;
          }
        }
        convertedCustomers = convertedSet.size;
      }
    }

    const conversionRatioPct = contactsCreated > 0 ? Number(((convertedCustomers / contactsCreated) * 100).toFixed(1)) : 0;
    const roiVsSaleX = totalSpend > 0 ? Number((totalSale / totalSpend).toFixed(2)) : null;
    const roiVsProfitX = totalSpend > 0 ? Number((totalProfit / totalSpend).toFixed(2)) : null;
    const costPerConversion = convertedCustomers > 0 ? Number((totalSpend / convertedCustomers).toFixed(2)) : null;

    return {
      monthKey,
      label: this.monthLabel(monthKey),
      metaAdSpend,
      aisensySpend,
      totalSpend: Number(totalSpend.toFixed(2)),
      notes: spendRow?.notes ?? null,
      contactsCreated,
      convertedCustomers,
      conversionRatioPct,
      totalSale: Number(totalSale.toFixed(2)),
      totalProfit: Number(totalProfit.toFixed(2)),
      ordersMatched,
      ordersMissingCost,
      roiVsSaleX,
      roiVsProfitX,
      costPerConversion,
    };
  }

  // ─── Drill-down: the actual contacts behind a month's "Contacts Created" ──
  async getMonthContacts(monthKey: string) {
    this.assertMonthKey(monthKey);
    const { start, end } = this.monthRange(monthKey);

    const contacts = await (this.prisma as any).importedContact.findMany({
      where: { createdOnAt: { gte: start, lt: end } },
      select: {
        id: true, name: true, phone: true, tagRaw: true,
        createdOnAt: true, lastActiveAt: true,
        agent: { select: { fullName: true } },
      },
      orderBy: { createdOnAt: 'desc' },
    });

    if (!contacts.length) return [];

    const phones: string[] = contacts.map((c: any) => c.phone);
    const customers = await this.prisma.customer.findMany({
      where: { OR: [{ phone: { not: null } }, { phone2: { not: null } }] },
      select: { id: true, phone: true, phone2: true },
    });
    const customerIdByPhone = new Map<string, string>();
    for (const cust of customers) {
      if (cust.phone) customerIdByPhone.set(this.normalizeLast10(cust.phone), cust.id);
      if (cust.phone2) customerIdByPhone.set(this.normalizeLast10(cust.phone2), cust.id);
    }
    const matchedCustomerIds = [...new Set(phones.map((p) => customerIdByPhone.get(p)).filter((id): id is string => !!id))];

    const convertedCustomerIds = matchedCustomerIds.length
      ? new Set(
          (
            await this.prisma.order.findMany({
              where: { customerId: { in: matchedCustomerIds }, isTest: false, isSample: false, status: { not: 'CANCELLED' as any } },
              select: { customerId: true },
              distinct: ['customerId'],
            })
          ).map((o) => o.customerId),
        )
      : new Set<string>();

    return contacts.map((c: any) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      tagRaw: c.tagRaw,
      agentName: c.agent?.fullName ?? null,
      createdOnAt: c.createdOnAt,
      lastActiveAt: c.lastActiveAt,
      converted: convertedCustomerIds.has(customerIdByPhone.get(c.phone) ?? ''),
    }));
  }

  // ── Cost-slab math — mirrors cost-table.service.ts's private
  // matchingSlab()/lineCostTotal(). Kept as a local pure function here
  // instead of injecting CostTableService, so a 12-month report is one
  // batched query instead of one per order.
  private matchingSlab(slabs: Array<{ minQuantity: number; maxQuantity: number | null; unitPrice: any }>, quantity: number) {
    return slabs
      .filter((slab) => slab.minQuantity <= quantity && (slab.maxQuantity == null || slab.maxQuantity >= quantity))
      .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null;
  }

  private lineCostTotal(item: { quantity: number; unitPrice: any; product: { costSlabs: any[] } }): number | null {
    const slab = this.matchingSlab(item.product.costSlabs ?? [], item.quantity);
    if (!slab) return null;
    const raw = Number(slab.unitPrice);
    const salePerUnit = Number(item.unitPrice);
    const costPerUnit = raw > salePerUnit ? raw / slab.minQuantity : raw;
    return costPerUnit * item.quantity;
  }

  private normalizeLast10(raw: string): string {
    return String(raw ?? '').replace(/\D/g, '').slice(-10);
  }

  /** Inverse of monthRange — used by listMonths() to bucket a createdOnAt timestamp back into its "YYYY-MM" key. */
  private toMonthKey(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  private assertMonthKey(monthKey: string) {
    if (!/^\d{4}-\d{2}$/.test(monthKey)) {
      throw new BadRequestException('monthKey must be "YYYY-MM"');
    }
  }

  private monthRange(monthKey: string): { start: Date; end: Date } {
    const [year, month] = monthKey.split('-').map(Number);
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }

  private monthLabel(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }

  private recentMonthKeys(count: number): string[] {
    const now = new Date();
    const keys: string[] = [];
    for (let i = 0; i < count; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }
    return keys; // most recent first
  }
}
