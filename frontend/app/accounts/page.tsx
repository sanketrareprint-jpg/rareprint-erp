"use client";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";
import { Check, ChevronDown, ChevronUp, Loader2, X, Truck, Search, FileText, Pencil, Save, MessageCircle, AlertTriangle, Package, PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";

type Payment = { id: string; date: string; amount: number; method: string; referenceNumber?: string; notes?: string; accountName: string; };
type OrderItem = {
  productName: string;
  productDescription?: string | null;
  sku: string;
  sizeInches?: string | null;
  gsm?: number | null;
  sides?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productionNotes?: string;
  artworkNotes?: string;
  costPerUnit?: number | null;
  costTotal?: number | null;
  marginTotal?: number | null;
  marginPct?: number | null;
};

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

type VendorMaster = { id: string; name: string; gstNumber?: string };
type AccountingSummary = {
  sales: { invoiceCount: number; total: number; paid: number; receivable: number; outputGst: number };
  purchases: { billCount: number; total: number; paid: number; payable: number; inputGst: number };
  notes: { creditNotes: number; debitNotes: number; creditAmount: number; debitAmount: number };
  gst: { netPayableEstimate: number };
  recentLedger: { id: string; entryDate: string; accountName: string; entryType: string; debitAmount: number; creditAmount: number; narration?: string }[];
};
type SalesInvoice = {
  id: string; customerId: string; invoiceNumber: string; issueDate: string; customerName: string; gstNumber?: string;
  gstTreatment: string; taxableAmount: number; taxAmount: number; totalAmount: number; paidAmount: number;
  balanceAmount: number; whatsappStatus: string; status: string;
};
type PurchaseBill = {
  id: string; vendorId: string; vendorName: string; billNumber: string; billDate: string; dueDate?: string;
  taxableAmount: number; taxAmount: number; totalAmount: number; paidAmount: number; balanceAmount: number;
  gstTreatment: string; status: string;
};
type AccountingNote = {
  id: string; noteNumber: string; noteType: string; partyType: string; partyName: string; referenceNumber?: string;
  noteDate: string; reason: string; taxableAmount: number; taxAmount: number; totalAmount: number; status: string;
};

function fmt(n: number | string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(n));
}
function moneyColor(n: number) {
  if (n < 0) return "text-blue-700";
  if (n > 0) return "text-red-500";
  return "text-emerald-600";
}
function marginClass(marginPct?: number | null) {
  if (marginPct === null || marginPct === undefined) return "text-slate-400";
  if (marginPct < 15) return "text-red-600";
  if (marginPct < 20) return "text-amber-600";
  return "text-green-700";
}
function parseNotes(notes?: string) {
  if (!notes) return {};
  const size = notes.match(/Size:\s*([^,]+)/)?.[1]?.trim();
  const gsm = notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim();
  const sides = notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim();
  return { size, gsm, sides };
}

type OrderCourierInfo = {
  orderId: string;
  orderNo: string;
  customerId: string;
  shipmentId: string | null;
  awbNumber: string | null;
  courierPlatform: string | null;
  courierOrderId: string | null;
  dispatchType: string | null;
  trackingNumber: string | null;
  shipmentNotes: string | null;
  shipmentCreatedAt: string | null;
  isCourierBooked: boolean;
};

type CodForm = {
  awbNumber: string;
  courierPlatform: string;
  courierOrderId: string;
};

type Tab = "pending" | "accounting" | "outstanding" | "dispatch" | "sample" | "receipts" | "receipt_history" | "vendors" | "commission";

type SampleOrder = {
  id: string;
  orderNumber: string;
  status: string;
  samplePaymentType: string | null;
  paymentStatus: string;
  grandTotal: number;
  createdAt: string;
  customer: { businessName: string; phone?: string; address?: string; city?: string; state?: string; pincode?: string };
  salesAgentName: string | null;
  itemCount: number;
  items: { productName: string; sku: string; quantity: number }[];
  totalPaid: number;
};

