"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Check, ChevronDown, ChevronUp, Loader2, X, Truck } from "lucide-react";
import { useRouter } from "next/navigation";

type Payment = {
  id: string; date: string; amount: number; method: string;
  referenceNumber?: string; notes?: string; accountName: string;
};

type OrderItem = {
  productName: string; sku: string; quantity: number;
  unitPrice: number; lineTotal: number;
  productionNotes?: string; artworkNotes?: string;
};

type PendingOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; customerEmail?: string;
  products: string; items: OrderItem[];
  totalAmount: number; totalPaid: number;
  balanceDue: number; orderDate: string;
  notes?: string; payments: Payment[];
};

type DispatchPendingOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; customerEmail?: string;
  items: OrderItem[];
  totalAmount: number; totalPaid: number;
  balanceDue: number; orderDate: string;
  notes?: string; payments: Payment[];
  courierCharge?: number; paymentType?: string;
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank Transfer",
  CHEQUE: "Cheque", CARD: "Card",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

function parseProductionNotes(notes?: string) {
  if (!notes) return {};
  const size = notes.match(/Size:\s*([^,]+)/)?.[1]?.trim();
  const gsm = notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim();
  const sides = notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim();
  return { size, gsm, sides };
}

type Tab = "pending" | "dispatch";

