"use client";
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import {
  Loader2, Plus, X, CreditCard, ChevronDown, ChevronUp,
  Truck, CheckSquare, Square, AlertTriangle, Search,
  Paperclip, Upload, FileText,
} from "lucide-react";
import { useRouter } from "next/navigation";

type ItemDetail = {
  productName: string; size: string | null; gsm: string | null;
  sides: string | null; quantity: number; unitPrice: number;
  lineTotal: number; itemProductionStage: string;
};

type OrderItemRef = {
  id: string; productName: string; itemProductionStage: string;
};

type Order = {
  id: string; orderNo: string; customerName: string; customerPhone?: string; shippingAddress?: string;
  salesAgentName?: string; customerId?: string;
  products: string; totalAmount: number; advancePaid: number;
  balanceDue: number; status: string; date: string;
  readyItemsCount?: number; totalItemsCount?: number;
  itemDetails?: ItemDetail[];
  items?: OrderItemRef[];
};

type OrderItem = {
  id: string; productName: string; sku: string; quantity: number;
  unitPrice: number; lineTotal: number; productionNotes?: string;
  itemProductionStage: string;
};
type PaymentAccount = { id: string; name: string; accountType: string; bankName?: string; };
type Payment = {
  id: string; amount: number; method: string; referenceNumber?: string;
  notes?: string; paymentDate: string; paymentAccount: { name: string };
};
type RateQuote = { carrierName: string; amount: number; estimatedDays: number; rateId?: string; };

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI (GPay/PhonePe/Paytm)",
  BANK_TRANSFER: "Bank Transfer / NEFT / RTGS",
  CHEQUE: "Cheque", CARD: "Card (POS)",
};

const STATUS_OPTIONS = [
  "ALL","PENDING_APPROVAL","APPROVED","IN_PRODUCTION",
  "READY_FOR_DISPATCH","PENDING_DISPATCH_APPROVAL",
  "PARTIALLY_DISPATCHED","DISPATCHED","DELIVERED","CANCELLED",
];

const itemStageColors: Record<string, string> = {
  NOT_PRINTED: "bg-gray-100 text-gray-600",
  PRINTING: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-yellow-100 text-yellow-700",
  READY_FOR_DISPATCH: "bg-green-100 text-green-700",
};
const itemStageLabels: Record<string, string> = {
  NOT_PRINTED: "Not Printed", PRINTING: "Printing",
  PROCESSING: "Processing", READY_FOR_DISPATCH: "Ready",
};

const IN_PROGRESS_STATUSES = ["APPROVED", "IN_PRODUCTION"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}
function parseNotes(notes?: string) {
  return {
    size: notes?.match(/Size:\s*([^,]+)/)?.[1]?.trim(),
    gsm: notes?.match(/GSM:\s*([^,]+)/)?.[1]?.trim(),
    sides: notes?.match(/Sides:\s*([^,]+)/)?.[1]?.trim(),
  };
}