// ── Commission types ──────────────────────────────────────────────────────
type CommissionAgent = {
  id: string; name: string; category: string | null;
  saleTotal: number; bonus: number; monthsWithData: string[];
};
type CommissionSummary = {
  year: number; month: number;
  availableMonths: string[];
  agents: CommissionAgent[];
};
type CommissionRow = {
  date: string; invoiceNo: string; partyName: string;
  itemName: string; description: string; transactionType: string;
  quantity: number; amount: number;
  commissionPct: number; commissionAmt: number; hasCost: boolean;
};
type CommissionSheet = {
  userId: string; year: number; month: number;
  agentName: string | null; agentCategory: string | null;
  saleTotal: number; commissionTotal: number; commissionPct: number;
  bonus: number; totalPayable: number;
  rows: CommissionRow[];
};

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
  const [loadError, setLoadError] = useState<string | null>(null);

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

  // Sample Kit orders
  const [sampleOrders, setSampleOrders] = useState<SampleOrder[]>([]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleProcessing, setSampleProcessing] = useState<string | null>(null);
  const [samplePaymentChoice, setSamplePaymentChoice] = useState<Record<string, boolean>>({});
  const [sampleRejectId, setSampleRejectId] = useState<string | null>(null);
  const [sampleRejectReason, setSampleRejectReason] = useState("");

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

  // COD tracking
  const [orderCourierMap, setOrderCourierMap] = useState<Record<string, OrderCourierInfo>>({});
  const [courierMapLoading, setCourierMapLoading] = useState(false);
  const [expandedOutstandingId, setExpandedOutstandingId] = useState<string | null>(null);
  const [codModalOrderId, setCodModalOrderId] = useState<string | null>(null);
  const [codModalOrderNo, setCodModalOrderNo] = useState<string>("");
  const [codForm, setCodForm] = useState<CodForm>({ awbNumber: "", courierPlatform: "BIGSHIP", courierOrderId: "" });
  const [savingCod, setSavingCod] = useState(false);

  // Vendor statements
  const [vendorEntries, setVendorEntries] = useState<VendorEntry[]>([]);
  const [vendorLoading, setVendorLoading] = useState(false);
  const [vendorFilter, setVendorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
  const [vendorSearch, setVendorSearch] = useState("");

  // Billing and GST accounting
  const [accountingLoading, setAccountingLoading] = useState(false);
  const [accountingSummary, setAccountingSummary] = useState<AccountingSummary | null>(null);
  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>([]);
  const [purchaseBills, setPurchaseBills] = useState<PurchaseBill[]>([]);
  const [accountingNotes, setAccountingNotes] = useState<AccountingNote[]>([]);
  const [vendors, setVendors] = useState<VendorMaster[]>([]);
  const [purchaseForm, setPurchaseForm] = useState({
    vendorId: "", billNumber: "", billDate: "", dueDate: "", subtotal: "", gstRatePct: "18", gstTreatment: "INTRA_STATE", notes: "",
  });
  const [vendorPaymentForm, setVendorPaymentForm] = useState({
    vendorId: "", purchaseBillId: "", paymentAccountId: "", amount: "", method: "BANK_TRANSFER", referenceNumber: "",
  });
  const [noteForm, setNoteForm] = useState({
    noteType: "CREDIT_NOTE", partyType: "CUSTOMER", invoiceId: "", purchaseBillId: "", reason: "", taxableAmount: "", gstRatePct: "18", gstTreatment: "INTRA_STATE",
  });
  const [savingAccounting, setSavingAccounting] = useState<string | null>(null);

  const handleLoadError = useCallback((section: string, error: unknown) => {
    console.error(`Failed to load ${section}`, error);
    setLoadError(`${section} could not load. Please reload, or check the backend connection.`);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const headers = getAuthHeaders();
      const [res, accountsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/accounts/pending`, { headers }),
        fetch(`${API_BASE_URL}/accounts/payment-accounts`, { headers }),
      ]);
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (res.ok) setOrders(await res.json());
      if (accountsRes.ok) setPaymentAccounts(await accountsRes.json());
    } catch (error) {
      handleLoadError("Order approvals", error);
    } finally { setLoading(false); }
  }, [router, handleLoadError]);

  const loadDispatch = useCallback(async () => {
    setDispatchLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/pending-dispatch`, { headers: getAuthHeaders() });
      if (res.ok) setDispatchOrders(await res.json());
    } catch (error) {
      handleLoadError("Dispatch approvals", error);
    } finally { setDispatchLoading(false); }
  }, [handleLoadError]);

  const loadVendors = useCallback(async () => {
    setVendorLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/vendor-statements`, { headers: getAuthHeaders() });
      if (res.ok) setVendorEntries(await res.json());
    } catch (error) {
      handleLoadError("Vendor statements", error);
    } finally { setVendorLoading(false); }
  }, [handleLoadError]);

  const loadReceipts = useCallback(async () => {
    setReceiptsLoading(true);
    setLoadError(null);
    try {
      const headers = getAuthHeaders();
      const [paymentsRes, accountsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/accounts/pending-payments`, { headers }),
        fetch(`${API_BASE_URL}/accounts/payment-accounts`, { headers }),
      ]);
      if (paymentsRes.ok) setPendingPayments(await paymentsRes.json());
      if (accountsRes.ok) setPaymentAccounts(await accountsRes.json());
    } catch (error) {
      handleLoadError("Pending receipts", error);
    } finally { setReceiptsLoading(false); }
  }, [handleLoadError]);

  const loadOutstanding = useCallback(async () => {
    setOutstandingLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/customer-outstanding`, { headers: getAuthHeaders() });
      if (res.ok) setOutstanding(await res.json());
    } catch (error) {
      handleLoadError("Customer outstanding", error);
    } finally { setOutstandingLoading(false); }
  }, [handleLoadError]);

  const loadCourierStatus = useCallback(async () => {
    setCourierMapLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/outstanding-order-shipments`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data: OrderCourierInfo[] = await res.json();
        const map: Record<string, OrderCourierInfo> = {};
        for (const item of data) { map[item.orderId] = item; }
        setOrderCourierMap(map);
      }
    } catch (error) {
      handleLoadError("Courier status", error);
    } finally { setCourierMapLoading(false); }
  }, [handleLoadError]);

  const loadAccounting = useCallback(async () => {
    setAccountingLoading(true);
    setLoadError(null);
    try {
      const headers = getAuthHeaders();
      const [summaryRes, invoiceRes, billRes, noteRes, vendorRes, accountRes] = await Promise.all([
        fetch(`${API_BASE_URL}/accounts/summary`, { headers }),
        fetch(`${API_BASE_URL}/accounts/invoices`, { headers }),
        fetch(`${API_BASE_URL}/accounts/purchase-bills`, { headers }),
        fetch(`${API_BASE_URL}/accounts/notes`, { headers }),
        fetch(`${API_BASE_URL}/vendors`, { headers }),
        fetch(`${API_BASE_URL}/accounts/payment-accounts`, { headers }),
      ]);
      if (summaryRes.ok) setAccountingSummary(await summaryRes.json());
      if (invoiceRes.ok) setSalesInvoices(await invoiceRes.json());
      if (billRes.ok) setPurchaseBills(await billRes.json());
      if (noteRes.ok) setAccountingNotes(await noteRes.json());
      if (vendorRes.ok) setVendors(await vendorRes.json());
      if (accountRes.ok) setPaymentAccounts(await accountRes.json());
    } catch (error) {
      handleLoadError("Billing and GST", error);
    } finally { setAccountingLoading(false); }
  }, [handleLoadError]);

  const loadSampleOrders = useCallback(async () => {
    setSampleLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/sample-orders`, { headers: getAuthHeaders() });
      if (res.ok) setSampleOrders(await res.json());
    } catch (error) {
      handleLoadError("Sample kit orders", error);
    } finally { setSampleLoading(false); }
  }, [handleLoadError]);

  const approveSampleOrder = useCallback(async (orderId: string, paymentReceived: boolean) => {
    setSampleProcessing(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${orderId}/approve-sample`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ paymentReceived }),
      });
      if (res.ok) {
        setSampleOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "READY_FOR_DISPATCH", samplePaymentType: paymentReceived ? "PREPAID" : "COD" } : o));
      } else {
        const b = await res.json();
        alert(b.message || "Approval failed");
      }
    } finally { setSampleProcessing(null); }
  }, []);

  const rejectSampleOrder = useCallback(async (orderId: string, reason: string) => {
    setSampleProcessing(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${orderId}/reject-sample`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setSampleOrders(prev => prev.filter(o => o.id !== orderId));
        setSampleRejectId(null);
        setSampleRejectReason("");
      } else {
        const b = await res.json();
        alert(b.message || "Rejection failed");
      }
    } finally { setSampleProcessing(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "accounting") void loadAccounting(); }, [tab, loadAccounting]);
  useEffect(() => { if (tab === "dispatch") void loadDispatch(); }, [tab, loadDispatch]);
  useEffect(() => { if (tab === "sample") void loadSampleOrders(); }, [tab, loadSampleOrders]);
  useEffect(() => { if (tab === "receipts") void loadReceipts(); }, [tab, loadReceipts]);
  useEffect(() => { if (tab === "outstanding") { void loadOutstanding(); void loadCourierStatus(); } }, [tab, loadOutstanding, loadCourierStatus]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-history`, { headers: getAuthHeaders() });
      if (res.ok) setReceiptHistory(await res.json());
    } catch (error) {
      handleLoadError("Receipt history", error);
    } finally { setHistoryLoading(false); }
  }, [handleLoadError]);
  useEffect(() => { if (tab === "vendors") void loadVendors(); if (tab === "receipt_history") void loadHistory(); }, [tab, loadVendors, loadHistory]);

  // ── Commission state ────────────────────────────────────────────────────
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummary | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<CommissionAgent | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [commissionSheet, setCommissionSheet] = useState<CommissionSheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  const now = new Date();
  const [commYear, setCommYear] = useState(now.getFullYear());
  const [commMonth, setCommMonth] = useState(now.getMonth() + 1);

  const loadCommissionSummary = useCallback(async (year: number, month: number) => {
    setCommissionLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/commission-summary?year=${year}&month=${month}`, { headers: getAuthHeaders() });
      if (res.ok) setCommissionSummary(await res.json());
    } catch (error) {
      handleLoadError("Commission summary", error);
    } finally { setCommissionLoading(false); }
  }, [handleLoadError]);

  const loadCommissionSheet = useCallback(async (agentId: string, monthStr: string) => {
    const [y, m] = monthStr.split("-").map(Number);
    setSheetLoading(true);
    setCommissionSheet(null);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/sales-agents/${agentId}/commission?year=${y}&month=${m}`, { headers: getAuthHeaders() });
      if (res.ok) setCommissionSheet(await res.json());
    } catch (error) {
      handleLoadError("Commission sheet", error);
    } finally { setSheetLoading(false); }
  }, [handleLoadError]);

  useEffect(() => {
    if (tab === "commission") void loadCommissionSummary(commYear, commMonth);
  }, [tab, commYear, commMonth, loadCommissionSummary]);

  useEffect(() => {
    if (selectedAgent && selectedMonth) void loadCommissionSheet(selectedAgent.id, selectedMonth);
  }, [selectedAgent, selectedMonth, loadCommissionSheet]);

  async function approveOrder(id: string) {
    setProcessing(id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${id}/approve`, { method: "PATCH", headers: getAuthHeaders() });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Order approval failed: ${err.message || res.statusText}`);
        return;
      }
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
      const verifyRes = await fetch(`${API_BASE_URL}/accounts/payments/${bankMatchPayment.id}/verify`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ referenceNumber }),
      });
      if (!verifyRes.ok) {
        const err = await verifyRes.json().catch(() => ({}));
        alert(`Receipt verification failed: ${err.message || verifyRes.statusText}`);
        return;
      }
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
      const res = await fetch(`${API_BASE_URL}/accounts/payments/${id}/verify`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ referenceNumber: utr || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Receipt verification failed: ${err.message || res.statusText}`);
        return;
      }
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

  function openCodModal(orderId: string, orderNo: string) {
    const existing = orderCourierMap[orderId];
    setCodModalOrderId(orderId);
    setCodModalOrderNo(orderNo);
    setCodForm({
      awbNumber: existing?.awbNumber ?? "",
      courierPlatform: existing?.courierPlatform ?? "BIGSHIP",
      courierOrderId: existing?.courierOrderId ?? "",
    });
  }

  async function saveCodBooking() {
    if (!codModalOrderId) return;
    if (!codForm.courierPlatform) { alert("Select a courier platform"); return; }
    setSavingCod(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/orders/${codModalOrderId}/cod-booking`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          awbNumber: codForm.awbNumber || undefined,
          courierPlatform: codForm.courierPlatform,
          courierOrderId: codForm.courierOrderId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not save COD booking");
      }
      setCodModalOrderId(null);
      await loadCourierStatus();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save COD booking");
    } finally { setSavingCod(false); }
  }

  async function createPurchaseBill() {
    if (!purchaseForm.vendorId || !purchaseForm.billNumber || !purchaseForm.subtotal) {
      alert("Select vendor, bill number, and amount");
      return;
    }
    setSavingAccounting("purchase");
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/purchase-bills`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: purchaseForm.vendorId,
          billNumber: purchaseForm.billNumber,
          billDate: purchaseForm.billDate || undefined,
          dueDate: purchaseForm.dueDate || undefined,
          subtotal: Number(purchaseForm.subtotal),
          gstRatePct: Number(purchaseForm.gstRatePct || 0),
          gstTreatment: purchaseForm.gstTreatment,
          notes: purchaseForm.notes,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not add purchase bill");
      setPurchaseForm({ vendorId: "", billNumber: "", billDate: "", dueDate: "", subtotal: "", gstRatePct: "18", gstTreatment: "INTRA_STATE", notes: "" });
      await loadAccounting();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not add purchase bill");
    } finally { setSavingAccounting(null); }
  }

  async function createVendorPayment() {
    if (!vendorPaymentForm.vendorId || !vendorPaymentForm.paymentAccountId || !vendorPaymentForm.amount) {
      alert("Select vendor, payment account, and amount");
      return;
    }
    setSavingAccounting("vendor-payment");
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/vendor-payments`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorId: vendorPaymentForm.vendorId,
          purchaseBillId: vendorPaymentForm.purchaseBillId || undefined,
          paymentAccountId: vendorPaymentForm.paymentAccountId,
          amount: Number(vendorPaymentForm.amount),
          method: vendorPaymentForm.method,
          referenceNumber: vendorPaymentForm.referenceNumber,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not record payment");
      setVendorPaymentForm({ vendorId: "", purchaseBillId: "", paymentAccountId: "", amount: "", method: "BANK_TRANSFER", referenceNumber: "" });
      await loadAccounting();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not record payment");
    } finally { setSavingAccounting(null); }
  }

  async function createAccountingNote() {
    if (!noteForm.reason || !noteForm.taxableAmount) {
      alert("Enter note reason and amount");
      return;
    }
    const invoice = salesInvoices.find(inv => inv.id === noteForm.invoiceId);
    const bill = purchaseBills.find(row => row.id === noteForm.purchaseBillId);
    setSavingAccounting("note");
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/notes`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          noteType: noteForm.noteType,
          partyType: noteForm.partyType,
          invoiceId: noteForm.partyType === "CUSTOMER" ? noteForm.invoiceId || undefined : undefined,
          purchaseBillId: noteForm.partyType === "VENDOR" ? noteForm.purchaseBillId || undefined : undefined,
          customerId: noteForm.partyType === "CUSTOMER" ? invoice?.customerId : undefined,
          vendorId: noteForm.partyType === "VENDOR" ? bill?.vendorId : undefined,
          reason: noteForm.reason,
          taxableAmount: Number(noteForm.taxableAmount),
          gstRatePct: Number(noteForm.gstRatePct || 0),
          gstTreatment: noteForm.gstTreatment,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Could not issue note");
      setNoteForm({ noteType: "CREDIT_NOTE", partyType: "CUSTOMER", invoiceId: "", purchaseBillId: "", reason: "", taxableAmount: "", gstRatePct: "18", gstTreatment: "INTRA_STATE" });
      await loadAccounting();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not issue note");
    } finally { setSavingAccounting(null); }
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

  // Group SHEET_STAGE entries by sheetNo (treat sheetNo as job number)
  type SheetGroup = {
    sheetNo: string;
    vendorName: string;
    sheetGsm?: number;
    sheetSize?: string;
    totalCost: number;
    allPaid: boolean;
    entries: VendorEntry[];
    firstDate: string;
    products: { productName: string; orderNo: string; customerName: string; quantity: number }[];
  };
  const groupedSheetEntries = useMemo<SheetGroup[]>(() => {
    const sheetEntries = filteredEntries.filter(e => e.type === "SHEET_STAGE");
    const groups = new Map<string, SheetGroup>();
    for (const e of sheetEntries) {
      const key = e.sheetNo || e.id;
      if (!groups.has(key)) {
        groups.set(key, {
          sheetNo: e.sheetNo || key,
          vendorName: e.vendorName,
          sheetGsm: e.sheetGsm,
          sheetSize: e.sheetSize,
          totalCost: 0,
          allPaid: true,
          entries: [],
          firstDate: e.createdAt,
          products: [],
        });
      }
      const g = groups.get(key)!;
      g.totalCost += e.cost;
      g.entries.push(e);
      if (!e.isPaid) g.allPaid = false;
      if (new Date(e.createdAt) < new Date(g.firstDate)) g.firstDate = e.createdAt;
      for (const p of (e.products ?? [])) {
        if (!g.products.find(x => x.orderNo === p.orderNo && x.productName === p.productName))
          g.products.push(p);
      }
    }
    return Array.from(groups.values()).sort((a, b) => new Date(b.firstDate).getTime() - new Date(a.firstDate).getTime());
  }, [filteredEntries]);

  const jobworkEntries = useMemo(() => filteredEntries.filter(e => e.type === "JOBWORK"), [filteredEntries]);

  const [markingGroupPaid, setMarkingGroupPaid] = useState<string | null>(null);

  async function markSheetGroupPaid(group: SheetGroup) {
    const unpaid = group.entries.filter(e => !e.isPaid);
    if (unpaid.length === 0) return;
    if (!confirm(`Mark Sheet ${group.sheetNo} (${fmt(group.entries.filter(e => !e.isPaid).reduce((s,e) => s+e.cost, 0))}) as PAID?`)) return;
    setMarkingGroupPaid(group.sheetNo);
    try {
      for (const entry of unpaid) {
        const endpoint = `${API_BASE_URL}/accounts/vendor-statements/sheet-stage/${entry.id}/paid`;
        await fetch(endpoint, { method: "PATCH", headers: getAuthHeaders() });
      }
      await loadVendors();
    } finally { setMarkingGroupPaid(null); }
  }
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

          {loadError && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
              <span>{loadError}</span>
            </div>
          )}

          {/* Tabs */}
          <div className="border-b border-slate-200">
            <div className="flex flex-wrap gap-0">
              {([
                { key: "pending", label: "Order Approval", count: orders.length },
                { key: "sample", label: "Sample Kit", count: sampleOrders.filter(o => o.status === "PENDING_APPROVAL").length },
                { key: "accounting", label: "Billing & GST", count: salesInvoices.length + purchaseBills.length },
                { key: "outstanding", label: "Customer Outstanding", count: outstanding.length },
                { key: "dispatch", label: "Dispatch Approval", count: dispatchOrders.length },
                { key: "receipts", label: "Receipts Pending", count: pendingPayments.length },
                { key: "receipt_history", label: "Receipt History", count: receiptHistory.length },
                { key: "vendors", label: "Vendor Statements", count: vendorEntries.filter(e => !e.isPaid).length },
                { key: "commission", label: "Commission", count: 0 },
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
                        <th className="pb-1 text-right">Cost</th>
                        <th className="pb-1 text-right">Margin</th>
                        <th className="pb-1 text-right">Amount</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {order.items.map((item, i) => {
                          const n = parseNotes(item.productionNotes);
                          const size = item.sizeInches || n.size || "—";
                          const gsm = item.gsm ?? n.gsm ?? "—";
                          const sides = item.sides || n.sides || "—";
                          return (
                            <tr key={i}>
                              <td className="py-1.5 font-medium text-slate-800">
                                {item.productName}
                                {item.productDescription && (
                                  <div className="max-w-xs truncate text-[11px] font-normal text-slate-500">
                                    {item.productDescription}
                                  </div>
                                )}
                                <div className="text-[11px] font-mono text-blue-600">{item.sku}</div>
                              </td>
                              <td className="py-1.5 text-slate-500 text-xs">{size}</td>
                              <td className="py-1.5 text-slate-500 text-xs">{gsm}</td>
                              <td className="py-1.5 text-slate-500 text-xs">{String(sides).replace(/_/g, " ")}</td>
                              <td className="py-1.5 text-right">{item.quantity}</td>
                              <td className="py-1.5 text-right text-xs">{fmt(item.unitPrice)}</td>
                              <td className="py-1.5 text-right text-xs">
                                {item.costTotal == null ? (
                                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600">No cost</span>
                                ) : (
                                  <>
                                    {fmt(item.costTotal)}
                                    {item.costPerUnit != null && (
                                      <div className="text-[10px] text-slate-400">{fmt(item.costPerUnit)}/pc</div>
                                    )}
                                  </>
                                )}
                              </td>
                              <td className={`py-1.5 text-right text-xs font-semibold ${marginClass(item.marginPct)}`}>
                                {item.marginPct == null ? "—" : `${item.marginPct.toFixed(1)}%`}
                              </td>
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

                    {(() => {
                      const hasMissingCost = order.items.some(item => item.costTotal == null);
                      return (
                        <>
                          {hasMissingCost && (
                            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Cost data missing for some products.{" "}
                                <a href="/cost-table" className="underline font-semibold hover:text-red-900">
                                  Add cost slabs in Cost Table → Orders Without Cost
                                </a>{" "}
                                before approving.
                              </span>
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
                              <button
                                onClick={() => !hasMissingCost && approveOrder(order.id)}
                                disabled={processing === order.id || hasMissingCost}
                                title={hasMissingCost ? "Add cost slabs for all products before approving" : undefined}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg ${
                                  hasMissingCost
                                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                    : "bg-green-600 text-white hover:bg-green-700"
                                } disabled:opacity-60`}
                              >
                                {processing === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Approve
                              </button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "accounting" && (
            <div className="space-y-4">
              {accountingLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : (
                <>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-xs font-semibold text-blue-700">Sales Invoices</p>
                      <p className="mt-1 text-xl font-bold text-blue-900">{fmt(accountingSummary?.sales.total ?? 0)}</p>
                      <p className="text-[11px] text-blue-600">{accountingSummary?.sales.invoiceCount ?? 0} invoices</p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <p className="text-xs font-semibold text-red-700">Receivable</p>
                      <p className="mt-1 text-xl font-bold text-red-800">{fmt(accountingSummary?.sales.receivable ?? 0)}</p>
                      <p className="text-[11px] text-red-600">customer balance</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                      <p className="text-xs font-semibold text-amber-700">Payable</p>
                      <p className="mt-1 text-xl font-bold text-amber-900">{fmt(accountingSummary?.purchases.payable ?? 0)}</p>
                      <p className="text-[11px] text-amber-700">{accountingSummary?.purchases.billCount ?? 0} purchase bills</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-xs font-semibold text-emerald-700">Net GST Estimate</p>
                      <p className="mt-1 text-xl font-bold text-emerald-900">{fmt(accountingSummary?.gst.netPayableEstimate ?? 0)}</p>
                      <p className="text-[11px] text-emerald-700">output minus input</p>
                    </div>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h2 className="text-sm font-bold text-slate-800">Add Purchase Bill</h2>
                      <div className="mt-3 space-y-2">
                        <select value={purchaseForm.vendorId} onChange={e => setPurchaseForm(f => ({ ...f, vendorId: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                          <option value="">Vendor</option>
                          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <input value={purchaseForm.billNumber} onChange={e => setPurchaseForm(f => ({ ...f, billNumber: e.target.value }))} placeholder="Bill no" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <input type="number" value={purchaseForm.subtotal} onChange={e => setPurchaseForm(f => ({ ...f, subtotal: e.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <input type="date" value={purchaseForm.billDate} onChange={e => setPurchaseForm(f => ({ ...f, billDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <input type="date" value={purchaseForm.dueDate} onChange={e => setPurchaseForm(f => ({ ...f, dueDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <input type="number" value={purchaseForm.gstRatePct} onChange={e => setPurchaseForm(f => ({ ...f, gstRatePct: e.target.value }))} placeholder="GST %" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <select value={purchaseForm.gstTreatment} onChange={e => setPurchaseForm(f => ({ ...f, gstTreatment: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                            <option value="INTRA_STATE">CGST + SGST</option>
                            <option value="INTER_STATE">IGST</option>
                          </select>
                        </div>
                        <button onClick={createPurchaseBill} disabled={savingAccounting === "purchase"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                          {savingAccounting === "purchase" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Add Bill
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h2 className="text-sm font-bold text-slate-800">Vendor Payment Out</h2>
                      <div className="mt-3 space-y-2">
                        <select value={vendorPaymentForm.vendorId} onChange={e => setVendorPaymentForm(f => ({ ...f, vendorId: e.target.value, purchaseBillId: "" }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                          <option value="">Vendor</option>
                          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                        <select value={vendorPaymentForm.purchaseBillId} onChange={e => setVendorPaymentForm(f => ({ ...f, purchaseBillId: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                          <option value="">Against bill optional</option>
                          {purchaseBills.filter(b => !vendorPaymentForm.vendorId || b.vendorId === vendorPaymentForm.vendorId).map(b => <option key={b.id} value={b.id}>{b.billNumber} · {fmt(b.balanceAmount)}</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <select value={vendorPaymentForm.paymentAccountId} onChange={e => setVendorPaymentForm(f => ({ ...f, paymentAccountId: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                            <option value="">Account</option>
                            {paymentAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                          <input type="number" value={vendorPaymentForm.amount} onChange={e => setVendorPaymentForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <select value={vendorPaymentForm.method} onChange={e => setVendorPaymentForm(f => ({ ...f, method: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                            {paymentMethods.map(m => <option key={m} value={m}>{m.replace("_", " ")}</option>)}
                          </select>
                          <input value={vendorPaymentForm.referenceNumber} onChange={e => setVendorPaymentForm(f => ({ ...f, referenceNumber: e.target.value }))} placeholder="Ref no" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                        </div>
                        <button onClick={createVendorPayment} disabled={savingAccounting === "vendor-payment"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                          {savingAccounting === "vendor-payment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Record Payment
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h2 className="text-sm font-bold text-slate-800">Credit / Debit Note</h2>
                      <div className="mt-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <select value={noteForm.noteType} onChange={e => setNoteForm(f => ({ ...f, noteType: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                            <option value="CREDIT_NOTE">Credit Note</option>
                            <option value="DEBIT_NOTE">Debit Note</option>
                          </select>
                          <select value={noteForm.partyType} onChange={e => setNoteForm(f => ({ ...f, partyType: e.target.value, invoiceId: "", purchaseBillId: "" }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                            <option value="CUSTOMER">Customer</option>
                            <option value="VENDOR">Vendor</option>
                          </select>
                        </div>
                        {noteForm.partyType === "CUSTOMER" ? (
                          <select value={noteForm.invoiceId} onChange={e => setNoteForm(f => ({ ...f, invoiceId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                            <option value="">Invoice reference</option>
                            {salesInvoices.map(inv => <option key={inv.id} value={inv.id}>{inv.invoiceNumber} · {inv.customerName}</option>)}
                          </select>
                        ) : (
                          <select value={noteForm.purchaseBillId} onChange={e => setNoteForm(f => ({ ...f, purchaseBillId: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white">
                            <option value="">Purchase bill reference</option>
                            {purchaseBills.map(b => <option key={b.id} value={b.id}>{b.billNumber} · {b.vendorName}</option>)}
                          </select>
                        )}
                        <input value={noteForm.reason} onChange={e => setNoteForm(f => ({ ...f, reason: e.target.value }))} placeholder="Reason" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                        <div className="grid grid-cols-2 gap-2">
                          <input type="number" value={noteForm.taxableAmount} onChange={e => setNoteForm(f => ({ ...f, taxableAmount: e.target.value }))} placeholder="Taxable amount" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <input type="number" value={noteForm.gstRatePct} onChange={e => setNoteForm(f => ({ ...f, gstRatePct: e.target.value }))} placeholder="GST %" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                        </div>
                        <button onClick={createAccountingNote} disabled={savingAccounting === "note"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                          {savingAccounting === "note" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Issue Note
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">Sales Invoices</div>
                      <div className="max-h-80 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">Invoice</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2 text-center">WA</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {salesInvoices.map(inv => <tr key={inv.id}><td className="px-3 py-2 font-semibold text-blue-700">{inv.invoiceNumber}</td><td className="px-3 py-2">{inv.customerName}</td><td className="px-3 py-2 text-right">{fmt(inv.taxAmount)}</td><td className="px-3 py-2 text-right font-semibold">{fmt(inv.totalAmount)}</td><td className="px-3 py-2 text-right text-red-600">{fmt(inv.balanceAmount)}</td><td className="px-3 py-2 text-center">{inv.whatsappStatus}</td></tr>)}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">Purchase Bills</div>
                      <div className="max-h-80 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">Bill</th><th className="px-3 py-2 text-left">Vendor</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Payable</th><th className="px-3 py-2 text-center">Status</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {purchaseBills.map(b => <tr key={b.id}><td className="px-3 py-2 font-semibold text-slate-800">{b.billNumber}</td><td className="px-3 py-2">{b.vendorName}</td><td className="px-3 py-2 text-right">{fmt(b.taxAmount)}</td><td className="px-3 py-2 text-right font-semibold">{fmt(b.totalAmount)}</td><td className="px-3 py-2 text-right text-amber-700">{fmt(b.balanceAmount)}</td><td className="px-3 py-2 text-center">{b.status.replace("_", " ")}</td></tr>)}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">Credit / Debit Notes</div>
                      <div className="max-h-72 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">Note</th><th className="px-3 py-2 text-left">Party</th><th className="px-3 py-2 text-left">Reason</th><th className="px-3 py-2 text-right">Amount</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {accountingNotes.map(n => <tr key={n.id}><td className="px-3 py-2 font-semibold">{n.noteNumber}<div className="text-[10px] text-slate-400">{n.noteType.replace("_", " ")}</div></td><td className="px-3 py-2">{n.partyName}</td><td className="px-3 py-2">{n.reason}</td><td className="px-3 py-2 text-right font-semibold">{fmt(n.totalAmount)}</td></tr>)}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                      <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-800">Recent Ledger</div>
                      <div className="max-h-72 overflow-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Account</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {(accountingSummary?.recentLedger ?? []).map(row => <tr key={row.id}><td className="px-3 py-2 text-slate-500">{new Date(row.entryDate).toLocaleDateString("en-IN")}</td><td className="px-3 py-2">{row.accountName}<div className="text-[10px] text-slate-400">{row.narration}</div></td><td className="px-3 py-2 text-right">{row.debitAmount ? fmt(row.debitAmount) : "—"}</td><td className="px-3 py-2 text-right">{row.creditAmount ? fmt(row.creditAmount) : "—"}</td></tr>)}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              )}
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
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-6"></th>
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
                      {filteredOutstanding.map(row => {
                        // Get all courier info for this customer's orders
                        const customerOrderNos = row.orderNumbers.split(", ").filter(Boolean);
                        const customerCourierEntries = Object.values(orderCourierMap).filter(c => c.customerId === row.customerId);
                        const isExpanded = expandedOutstandingId === row.customerId;
                        const bookedCount = customerCourierEntries.filter(c => c.isCourierBooked).length;

                        return (
                          <React.Fragment key={row.customerId}>
                            <tr className="hover:bg-slate-50">
                              <td className="px-2 py-2">
                                <button
                                  onClick={() => setExpandedOutstandingId(isExpanded ? null : row.customerId)}
                                  className="p-0.5 rounded hover:bg-slate-200 text-slate-400"
                                  title="View courier / COD details"
                                >
                                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                              <td className="px-3 py-2">
                                <div className="font-bold text-slate-900">{row.customerName}</div>
                                <div className="text-slate-400">{row.customerPhone || row.customerEmail || "No contact"}</div>
                                {bookedCount > 0 && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <PackageCheck className="h-3 w-3 text-orange-500" />
                                    <span className="text-[10px] text-orange-600 font-semibold">{bookedCount} COD booked</span>
                                  </div>
                                )}
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

                            {/* ── COD / Courier Expanded Row ── */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={11} className="px-0 py-0 bg-orange-50 border-b border-orange-100">
                                  <div className="px-4 py-3">
                                    <div className="text-[11px] font-semibold text-orange-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                                      <Truck className="h-3.5 w-3.5" />
                                      Courier / COD Status per Order
                                      {courierMapLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
                                    </div>
                                    <div className="space-y-1.5">
                                      {customerOrderNos.length === 0 ? (
                                        <p className="text-[11px] text-slate-400">No orders found</p>
                                      ) : customerOrderNos.map(orderNo => {
                                        // Find by orderNo in the map
                                        const info = customerCourierEntries.find(c => c.orderNo === orderNo);
                                        return (
                                          <div key={orderNo} className="flex items-center gap-3 rounded-lg bg-white border border-orange-100 px-3 py-2">
                                            <span className="font-mono font-bold text-blue-700 text-xs w-20 shrink-0">{orderNo}</span>

                                            {!info ? (
                                              <span className="text-[11px] text-slate-400 italic">Loading...</span>
                                            ) : info.isCourierBooked ? (
                                              <>
                                                <PackageCheck className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                                <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[11px] font-bold">COD</span>
                                                {info.courierPlatform && (
                                                  <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[11px] font-semibold">{info.courierPlatform}</span>
                                                )}
                                                {info.awbNumber && (
                                                  <span className="text-[11px] text-slate-600">AWB: <span className="font-mono font-bold text-slate-800">{info.awbNumber}</span></span>
                                                )}
                                                {info.courierOrderId && (
                                                  <span className="text-[11px] text-slate-600">Order ID: <span className="font-mono font-bold text-slate-800">{info.courierOrderId}</span></span>
                                                )}
                                                {info.trackingNumber && !info.awbNumber && (
                                                  <span className="text-[11px] text-slate-600">Tracking: <span className="font-mono font-bold text-slate-800">{info.trackingNumber}</span></span>
                                                )}
                                                <button
                                                  onClick={() => info && openCodModal(info.orderId, orderNo)}
                                                  className="ml-auto text-[10px] text-slate-400 hover:text-blue-600 underline"
                                                >
                                                  Edit
                                                </button>
                                              </>
                                            ) : (
                                              <>
                                                <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                                <span className="text-[11px] text-slate-500">No courier booked</span>
                                                <button
                                                  onClick={() => info && openCodModal(info.orderId, orderNo)}
                                                  className="ml-auto inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600"
                                                >
                                                  <Truck className="h-3 w-3" />
                                                  Mark as COD
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                      <tr>
                        <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-slate-600">Total Outstanding ({filteredOutstanding.length} customers)</td>
                        <td className="px-3 py-2 text-right text-sm font-bold text-red-600">{fmt(outstandingTotal)}</td>
                        <td colSpan={6} />
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

          {/* ── SAMPLE KIT TAB ── */}
          {tab === "sample" && (
            <div className="space-y-4">
              {/* Reject modal */}
              {sampleRejectId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
                    <h3 className="text-lg font-bold text-slate-800 mb-3">Reject Sample Order</h3>
                    <textarea
                      className="w-full border border-slate-300 rounded-lg p-3 text-sm resize-none"
                      rows={3} placeholder="Reason for rejection..."
                      value={sampleRejectReason}
                      onChange={e => setSampleRejectReason(e.target.value)}
                    />
                    <div className="flex gap-3 mt-4 justify-end">
                      <button onClick={() => { setSampleRejectId(null); setSampleRejectReason(""); }}
                        className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
                      <button
                        onClick={() => rejectSampleOrder(sampleRejectId, sampleRejectReason)}
                        disabled={sampleProcessing === sampleRejectId}
                        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
                        {sampleProcessing === sampleRejectId ? "Rejecting..." : "Reject"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {sampleLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-amber-500" /></div>
              ) : sampleOrders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm font-medium">No sample kit orders</p>
                </div>
              ) : (
                <>
                  {sampleOrders.filter(o => o.status === "PENDING_APPROVAL").length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                        Pending Accounts Approval
                      </h3>
                      <div className="space-y-3">
                        {sampleOrders.filter(o => o.status === "PENDING_APPROVAL").map(o => (
                          <div key={o.id} className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">📦 SAMPLE KIT</span>
                                  <span className="font-bold text-slate-800">{o.orderNumber}</span>
                                </div>
                                <p className="text-sm font-semibold text-slate-700">{o.customer.businessName}</p>
                                <p className="text-xs text-slate-500">{o.customer.phone} · {o.salesAgentName ?? "—"}</p>
                                <p className="text-xs text-slate-500 mt-1">{[o.customer.address, o.customer.city, o.customer.state, o.customer.pincode].filter(Boolean).join(", ")}</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {o.items.map((item, idx) => (
                                    <span key={idx} className="text-xs bg-white border border-amber-200 text-slate-600 px-2 py-0.5 rounded-full">
                                      {item.productName} × {item.quantity}
                                    </span>
                                  ))}
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-slate-800">₹{o.grandTotal.toLocaleString("en-IN")}</p>
                                <p className="text-xs text-slate-500">{o.totalPaid > 0 ? `₹${o.totalPaid.toLocaleString("en-IN")} paid` : "No payment received"}</p>
                              </div>
                            </div>
                            <div className="mt-4 p-3 bg-white rounded-lg border border-amber-200">
                              <p className="text-xs font-semibold text-slate-600 mb-2 uppercase tracking-wide">Dispatch as</p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setSamplePaymentChoice(prev => ({ ...prev, [o.id]: true }))}
                                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border-2 transition-colors ${samplePaymentChoice[o.id] === true || (samplePaymentChoice[o.id] === undefined && o.totalPaid > 0) ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-500"}`}>
                                  ✅ Payment Received → PREPAID
                                </button>
                                <button
                                  onClick={() => setSamplePaymentChoice(prev => ({ ...prev, [o.id]: false }))}
                                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border-2 transition-colors ${samplePaymentChoice[o.id] === false || (samplePaymentChoice[o.id] === undefined && o.totalPaid === 0) ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500"}`}>
                                  💵 No Payment → COD
                                </button>
                              </div>
                            </div>
                            <div className="flex gap-3 mt-3">
                              <button
                                onClick={() => approveSampleOrder(o.id, samplePaymentChoice[o.id] ?? o.totalPaid > 0)}
                                disabled={sampleProcessing === o.id}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                                {sampleProcessing === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                                Approve & Send to Dispatch
                              </button>
                              <button
                                onClick={() => setSampleRejectId(o.id)}
                                disabled={sampleProcessing === o.id}
                                className="px-4 py-2.5 rounded-lg border border-red-300 text-red-600 text-sm font-semibold hover:bg-red-50 disabled:opacity-50">
                                Reject
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {sampleOrders.filter(o => o.status !== "PENDING_APPROVAL").length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
                        Approved / Dispatched
                      </h3>
                      <div className="space-y-2">
                        {sampleOrders.filter(o => o.status !== "PENDING_APPROVAL").map(o => (
                          <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${o.samplePaymentType === "PREPAID" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                {o.samplePaymentType === "PREPAID" ? "✅ PREPAID" : "💵 COD"}
                              </span>
                              <div>
                                <p className="font-semibold text-slate-800 text-sm">{o.orderNumber} · {o.customer.businessName}</p>
                                <p className="text-xs text-slate-500">{o.items.map(i => `${i.productName} ×${i.quantity}`).join(", ")}</p>
                              </div>
                            </div>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${o.status === "DISPATCHED" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                              {o.status === "DISPATCHED" ? "Dispatched" : "Ready for Dispatch"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
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
                      {/* Grouped Sheet entries — one row per sheet number */}
                      {groupedSheetEntries.map(group => (
                        <tr key={group.sheetNo} className={`hover:bg-slate-50 ${group.allPaid ? "opacity-60" : ""}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                            {new Date(group.firstDate).toLocaleDateString("en-IN")}
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-cyan-100 text-cyan-700">Sheet</span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{group.vendorName}</td>
                          <td className="px-3 py-2 max-w-xs">
                            <div>
                              <span className="font-semibold text-blue-700">Job #{group.sheetNo}</span>
                              <span className="text-slate-400 ml-1 text-xs">{group.sheetGsm} GSM · {group.sheetSize}&quot;</span>
                              <span className="ml-2 text-xs text-slate-400">({group.entries.length} stages)</span>
                              {group.products.map((p, i) => (
                                <div key={i} className="text-slate-400 text-xs">
                                  {p.productName} · {p.orderNo} · {p.customerName}
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-400 text-xs">—</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">{fmt(group.totalCost)}</td>
                          <td className="px-3 py-2 text-center">
                            {group.allPaid ? (
                              <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-xs font-semibold">✅ Paid</span>
                            ) : (
                              <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-xs font-semibold">⏳ Unpaid</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {!group.allPaid && (
                              <button onClick={() => markSheetGroupPaid(group)} disabled={markingGroupPaid === group.sheetNo}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-60 font-semibold">
                                {markingGroupPaid === group.sheetNo ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                Mark Paid
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {/* Individual Job Work entries */}
                      {jobworkEntries.map(entry => (
                        <tr key={entry.id} className={`hover:bg-slate-50 ${entry.isPaid ? "opacity-60" : ""}`}>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                            {new Date(entry.createdAt).toLocaleDateString("en-IN")}
                          </td>
                          <td className="px-3 py-2">
                            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700">Job Work</span>
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{entry.vendorName}</td>
                          <td className="px-3 py-2 max-w-xs">
                            <div>
                              <span className="font-medium text-slate-700">{entry.productName}</span>
                              <span className="text-slate-400 ml-1">({entry.productSku})</span>
                              <div className="text-slate-400 text-xs">Order: {entry.orderNo} · {entry.customerName}</div>
                              {entry.description && <div className="text-slate-400 italic text-xs">{entry.description}</div>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-slate-500 font-mono text-xs">
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
                        <td colSpan={5} className="px-3 py-2 text-xs font-semibold text-slate-600">
                          Total ({groupedSheetEntries.length} sheets{jobworkEntries.length > 0 ? ` · ${jobworkEntries.length} job work` : ""})
                        </td>
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

          {/* ── Commission Tab ──────────────────────────────────────────────── */}
          {tab === "commission" && (
            <div className="space-y-4">
              {/* Month picker */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-4 items-center">
                <span className="text-sm font-semibold text-slate-700">Commission Period:</span>
                <select value={commMonth} onChange={e => { setCommMonth(Number(e.target.value)); setSelectedAgent(null); setSelectedMonth(""); setCommissionSheet(null); }}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none bg-white">
                  {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                    <option key={i+1} value={i+1}>{m}</option>
                  ))}
                </select>
                <select value={commYear} onChange={e => { setCommYear(Number(e.target.value)); setSelectedAgent(null); setSelectedMonth(""); setCommissionSheet(null); }}
                  className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg outline-none bg-white">
                  {[now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                {selectedAgent && (
                  <button onClick={() => { setSelectedAgent(null); setSelectedMonth(""); setCommissionSheet(null); }}
                    className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5">
                    <X className="h-3 w-3" /> Back to Agents
                  </button>
                )}
              </div>

              {/* Agent list view */}
              {!selectedAgent && (
                commissionLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
                ) : !commissionSummary || commissionSummary.agents.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No sales agents with orders found</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {commissionSummary.agents.map(agent => (
                      <div key={agent.id} className="rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
                        onClick={() => { setSelectedAgent(agent); setSelectedMonth(`${commYear}-${String(commMonth).padStart(2,"0")}`); }}>
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <p className="font-bold text-slate-800">{agent.name}</p>
                            <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                              agent.category === "A" ? "bg-purple-100 text-purple-700" :
                              agent.category === "B" ? "bg-blue-100 text-blue-700" :
                              agent.category === "C" ? "bg-green-100 text-green-700" :
                              agent.category === "D" ? "bg-orange-100 text-orange-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>
                              Category {agent.category ?? "—"}
                            </span>
                          </div>
                          <ChevronDown className="h-4 w-4 text-slate-400 mt-1" />
                        </div>
                        <div className="text-xs text-slate-500 mb-1">
                          {agent.monthsWithData.length} month{agent.monthsWithData.length !== 1 ? "s" : ""} with data
                        </div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {agent.monthsWithData.slice(0, 6).map(m => (
                            <button key={m} onClick={e => { e.stopPropagation(); setSelectedAgent(agent); setSelectedMonth(m); }}
                              className={`text-xs px-2 py-0.5 rounded-full border font-mono transition-colors ${
                                m === `${commYear}-${String(commMonth).padStart(2,"0")}`
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600"
                              }`}>
                              {m}
                            </button>
                          ))}
                          {agent.monthsWithData.length > 6 && (
                            <span className="text-xs text-slate-400 px-1 py-0.5">+{agent.monthsWithData.length - 6} more</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Commission sheet view */}
              {selectedAgent && (
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                  {/* Sheet header */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200 px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Sales Agent</p>
                        <p className="text-xl font-bold text-slate-800">{selectedAgent.name}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                            selectedAgent.category === "A" ? "bg-purple-100 text-purple-700" :
                            selectedAgent.category === "B" ? "bg-blue-100 text-blue-700" :
                            selectedAgent.category === "C" ? "bg-green-100 text-green-700" :
                            "bg-orange-100 text-orange-700"
                          }`}>
                            Category {selectedAgent.category ?? "—"}
                          </span>
                          <span className="text-xs text-slate-500">Commission: {
                            selectedAgent.category === "A" ? "10% (15% stickers)" :
                            selectedAgent.category === "B" ? "10%" :
                            selectedAgent.category === "C" ? "12% (17% stickers)" :
                            "Above-rate margin"
                          }</span>
                        </div>
                      </div>
                      {/* Month selector within sheet */}
                      <div className="flex flex-wrap gap-1">
                        {selectedAgent.monthsWithData.map(m => (
                          <button key={m} onClick={() => setSelectedMonth(m)}
                            className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors ${
                              m === selectedMonth
                                ? "bg-green-600 text-white border-green-600"
                                : "border-slate-200 text-slate-600 hover:border-green-400 hover:text-green-700"
                            }`}>
                            {m}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {sheetLoading ? (
                    <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
                  ) : !commissionSheet || commissionSheet.rows.length === 0 ? (
                    <div className="p-10 text-center text-slate-400">
                      <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">No sales data for {selectedMonth}</p>
                    </div>
                  ) : (
                    <>
                      {/* Summary cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 border-b border-slate-200">
                        <div className="p-4 border-r border-slate-100 text-center">
                          <p className="text-xs text-slate-500 mb-1">Total Sales</p>
                          <p className="text-base font-bold text-slate-800">₹{commissionSheet.saleTotal.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="p-4 border-r border-slate-100 text-center">
                          <p className="text-xs text-slate-500 mb-1">Commission ({commissionSheet.commissionPct}%)</p>
                          <p className="text-base font-bold text-blue-700">₹{commissionSheet.commissionTotal.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="p-4 border-r border-slate-100 text-center">
                          <p className="text-xs text-slate-500 mb-1">Bonus</p>
                          <p className={`text-base font-bold ${commissionSheet.bonus > 0 ? "text-green-700" : "text-slate-400"}`}>
                            ₹{commissionSheet.bonus.toLocaleString("en-IN")}
                          </p>
                          <p className="text-xs text-slate-400">
                            {commissionSheet.saleTotal < 115000 ? `Need ₹${(115000 - commissionSheet.saleTotal).toLocaleString("en-IN")} more` :
                             commissionSheet.saleTotal < 200000 ? "₹1k (min met)" :
                             commissionSheet.saleTotal < 300000 ? "₹2k (₹2L met)" : "₹3k+ tier"}
                          </p>
                        </div>
                        <div className="p-4 text-center bg-green-50">
                          <p className="text-xs text-green-700 mb-1 font-semibold">TOTAL PAYABLE</p>
                          <p className="text-xl font-bold text-green-700">₹{commissionSheet.totalPayable.toLocaleString("en-IN")}</p>
                        </div>
                      </div>

                      {/* Bonus tiers info */}
                      <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex flex-wrap gap-3 text-xs text-amber-700">
                        <span className="font-semibold">Bonus tiers:</span>
                        <span className={commissionSheet.saleTotal >= 115000 ? "font-bold text-green-700" : ""}>₹1L 15K → ₹1,000</span>
                        <span className={commissionSheet.saleTotal >= 200000 ? "font-bold text-green-700" : ""}>₹2L → ₹2,000</span>
                        <span className={commissionSheet.saleTotal >= 300000 ? "font-bold text-green-700" : ""}>₹3L → ₹3,000</span>
                        <span className="text-amber-500">(+₹1,000 per ₹1L above ₹1L)</span>
                      </div>

                      {/* Commission table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-700 text-white">
                            <tr>
                              <th className="px-3 py-2.5 text-left font-semibold">Date</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Invoice No.</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Party Name</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Item Name</th>
                              <th className="px-3 py-2.5 text-left font-semibold">Description</th>
                              <th className="px-3 py-2.5 text-center font-semibold">Txn Type</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Rate %</th>
                              <th className="px-3 py-2.5 text-right font-semibold">Commission</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {commissionSheet.rows.map((row, i) => (
                              <tr key={i} className={`hover:bg-slate-50 ${!row.hasCost ? "opacity-60" : ""}`}>
                                <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                                  {new Date(row.date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" })}
                                </td>
                                <td className="px-3 py-2 font-mono text-blue-700">{row.invoiceNo}</td>
                                <td className="px-3 py-2 text-slate-700 max-w-[160px] truncate" title={row.partyName}>{row.partyName}</td>
                                <td className="px-3 py-2 text-slate-700 max-w-[180px] truncate" title={row.itemName}>{row.itemName}</td>
                                <td className="px-3 py-2 text-slate-500 max-w-[120px] truncate" title={row.description}>{row.description || "—"}</td>
                                <td className="px-3 py-2 text-center">
                                  <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">{row.transactionType}</span>
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-slate-700">{row.quantity.toLocaleString("en-IN")}</td>
                                <td className="px-3 py-2 text-right font-mono font-semibold text-slate-800">₹{row.amount.toLocaleString("en-IN")}</td>
                                <td className="px-3 py-2 text-right">
                                  {row.hasCost ? (
                                    <span className="font-bold text-green-700">{row.commissionPct}%</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">
                                  {row.hasCost ? `₹${row.commissionAmt.toLocaleString("en-IN")}` : <span className="text-slate-300 font-normal">No cost</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100 border-t-2 border-slate-300">
                            <tr>
                                     <td colSpan={7} className="px-3 py-3 text-xs font-bold text-slate-700">TOTAL</td>
                              <td className="px-3 py-3 text-right font-bold text-slate-800 font-mono">₹{commissionSheet.saleTotal.toLocaleString("en-IN")}</td>
                              <td className="px-3 py-3 text-right font-bold text-slate-600">{commissionSheet.commissionPct}%</td>
                              <td className="px-3 py-3 text-right font-bold text-blue-700 font-mono">₹{commissionSheet.commissionTotal.toLocaleString("en-IN")}</td>
                            </tr>
                            <tr className="bg-green-50 border-t border-green-200">
                              <td colSpan={8} className="px-3 py-3 text-xs font-bold text-slate-700">BONUS</td>
                              <td colSpan={2} className="px-3 py-3 text-right font-bold text-green-700 font-mono">₹{commissionSheet.bonus.toLocaleString("en-IN")}</td>
                            </tr>
                            <tr className="bg-green-100 border-t border-green-300">
                              <td colSpan={8} className="px-3 py-3 text-sm font-bold text-green-800">TOTAL PAYABLE AMOUNT</td>
                              <td colSpan={2} className="px-3 py-3 text-right text-lg font-bold text-green-800 font-mono">₹{commissionSheet.totalPayable.toLocaleString("en-IN")}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      {commissionSheet.rows.some(r => !r.hasCost) && (
                        <div className="px-4 py-2 bg-amber-50 border-t border-amber-100 text-xs text-amber-700">
                          Some line items show no cost slab — commission excluded for those rows.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </DashboardShell>

      {/* COD Booking Modal */}
      {codModalOrderId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "1rem" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "28rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Truck className="h-4 w-4 text-orange-500" />
                  {orderCourierMap[codModalOrderId]?.isCourierBooked ? "Edit COD Booking" : "Mark as COD"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Order: <span className="font-mono font-semibold text-blue-700">{codModalOrderNo}</span></p>
              </div>
              <button onClick={() => setCodModalOrderId(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Courier Platform</span>
                <select value={codForm.courierPlatform} onChange={e => setCodForm(f => ({ ...f, courierPlatform: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 bg-white">
                  <option value="BIGSHIP">BigShip</option>
                  <option value="SHIPROCKET">Shiprocket</option>
                  <option value="DELHIVERY">Delhivery</option>
                  <option value="DTDC">DTDC</option>
                  <option value="BLUEDART">BlueDart</option>
                  <option value="ECOMEXPRESS">Ecom Express</option>
                  <option value="XPRESSBEES">XpressBees</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">AWB Number</span>
                <input value={codForm.awbNumber} onChange={e => setCodForm(f => ({ ...f, awbNumber: e.target.value }))}
                  placeholder="e.g. 1234567890"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Platform Order ID</span>
                <input value={codForm.courierOrderId} onChange={e => setCodForm(f => ({ ...f, courierOrderId: e.target.value }))}
                  placeholder="e.g. BigShip / Shiprocket order ID"
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setCodModalOrderId(null)}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveCodBooking} disabled={savingCod}
                className="inline-flex items-center gap-1 px-4 py-1.5 text-xs bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-60 font-semibold">
                {savingCod ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageCheck className="h-3 w-3" />}
                Save COD Booking
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Payment Modal */}
      {editingPayment && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)", padding: "1rem" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "34rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-slate-800">Edit Payment Receipt</h2>
                <p className="text-xs text-slate-500 mt-0.5">{editingPayment.orderNo} · {editingPayment.customerName}</p>
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
                <input type="date" value={editPaymentForm.paymentDate}
                  onChange={e => setEditPaymentForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Method</span>
                <select value={editPaymentForm.method} onChange={e => setEditPaymentForm(f => ({ ...f, method: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                  {paymentMethods.map(method => <option key={method} value={method}>{method.replace("_", " ")}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Received In</span>
                <select value={editPaymentForm.paymentAccountId} onChange={e => setEditPaymentForm(f => ({ ...f, paymentAccountId: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white">
                  <option value="">Select account</option>
                  {paymentAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}{account.bankName ? ` (${account.bankName})` : ""}</option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-semibold text-slate-600">UTR / Reference No</span>
                <input value={editPaymentForm.referenceNumber} onChange={e => setEditPaymentForm(f => ({ ...f, referenceNumber: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-[11px] font-semibold text-slate-600">Notes</span>
                <textarea rows={3} value={editPaymentForm.notes} onChange={e => setEditPaymentForm(f => ({ ...f, notes: e.target.value }))}
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
                </div>
                <button onClick={() => { setBankMatchPayment(null); setBankMatchResults([]); }}
                  style={{ padding: "4px", borderRadius: "6px", border: "none", background: "none", cursor: "pointer", color: "#94a3b8" }}>x</button>
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "0.75rem 1rem" }}>
              {bankMatchLoading ? (
                <div style={{ textAlign: "center", padding: "2rem", fontSize: "12px", color: "#64748b" }}>Searching bank statement...</div>
              ) : bankMatchResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: "0 0 8px" }}>No matching entries found in bank statement</p>
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
                          <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "9999px", background: txn.reconcileStatus === "MATCHED_PAYMENT" ? "#dcfce7" : "#f1f5f9", color: txn.reconcileStatus === "MATCHED_PAYMENT" ? "#15803d" : "#64748b", fontWeight: 600 }}>
                            {txn.reconcileStatus}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <button onClick={() => matchAndVerify(txn)} disabled={verifyingId === bankMatchPayment.id}
                            style={{ background: "#2563eb", color: "white", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
                            Match
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
              placeholder="Enter rejection reason..." rows={3}
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
