"use client";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Check, ChevronDown, ChevronUp, Loader2, X, Truck, Search, FileText, Filter } from "lucide-react";
import { useRouter } from "next/navigation";

type Payment = { id: string; date: string; amount: number; method: string; referenceNumber?: string; notes?: string; accountName: string; };
type OrderItem = { productName: string; sku: string; quantity: number; unitPrice: number; lineTotal: number; productionNotes?: string; artworkNotes?: string; };

type PendingOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; customerEmail?: string; customerAddress?: string; salesAgentName?: string;
  products: string; items: OrderItem[];
  totalAmount: number; totalPaid: number; balanceDue: number;
  orderDate: string; notes?: string; payments: Payment[];
};

type DispatchPendingOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; customerAddress?: string; customerEmail?: string; salesAgentName?: string;
  items: OrderItem[];
  totalAmount: number; totalPaid: number; balanceDue: number;
  orderDate: string; notes?: string; payments: Payment[];
  courierCharge?: number; paymentType?: string;
};

type PendingPayment = {
  id: string;
  orderId: string;
  orderNo: string;
  customerName: string;
  customerPhone?: string;
  salesAgentName?: string;
  amount: number;
  method: string;
  referenceNumber?: string;
  notes?: string;
  paymentDate: string;
  paymentAccountName: string;
  receivedByName?: string;
  verificationStatus: string;
  createdAt: string;
};

type VendorEntry = {
  id: string;
  type: "JOBWORK" | "SHEET_STAGE";
  vendorId: string;
  vendorName: string;
  description?: string;
  cost: number;
  vendorInvoiceNo?: string;
  isPaid: boolean;
  paidAt?: string;
  createdAt: string;
  status?: string;
  stage?: string;
  // JobWork specific
  productName?: string;
  productSku?: string;
  quantity?: number;
  orderNo?: string;
  customerName?: string;
  productionNotes?: string;
  // Sheet Stage specific
  sheetNo?: string;
  sheetGsm?: number;
  sheetSize?: string;
  products?: { productName: string; orderNo: string; customerName: string; quantity: number }[];
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank Transfer", CHEQUE: "Cheque", CARD: "Card",
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}
function parseNotes(notes?: string) {
  if (!notes) return {};
  const size = notes.match(/Size:\s*([^,]+)/)?.[1]?.trim();
  const gsm = notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim();
  const sides = notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim();
  return { size, gsm, sides };
}

type Tab = "pending" | "dispatch" | "receipts" | "vendors";

function orderAge(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return days + ' days';
}
function ageColor(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 3) return 'bg-green-50 text-green-700';
  if (days <= 7) return 'bg-yellow-50 text-yellow-700';
  return 'bg-red-50 text-red-700';
}

