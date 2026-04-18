"use client";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";

interface Order {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  totalAmount: number;
  createdAt: string;
  agent?: { name: string };
  items?: { productName: string; quantity: number }[];
}

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  PENDING_APPROVAL:          { bg: "#fef9c3", color: "#854d0e" },
  APPROVED:                  { bg: "#dbeafe", color: "#1e40af" },
  IN_PRODUCTION:             { bg: "#f3e8ff", color: "#6b21a8" },
  READY_FOR_DISPATCH:        { bg: "#dcfce7", color: "#166534" },
  PENDING_DISPATCH_APPROVAL: { bg: "#ffedd5", color: "#9a3412" },
  DISPATCHED:                { bg: "#f1f5f9", color: "#475569" },
  CANCELLED:                 { bg: "#fee2e2", color: "#991b1b" },
};

const ALL_STATUSES = [
  "ALL","PENDING_APPROVAL","APPROVED","IN_PRODUCTION",
  "READY_FOR_DISPATCH","PENDING_DISPATCH_APPROVAL","DISPATCHED","CANCELLED",
];

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const loadOrders = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/orders`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : data.data ?? []);
    } catch (err: any) {
      setError(err.message || "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { void loadOrders(); }, [loadOrders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      const matchSearch = !q ||
        o.orderNo?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        (o.customerPhone ?? "").includes(q);
      const matchStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, search, statusFilter]);

  return (
    <DashboardShell>
      <div style={{ padding: "1.5rem 2rem", maxWidth: "1200px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Orders</h1>
            <p style={{ fontSize: "13px", color: "#64748b", margin: "2px 0 0" }}>{orders.length} total order{orders.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={() => router.push("/orders/create")}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", padding: "8px 16px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
            <Plus style={{ width: 15, height: 15 }} /> New Order
          </button>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative" }}>
            <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: "#94a3b8" }} />
            <input type="text" placeholder="Search order no, name, phone..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ border: "1px solid #e2e8f0", borderRadius: "8px", paddingLeft: "32px", paddingRight: "12px", paddingTop: "7px", paddingBottom: "7px", fontSize: "13px", width: "280px", outline: "none" }} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "7px 12px", fontSize: "13px", outline: "none", background: "white" }}>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace(/_/g, " ")}</option>)}
          </select>
          <button onClick={loadOrders}
            style={{ border: "1px solid #e2e8f0", borderRadius: "8px", padding: "7px 14px", fontSize: "13px", background: "white", cursor: "pointer", color: "#334155" }}>
            🔄 Refresh
          </button>
        </div>

        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", padding: "12px 16px", marginBottom: "16px", fontSize: "13px" }}>
            ⚠️ {error} <button onClick={loadOrders} style={{ background: "none", border: "none", cursor: "pointer", textDecoration: "underline", color: "#991b1b", fontSize: "13px" }}>Retry</button>
          </div>
        )}

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "200px" }}>
            <Loader2 style={{ width: 32, height: 32, color: "#2563eb" }} className="animate-spin" />
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "80px 0" }}>
            <p style={{ fontSize: "40px", marginBottom: "12px" }}>📋</p>
            <p style={{ fontSize: "16px", fontWeight: 600, color: "#64748b" }}>No orders found</p>
            <p style={{ fontSize: "13px", marginTop: "4px" }}>
              {orders.length === 0 ? "Create your first order to get started." : "Try adjusting the search or filter."}
            </p>
            {orders.length === 0 && (
              <button onClick={() => router.push("/orders/create")}
                style={{ marginTop: "16px", background: "#2563eb", color: "white", border: "none", borderRadius: "8px", padding: "8px 20px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
                + Create First Order
              </button>
            )}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ background: "white", borderRadius: "12px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                  {["Order No","Customer","Items","Amount","Status","Agent","Date",""].map(h => (
                    <th key={h} style={{ textAlign: "left", padding: "10px 14px", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((order, idx) => {
                  const sc = STATUS_COLORS[order.status] ?? { bg: "#f1f5f9", color: "#475569" };
                  return (
                    <tr key={order.id}
                      style={{ borderBottom: idx < filtered.length - 1 ? "1px solid #f1f5f9" : "none", cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#f8fafc")}
                      onMouseLeave={e => (e.currentTarget.style.background = "white")}
                      onClick={() => router.push(`/orders/${order.id}`)}>
                      <td style={{ padding: "12px 14px", fontFamily: "monospace", fontWeight: 600, color: "#2563eb" }}>{order.orderNo}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <p style={{ margin: 0, fontWeight: 600, color: "#0f172a" }}>{order.customerName}</p>
                        {order.customerPhone && <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>{order.customerPhone}</p>}
                      </td>
                      <td style={{ padding: "12px 14px", color: "#475569", maxWidth: "200px" }}>
                        {order.items?.length ? order.items.map(i => `${i.productName} x${i.quantity}`).join(", ") : "—"}
                      </td>
                      <td style={{ padding: "12px 14px", fontWeight: 600, color: "#0f172a" }}>{fmt(order.totalAmount)}</td>
                      <td style={{ padding: "12px 14px" }}>
                        <span style={{ background: sc.bg, color: sc.color, borderRadius: "999px", padding: "3px 10px", fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap" }}>
                          {order.status?.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td style={{ padding: "12px 14px", color: "#64748b" }}>{order.agent?.name ?? "—"}</td>
                      <td style={{ padding: "12px 14px", color: "#94a3b8", fontSize: "12px", whiteSpace: "nowrap" }}>
                        {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td style={{ padding: "12px 14px" }}>
                        <button onClick={e => { e.stopPropagation(); router.push(`/orders/${order.id}`); }}
                          style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: "6px", padding: "4px 10px", fontSize: "12px", color: "#2563eb", cursor: "pointer", fontWeight: 500 }}>
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div style={{ padding: "10px 14px", background: "#f8fafc", borderTop: "1px solid #e2e8f0", fontSize: "12px", color: "#94a3b8" }}>
              Showing {filtered.length} of {orders.length} orders
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
