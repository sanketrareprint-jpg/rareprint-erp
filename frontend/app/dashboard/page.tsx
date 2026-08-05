"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders, getStoredUser } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2, Clock, Truck, Factory, CheckSquare, AlertCircle, Trophy, Target, BarChart2, Zap, PhoneCall, PhoneOff, Tag, Repeat, ShieldCheck, MessageSquare, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";

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
  orders: { total: number; thisMonth: number; byStatus: Record<string, number>; last7Days: { date: string; count: number; revenue: number }[] };
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
type CashflowPeriod = { cashIn: number; cashOut: number; net: number; bankCashIn: number; bankCashOut: number; cashModeIn: number; cashModeOut: number };
type Cashflow = { thisMonth: CashflowPeriod; lastMonth: CashflowPeriod; deltaVsLastMonth: number };

// Super Admin Tasks — an extensible list of "only Sanket/owner can act on
// this" items (see backend DashboardService.getSuperAdminTasks). New task
// types just show up here automatically; nothing on the frontend needs to
// change when a new group is added on the backend.
type SuperAdminTaskItem = { id: string; title: string; subtitle: string; amount: number | null; link: string; createdAt: string };
type SuperAdminTaskGroup = { key: string; label: string; description: string; status: "active" | "coming_soon"; count: number; link: string | null; items: SuperAdminTaskItem[] };
type SuperAdminTasks = { generatedAt: string; totalPending: number; groups: SuperAdminTaskGroup[] };

// Complaints Overview — visible to everyone (unlike the fuller complaints
// list nested inside superAdminTasks.groups, which is owner-only).
type ComplaintsOverview = {
  openCount: number;
  overdueCount: number;
  escalatedCount: number;
  byPriority: { LOW: number; MEDIUM: number; HIGH: number; URGENT: number };
  recent: SuperAdminTaskItem[];
};

type ComplianceAgentRow = { agentId: string; agentName: string; tagsApplied: number; notContacted: number; contacted: number };
type ComplianceDashboard = { agents: ComplianceAgentRow[]; totals: { tagsApplied: number; notContacted: number } };
type NotContactedNumber = { name: string | null; phone: string; tagRaw: string | null; lastActiveAt: string | null; createdOnAt: string | null };
type TopCalledNumber = { phone: string; count: number; totalDurationSec: number; lastCalledAt: string };
type CallingPatternBucket = { bucket: string; count: number; pct?: number };
type MyComplianceStats = {
  agentName: string;
  taggedCount: number;
  contactedCount: number;
  notContactedCount: number;
  notContactedNumbers: NotContactedNumber[];
  top5Called: TopCalledNumber[];
  callingPattern: { distinctNumbersCalled: number; calledOnce: number; calledRepeat: number; repeatCallRate: number; distribution: CallingPatternBucket[] };
};
type TeamAgentCallStats = {
  agentId: string;
  agentName: string;
  distinctNumbersCalled: number;
  top5Called: TopCalledNumber[];
  callingPattern: { distinctNumbersCalled: number; calledOnce: number; calledRepeat: number; repeatCallRate: number; distribution: CallingPatternBucket[] };
};
type TeamCallStats = { month: string | null; agents: TeamAgentCallStats[] };

const CALLING_PATTERN_COLORS = ["#94a3b8", "#38bdf8", "#f59e0b", "#ef4444"]; // 1 call, 2-3, 4-6, 7+

