"use client";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Check, ChevronDown, ChevronUp, Loader2, X, Truck, Search, FileText, Pencil, Save, MessageCircle } from "lucide-react";
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
  shippingAddress?: string;
  items: OrderItem[];
  totalAmount: number; totalPaid: number; balanceDue: number;
  orderDate: string; notes?: string; payments: Payment[];
  courierCharge?: number; courierCreditApplied?: number; netCourierCharge?: number;
  paymentType?: string; codAmount?: number;
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
  paymentAccountId: string;
  paymentAccountName: string;
  receivedByName?: string;
  verificationStatus: string;
  createdAt: string;
};

type PaymentAccount = {
  id: string;
  name: string;
  bankName?: string;
  accountType?: string;
  upiId?: string;
};

type EditPaymentForm = {
  amount: string;
  method: string;
  paymentAccountId: string;
  referenceNumber: string;
  notes: string;
  paymentDate: string;
};

type CustomerOutstanding = {
  customerId: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  reminderAmount: number;
  canSendReminder: boolean;
  orderCount: number;
  lastOrderDate: string;
  orderNumbers: string;
  orderStatuses?: string;
  reminderOrderNumbers?: string;
  productStatuses?: string;
};

type ReceiptHistory = {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone?: string;
  salesAgentName?: string;
  amount: number;
  method: string;
  referenceNumber?: string;
  paymentDate: string;
  paymentAccountName: string;
  verificationStatus: "VERIFIED" | "REJECTED";
  verifiedByName?: string;
  verifiedAt?: string;
};

type BankTxn = {
  id: string;
  accountNumber: string;
  txnDate: string;
  description: string;
  amount: number | string;
  balance: number | string;
  crDr: string;
  reconcileStatus: string;
  chequeNo?: string;
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

function fmt(n: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n));
}
function moneyColor(n: number) {
  if (n < 0) return "text-blue-700";
  if (n > 0) return "text-red-500";
  return "text-emerald-600";
}
function parseNotes(notes?: string) {
  if (!notes) return {};
  const size = notes.match(/Size:\s*([^,]+)/)?.[1]?.trim();
  const gsm = notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim();
  const sides = notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim();
  return { size, gsm, sides };
}

type Tab = "pending" | "outstanding" | "dispatch" | "receipts" | "receipt_history" | "vendors";

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

const productStatusLabels: Record<string, string> = {
  NOT_PRINTED: "Not Printed",
  PRINTING: "Printing",
  PROCESSING: "Processing",
  READY_FOR_DISPATCH: "Ready for Dispatch",
};
const productStatusClass: Record<string, string> = {
  NOT_PRINTED: "bg-slate-100 text-slate-700",
  PRINTING: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-amber-100 text-amber-700",
  READY_FOR_DISPATCH: "bg-green-100 text-green-700",
};

const orderStatusLabels: Record<string, string> = {
  PENDING_APPROVAL: "Pending Approval",
  APPROVED: "Approved",
  IN_PRODUCTION: "In Production",
  READY_FOR_DISPATCH: "Ready",
  PENDING_DISPATCH_APPROVAL: "Dispatch Approval",
  PARTIALLY_DISPATCHED: "Partial Dispatch",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
};
const orderStatusClass: Record<string, string> = {
  READY_FOR_DISPATCH: "bg-green-100 text-green-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  DISPATCHED: "bg-blue-100 text-blue-700",
  PARTIALLY_DISPATCHED: "bg-cyan-100 text-cyan-700",
  IN_PRODUCTION: "bg-amber-100 text-amber-700",
};

const paymentMethods = ["CASH", "BANK_TRANSFER", "UPI", "CHEQUE", "CARD"];
const GST_BANK_ACCOUNT = "0513102000013378";

