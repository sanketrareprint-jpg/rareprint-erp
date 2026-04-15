"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, X, CreditCard, ChevronDown, ChevronUp, Truck, CheckSquare, Square, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

type ItemDetail = {
  productName: string;
  size: string | null;
  gsm: string | null;
  sides: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  itemProductionStage: string;
};

type Order = {
  id: string; orderNo: string; customerName: string; customerId?: string;
  products: string; totalAmount: number; advancePaid: number;
  balanceDue: number; status: string; date: string;
  readyItemsCount?: number; totalItemsCount?: number;
  itemDetails?: ItemDetail[];
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

const itemStageColors: Record<string, string> = {
  NOT_PRINTED: "bg-gray-100 text-gray-600",
  PRINTING: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-yellow-100 text-yellow-700",
  READY_FOR_DISPATCH: "bg-green-100 text-green-700",
};

const itemStageLabels: Record<string, string> = {
  NOT_PRINTED: "Not Printed",
  PRINTING: "Printing",
  PROCESSING: "Processing",
  READY_FOR_DISPATCH: "Ready",
};

const IN_PROGRESS_STATUSES = ["APPROVED", "IN_PRODUCTION"];

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

function parseNotes(notes?: string) {
  const size = notes?.match(/Size:\s*([^,]+)/)?.[1]?.trim();
  const gsm = notes?.match(/GSM:\s*([^,]+)/)?.[1]?.trim();
  const sides = notes?.match(/Sides:\s*([^,]+)/)?.[1]?.trim();
  return { size, gsm, sides };
}

const TH_STYLE = { background: "#f8fafc", position: "sticky" as const, top: 0, zIndex: 10 };

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "inprogress" | "dispatch">("all");
  const [expandedPayments, setExpandedPayments] = useState<string | null>(null);
  const [orderPayments, setOrderPayments] = useState<Record<string, Payment[]>>({});
  const [paymentModal, setPaymentModal] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
    paymentReference: "", paymentNotes: "", notes: "",
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
    setReadyOrders(rRes.ok ? await rRes.json() : []);
    const accs = await aRes.json();
    setAccounts(accs);
    if (accs.length > 0) setBookingForm(p => ({ ...p, paymentAccountId: accs[0].id }));
    setLoading(false);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function loadPayments(orderId: string) {
    const res = await fetch(`${API_BASE_URL}/orders/${orderId}/payments`, { headers: getAuthHeaders() });
    const data = await res.json();
    setOrderPayments(prev => ({ ...prev, [orderId]: data }));
  }

  async function togglePayments(orderId: string) {
    if (expandedPayments === orderId) { setExpandedPayments(null); return; }
    setExpandedPayments(orderId);
    if (!orderPayments[orderId]) await loadPayments(orderId);
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

  function toggleOrderSelection(orderId: string, customerName: string) {
    setCustomerError(null);
    const selected = readyOrders.filter(o => selectedOrderIds.has(o.id));
    if (!selectedOrderIds.has(orderId)) {
      if (selected.length > 0 && selected[0].customerName !== customerName) {
        setCustomerError(`Cannot combine orders from different customers. Selected orders are for "${selected[0].customerName}".`);
        return;
      }
    }
    setSelectedOrderIds(prev => {
      const s = new Set(prev);
      if (s.has(orderId)) s.delete(orderId); else s.add(orderId);
      return s;
    });
  }

  async function openBookingModal() {
    if (selectedOrderIds.size === 0) { alert("Please select at least one order"); return; }
    setBookingModal(true);
    setRates([]);
    setItemsLoading(true);
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
  const totalAmount = selectedOrders.reduce((s, o) => s + o.totalAmount, 0);
  const courierNum = Number(bookingForm.courierCharges || 0);
  const suggestedCod = totalBalance + courierNum;

  async function submitBooking() {
    if (selectedOrderIds.size === 0) return;
    if (!bookingForm.courierCharges) { alert("Please enter courier charges"); return; }
    if (!bookingForm.isCod && !bookingForm.paymentAccountId) { alert("Please select payment account"); return; }
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
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      alert(`✅ ${orderIds.length} order(s) sent to Accounts for final approval!`);
      setBookingModal(false);
      setSelectedOrderIds(new Set());
      setBookingItems({});
      setRates([]);
      await load();
    } finally { setBookingSubmitting(false); }
  }

  const allOrders = orders;
  const inProgressOrders = orders.filter(o => IN_PROGRESS_STATUSES.includes(o.status));
  const displayOrders = activeTab === "all" ? allOrders : activeTab === "inprogress" ? inProgressOrders : readyOrders;

  const tabs = [
    { key: "all", label: "All Orders", count: allOrders.length },
    { key: "inprogress", label: "In Progress", count: inProgressOrders.length },
    { key: "dispatch", label: "Ready for Dispatch", count: readyOrders.length },
  ] as const;

  function renderProductsCell(o: Order) {
    if (o.itemDetails && o.itemDetails.length > 0) {
      return (
        <td className="px-2 py-1.5 align-top">
          <div style={{ minWidth: "320px" }}>
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
          {o.products.split(' | ').map((p, i) => (
            <div key={i} className="text-xs leading-snug">{p}</div>
          ))}
        </div>
      </td>
    );
  }

  return (
    <>
      <DashboardShell>
        <div className="p-4 lg:p-5">
          <div className="space-y-3">

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
                  {selectedOrders.length > 0 && <span className="ml-1.5 text-indigo-600">— {selectedOrders[0].customerName}</span>}
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

            {activeTab === "dispatch" && selectedOrderIds.size === 0 && readyOrders.length > 0 && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
                💡 Select orders to combine into one shipment.
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm" style={{ overflowX: "auto" }}>
                <table className="w-full text-left text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      {activeTab === "dispatch" && <th className="px-2 py-2 w-8 font-semibold" style={TH_STYLE}></th>}
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH_STYLE}>Date</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH_STYLE}>Order No</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH_STYLE}>Customer</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH_STYLE}>
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
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH_STYLE}>Total</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH_STYLE}>Paid</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH_STYLE}>Balance</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH_STYLE}>Actions</th>
                      {activeTab === "dispatch" && <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH_STYLE}>Ready</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayOrders.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-10 text-center text-slate-400 text-sm">No orders found.</td></tr>
                    ) : displayOrders.map((o) => (
                      <React.Fragment key={o.id}>
                        <tr className={`hover:bg-slate-50 ${selectedOrderIds.has(o.id) ? "bg-indigo-50" : ""}`}>
                          {activeTab === "dispatch" && (
                            <td className="px-2 py-1.5 align-top">
                              <button onClick={() => toggleOrderSelection(o.id, o.customerName)}>
                                {selectedOrderIds.has(o.id)
                                  ? <CheckSquare className="h-4 w-4 text-indigo-600" />
                                  : <Square className="h-4 w-4 text-slate-400" />}
                              </button>
                            </td>
                          )}
                          <td className="px-2 py-1.5 text-slate-500 align-top whitespace-nowrap">
                            {new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </td>
                          <td className="px-2 py-1.5 font-medium text-slate-800 align-top" style={{ maxWidth: "110px", wordBreak: "break-all" }}>
                            {o.orderNo}
                          </td>
                          <td className="px-2 py-1.5 text-slate-700 align-top" style={{ maxWidth: "100px" }}>
                            <div style={{ wordBreak: "break-word", lineHeight: "1.3" }}>{o.customerName}</div>
                          </td>
                          {renderProductsCell(o)}
                          <td className="px-2 py-1.5 font-medium align-top whitespace-nowrap">{fmt(o.totalAmount)}</td>
                          <td className="px-2 py-1.5 text-emerald-700 font-medium align-top whitespace-nowrap">{fmt(o.advancePaid)}</td>
                          <td className="px-2 py-1.5 text-red-600 font-medium align-top whitespace-nowrap">{fmt(o.balanceDue)}</td>
                          <td className="px-2 py-1.5 align-top">
                            <div className="flex gap-1 flex-col">
                              <button onClick={() => { setPaymentModal(o); setNewPayment(p => ({ ...p, paymentAccountId: accounts[0]?.id ?? "" })); }}
                                className="inline-flex items-center gap-0.5 rounded-md bg-emerald-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-emerald-700">
                                <Plus className="h-2.5 w-2.5" /> Pay
                              </button>
                              <button onClick={() => togglePayments(o.id)}
                                className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                                {expandedPayments === o.id ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                                Hist
                              </button>
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
                        {expandedPayments === o.id && (
                          <tr>
                            <td colSpan={activeTab === "dispatch" ? 10 : 9} className="bg-slate-50 px-6 py-3">
                              {!orderPayments[o.id] ? <Loader2 className="h-4 w-4 animate-spin" />
                                : orderPayments[o.id].length === 0 ? <p className="text-xs text-slate-400">No payments recorded yet.</p>
                                : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-slate-400 border-b border-slate-100">
                                        {["Date", "Amount", "Method", "Account", "Reference", "Notes"].map(h => (
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
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DashboardShell>

      {/* Payment Modal */}
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
                <input type="date" value={newPayment.paymentDate}
                  onChange={e => setNewPayment(p => ({ ...p, paymentDate: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Amount (₹) *</label>
                <input type="number" placeholder="0.00" value={newPayment.amount}
                  onChange={e => setNewPayment(p => ({ ...p, amount: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Payment Method *</label>
                <select value={newPayment.method} onChange={e => setNewPayment(p => ({ ...p, method: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Received In Account *</label>
                <select value={newPayment.paymentAccountId} onChange={e => setNewPayment(p => ({ ...p, paymentAccountId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">Select account...</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name} {a.bankName ? `(${a.bankName})` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reference / UTR Number</label>
                <input type="text" placeholder="UTR / Cheque no. / Transaction ID" value={newPayment.referenceNumber}
                  onChange={e => setNewPayment(p => ({ ...p, referenceNumber: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
                <textarea rows={2} placeholder="Any remarks..." value={newPayment.notes}
                  onChange={e => setNewPayment(p => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPaymentModal(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitPayment} disabled={submitting}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                Save Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Modal */}
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
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Orders & Ready Items</p>
                  {itemsLoading ? <Loader2 className="h-5 w-5 animate-spin text-blue-600" /> : (
                    <div className="space-y-3">
                      {selectedOrders.map(o => (
                        <div key={o.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900 text-sm">{o.orderNo}</span>
                              <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-semibold">
                                {o.readyItemsCount ?? 0}/{o.totalItemsCount ?? 0} ready
                              </span>
                            </div>
                            <div className="text-xs text-slate-600 flex gap-3">
                              <span>Total: <strong>{fmt(o.totalAmount)}</strong></span>
                              <span className="text-emerald-600">Paid: <strong>{fmt(o.advancePaid)}</strong></span>
                              <span className="text-red-500">Balance: <strong>{fmt(o.balanceDue)}</strong></span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {(bookingItems[o.id] ?? []).map((item, idx) => {
                              const { size, gsm, sides } = parseNotes(item.productionNotes);
                              return (
                                <div key={item.id} className="flex items-center gap-2 text-xs text-slate-600 bg-white rounded-lg border border-slate-100 px-3 py-1.5">
                                  <span className="rounded-full bg-indigo-100 text-indigo-700 px-1.5 py-0.5 font-bold">{o.orderNo}-{idx + 1}</span>
                                  <span className="font-medium text-slate-800">{item.productName}</span>
                                  <span>Qty: {item.quantity}</span>
                                  {size && <span>Size: {size}</span>}
                                  {gsm && <span>GSM: {gsm}</span>}
                                  {sides && <span>{sides === "SINGLE_SIDE" ? "Single" : "Double"}</span>}
                                  <span className="ml-auto font-semibold text-emerald-700">{fmt(item.lineTotal)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-xs text-slate-500">Total Order Value</p><p className="font-bold text-slate-900 text-lg">{fmt(totalAmount)}</p></div>
                    <div><p className="text-xs text-slate-500">Total Paid</p><p className="font-bold text-emerald-600 text-lg">{fmt(totalAmount - totalBalance)}</p></div>
                    <div><p className="text-xs text-slate-500">Total Balance Due</p><p className="font-bold text-red-500 text-lg">{fmt(totalBalance)}</p></div>
                  </div>
                </div>
                <div>
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
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Courier Charges (₹) *</label>
                  <input type="number" placeholder="Enter courier charges" value={bookingForm.courierCharges}
                    onChange={e => setBookingForm(p => ({ ...p, courierCharges: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                </div>
                <div className={`rounded-xl border px-4 py-3 ${bookingForm.isCod ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-3">
                    <input type="checkbox" id="cod" checked={bookingForm.isCod}
                      onChange={e => setBookingForm(p => ({ ...p, isCod: e.target.checked }))} className="h-4 w-4" />
                    <label htmlFor="cod" className={`text-sm font-semibold cursor-pointer ${bookingForm.isCod ? "text-orange-800" : "text-slate-700"}`}>
                      Cash on Delivery (COD)
                    </label>
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
                  <textarea rows={2} placeholder="Any notes about this dispatch..." value={bookingForm.notes}
                    onChange={e => setBookingForm(p => ({ ...p, notes: e.target.value }))}
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