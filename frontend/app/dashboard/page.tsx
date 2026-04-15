"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { Loader2, TrendingUp, TrendingDown, ShoppingCart, Clock, Truck, Factory, CheckSquare, AlertCircle } from "lucide-react";

type DashboardStats = {
  revenue: { thisMonth: number; lastMonth: number; growth: number };
  orders: {
    total: number; thisMonth: number;
    byStatus: Record<string, number>;
    last7Days: { date: string; count: number }[];
  };
  finance: { totalOrderValue: number; totalPaid: number; totalOutstanding: number };
  pending: {
    approval: number; dispatchApproval: number;
    inProduction: number; readyForDispatch: number;
  };
  recentOrders: { id: string; orderNo: string; status: string; total: number; date: string }[];
};

function fmt(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

function fmtFull(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

const statusColors: Record<string, string> = {
  PENDING_APPROVAL: "bg-yellow-100 text-yellow-800",
  APPROVED: "bg-blue-100 text-blue-800",
  IN_PRODUCTION: "bg-purple-100 text-purple-800",
  READY_FOR_DISPATCH: "bg-indigo-100 text-indigo-800",
  PENDING_DISPATCH_APPROVAL: "bg-orange-100 text-orange-800",
  PARTIALLY_DISPATCHED: "bg-teal-100 text-teal-800",
  DISPATCHED: "bg-green-100 text-green-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-800",
  DRAFT: "bg-gray-100 text-gray-700",
};

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/dashboard/stats`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { setError("Could not load dashboard stats"); return; }
      setStats(await res.json());
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  if (loading) return (
    <DashboardShell>
      <div className="flex items-center justify-center h-full py-40">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    </DashboardShell>
  );

  if (error || !stats) return (
    <DashboardShell>
      <div className="p-6 text-red-500">{error ?? "Failed to load"}</div>
    </DashboardShell>
  );

  const maxCount = Math.max(...stats.orders.last7Days.map(d => d.count), 1);

  return (
    <DashboardShell>
      <div className="p-4 lg:p-5 space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">RarePrint ERP — Operations Overview</p>
        </div>

        {/* Revenue + Finance Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Revenue This Month */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">Revenue This Month</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{fmt(stats.revenue.thisMonth)}</p>
            <div className="flex items-center gap-1 mt-1">
              {stats.revenue.growth >= 0
                ? <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
              <span className={`text-xs font-medium ${stats.revenue.growth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {stats.revenue.growth >= 0 ? "+" : ""}{stats.revenue.growth}% vs last month
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">Last month: {fmt(stats.revenue.lastMonth)}</p>
          </div>

          {/* Total Outstanding */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">Total Outstanding</p>
            <p className="text-2xl font-bold text-red-600 mt-1">{fmt(stats.finance.totalOutstanding)}</p>
            <p className="text-xs text-slate-400 mt-1">Collected: {fmt(stats.finance.totalPaid)}</p>
            <p className="text-xs text-slate-400">Total billed: {fmt(stats.finance.totalOrderValue)}</p>
          </div>

          {/* Orders This Month */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">Orders This Month</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stats.orders.thisMonth}</p>
            <p className="text-xs text-slate-400 mt-1">Total all time: {stats.orders.total}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <ShoppingCart className="h-3 w-3 text-blue-500" />
              <span className="text-xs text-blue-600 font-medium">Active orders</span>
            </div>
          </div>

          {/* Pending Actions */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs text-slate-500 font-medium">Needs Attention</p>
            <p className="text-2xl font-bold text-orange-600 mt-1">
              {stats.pending.approval + stats.pending.dispatchApproval}
            </p>
            <p className="text-xs text-slate-400 mt-1">{stats.pending.approval} order approvals</p>
            <p className="text-xs text-slate-400">{stats.pending.dispatchApproval} dispatch approvals</p>
          </div>
        </div>

        {/* Middle Row — Bar Chart + Pipeline */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Orders Last 7 Days Bar Chart */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-800 mb-3">Orders — Last 7 Days</p>
            <div className="flex items-end gap-2 h-28">
              {stats.orders.last7Days.map((d, i) => {
                const pct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
                return (
                  <div key={i} className="flex flex-col items-center gap-1 flex-1">
                    <span className="text-xs font-semibold text-slate-700">{d.count > 0 ? d.count : ""}</span>
                    <div className="w-full rounded-t-md bg-blue-500 transition-all"
                      style={{ height: `${Math.max(pct, d.count > 0 ? 8 : 2)}%`, minHeight: d.count > 0 ? "8px" : "2px", opacity: d.count > 0 ? 1 : 0.2 }} />
                    <span className="text-xs text-slate-400 whitespace-nowrap">{d.date}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Order Pipeline */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-800 mb-3">Order Pipeline</p>
            <div className="space-y-2">
              {[
                { label: "Pending Approval", value: stats.pending.approval, icon: AlertCircle, color: "text-yellow-600", bg: "bg-yellow-100" },
                { label: "In Production", value: stats.pending.inProduction, icon: Factory, color: "text-purple-600", bg: "bg-purple-100" },
                { label: "Ready for Dispatch", value: stats.pending.readyForDispatch, icon: CheckSquare, color: "text-indigo-600", bg: "bg-indigo-100" },
                { label: "Dispatch Approval", value: stats.pending.dispatchApproval, icon: Clock, color: "text-orange-600", bg: "bg-orange-100" },
                { label: "Dispatched", value: stats.orders.byStatus["DISPATCHED"] ?? 0, icon: Truck, color: "text-green-600", bg: "bg-green-100" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-md ${item.bg} flex items-center justify-center`}>
                      <item.icon className={`h-3.5 w-3.5 ${item.color}`} />
                    </div>
                    <span className="text-xs text-slate-700 font-medium">{item.label}</span>
                  </div>
                  <span className={`text-sm font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row — Status breakdown + Recent Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">

          {/* Status Breakdown */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-800 mb-3">All Orders by Status</p>
            <div className="space-y-2">
              {Object.entries(stats.orders.byStatus)
                .sort((a, b) => b[1] - a[1])
                .map(([status, count]) => {
                  const pct = Math.round((count / stats.orders.total) * 100);
                  return (
                    <div key={status} className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${statusColors[status] ?? "bg-gray-100 text-gray-700"}`}>
                        {status.replace(/_/g, " ")}
                      </span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 min-w-[20px] text-right">{count}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Recent Orders */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-sm font-semibold text-slate-800 mb-3">Recent Orders</p>
            <div className="space-y-2">
              {stats.recentOrders.map((o) => (
                <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                  <div>
                    <p className="text-xs font-semibold text-slate-800">{o.orderNo}</p>
                    <p className="text-xs text-slate-400">
                      {new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColors[o.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {o.status.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs font-bold text-slate-700">{fmtFull(o.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

      </div>
    </DashboardShell>
  );
}