export default function AccountsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");

  // Pending orders
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Dispatch orders
  const [dispatchOrders, setDispatchOrders] = useState<DispatchPendingOrder[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchExpanded, setDispatchExpanded] = useState<string | null>(null);
  const [dispatchProcessing, setDispatchProcessing] = useState<string | null>(null);

  // Pending payment receipts
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [rejectPaymentId, setRejectPaymentId] = useState<string | null>(null);
  const [rejectPaymentReason, setRejectPaymentReason] = useState("");

  // Vendor statements
  const [vendorEntries, setVendorEntries] = useState<VendorEntry[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorFilter, setVendorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/pending`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      setOrders(await res.json());
    } finally { setLoading(false); }
  }, [router]);

  const loadDispatch = useCallback(async () => {
    setDispatchLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/pending-dispatch`, { headers: getAuthHeaders() });
      setDispatchOrders(await res.json());
    } finally { setDispatchLoading(false); }
  }, []);

  const loadVendors = useCallback(async () => {
    setVendorLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/vendor-statements`, { headers: getAuthHeaders() });
      setVendorEntries(await res.json());
    } finally { setVendorLoading(false); }
  }, []);

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/pending-payments`, { headers: getAuthHeaders() });
      setPendingPayments(await res.json());
    } finally { setReceiptsLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "dispatch") void loadDispatch(); }, [tab, loadDispatch]);
  useEffect(() => { if (tab === "receipts") void loadReceipts(); }, [tab, loadReceipts]);
  useEffect(() => { if (tab === "vendors") void loadVendors(); }, [tab, loadVendors]);

  async function approveOrder(id: string) {
    setProcessing(id);
    try {
      await fetch(`${API_BASE_URL}/accounts/${id}/approve`, { method: "PATCH", headers: getAuthHeaders() });
      await load();
    } finally { setProcessing(null); }
  }

  async function rejectOrder() {
    if (!rejectId || !rejectReason.trim()) { alert("Please enter a rejection reason"); return; }
    setProcessing(rejectId);
    try {
      await fetch(`${API_BASE_URL}/accounts/${rejectId}/reject`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectReason }),
      });
      setRejectId(null); setRejectReason(""); await load();
    } finally { setProcessing(null); }
  }

  async function approveDispatch(id: string) {
    setDispatchProcessing(id);
    try {
      await fetch(`${API_BASE_URL}/accounts/${id}/approve-dispatch`, { method: "PATCH", headers: getAuthHeaders() });
      await loadDispatch();
    } finally { setDispatchProcessing(null); }
  }

  async function verifyPayment(id: string) {
    setVerifyingId(id);
    try {
      await fetch(`${API_BASE_URL}/accounts/payments/${id}/verify`, { method: "PATCH", headers: getAuthHeaders() });
      await loadReceipts();
    } finally { setVerifyingId(null); }
  }

  async function rejectPayment() {
    if (!rejectPaymentId || !rejectPaymentReason.trim()) { alert("Enter rejection reason"); return; }
    setVerifyingId(rejectPaymentId);
    try {
      await fetch(`${API_BASE_URL}/accounts/payments/${rejectPaymentId}/reject`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectPaymentReason }),
      });
      setRejectPaymentId(null); setRejectPaymentReason("");
      await loadReceipts();
    } finally { setVerifyingId(null); }
  }

  async function markPaid(entry: VendorEntry) {
    if (!confirm(`Mark ₹${entry.cost} to ${entry.vendorName} as PAID?`)) return;
    setMarkingPaid(entry.id);
    try {
      const endpoint = entry.type === "JOBWORK"
        ? `${API_BASE_URL}/accounts/vendor-statements/jobwork/${entry.id}/paid`
        : `${API_BASE_URL}/accounts/vendor-statements/sheet-stage/${entry.id}/paid`;
      await fetch(endpoint, { method: "PATCH", headers: getAuthHeaders() });
      await loadVendors();
    } finally { setMarkingPaid(null); }
  }

  // Filtered vendor entries
  const uniqueVendors = useMemo(() => {
    const names = [...new Set(vendorEntries.map(e => e.vendorName))].sort();
    return names;
  }, [vendorEntries]);

  const filteredEntries = useMemo(() => {
    return vendorEntries.filter(e => {
      if (vendorFilter && e.vendorName !== vendorFilter) return false;
      if (paidFilter === "paid" && !e.isPaid) return false;
      if (paidFilter === "unpaid" && e.isPaid) return false;
      if (vendorSearch && !e.vendorName.toLowerCase().includes(vendorSearch.toLowerCase()) &&
        !e.productName?.toLowerCase().includes(vendorSearch.toLowerCase()) &&
        !e.orderNo?.toLowerCase().includes(vendorSearch.toLowerCase()) &&
        !e.sheetNo?.toLowerCase().includes(vendorSearch.toLowerCase())) return false;
      if (dateFrom && new Date(e.createdAt) < new Date(dateFrom)) return false;
      if (dateTo && new Date(e.createdAt) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [vendorEntries, vendorFilter, paidFilter, vendorSearch, dateFrom, dateTo]);

  const totalAmount = useMemo(() => filteredEntries.reduce((s, e) => s + e.cost, 0), [filteredEntries]);
  const totalPaid = useMemo(() => filteredEntries.filter(e => e.isPaid).reduce((s, e) => s + e.cost, 0), [filteredEntries]);
  const totalUnpaid = useMemo(() => filteredEntries.filter(e => !e.isPaid).reduce((s, e) => s + e.cost, 0), [filteredEntries]);

  return (
    <>
      <DashboardShell>
        <div className="p-4 lg:p-6 max-w-7xl mx-auto space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Accounts</h1>
            <p className="text-xs text-slate-500 mt-0.5">Approve orders, dispatch, and manage vendor payments.</p>
          </div>

          {/* Tabs */}
          <div className="border-b border-slate-200">
            <div className="flex gap-0">
              {([
                { key: "pending", label: "Order Approval", count: orders.length },
                { key: "dispatch", label: "Dispatch Approval", count: dispatchOrders.length },
                { key: "receipts", label: "Receipts Pending", count: pendingPayments.length },
                { key: "vendors", label: "Vendor Statements", count: vendorEntries.filter(e => !e.isPaid).length },
              ] as { key: Tab; label: string; count: number }[]).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === t.key ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {t.label}
                  {t.count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${tab === t.key ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── ORDER APPROVAL TAB ── */}
          {tab === "pending" && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : orders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <Check className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No orders pending approval</p>
                </div>
              ) : orders.map(order => (
                <div key={order.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-blue-700">{order.orderNo}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(order.orderDate)}`}>{orderAge(order.orderDate)}</span>
                      <span className="font-semibold text-slate-800">{order.customerName}</span>
                      {order.customerPhone && <span className="text-slate-400 text-xs">{order.customerPhone}</span>}
                      {order.customerAddress && <span className="text-slate-500 text-xs">📍 {order.customerAddress}</span>}
                      {order.salesAgentName && <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs">{order.salesAgentName}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-800">{fmt(order.totalAmount)}</span>
                      <button onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                        className="p-1 rounded hover:bg-slate-200">
                        {expanded === order.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {expanded === order.id && (
                    <div className="p-4 space-y-3">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-slate-100 text-xs text-slate-500">
                          <th className="pb-1 text-left">Product</th>
                          <th className="pb-1 text-left">Size</th>
                          <th className="pb-1 text-left">GSM</th>
                          <th className="pb-1 text-left">Sides</th>
                          <th className="pb-1 text-right">Qty</th>
                          <th className="pb-1 text-right">Rate</th>
                          <th className="pb-1 text-right">Amount</th>
                        </tr></thead>
                        <tbody className="divide-y divide-slate-50">
                          {order.items.map((item, i) => {
                            const n = parseNotes(item.productionNotes);
                            return (
                              <tr key={i}>
                                <td className="py-1.5 font-medium text-slate-800">{item.productName}</td>
                                <td className="py-1.5 text-slate-500 text-xs">{n.size || "—"}</td>
                                <td className="py-1.5 text-slate-500 text-xs">{n.gsm || "—"}</td>
                                <td className="py-1.5 text-slate-500 text-xs">{n.sides || "—"}</td>
                                <td className="py-1.5 text-right">{item.quantity}</td>
                                <td className="py-1.5 text-right text-xs">{fmt(item.unitPrice)}</td>
                                <td className="py-1.5 text-right font-semibold">{fmt(item.lineTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="text-xs text-slate-500 space-x-4">
                          <span>Total: <strong>{fmt(order.totalAmount)}</strong></span>
                          <span>Paid: <strong className="text-green-600">{fmt(order.totalPaid)}</strong></span>
                          <span>Balance: <strong className="text-red-500">{fmt(order.balanceDue)}</strong></span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setRejectId(order.id)}
                            className="px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50">
                            Reject
                          </button>
                          <button onClick={() => approveOrder(order.id)} disabled={processing === order.id}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60">
                            {processing === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                            Approve
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── DISPATCH APPROVAL TAB ── */}
          {tab === "dispatch" && (
            <div className="space-y-3">
              {dispatchLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : dispatchOrders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <Truck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No dispatch orders pending approval</p>
                </div>
              ) : dispatchOrders.map(order => (
                <div key={order.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-blue-700">{order.orderNo}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(order.orderDate)}`}>{orderAge(order.orderDate)}</span>
                      <span className="font-semibold text-slate-800">{order.customerName}</span>
                      {order.salesAgentName && <span className="rounded-full bg-purple-50 text-purple-700 px-1.5 py-0.5 text-xs">{order.salesAgentName}</span>}
                      {order.paymentType && <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${order.paymentType === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{order.paymentType}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-500 font-bold">Balance: {fmt(order.balanceDue)}</span>
                      <button onClick={() => setDispatchExpanded(dispatchExpanded === order.id ? null : order.id)}
                        className="p-1 rounded hover:bg-slate-200">
                        {dispatchExpanded === order.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {dispatchExpanded === order.id && (
                    <div className="p-4 space-y-3">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-slate-100 text-xs text-slate-500">
                          <th className="pb-1 text-left">Product</th>
                          <th className="pb-1 text-right">Qty</th>
                          <th className="pb-1 text-right">Amount</th>
                        </tr></thead>
                        <tbody>
                          {order.items.map((item, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="py-1.5 font-medium">{item.productName}</td>
                              <td className="py-1.5 text-right">{item.quantity}</td>
                              <td className="py-1.5 text-right">{fmt(item.lineTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="flex justify-end">
                        <button onClick={() => approveDispatch(order.id)} disabled={dispatchProcessing === order.id}
                          className="inline-flex items-center gap-1 px-4 py-2 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-semibold">
                          {dispatchProcessing === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                          Approve Dispatch
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── RECEIPTS PENDING TAB ── */}
          {tab === "receipts" && (
            <div className="space-y-3">
              {receiptsLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : pendingPayments.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <Check className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No receipts pending verification</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Agent</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Method</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Ref No</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendingPayments.map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                            {new Date(p.paymentDate).toLocaleDateString("en-IN")}
                          </td>
                          <td className="px-3 py-2 font-bold text-blue-700">{p.orderNo}</td>
                          <td className="px-3 py-2 text-slate-700">
                            {p.customerName}
                            {p.customerPhone && <div className="text-slate-400">{p.customerPhone}</div>}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{p.salesAgentName || "—"}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">{p.method}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-600">{p.paymentAccountName}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{p.referenceNumber || "—"}</td>
                          <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(p.amount)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => verifyPayment(p.id)} disabled={verifyingId === p.id}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-semibold">
                                {verifyingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Verify
                              </button>
                              <button onClick={() => setRejectPaymentId(p.id)}
                                className="px-2 py-1 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50 font-semibold">
                                Reject
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr>
                        <td colSpan={7} className="px-3 py-2 text-xs font-semibold text-slate-600">Total Pending ({pendingPayments.length} receipts)</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-green-700">{fmt(pendingPayments.reduce((s, p) => s + p.amount, 0))}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── VENDOR STATEMENTS TAB ── */}
          {tab === "vendors" && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                  <p className="text-xs text-slate-500 mb-1">Total Work</p>
                  <p className="text-lg font-bold text-slate-800">{fmt(totalAmount)}</p>
                  <p className="text-xs text-slate-400">{filteredEntries.length} entries</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-center">
                  <p className="text-xs text-green-600 mb-1">Paid</p>
                  <p className="text-lg font-bold text-green-700">{fmt(totalPaid)}</p>
                  <p className="text-xs text-green-500">{filteredEntries.filter(e => e.isPaid).length} entries</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                  <p className="text-xs text-red-600 mb-1">Unpaid</p>
                  <p className="text-lg font-bold text-red-700">{fmt(totalUnpaid)}</p>
                  <p className="text-xs text-red-500">{filteredEntries.filter(e => !e.isPaid).length} entries</p>
                </div>
              </div>

              {/* Filters */}
              <div className="rounded-xl border border-slate-200 bg-white p-3 flex flex-wrap gap-3 items-center">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                  <input value={vendorSearch} onChange={e => setVendorSearch(e.target.value)}
                    placeholder="Search vendor, product, order..."
                    className="pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-md outline-none focus:border-blue-400 w-48" />
                </div>
                <select value={vendorFilter} onChange={e => setVendorFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md outline-none bg-white">
                  <option value="">All Vendors</option>
                  {uniqueVendors.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <select value={paidFilter} onChange={e => setPaidFilter(e.target.value as any)}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md outline-none bg-white">
                  <option value="all">All Status</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">From:</span>
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md outline-none" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">To:</span>
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md outline-none" />
                </div>
                {(vendorFilter || paidFilter !== "all" || dateFrom || dateTo || vendorSearch) && (
                  <button onClick={() => { setVendorFilter(""); setPaidFilter("all"); setDateFrom(""); setDateTo(""); setVendorSearch(""); }}
                    className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
                <span className="text-xs text-slate-400 ml-auto">{filteredEntries.length} entries</span>
              </div>

              {/* Table */}
              {vendorLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : filteredEntries.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No vendor entries found</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Type</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Vendor</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Details</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Invoice No</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600">Status</th>
                        <th className="px-3 py-2 text-center font-semibold text-slate-600">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredEntries.map(entry => (
                        <tr key={entry.id} className={`hover:bg-slate-50 ${entry.isPaid ? "opacity-60" : ""}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                            {new Date(entry.createdAt).toLocaleDateString("en-IN")}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.type === "JOBWORK" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700"}`}>
                              {entry.type === "JOBWORK" ? "Job Work" : entry.stage?.replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{entry.vendorName}</td>
                          <td className="px-3 py-2 max-w-xs">
                            {entry.type === "JOBWORK" ? (
                              <div>
                                <span className="font-medium text-slate-700">{entry.productName}</span>
                                <span className="text-slate-400 ml-1">({entry.productSku})</span>
                                <div className="text-slate-400">Order: {entry.orderNo} · {entry.customerName}</div>
                                {entry.description && <div className="text-slate-400 italic">{entry.description}</div>}
                              </div>
                            ) : (
                              <div>
                                <span className="font-medium text-slate-700">Sheet: {entry.sheetNo}</span>
                                <span className="text-slate-400 ml-1">{entry.sheetGsm} GSM · {entry.sheetSize}"</span>
                                {entry.products?.map((p, i) => (
                                  <div key={i} className="text-slate-400">
                                    {p.productName} · {p.orderNo} · {p.customerName}
                                  </div>
                                ))}
                                {entry.description && <div className="text-slate-400 italic">{entry.description}</div>}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-500 font-mono">
                            {entry.vendorInvoiceNo || <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">{fmt(entry.cost)}</td>
                          <td className="px-3 py-2 text-center">
                            {entry.isPaid ? (
                              <div>
                                <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-semibold">✅ Paid</span>
                                {entry.paidAt && <div className="text-slate-400 text-xs mt-0.5">{new Date(entry.paidAt).toLocaleDateString("en-IN")}</div>}
                              </div>
                            ) : (
                              <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">⏳ Unpaid</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {!entry.isPaid && (
                              <button onClick={() => markPaid(entry)} disabled={markingPaid === entry.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-semibold">
                                {markingPaid === entry.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-slate-600">Total ({filteredEntries.length} entries)</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-slate-800">{fmt(totalAmount)}</td>
                        <td colSpan={2} className="px-3 py-2 text-xs text-slate-500 text-center">
                          Paid: <span className="text-green-700 font-semibold">{fmt(totalPaid)}</span> · Unpaid: <span className="text-red-600 font-semibold">{fmt(totalUnpaid)}</span>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardShell>

      {/* Reject Payment Modal */}
      {rejectPaymentId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "24rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <h2 className="text-sm font-bold text-slate-800 mb-1">Reject Payment Receipt</h2>
            <p className="text-xs text-slate-500 mb-3">The sales agent will be notified with this reason.</p>
            <textarea value={rejectPaymentReason} onChange={e => setRejectPaymentReason(e.target.value)}
              placeholder="Enter rejection reason (e.g. Amount mismatch, Receipt not received)..." rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setRejectPaymentId(null); setRejectPaymentReason(""); }}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={rejectPayment} disabled={!!verifyingId}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                {verifyingId ? "Rejecting..." : "Reject Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Order Modal */}
      {/* Reject Order Modal */}
      {rejectId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "24rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <h2 className="text-sm font-bold text-slate-800 mb-3">Reject Order</h2>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason..." rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setRejectId(null); setRejectReason(""); }}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={rejectOrder} disabled={processing === rejectId}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                {processing === rejectId ? "Rejecting..." : "Reject Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


