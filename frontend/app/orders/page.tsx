"use client";
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import DateInput from "@/components/DateInput";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import {
  Loader2, Plus, X, CreditCard, ChevronDown, ChevronUp,
  Truck, CheckSquare, Square, AlertTriangle, Search,
  Paperclip, Upload, FileText, Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useIsNativeApp } from "@/lib/useIsNativeApp";

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
  balanceDue: number; status: string; date: string; isTest?: boolean;
  marginPct?: number | null; marginTotal?: number | null; costTotal?: number | null;
  commissionTotal?: number | null; commissionPctOfSale?: number | null;
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
  verificationStatus?: string;
};
type RateQuote = { carrierName: string; amount: number; estimatedDays: number; rateId?: string; };
type PagedOrders = { data: Order[]; page: number; limit: number; total: number; hasMore: boolean };

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
const ORDER_PAGE_SIZE = 25;

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

function marginText(value?: number | null) {
  return value === null || value === undefined ? "No cost" : `${value.toFixed(1)}%`;
}
function marginColor(value?: number | null) {
  if (value === null || value === undefined) return "text-slate-400";
  if (value < 15) return "text-red-600";
  if (value < 25) return "text-amber-600";
  return "text-emerald-700";
}

function labelize(value?: string | null) {
  return value ? value.replace(/_/g, " ") : "—";
}

function stageBadgeClass(value?: string | null) {
  if (value === "PRINTING") return "bg-blue-100 text-blue-700";
  if (value === "PROCESSING") return "bg-amber-100 text-amber-700";
  if (value === "READY_FOR_DISPATCH" || value === "DONE") return "bg-green-100 text-green-700";
  if (value === "SHEET_ASSIGNED") return "bg-indigo-100 text-indigo-700";
  if (value === "SHEET_CURRENT_STATUS") return "bg-slate-100 text-slate-700";
  if (value === "SHEET_STAGE_VENDOR_ASSIGNED") return "bg-violet-100 text-violet-700";
  return "bg-slate-100 text-slate-600";
}

