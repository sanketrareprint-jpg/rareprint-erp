// backend/src/dashboard/dashboard.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CostTableService } from '../cost-table/cost-table.service';
import { OrderStatus, OrderProductionStage, ProductionCategory, BankReconcileStatus } from '@prisma/client';

// Profit is sensitive — only Sanket (super-admin) sees it on the dashboard.
// Matches the SUPER_ADMIN_EMAIL convention already used in accounts.service.ts.
const SUPER_ADMIN_EMAIL = 'sanket.rareprint@gmail.com';

type SuperAdminTaskItem = {
  id: string;
  title: string;
  subtitle: string;
  amount: number | null;
  link: string;
  createdAt: string;
};

type ComplaintsOverview = {
  openCount: number;
  overdueCount: number;
  escalatedCount: number;
  byPriority: { LOW: number; MEDIUM: number; HIGH: number; URGENT: number };
  recent: SuperAdminTaskItem[];
};

type ProductionKpiMetric = {
  key: string;
  label: string;
  avgHours: number | null;
  avgDays: number | null;
  avgDaysMonth: number | null;
  avgDaysWeek: number | null;
  sampleSize: number;
  note: string;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costTable: CostTableService,
  ) {}

  async getSummary(userEmail?: string) {
    // Profit is sensitive — visible only to the owner's hardcoded email, not
    // to every ADMIN-role account.
    const isSuperAdmin = userEmail === SUPER_ADMIN_EMAIL;

    const [statsResult, agentsResult, catStagesResult, avgProdResult, leadDataResult, productionKpisResult, salesByMonthResult, profitResult, cashflowResult, superAdminTasksResult, complaintsOverviewResult] = await Promise.allSettled([
      this.getStats(),
      this.getAgentLeaderboard(),
      this.getCategoryStageQuantities(),
      this.getAvgProductionTime(),
      this.getLeadSourceAnalytics(),
      this.withTimeout(this.getProductionKpis(), 10000, this.getEmptyProductionKpis()),
      this.getSalesByMonth(6),
      isSuperAdmin ? this.getProfitKpis() : Promise.resolve(null),
      isSuperAdmin ? this.getCashflow() : Promise.resolve(null),
      isSuperAdmin ? this.getSuperAdminTasks() : Promise.resolve(null),
      // Unlike the rest of the Super Admin Tasks bundle, the complaints
      // overview is visible to every role that lands on /dashboard — not
      // just the owner — so production/dispatch/sales can all see what's
      // outstanding at a glance.
      this.getComplaintsOverview(),
    ]);

    return {
      stats: statsResult.status === 'fulfilled' ? statsResult.value : this.getEmptyStats(),
      agents: agentsResult.status === 'fulfilled' ? agentsResult.value : [],
      catStages: catStagesResult.status === 'fulfilled' ? catStagesResult.value : [],
      avgProd: avgProdResult.status === 'fulfilled' ? avgProdResult.value : [],
      leadData: leadDataResult.status === 'fulfilled' ? leadDataResult.value : { allTime: [], thisMonth: [] },
      productionKpis: productionKpisResult.status === 'fulfilled'
        ? productionKpisResult.value
        : { metrics: [], categoryCycleTimes: [], bottlenecks: [] },
      salesByMonth: salesByMonthResult.status === 'fulfilled' ? salesByMonthResult.value : [],
      // null for everyone except admins — the frontend only renders the
      // profit cards when this key is present (defense in depth on top of
      // the frontend's own role check).
      profit: profitResult.status === 'fulfilled' ? profitResult.value : null,
      // Same owner-only gating as profit — null for everyone else.
      cashflow: cashflowResult.status === 'fulfilled' ? cashflowResult.value : null,
      // Same owner-only gating — "things only the super-admin/owner can do".
      superAdminTasks: superAdminTasksResult.status === 'fulfilled' ? superAdminTasksResult.value : null,
      // Visible to everyone — see getComplaintsOverview below.
      complaintsOverview: complaintsOverviewResult.status === 'fulfilled'
        ? complaintsOverviewResult.value
        : { openCount: 0, overdueCount: 0, escalatedCount: 0, byPriority: { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 }, recent: [] },
    };
  }

  // ── Complaints Overview — unlike the complaints group inside
  // getSuperAdminTasks (owner-only, full 50-item list), this is a lighter
  // summary meant for every role on the dashboard: open/overdue/escalated
  // counts, a priority breakdown, and the top 5 most urgent tickets. ───────
  async getComplaintsOverview(): Promise<ComplaintsOverview> {
    const now = new Date();
    const openWhere = { status: { notIn: ['RESOLVED', 'CLOSED'] } };
    const [openCount, overdueCount, escalatedCount, byPriorityRaw, recent] = await Promise.all([
      (this.prisma as any).complaint.count({ where: openWhere }),
      (this.prisma as any).complaint.count({ where: { ...openWhere, slaResolutionDueAt: { lt: now } } }),
      (this.prisma as any).complaint.count({ where: { ...openWhere, escalatedToAdmin: true } }),
      (this.prisma as any).complaint.groupBy({ by: ['priority'], where: openWhere, _count: true }),
      (this.prisma as any).complaint.findMany({
        where: openWhere,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 5,
        include: { customer: { select: { businessName: true } } },
      }),
    ]);

    const byPriority = { LOW: 0, MEDIUM: 0, HIGH: 0, URGENT: 0 };
    for (const row of byPriorityRaw as any[]) {
      if (row.priority in byPriority) byPriority[row.priority as keyof typeof byPriority] = Number(row._count);
    }

    return {
      openCount,
      overdueCount,
      escalatedCount,
      byPriority,
      recent: recent.map((c: any) => {
        const overdue = c.slaResolutionDueAt && new Date(c.slaResolutionDueAt) < now;
        const flags = [c.priority, overdue ? 'OVERDUE' : null].filter(Boolean);
        return {
          id: c.id,
          title: `${c.ticketNumber} — ${c.customer?.businessName ?? 'Unknown customer'}`,
          subtitle: `${flags.join(' · ')} — ${c.subject}`,
          amount: null,
          link: `/complaints/${c.id}`,
          createdAt: c.createdAt.toISOString(),
        };
      }),
    };
  }

  // ── Super Admin Tasks — a growing list of "only Sanket/owner can act on
  // this" items surfaced on the dashboard: order approvals blocked below the
  // 40%-advance / missing-cost-data rules (see AccountsService.approveOrder),
  // payment entries waiting on his final recheck, unverified commission
  // sheets, and open complaints. Each group is independent and the frontend
  // renders whatever comes back generically — add a new group to the array
  // below (and write one private helper for it) as new super-admin-gated
  // workflows ship. Nothing else needs to change. ───────────────────────────
  async getSuperAdminTasks() {
    const [orderApprovals, paymentVerification, commissionVerification, complaints] = await Promise.all([
      this.getOrdersNeedingSuperAdminApproval(),
      this.getPaymentEntriesAwaitingVerification(),
      this.getCommissionSheetsAwaitingVerification(),
      this.getComplaintsNeedingAttention(),
    ]);

    const groups = [
      {
        key: 'order_approvals',
        label: 'Order Approvals — Below 40% Advance / Cost Missing',
        description: "Orders a regular Accounts user can't approve — only the super-admin can approve these (or an override reason).",
        status: 'active' as const,
        count: orderApprovals.length,
        link: '/accounts?tab=pending',
        items: orderApprovals,
      },
      {
        key: 'payment_verification',
        label: 'Payment Entries Awaiting Final Verification',
        description: "Checked by Accounts, waiting on the super-admin's recheck before moving to Payment History.",
        status: 'active' as const,
        count: paymentVerification.count,
        link: '/accounts?tab=payment_verification',
        items: paymentVerification.items,
      },
      {
        key: 'commission_verification',
        label: 'Commission Sheets Awaiting Verification',
        description: `Sales agents with orders in ${commissionVerification.monthLabel} whose commission sheet hasn't been verified yet.`,
        status: 'active' as const,
        count: commissionVerification.items.length,
        link: '/accounts?tab=commission',
        items: commissionVerification.items,
      },
      {
        key: 'bonus_points_approval',
        label: 'Bonus Points Approval',
        description: 'Planned: an approval step before staff reward-coin payouts post. Not built yet — placeholder so it shows up here once it ships.',
        status: 'coming_soon' as const,
        count: 0,
        link: null,
        items: [] as SuperAdminTaskItem[],
      },
      {
        key: 'complaints',
        label: 'Complaints Needing Attention',
        description: 'Open complaints — unresolved, overdue, or escalated to admin.',
        status: 'active' as const,
        count: complaints.count,
        link: '/complaints',
        items: complaints.items,
      },
      // ── Add new super-admin-only task groups here as the ERP grows. Shape:
      // { key, label, description, status: 'active' | 'coming_soon', count, link: string | null, items: SuperAdminTaskItem[] }
    ];

    return {
      generatedAt: new Date().toISOString(),
      totalPending: groups.filter((g) => g.status === 'active').reduce((sum, g) => sum + g.count, 0),
      groups,
    };
  }

  // Same conditions AccountsService.approveOrder blocks a non-super-admin on:
  // advance below 40% of grand total, or a billable item with no cost slab.
  private async getOrdersNeedingSuperAdminApproval(): Promise<SuperAdminTaskItem[]> {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_APPROVAL },
      include: {
        customer: { select: { businessName: true } },
        items: true,
        payments: true,
      },
      orderBy: { orderDate: 'asc' },
    });
    if (orders.length === 0) return [];

    const productIds = Array.from(
      new Set(orders.flatMap((o) => o.items.filter((i) => !(i as any).offerCodeId).map((i) => i.productId))),
    );
    const costSlabs = productIds.length
      ? await this.prisma.productCostSlab.findMany({ where: { productId: { in: productIds } } })
      : [];
    const productsWithCost = new Set(costSlabs.map((s) => s.productId));

    const results: SuperAdminTaskItem[] = [];
    for (const order of orders) {
      const billableItems = order.items.filter((i) => !(i as any).offerCodeId);
      const missingCostItems = billableItems.filter((i) => !productsWithCost.has(i.productId));

      const totalVerifiedPaid = order.payments
        .filter((p) => p.verificationStatus === 'VERIFIED')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const grandTotal = Number(order.grandTotal);
      const advancePct = grandTotal > 0 ? (totalVerifiedPaid / grandTotal) * 100 : 100;

      const reasons: string[] = [];
      if (advancePct < 40) reasons.push(`Only ${advancePct.toFixed(1)}% advance received`);
      if (missingCostItems.length > 0) reasons.push(`Cost data missing for ${missingCostItems.length} item(s)`);
      if (reasons.length === 0) continue;

      results.push({
        id: order.id,
        title: `${order.orderNumber} — ${order.customer.businessName}`,
        subtitle: reasons.join(' · '),
        amount: grandTotal,
        link: '/accounts?tab=pending',
        createdAt: order.orderDate.toISOString(),
      });
    }
    return results;
  }

  // Mirrors AccountsService.getPaymentVerificationQueue, narrowed to entries
  // an accountant has already "Checked" — those are the ones actually
  // sitting waiting on Sanket's recheck (see AccountsService.recheckPaymentVerification).
  private async getPaymentEntriesAwaitingVerification(): Promise<{ count: number; items: SuperAdminTaskItem[] }> {
    const statuses: BankReconcileStatus[] = [
      BankReconcileStatus.MATCHED_PAYMENT,
      BankReconcileStatus.MATCHED_VENDOR,
      BankReconcileStatus.MATCHED_EXPENSE,
      BankReconcileStatus.MATCHED_COMMISSION,
      BankReconcileStatus.MANUAL_REVIEW,
    ];
    const where = {
      crDr: 'DR' as const,
      reconcileStatus: { in: statuses },
      checkedAt: { not: null },
      recheckedAt: null,
    };
    const [count, txns] = await Promise.all([
      this.prisma.bankTransaction.count({ where: where as any }),
      this.prisma.bankTransaction.findMany({
        where: where as any,
        include: { checkedBy: { select: { fullName: true } } },
        orderBy: [{ txnDate: 'desc' }],
        take: 50,
      }),
    ]);
    return {
      count,
      items: (txns as any[]).map((t) => ({
        id: t.id,
        title: `₹${Number(t.amount).toLocaleString('en-IN')} — ${(t.description ?? 'Bank entry').slice(0, 60)}`,
        subtitle: `Checked by ${t.checkedBy?.fullName ?? '—'} on ${new Date(t.checkedAt).toLocaleDateString('en-IN')}`,
        amount: Number(t.amount),
        link: '/accounts?tab=payment_verification',
        createdAt: (t.checkedAt ?? t.txnDate).toISOString(),
      })),
    };
  }

  // Previous fully-closed calendar month only — the month sales agents'
  // sheets are actually expected to be verified for. See CostTableService.verifyCommission.
  private async getCommissionSheetsAwaitingVerification(): Promise<{ monthLabel: string; items: SuperAdminTaskItem[] }> {
    const b = this.istBoundaries();
    const from = b.startOfLastMonth;
    const to = b.startOfMonth;
    const year = b.istMonth === 0 ? b.istYear - 1 : b.istYear;
    const month = b.istMonth === 0 ? 12 : b.istMonth; // 1-indexed, matches CommissionVerification.month
    const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const orders = await this.prisma.order.findMany({
      where: {
        orderDate: { gte: from, lt: to },
        status: { not: OrderStatus.CANCELLED },
        salesAgentId: { not: null },
        isSample: false,
      },
      select: { salesAgentId: true, salesAgent: { select: { id: true, fullName: true } } },
    });
    const agentMap = new Map<string, string>();
    for (const o of orders) {
      if (o.salesAgentId && o.salesAgent) agentMap.set(o.salesAgentId, o.salesAgent.fullName);
    }
    if (agentMap.size === 0) return { monthLabel, items: [] };

    const verifications = await (this.prisma as any).commissionVerification.findMany({
      where: { agentId: { in: Array.from(agentMap.keys()) }, year, month },
      select: { agentId: true },
    });
    const verifiedSet = new Set(verifications.map((v: any) => v.agentId));

    const items: SuperAdminTaskItem[] = Array.from(agentMap.entries())
      .filter(([agentId]) => !verifiedSet.has(agentId))
      .map(([agentId, name]) => ({
        id: `${agentId}_${year}-${month}`,
        title: `${name} — ${monthLabel}`,
        subtitle: 'Commission sheet not yet verified',
        amount: null,
        link: '/accounts?tab=commission',
        createdAt: to.toISOString(),
      }));
    return { monthLabel, items };
  }

  // Open complaints (not RESOLVED/CLOSED) — highest priority first. See
  // ComplaintsService for the full workflow; this is just a dashboard surface.
  private async getComplaintsNeedingAttention(): Promise<{ count: number; items: SuperAdminTaskItem[] }> {
    const now = new Date();
    const where = { status: { notIn: ['RESOLVED', 'CLOSED'] } };
    const [count, complaints] = await Promise.all([
      (this.prisma as any).complaint.count({ where }),
      (this.prisma as any).complaint.findMany({
        where,
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 50,
        include: { customer: { select: { businessName: true } } },
      }),
    ]);
    return {
      count,
      items: complaints.map((c: any) => {
        const overdue = c.slaResolutionDueAt && new Date(c.slaResolutionDueAt) < now;
        const flags = [c.priority, c.status, overdue ? 'OVERDUE' : null, c.escalatedToAdmin ? 'ESCALATED' : null].filter(Boolean);
        return {
          id: c.id,
          title: `${c.ticketNumber} — ${c.customer?.businessName ?? 'Unknown customer'}`,
          subtitle: `${flags.join(' · ')} — ${c.subject}`,
          amount: null,
          link: `/complaints/${c.id}`,
          createdAt: c.createdAt.toISOString(),
        };
      }),
    };
  }

  // ── Sales totals for the last N calendar months (bar-chart friendly) ─────
  async getSalesByMonth(monthsBack = 6) {
    const b = this.istBoundaries();
    const from = new Date(Date.UTC(b.istYear, b.istMonth - (monthsBack - 1), 1) - b.istOffsetMs);

    const orders = await this.prisma.order.findMany({
      where: { orderDate: { gte: from }, status: { not: OrderStatus.CANCELLED } },
      select: { orderDate: true, grandTotal: true },
    });

    const byKey: Record<string, number> = {};
    for (const o of orders) {
      const istDate = new Date(o.orderDate.getTime() + b.istOffsetMs);
      const key = `${istDate.getUTCFullYear()}-${istDate.getUTCMonth()}`;
      byKey[key] = (byKey[key] ?? 0) + Number(o.grandTotal);
    }

    return Array.from({ length: monthsBack }, (_, i) => {
      const offset = monthsBack - 1 - i;
      const year = b.istYear;
      const month = b.istMonth - offset;
      const d = new Date(Date.UTC(year, month, 1));
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
      return {
        month: d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        total: byKey[key] ?? 0,
      };
    });
  }

  // ── IST day/month boundaries shared by profit + monthly-sales helpers ────
  private istBoundaries() {
    const now = new Date();
    const istOffsetMs = 330 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const istYear = istNow.getUTCFullYear();
    const istMonth = istNow.getUTCMonth();
    const istDate = istNow.getUTCDate();
    const fromIstStart = (year: number, month: number, day: number) =>
      new Date(Date.UTC(year, month, day) - istOffsetMs);
    return {
      istOffsetMs, istYear, istMonth, istDate,
      startOfToday: fromIstStart(istYear, istMonth, istDate),
      startOfTomorrow: fromIstStart(istYear, istMonth, istDate + 1),
      startOfMonth: fromIstStart(istYear, istMonth, 1),
      startOfNextMonth: fromIstStart(istYear, istMonth + 1, 1),
      startOfLastMonth: fromIstStart(istYear, istMonth - 1, 1),
    };
  }

  // ── Cashflow (owner-only) — cash IN vs cash OUT for this calendar month
  // vs last month, plus the rupee delta between the two months' net.
  //
  // Two sources are combined:
  //  1. Bank Statement (BankTransaction CR/DR, all accounts combined) —
  //     covers anything that actually moved through a bank account: NEFT/
  //     IMPS/UPI-to-bank, cheque clearing, card settlement, etc.
  //  2. Cash-mode receipts/payouts that never touch a bank account — customer
  //     Payments and VendorPayments recorded with method === 'CASH'. These
  //     are real money in/out of the till but would otherwise be invisible
  //     here since they never appear in an imported bank statement.
  // Payments/VendorPayments made via BANK_TRANSFER/UPI/CARD/CHEQUE are
  // intentionally excluded from (2) — that money already shows up in (1)
  // once the bank statement is imported, so counting it again would
  // double-count it.
  async getCashflow() {
    const b = this.istBoundaries();

    const bankFor = async (from: Date, to: Date) => {
      const rows = await this.prisma.bankTransaction.groupBy({
        by: ['crDr'],
        where: { txnDate: { gte: from, lt: to } },
        _sum: { amount: true },
      });
      return {
        credits: Number(rows.find(r => r.crDr === 'CR')?._sum.amount ?? 0),
        debits: Number(rows.find(r => r.crDr === 'DR')?._sum.amount ?? 0),
      };
    };

    // Customer receipts collected in cash (never deposited/matched to a bank
    // transaction). Excludes REJECTED so a bounced/voided cash entry doesn't
    // count as real cash in hand.
    const cashReceiptsFor = async (from: Date, to: Date) => {
      const result = await this.prisma.payment.aggregate({
        where: {
          paymentDate: { gte: from, lt: to },
          method: 'CASH',
          verificationStatus: { not: 'REJECTED' },
        },
        _sum: { amount: true },
      });
      return Number(result._sum.amount ?? 0);
    };

    // Vendor/expense payouts made in cash.
    const cashPaidOutFor = async (from: Date, to: Date) => {
      const result = await this.prisma.vendorPayment.aggregate({
        where: { paymentDate: { gte: from, lt: to }, method: 'CASH' },
        _sum: { amount: true },
      });
      return Number(result._sum.amount ?? 0);
    };

    const periodFor = async (from: Date, to: Date) => {
      const [bank, cashModeIn, cashModeOut] = await Promise.all([
        bankFor(from, to),
        cashReceiptsFor(from, to),
        cashPaidOutFor(from, to),
      ]);
      const cashIn = bank.credits + cashModeIn;
      const cashOut = bank.debits + cashModeOut;
      return {
        cashIn: Number(cashIn.toFixed(2)),
        cashOut: Number(cashOut.toFixed(2)),
        net: Number((cashIn - cashOut).toFixed(2)),
        // Breakdown, in case the UI wants to show bank vs. till separately.
        bankCashIn: Number(bank.credits.toFixed(2)),
        bankCashOut: Number(bank.debits.toFixed(2)),
        cashModeIn: Number(cashModeIn.toFixed(2)),
        cashModeOut: Number(cashModeOut.toFixed(2)),
      };
    };

    const [thisMonth, lastMonth] = await Promise.all([
      periodFor(b.startOfMonth, b.startOfNextMonth),
      periodFor(b.startOfLastMonth, b.startOfMonth),
    ]);

    return {
      thisMonth,
      lastMonth,
      deltaVsLastMonth: Number((thisMonth.net - lastMonth.net).toFixed(2)),
    };
  }

  // ── Profit KPIs (admin-only) — each period returns both gross profit
  // (sale - material cost) and net profit (gross - sales commission) ───────
  async getProfitKpis() {
    const b = this.istBoundaries();
    const [today, thisMonth, lastMonth] = await Promise.all([
      this.costTable.getProfitBreakdownForRange(b.startOfToday, b.startOfTomorrow),
      this.costTable.getProfitBreakdownForRange(b.startOfMonth, b.startOfNextMonth),
      this.costTable.getProfitBreakdownForRange(b.startOfLastMonth, b.startOfMonth),
    ]);
    return { today, thisMonth, lastMonth };
  }

  // ── Monthly sales comparison — daily series for this month vs last month ─
  async getMonthlySalesComparison() {
    const b = this.istBoundaries();
    const [thisMonthOrders, lastMonthOrders] = await Promise.all([
      this.prisma.order.findMany({
        where: { orderDate: { gte: b.startOfMonth, lt: b.startOfNextMonth }, status: { not: OrderStatus.CANCELLED } },
        select: { orderDate: true, grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { orderDate: { gte: b.startOfLastMonth, lt: b.startOfMonth }, status: { not: OrderStatus.CANCELLED } },
        select: { orderDate: true, grandTotal: true },
      }),
    ]);

    const byDay = (orders: { orderDate: Date; grandTotal: unknown }[]) => {
      const map: Record<number, number> = {};
      for (const o of orders) {
        const istDate = new Date(o.orderDate.getTime() + b.istOffsetMs);
        const day = istDate.getUTCDate();
        map[day] = (map[day] ?? 0) + Number(o.grandTotal);
      }
      return map;
    };

    const thisMonthMap = byDay(thisMonthOrders);
    const lastMonthMap = byDay(lastMonthOrders);

    const daysInThisMonth = new Date(Date.UTC(b.istYear, b.istMonth + 1, 0)).getUTCDate();
    const daysInLastMonth = new Date(Date.UTC(b.istYear, b.istMonth, 0)).getUTCDate();
    const maxDays = Math.max(daysInThisMonth, daysInLastMonth);

    return Array.from({ length: maxDays }, (_, i) => {
      const day = i + 1;
      return {
        day,
        thisMonth: day <= daysInThisMonth ? (thisMonthMap[day] ?? 0) : null,
        lastMonth: day <= daysInLastMonth ? (lastMonthMap[day] ?? 0) : null,
      };
    });
  }

  private getEmptyProductionKpis() {
    return { metrics: [], categoryCycleTimes: [], bottlenecks: [] };
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(fallback), timeoutMs);
      promise
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch((err) => {
          clearTimeout(timer);
          console.error('[withTimeout] caught error:', err?.message ?? err);
          resolve(fallback);
        });
    });
  }

  private getEmptyStats() {
    const last7Days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - index));
      return {
        date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        count: 0,
        revenue: 0,
      };
    });

    return {
      revenue: {
        today: 0,
        thisMonth: 0,
        lastMonth: 0,
        growth: 0,
        averagePerDay: 0,
        monthlyRunRate: 0,
        daysElapsed: new Date().getDate(),
        daysInMonth: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate(),
      },
      orders: { total: 0, thisMonth: 0, byStatus: {}, last7Days },
      finance: { totalOrderValue: 0, totalPaid: 0, totalOutstanding: 0 },
      pending: { approval: 0, dispatchApproval: 0, inProduction: 0, readyForDispatch: 0 },
      recentOrders: [],
    };
  }

  async getStats() {
    const now = new Date();
    const istOffsetMs = 330 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const istYear = istNow.getUTCFullYear();
    const istMonth = istNow.getUTCMonth();
    const istDate = istNow.getUTCDate();
    const daysInMonth = new Date(Date.UTC(istYear, istMonth + 1, 0)).getUTCDate();
    const daysElapsed = istDate;
    const fromIstStart = (year: number, month: number, day: number) =>
      new Date(Date.UTC(year, month, day) - istOffsetMs);

    const startOfToday = fromIstStart(istYear, istMonth, istDate);
    const startOfTomorrow = fromIstStart(istYear, istMonth, istDate + 1);
    const startOfMonth = fromIstStart(istYear, istMonth, 1);
    const startOfNextMonth = fromIstStart(istYear, istMonth + 1, 1);
    const startOfLastMonth = fromIstStart(istYear, istMonth - 1, 1);
    const endOfLastMonth = startOfMonth;

    const [
      allOrderAgg,
      thisMonthOrderCount,
      todayOrderAgg,
      thisMonthOrderAgg,
      lastMonthOrderAgg,
      allPaymentAgg,
      statusCounts,
      last7DaysOrders,
      recentOrders,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: { status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.count({
        where: { orderDate: { gte: startOfMonth, lt: startOfNextMonth }, status: { not: OrderStatus.CANCELLED } },
      }),
      this.prisma.order.aggregate({
        where: { orderDate: { gte: startOfToday, lt: startOfTomorrow }, status: { not: OrderStatus.CANCELLED } },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: { orderDate: { gte: startOfMonth, lt: startOfNextMonth }, status: { not: OrderStatus.CANCELLED } },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.aggregate({
        where: { orderDate: { gte: startOfLastMonth, lt: endOfLastMonth }, status: { not: OrderStatus.CANCELLED } },
        _sum: { grandTotal: true },
      }),
      this.prisma.payment.aggregate({ _sum: { amount: true } }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true },
      }),
      this.prisma.order.findMany({
        where: { orderDate: { gte: new Date(now.getTime() - 7 * 86400000) }, status: { not: OrderStatus.CANCELLED } },
        orderBy: { orderDate: 'asc' },
        select: { orderDate: true, grandTotal: true },
      }),
      this.prisma.order.findMany({
        where: { status: { not: OrderStatus.CANCELLED } },
        orderBy: { orderDate: 'desc' }, take: 10,
        select: { id: true, orderNumber: true, status: true, grandTotal: true, orderDate: true },
      }),
    ]);

    const todayValue = Number(todayOrderAgg._sum.grandTotal ?? 0);
    const thisMonthSale = Number(thisMonthOrderAgg._sum.grandTotal ?? 0);
    const lastMonthRevenue = Number(lastMonthOrderAgg._sum.grandTotal ?? 0);
    const averagePerDay = daysElapsed > 0 ? thisMonthSale / daysElapsed : 0;
    const monthlyRunRate = averagePerDay * daysInMonth;
    const growth = lastMonthRevenue > 0 ? Math.round(((thisMonthSale - lastMonthRevenue) / lastMonthRevenue) * 100) : 0;

    const totalOrderValue = Number(allOrderAgg._sum.grandTotal ?? 0);
    const totalPaid       = Number(allPaymentAgg._sum.amount ?? 0);

    const byStatus: Record<string, number> = {};
    for (const row of statusCounts) byStatus[row.status] = row._count._all;

    // Last 7 days by date
   const dayMap: Record<string, { count: number; revenue: number }> = {};
for (let i = 6; i >= 0; i--) {
  const d = new Date(now.getTime() - i * 86400000);
  dayMap[d.toISOString().slice(0, 10)] = { count: 0, revenue: 0 };
}
for (const o of last7DaysOrders) {
  const key = o.orderDate.toISOString().slice(0, 10);
  if (key in dayMap) { dayMap[key].count++; dayMap[key].revenue += Number(o.grandTotal); }
}
const last7Days = Object.entries(dayMap).map(([date, val]) => ({
  date: new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
  count: val.count,
  revenue: val.revenue,
}));

    return {
      revenue: { today: todayValue, thisMonth: thisMonthSale, lastMonth: lastMonthRevenue, growth, averagePerDay, monthlyRunRate, daysElapsed, daysInMonth },
      orders: {
        total: allOrderAgg._count._all,
        thisMonth: thisMonthOrderCount,
        byStatus,
        last7Days,
      },
      finance: { totalOrderValue, totalPaid, totalOutstanding: Math.max(0, totalOrderValue - totalPaid) },
      pending: {
        approval:        byStatus[OrderStatus.PENDING_APPROVAL] ?? 0,
        dispatchApproval: byStatus[OrderStatus.PENDING_DISPATCH_APPROVAL] ?? 0,
        inProduction:    byStatus[OrderStatus.IN_PRODUCTION] ?? 0,
        readyForDispatch: byStatus[OrderStatus.READY_FOR_DISPATCH] ?? 0,
      },
      recentOrders: recentOrders.map(o => ({
        id: o.id,
        orderNo: o.orderNumber,
        status: o.status,
        total: Number(o.grandTotal),
        date: o.orderDate.toISOString(),
      })),
    };
  }

  // ── Agent leaderboard ────────────────────────────────────────────────────
  async getAgentLeaderboard() {
    const now = new Date();
    const istOffsetMs = 330 * 60 * 1000;
    const istNow = new Date(now.getTime() + istOffsetMs);
    const startOfMonth = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1) - istOffsetMs);
    const startOfNextMonth = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 1) - istOffsetMs);

    const [allTimeGroups, monthGroups, allAgents] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['salesAgentId'],
        where: { salesAgentId: { not: null }, status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.groupBy({
        by: ['salesAgentId'],
        where: { salesAgentId: { not: null }, status: { not: OrderStatus.CANCELLED }, orderDate: { gte: startOfMonth, lt: startOfNextMonth } },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, fullName: true, email: true, role: true },
      }),
    ]);

    const agentMap = Object.fromEntries(allAgents.map(a => [a.id, a]));
    const map: Record<string, any> = {};

    for (const row of allTimeGroups) {
      const id = row.salesAgentId!;
      const agent = agentMap[id];
      map[id] = { id, name: agent?.fullName ?? id, email: agent?.email ?? '', totalOrders: row._count._all, totalRevenue: Number(row._sum.grandTotal ?? 0), monthOrders: 0, monthRevenue: 0 };
    }
    for (const row of monthGroups) {
      const id = row.salesAgentId!;
      if (!map[id]) { const agent = agentMap[id]; map[id] = { id, name: agent?.fullName ?? id, email: agent?.email ?? '', totalOrders: 0, totalRevenue: 0, monthOrders: 0, monthRevenue: 0 }; }
      map[id].monthOrders = row._count._all;
      map[id].monthRevenue = Number(row._sum.grandTotal ?? 0);
    }
    for (const agent of allAgents) {
      if (!map[agent.id] && (agent.role === 'SALES_AGENT' || (agent.role as string) === 'AGENT')) {
        map[agent.id] = { id: agent.id, name: agent.fullName, email: agent.email, totalOrders: 0, monthOrders: 0, totalRevenue: 0, monthRevenue: 0 };
      }
    }
    return Object.values(map).sort((a: any, b: any) => b.monthRevenue - a.monthRevenue || b.totalRevenue - a.totalRevenue);
  }
  // ── Product category quantity by stage ──────────────────────────────────
  async getCategoryStageQuantities() {
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: {
          status: {
            in: [OrderStatus.APPROVED, OrderStatus.IN_PRODUCTION, OrderStatus.READY_FOR_DISPATCH],
          },
        },
        itemProductionStage: { not: OrderProductionStage.NOT_PRINTED },
      },
      include: {
        product: { include: { category: true } },
      },
    });

    const result: Record<string, Record<string, number>> = {};
    for (const item of items) {
      const cat   = item.product.category.name;
      const stage = item.itemProductionStage;
      if (!result[cat]) result[cat] = {};
      result[cat][stage] = (result[cat][stage] ?? 0) + item.quantity;
    }

    return Object.entries(result).map(([category, stages]) => ({
      category,
      printing:         stages[OrderProductionStage.PRINTING]           ?? 0,
      processing:       stages[OrderProductionStage.PROCESSING]         ?? 0,
      readyForDispatch: stages[OrderProductionStage.READY_FOR_DISPATCH] ?? 0,
    }));
  }

  // ── Average production time per category ────────────────────────────────
  async getAvgProductionTime() {
    // Items that completed (reached READY_FOR_DISPATCH) — measure from order approval to ready
    const items = await this.prisma.orderItem.findMany({
      where: { itemProductionStage: OrderProductionStage.READY_FOR_DISPATCH },
      include: {
        product: { include: { category: true } },
        stageLogs: { orderBy: { createdAt: 'asc' } },
        order: true,
      },
    });

    const catTimes: Record<string, number[]> = {};
    for (const item of items) {
      const startLog = item.stageLogs.find(l => l.toStage === OrderProductionStage.PRINTING);
      const endLog   = item.stageLogs.find(l => l.toStage === OrderProductionStage.READY_FOR_DISPATCH);
      if (!startLog || !endLog) continue;
      const hours = (endLog.createdAt.getTime() - startLog.createdAt.getTime()) / 3600000;
      const cat   = item.product.category.name;
      if (!catTimes[cat]) catTimes[cat] = [];
      catTimes[cat].push(hours);
    }

    return Object.entries(catTimes).map(([category, times]) => ({
      category,
      avgHours:  Math.round(times.reduce((s, t) => s + t, 0) / times.length),
      avgDays:   +(times.reduce((s, t) => s + t, 0) / times.length / 24).toFixed(1),
      sampleSize: times.length,
    }));
  }

  private hoursBetween(start?: Date | null, end?: Date | null) {
    if (!start || !end) return null;
    const hours = (end.getTime() - start.getTime()) / 3600000;
    return Number.isFinite(hours) && hours >= 0 ? hours : null;
  }

  private avg(values: (number | null)[]) {
    const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
    if (!clean.length) return null;
    return clean.reduce((sum, value) => sum + value, 0) / clean.length;
  }

  private metric(key: string, label: string, values: (number | null)[], note: string): ProductionKpiMetric {
    const clean = values.filter((value): value is number => value !== null && Number.isFinite(value));
    const avgHours = this.avg(clean);
    return {
      key,
      label,
      avgHours: avgHours === null ? null : +avgHours.toFixed(1),
      avgDays: avgHours === null ? null : +(avgHours / 24).toFixed(1),
      avgDaysMonth: null,
      avgDaysWeek: null,
      sampleSize: clean.length,
      note,
    };
  }

  private firstStatusLog<T extends { toStatus: OrderStatus; createdAt: Date }>(logs: T[], status: OrderStatus) {
    return logs.find((log) => log.toStatus === status)?.createdAt ?? null;
  }

  private firstMetadataLog<T extends { metadata: unknown; createdAt: Date }>(
    logs: T[],
    eventType: string,
    predicate?: (metadata: Record<string, unknown>) => boolean,
  ) {
    return logs.find((log) => {
      const metadata = log.metadata as Record<string, unknown> | null;
      return metadata?.eventType === eventType && (!predicate || predicate(metadata));
    })?.createdAt ?? null;
  }

  async getProductionKpis() {
    const now   = new Date();
    const since = new Date(now); since.setDate(now.getDate() - 120);
    const month = new Date(now); month.setDate(now.getDate() - 30);
    const week  = new Date(now); week.setDate(now.getDate() - 7);

    type TriRow  = { avg_all: string|number|null; avg_month: string|number|null; avg_week: string|number|null; cnt: string|number };
    type CatRow  = { category: string; avg_all: string|number|null; avg_month: string|number|null; avg_week: string|number|null; cnt: string|number };
    type CatARow = { production_category: string; avg_all: string|number|null; avg_month: string|number|null; avg_week: string|number|null; cnt: string|number };

    const n = (v: string|number|null|undefined): number|null =>
      v == null ? null : (Number.isFinite(Number(v)) ? +Number(v).toFixed(1) : null);
    const d = (h: number|null) => h != null ? +(h/24).toFixed(1) : null;
    const cnt = (v: string|number) => Number(v) || 0;

    const toData = (rows: TriRow[]) => ({
      avgHours:      n(rows[0]?.avg_all),
      avgDays:       d(n(rows[0]?.avg_all)),
      avgDaysMonth:  d(n(rows[0]?.avg_month)),
      avgDaysWeek:   d(n(rows[0]?.avg_week)),
      sampleSize:    cnt(rows[0]?.cnt ?? 0),
    });

    const mk = (key: string, label: string, data: ReturnType<typeof toData>, note: string): ProductionKpiMetric => ({
      key, label, note, ...data,
    });

    const [approvalR, receiptR, catAssignR, vendorR, sheetAssignR, readyBookR, inhousePrintR, sheetCPR, catTimeR] =
      await Promise.all([

        // 1. Order approval
        this.prisma.$queryRaw<TriRow[]>`
          SELECT
            AVG(EXTRACT(EPOCH FROM (a."createdAt" - COALESCE(p."createdAt", o."createdAt"))) / 3600)::float AS avg_all,
            AVG(CASE WHEN a."createdAt" >= ${month} THEN EXTRACT(EPOCH FROM (a."createdAt" - COALESCE(p."createdAt", o."createdAt"))) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN a."createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM (a."createdAt" - COALESCE(p."createdAt", o."createdAt"))) / 3600 END)::float AS avg_week,
            COUNT(a.id)::int AS cnt
          FROM "StatusLog" a
          JOIN "Order" o ON o.id = a."orderId"
          LEFT JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog" p2
            WHERE p2."orderId" = a."orderId" AND p2."toStatus"::text = 'PENDING_APPROVAL'
            ORDER BY "createdAt" ASC LIMIT 1
          ) p ON true
          WHERE a."toStatus"::text = 'APPROVED' AND a."createdAt" >= ${since}
        `,

        // 2. Receipt verification
        this.prisma.$queryRaw<TriRow[]>`
          SELECT
            AVG(EXTRACT(EPOCH FROM ("verifiedAt" - "createdAt")) / 3600)::float AS avg_all,
            AVG(CASE WHEN "createdAt" >= ${month} THEN EXTRACT(EPOCH FROM ("verifiedAt" - "createdAt")) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN "createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM ("verifiedAt" - "createdAt")) / 3600 END)::float AS avg_week,
            COUNT(id)::int AS cnt
          FROM "Payment"
          WHERE "verificationStatus" = 'VERIFIED' AND "verifiedAt" IS NOT NULL AND "createdAt" >= ${since}
        `,

        // 3. Category assignment
        this.prisma.$queryRaw<CatARow[]>`
          SELECT
            oi."productionCategory"::text AS production_category,
            AVG(EXTRACT(EPOCH FROM (oi."updatedAt" - a."createdAt")) / 3600)::float AS avg_all,
            AVG(CASE WHEN a."createdAt" >= ${month} THEN EXTRACT(EPOCH FROM (oi."updatedAt" - a."createdAt")) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN a."createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM (oi."updatedAt" - a."createdAt")) / 3600 END)::float AS avg_week,
            COUNT(oi.id)::int AS cnt
          FROM "OrderItem" oi
          JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog"
            WHERE "orderId" = oi."orderId" AND "toStatus"::text = 'APPROVED'
            ORDER BY "createdAt" ASC LIMIT 1
          ) a ON true
          WHERE oi."productionCategory"::text IN ('INHOUSE','CLUBBING','SHEET_PRODUCTION')
            AND oi."updatedAt" > a."createdAt" AND a."createdAt" >= ${since}
          GROUP BY oi."productionCategory"
        `,

        // 4. Vendor assignment
        this.prisma.$queryRaw<TriRow[]>`
          SELECT
            AVG(EXTRACT(EPOCH FROM (jw."createdAt" - a."createdAt")) / 3600)::float AS avg_all,
            AVG(CASE WHEN a."createdAt" >= ${month} THEN EXTRACT(EPOCH FROM (jw."createdAt" - a."createdAt")) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN a."createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM (jw."createdAt" - a."createdAt")) / 3600 END)::float AS avg_week,
            COUNT(jw.id)::int AS cnt
          FROM "JobWork" jw
          JOIN "OrderItem" oi ON oi.id = jw."orderItemId"
          JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog"
            WHERE "orderId" = oi."orderId" AND "toStatus"::text = 'APPROVED'
            ORDER BY "createdAt" ASC LIMIT 1
          ) a ON true
          WHERE jw."createdAt" >= ${since}
        `,

        // 5. Sheet assignment
        this.prisma.$queryRaw<TriRow[]>`
          SELECT
            AVG(EXTRACT(EPOCH FROM (psi."createdAt" - a."createdAt")) / 3600)::float AS avg_all,
            AVG(CASE WHEN a."createdAt" >= ${month} THEN EXTRACT(EPOCH FROM (psi."createdAt" - a."createdAt")) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN a."createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM (psi."createdAt" - a."createdAt")) / 3600 END)::float AS avg_week,
            COUNT(psi.id)::int AS cnt
          FROM "PrintSheetItem" psi
          JOIN "OrderItem" oi ON oi.id = psi."orderItemId"
          JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog"
            WHERE "orderId" = oi."orderId" AND "toStatus"::text = 'APPROVED'
            ORDER BY "createdAt" ASC LIMIT 1
          ) a ON true
          WHERE psi."createdAt" >= ${since}
        `,

        // 6. Ready to booking
        this.prisma.$queryRaw<TriRow[]>`
          SELECT
            AVG(EXTRACT(EPOCH FROM (fs."createdAt" - r."createdAt")) / 3600)::float AS avg_all,
            AVG(CASE WHEN r."createdAt" >= ${month} THEN EXTRACT(EPOCH FROM (fs."createdAt" - r."createdAt")) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN r."createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM (fs."createdAt" - r."createdAt")) / 3600 END)::float AS avg_week,
            COUNT(r.id)::int AS cnt
          FROM "StatusLog" r
          JOIN LATERAL (
            SELECT MIN("createdAt") AS "createdAt" FROM "Shipment" WHERE "orderId" = r."orderId"
          ) fs ON fs."createdAt" > r."createdAt"
          WHERE r."toStatus"::text = 'READY_FOR_DISPATCH' AND r."createdAt" >= ${since}
        `,

        // 7. Inhouse printing start
        this.prisma.$queryRaw<TriRow[]>`
          SELECT
            AVG(EXTRACT(EPOCH FROM (sl."createdAt" - a."createdAt")) / 3600)::float AS avg_all,
            AVG(CASE WHEN sl."createdAt" >= ${month} THEN EXTRACT(EPOCH FROM (sl."createdAt" - a."createdAt")) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN sl."createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM (sl."createdAt" - a."createdAt")) / 3600 END)::float AS avg_week,
            COUNT(sl.id)::int AS cnt
          FROM "StatusLog" sl
          JOIN LATERAL (
            SELECT "createdAt" FROM "StatusLog"
            WHERE "orderId" = sl."orderId" AND "toStatus"::text = 'APPROVED'
            ORDER BY "createdAt" ASC LIMIT 1
          ) a ON true
          WHERE sl.metadata->>'eventType' = 'ITEM_STAGE_CHANGED'
            AND sl.metadata->>'itemStage' = 'PRINTING'
            AND sl."createdAt" >= ${since}
        `,

        // 8. Sheet complete → printing
        this.prisma.$queryRaw<TriRow[]>`
          WITH sheet_complete AS (
            SELECT metadata->>'sheetId' AS sheet_id, MIN("createdAt") AS completed_at
            FROM "StatusLog"
            WHERE metadata->>'eventType' = 'SHEET_STATUS_CHANGED'
              AND metadata->>'sheetStatus' = 'COMPLETE' AND "createdAt" >= ${since}
            GROUP BY metadata->>'sheetId'
          )
          SELECT
            AVG(EXTRACT(EPOCH FROM (sl."createdAt" - sc.completed_at)) / 3600)::float AS avg_all,
            AVG(CASE WHEN sl."createdAt" >= ${month} THEN EXTRACT(EPOCH FROM (sl."createdAt" - sc.completed_at)) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN sl."createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM (sl."createdAt" - sc.completed_at)) / 3600 END)::float AS avg_week,
            COUNT(sl.id)::int AS cnt
          FROM "StatusLog" sl
          JOIN sheet_complete sc ON sc.sheet_id = sl.metadata->>'sheetId'
          WHERE sl.metadata->>'eventType' = 'SHEET_STATUS_CHANGED'
            AND sl.metadata->>'sheetStatus' = 'PRINTING'
            AND sl."createdAt" >= ${since} AND sl."createdAt" > sc.completed_at
        `,

        // 9. Category cycle times (all periods)
        this.prisma.$queryRaw<CatRow[]>`
          SELECT
            cat.name AS category,
            AVG(EXTRACT(EPOCH FROM (r."createdAt" - o."orderDate")) / 3600)::float AS avg_all,
            AVG(CASE WHEN r."createdAt" >= ${month} THEN EXTRACT(EPOCH FROM (r."createdAt" - o."orderDate")) / 3600 END)::float AS avg_month,
            AVG(CASE WHEN r."createdAt" >= ${week}  THEN EXTRACT(EPOCH FROM (r."createdAt" - o."orderDate")) / 3600 END)::float AS avg_week,
            COUNT(DISTINCT o.id)::int AS cnt
          FROM "StatusLog" r
          JOIN "Order" o ON o.id = r."orderId"
          JOIN "OrderItem" oi ON oi."orderId" = o.id
          JOIN "Product" p ON p.id = oi."productId"
          JOIN "ProductCategory" cat ON cat.id = p."categoryId"
          WHERE r."toStatus"::text = 'READY_FOR_DISPATCH' AND r."createdAt" >= ${since}
          GROUP BY cat.name
          ORDER BY avg_all ASC NULLS LAST
        `,
      ]);

    const catAssign = (cat: string) => {
      const row = catAssignR.find(r => r.production_category === cat);
      if (!row) return { avgHours: null as number|null, avgDays: null as number|null, avgDaysMonth: null as number|null, avgDaysWeek: null as number|null, sampleSize: 0 };
      return { avgHours: n(row.avg_all), avgDays: d(n(row.avg_all)), avgDaysMonth: d(n(row.avg_month)), avgDaysWeek: d(n(row.avg_week)), sampleSize: cnt(row.cnt) };
    };

    const metrics: ProductionKpiMetric[] = [
      mk('order_approval',            'Order Approval',            toData(approvalR),    'Order created to accounts approval'),
      mk('receipt_verification',      'Receipt Verification',      toData(receiptR),     'Payment receipt upload to accounts verification'),
      mk('assign_inhouse',            'Assign Inhouse Dept.',      catAssign('INHOUSE'), 'Accounts approval to inhouse category assignment'),
      mk('assign_clubbing',           'Assign Clubbing Dept.',     catAssign('CLUBBING'),'Accounts approval to clubbing category assignment'),
      mk('assign_sheet',              'Assign Sheet Dept.',        catAssign('SHEET_PRODUCTION'),'Accounts approval to sheet production assignment'),
      mk('vendor_assignment',         'Vendor Assignment',         toData(vendorR),      'Production/sheet assignment to vendor selection'),
      mk('inhouse_print_start',       'Inhouse Printing Start',    toData(inhousePrintR),'Accounts approval to first inhouse printing signal'),
      mk('sheet_assignment',          'Sheet Assignment',          toData(sheetAssignR), 'Accounts approval to placing product on sheet'),
      mk('sheet_complete_to_printing','Sheet Complete to Printing',toData(sheetCPR),     'Sheet COMPLETE status to PRINTING status'),
      mk('ready_to_booking',          'Ready to Dispatch Booking', toData(readyBookR),   'Ready-for-dispatch to shipment booking'),
    ];

    const categoryRows = catTimeR.map(row => ({
      category:     row.category,
      avgHours:     n(row.avg_all),
      avgDays:      d(n(row.avg_all)),
      avgDaysMonth: d(n(row.avg_month)),
      avgDaysWeek:  d(n(row.avg_week)),
      sampleSize:   cnt(row.cnt),
    }));

    return {
      metrics,
      categoryCycleTimes: categoryRows,
      bottlenecks: [...metrics].filter(m => m.avgHours !== null).sort((a, b) => (b.avgHours ?? 0) - (a.avgHours ?? 0)).slice(0, 5),
    };
  }

  // ── Lead source analytics ────────────────────────────────────────────────
  async getLeadSourceAnalytics() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [allTimeGroups, monthGroups] = await Promise.all([
      this.prisma.order.groupBy({
        by: ['leadSource'],
        where: { leadSource: { not: null }, status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      this.prisma.order.groupBy({
        by: ['leadSource'],
        where: { leadSource: { not: null }, status: { not: OrderStatus.CANCELLED }, orderDate: { gte: startOfMonth } },
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
    ]);

    return {
      allTime: allTimeGroups
        .map(r => ({ source: r.leadSource ?? 'UNKNOWN', count: r._count._all, revenue: Number(r._sum.grandTotal ?? 0) }))
        .sort((a, b) => b.revenue - a.revenue),
      thisMonth: monthGroups
        .map(r => ({ source: r.leadSource ?? 'UNKNOWN', count: r._count._all, revenue: Number(r._sum.grandTotal ?? 0) }))
        .sort((a, b) => b.revenue - a.revenue),
    };
  }
}