const TH = { background: "#f8fafc", position: "sticky" as const, top: 0, zIndex: 10 };

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

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "inprogress" | "dispatch">("all");
  const [expandedPayments, setExpandedPayments] = useState<string | null>(null);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [orderJourneys, setOrderJourneys] = useState<Record<string, any[]>>({});
  const [orderPayments, setOrderPayments] = useState<Record<string, Payment[]>>({});
  const [paymentModal, setPaymentModal] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Search + filter
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // File upload
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [fileModalOrder, setFileModalOrder] = useState<Order | null>(null);
  const [fileModalItems, setFileModalItems] = useState<any[]>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Dispatch
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());
  const [bookingModal, setBookingModal] = useState(false);
  const [bookingItems, setBookingItems] = useState<Record<string, OrderItem[]>>({});
  const [itemsLoading, setItemsLoading] = useState(false);
  const [rates, setRates] = useState<RateQuote[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [customerError, setCustomerError] = useState<string | null>(null);
  const [bookingForm, setBookingForm] = useState({
    courierCharges: "", isCod: false, codAmount: "",
    paymentMethod: "CASH", paymentAccountId: "",
    paymentReference: "", notes: "",
    dispatchType: "COURIER",
    transportName: "", lrNumber: "", transportChargesType: "TOPAY", transportBy: "",
    awbNumber: "", courierBy: "", deliveryBoyName: "",
    collectedByName: "", collectedByPhone: "",
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [newPayment, setNewPayment] = useState({
    amount: "", method: "CASH", paymentAccountId: "",
    referenceNumber: "", notes: "", paymentDate: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    setLoading(true);
    const headers = getAuthHeaders();
    const [oRes, rRes, aRes] = await Promise.all([
      fetch(`${API_BASE_URL}/orders`, { headers }),
      fetch(`${API_BASE_URL}/orders/ready-for-dispatch`, { headers }),
      fetch(`${API_BASE_URL}/orders/payment-accounts`, { headers }),
    ]);
    if (oRes.status === 401) { clearAuth(); router.replace("/login"); return; }
    setOrders(await oRes.json());
    const rawReady = rRes.ok ? await rRes.json() : [];
    const cu = (() => { try { const r = localStorage.getItem("rareprint_user"); return r ? JSON.parse(r) : null; } catch { return null; } })();
    setReadyOrders(cu?.role === "SALES_AGENT" ? rawReady.filter((o: any) => o.salesAgentName === cu.fullName) : rawReady);
    const accs = await aRes.json();
    setAccounts(accs);
    if (accs.length > 0) setBookingForm(p => ({ ...p, paymentAccountId: accs[0].id }));
    setLoading(false);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function loadPayments(orderId: string) {
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}/payments`, { headers: getAuthHeaders() });
    const payments = await res.json();
    setOrderPayments(prev => ({ ...prev, [orderId]: payments }));
    }

  async function togglePayments(orderId: string) {
    if (expandedPayments === orderId) { setExpandedPayments(null); return; }
    setExpandedPayments(orderId);
    if (!orderPayments[orderId]) await loadPayments(orderId);
  }

  async function toggleJourney(orderId: string) {
    if (expandedJourney === orderId) { setExpandedJourney(null); return; }
    setExpandedJourney(orderId);
    if (orderJourneys[orderId]) return;
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}/status-logs`, { headers: getAuthHeaders() });
    const data = res.ok ? await res.json() : [];
    setOrderJourneys(p => ({ ...p, [orderId]: data }));
  }

  async function submitPayment() {
    if (!paymentModal || !newPayment.amount || !newPayment.paymentAccountId) {
      alert("Please fill amount and select account"); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${paymentModal.id}/payments`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(newPayment.amount), method: newPayment.method,
          paymentAccountId: newPayment.paymentAccountId,
          referenceNumber: newPayment.referenceNumber || undefined,
          notes: newPayment.notes || undefined,
          paymentDate: newPayment.paymentDate,
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      await loadPayments(paymentModal.id);
      setExpandedPayments(paymentModal.id);
      setPaymentModal(null);
      setNewPayment({ amount: "", method: "CASH", paymentAccountId: accounts[0]?.id ?? "", referenceNumber: "", notes: "", paymentDate: new Date().toISOString().slice(0, 10) });
      await load();
    } finally { setSubmitting(false); }
  }

  // ── File upload per item ────────────────────────────────────────────────────
  async function uploadDesignFile(itemId: string, file: File) {
    setUploadingItemId(itemId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files`, {
        method: "POST", headers: getAuthHeaders(), body: formData,
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Upload failed"); return; }
      // Reload items for this order to show new file
      if (fileModalOrder) {
        const itemsRes = await fetch(`${API_BASE_URL}/orders/${fileModalOrder.id}/items`, { headers: getAuthHeaders() });
        if (itemsRes.ok) {
          const items = await itemsRes.json();
          setFileModalItems(items);
        }
      }
    } finally {
      setUploadingItemId(null);
      if (fileInputRefs.current[itemId]) fileInputRefs.current[itemId]!.value = "";
    }
  }

  function toggleOrderSelection(orderId: string, customerName: string) {
    setCustomerError(null);
    const selected = readyOrders.filter(o => selectedOrderIds.has(o.id));
    if (!selectedOrderIds.has(orderId) && selected.length > 0 && selected[0].customerName !== customerName) {
      setCustomerError(`Cannot combine orders from different customers. Selected: "${selected[0].customerName}".`);
      return;
    }
    setSelectedOrderIds(prev => {
      const s = new Set(prev);
      if (s.has(orderId)) s.delete(orderId); else s.add(orderId);
      return s;
    });
  }

  async function openBookingModal() {
    if (selectedOrderIds.size === 0) { alert("Select at least one order"); return; }
    setBookingModal(true); setRates([]); setItemsLoading(true);
    try {
      const itemsMap: Record<string, OrderItem[]> = {};
      for (const orderId of selectedOrderIds) {
        const res = await fetch(`${API_BASE_URL}/orders/${orderId}/items`, { headers: getAuthHeaders() });
        const items = await res.json();
        itemsMap[orderId] = items.filter((i: OrderItem) => i.itemProductionStage === "READY_FOR_DISPATCH");
      }
      setBookingItems(itemsMap);
    } finally { setItemsLoading(false); }
  }

  async function fetchRates() {
    const firstOrderId = Array.from(selectedOrderIds)[0];
    if (!firstOrderId) return;
    setRatesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/rates/${firstOrderId}`, { headers: getAuthHeaders() });
      if (!res.ok) { alert("Could not fetch rates"); return; }
      const data = await res.json();
      setRates(data.rates ?? []);
      if (data.rates?.length) setBookingForm(p => ({ ...p, courierCharges: data.rates[0].amount.toString() }));
    } finally { setRatesLoading(false); }
  }

  const selectedOrders = readyOrders.filter(o => selectedOrderIds.has(o.id));
  const totalBalance = selectedOrders.reduce((s, o) => s + o.balanceDue, 0);
  const totalAmount  = selectedOrders.reduce((s, o) => s + o.totalAmount, 0);
  const courierNum   = Number(bookingForm.courierCharges || 0);
  const suggestedCod = totalBalance + courierNum;

  async function submitBooking() {
    if (selectedOrderIds.size === 0) return;
    if (!bookingForm.courierCharges) { alert("Enter courier charges"); return; }
    if (!bookingForm.isCod && !bookingForm.paymentAccountId) { alert("Select payment account"); return; }
    setBookingSubmitting(true);
    try {
      const orderIds = Array.from(selectedOrderIds);
      const res = await fetch(`${API_BASE_URL}/orders/submit-dispatch-batch`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          orderIds, courierCharges: courierNum, isCod: bookingForm.isCod,
          codAmount: bookingForm.isCod ? Number(bookingForm.codAmount || suggestedCod) : undefined,
          paymentMethod: bookingForm.isCod ? undefined : bookingForm.paymentMethod,
          paymentAccountId: bookingForm.isCod ? undefined : bookingForm.paymentAccountId,
          paymentReference: bookingForm.paymentReference || undefined,
          notes: bookingForm.notes || undefined,
          dispatchType: bookingForm.dispatchType,
          transportName: bookingForm.transportName || undefined,
          lrNumber: bookingForm.lrNumber || undefined,
          transportChargesType: bookingForm.transportChargesType || undefined,
          transportBy: bookingForm.transportBy || undefined,
          awbNumber: bookingForm.awbNumber || undefined,
          courierBy: bookingForm.courierBy || undefined,
          deliveryBoyName: bookingForm.deliveryBoyName || undefined,
          collectedByName: bookingForm.collectedByName || undefined,
          collectedByPhone: bookingForm.collectedByPhone || undefined,
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      alert(`✅ ${orderIds.length} order(s) sent to Accounts for approval!`);
      setBookingModal(false); setSelectedOrderIds(new Set()); setBookingItems({}); setRates([]);
      await load();
    } finally { setBookingSubmitting(false); }
  }

  // ── Filtered orders ────────────────────────────────────────────────────────
  // Get current user for agent filtering
  const currentUser = (() => {
    try { const r = localStorage.getItem("rareprint_user"); return r ? JSON.parse(r) : null; } catch { return null; }
  })();
  const agentOrders = currentUser?.role === "SALES_AGENT"
    ? orders.filter(o => o.salesAgentName === currentUser.fullName)
    : orders;
  const allOrders        = agentOrders;
  const inProgressOrders = agentOrders.filter(o => IN_PROGRESS_STATUSES.includes(o.status));

  const filteredOrders = useMemo(() => {
    const base = activeTab === "all" ? allOrders : activeTab === "inprogress" ? inProgressOrders : readyOrders;
    const q = search.trim().toLowerCase();
    return base.filter(o => {
      const matchSearch = !q ||
        o.orderNo?.toLowerCase().includes(q) ||
        o.customerName?.toLowerCase().includes(q) ||
        o.customerPhone?.includes(q) ||
        o.salesAgentName?.toLowerCase().includes(q) ||
        o.products?.toLowerCase().includes(q);
      const matchStatus = statusFilter === "ALL" || o.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [orders, readyOrders, activeTab, search, statusFilter]);

  const tabs = [
    { key: "all",        label: "All Orders",         count: allOrders.length },
    { key: "inprogress", label: "In Progress",         count: inProgressOrders.length },
    { key: "dispatch",   label: "Ready for Dispatch",  count: readyOrders.length },
  ] as const;

  function renderProductsCell(o: Order) {
    if (o.itemDetails && o.itemDetails.length > 0) {
      return (
        <td className="px-2 py-1.5 align-top">
          <div style={{ minWidth: "300px" }}>
            {o.itemDetails.map((item, i) => (
              <div key={i} className="flex items-center gap-2 py-0.5 border-b border-slate-50 last:border-0 text-xs">
                <span className="text-slate-800 font-medium" style={{ minWidth: "70px" }}>{item.productName}</span>
                <span className="text-slate-500" style={{ minWidth: "35px" }}>{item.size ?? "—"}</span>
                <span className="text-slate-500" style={{ minWidth: "28px" }}>{item.gsm ?? "—"}</span>
                <span className="text-slate-500" style={{ minWidth: "35px" }}>{item.sides ?? "—"}</span>
                <span className="text-slate-500" style={{ minWidth: "20px" }}>{item.quantity}</span>
                <span className="font-semibold text-emerald-700 whitespace-nowrap" style={{ minWidth: "60px" }}>{fmt(item.lineTotal)}</span>
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap ${itemStageColors[item.itemProductionStage] ?? "bg-gray-100 text-gray-600"}`}>
                  {itemStageLabels[item.itemProductionStage] ?? item.itemProductionStage}
                </span>
              </div>
            ))}
          </div>
        </td>
      );
    }
    return (
      <td className="px-2 py-1.5 text-slate-600 align-top" style={{ minWidth: "180px" }}>
        <div className="space-y-0.5">
          {o.products.split(' | ').map((p, i) => <div key={i} className="text-xs leading-snug">{p}</div>)}
        </div>
      </td>
    );
  }

  return (
    <>
      <DashboardShell>
        <div className="p-4 lg:p-5">
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Orders</h1>
                <p className="text-xs text-slate-500 mt-0.5">Create and track sales orders.</p>
              </div>
              <button onClick={() => router.push("/orders/create")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700">
                <Plus className="h-3.5 w-3.5" /> Create New Order
              </button>
            </div>

            {/* Search + Filter */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search order, customer, phone, agent…"
                  className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
              </div>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400 bg-white">
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s === "ALL" ? "All Statuses" : s.replace(/_/g, " ")}</option>
                ))}
              </select>
              {(search || statusFilter !== "ALL") && (
                <button onClick={() => { setSearch(""); setStatusFilter("ALL"); }}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 flex items-center gap-1">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
              <span className="text-xs text-slate-400 self-center">{filteredOrders.length} result{filteredOrders.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Tabs */}
            <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 w-fit">
              {tabs.map(tab => (
                <button key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSelectedOrderIds(new Set()); setCustomerError(null); }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${activeTab === tab.key ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {customerError && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />{customerError}
              </div>
            )}

            {activeTab === "dispatch" && selectedOrderIds.size > 0 && (
              <div className="flex items-center justify-between rounded-lg bg-indigo-50 border border-indigo-200 px-3 py-2">
                <div className="text-xs text-indigo-800">
                  <strong>{selectedOrderIds.size}</strong> order{selectedOrderIds.size > 1 ? "s" : ""} selected
                  {selectedOrders.length > 0 && <span className="ml-1.5">— {selectedOrders[0].customerName}</span>}
                  <span className="ml-2 font-semibold">Balance: {fmt(totalBalance)}</span>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => { setSelectedOrderIds(new Set()); setCustomerError(null); }}
                    className="rounded-md border border-indigo-200 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100">Clear</button>
                  <button onClick={openBookingModal}
                    className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700">
                    <Truck className="h-3.5 w-3.5" />Book Shipment
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ overflowX: "auto" }}>
                <table className="w-full text-left text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      {activeTab === "dispatch" && <th className="px-2 py-2 w-8 font-semibold border-b border-slate-200" style={TH}></th>}
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Date</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Age</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Order No</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Customer</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Phone</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Agent</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>
                        <div className="flex items-center gap-3">
                          <span style={{ minWidth: "70px" }}>Product</span>
                          <span style={{ minWidth: "35px" }}>Size</span>
                          <span style={{ minWidth: "28px" }}>GSM</span>
                          <span style={{ minWidth: "35px" }}>Sides</span>
                          <span style={{ minWidth: "20px" }}>Qty</span>
                          <span style={{ minWidth: "60px" }}>Amt</span>
                          <span>Stage</span>
                        </div>
                      </th>
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Total</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Paid</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Balance</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Actions</th>
                      {activeTab === "dispatch" && <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Ready</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-400 text-sm">No orders found.</td></tr>
                    ) : filteredOrders.map((o) => (
                      <React.Fragment key={o.id}>
                        <tr className={`hover:bg-slate-50 ${selectedOrderIds.has(o.id) ? "bg-indigo-50" : ""}`}>
                          {activeTab === "dispatch" && (
                            <td className="px-2 py-1.5 align-top">
                              <button onClick={() => toggleOrderSelection(o.id, o.customerName)}>
                                {selectedOrderIds.has(o.id) ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                              </button>
                            </td>
                          )}
                          <td className="px-2 py-1.5 text-slate-500 align-top whitespace-nowrap">
                            {new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </td>
                          <td className="px-2 py-1.5 align-top whitespace-nowrap">
                            <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(o.date)}`}>{orderAge(o.date)}</span>
                          </td>
                          {/* Short order number */}
                          <td className="px-2 py-1.5 font-bold text-blue-700 align-top whitespace-nowrap" style={{ maxWidth: "70px" }}>
                            {o.orderNo}
                          </td>
                          <td className="px-2 py-1.5 text-slate-700 align-top" style={{ maxWidth: "100px" }}>
                            <div style={{ wordBreak: "break-word", lineHeight: "1.3" }}>{o.customerName}</div>
                          </td>
                          <td className="px-2 py-1.5 text-slate-500 align-top whitespace-nowrap">{o.customerPhone ?? "—"}</td>
                          <td className="px-2 py-1.5 align-top whitespace-nowrap">
                            {o.salesAgentName
                              ? <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{o.salesAgentName}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          {renderProductsCell(o)}
                          <td className="px-2 py-1.5 font-medium align-top whitespace-nowrap">{fmt(o.totalAmount)}</td>
                          <td className="px-2 py-1.5 text-emerald-700 font-medium align-top whitespace-nowrap">{fmt(o.advancePaid)}</td>
                          <td className="px-2 py-1.5 text-red-600 font-medium align-top whitespace-nowrap">{fmt(o.balanceDue)}</td>
                          <td className="px-2 py-1.5 align-top">
                            <div className="flex flex-wrap gap-1 max-w-[160px]">
                              {/* Pay button */}
                              <button onClick={() => { setPaymentModal(o); setNewPayment(p => ({ ...p, paymentAccountId: accounts[0]?.id ?? "" })); }}
                                className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-emerald-700">
                                <Plus className="h-2.5 w-2.5" /> Pay
                              </button>
                              {/* History */}
                              <button onClick={() => togglePayments(o.id)}
                                className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                {expandedPayments === o.id ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                                Hist
                              </button>
                              {/* Journey */}
                              <button onClick={() => toggleJourney(o.id)}
                                className="inline-flex items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100">
                                {expandedJourney === o.id ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                                Journey
                              </button>
                              {/* Attach design file */}
                              {/* Edit button - only for pending approval */}
                              {o.status === "PENDING_APPROVAL" && (
                                <button onClick={() => router.push(`/orders/edit?id=${o.id}`)}
                                  className="inline-flex items-center gap-0.5 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-100">
                                  ✏️ Edit
                                </button>
                              )}
                              {o.status === "PENDING_APPROVAL" && (
                                <button onClick={async () => {
                                  if (!confirm(`Delete order ${o.orderNo}? Cannot be undone.`)) return;
                                  const res = await fetch(`${API_BASE_URL}/orders/${o.id}`, { method: "DELETE", headers: getAuthHeaders() });
                                  if (res.ok) { alert("Order deleted!"); load(); } else { alert("Delete failed"); }
                                }} className="inline-flex items-center gap-0.5 rounded-md border border-red-200 bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100">
                                  🗑️ Del
                                </button>
                              )}
                              {o.items && o.items.length > 0 && (
                                <button onClick={async () => { setFileModalOrder(o); const r = await fetch(`${API_BASE_URL}/orders/${o.id}/items`, { headers: getAuthHeaders() }); if (r.ok) setFileModalItems(await r.json()); }}
                                  className="inline-flex items-center gap-0.5 rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700 hover:bg-purple-100">
                                  <Paperclip className="h-2.5 w-2.5" /> Files
                                </button>
                              )}
                            </div>
                          </td>
                          {activeTab === "dispatch" && (
                            <td className="px-2 py-1.5 align-top">
                              <span className="rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap">
                                {o.readyItemsCount ?? 0}/{o.totalItemsCount ?? 0}
                              </span>
                            </td>
                          )}
                        </tr>

                        {/* Payment history row */}
                        {expandedPayments === o.id && (
                          <tr>
                            <td colSpan={12} className="bg-slate-50 px-6 py-3">
                              {!orderPayments[o.id] ? <Loader2 className="h-4 w-4 animate-spin" />
                                : orderPayments[o.id].length === 0 ? <p className="text-xs text-slate-400">No payments recorded yet.</p>
                                : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-slate-400 border-b border-slate-100">
                                        {["Date","Amount","Method","Account","Reference","Notes"].map(h => (
                                          <th key={h} className="pb-1 text-left font-medium">{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {orderPayments[o.id].map(p => (
                                        <tr key={p.id}>
                                          <td className="py-1">{new Date(p.paymentDate).toLocaleDateString("en-IN")}</td>
                                          <td className="py-1 font-semibold text-emerald-700">{fmt(Number(p.amount))}</td>
                                          <td className="py-1">{METHOD_LABELS[p.method] ?? p.method}</td>
                                          <td className="py-1">{p.paymentAccount.name}</td>
                                          <td className="py-1 text-slate-400">{p.referenceNumber ?? "—"}</td>
                                          <td className="py-1 text-slate-400">{p.notes ?? "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                            </td>
                          </tr>
                        )}

                        {/* Order Journey row */}
                        {expandedJourney === o.id && (
                          <tr>
                            <td colSpan={13} className="bg-blue-50 px-6 py-3 border-t border-blue-100">
                              <p className="text-xs font-semibold text-blue-800 mb-2">Order Journey</p>
                              {!orderJourneys[o.id] ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                                : orderJourneys[o.id].length === 0 ? <p className="text-xs text-slate-400">No status changes recorded.</p>
                                : (
                                  <div className="flex flex-wrap gap-1 max-w-[160px]">
                                    {orderJourneys[o.id].map((log: any, idx: number) => (
                                      <div key={log.id} className="flex items-center gap-2 text-xs">
                                        <span className="text-slate-400 whitespace-nowrap">{new Date(log.changedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                        <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-medium">{log.fromStatus?.replace(/_/g,' ') ?? '—'}</span>
                                        <span className="text-slate-400">→</span>
                                        <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 font-semibold">{log.toStatus?.replace(/_/g,' ')}</span>
                                        <span className="text-slate-500">by <strong>{log.changedBy}</strong></span>
                                        {log.reason && <span className="text-slate-400 italic truncate max-w-xs">{log.reason}</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DashboardShell>

      {/* ── Design File Upload Modal ─────────────────────────────────────── */}
      {fileModalOrder && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.6)", padding: "1rem" }}>
          <div style={{ width: "100%", maxWidth: "30rem", background: "white", borderRadius: "1rem", border: "1px solid #e2e8f0", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Attach Design Files</h2>
                <p className="text-xs text-slate-500 mt-0.5">{fileModalOrder.orderNo} — {fileModalOrder.customerName}</p>
              </div>
              <button onClick={() => { setFileModalOrder(null); setFileModalItems([]); }}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {(fileModalItems.length > 0 ? fileModalItems : (fileModalOrder.items ?? [])).map((item: any, idx: number) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-bold">Item {idx + 1}</span>
                      <span className="text-sm font-medium text-slate-800">{item.productName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {uploadingItemId === item.id && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                      <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden"
                        accept="image/*,.pdf,.zip,.ai,.psd,.cdr,.eps,.svg"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadDesignFile(item.id, f); }} />
                      <button onClick={() => fileInputRefs.current[item.id]?.click()} disabled={uploadingItemId === item.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                        <Upload className="h-3.5 w-3.5" />
                        {uploadingItemId === item.id ? "Uploading…" : "Upload File"}
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">Accepted: PDF, AI, PSD, CDR, PNG, JPG, SVG, EPS, ZIP</p>
                  {Array.isArray(item.designFiles) && item.designFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-semibold text-slate-600">Uploaded Files:</p>
                      {item.designFiles.map((f: any) => (
                        <div key={f.filename} className="flex items-center justify-between rounded bg-white border border-slate-200 px-2 py-1 mt-1">
                          <span className="text-xs text-slate-700 truncate max-w-[180px]">{f.originalName}</span>
                          <span className="text-xs text-slate-400 ml-2">{Math.round(f.size / 1024)}KB</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button onClick={() => { setFileModalOrder(null); setFileModalItems([]); }}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment Modal ──────────────────────────────────────────────────── */}
      {paymentModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.6)", padding: "1rem" }}>
          <div style={{ width: "100%", maxWidth: "28rem", background: "white", borderRadius: "1rem", border: "1px solid #e2e8f0", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Add Payment</h2>
                <p className="text-sm text-slate-500">{paymentModal.orderNo} — Balance: {fmt(paymentModal.balanceDue)}</p>
              </div>
              <button onClick={() => setPaymentModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Date *</label>
                <input type="date" value={newPayment.paymentDate} onChange={e => setNewPayment(p => ({ ...p, paymentDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Amount (₹) *</label>
                <input type="number" placeholder="0.00" value={newPayment.amount} onChange={e => setNewPayment(p => ({ ...p, amount: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method *</label>
                <select value={newPayment.method} onChange={e => setNewPayment(p => ({ ...p, method: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Received In Account *</label>
                <select value={newPayment.paymentAccountId} onChange={e => setNewPayment(p => ({ ...p, paymentAccountId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Select account...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} {a.bankName ? `(${a.bankName})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reference / UTR</label>
                <input type="text" placeholder="UTR / Cheque no." value={newPayment.referenceNumber} onChange={e => setNewPayment(p => ({ ...p, referenceNumber: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea rows={2} value={newPayment.notes} onChange={e => setNewPayment(p => ({ ...p, notes: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPaymentModal(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitPayment} disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Booking Modal ──────────────────────────────────────────────────── */}
      {bookingModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, overflowY: "auto", background: "rgba(15,23,42,0.6)" }}>
          <div style={{ minHeight: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "2rem" }}>
            <div style={{ width: "100%", maxWidth: "42rem", background: "white", borderRadius: "1rem", border: "1px solid #e2e8f0", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", marginBottom: "2rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", padding: "1rem 1.5rem" }}>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Book Shipment</h2>
                  <p className="text-sm text-slate-500">{selectedOrders.length} order{selectedOrders.length > 1 ? "s" : ""} — {selectedOrders[0]?.customerName}</p>
                </div>
                <button onClick={() => setBookingModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
              </div>
              <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-xs text-slate-500">Total Order Value</p><p className="font-bold text-slate-900 text-lg">{fmt(totalAmount)}</p></div>
                    <div><p className="text-xs text-slate-500">Total Paid</p><p className="font-bold text-emerald-600 text-lg">{fmt(totalAmount - totalBalance)}</p></div>
                    <div><p className="text-xs text-slate-500">Total Balance Due</p><p className="font-bold text-red-500 text-lg">{fmt(totalBalance)}</p></div>
                  </div>
                </div>
                {/* Shipping Info */}
                {selectedOrders.length > 0 && (
                  <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 space-y-2">
                    <p className="text-xs font-semibold text-blue-800 uppercase tracking-wide">Shipment Info</p>
                    {selectedOrders.map(o => (
                      <div key={o.id} className="text-xs text-slate-700 border-b border-blue-100 pb-1 last:border-0">
                        <span className="font-bold text-blue-700">{o.orderNo}</span>
                        {o.customerPhone && <span className="ml-2 text-slate-500">📞 {o.customerPhone}</span>}
                        {o.shippingAddress && <div className="text-slate-600 mt-0.5">📍 {o.shippingAddress}</div>}
                        {bookingItems[o.id]?.map((item, i) => { const n = parseNotes(item.productionNotes); return <div key={i} className="ml-2 mt-0.5 text-slate-500">• {item.productName}{n.size ? ` · ${n.size}"` : ""}{n.gsm ? ` · ${n.gsm} GSM` : ""} × {item.quantity}</div>; })}
                      </div>
                    ))}
                  </div>
                )}
                {/* Dispatch Method */}
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Dispatch Method</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {[{key:"COURIER",label:"🚚 Courier"},{key:"TRANSPORT",label:"🚛 Transport"},{key:"BY_HAND",label:"🚶 By Hand"},{key:"SELF_COLLECTED",label:"🏪 Self Collected"}].map(dt => (
                      <button key={dt.key} onClick={() => setBookingForm(p => ({ ...p, dispatchType: dt.key }))}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold text-left transition ${bookingForm.dispatchType === dt.key ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600"}`}>
                        {dt.label}
                      </button>
                    ))}
                  </div>
                  {bookingForm.dispatchType === "COURIER" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-xs font-medium text-slate-600 mb-1">Courier Name</label><input value={bookingForm.transportName} onChange={e => setBookingForm(p => ({ ...p, transportName: e.target.value }))} placeholder="Delhivery, DTDC..." className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                      <div><label className="block text-xs font-medium text-slate-600 mb-1">AWB Number</label><input value={bookingForm.awbNumber} onChange={e => setBookingForm(p => ({ ...p, awbNumber: e.target.value }))} placeholder="AWB / Tracking No" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                      <div className="col-span-2"><label className="block text-xs font-medium text-slate-600 mb-1">Courier By</label><input value={bookingForm.courierBy} onChange={e => setBookingForm(p => ({ ...p, courierBy: e.target.value }))} placeholder="Staff name" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                    </div>
                  )}
                  {bookingForm.dispatchType === "TRANSPORT" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-xs font-medium text-slate-600 mb-1">Transport Name</label><input value={bookingForm.transportName} onChange={e => setBookingForm(p => ({ ...p, transportName: e.target.value }))} placeholder="Transport company" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                      <div><label className="block text-xs font-medium text-slate-600 mb-1">LR Number</label><input value={bookingForm.lrNumber} onChange={e => setBookingForm(p => ({ ...p, lrNumber: e.target.value }))} placeholder="Lorry Receipt No" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                      <div><label className="block text-xs font-medium text-slate-600 mb-1">Charges Type</label><select value={bookingForm.transportChargesType} onChange={e => setBookingForm(p => ({ ...p, transportChargesType: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs bg-white"><option value="TOPAY">To Pay</option><option value="PREPAID">Prepaid</option></select></div>
                      <div><label className="block text-xs font-medium text-slate-600 mb-1">Transport By</label><input value={bookingForm.transportBy} onChange={e => setBookingForm(p => ({ ...p, transportBy: e.target.value }))} placeholder="Staff name" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                    </div>
                  )}
                  {bookingForm.dispatchType === "BY_HAND" && (
                    <div><label className="block text-xs font-medium text-slate-600 mb-1">Delivery Boy Name</label><input value={bookingForm.deliveryBoyName} onChange={e => setBookingForm(p => ({ ...p, deliveryBoyName: e.target.value }))} placeholder="Name of delivery person" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                  )}
                  {bookingForm.dispatchType === "SELF_COLLECTED" && (
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="block text-xs font-medium text-slate-600 mb-1">Collected By Name</label><input value={bookingForm.collectedByName} onChange={e => setBookingForm(p => ({ ...p, collectedByName: e.target.value }))} placeholder="Customer rep name" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                      <div><label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label><input value={bookingForm.collectedByPhone} onChange={e => setBookingForm(p => ({ ...p, collectedByPhone: e.target.value }))} placeholder="Contact number" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs" /></div>
                    </div>
                  )}
                </div>
                {bookingForm.dispatchType === "COURIER" && <div>
                  <div className="flex items-center gap-3 mb-2">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Courier Rates</p>
                    <button onClick={fetchRates} disabled={ratesLoading}
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60">
                      {ratesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                      Fetch Shiprocket Rates
                    </button>
                  </div>
                  {rates.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {rates.map((r, i) => (
                        <button key={i} onClick={() => setBookingForm(p => ({ ...p, courierCharges: r.amount.toString() }))}
                          className={`rounded-lg border p-2 text-xs text-left transition ${bookingForm.courierCharges === r.amount.toString() ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                          <p className="font-semibold text-slate-800">{r.carrierName}</p>
                          <p className="text-blue-700 font-bold">{fmt(r.amount)}</p>
                          <p className="text-slate-500">~{r.estimatedDays} days</p>
                        </button>
                      ))}
                    </div>
                  )}
                  <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Courier Charges (₹) *</label>
                  <input type="number" placeholder="Enter courier charges" value={bookingForm.courierCharges}
                    onChange={e => setBookingForm(p => ({ ...p, courierCharges: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                  </div>
                </div>}
                <div className={`rounded-xl border px-4 py-3 ${bookingForm.isCod ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="cod" checked={bookingForm.isCod} onChange={e => setBookingForm(p => ({ ...p, isCod: e.target.checked }))} className="h-4 w-4" />
                    <label htmlFor="cod" className={`text-sm font-semibold cursor-pointer ${bookingForm.isCod ? "text-orange-800" : "text-slate-700"}`}>Cash on Delivery (COD)</label>
                  </div>
                  {bookingForm.isCod && (
                    <div className="mt-3 space-y-2">
                      <div className="rounded-lg bg-orange-100 border border-orange-200 px-3 py-2 text-xs text-orange-800">
                        Suggested COD = Balance ({fmt(totalBalance)}) + Courier ({fmt(courierNum)}) = <strong>{fmt(suggestedCod)}</strong>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">COD Amount (₹)</label>
                        <input type="number" placeholder={suggestedCod.toString()} value={bookingForm.codAmount}
                          onChange={e => setBookingForm(p => ({ ...p, codAmount: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                      </div>
                    </div>
                  )}
                </div>
                {!bookingForm.isCod && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-semibold text-emerald-800 mb-3 uppercase tracking-wide">Payment Receipt (Prepaid)</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method</label>
                        <select value={bookingForm.paymentMethod} onChange={e => setBookingForm(p => ({ ...p, paymentMethod: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                          {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Received In Account</label>
                        <select value={bookingForm.paymentAccountId} onChange={e => setBookingForm(p => ({ ...p, paymentAccountId: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                          <option value="">Select account...</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-slate-700 mb-1">Reference / UTR Number</label>
                        <input type="text" placeholder="UTR / Transaction ID" value={bookingForm.paymentReference}
                          onChange={e => setBookingForm(p => ({ ...p, paymentReference: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                      </div>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Notes for Accounts Team</label>
                  <textarea rows={2} value={bookingForm.notes} onChange={e => setBookingForm(p => ({ ...p, notes: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", borderTop: "1px solid #e2e8f0", padding: "1rem 1.5rem" }}>
                <button onClick={() => setBookingModal(false)}
                  style={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", padding: "0.5rem 1rem", fontSize: "0.875rem", fontWeight: 500, color: "#334155", background: "white", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={submitBooking} disabled={bookingSubmitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", borderRadius: "0.5rem", border: "none", background: "#4f46e5", padding: "0.5rem 1.5rem", fontSize: "0.875rem", fontWeight: 600, color: "white", cursor: "pointer", opacity: bookingSubmitting ? 0.6 : 1 }}>
                  {bookingSubmitting ? <Loader2 style={{ width: 16, height: 16 }} /> : <Truck style={{ width: 16, height: 16 }} />}
                  Send to Accounts for Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}