export default function OrdersPage() {
  const router = useRouter();
  const isNativeApp = useIsNativeApp();
  // Website keeps its original spacing; the Android app gets the tighter
  // density pass (see components/dashboard-shell.tsx / useIsNativeApp).
  const cx = (web: string, native: string) => (isNativeApp ? native : web);
  const [orders, setOrders] = useState<Order[]>([]);
  const [readyOrders, setReadyOrders] = useState<Order[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [readyPage, setReadyPage] = useState(1);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [readyTotal, setReadyTotal] = useState(0);
  const [ordersHasMore, setOrdersHasMore] = useState(false);
  const [readyHasMore, setReadyHasMore] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "inprogress" | "dispatch">("all");
  const [expandedPayments, setExpandedPayments] = useState<string | null>(null);
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [orderJourneys, setOrderJourneys] = useState<Record<string, any[]>>({});
  const [orderPayments, setOrderPayments] = useState<Record<string, Payment[]>>({});
  const [paymentModal, setPaymentModal] = useState<Order | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Edit payment
  const [editingPayment, setEditingPayment] = useState<{ payment: Payment; orderId: string } | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState({ amount: "", method: "CASH", paymentAccountId: "", referenceNumber: "", notes: "", paymentDate: "" });
  const [savingPaymentEdit, setSavingPaymentEdit] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);

  function startEditPayment(payment: Payment, orderId: string) {
    const account = accounts.find(a => a.name === payment.paymentAccount.name);
    setEditingPayment({ payment, orderId });
    setEditPaymentForm({
      amount: String(payment.amount),
      method: payment.method,
      paymentAccountId: account?.id ?? "",
      referenceNumber: payment.referenceNumber ?? "",
      notes: payment.notes ?? "",
      paymentDate: new Date(payment.paymentDate).toISOString().slice(0, 10),
    });
  }

  async function savePaymentEdit() {
    if (!editingPayment) return;
    const amount = Number(editPaymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) { alert("Enter a valid amount"); return; }
    if (!editPaymentForm.paymentAccountId) { alert("Select a payment account"); return; }
    setSavingPaymentEdit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payments/${editingPayment.payment.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method: editPaymentForm.method,
          paymentAccountId: editPaymentForm.paymentAccountId,
          referenceNumber: editPaymentForm.referenceNumber || undefined,
          notes: editPaymentForm.notes || undefined,
          paymentDate: editPaymentForm.paymentDate,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); alert(err.message || "Could not update payment"); return; }
      setEditingPayment(null);
      await loadPayments(editingPayment.orderId);
      await load();
    } finally { setSavingPaymentEdit(false); }
  }

  async function deletePayment(payment: Payment, orderId: string) {
    const label = `${new Date(payment.paymentDate).toLocaleDateString("en-IN")} - ${fmt(Number(payment.amount))}${payment.referenceNumber ? ` (Ref: ${payment.referenceNumber})` : ""}`;
    const warning = payment.verificationStatus === "VERIFIED"
      ? `This payment has already been VERIFIED. Only delete it if you're certain it's a mistake (e.g. wrong reference, duplicate entry) — this cannot be undone.\n\n${label}`
      : `Delete this payment?\n${label}`;
    if (!confirm(warning)) return;
    setDeletingPaymentId(payment.id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payments/${payment.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.message || "Could not delete payment");
        return;
      }
      await loadPayments(orderId);
      await load();
    } finally {
      setDeletingPaymentId(null);
    }
  }

  // Search + filter
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [marginMode, setMarginMode] = useState<"" | "below" | "above">("");
  const [marginThreshold, setMarginThreshold] = useState("15");
  const currentUser = useMemo(() => {
    if (typeof window === "undefined") return null;
    try { const r = localStorage.getItem("rareprint_user"); return r ? JSON.parse(r) : null; } catch { return null; }
  }, []);
  const canViewMargin = currentUser?.fullName === "Sanket Admin";
  // Verified payments are normally locked from edit/delete once reconciled —
  // but the super admin still needs a way to correct a genuine mistake (e.g.
  // a bank reference pasted onto the wrong order), so allow delete-only,
  // with an extra-explicit confirmation, once a payment is verified.
  const canManageVerifiedPayments = currentUser?.fullName === "Sanket Admin";

  // File upload
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
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
    productPhoto: "" as string, // base64 data URL
  });
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [printReceiptData, setPrintReceiptData] = useState<null | {
    orders: typeof selectedOrders;
    courierCharges: number;
    isCod: boolean;
    codAmount: number;
    dispatchType: string;
    transportName: string;
    awbNumber: string;
    productPhoto: string;
  }>(null);
  const [newPayment, setNewPayment] = useState({
    amount: "", method: "CASH", paymentAccountId: "",
    referenceNumber: "", notes: "", paymentDate: new Date().toISOString().slice(0, 10),
  });

  const load = useCallback(async (nextPage = 1, append = false) => {
    append ? setLoadingMore(true) : setLoading(true);
    setLoadError(null);
    const headers = getAuthHeaders();
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: String(ORDER_PAGE_SIZE),
      status: statusFilter,
    });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (canViewMargin && marginMode && marginThreshold) {
      params.set("marginMode", marginMode);
      params.set("marginThreshold", marginThreshold);
    }
    const oRes = await fetch(`${API_BASE_URL}/orders?${params}`, { headers });
    if (oRes.status === 401) { clearAuth(); router.replace("/login"); return; }
    if (!oRes.ok) {
      const body = await oRes.json().catch(() => null);
      setLoadError(body?.message || `Could not load orders (server returned ${oRes.status}).`);
      if (!append) setLoading(false);
      setLoadingMore(false);
      return;
    }
    const ordersPayload: PagedOrders = await oRes.json();
    setOrders(prev => append ? [...prev, ...(ordersPayload.data ?? [])] : (ordersPayload.data ?? []));
    setOrdersPage(ordersPayload.page ?? nextPage);
    setOrdersTotal(ordersPayload.total ?? 0);
    setOrdersHasMore(Boolean(ordersPayload.hasMore));

    if (!append) setLoading(false);

    const [rRes, aRes] = await Promise.all([
      fetch(`${API_BASE_URL}/orders/ready-for-dispatch?${params}`, { headers }),
      fetch(`${API_BASE_URL}/orders/payment-accounts`, { headers }),
    ]);
    const readyPayload: PagedOrders = rRes.ok ? await rRes.json() : { data: [], page: nextPage, limit: ORDER_PAGE_SIZE, total: 0, hasMore: false };
    const rawReady = readyPayload.data ?? [];
    const cu = (() => { try { const r = localStorage.getItem("rareprint_user"); return r ? JSON.parse(r) : null; } catch { return null; } })();
    const visibleReady = cu?.role === "SALES_AGENT" ? rawReady.filter((o: any) => o.salesAgentName === cu.fullName) : rawReady;
    setReadyOrders(prev => append ? [...prev, ...visibleReady] : visibleReady);
    setReadyPage(readyPayload.page ?? nextPage);
    setReadyTotal(readyPayload.total ?? visibleReady.length);
    setReadyHasMore(Boolean(readyPayload.hasMore));
    const accs = await aRes.json();
    setAccounts(accs);
    if (accs.length > 0) setBookingForm(p => ({ ...p, paymentAccountId: accs[0].id }));
    append ? setLoadingMore(false) : setLoading(false);
  }, [router, debouncedSearch, statusFilter, canViewMargin, marginMode, marginThreshold]);

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
      setUploadSuccess("✅ File attached successfully!");
      setTimeout(() => setUploadSuccess(null), 3000);
    } finally { setSubmitting(false); }
  }

  // ── File upload per item ────────────────────────────────────────────────────
  async function deleteDesignFile(itemId: string, filename: string) {
    if (!confirm("Delete this file?")) return;
    setDeletingFile(filename);
    try {
      await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`, { method: "DELETE", headers: getAuthHeaders() });
      // Update modal items immediately without closing modal
      setFileModalItems(prev => prev.map(i => i.id === itemId
        ? { ...i, designFiles: (i.designFiles ?? []).filter((f: any) => f.filename !== filename) }
        : i
      ));
      setUploadSuccess("🗑️ File deleted successfully!");
      setTimeout(() => setUploadSuccess(null), 3000);
    } finally { setDeletingFile(null); }
  }

  async function uploadDesignFile(itemId: string, file: File) {
    setUploadingItemId(itemId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files`, {
        method: "POST", headers: (() => { const h = getAuthHeaders(); delete (h as any)["Content-Type"]; return h; })(), body: formData,
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Upload failed"); return; }
      const uploaded = await res.json().catch(() => null);
      // Update modal items immediately without closing modal
      if (uploaded?.file) {
        setFileModalItems(prev => prev.map(i => i.id === itemId
          ? { ...i, designFiles: [...(i.designFiles ?? []), uploaded.file] }
          : i
        ));
      } else if (fileModalOrder) {
        const itemsRes = await fetch(`${API_BASE_URL}/orders/${fileModalOrder.id}/items`, { headers: getAuthHeaders() });
        if (itemsRes.ok) setFileModalItems(await itemsRes.json());
      }
      setUploadSuccess("✅ File attached successfully!");
      setTimeout(() => setUploadSuccess(null), 3000);
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
    setBookingForm(p => ({ ...p, productPhoto: "" }));
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
  const shouldChargeDispatch = bookingForm.dispatchType === "COURIER";
  const courierNum   = shouldChargeDispatch ? Number(bookingForm.courierCharges || 0) : 0;
  const suggestedCod = totalBalance + courierNum;

  async function submitBooking() {
    if (selectedOrderIds.size === 0) return;
    if (shouldChargeDispatch && !bookingForm.courierCharges) { alert("Enter courier charges"); return; }
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
      const result = await res.json();
      const processed = result.processedOrders ?? orderIds.length;
      if (processed === 0) { alert("⚠️ No orders were submitted. Orders must be in 'Ready for Dispatch' status."); return; }
      // Store data for print receipt
      setPrintReceiptData({
        orders: selectedOrders,
        courierCharges: courierNum,
        isCod: bookingForm.isCod,
        codAmount: bookingForm.isCod ? Number(bookingForm.codAmount || suggestedCod) : 0,
        dispatchType: bookingForm.dispatchType,
        transportName: bookingForm.transportName,
        awbNumber: bookingForm.awbNumber,
        productPhoto: bookingForm.productPhoto,
      });
      setBookingModal(false); setSelectedOrderIds(new Set()); setBookingItems({}); setRates([]);
      await load();
    } finally { setBookingSubmitting(false); }
  }

  // ── Filtered orders ────────────────────────────────────────────────────────
  const agentOrders = currentUser?.role === "SALES_AGENT"
    ? orders.filter(o => o.salesAgentName === currentUser.fullName)
    : orders;
  const allOrders        = agentOrders;
  const inProgressOrders = agentOrders.filter(o => IN_PROGRESS_STATUSES.includes(o.status));

  const filteredOrders = useMemo(() => {
    const base = activeTab === "all" ? allOrders : activeTab === "inprogress" ? inProgressOrders : readyOrders;
    const q = debouncedSearch.trim().toLowerCase();
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
    { key: "all",        label: "All Orders",         count: ordersTotal || allOrders.length },
    { key: "inprogress", label: "In Progress",         count: inProgressOrders.length },
    { key: "dispatch",   label: "Ready for Dispatch",  count: readyTotal || readyOrders.length },
  ] as const;

  const canLoadMore = activeTab === "dispatch" ? readyHasMore : ordersHasMore;
  const loadedCount = activeTab === "dispatch" ? readyOrders.length : orders.length;
  const totalCount = activeTab === "dispatch" ? readyTotal : ordersTotal;
  const tableColSpan = 11 + (canViewMargin ? 2 : 0) + (activeTab === "dispatch" ? 2 : 0);
  const loadMore = () => {
    const nextPage = activeTab === "dispatch" ? readyPage + 1 : ordersPage + 1;
    void load(nextPage, true);
  };

  function renderProductsCell(o: Order) {
    if (o.itemDetails && o.itemDetails.length > 0) {
      return (
        <td className="px-1.5 py-1.5 align-top">
          <div style={{ minWidth: "230px" }}>
            {o.itemDetails.map((item, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5 border-b border-slate-50 last:border-0 text-xs">
                <span className="text-slate-800 font-medium" style={{ minWidth: "55px" }}>{item.productName}</span>
                <span className="text-slate-500" style={{ minWidth: "28px" }}>{item.size ?? "—"}</span>
                <span className="text-slate-500" style={{ minWidth: "22px" }}>{item.gsm ?? "—"}</span>
                <span className="text-slate-500" style={{ minWidth: "28px" }}>{item.sides ?? "—"}</span>
                <span className="text-slate-500" style={{ minWidth: "16px" }}>{item.quantity}</span>
                <span className="font-semibold text-emerald-700 whitespace-nowrap" style={{ minWidth: "50px" }}>{fmt(item.lineTotal)}</span>
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
      <td className="px-1.5 py-1.5 text-slate-600 align-top" style={{ minWidth: "140px" }}>
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
              <div className="flex items-center gap-2">
                {currentUser?.role === "ADMIN" && (
                  <button onClick={async () => {
                    if (!confirm("Create a dummy TEST order for feature testing?")) return;
                    const res = await fetch(`${API_BASE_URL}/orders/test`, { method: "POST", headers: getAuthHeaders() });
                    if (res.ok) { const d = await res.json(); alert(`Test order created: ${d.orderNumber}`); load(); }
                    else { alert("Failed to create test order"); }
                  }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100">
                    <Plus className="h-3.5 w-3.5" /> Test Order
                  </button>
                )}
                <button onClick={() => router.push("/orders/create")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700">
                  <Plus className="h-3.5 w-3.5" /> Create New Order
                </button>
              </div>
            </div>

            {loadError && (
              <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <span>{loadError}</span>
                <button onClick={() => load()} className="shrink-0 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-100">
                  Retry
                </button>
              </div>
            )}

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
              {canViewMargin && (
                <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
                  <select
                    value={marginMode ? `${marginMode}:${marginThreshold}` : ""}
                    onChange={e => {
                      const [mode, threshold] = e.target.value.split(":");
                      setMarginMode((mode as "below" | "above") || "");
                      if (threshold) setMarginThreshold(threshold);
                    }}
                    className="bg-white text-xs outline-none"
                  >
                    <option value="">All margins</option>
                    <option value="below:15">Below 15%</option>
                    <option value="below:20">Below 20%</option>
                    <option value="below:25">Below 25%</option>
                    <option value="above:15">Above 15%</option>
                    <option value="above:20">Above 20%</option>
                    <option value="above:25">Above 25%</option>
                  </select>
                  <select
                    value={marginMode}
                    onChange={e => setMarginMode(e.target.value as "" | "below" | "above")}
                    className="bg-white text-xs outline-none"
                  >
                    <option value="">Mode</option>
                    <option value="below">Below</option>
                    <option value="above">Above</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={marginThreshold}
                    onChange={e => setMarginThreshold(e.target.value)}
                    className="w-14 rounded border border-slate-200 px-1.5 py-0.5 text-xs outline-none focus:border-blue-400"
                  />
                  <span className="text-xs text-slate-400">%</span>
                </div>
              )}
              {(search || statusFilter !== "ALL" || (canViewMargin && marginMode)) && (
                <button onClick={() => { setSearch(""); setStatusFilter("ALL"); setMarginMode(""); setMarginThreshold("15"); }}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 flex items-center gap-1">
                  <X className="h-3 w-3" /> Clear
                </button>
              )}
              <span className="text-xs text-slate-400 self-center">
                Showing {filteredOrders.length} of {totalCount || filteredOrders.length}
              </span>
            </div>

            {/* Tabs */}
            <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 w-fit">
              {tabs.map(tab => (
                <button key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSelectedOrderIds(new Set()); setCustomerError(null); }}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${activeTab === tab.key ? "bg-brand-100 text-brand-700" : "bg-slate-200 text-slate-500"}`}>
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
              <>
              <div className={cx("space-y-3 md:hidden", "space-y-2 md:hidden")}>
                {filteredOrders.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">
                    {search !== debouncedSearch ? "Searching…" : "No orders found."}
                  </div>
                ) : filteredOrders.map(o => (
                  <div key={o.id} className={`overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${selectedOrderIds.has(o.id) ? "ring-2 ring-indigo-200" : ""}`}>
                    <div className={cx("bg-brand-700 px-3 py-2 text-white", "bg-brand-700 px-3 py-1.5 text-white")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {activeTab === "dispatch" && (
                              <button onClick={() => toggleOrderSelection(o.id, o.customerName)} className="rounded-lg bg-white/15 p-1">
                                {selectedOrderIds.has(o.id) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                              </button>
                            )}
                            <p className={cx("text-base font-bold leading-none", "text-sm font-bold leading-none")}>{o.orderNo}</p>
                            {o.isTest && <span className="rounded-full bg-amber-400 text-amber-900 px-1.5 py-0.5 text-xs font-bold">TEST</span>}
                            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-xs font-semibold">
                              {orderAge(o.date)}
                            </span>
                          </div>
                          <p className={cx("mt-1 truncate text-sm font-semibold", "mt-0.5 truncate text-sm font-semibold")}>{o.customerName}</p>
                          <p className="text-xs text-brand-100">{new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })} · {o.customerPhone ?? "No phone"}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-brand-100">Balance</p>
                          <p className="text-sm font-bold">{fmt(o.balanceDue)}</p>
                        </div>
                      </div>
                    </div>
                    <div className={`grid ${canViewMargin ? "grid-cols-5" : "grid-cols-3"} divide-x divide-slate-100 border-b border-slate-100 text-center`}>
                      <div className={cx("px-2 py-1.5", "px-2 py-1")}>
                        <p className="text-[10px] font-semibold text-slate-400">Total</p>
                        <p className="text-xs font-bold text-slate-900">{fmt(o.totalAmount)}</p>
                      </div>
                      <div className={cx("px-2 py-1.5", "px-2 py-1")}>
                        <p className="text-[10px] font-semibold text-slate-400">Paid</p>
                        <p className="text-xs font-bold text-emerald-700">{fmt(o.advancePaid)}</p>
                      </div>
                      <div className={cx("px-2 py-1.5", "px-2 py-1")}>
                        <p className="text-[10px] font-semibold text-slate-400">Ready</p>
                        <p className="text-xs font-bold text-indigo-700">{o.readyItemsCount ?? 0}/{o.totalItemsCount ?? o.itemDetails?.length ?? 0}</p>
                      </div>
                      {canViewMargin && (
                        <div className={cx("px-2 py-1.5", "px-2 py-1")}>
                          <p className="text-[10px] font-semibold text-slate-400">Margin</p>
                          <p className={`text-xs font-bold ${marginColor(o.marginPct)}`}>{marginText(o.marginPct)}</p>
                        </div>
                      )}
                      {canViewMargin && (
                        <div className={cx("px-2 py-1.5", "px-2 py-1")}>
                          <p className="text-[10px] font-semibold text-slate-400">Comm.</p>
                          <p className="text-xs font-bold text-purple-700">{o.commissionTotal == null ? "—" : fmt(o.commissionTotal)}</p>
                        </div>
                      )}
                    </div>
                    <div className={cx("space-y-2 p-3", "space-y-1.5 p-2.5")}>
                      {o.salesAgentName && <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-700">{o.salesAgentName}</span>}
                      <div className={cx("space-y-1.5", "space-y-1")}>
                        {(o.itemDetails?.length ? o.itemDetails : o.products.split(" | ").map(p => ({ productName: p, size: null, gsm: null, sides: null, quantity: 0, lineTotal: 0, itemProductionStage: "" }))).map((item: any, idx) => (
                          <div key={idx} className={cx("rounded-lg border border-slate-100 bg-slate-50 px-3 py-2", "rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5")}>
                            <div className="flex items-start justify-between gap-2">
                              <p className={cx("truncate font-bold text-slate-900", "truncate text-sm font-bold text-slate-900")}>{item.productName}</p>
                              {item.itemProductionStage && <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${itemStageColors[item.itemProductionStage] ?? "bg-gray-100 text-gray-600"}`}>{itemStageLabels[item.itemProductionStage] ?? item.itemProductionStage}</span>}
                            </div>
                            <div className={cx("mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-semibold text-slate-500", "mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs font-semibold text-slate-500")}>
                              {item.size && <span>{item.size}</span>}
                              {item.gsm && <span>{item.gsm} GSM</span>}
                              {item.sides && <span>{item.sides}</span>}
                              {!!item.quantity && <span>Qty: {item.quantity}</span>}
                              {!!item.lineTotal && <span className="text-emerald-700">{fmt(item.lineTotal)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className={cx("flex gap-2 pt-1", "flex gap-2 pt-0.5")}>
                        <button title="Add Payment" onClick={() => { setPaymentModal(o); setNewPayment(p => ({ ...p, paymentAccountId: accounts[0]?.id ?? "" })); }}
                          className={cx("flex-1 rounded-lg bg-emerald-600 p-2 text-white", "flex-1 rounded-lg bg-emerald-600 p-1.5 text-white")}><CreditCard className="mx-auto h-4 w-4" /></button>
                        <button title="Payment History" onClick={() => togglePayments(o.id)}
                          className={cx("flex-1 rounded-lg border border-slate-200 p-2 text-slate-600", "flex-1 rounded-lg border border-slate-200 p-1.5 text-slate-600")}>{expandedPayments === o.id ? <ChevronUp className="mx-auto h-4 w-4" /> : <ChevronDown className="mx-auto h-4 w-4" />}</button>
                        <button title="Order Journey" onClick={() => toggleJourney(o.id)}
                          className={cx("flex-1 rounded-lg border border-blue-200 bg-blue-50 p-2 text-blue-700", "flex-1 rounded-lg border border-blue-200 bg-blue-50 p-1.5 text-blue-700")}><FileText className="mx-auto h-4 w-4" /></button>
                        {o.status === "PENDING_APPROVAL" ? (
                          <button title="Edit Order" onClick={() => router.push(`/orders/edit?id=${o.id}`)}
                            className={cx("flex-1 rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-700", "flex-1 rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-700")}>Edit</button>
                        ) : <span />}
                        {o.items && o.items.length > 0 && (
                          <button title="Design Files" onClick={async () => { setFileModalOrder(o); const r = await fetch(`${API_BASE_URL}/orders/${o.id}/items`, { headers: getAuthHeaders() }); if (r.ok) setFileModalItems(await r.json()); }}
                            className={cx("flex-1 rounded-lg border border-purple-200 bg-purple-50 p-2 text-purple-700", "flex-1 rounded-lg border border-purple-200 bg-purple-50 p-1.5 text-purple-700")}><Paperclip className="mx-auto h-4 w-4" /></button>
                        )}
                      </div>
                      {expandedPayments === o.id && (
                        <div className={cx("rounded-xl bg-slate-50 p-3 text-xs text-slate-600", "rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600")}>
                          {!orderPayments[o.id] ? <Loader2 className="h-4 w-4 animate-spin" />
                            : orderPayments[o.id].length === 0 ? "No payments recorded yet."
                            : orderPayments[o.id].map(p => <div key={p.id} className="flex justify-between border-b border-slate-100 py-1 last:border-0"><span>{new Date(p.paymentDate).toLocaleDateString("en-IN")} · {METHOD_LABELS[p.method] ?? p.method}</span><strong className="text-emerald-700">{fmt(Number(p.amount))}</strong></div>)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block" style={{ overflowX: "auto" }}>
                <table className="w-full text-left text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      {activeTab === "dispatch" && <th className="px-1.5 py-2 w-8 font-semibold border-b border-slate-200" style={TH}></th>}
                      <th className="px-1.5 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Date</th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Age</th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Order No</th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Customer</th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Phone</th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Agent</th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>
                        <div className="flex items-center gap-2">
                          <span style={{ minWidth: "55px" }}>Product</span>
                          <span style={{ minWidth: "28px" }}>Size</span>
                          <span style={{ minWidth: "22px" }}>GSM</span>
                          <span style={{ minWidth: "28px" }}>Sides</span>
                          <span style={{ minWidth: "16px" }}>Qty</span>
                          <span style={{ minWidth: "50px" }}>Amt</span>
                          <span>Stage</span>
                        </div>
                      </th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Total</th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Paid</th>
                      <th className="px-1.5 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Balance</th>
                      {canViewMargin && (
                        <th className="px-1.5 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Margin</th>
                      )}
                      {canViewMargin && (
                        <th className="px-1.5 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Commission</th>
                      )}
                      <th className="px-1.5 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Actions</th>
                      {activeTab === "dispatch" && <th className="px-1.5 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Ready</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr><td colSpan={tableColSpan} className="px-4 py-10 text-center text-slate-400 text-sm">
                        {search !== debouncedSearch ? "Searching…" : "No orders found."}
                      </td></tr>
                    ) : filteredOrders.map((o) => (
                      <React.Fragment key={o.id}>
                        <tr className={`hover:bg-slate-50 ${selectedOrderIds.has(o.id) ? "bg-indigo-50" : ""}`}>
                          {activeTab === "dispatch" && (
                            <td className="px-1.5 py-1.5 align-top">
                              <button onClick={() => toggleOrderSelection(o.id, o.customerName)}>
                                {selectedOrderIds.has(o.id) ? <CheckSquare className="h-4 w-4 text-indigo-600" /> : <Square className="h-4 w-4 text-slate-400" />}
                              </button>
                            </td>
                          )}
                          <td className="px-1.5 py-1.5 text-slate-500 align-top whitespace-nowrap">
                            {new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </td>
                          <td className="px-1.5 py-1.5 align-top whitespace-nowrap">
                            <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(o.date)}`}>{orderAge(o.date)}</span>
                          </td>
                          {/* Short order number */}
                          <td className="px-1.5 py-1.5 font-bold text-blue-700 align-top whitespace-nowrap" style={{ maxWidth: "60px" }}>
                            {o.orderNo}
                            {o.isTest && <span className="ml-1 rounded-full bg-amber-100 text-amber-700 border border-amber-300 px-1 py-0 text-xs font-bold">TEST</span>}
                          </td>
                          <td className="px-1.5 py-1.5 text-slate-700 align-top" style={{ maxWidth: "80px" }}>
                            <div style={{ wordBreak: "break-word", lineHeight: "1.3" }}>{o.customerName}</div>
                          </td>
                          <td className="px-1.5 py-1.5 text-slate-500 align-top whitespace-nowrap">{o.customerPhone ?? "—"}</td>
                          <td className="px-1.5 py-1.5 align-top" style={{ maxWidth: "100px" }}>
                            {o.salesAgentName
                              ? <span className="inline-block rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium text-center" style={{ whiteSpace: "normal", overflowWrap: "normal", wordBreak: "keep-all", lineHeight: "1.3" }}>{o.salesAgentName}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          {renderProductsCell(o)}
                          <td className="px-1.5 py-1.5 font-medium align-top whitespace-nowrap">{fmt(o.totalAmount)}</td>
                          <td className="px-1.5 py-1.5 text-emerald-700 font-medium align-top whitespace-nowrap">{fmt(o.advancePaid)}</td>
                          <td className="px-1.5 py-1.5 text-red-600 font-medium align-top whitespace-nowrap">{fmt(o.balanceDue)}</td>
                          {canViewMargin && (
                            <td className={`px-1.5 py-1.5 font-bold align-top whitespace-nowrap ${marginColor(o.marginPct)}`}>
                              {marginText(o.marginPct)}
                            </td>
                          )}
                          {canViewMargin && (
                            <td className="px-1.5 py-1.5 align-top whitespace-nowrap">
                              {o.commissionTotal == null ? (
                                <span className="text-xs text-slate-400">No cost</span>
                              ) : (
                                <>
                                  <div className="text-xs font-bold text-purple-700">{fmt(o.commissionTotal)}</div>
                                  <div className="text-[10px] text-slate-400">{o.commissionPctOfSale?.toFixed(1)}%</div>
                                </>
                              )}
                            </td>
                          )}
                          <td className="px-1.5 py-1.5 align-top">
                            <div className="flex flex-row gap-0.5 items-center">
                              {/* Pay */}
                              <button title="Add Payment" onClick={() => { setPaymentModal(o); setNewPayment(p => ({ ...p, paymentAccountId: accounts[0]?.id ?? "" })); }}
                                className="px-1 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">
                                <CreditCard className="h-3.5 w-3.5" />
                              </button>
                              {/* Payment History */}
                              <button title="Payment History" onClick={() => togglePayments(o.id)}
                                className="px-1 py-1.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50">
                                {expandedPayments === o.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              </button>
                              {/* Journey */}
                              <button title="Order Journey" onClick={() => toggleJourney(o.id)}
                                className="px-1 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100">
                                <FileText className="h-3.5 w-3.5" />
                              </button>
                              {/* Edit */}
                              {o.status === "PENDING_APPROVAL" && (
                                <button title="Edit Order" onClick={() => router.push(`/orders/edit?id=${o.id}`)}
                                  className="px-1 py-1.5 rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                              )}
                              {/* Delete — always shown for test orders; PENDING_APPROVAL only for real orders */}
                              {(o.isTest || o.status === "PENDING_APPROVAL") && (
                                <button title={o.isTest ? "Delete Test Order" : "Delete Order"} onClick={async () => {
                                  if (!confirm(`Delete order ${o.orderNo}? Cannot be undone.`)) return;
                                  const res = await fetch(`${API_BASE_URL}/orders/${o.id}`, { method: "DELETE", headers: getAuthHeaders() });
                                  if (res.ok) { alert("Order deleted!"); load(); } else { alert("Delete failed"); }
                                }} className={`px-1 py-1.5 rounded-md border ${o.isTest ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}>
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
                                </button>
                              )}
                              {/* Files */}
                              {o.items && o.items.length > 0 && (
                                <button title="Design Files" onClick={async () => { setFileModalOrder(o); const r = await fetch(`${API_BASE_URL}/orders/${o.id}/items`, { headers: getAuthHeaders() }); if (r.ok) setFileModalItems(await r.json()); }}
                                  className="relative px-1 py-1.5 rounded-md border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100">
                                  <Paperclip className="h-3.5 w-3.5" />
                                  {o.items.reduce((s: number, i: any) => s + (Array.isArray(i.designFiles) ? i.designFiles.length : 0), 0) > 0 && (
                                    <span className="absolute -top-1 -right-1 rounded-full bg-purple-600 text-white w-3.5 h-3.5 flex items-center justify-center font-bold" style={{fontSize:'9px'}}>
                                      {o.items.reduce((s: number, i: any) => s + (Array.isArray(i.designFiles) ? i.designFiles.length : 0), 0)}
                                    </span>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          {activeTab === "dispatch" && (
                            <td className="px-1.5 py-1.5 align-top">
                              <span className="rounded-full bg-green-100 text-green-700 px-1.5 py-0.5 text-xs font-semibold whitespace-nowrap">
                                {o.readyItemsCount ?? 0}/{o.totalItemsCount ?? 0}
                              </span>
                            </td>
                          )}
                        </tr>

                        {/* Payment history row */}
                        {expandedPayments === o.id && (
                          <tr>
                            <td colSpan={tableColSpan} className="bg-slate-50 px-6 py-3">
                              {!orderPayments[o.id] ? <Loader2 className="h-4 w-4 animate-spin" />
                                : orderPayments[o.id].length === 0 ? <p className="text-xs text-slate-400">No payments recorded yet.</p>
                                : (
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-slate-400 border-b border-slate-100">
                                        {["Date","Amount","Method","Account","Reference","Notes",""].map(h => (
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
                                          <td className="py-1">
                                            <div className="flex items-center gap-1">
                                              {p.verificationStatus !== "VERIFIED" ? (
                                                <>
                                                <button onClick={() => startEditPayment(p, o.id)}
                                                  className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                                                  ✏️ Edit
                                                </button>
                                                <button onClick={() => deletePayment(p, o.id)} disabled={deletingPaymentId === p.id}
                                                  className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
                                                  {deletingPaymentId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                                  Delete
                                                </button>
                                                </>
                                              ) : canManageVerifiedPayments ? (
                                                <button onClick={() => deletePayment(p, o.id)} disabled={deletingPaymentId === p.id}
                                                  title="Verified payment — only delete if this is a genuine mistake"
                                                  className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                                                  {deletingPaymentId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                                                  Delete (verified)
                                                </button>
                                              ) : null}
                                            </div>
                                          </td>
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
                            <td colSpan={tableColSpan} className="bg-slate-50 px-6 py-4 border-t border-slate-100">
                              <p className="text-xs font-bold text-slate-700 mb-3 uppercase tracking-wide">Order Journey</p>
                              {!orderJourneys[o.id] ? (
                                <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading...</div>
                              ) : orderJourneys[o.id].length === 0 ? (
                                <p className="text-xs text-slate-400">No activity recorded yet.</p>
                              ) : (
                                <div className="relative">
                                  {/* Vertical line */}
                                  <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-200" />
                                  <div className="space-y-0">
                                    {orderJourneys[o.id].map((log: any, idx: number) => {
                                      const isItemLog = log.reason?.startsWith('Item:');
                                      const eventType = log.metadata?.eventType ?? log.type;
                                      const isSheetEvent = eventType === "SHEET_ASSIGNED" || eventType === "SHEET_STATUS_CHANGED" || eventType === "SHEET_CURRENT_STATUS" || eventType === "SHEET_STAGE_VENDOR_ASSIGNED";
                                      const isDispatch = log.toStatus?.includes('DISPATCH') || log.toStatus?.includes('DISPATCHED');
                                      const isApproved = log.toStatus === 'APPROVED';
                                      const isReady = log.toStatus === 'READY_FOR_DISPATCH';
                                      const meta = log.metadata ?? {};
                                      const dotColor = isSheetEvent ? 'bg-indigo-500' : isDispatch ? 'bg-green-500' : isApproved ? 'bg-blue-500' : isItemLog ? 'bg-amber-400' : 'bg-slate-400';
                                      return (
                                        <div key={log.id} className="relative flex gap-4 pb-4">
                                          {/* Dot */}
                                          <div className={`relative z-10 mt-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow flex-shrink-0 ${dotColor}`} />
                                          {/* Content */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                              <div>
                                                {isSheetEvent ? (
                                                  <div>
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${stageBadgeClass(eventType)}`}>
                                                        {eventType === "SHEET_ASSIGNED" ? "Sheet Assigned" : eventType === "SHEET_STATUS_CHANGED" ? "Sheet Stage" : eventType === "SHEET_STAGE_VENDOR_ASSIGNED" ? "Stage Vendor" : "Current Sheet"}
                                                      </span>
                                                      {meta.sheetNo && <span className="text-xs font-bold text-slate-700">Sheet {meta.sheetNo}</span>}
                                                      {meta.fromSheetStatus && (
                                                        <>
                                                          <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">{labelize(meta.fromSheetStatus)}</span>
                                                          <span className="text-slate-300 text-xs">→</span>
                                                        </>
                                                      )}
                                                      {meta.sheetStatus && (
                                                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${stageBadgeClass(meta.sheetStatus)}`}>{labelize(meta.sheetStatus)}</span>
                                                      )}
                                                    </div>
                                                    <p className="mt-1 text-xs font-medium text-slate-700">
                                                      {eventType === "SHEET_ASSIGNED"
                                                        ? `${meta.productName ?? "Item"} assigned to sheet ${meta.sheetNo ?? ""}`
                                                        : eventType === "SHEET_STAGE_VENDOR_ASSIGNED"
                                                        ? `${labelize(meta.stage)} assigned to ${meta.vendorName ?? "vendor"}`
                                                        : log.reason}
                                                    </p>
                                                    <div className="mt-2 grid gap-1.5 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
                                                      {meta.productName && <span><b className="text-slate-600">Item:</b> {meta.productName}</span>}
                                                      {meta.quantityOnSheet !== undefined && <span><b className="text-slate-600">Qty on sheet:</b> {meta.quantityOnSheet}</span>}
                                                      {meta.multiple !== undefined && <span><b className="text-slate-600">Multiple:</b> {meta.multiple}</span>}
                                                      {meta.sheetQuantity !== undefined && <span><b className="text-slate-600">Sheet qty:</b> {meta.sheetQuantity}</span>}
                                                      {meta.actualPrintedQuantity !== undefined && meta.actualPrintedQuantity !== null && <span><b className="text-slate-600">Printed qty:</b> {meta.actualPrintedQuantity}</span>}
                                                      {meta.sheetSize && <span><b className="text-slate-600">Sheet size:</b> {meta.sheetSize}</span>}
                                                      {meta.sheetGsm && <span><b className="text-slate-600">GSM:</b> {meta.sheetGsm}</span>}
                                                      {meta.sheetPrinting && <span><b className="text-slate-600">Printing:</b> {labelize(meta.sheetPrinting)}</span>}
                                                      {(meta.itemStage || meta.orderItemStage) && <span><b className="text-slate-600">Item stage:</b> {labelize(meta.itemStage ?? meta.orderItemStage)}</span>}
                                                      {meta.stage && <span><b className="text-slate-600">Work stage:</b> {labelize(meta.stage)}</span>}
                                                      {meta.vendorName && <span><b className="text-slate-600">Vendor:</b> {meta.vendorName}</span>}
                                                      {meta.vendorInvoiceNo && <span><b className="text-slate-600">Invoice:</b> {meta.vendorInvoiceNo}</span>}
                                                    </div>
                                                    {Array.isArray(meta.stageVendors) && meta.stageVendors.length > 0 && (
                                                      <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {meta.stageVendors.map((sv: any, vendorIdx: number) => (
                                                          <span key={`${log.id}-vendor-${vendorIdx}`} className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
                                                            {labelize(sv.stage)}: {sv.vendorName}{sv.invoiceNo ? ` · Inv ${sv.invoiceNo}` : ""}
                                                          </span>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                ) : isItemLog ? (
                                                  <p className="text-xs font-medium text-slate-700">{log.reason}</p>
                                                ) : (
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    {log.fromStatus && log.fromStatus !== log.toStatus && (
                                                      <>
                                                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">{log.fromStatus.replace(/_/g,' ')}</span>
                                                        <span className="text-slate-300 text-xs">→</span>
                                                      </>
                                                    )}
                                                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${isDispatch ? 'bg-green-100 text-green-700' : isApproved ? 'bg-blue-100 text-blue-700' : isReady ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                                                      {log.toStatus.replace(/_/g,' ')}
                                                    </span>
                                                  </div>
                                                )}
                                                <div className="flex items-center gap-1 mt-0.5">
                                                  <span className="text-xs text-slate-400">by</span>
                                                  <span className="text-xs font-semibold text-slate-600">{log.changedBy}</span>
                                                  {!isItemLog && log.reason && (
                                                    <span className="text-xs text-slate-400 italic">· {log.reason}</span>
                                                  )}
                                                </div>
                                              </div>
                                              <span className="text-xs text-slate-400 whitespace-nowrap flex-shrink-0">
                                                {new Date(log.changedAt).toLocaleString('en-IN', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:true })}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
                {canLoadMore && (
                  <div className="flex items-center justify-center border-t border-slate-200 bg-slate-50 px-4 py-3">
                    <button
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                      Load next {ORDER_PAGE_SIZE} orders
                    </button>
                  </div>
                )}
              </div>
              </>
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
                {uploadSuccess && (
                  <div className="mt-2 flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs font-semibold text-green-700">
                    {uploadSuccess}
                  </div>
                )}
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
                        className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
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
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-xs text-slate-700 truncate max-w-[160px]">{f.originalName}</span>
                            <span className="text-xs text-slate-400 flex-shrink-0">{Math.round(f.size / 1024)}KB</span>
                          </div>
                          {item.itemProductionStage === "NOT_PRINTED" && (
                            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                              <button onClick={() => { const inp = fileInputRefs.current[item.id]; if (inp) { inp.value = ""; inp.click(); } }}
                                className="inline-flex items-center gap-0.5 rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-xs font-semibold text-blue-600 hover:bg-blue-100">
                                <Upload className="h-2.5 w-2.5" /> Replace
                              </button>
                              <button onClick={() => deleteDesignFile(item.id, f.filename)} disabled={deletingFile === f.filename}
                                className="inline-flex items-center gap-0.5 rounded bg-red-50 border border-red-200 px-1.5 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-100 disabled:opacity-50">
                                {deletingFile === f.filename ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <X className="h-2.5 w-2.5" />} Delete
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {uploadSuccess && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-sm font-semibold text-green-700">
                {uploadSuccess}
              </div>
            )}
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
                <DateInput value={newPayment.paymentDate} onChange={e => setNewPayment(p => ({ ...p, paymentDate: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
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
          <div style={{ minHeight: "100%", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "1rem" }}>
            <div style={{ width: "100%", maxWidth: "44rem", background: "white", borderRadius: "0.75rem", border: "1px solid #e2e8f0", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", marginBottom: "1rem" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", padding: "0.625rem 1rem" }}>
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-slate-900">Book Shipment</h2>
                  <span className="text-xs text-slate-500">{selectedOrders.length} order{selectedOrders.length > 1 ? "s" : ""} · {selectedOrders[0]?.customerName}</span>
                </div>
                <button onClick={() => setBookingModal(false)}><X className="h-4 w-4 text-slate-400" /></button>
              </div>
              <div style={{ padding: "0.875rem 1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                {/* Summary + Shipment Info — side by side */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div><p className="text-[10px] text-slate-500 leading-tight">Order Value</p><p className="font-bold text-slate-900 text-sm">{fmt(totalAmount)}</p></div>
                      <div><p className="text-[10px] text-slate-500 leading-tight">Paid</p><p className="font-bold text-emerald-600 text-sm">{fmt(totalAmount - totalBalance)}</p></div>
                      <div><p className="text-[10px] text-slate-500 leading-tight">Balance</p><p className="font-bold text-red-500 text-sm">{fmt(totalBalance)}</p></div>
                    </div>
                  </div>
                  {selectedOrders.length > 0 && (
                    <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 overflow-hidden">
                      {selectedOrders.map(o => (
                        <div key={o.id} className="text-xs text-slate-700">
                          <span className="font-bold text-blue-700">{o.orderNo}</span>
                          {o.customerPhone && <span className="ml-1.5 text-slate-500">📞 {o.customerPhone}</span>}
                          {o.shippingAddress && <div className="text-slate-600 truncate">📍 {o.shippingAddress}</div>}
                          {bookingItems[o.id]?.map((item, i) => { const n = parseNotes(item.productionNotes); return <div key={i} className="text-[10px] text-slate-500 truncate">• {item.productName}{n.size ? ` ${n.size}"` : ""}{n.gsm ? ` ${n.gsm}G` : ""} ×{item.quantity}</div>; })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {/* Dispatch Method */}
                <div className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Dispatch Method</p>
                  <div className="grid grid-cols-4 gap-1.5 mb-2">
                    {[{key:"COURIER",label:"🚚 Courier"},{key:"TRANSPORT",label:"🚛 Transport"},{key:"BY_HAND",label:"🚶 By Hand"},{key:"SELF_COLLECTED",label:"🏪 Self Collect"}].map(dt => (
                      <button key={dt.key} onClick={() => setBookingForm(p => ({ ...p, dispatchType: dt.key }))}
                        className={`rounded-md border px-2 py-1.5 text-[10px] font-semibold text-left transition ${bookingForm.dispatchType === dt.key ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-600"}`}>
                        {dt.label}
                      </button>
                    ))}
                  </div>
                  {bookingForm.dispatchType === "COURIER" && (
                    <div className="grid grid-cols-3 gap-2">
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">Courier Name</label><input value={bookingForm.transportName} onChange={e => setBookingForm(p => ({ ...p, transportName: e.target.value }))} placeholder="Delhivery, DTDC..." className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">AWB Number</label><input value={bookingForm.awbNumber} onChange={e => setBookingForm(p => ({ ...p, awbNumber: e.target.value }))} placeholder="Tracking No" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">Booked By</label><input value={bookingForm.courierBy} onChange={e => setBookingForm(p => ({ ...p, courierBy: e.target.value }))} placeholder="Staff name" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                    </div>
                  )}
                  {bookingForm.dispatchType === "TRANSPORT" && (
                    <div className="grid grid-cols-4 gap-2">
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">Transport Name</label><input value={bookingForm.transportName} onChange={e => setBookingForm(p => ({ ...p, transportName: e.target.value }))} placeholder="Company" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">LR Number</label><input value={bookingForm.lrNumber} onChange={e => setBookingForm(p => ({ ...p, lrNumber: e.target.value }))} placeholder="LR No" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">Charges</label><select value={bookingForm.transportChargesType} onChange={e => setBookingForm(p => ({ ...p, transportChargesType: e.target.value }))} className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-white"><option value="TOPAY">To Pay</option><option value="PREPAID">Prepaid</option></select></div>
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">By</label><input value={bookingForm.transportBy} onChange={e => setBookingForm(p => ({ ...p, transportBy: e.target.value }))} placeholder="Staff" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                    </div>
                  )}
                  {bookingForm.dispatchType === "BY_HAND" && (
                    <div className="max-w-xs"><label className="block text-[10px] font-medium text-slate-600 mb-0.5">Delivery Person Name</label><input value={bookingForm.deliveryBoyName} onChange={e => setBookingForm(p => ({ ...p, deliveryBoyName: e.target.value }))} placeholder="Name" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                  )}
                  {bookingForm.dispatchType === "SELF_COLLECTED" && (
                    <div className="grid grid-cols-2 gap-2 max-w-sm">
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">Collected By</label><input value={bookingForm.collectedByName} onChange={e => setBookingForm(p => ({ ...p, collectedByName: e.target.value }))} placeholder="Name" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                      <div><label className="block text-[10px] font-medium text-slate-600 mb-0.5">Phone</label><input value={bookingForm.collectedByPhone} onChange={e => setBookingForm(p => ({ ...p, collectedByPhone: e.target.value }))} placeholder="Number" className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs" /></div>
                    </div>
                  )}
                </div>
                {/* Product Photo for Receipt/Label */}
                <div className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="text-[10px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Product Photo <span className="text-slate-400 font-normal normal-case">(for receipt &amp; label)</span></p>
                  {bookingForm.productPhoto ? (
                    <div className="flex items-center gap-3">
                      <img src={bookingForm.productPhoto} alt="Product" className="h-16 w-16 rounded-md border border-slate-200 object-cover" />
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-emerald-600 font-semibold">✓ Photo added</span>
                        <button onClick={() => setBookingForm(p => ({ ...p, productPhoto: "" }))}
                          className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-1">
                          <X className="h-3 w-3" /> Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 cursor-pointer w-fit">
                      <div className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 px-3 py-2 text-[10px] text-slate-500 font-medium transition">
                        <Upload className="h-3.5 w-3.5" />
                        Upload product photo
                      </div>
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = ev => setBookingForm(p => ({ ...p, productPhoto: ev.target?.result as string }));
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }} />
                    </label>
                  )}
                </div>

                {/* Courier Rates + COD — side by side when both visible */}
                {bookingForm.dispatchType === "COURIER" && (
                  <div className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Courier Rates</p>
                      <button onClick={fetchRates} disabled={ratesLoading}
                        className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-800 hover:bg-brand-100 disabled:opacity-60">
                        {ratesLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                        Fetch Courier Rates
                      </button>
                    </div>
                    {rates.length > 0 && (
                      <div className="grid grid-cols-4 gap-1.5 mb-2">
                        {rates.map((r, i) => (
                          <button key={i} onClick={() => setBookingForm(p => ({ ...p, courierCharges: r.amount.toString() }))}
                            className={`rounded-md border p-1.5 text-[10px] text-left transition ${bookingForm.courierCharges === r.amount.toString() ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                            <p className="font-semibold text-slate-800 truncate">{r.carrierName}</p>
                            <p className="text-brand-700 font-bold">{fmt(r.amount)}</p>
                            <p className="text-slate-400">~{r.estimatedDays}d</p>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] font-medium text-slate-700 whitespace-nowrap">Courier Charges (₹) *</label>
                      <input type="number" placeholder="Enter amount" value={bookingForm.courierCharges}
                        onChange={e => setBookingForm(p => ({ ...p, courierCharges: e.target.value }))}
                        className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs" />
                    </div>
                  </div>
                )}
                {/* COD + Payment — in one row */}
                <div className="grid grid-cols-2 gap-2">
                  <div className={`rounded-lg border px-3 py-2 ${bookingForm.isCod ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200"}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <input type="checkbox" id="cod" checked={bookingForm.isCod} onChange={e => setBookingForm(p => ({ ...p, isCod: e.target.checked }))} className="h-3.5 w-3.5" />
                      <label htmlFor="cod" className={`text-xs font-semibold cursor-pointer ${bookingForm.isCod ? "text-orange-800" : "text-slate-700"}`}>Cash on Delivery (COD)</label>
                    </div>
                    {bookingForm.isCod && (
                      <div className="space-y-1">
                        <p className="text-[10px] text-orange-700">
                          Suggested: Balance {fmt(totalBalance)}{shouldChargeDispatch ? ` + Courier ${fmt(courierNum)}` : ""} = <strong>{fmt(suggestedCod)}</strong>
                        </p>
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] font-medium text-slate-700 whitespace-nowrap">COD ₹</label>
                          <input type="number" placeholder={suggestedCod.toString()} value={bookingForm.codAmount}
                            onChange={e => setBookingForm(p => ({ ...p, codAmount: e.target.value }))}
                            className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                  {!bookingForm.isCod ? (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[10px] font-semibold text-emerald-800 mb-1.5 uppercase tracking-wide">Payment Receipt (Prepaid)</p>
                      <div className="space-y-1.5">
                        <select value={bookingForm.paymentMethod} onChange={e => setBookingForm(p => ({ ...p, paymentMethod: e.target.value }))}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-white">
                          {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <select value={bookingForm.paymentAccountId} onChange={e => setBookingForm(p => ({ ...p, paymentAccountId: e.target.value }))}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-white">
                          <option value="">Select account...</option>
                          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                        <input type="text" placeholder="UTR / Reference Number" value={bookingForm.paymentReference}
                          onChange={e => setBookingForm(p => ({ ...p, paymentReference: e.target.value }))}
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs bg-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <label className="block text-[10px] font-medium text-slate-700 mb-1">Notes for Accounts Team</label>
                      <textarea rows={3} value={bookingForm.notes} onChange={e => setBookingForm(p => ({ ...p, notes: e.target.value }))}
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs resize-none" />
                    </div>
                  )}
                </div>
                {!bookingForm.isCod && (
                  <div>
                    <label className="block text-[10px] font-medium text-slate-700 mb-0.5">Notes for Accounts Team</label>
                    <textarea rows={1} value={bookingForm.notes} onChange={e => setBookingForm(p => ({ ...p, notes: e.target.value }))}
                      className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs resize-none" />
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", borderTop: "1px solid #e2e8f0", padding: "0.625rem 1rem" }}>
                <button onClick={() => setBookingModal(false)}
                  style={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", padding: "0.375rem 0.875rem", fontSize: "0.75rem", fontWeight: 500, color: "#334155", background: "white", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={submitBooking} disabled={bookingSubmitting}
                  style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem", borderRadius: "0.5rem", border: "none", background: "#4f46e5", padding: "0.375rem 1.25rem", fontSize: "0.75rem", fontWeight: 600, color: "white", cursor: "pointer", opacity: bookingSubmitting ? 0.6 : 1 }}>
                  {bookingSubmitting ? <Loader2 style={{ width: 14, height: 14 }} /> : <Truck style={{ width: 14, height: 14 }} />}
                  Send to Accounts for Approval
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Receipt / Dispatch Label Modal ──────────────────────────── */}
      {printReceiptData && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "1rem" }}>
          <div style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "480px", boxShadow: "0 25px 50px rgba(0,0,0,0.3)", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
              <div>
                <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", margin: 0 }}>✅ Order Booked Successfully</h2>
                <p style={{ fontSize: "11px", color: "#64748b", margin: "2px 0 0" }}>Print receipt or dispatch label</p>
              </div>
              <button onClick={() => setPrintReceiptData(null)} style={{ padding: "4px", borderRadius: "6px", border: "none", background: "none", cursor: "pointer", color: "#94a3b8" }}>
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>
            {/* Receipt Preview */}
            <div id="dispatch-receipt-print" style={{ padding: "1rem", fontFamily: "Arial, sans-serif" }}>
              <div style={{ textAlign: "center", marginBottom: "12px", paddingBottom: "10px", borderBottom: "2px solid #0f172a" }}>
                <p style={{ fontSize: "16px", fontWeight: 800, margin: 0, color: "#0f172a" }}>RAREPRINT</p>
                <p style={{ fontSize: "9px", color: "#64748b", margin: "2px 0 0" }}>Dispatch Receipt / Courier Label</p>
                <p style={{ fontSize: "9px", color: "#64748b", margin: "1px 0 0" }}>{new Date().toLocaleString("en-IN")}</p>
              </div>

              {/* Product Photo */}
              {printReceiptData.productPhoto && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: "12px" }}>
                  <div style={{ textAlign: "center" }}>
                    <img src={printReceiptData.productPhoto} alt="Product" style={{ height: "120px", width: "120px", objectFit: "cover", borderRadius: "8px", border: "2px solid #e2e8f0" }} />
                    <p style={{ fontSize: "9px", color: "#94a3b8", margin: "4px 0 0" }}>PRODUCT PHOTO</p>
                  </div>
                </div>
              )}

              {/* Order(s) */}
              {printReceiptData.orders.map(o => (
                <div key={o.id} style={{ marginBottom: "10px", padding: "8px", background: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>{o.orderNo}</span>
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#2563eb" }}>{fmt(o.totalAmount)}</span>
                  </div>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#334155", margin: "0 0 2px" }}>{o.customerName}</p>
                  {o.customerPhone && <p style={{ fontSize: "10px", color: "#64748b", margin: "0 0 2px" }}>📞 {o.customerPhone}</p>}
                  {o.shippingAddress && <p style={{ fontSize: "10px", color: "#64748b", margin: 0, lineHeight: "1.4" }}>📍 {o.shippingAddress}</p>}
                </div>
              ))}

              {/* Dispatch Info */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "10px" }}>
                <div style={{ padding: "6px 8px", background: "#eff6ff", borderRadius: "6px", border: "1px solid #bfdbfe" }}>
                  <p style={{ fontSize: "9px", color: "#3b82f6", fontWeight: 600, margin: "0 0 2px", textTransform: "uppercase" }}>Dispatch Via</p>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: "#1e40af", margin: 0 }}>
                    {printReceiptData.dispatchType === "COURIER" ? "🚚 Courier" : printReceiptData.dispatchType === "TRANSPORT" ? "🚛 Transport" : printReceiptData.dispatchType === "BY_HAND" ? "🚶 By Hand" : "🏪 Self Collect"}
                    {printReceiptData.transportName ? ` — ${printReceiptData.transportName}` : ""}
                  </p>
                  {printReceiptData.awbNumber && <p style={{ fontSize: "10px", color: "#2563eb", margin: "2px 0 0" }}>AWB: <strong>{printReceiptData.awbNumber}</strong></p>}
                </div>
                <div style={{ padding: "6px 8px", background: printReceiptData.isCod ? "#fff7ed" : "#f0fdf4", borderRadius: "6px", border: `1px solid ${printReceiptData.isCod ? "#fed7aa" : "#bbf7d0"}` }}>
                  <p style={{ fontSize: "9px", color: printReceiptData.isCod ? "#ea580c" : "#16a34a", fontWeight: 600, margin: "0 0 2px", textTransform: "uppercase" }}>Payment</p>
                  <p style={{ fontSize: "11px", fontWeight: 700, color: printReceiptData.isCod ? "#c2410c" : "#15803d", margin: 0 }}>
                    {printReceiptData.isCod ? `💰 COD — ${fmt(printReceiptData.codAmount)}` : "✅ Prepaid"}
                  </p>
                  {printReceiptData.courierCharges > 0 && <p style={{ fontSize: "10px", color: "#64748b", margin: "2px 0 0" }}>Courier: {fmt(printReceiptData.courierCharges)}</p>}
                </div>
              </div>

              <div style={{ textAlign: "center", borderTop: "1px dashed #cbd5e1", paddingTop: "8px" }}>
                <p style={{ fontSize: "9px", color: "#94a3b8", margin: 0 }}>Scan &amp; apply label to correct product before dispatch</p>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "0.625rem 1rem", borderTop: "1px solid #e2e8f0" }}>
              <button onClick={() => setPrintReceiptData(null)}
                style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 12px", fontSize: "12px", color: "#334155", background: "white", cursor: "pointer" }}>
                Close
              </button>
              <button onClick={() => {
                const el = document.getElementById("dispatch-receipt-print");
                if (!el) return;
                const win = window.open("", "_blank", "width=480,height=700");
                if (!win) return;
                win.document.write(`<html><head><title>Dispatch Receipt</title><style>body{margin:0;padding:16px;font-family:Arial,sans-serif;}@media print{body{margin:0;}}</style></head><body>${el.innerHTML}</body></html>`);
                win.document.close();
                win.focus();
                setTimeout(() => { win.print(); }, 400);
              }}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", border: "none", background: "#0f172a", padding: "6px 16px", fontSize: "12px", fontWeight: 600, color: "white", cursor: "pointer" }}>
                🖨️ Print Receipt / Label
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Payment Modal ─────────────────────────────────────────────── */}
      {editingPayment && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "1rem" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "34rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Edit Payment</h2>
                <p className="text-xs text-slate-500 mt-0.5">{editingPayment.payment.paymentAccount.name} · {fmt(editingPayment.payment.amount)}</p>
              </div>
              <button onClick={() => setEditingPayment(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Amount</span>
                <input type="number" min="1" step="0.01" value={editPaymentForm.amount}
                  onChange={e => setEditPaymentForm(f => ({ ...f, amount: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Payment Date</span>
                <DateInput value={editPaymentForm.paymentDate}
                  onChange={e => setEditPaymentForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Method</span>
                <select value={editPaymentForm.method}
                  onChange={e => setEditPaymentForm(f => ({ ...f, method: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                  {Object.entries(METHOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Account</span>
                <select value={editPaymentForm.paymentAccountId}
                  onChange={e => setEditPaymentForm(f => ({ ...f, paymentAccountId: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                  <option value="">Select account</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}{a.bankName ? ` (${a.bankName})` : ""}</option>)}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-semibold text-slate-600">UTR / Reference No</span>
                <input value={editPaymentForm.referenceNumber}
                  onChange={e => setEditPaymentForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-semibold text-slate-600">Notes</span>
                <textarea rows={2} value={editPaymentForm.notes}
                  onChange={e => setEditPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingPayment(null)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={savePaymentEdit} disabled={savingPaymentEdit}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60 font-semibold">

                {savingPaymentEdit ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