export default function AccountsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");

  // --- Order Approval state ---
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<PendingOrder | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- Dispatch Approval state ---
  const [dispatchOrders, setDispatchOrders] = useState<DispatchPendingOrder[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchActingId, setDispatchActingId] = useState<string | null>(null);
  const [dispatchExpandedId, setDispatchExpandedId] = useState<string | null>(null);
  const [dispatchRejectModal, setDispatchRejectModal] = useState<DispatchPendingOrder | null>(null);
  const [dispatchRejectReason, setDispatchRejectReason] = useState("");
  const [dispatchRejectSubmitting, setDispatchRejectSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/pending`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { setError("Could not load pending orders"); return; }
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, [router]);

  const loadDispatch = useCallback(async () => {
    setDispatchError(null);
    setDispatchLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/pending-dispatch`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { setDispatchError("Could not load dispatch approvals"); return; }
      const data = await res.json();
      setDispatchOrders(Array.isArray(data) ? data : []);
    } catch { setDispatchError("Network error."); }
    finally { setDispatchLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "dispatch") void loadDispatch(); }, [tab, loadDispatch]);

  async function approve(id: string) {
    setActingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${id}/approve`,
        { method: "PATCH", headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Approve failed"); return; }
      await load();
    } finally { setActingId(null); }
  }

  async function submitReject() {
    if (!rejectModal) return;
    setRejectSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${rejectModal.id}/reject`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Reject failed"); return; }
      setRejectModal(null); setRejectReason(""); await load();
    } finally { setRejectSubmitting(false); }
  }

  async function approveDispatch(id: string) {
    setDispatchActingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${id}/approve-dispatch`,
        { method: "PATCH", headers: getAuthHeaders() });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Approve failed"); return; }
      await loadDispatch();
    } finally { setDispatchActingId(null); }
  }

  async function submitDispatchReject() {
    if (!dispatchRejectModal) return;
    setDispatchRejectSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${dispatchRejectModal.id}/reject-dispatch`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: dispatchRejectReason.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Reject failed"); return; }
      setDispatchRejectModal(null); setDispatchRejectReason(""); await loadDispatch();
    } finally { setDispatchRejectSubmitting(false); }
  }

  return (
    <>
      <DashboardShell>
        <div className="p-8 lg:p-10">
          <div className="mx-auto max-w-6xl space-y-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Accounts</h1>
              <p className="mt-1 text-sm text-slate-600">Review and approve orders pending accounts clearance.</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-slate-200">
              <button
                onClick={() => setTab("pending")}
                className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === "pending"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                Order Approval
                {orders.length > 0 && (
                  <span className="ml-2 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs">{orders.length}</span>
                )}
              </button>
              <button
                onClick={() => setTab("dispatch")}
                className={`px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                  tab === "dispatch"
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}>
                Dispatch Approval
                {dispatchOrders.length > 0 && (
                  <span className="ml-2 rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs">{dispatchOrders.length}</span>
                )}
              </button>
            </div>

            {/* ── ORDER APPROVAL TAB ── */}
            {tab === "pending" && (
              <div className="space-y-4">
                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
                )}
                {loading ? (
                  <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
                ) : orders.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                    No orders pending approval.
                  </div>
                ) : orders.map((o) => (
                  <div key={o.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

                    {/* Order Header */}
                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                      <div className="flex items-start justify-between">
                        <div className="grid grid-cols-4 gap-6 flex-1">
                          <div>
                            <p className="text-xs text-slate-500">Order No</p>
                            <p className="font-bold text-slate-900 text-sm mt-0.5">{o.orderNo}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{new Date(o.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Customer</p>
                            <p className="font-semibold text-slate-900 text-sm mt-0.5">{o.customerName}</p>
                            {o.customerPhone && <p className="text-xs text-slate-500 mt-0.5">{o.customerPhone}</p>}
                            {o.customerEmail && <p className="text-xs text-slate-500">{o.customerEmail}</p>}
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Order Amount</p>
                            <p className="font-bold text-slate-900 text-lg mt-0.5">{fmt(o.totalAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Paid / Balance Due</p>
                            <p className="text-sm mt-0.5">
                              <span className="font-bold text-emerald-600">{fmt(o.totalPaid)}</span>
                              <span className="text-slate-400 mx-1">/</span>
                              <span className="font-bold text-red-500">{fmt(o.balanceDue)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4 shrink-0">
                          <button onClick={() => approve(o.id)} disabled={actingId === o.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                            {actingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                            Approve
                          </button>
                          <button onClick={() => { setRejectReason(""); setRejectModal(o); }}
                            disabled={actingId === o.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50">
                            <X className="h-4 w-4" /> Reject
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Product Line Items */}
                    <div className="px-6 py-4 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Product Details</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-100">
                            <th className="pb-2 text-left font-medium">Product</th>
                            <th className="pb-2 text-left font-medium">Size</th>
                            <th className="pb-2 text-left font-medium">GSM</th>
                            <th className="pb-2 text-left font-medium">Sides</th>
                            <th className="pb-2 text-left font-medium">Qty</th>
                            <th className="pb-2 text-left font-medium">Rate</th>
                            <th className="pb-2 text-left font-medium">Amount</th>
                            <th className="pb-2 text-left font-medium">Instructions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {(o.items ?? []).map((item, idx) => {
                            const { size, gsm, sides } = parseProductionNotes(item.productionNotes);
                            return (
                              <tr key={idx}>
                                <td className="py-2 font-medium text-slate-900">
                                  {item.productName}
                                  <span className="text-xs text-slate-400 ml-1">({item.sku})</span>
                                </td>
                                <td className="py-2 text-slate-700">{size ?? "—"}</td>
                                <td className="py-2 text-slate-700">{gsm ?? "—"}</td>
                                <td className="py-2 text-slate-700">
                                  {sides === "SINGLE_SIDE" ? "Single" : sides === "DOUBLE_SIDE" ? "Double" : sides ?? "—"}
                                </td>
                                <td className="py-2 text-slate-700">{item.quantity}</td>
                                <td className="py-2 text-slate-700">{fmt(item.unitPrice)}</td>
                                <td className="py-2 font-semibold text-slate-900">{fmt(item.lineTotal)}</td>
                                <td className="py-2 text-slate-500 text-xs max-w-[160px]">{item.artworkNotes ?? "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200">
                            <td colSpan={6} className="pt-2 text-right text-sm font-medium text-slate-600">Order Total:</td>
                            <td className="pt-2 font-bold text-slate-900">{fmt(o.totalAmount)}</td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                      {o.notes && (
                        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                          <p className="text-xs font-medium text-amber-700">Order Notes:</p>
                          <p className="text-xs text-amber-600 mt-0.5">{o.notes}</p>
                        </div>
                      )}
                    </div>

                    {/* Payment History */}
                    <div className="px-6 py-3">
                      <button onClick={() => setExpandedId(expandedId === o.id ? null : o.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                        {expandedId === o.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {o.payments.length === 0 ? "No payments received" : `${o.payments.length} payment(s) received — click to view`}
                      </button>
                      {expandedId === o.id && (
                        <div className="mt-3">
                          {o.payments.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No payments recorded for this order.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500 border-b border-slate-100">
                                  <th className="pb-2 text-left">Date</th>
                                  <th className="pb-2 text-left">Amount</th>
                                  <th className="pb-2 text-left">Method</th>
                                  <th className="pb-2 text-left">Account</th>
                                  <th className="pb-2 text-left">Reference / UTR</th>
                                  <th className="pb-2 text-left">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {o.payments.map((p) => (
                                  <tr key={p.id}>
                                    <td className="py-2">{new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                    <td className="py-2 font-semibold text-emerald-700">{fmt(p.amount)}</td>
                                    <td className="py-2">{METHOD_LABELS[p.method] ?? p.method}</td>
                                    <td className="py-2">{p.accountName}</td>
                                    <td className="py-2 text-slate-500">{p.referenceNumber ?? "—"}</td>
                                    <td className="py-2 text-slate-500">{p.notes ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ── DISPATCH APPROVAL TAB ── */}
            {tab === "dispatch" && (
              <div className="space-y-4">
                {dispatchError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{dispatchError}</div>
                )}
                {dispatchLoading ? (
                  <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
                ) : dispatchOrders.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
                    No dispatch batches pending approval.
                  </div>
                ) : dispatchOrders.map((o) => (
                  <div key={o.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

                    {/* Header */}
                    <div className="bg-orange-50 border-b border-orange-100 px-6 py-4">
                      <div className="flex items-start justify-between">
                        <div className="grid grid-cols-4 gap-6 flex-1">
                          <div>
                            <p className="text-xs text-slate-500">Order No</p>
                            <p className="font-bold text-slate-900 text-sm mt-0.5">{o.orderNo}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{new Date(o.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Customer</p>
                            <p className="font-semibold text-slate-900 text-sm mt-0.5">{o.customerName}</p>
                            {o.customerPhone && <p className="text-xs text-slate-500 mt-0.5">{o.customerPhone}</p>}
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Order Amount</p>
                            <p className="font-bold text-slate-900 text-lg mt-0.5">{fmt(o.totalAmount)}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Courier / Payment</p>
                            <p className="text-sm mt-0.5 font-semibold text-slate-800">
                              {o.courierCharge != null ? fmt(o.courierCharge) : "—"}
                              {o.paymentType && (
                                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${o.paymentType === "COD" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>
                                  {o.paymentType}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4 shrink-0">
                          <button onClick={() => approveDispatch(o.id)} disabled={dispatchActingId === o.id}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                            {dispatchActingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                            Approve Dispatch
                          </button>
                          <button onClick={() => { setDispatchRejectReason(""); setDispatchRejectModal(o); }}
                            disabled={dispatchActingId === o.id}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50">
                            <X className="h-4 w-4" /> Reject
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Product Items */}
                    <div className="px-6 py-4 border-b border-slate-100">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Items for Dispatch</p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-xs text-slate-500 border-b border-slate-100">
                            <th className="pb-2 text-left font-medium">Product</th>
                            <th className="pb-2 text-left font-medium">Size</th>
                            <th className="pb-2 text-left font-medium">GSM</th>
                            <th className="pb-2 text-left font-medium">Sides</th>
                            <th className="pb-2 text-left font-medium">Qty</th>
                            <th className="pb-2 text-left font-medium">Rate</th>
                            <th className="pb-2 text-left font-medium">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {(o.items ?? []).map((item, idx) => {
                            const { size, gsm, sides } = parseProductionNotes(item.productionNotes);
                            return (
                              <tr key={idx}>
                                <td className="py-2 font-medium text-slate-900">
                                  {item.productName}
                                  <span className="text-xs text-slate-400 ml-1">({item.sku})</span>
                                </td>
                                <td className="py-2 text-slate-700">{size ?? "—"}</td>
                                <td className="py-2 text-slate-700">{gsm ?? "—"}</td>
                                <td className="py-2 text-slate-700">
                                  {sides === "SINGLE_SIDE" ? "Single" : sides === "DOUBLE_SIDE" ? "Double" : sides ?? "—"}
                                </td>
                                <td className="py-2 text-slate-700">{item.quantity}</td>
                                <td className="py-2 text-slate-700">{fmt(item.unitPrice)}</td>
                                <td className="py-2 font-semibold text-slate-900">{fmt(item.lineTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200">
                            <td colSpan={6} className="pt-2 text-right text-sm font-medium text-slate-600">Order Total:</td>
                            <td className="pt-2 font-bold text-slate-900">{fmt(o.totalAmount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      {o.notes && (
                        <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-2">
                          <p className="text-xs font-medium text-amber-700">Notes: <span className="font-normal">{o.notes}</span></p>
                        </div>
                      )}
                    </div>

                    {/* Payment History */}
                    <div className="px-6 py-3">
                      <button onClick={() => setDispatchExpandedId(dispatchExpandedId === o.id ? null : o.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                        {dispatchExpandedId === o.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {o.payments.length === 0 ? "No payments received" : `${o.payments.length} payment(s) received — click to view`}
                      </button>
                      {dispatchExpandedId === o.id && (
                        <div className="mt-3">
                          {o.payments.length === 0 ? (
                            <p className="text-sm text-slate-400 italic">No payments recorded.</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-slate-500 border-b border-slate-100">
                                  <th className="pb-2 text-left">Date</th>
                                  <th className="pb-2 text-left">Amount</th>
                                  <th className="pb-2 text-left">Method</th>
                                  <th className="pb-2 text-left">Account</th>
                                  <th className="pb-2 text-left">Reference / UTR</th>
                                  <th className="pb-2 text-left">Notes</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-50">
                                {o.payments.map((p) => (
                                  <tr key={p.id}>
                                    <td className="py-2">{new Date(p.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                                    <td className="py-2 font-semibold text-emerald-700">{fmt(p.amount)}</td>
                                    <td className="py-2">{METHOD_LABELS[p.method] ?? p.method}</td>
                                    <td className="py-2">{p.accountName}</td>
                                    <td className="py-2 text-slate-500">{p.referenceNumber ?? "—"}</td>
                                    <td className="py-2 text-slate-500">{p.notes ?? "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </div>
      </DashboardShell>

      {/* Order Reject Modal */}
      {rejectModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.5)", padding: "1rem" }}>
          <div style={{ width: "100%", maxWidth: "28rem", background: "white", borderRadius: "1rem", border: "1px solid #e2e8f0", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <h2 className="text-lg font-semibold text-slate-900">Reject order {rejectModal.orderNo}?</h2>
            <p className="mt-1 text-sm text-slate-600">Optional reason.</p>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} placeholder="Reason…"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectModal(null)} disabled={rejectSubmitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitReject} disabled={rejectSubmitting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {rejectSubmitting ? "Rejecting…" : "Reject order"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispatch Reject Modal */}
      {dispatchRejectModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.5)", padding: "1rem" }}>
          <div style={{ width: "100%", maxWidth: "28rem", background: "white", borderRadius: "1rem", border: "1px solid #e2e8f0", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <h2 className="text-lg font-semibold text-slate-900">Reject dispatch for {dispatchRejectModal.orderNo}?</h2>
            <p className="mt-1 text-sm text-slate-600">Optional reason.</p>
            <textarea value={dispatchRejectReason} onChange={(e) => setDispatchRejectReason(e.target.value)}
              rows={3} placeholder="Reason…"
              className="mt-4 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDispatchRejectModal(null)} disabled={dispatchRejectSubmitting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitDispatchReject} disabled={dispatchRejectSubmitting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                {dispatchRejectSubmitting ? "Rejecting…" : "Reject dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}