export default function AccountsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");

  // Pending orders
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
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
  const [receiptHistory, setReceiptHistory] = useState<ReceiptHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyUtrId, setVerifyUtrId] = useState<string | null>(null);
  const [utrDraft, setUtrDraft] = useState<Record<string, string>>({});
  const [verifyUtrValue, setVerifyUtrValue] = useState("");
  const [bankMatchPayment, setBankMatchPayment] = useState<PendingPayment | null>(null);
  const [bankMatchResults, setBankMatchResults] = useState<BankTxn[]>([]);
  const [bankMatchLoading, setBankMatchLoading] = useState(false);
  const [rejectPaymentId, setRejectPaymentId] = useState<string | null>(null);
  const [rejectPaymentReason, setRejectPaymentReason] = useState("");
  const [paymentAccounts, setPaymentAccounts] = useState<PaymentAccount[]>([]);
  const [editingPayment, setEditingPayment] = useState<PendingPayment | null>(null);
  const [editPaymentForm, setEditPaymentForm] = useState<EditPaymentForm>({
    amount: "",
    method: "CASH",
    paymentAccountId: "",
    referenceNumber: "",
    notes: "",
    paymentDate: "",
  });
  const [savingPaymentId, setSavingPaymentId] = useState<string | null>(null);

  // Customer outstanding
  const [outstanding, setOutstanding] = useState<CustomerOutstanding[]>([]);
  const [outstandingLoading, setOutstandingLoading] = useState(false);
  const [outstandingSearch, setOutstandingSearch] = useState("");
  const [outstandingStatus, setOutstandingStatus] = useState("");
  const [outstandingOrderStatus, setOutstandingOrderStatus] = useState("READY_DELIVERED");
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);

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
      const headers = getAuthHeaders();
      const [res, accountsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/accounts/pending`, { headers }),
        fetch(`${API_BASE_URL}/accounts/payment-accounts`, { headers }),
      ]);
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      setOrders(await res.json());
      if (accountsRes.ok) setPaymentAccounts(await accountsRes.json());
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
      const headers = getAuthHeaders();
      const [paymentsRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/accounts/pending-payments`, { headers }),
        fetch(`${API_BASE_URL}/accounts/payment-accounts`, { headers }),
      ]);
      setPendingPayments(await paymentsRes.json());
      if (accountsRes.ok) setPaymentAccounts(await accountsRes.json());
    } finally { setReceiptsLoading(false); }
  }, []);

  const loadOutstanding = useCallback(async () => {
    setOutstandingLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/customer-outstanding`, { headers: getAuthHeaders() });
      if (res.ok) setOutstanding(await res.json());
    } finally { setOutstandingLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "dispatch") void loadDispatch(); }, [tab, loadDispatch]);
  useEffect(() => { if (tab === "receipts") void loadReceipts(); }, [tab, loadReceipts]);
  useEffect(() => { if (tab === "outstanding") void loadOutstanding(); }, [tab, loadOutstanding]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-history`, { headers: getAuthHeaders() });
      if (res.ok) setReceiptHistory(await res.json());
    } finally { setHistoryLoading(false); }
  }, []);
  useEffect(() => { if (tab === "vendors") void loadVendors(); if (tab === "receipt_history") void loadHistory(); }, [tab, loadVendors, loadHistory]);

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

  async function openBankMatch(payment: PendingPayment) {
    setBankMatchPayment(payment);
    setBankMatchResults([]);
    setBankMatchLoading(true);
    try {
      const paymentDate = new Date(payment.paymentDate).toISOString().split("T")[0];
      const params = new URLSearchParams({
        crDr: "CR",
        amountMin: String(payment.amount),
        amountMax: String(payment.amount),
        fromDate: paymentDate,
        toDate: paymentDate,
        limit: "50",
      });
      if (payment.paymentAccountName.toUpperCase().includes("GST")) {
        params.set("accountNumber", GST_BANK_ACCOUNT);
      }
      const res = await fetch(`${API_BASE_URL}/bank-statement/transactions?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        const rows: BankTxn[] = data.data ?? [];
        setBankMatchResults(
          payment.paymentAccountName.toUpperCase().includes("CC")
            ? rows.filter((txn) => txn.accountNumber !== GST_BANK_ACCOUNT)
            : rows,
        );
      }
    } finally { setBankMatchLoading(false); }
  }

  async function matchAndVerify(txn: BankTxn) {
    if (!bankMatchPayment) return;
    setVerifyingId(bankMatchPayment.id);
    try {
      const referenceNumber = txn.chequeNo || txn.description.slice(0, 50);
      await fetch(`${API_BASE_URL}/accounts/payments/${bankMatchPayment.id}/verify`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ referenceNumber }),
      });
      await fetch(`${API_BASE_URL}/bank-statement/transactions/${txn.id}/reconcile`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          reconcileStatus: "MATCHED_PAYMENT",
          matchedPaymentId: bankMatchPayment.id,
          reviewNote: `Matched from receipt checking for ${bankMatchPayment.orderNo}`,
        }),
      });
      setBankMatchPayment(null);
      setBankMatchResults([]);
      await loadReceipts();
    } finally { setVerifyingId(null); }
  }

  async function verifyPayment(id: string, utr?: string) {
    setVerifyingId(id);
    try {
      await fetch(`${API_BASE_URL}/accounts/payments/${id}/verify`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ referenceNumber: utr || undefined }),
      });
      await loadReceipts();
    } finally {
      setVerifyingId(null);
      setVerifyUtrId(null);
      setVerifyUtrValue("");
    }
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
await loadHistory();
    } finally { setVerifyingId(null); }
  }

  function startEditPayment(payment: PendingPayment) {
    setEditingPayment(payment);
    setEditPaymentForm({
      amount: String(payment.amount),
      method: payment.method,
      paymentAccountId: payment.paymentAccountId,
      referenceNumber: payment.referenceNumber ?? "",
      notes: payment.notes ?? "",
      paymentDate: new Date(payment.paymentDate).toISOString().slice(0, 10),
    });
  }

  function startEditOrderPayment(payment: Payment, order: PendingOrder) {
    const account = paymentAccounts.find(a => a.name === payment.accountName);
    const pseudo: PendingPayment = {
      id: payment.id,
      orderId: order.id,
      orderNo: order.orderNo,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      salesAgentName: order.salesAgentName,
      amount: payment.amount,
      method: payment.method,
      referenceNumber: payment.referenceNumber,
      notes: payment.notes,
      paymentDate: payment.date,
      paymentAccountId: account?.id ?? "",
      paymentAccountName: payment.accountName,
      verificationStatus: "PENDING",
      createdAt: payment.date,
    };
    startEditPayment(pseudo);
  }

  async function savePaymentEdit() {
    if (!editingPayment) return;
    const amount = Number(editPaymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Enter a valid payment amount");
      return;
    }
    if (!editPaymentForm.paymentAccountId) {
      alert("Select a payment account");
      return;
    }

    setSavingPaymentId(editingPayment.id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payments/${editingPayment.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          method: editPaymentForm.method,
          paymentAccountId: editPaymentForm.paymentAccountId,
          referenceNumber: editPaymentForm.referenceNumber,
          notes: editPaymentForm.notes,
          paymentDate: editPaymentForm.paymentDate,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not update receipt");
      }
      setEditingPayment(null);
      await Promise.all([load(), loadReceipts()]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not update receipt");
    } finally {
      setSavingPaymentId(null);
    }
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

  async function sendBalanceReminder(row: CustomerOutstanding) {
    if (!row.canSendReminder) {
      alert("Reminder can be sent only when the customer has phone number and Ready/Delivered balance.");
      return;
    }
    if (!confirm(`Send balance reminder to ${row.customerName} for ${fmt(row.reminderAmount)}?`)) return;
    setSendingReminderId(row.customerId);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/customers/${row.customerId}/balance-reminder`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not send reminder");
      }
      alert("Balance reminder sent on WhatsApp");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not send reminder");
    } finally {
      setSendingReminderId(null);
    }
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
  const filteredOutstanding = useMemo(() => {
    const q = outstandingSearch.trim().toLowerCase();
    return outstanding.filter(row =>
      (!outstandingStatus || (row.productStatuses ?? "").split(", ").includes(outstandingStatus)) &&
      (outstandingOrderStatus !== "READY_DELIVERED" || row.reminderAmount > 0) &&
      (outstandingOrderStatus === "READY_DELIVERED" || !outstandingOrderStatus || (row.orderStatuses ?? "").split(", ").includes(outstandingOrderStatus)) &&
      (!q ||
        row.customerName.toLowerCase().includes(q) ||
        row.customerPhone?.toLowerCase().includes(q) ||
        row.customerEmail?.toLowerCase().includes(q) ||
        row.orderNumbers.toLowerCase().includes(q))
    );
  }, [outstanding, outstandingSearch, outstandingStatus, outstandingOrderStatus]);
  const outstandingStatuses = useMemo(() => (
    Array.from(new Set(outstanding.flatMap(row => (row.productStatuses ?? "").split(", ").filter(Boolean)))).sort()
  ), [outstanding]);
  const outstandingOrderStatuses = useMemo(() => (
    Array.from(new Set(outstanding.flatMap(row => (row.orderStatuses ?? "").split(", ").filter(Boolean)))).sort()
  ), [outstanding]);
  const outstandingTotal = useMemo(() => filteredOutstanding.reduce((sum, row) => sum + row.outstandingAmount, 0), [filteredOutstanding]);
  const outstandingPaidTotal = useMemo(() => filteredOutstanding.reduce((sum, row) => sum + row.paidAmount, 0), [filteredOutstanding]);

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
                { key: "outstanding", label: "Customer Outstanding", count: outstanding.length },
                { key: "dispatch", label: "Dispatch Approval", count: dispatchOrders.length },
                { key: "receipts", label: "Receipts Pending", count: pendingPayments.length },
                { key: "receipt_history", label: "Receipt History", count: receiptHistory.length },
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
                    <span className="text-sm font-bold text-slate-800">{fmt(order.totalAmount)}</span>
                  </div>

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
                    {/* Payment rows */}
                    {order.payments.length > 0 && (
                      <div className="rounded-lg border border-slate-100 bg-slate-50 divide-y divide-slate-100">
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Payments</div>
                        {order.payments.map(payment => (
                          <div key={payment.id} className="flex items-center justify-between px-3 py-1.5">
                            <div className="flex items-center gap-3 text-xs text-slate-600">
                              <span className="font-mono text-slate-400">{new Date(payment.date).toLocaleDateString("en-IN")}</span>
                              <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">{payment.method}</span>
                              <span className="text-slate-500">{payment.accountName}</span>
                              {payment.referenceNumber && <span className="font-mono text-slate-400">Ref: {payment.referenceNumber}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-green-700">{fmt(payment.amount)}</span>
                              <button onClick={() => startEditOrderPayment(payment, order)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100">
                                <Pencil className="h-3 w-3" /> Edit
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

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
                </div>
              ))}
            </div>
          )}

          {tab === "outstanding" && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                  <p className="text-xs font-semibold text-red-600">Total Outstanding</p>
                  <p className="mt-1 text-xl font-bold text-red-700">{fmt(outstandingTotal)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold text-slate-500">Customers</p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{filteredOutstanding.length}</p>
                </div>
                <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                  <p className="text-xs font-semibold text-green-600">Verified Paid</p>
                  <p className="mt-1 text-xl font-bold text-green-700">{fmt(outstandingPaidTotal)}</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap gap-3">
                  <div className="relative min-w-64 max-w-sm flex-1">
                    <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={outstandingSearch}
                      onChange={e => setOutstandingSearch(e.target.value)}
                      placeholder="Search customer, phone, order..."
                      className="w-full rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-blue-400"
                    />
                  </div>
                  <select
                    value={outstandingStatus}
                    onChange={e => setOutstandingStatus(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-400"
                  >
                    <option value="">All Product Status</option>
                    {outstandingStatuses.map(status => (
                      <option key={status} value={status}>{productStatusLabels[status] ?? status.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                  <select
                    value={outstandingOrderStatus}
                    onChange={e => setOutstandingOrderStatus(e.target.value)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-400"
                  >
                    <option value="READY_DELIVERED">Ready / Delivered</option>
                    <option value="">All Order Status</option>
                    {outstandingOrderStatuses.map(status => (
                      <option key={status} value={status}>{orderStatusLabels[status] ?? status.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
              </div>

              {outstandingLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : filteredOutstanding.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <Check className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm">No customer outstanding found</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-xs">
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Orders</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Total Billing</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Paid</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Outstanding</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Product Status</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Last Order</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order Nos</th>
                        <th className="px-3 py-2 text-right font-semibold text-slate-600">Reminder</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOutstanding.map(row => (
                        <tr key={row.customerId} className="hover:bg-slate-50">
                          <td className="px-3 py-2">
                            <div className="font-bold text-slate-900">{row.customerName}</div>
                            <div className="text-slate-400">{row.customerPhone || row.customerEmail || "No contact"}</div>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">{row.orderCount}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmt(row.totalAmount)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-green-700">{fmt(row.paidAmount)}</td>
                          <td className="px-3 py-2 text-right text-sm font-bold text-red-600">{fmt(row.outstandingAmount)}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(row.orderStatuses ?? "").split(", ").filter(Boolean).map(status => (
                                <span key={status} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${orderStatusClass[status] ?? "bg-slate-100 text-slate-700"}`}>
                                  {orderStatusLabels[status] ?? status.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {(row.productStatuses ?? "").split(", ").filter(Boolean).map(status => (
                                <span key={status} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${productStatusClass[status] ?? "bg-slate-100 text-slate-700"}`}>
                                  {productStatusLabels[status] ?? status.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500">{new Date(row.lastOrderDate).toLocaleDateString("en-IN")}</td>
                          <td className="max-w-xs truncate px-3 py-2 font-mono text-slate-500" title={row.orderNumbers}>{row.orderNumbers}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => sendBalanceReminder(row)}
                              disabled={!row.canSendReminder || sendingReminderId === row.customerId}
                              title={row.canSendReminder ? `Send for ${row.reminderOrderNumbers}` : "Needs phone and Ready/Delivered balance"}
                              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400"
                            >
                              {sendingReminderId === row.customerId ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                              {row.reminderAmount > 0 ? fmt(row.reminderAmount) : "Send"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr>
                        <td colSpan={4} className="px-3 py-2 text-xs font-semibold text-slate-600">Total Outstanding ({filteredOutstanding.length} customers)</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-red-600">{fmt(outstandingTotal)}</td>
                        <td colSpan={5} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
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
                      <span className={`text-xs font-bold ${moneyColor(order.balanceDue)}`}>Balance: {fmt(order.balanceDue)}</span>
                      <button onClick={() => setDispatchExpanded(dispatchExpanded === order.id ? null : order.id)}
                        className="p-1 rounded hover:bg-slate-200">
                        {dispatchExpanded === order.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {dispatchExpanded === order.id && (
                    <div className="p-4 space-y-3">
                      {/* Customer & Shipping Info */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 text-xs space-y-1">
                          <p className="font-semibold text-blue-800 text-[10px] uppercase tracking-wide mb-1">Customer</p>
                          {order.customerPhone && <p className="text-slate-700">📞 {order.customerPhone}</p>}
                          {(order.shippingAddress || order.customerAddress) && (
                            <p className="text-slate-600">📍 {order.shippingAddress || order.customerAddress}</p>
                          )}
                          {order.salesAgentName && <p className="text-slate-500">Agent: {order.salesAgentName}</p>}
                        </div>
                        {/* Financial summary */}
                        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs space-y-1">
                          <p className="font-semibold text-slate-600 text-[10px] uppercase tracking-wide mb-1">Financials</p>
                          <div className="flex justify-between"><span className="text-slate-500">Order Total</span><span className="font-semibold">{fmt(order.totalAmount)}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="font-semibold text-emerald-600">{fmt(order.totalPaid)}</span></div>
                          <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-700 font-semibold">Balance Due</span><span className={`font-bold ${moneyColor(order.balanceDue)}`}>{fmt(order.balanceDue)}</span></div>
                          {order.courierCharge != null && (
                            <>
                              {Number(order.courierCreditApplied || 0) > 0 && (
                                <div className="flex justify-between"><span className="text-slate-500">Credit Adjusted</span><span className="font-semibold text-emerald-600">-{fmt(order.courierCreditApplied || 0)}</span></div>
                              )}
                              <div className="flex justify-between"><span className="text-slate-500">Courier Charges</span><span className="font-semibold text-blue-700">{fmt(order.netCourierCharge ?? order.courierCharge)}</span></div>
                            </>
                          )}
                          {order.codAmount != null && (
                            <div className="flex justify-between"><span className="text-orange-600 font-semibold">COD Amount</span><span className="font-bold text-orange-700">{fmt(order.codAmount)}</span></div>
                          )}
                        </div>
                      </div>
                      {/* Items table */}
                      <table className="w-full text-xs">
                        <thead><tr className="border-b border-slate-100 text-slate-500">
                          <th className="pb-1 text-left font-medium">Product</th>
                          <th className="pb-1 text-right font-medium">Qty</th>
                          <th className="pb-1 text-right font-medium">Amount</th>
                        </tr></thead>
                        <tbody>
                          {order.items.map((item, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="py-1 font-medium text-slate-800">{item.productName}</td>
                              <td className="py-1 text-right text-slate-600">{item.quantity}</td>
                              <td className="py-1 text-right text-slate-800">{fmt(item.lineTotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {/* Agent Notes */}
                      {order.notes && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                          <p className="font-semibold text-amber-800 text-[10px] uppercase tracking-wide mb-1">Agent Notes</p>
                          <p className="text-amber-900 whitespace-pre-wrap">{order.notes}</p>
                        </div>
                      )}
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
                          <td className="px-3 py-2">
                          <input value={p.id === verifyUtrId ? verifyUtrValue : (utrDraft[p.id] ?? p.referenceNumber ?? "")}
                            onChange={e => {
                              setVerifyUtrValue(e.target.value);
                              setUtrDraft(d => ({ ...d, [p.id]: e.target.value }));
                            }}
                            onFocus={() => { setVerifyUtrId(p.id); setVerifyUtrValue(utrDraft[p.id] ?? p.referenceNumber ?? ""); }}
                            placeholder="UTR / Ref No"
                            className="border border-slate-200 rounded px-2 py-1 text-xs w-36 outline-none focus:border-blue-400 bg-white" />
                        </td>
                          <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(p.amount)}</td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => startEditPayment(p)} disabled={verifyingId === p.id || savingPaymentId === p.id}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 font-semibold disabled:opacity-60">
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                              <button onClick={() => openBankMatch(p)} disabled={verifyingId === p.id}
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-semibold">
                                  {verifyingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                  Match & Verify
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
          {tab === "receipt_history" && (
                <div className="overflow-x-auto">
                  {historyLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                  ) : receiptHistory.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">No verified receipts yet.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Date</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Agent</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Method</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Account</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">UTR / Ref No</th>
                          <th className="px-3 py-2 text-right font-semibold text-slate-600">Amount</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Verified By</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Verified At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {receiptHistory.map(p => (
                          <tr key={p.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 whitespace-nowrap text-slate-500">{new Date(p.paymentDate).toLocaleDateString("en-IN")}</td>
                            <td className="px-3 py-2 font-bold text-blue-700">{p.orderNo}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {p.customerName}
                              {p.customerPhone && <div className="text-slate-400 text-xs">{p.customerPhone}</div>}
                            </td>
                            <td className="px-3 py-2 text-slate-600">{p.salesAgentName || "—"}</td>
                            <td className="px-3 py-2"><span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-semibold">{p.method}</span></td>
                            <td className="px-3 py-2 text-slate-600">{p.paymentAccountName}</td>
                            <td className="px-3 py-2 font-mono text-slate-500 text-xs">{p.referenceNumber || "—"}</td>
                            <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(p.amount)}</td>
                            <td className="px-3 py-2">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${p.verificationStatus === "VERIFIED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                                {p.verificationStatus}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-slate-600 text-xs">{p.verifiedByName || "—"}</td>
                            <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{p.verifiedAt ? new Date(p.verifiedAt).toLocaleString("en-IN", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                        <tr>
                          <td colSpan={7} className="px-3 py-2 text-xs font-semibold text-slate-600">Total Verified ({receiptHistory.filter(p => p.verificationStatus === "VERIFIED").length} receipts)</td>
                          <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(receiptHistory.filter(p => p.verificationStatus === "VERIFIED").reduce((s, p) => s + p.amount, 0))}</td>
                          <td colSpan={3} />
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>
              )}

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
                <select value={paidFilter} onChange={e => setPaidFilter(e.target.value as "all" | "paid" | "unpaid")}
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
                                <span className="text-slate-400 ml-1">{entry.sheetGsm} GSM · {entry.sheetSize}&quot;</span>
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

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "1rem" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "34rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Edit Payment Receipt</h2>
                <p className="text-xs text-slate-500 mt-0.5">{editingPayment.orderNo} · {editingPayment.customerName}</p>
              </div>
              <button onClick={() => setEditingPayment(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
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
                <input type="date" value={editPaymentForm.paymentDate}
                  onChange={e => setEditPaymentForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Method</span>
                <select value={editPaymentForm.method}
                  onChange={e => setEditPaymentForm(f => ({ ...f, method: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                  {paymentMethods.map(method => <option key={method} value={method}>{method.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Received In</span>
                <select value={editPaymentForm.paymentAccountId}
                  onChange={e => setEditPaymentForm(f => ({ ...f, paymentAccountId: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                  <option value="">Select account</option>
                  {paymentAccounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name}{account.bankName ? ` (${account.bankName})` : ""}
                    </option>
                  ))}
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
                <textarea rows={3} value={editPaymentForm.notes}
                  onChange={e => setEditPaymentForm(f => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none" />
              </label>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingPayment(null)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={savePaymentEdit} disabled={savingPaymentId === editingPayment.id}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 font-semibold">
                {savingPaymentId === editingPayment.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bank Statement Match Popup */}
      {bankMatchPayment && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", padding: "1rem" }}>
          <div style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "620px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "0.875rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Match with Bank Statement</h2>
                  <p style={{ fontSize: "11px", color: "#64748b", margin: "3px 0 0" }}>
                    {bankMatchPayment.orderNo} · {bankMatchPayment.customerName} · <strong style={{ color: "#16a34a" }}>{fmt(bankMatchPayment.amount)}</strong> · {new Date(bankMatchPayment.paymentDate).toLocaleDateString("en-IN")}
                  </p>
                  <p style={{ fontSize: "10px", color: "#94a3b8", margin: "2px 0 0" }}>Showing credit entries for the same date and same amount only</p>
                </div>
                <button onClick={() => { setBankMatchPayment(null); setBankMatchResults([]); }}
                  style={{ padding: "4px", borderRadius: "6px", border: "none", background: "none", cursor: "pointer", color: "#94a3b8", fontSize: "16px" }}>x</button>
              </div>
            </div>

            <div style={{ overflowY: "auto", flex: 1, padding: "0.75rem 1rem" }}>
              {bankMatchLoading ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "2rem", fontSize: "12px", color: "#64748b" }}>
                  Searching bank statement...
                </div>
              ) : bankMatchResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px" }}>No matching entries found in bank statement</p>
                  <p style={{ fontSize: "11px", color: "#cbd5e1" }}>You can still verify manually using the UTR field.</p>
                  <button onClick={() => { verifyPayment(bankMatchPayment.id, utrDraft[bankMatchPayment.id] ?? bankMatchPayment.referenceNumber ?? ""); setBankMatchPayment(null); }}
                    style={{ marginTop: "12px", background: "#16a34a", color: "white", border: "none", borderRadius: "6px", padding: "6px 14px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}>
                    Verify Manually
                  </button>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>Date</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>Description</th>
                      <th style={{ textAlign: "right", padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>Amount</th>
                      <th style={{ textAlign: "left", padding: "4px 8px", color: "#64748b", fontWeight: 600 }}>Status</th>
                      <th style={{ padding: "4px 8px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {bankMatchResults.map(txn => (
                      <tr key={txn.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", color: "#475569", whiteSpace: "nowrap" }}>{new Date(txn.txnDate).toLocaleDateString("en-IN")}</td>
                        <td style={{ padding: "6px 8px", color: "#334155", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txn.description}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "#16a34a" }}>{fmt(txn.amount)}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "9999px", background: txn.reconcileStatus === "MATCHED_PAYMENT" ? "#dcfce7" : txn.reconcileStatus === "MANUAL_REVIEW" ? "#fef9c3" : "#f1f5f9", color: txn.reconcileStatus === "MATCHED_PAYMENT" ? "#15803d" : txn.reconcileStatus === "MANUAL_REVIEW" ? "#854d0e" : "#64748b", fontWeight: 600 }}>
                            {txn.reconcileStatus === "MATCHED_PAYMENT" ? "Already Matched" : txn.reconcileStatus === "MANUAL_REVIEW" ? "Needs Review" : txn.reconcileStatus}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <button onClick={() => matchAndVerify(txn)} disabled={verifyingId === bankMatchPayment.id}
                            style={{ background: "#2563eb", color: "white", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer", opacity: verifyingId === bankMatchPayment.id ? 0.6 : 1 }}>
                            {verifyingId === bankMatchPayment.id ? "..." : "Match"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ padding: "0.625rem 1rem", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => { setBankMatchPayment(null); setBankMatchResults([]); }}
                style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "5px 14px", fontSize: "12px", color: "#334155", background: "white", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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

