"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders, getStoredUser } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2, Clock, Truck, Factory, CheckSquare, AlertCircle, Trophy, Target, BarChart2, Zap } from "lucide-react";

type DashboardStats = {
  revenue: {
    today: number;
    thisMonth: number;
    lastMonth: number;
    growth: number;
    averagePerDay?: number;
    monthlyRunRate?: number;
    daysElapsed?: number;
    daysInMonth?: number;
  };
  orders: { total: number; thisMonth: number; byStatus: Record<string, number>; last7Days: { date: string; count: number }[] };
  finance: { totalOrderValue: number; totalPaid: number; totalOutstanding: number };
  pending: { approval: number; dispatchApproval: number; inProduction: number; readyForDispatch: number };
  recentOrders: { id: string; orderNo: string; status: string; total: number; date: string }[];
};
type AgentRow      = { id: string; name: string; totalOrders: number; monthOrders: number; totalRevenue: number; monthRevenue: number };
type CatStage      = { category: string; printing: number; processing: number; readyForDispatch: number };
type AvgProd       = { category: string; avgHours: number; avgDays: number; sampleSize: number };
type LeadSource    = { source: string; count: number; revenue: number };
type LeadAnalytics = { allTime: LeadSource[]; thisMonth: LeadSource[] };
type ProductionKpiMetric = { key: string; label: string; avgHours: number | null; avgDays: number | null; avgDaysMonth: number | null; avgDaysWeek: number | null; sampleSize: number; note: string };
type ProductionCategoryCycle = { category: string; avgHours: number | null; avgDays: number | null; avgDaysMonth: number | null; avgDaysWeek: number | null; sampleSize: number };
type ProductionKpis = { metrics: ProductionKpiMetric[]; categoryCycleTimes: ProductionCategoryCycle[]; bottlenecks: ProductionKpiMetric[] };
type ProfitPeriod = { gross: number; net: number };
type ProfitKpis = { today: ProfitPeriod; thisMonth: ProfitPeriod; lastMonth: ProfitPeriod };
type SalesByMonthPoint = { month: string; total: number };

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}
function fmtSource(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}
function fmtDuration(hours: number | null) {
  if (hours === null) return "No data";
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 24) return `${hours.toFixed(hours < 10 ? 1 : 0)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}
const statusColors: Record<string, string> = {
  PENDING_APPROVAL: "bg-yellow-100 text-yellow-800",
  IN_PRODUCTION: "bg-purple-100 text-purple-800",
  READY_FOR_DISPATCH: "bg-indigo-100 text-indigo-800",
  PENDING_DISPATCH_APPROVAL: "bg-orange-100 text-orange-800",
  DISPATCHED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-800",
};
const MEDAL = ["🥇","🥈","🥉"];

export default function DashboardPage() {
  const router = useRouter();
  const [stats,     setStats]     = useState<DashboardStats | null>(null);
  const [agents,    setAgents]    = useState<AgentRow[]>([]);
  const [catStages, setCatStages] = useState<CatStage[]>([]);
  const [avgProd,   setAvgProd]   = useState<AvgProd[]>([]);
  const [leadData,  setLeadData]  = useState<LeadAnalytics | null>(null);
  const [productionKpis, setProductionKpis] = useState<ProductionKpis | null>(null);
  const [salesByMonth, setSalesByMonth] = useState<SalesByMonthPoint[]>([]);
  const [profit, setProfit] = useState<ProfitKpis | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [currentUser] = useState(() => getStoredUser());

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const h = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/dashboard/summary`, { headers: h });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { setError("Could not load dashboard"); return; }
      const data = await res.json();
      setStats(data.stats);
      setAgents(data.agents ?? []);
      setCatStages(data.catStages ?? []);
      setAvgProd(data.avgProd ?? []);
      setLeadData(data.leadData ?? null);
      setProductionKpis(data.productionKpis ?? null);
      setSalesByMonth(data.salesByMonth ?? []);
      setProfit(data.profit ?? null);
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <DashboardShell>
      <div className="flex items-center justify-center py-40">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    </DashboardShell>
  );
  if (error || !stats) return (
    <DashboardShell><div className="p-6 text-red-500">{error ?? "Failed"}</div></DashboardShell>
  );

  const maxDay = Math.max(...stats.orders.last7Days.map(d => d.count), 1);
  const activeAgents = [...agents].sort((a, b) => b.monthRevenue - a.monthRevenue || b.monthOrders - a.monthOrders);

  // Sales-by-month bar chart geometry (mirrors the "Orders — Last 7 Days" bar chart below)
  const maxMonthSales = Math.max(...salesByMonth.map(m => m.total), 1);
  const isAdmin = currentUser?.role === "ADMIN";

  return (
    <DashboardShell>
      <div className="p-3 space-y-2">

        {/* Header */}
        <div>
          <h1 className="text-sm font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-400">RarePrint ERP — Operations Overview</p>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-7 gap-2">
          {[
            { label: "Today's Sale",      value: fmt(stats.revenue.today ?? 0),            sub: "Order value today",                   color: "text-emerald-600" },
            { label: "This Month Sale",   value: fmt(stats.revenue.thisMonth),              sub: `${stats.orders.thisMonth} orders this month`, color: "text-slate-900" },
            { label: "Avg / Day",         value: fmt(stats.revenue.averagePerDay ?? 0),     sub: `Based on ${stats.revenue.daysElapsed ?? 0} days`, color: "text-blue-600" },
            { label: "Last Month",        value: fmt(stats.revenue.lastMonth),              sub: "Previous month sale",                  color: "text-slate-700" },
            { label: "Monthly Run Rate",  value: fmt(stats.revenue.monthlyRunRate ?? 0),    sub: `Avg × ${stats.revenue.daysInMonth ?? 0} days`, color: "text-purple-600" },
            { label: "Outstanding",       value: fmt(stats.finance.totalOutstanding),       sub: `Billed: ${fmt(stats.finance.totalOrderValue)}`, color: "text-red-600" },
            { label: "Needs Attention",   value: String(stats.pending.approval + stats.pending.dispatchApproval), sub: `${stats.pending.approval} approvals`, color: "text-orange-600" },
          ].map((card, i) => (
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
              <p className="text-xs text-slate-500 font-medium truncate">{card.label}</p>
              <p className={`text-lg font-bold ${card.color} leading-tight mt-0.5`}>{card.value}</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Profit KPIs — visible to admins only ── */}
        {isAdmin && profit && (
          <div className="bg-emerald-50 rounded-lg border border-emerald-200 px-3 py-2 shadow-sm">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-semibold text-emerald-800">Profit <span className="opacity-60 font-normal">(admin only)</span></p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-xs text-emerald-700"><span className="w-2 h-2 rounded-full bg-emerald-600 inline-block" />Net profit</span>
                <span className="flex items-center gap-1 text-xs text-blue-700"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />Gross profit</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Today's Profit",    data: profit.today },
                { label: "This Month Profit", data: profit.thisMonth },
                { label: "Last Month Profit", data: profit.lastMonth },
              ].map((card, i) => (
                <div key={i} className="bg-white rounded-md border border-emerald-100 px-3 py-2">
                  <p className="text-xs text-slate-500 font-medium truncate">{card.label}</p>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-emerald-600 leading-tight">{fmt(card.data.net)}</span>
                    <span className="text-slate-300 font-bold">/</span>
                    <span className="text-lg font-bold text-blue-600 leading-tight">{fmt(card.data.gross)}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-emerald-400 font-medium">net</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-blue-400 font-medium">gross</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Sales by Month ── */}
        <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
          <p className="text-xs font-semibold text-slate-700 mb-1.5">Sales — Last {salesByMonth.length || 6} Months</p>
          {salesByMonth.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No sales data yet</p>
          ) : (
            <div className="flex items-end gap-2" style={{ height: "130px" }}>
              {salesByMonth.map((m, i) => {
                const barH = m.total > 0 ? Math.max(Math.round((m.total / maxMonthSales) * 96), 8) : 2;
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                    <span className="text-slate-600 font-semibold" style={{ fontSize: "9px" }}>{m.total > 0 ? fmt(m.total) : ""}</span>
                    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                      <div className="w-full rounded-t bg-blue-500" style={{ height: `${barH}px`, opacity: m.total > 0 ? 1 : 0.2 }} />
                    </div>
                    <span className="text-slate-400 whitespace-nowrap" style={{ fontSize: "9px" }}>{m.month}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Production Speed KPIs ── */}
        <div className="bg-white rounded-lg border border-slate-200 px-3 py-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 mb-2.5">
            <Clock className="h-3 w-3 text-cyan-600" />
            <p className="text-xs font-semibold text-slate-700">Production Time KPIs</p>
            <span className="text-xs text-slate-400 ml-auto">all time &nbsp;·&nbsp; this month &nbsp;·&nbsp; this week</span>
          </div>
          {!productionKpis || productionKpis.metrics.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No production timing data yet</p>
          ) : (
            <div className="grid grid-cols-5 gap-3">
              {productionKpis.metrics.map((metric) => (
                <div key={metric.key} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-3 min-w-0">
                  <p className="text-slate-500 font-medium truncate mb-1.5" style={{ fontSize: "11px" }}>{metric.label}</p>
                  <p className={`text-xl font-bold leading-tight ${metric.avgHours === null ? "text-slate-400" : "text-cyan-700"}`}>
                    {fmtDuration(metric.avgHours)}
                  </p>
                  <div className="mt-2 flex items-center gap-1.5 text-sm">
                    <span className={`font-bold ${metric.avgDaysMonth != null ? "text-emerald-600" : "text-slate-300"}`}>
                      {metric.avgDaysMonth != null ? metric.avgDaysMonth+"d" : "—"}
                    </span>
                    <span className="text-slate-300">/</span>
                    <span className={`font-bold ${metric.avgDaysWeek != null ? "text-blue-600" : "text-slate-300"}`}>
                      {metric.avgDaysWeek != null ? metric.avgDaysWeek+"d" : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-emerald-400 font-medium">mo</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-blue-400 font-medium">wk</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Row 2: Chart + Pipeline + Lead Sources ── */}
        <div className="grid grid-cols-3 gap-2">

          {/* Chart */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Orders — Last 7 Days</p>
            <div className="flex items-end gap-1" style={{ height: "80px" }}>
              {stats.orders.last7Days.map((d, i) => {
                const barH = d.count > 0 ? Math.max(Math.round((d.count / maxDay) * 60), 8) : 2;
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                    <span className="text-slate-600 font-semibold" style={{ fontSize: "9px" }}>{d.count > 0 ? d.count : ""}</span>
                    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                      <div className="w-full rounded-t bg-blue-500" style={{ height: `${barH}px`, opacity: d.count > 0 ? 1 : 0.2 }} />
                    </div>
                    <span className="text-slate-400 whitespace-nowrap" style={{ fontSize: "8px" }}>{d.date}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pipeline */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 mb-1.5">Order Pipeline</p>
            <div className="space-y-1">
              {[
                { label: "Pending Approval",  value: stats.pending.approval,         icon: AlertCircle, color: "text-yellow-600", bg: "bg-yellow-50" },
                { label: "In Production",     value: stats.pending.inProduction,     icon: Factory,     color: "text-purple-600", bg: "bg-purple-50" },
                { label: "Ready for Dispatch",value: stats.pending.readyForDispatch, icon: CheckSquare, color: "text-indigo-600", bg: "bg-indigo-50" },
                { label: "Dispatch Approval", value: stats.pending.dispatchApproval, icon: Clock,       color: "text-orange-600", bg: "bg-orange-50" },
                { label: "Dispatched",        value: stats.orders.byStatus["DISPATCHED"] ?? 0, icon: Truck, color: "text-green-600", bg: "bg-green-50" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-5 h-5 rounded ${item.bg} flex items-center justify-center flex-shrink-0`}>
                      <item.icon className={`h-2.5 w-2.5 ${item.color}`} />
                    </div>
                    <span className="text-xs text-slate-600">{item.label}</span>
                  </div>
                  <span className={`text-xs font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lead Sources */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1 mb-1.5">
              <Target className="h-3 w-3 text-blue-500" />
              <p className="text-xs font-semibold text-slate-700">Lead Sources</p>
              <span className="text-xs text-slate-400 ml-auto">This month</span>
            </div>
            {!leadData || leadData.thisMonth.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">No lead source data yet</p>
            ) : (
              <div className="space-y-1.5">
                {leadData.thisMonth.slice(0, 5).map((src, i) => {
                  const maxRev = leadData.thisMonth[0]?.revenue ?? 1;
                  const pct = Math.round((src.revenue / maxRev) * 100);
                  return (
                    <div key={i}>
                      <div className="flex justify-between mb-0.5">
                        <span className="text-xs font-medium text-slate-700 truncate max-w-[110px]">{fmtSource(src.source)}</span>
                        <span className="text-slate-400" style={{ fontSize: "10px" }}>{src.count} · {fmt(src.revenue)}</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 3: Leaderboard + Production + Recent Orders ── */}
        <div className="grid grid-cols-3 gap-2">

          {/* Leaderboard */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1 mb-1.5">
              <Trophy className="h-3 w-3 text-amber-500" />
              <p className="text-xs font-semibold text-slate-700">Sales Leaderboard</p>
              <span className="text-xs text-slate-400 ml-auto">{activeAgents.length} agents</span>
            </div>
            {agents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">No sales agents yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {activeAgents.map((agent, i) => (
                  <div key={agent.id} className={`flex items-center justify-between rounded px-1.5 py-1 min-w-0 ${i === 0 ? "bg-amber-50" : ""}`}>
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-5 flex-shrink-0 text-slate-500" style={{ fontSize: "12px" }}>{MEDAL[i] ?? `${i + 1}.`}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 truncate" style={{ fontSize: "12px", lineHeight: 1.15 }}>{agent.name}</p>
                        <p className="text-slate-400" style={{ fontSize: "10px", lineHeight: 1.15 }}>{agent.monthOrders} orders</p>
                      </div>
                    </div>
                    <p className="font-bold text-emerald-600 flex-shrink-0" style={{ fontSize: "12px" }}>{fmt(agent.monthRevenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Production by Category + Avg Time */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1 mb-1.5">
              <BarChart2 className="h-3 w-3 text-purple-500" />
              <p className="text-xs font-semibold text-slate-700">Production by Category</p>
            </div>
            {catStages.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-2">No items in production</p>
            ) : (
              <table className="w-full" style={{ fontSize: "10px" }}>
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="pb-1 text-left font-medium">Category</th>
                    <th className="pb-1 text-right font-medium text-blue-600">Print</th>
                    <th className="pb-1 text-right font-medium text-yellow-600">Process</th>
                    <th className="pb-1 text-right font-medium text-green-600">Ready</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {catStages.map((row, i) => (
                    <tr key={i}>
                      <td className="py-0.5 font-medium text-slate-800 truncate max-w-[70px]">{row.category}</td>
                      <td className="py-0.5 text-right font-semibold text-blue-700">{row.printing.toLocaleString("en-IN")}</td>
                      <td className="py-0.5 text-right font-semibold text-yellow-700">{row.processing.toLocaleString("en-IN")}</td>
                      <td className="py-0.5 text-right font-semibold text-green-700">{row.readyForDispatch.toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {avgProd.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-slate-100">
                <div className="flex items-center gap-1 mb-1">
                  <Zap className="h-2.5 w-2.5 text-orange-500" />
                  <p style={{ fontSize: "10px" }} className="font-semibold text-slate-600">Avg Production Time</p>
                </div>
                {avgProd.map((row, i) => (
                  <div key={i} className="flex justify-between">
                    <span style={{ fontSize: "10px" }} className="text-slate-600 truncate">{row.category}</span>
                    <span style={{ fontSize: "10px" }} className="font-bold text-orange-600">{row.avgDays}d avg</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Category Cycle Times */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <Factory className="h-3 w-3 text-rose-500" />
              <p className="text-xs font-semibold text-slate-700">Category Cycle Times</p>
            </div>
            <div className="grid grid-cols-3 mb-1.5 px-1">
              <span className="text-xs text-slate-400 font-medium">Category</span>
              <span className="text-xs text-slate-500 font-semibold text-center">All</span>
              <span className="text-xs text-slate-400 text-right">
                <span className="text-emerald-500 font-semibold">mo</span> / <span className="text-blue-500 font-semibold">wk</span>
              </span>
            </div>
            {!productionKpis || productionKpis.categoryCycleTimes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No ready dispatch data yet</p>
            ) : (
              <div className="space-y-1.5">
                {productionKpis.categoryCycleTimes.map((row) => (
                  <div key={row.category} className="grid grid-cols-3 items-center px-1 py-0.5 border-b border-slate-50 last:border-0">
                    <span className="text-xs font-medium text-slate-700 truncate">{row.category}</span>
                    <span className="text-sm font-bold text-rose-600 text-center tabular-nums">
                      {row.avgDays != null ? row.avgDays+"d" : "—"}
                    </span>
                    <span className="text-xs text-right tabular-nums">
                      <span className={`font-bold ${row.avgDaysMonth != null ? "text-emerald-600" : "text-slate-300"}`}>
                        {row.avgDaysMonth != null ? row.avgDaysMonth+"d" : "—"}
                      </span>
                      <span className="text-slate-300 mx-0.5">/</span>
                      <span className={`font-bold ${row.avgDaysWeek != null ? "text-blue-600" : "text-slate-300"}`}>
                        {row.avgDaysWeek != null ? row.avgDaysWeek+"d" : "—"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}