function fmtSecs(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function fmt(n: number) {
  if (n < 0) return `-${fmt(-n)}`;
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
  const [leaderboardMonth, setLeaderboardMonth] = useState(""); // "" = this month (uses `agents` above)
  const [leaderboardAgents, setLeaderboardAgents] = useState<AgentRow[] | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [catStages, setCatStages] = useState<CatStage[]>([]);
  const [avgProd,   setAvgProd]   = useState<AvgProd[]>([]);
  const [leadData,  setLeadData]  = useState<LeadAnalytics | null>(null);
  const [productionKpis, setProductionKpis] = useState<ProductionKpis | null>(null);
  const [salesByMonth, setSalesByMonth] = useState<SalesByMonthPoint[]>([]);
  const [profit, setProfit] = useState<ProfitKpis | null>(null);
  const [cashflow, setCashflow] = useState<Cashflow | null>(null);
  const [superAdminTasks, setSuperAdminTasks] = useState<SuperAdminTasks | null>(null);
  const [complaintsOverview, setComplaintsOverview] = useState<ComplaintsOverview | null>(null);
  const [compliance, setCompliance] = useState<ComplianceDashboard | null>(null);
  const [myStats, setMyStats] = useState<MyComplianceStats | null>(null);
  const [teamStats, setTeamStats] = useState<TeamCallStats | null>(null);
  const [complianceMonth, setComplianceMonth] = useState<string>(""); // "" = all time
  const [availableMonths, setAvailableMonths] = useState<{ month: string; label: string }[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [currentUser] = useState(() => getStoredUser());
  const [expandedCallAgents, setExpandedCallAgents] = useState<Set<string>>(new Set());
  const toggleCallAgent = (agentId: string) => {
    setExpandedCallAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) next.delete(agentId); else next.add(agentId);
      return next;
    });
  };

  // "Not Contacted — by Agent": click a row's count to load that agent's
  // actual not-contacted numbers (GET /call-compliance/agents/:id/stats),
  // cached per agentId+month so re-expanding doesn't re-fetch.
  const [expandedNotContactedAgent, setExpandedNotContactedAgent] = useState<string | null>(null);
  const [loadingNotContactedAgent, setLoadingNotContactedAgent] = useState<string | null>(null);
  const [notContactedDetail, setNotContactedDetail] = useState<Record<string, NotContactedNumber[]>>({});
  const [copiedNotContactedKey, setCopiedNotContactedKey] = useState<string | null>(null);
  const canViewAgentCompliance = (agentId: string) => currentUser?.role === "ADMIN" || currentUser?.id === agentId;
  const toggleNotContactedAgent = (agentId: string) => {
    setExpandedNotContactedAgent((prev) => (prev === agentId ? null : agentId));
  };
  // Fetches (and re-fetches if the month filter changes while a row is
  // expanded) that agent's actual not-contacted numbers.
  useEffect(() => {
    if (!expandedNotContactedAgent) return;
    const agentId = expandedNotContactedAgent;
    const cacheKey = `${agentId}:${complianceMonth}`;
    if (notContactedDetail[cacheKey]) return;
    let cancelled = false;
    setLoadingNotContactedAgent(agentId);
    const qs = complianceMonth ? `?month=${complianceMonth}` : "";
    fetch(`${API_BASE_URL}/call-compliance/agents/${agentId}/stats${qs}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (!cancelled && data) setNotContactedDetail((prev) => ({ ...prev, [cacheKey]: data.notContactedNumbers ?? [] })); })
      .catch(() => { /* silent — expanded panel just shows empty */ })
      .finally(() => { if (!cancelled) setLoadingNotContactedAgent(null); });
    return () => { cancelled = true; };
  }, [expandedNotContactedAgent, complianceMonth, notContactedDetail]);
  const copyNotContactedNumbers = (agentId: string, numbers: NotContactedNumber[]) => {
    const cacheKey = `${agentId}:${complianceMonth}`;
    const text = numbers.map((n) => n.phone).join("\n");
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedNotContactedKey(cacheKey);
      setTimeout(() => setCopiedNotContactedKey((k) => (k === cacheKey ? null : k)), 1500);
    }).catch(() => {});
  };

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
      setCashflow(data.cashflow ?? null);
      setSuperAdminTasks(data.superAdminTasks ?? null);
      setComplaintsOverview(data.complaintsOverview ?? null);

      // Call-compliance widgets are best-effort — don't fail the whole
      // dashboard if there's no data imported yet. Fetched by the dedicated
      // effect below (keyed off complianceMonth) so switching the month
      // dropdown doesn't have to reload the entire dashboard.
      fetch(`${API_BASE_URL}/call-compliance/months`, { headers: h })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setAvailableMonths(d); })
        .catch(() => { /* ignore */ });
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [router]);

  const loadCompliance = useCallback(async (month: string) => {
    // These three were previously awaited one after another (three
    // sequential round trips, each with its own CORS preflight on the
    // Android app) — that's what made the dashboard feel like it hung.
    // Firing them in parallel cuts load time roughly to the slowest single
    // call instead of the sum of all three.
    const h = getAuthHeaders();
    const qs = month ? `?month=${month}` : "";
    await Promise.allSettled([
      fetch(`${API_BASE_URL}/call-compliance/dashboard${qs}`, { headers: h })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setCompliance(d); }),
      fetch(`${API_BASE_URL}/call-compliance/my-stats${qs}`, { headers: h })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setMyStats(d); }),
      fetch(`${API_BASE_URL}/call-compliance/team-stats${qs}`, { headers: h })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setTeamStats(d); }),
    ]);
  }, []);

  useEffect(() => { void loadCompliance(complianceMonth); }, [complianceMonth, loadCompliance]);

  // Sales Leaderboard month filter — "" keeps using the current-month
  // `agents` already loaded by /dashboard/summary; picking a past month
  // fetches that month specifically instead of reloading the whole dashboard.
  useEffect(() => {
    if (!leaderboardMonth) { setLeaderboardAgents(null); return; }
    let cancelled = false;
    setLeaderboardLoading(true);
    fetch(`${API_BASE_URL}/dashboard/agent-leaderboard?month=${leaderboardMonth}`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then(d => { if (!cancelled) setLeaderboardAgents(d); })
      .catch(() => { if (!cancelled) setLeaderboardAgents([]); })
      .finally(() => { if (!cancelled) setLeaderboardLoading(false); });
    return () => { cancelled = true; };
  }, [leaderboardMonth]);

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

  const maxDayRevenue = Math.max(...stats.orders.last7Days.map(d => d.revenue), 1);
  const leaderboardSource = leaderboardMonth ? (leaderboardAgents ?? []) : agents;
  const activeAgents = [...leaderboardSource].sort((a, b) => b.monthRevenue - a.monthRevenue || b.monthOrders - a.monthOrders);
  // Last 12 months for the leaderboard month filter — "" (first option)
  // means "this month" and reuses the already-loaded `agents` data.
  const leaderboardMonthOptions = [
    { value: "", label: "This Month" },
    ...Array.from({ length: 11 }, (_, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - (i + 1));
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
      return { value, label };
    }),
  ];

  // Sales-by-month bar chart geometry (mirrors the "Orders — Last 7 Days" bar chart below)
  const maxMonthSales = Math.max(...salesByMonth.map(m => m.total), 1);
  // Profit is owner-only — not every ADMIN account, just this one email.
  // The backend is the real gate (profit comes back null for anyone else);
  // this is just a matching frontend check so the UI never flashes it.
  const isOwner = currentUser?.email === "sanket.rareprint@gmail.com";

  return (
    <DashboardShell>
      <div className="p-2.5 space-y-1.5">

        {/* Header */}
        <div className="flex items-baseline gap-2">
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
            <div key={i} className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
              <p className="text-xs text-slate-500 font-medium truncate">{card.label}</p>
              <p className={`text-lg font-bold ${card.color} leading-tight mt-0.5`}>{card.value}</p>
              <p className="text-xs text-slate-400 truncate mt-0.5">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Profit KPIs — owner only ── */}
        {isOwner && profit && (
          <div className="bg-emerald-50 rounded-lg border border-emerald-200 px-3 py-1.5 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-emerald-800">Profit <span className="opacity-60 font-normal">(owner only)</span></p>
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
                <div key={i} className="bg-white rounded-md border border-emerald-100 px-3 py-1.5">
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

        {/* ── Cashflow — owner only. Cash IN vs cash OUT across bank accounts
             (BankTransaction CR/DR) plus cash-mode receipts/payouts that
             never touch a bank statement (Payment/VendorPayment method
             CASH), for this month vs last month. ── */}
        {isOwner && cashflow && (
          <div className={`rounded-lg border px-3 py-1.5 shadow-sm ${cashflow.thisMonth.net >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
            <p className={`text-xs font-semibold mb-1 ${cashflow.thisMonth.net >= 0 ? "text-emerald-800" : "text-red-800"}`}>
              Cashflow <span className="opacity-60 font-normal">(owner only, bank + cash)</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "This Month", data: cashflow.thisMonth },
                { label: "Last Month", data: cashflow.lastMonth },
              ].map(({ label, data }) => (
                <div key={label} className="bg-white rounded-md border border-slate-100 px-3 py-1.5">
                  <p className="text-xs text-slate-500 font-medium truncate">{label}</p>
                  <p className={`text-lg font-bold leading-tight mt-0.5 ${data.net >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {data.net >= 0 ? "+" : "-"}{fmt(Math.abs(data.net))}
                  </p>
                  <div className="flex items-center gap-2 text-xs mt-0.5">
                    <span className="text-emerald-600 font-medium">↓ In {fmt(data.cashIn)}</span>
                    <span className="text-red-500 font-medium">↑ Out {fmt(data.cashOut)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cash-mode: {fmt(data.cashModeIn)} in / {fmt(data.cashModeOut)} out
                  </p>
                </div>
              ))}
              <div className="bg-white rounded-md border border-slate-100 px-3 py-1.5">
                <p className="text-xs text-slate-500 font-medium truncate">Vs Last Month</p>
                <p className={`text-lg font-bold leading-tight mt-0.5 ${cashflow.deltaVsLastMonth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {cashflow.deltaVsLastMonth >= 0 ? "+" : "-"}{fmt(Math.abs(cashflow.deltaVsLastMonth))}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">{cashflow.deltaVsLastMonth >= 0 ? "Better than last month" : "Worse than last month"}</p>
              </div>
            </div>
          </div>
        )}

        {/* ── Super Admin Tasks — owner only. Extensible: each group in
             superAdminTasks.groups renders generically, so new task types
             added on the backend (see DashboardService.getSuperAdminTasks)
             show up here with no frontend changes. Complaints needing
             attention are one of these groups, per request. ── */}
        {isOwner && superAdminTasks && (
          <div className="bg-white rounded-lg border border-rose-200 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <ShieldCheck className="h-3 w-3 text-rose-600" />
              <p className="text-xs font-semibold text-slate-700">Super Admin Tasks <span className="opacity-60 font-normal">(owner only)</span></p>
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ml-auto ${superAdminTasks.totalPending > 0 ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>
                {superAdminTasks.totalPending} pending
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {superAdminTasks.groups.map((group) => {
                const clickable = group.status === "active" && !!group.link;
                return (
                  <div
                    key={group.key}
                    onClick={clickable ? () => router.push(group.link!) : undefined}
                    className={`rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2 min-w-0 ${clickable ? "cursor-pointer hover:bg-slate-100" : ""}`}
                  >
                    <p className="text-slate-500 font-medium leading-tight mb-1" style={{ fontSize: "10px" }}>{group.label}</p>
                    {group.status === "coming_soon" ? (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-500 inline-block">Coming soon</span>
                    ) : (
                      <p className={`text-xl font-bold leading-tight ${group.count > 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {group.count}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Sales by Month + Sales by Week (side by side) ── */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 mb-1">Sales — Last {salesByMonth.length || 6} Months</p>
            {salesByMonth.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No sales data yet</p>
            ) : (
              <div className="flex items-end gap-1" style={{ height: "70px" }}>
                {salesByMonth.map((m, i) => {
                  const barH = m.total > 0 ? Math.max(Math.round((m.total / maxMonthSales) * 52), 8) : 2;
                  return (
                    <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                      <span className="text-slate-600 font-semibold" style={{ fontSize: "9px" }}>{m.total > 0 ? fmt(m.total) : ""}</span>
                      <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                        <div className="w-full rounded-t bg-blue-500" style={{ height: `${barH}px`, opacity: m.total > 0 ? 1 : 0.2 }} />
                      </div>
                      <span className="text-slate-400 whitespace-nowrap" style={{ fontSize: "8px" }}>{m.month}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 mb-1">Sales — Last 7 Days</p>
            <div className="flex items-end gap-1" style={{ height: "70px" }}>
              {stats.orders.last7Days.map((d, i) => {
                const barH = d.revenue > 0 ? Math.max(Math.round((d.revenue / maxDayRevenue) * 52), 8) : 2;
                return (
                  <div key={i} className="flex flex-col items-center gap-0.5 flex-1">
                    <span className="text-slate-600 font-semibold" style={{ fontSize: "9px" }}>{d.revenue > 0 ? fmt(d.revenue) : ""}</span>
                    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                      <div className="w-full rounded-t bg-blue-500" style={{ height: `${barH}px`, opacity: d.revenue > 0 ? 1 : 0.2 }} />
                    </div>
                    <span className="text-slate-400 whitespace-nowrap" style={{ fontSize: "8px" }}>{d.date}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Production Speed KPIs ── */}
        <div className="bg-white rounded-lg border border-slate-200 px-3 py-1 shadow-sm">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Clock className="h-3 w-3 text-cyan-600" />
            <p className="text-xs font-semibold text-slate-700">Production Time KPIs</p>
            <span className="text-xs text-slate-400 ml-auto">all time &nbsp;·&nbsp; this month &nbsp;·&nbsp; this week</span>
          </div>
          {!productionKpis || productionKpis.metrics.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">No production timing data yet</p>
          ) : (
            <div className="grid grid-cols-5 gap-1.5">
              {productionKpis.metrics.map((metric) => (
                <div key={metric.key} className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1 min-w-0">
                  <p className="text-slate-500 font-medium truncate mb-0.5" style={{ fontSize: "10px" }}>{metric.label}</p>
                  <p className={`text-sm font-bold leading-tight ${metric.avgHours === null ? "text-slate-400" : "text-cyan-700"}`}>
                    {fmtDuration(metric.avgHours)}
                  </p>
                  <div className="mt-0.5 flex items-center gap-1 text-xs">
                    <span className={`font-bold ${metric.avgDaysMonth != null ? "text-emerald-600" : "text-slate-300"}`}>
                      {metric.avgDaysMonth != null ? metric.avgDaysMonth+"d" : "—"}
                    </span>
                    <span className="text-slate-300">/</span>
                    <span className={`font-bold ${metric.avgDaysWeek != null ? "text-blue-600" : "text-slate-300"}`}>
                      {metric.avgDaysWeek != null ? metric.avgDaysWeek+"d" : "—"}
                    </span>
                    <span className="text-slate-300" style={{ fontSize: "9px" }}>(mo/wk)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Row 2: Pipeline + Lead Sources + Complaints (all visible to everyone) ── */}
        <div className="grid grid-cols-3 gap-2">

          {/* Pipeline */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <p className="text-xs font-semibold text-slate-700 mb-1">Order Pipeline</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
              {[
                { label: "Pending Approval",  value: stats.pending.approval,         icon: AlertCircle, color: "text-yellow-600", bg: "bg-yellow-50" },
                { label: "In Production",     value: stats.pending.inProduction,     icon: Factory,     color: "text-purple-600", bg: "bg-purple-50" },
                { label: "Ready for Dispatch",value: stats.pending.readyForDispatch, icon: CheckSquare, color: "text-indigo-600", bg: "bg-indigo-50" },
                { label: "Dispatch Approval", value: stats.pending.dispatchApproval, icon: Clock,       color: "text-orange-600", bg: "bg-orange-50" },
                { label: "Dispatched",        value: stats.orders.byStatus["DISPATCHED"] ?? 0, icon: Truck, color: "text-green-600", bg: "bg-green-50" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className={`w-5 h-5 rounded ${item.bg} flex items-center justify-center flex-shrink-0`}>
                      <item.icon className={`h-2.5 w-2.5 ${item.color}`} />
                    </div>
                    <span className="text-xs text-slate-600 truncate">{item.label}</span>
                  </div>
                  <span className={`text-xs font-bold flex-shrink-0 ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lead Sources */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-1 mb-1">
              <Target className="h-3 w-3 text-blue-500" />
              <p className="text-xs font-semibold text-slate-700">Lead Sources</p>
              <span className="text-xs text-slate-400 ml-auto">This month</span>
            </div>
            {!leadData || leadData.thisMonth.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">No lead source data yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {leadData.thisMonth.slice(0, 4).map((src, i) => {
                  const maxRev = leadData.thisMonth[0]?.revenue ?? 1;
                  const pct = Math.round((src.revenue / maxRev) * 100);
                  return (
                    <div key={i} className="min-w-0">
                      <div className="flex justify-between mb-0.5 gap-1">
                        <span className="text-xs font-medium text-slate-700 truncate">{fmtSource(src.source)}</span>
                        <span className="text-slate-400 flex-shrink-0" style={{ fontSize: "10px" }}>{fmt(src.revenue)}</span>
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

          {/* Complaints — visible to everyone, not just the owner. See the
              fuller admin-only list inside "Super Admin Tasks" below. */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-1 mb-1">
              <MessageSquare className="h-3 w-3 text-red-500" />
              <p className="text-xs font-semibold text-slate-700">Complaints</p>
              <span className="text-xs text-slate-400 ml-auto">{complaintsOverview?.openCount ?? 0} open</span>
            </div>
            {!complaintsOverview || complaintsOverview.openCount === 0 ? (
              <p className="text-xs text-emerald-600 text-center py-3">No open complaints ✓</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                  <div className="rounded-md bg-red-50 px-1.5 py-1 text-center">
                    <p className="text-xs font-bold text-red-600 leading-tight">{complaintsOverview.overdueCount}</p>
                    <p className="text-slate-400" style={{ fontSize: "9px" }}>Overdue</p>
                  </div>
                  <div className="rounded-md bg-orange-50 px-1.5 py-1 text-center">
                    <p className="text-xs font-bold text-orange-600 leading-tight">{complaintsOverview.escalatedCount}</p>
                    <p className="text-slate-400" style={{ fontSize: "9px" }}>Escalated</p>
                  </div>
                  <div className="rounded-md bg-rose-50 px-1.5 py-1 text-center">
                    <p className="text-xs font-bold text-rose-600 leading-tight">{complaintsOverview.byPriority.URGENT + complaintsOverview.byPriority.HIGH}</p>
                    <p className="text-slate-400" style={{ fontSize: "9px" }}>High/Urgent</p>
                  </div>
                </div>
                <div className="space-y-0.5 max-h-24 overflow-y-auto">
                  {complaintsOverview.recent.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => router.push(item.link)}
                      className="w-full flex items-center justify-between gap-2 px-1.5 py-0.5 rounded hover:bg-slate-50 text-left"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{item.title}</p>
                        <p className="text-slate-400 truncate" style={{ fontSize: "10px" }}>{item.subtitle}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Row 3: Leaderboard + Production + Recent Orders ── */}
        <div className="grid grid-cols-3 gap-2">

          {/* Leaderboard */}
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-1 mb-1">
              <Trophy className="h-3 w-3 text-amber-500" />
              <p className="text-xs font-semibold text-slate-700">Sales Leaderboard</p>
              <select
                value={leaderboardMonth}
                onChange={(e) => setLeaderboardMonth(e.target.value)}
                className="text-slate-600 bg-white border border-slate-200 rounded outline-none"
                style={{ fontSize: "10px", padding: "1px 3px" }}
              >
                {leaderboardMonthOptions.map(o => <option key={o.value || "current"} value={o.value}>{o.label}</option>)}
              </select>
              {leaderboardLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
              <span className="text-xs text-slate-400 ml-auto">{activeAgents.length} agents</span>
            </div>
            {activeAgents.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">No sales agents yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                {activeAgents.map((agent, i) => (
                  <div key={agent.id} className={`flex items-center justify-between rounded px-1.5 py-0.5 min-w-0 ${i === 0 ? "bg-amber-50" : ""}`}>
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
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-1 mb-1">
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
          <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 mb-1">
              <Factory className="h-3 w-3 text-rose-500" />
              <p className="text-xs font-semibold text-slate-700">Category Cycle Times</p>
            </div>
            <div className="grid grid-cols-3 mb-1 px-1">
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

        {/* ── Call Compliance: month selector ── */}
        {(compliance || myStats || teamStats) && availableMonths.length > 0 && (
          <div className="flex items-center justify-end gap-1.5 -mb-1">
            <span className="text-xs text-slate-400">Call compliance for:</span>
            <select
              value={complianceMonth}
              onChange={(e) => setComplianceMonth(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1 text-xs bg-white"
            >
              <option value="">All time</option>
              {availableMonths.map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}
            </select>
          </div>
        )}

        {/* ── Call Compliance: org-wide summary (namewise, visible to everyone) ── */}
        {compliance && compliance.agents.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
              <div className="flex items-center gap-1 mb-1">
                <PhoneOff className="h-3 w-3 text-red-500" />
                <p className="text-xs font-semibold text-slate-700">Not Contacted — by Agent</p>
                <span className="text-xs text-slate-400 ml-auto">{compliance.totals.notContacted} total</span>
              </div>
              <div className="space-y-1">
                {[...compliance.agents].sort((a, b) => b.notContacted - a.notContacted).map((row) => {
                  const canExpand = row.notContacted > 0 && canViewAgentCompliance(row.agentId);
                  const isOpen = expandedNotContactedAgent === row.agentId;
                  const cacheKey = `${row.agentId}:${complianceMonth}`;
                  const numbers = notContactedDetail[cacheKey];
                  return (
                    <div key={row.agentId}>
                      <div
                        className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded ${canExpand ? "cursor-pointer hover:bg-slate-50" : ""}`}
                        onClick={() => canExpand && toggleNotContactedAgent(row.agentId)}
                      >
                        <span className="text-xs text-slate-700 truncate">{row.agentName}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs text-slate-400">{row.contacted}/{row.tagsApplied} contacted</span>
                          <span className={`text-xs font-bold ${row.notContacted > 0 ? "text-red-600" : "text-emerald-600"}`}>{row.notContacted}</span>
                          {canExpand && (isOpen ? <ChevronUp className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />)}
                        </div>
                      </div>
                      {isOpen && (
                        <div className="ml-1.5 mb-1 mt-0.5 rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5">
                          {loadingNotContactedAgent === row.agentId ? (
                            <div className="flex items-center gap-1.5 py-1"><Loader2 className="h-3 w-3 animate-spin text-slate-400" /><span className="text-xs text-slate-400">Loading…</span></div>
                          ) : !numbers || numbers.length === 0 ? (
                            <p className="text-xs text-slate-400 py-1">No not-contacted numbers.</p>
                          ) : (
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-slate-500">{numbers.length} number{numbers.length === 1 ? "" : "s"}</span>
                                <button
                                  onClick={(e) => { e.stopPropagation(); copyNotContactedNumbers(row.agentId, numbers); }}
                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-600 hover:bg-slate-100"
                                >
                                  {copiedNotContactedKey === cacheKey ? <><Check className="h-3 w-3 text-emerald-600" /> Copied</> : <><Copy className="h-3 w-3" /> Copy all</>}
                                </button>
                              </div>
                              <div className="max-h-40 overflow-y-auto space-y-0.5">
                                {numbers.map((n, i) => (
                                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                    <span className="text-slate-700 truncate">{n.name || "—"}</span>
                                    <span className="text-slate-500 font-mono flex-shrink-0">{n.phone}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
              <div className="flex items-center gap-1 mb-1">
                <Tag className="h-3 w-3 text-purple-500" />
                <p className="text-xs font-semibold text-slate-700">AiSensy Tags Applied — by Agent</p>
                <span className="text-xs text-slate-400 ml-auto">{compliance.totals.tagsApplied} total</span>
              </div>
              <div className="space-y-1">
                {[...compliance.agents].sort((a, b) => b.tagsApplied - a.tagsApplied).map((row) => {
                  const maxTags = Math.max(...compliance.agents.map((r) => r.tagsApplied), 1);
                  const pct = Math.round((row.tagsApplied / maxTags) * 100);
                  return (
                    <div key={row.agentId} className="min-w-0">
                      <div className="flex justify-between mb-0.5 gap-1">
                        <span className="text-xs font-medium text-slate-700 truncate">{row.agentName}</span>
                        <span className="text-slate-500 font-semibold flex-shrink-0" style={{ fontSize: "10px" }}>{row.tagsApplied}</span>
                      </div>
                      <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Call Compliance: individual calling activity, per agent ── */}
        {teamStats && teamStats.agents.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
              <div className="flex items-center gap-1 mb-1">
                <PhoneCall className="h-3 w-3 text-blue-500" />
                <p className="text-xs font-semibold text-slate-700">Top 5 Called Numbers — by Agent</p>
              </div>
              <div className="space-y-0.5 max-h-72 overflow-y-auto">
                {teamStats.agents.map((a) => {
                  const expanded = expandedCallAgents.has(a.agentId);
                  return (
                    <div key={a.agentId} className="border-b border-slate-50 last:border-0">
                      <button
                        type="button"
                        onClick={() => toggleCallAgent(a.agentId)}
                        className="w-full flex items-center justify-between gap-2 px-1 py-1 text-left"
                      >
                        <span className="text-xs font-medium text-slate-700 truncate">{a.agentName}</span>
                        <span className="flex items-center gap-1.5 flex-shrink-0">
                          <span className="text-xs text-slate-400">{a.distinctNumbersCalled} numbers</span>
                          <span className="text-slate-400 text-[10px]">{expanded ? "▲" : "▼"}</span>
                        </span>
                      </button>
                      {expanded && (
                        <div className="pl-2 pb-1.5 space-y-1">
                          {a.top5Called.map((n, i) => (
                            <div key={n.phone} className="flex items-center justify-between gap-2 px-1 py-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="w-4 text-slate-400 flex-shrink-0" style={{ fontSize: "10px" }}>{i + 1}.</span>
                                <span className="text-xs font-mono text-slate-700 truncate">{n.phone}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className="text-xs text-slate-400">{fmtSecs(n.totalDurationSec)}</span>
                                <span className="text-xs font-bold text-blue-600">{n.count}×</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm">
              <div className="flex items-center gap-1 mb-1">
                <Repeat className="h-3 w-3 text-orange-500" />
                <p className="text-xs font-semibold text-slate-700">Calling Pattern — by Agent</p>
              </div>
              <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                {["1 call", "2-3 calls", "4-6 calls", "7+ calls"].map((label, i) => (
                  <div key={label} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: CALLING_PATTERN_COLORS[i] }} />
                    <span className="text-slate-400" style={{ fontSize: "10px" }}>{label}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {teamStats.agents.map((a) => (
                  <div key={a.agentId} className="min-w-0">
                    <div className="flex justify-between mb-0.5 gap-1">
                      <span className="text-xs font-medium text-slate-700 truncate">{a.agentName}</span>
                      <span className="text-slate-400 flex-shrink-0" style={{ fontSize: "10px" }}>{a.callingPattern.repeatCallRate}% repeat</span>
                    </div>
                    <div className="h-2 w-full rounded-full overflow-hidden flex bg-slate-100">
                      {a.callingPattern.distribution.map((b, i) => (
                        (b.pct ?? 0) > 0 && (
                          <div
                            key={b.bucket}
                            title={`${b.bucket}: ${b.pct ?? 0}% (${b.count})`}
                            style={{ width: `${b.pct ?? 0}%`, backgroundColor: CALLING_PATTERN_COLORS[i] }}
                          />
                        )
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardShell>
  );
}
