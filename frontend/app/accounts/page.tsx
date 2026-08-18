"use client";
import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import DateInput from "@/components/DateInput";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { apiFetch } from "@/lib/apiFetch";
import { Check, ChevronDown, ChevronUp, Loader2, X, Truck, Search, FileText, Pencil, Save, MessageCircle, AlertTriangle, Package, PackageCheck, DollarSign, Download, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import { MobileSelect } from "@/components/MobileSelect";
import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import * as XLSX from "xlsx";

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
  offerCode?: { code: string; offerType: string; description?: string | null; discountAmount?: number | null } | null;
};

type PendingOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; customerEmail?: string; customerGstNumber?: string | null; customerAddress?: string; salesAgentName?: string;
  products: string; items: OrderItem[];
  totalAmount: number; totalPaid: number; balanceDue: number;
  orderDate: string; notes?: string; payments: (Payment & { verificationStatus?: string })[];
  hasPendingPayments?: boolean;
  advancePct?: number;
  isTest?: boolean;
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
  isTest?: boolean;
  dispatchProductPhoto?: string | null;
  dispatchBillPhoto?: string | null;
};

type CancellationPendingOrder = {
  id: string; orderNo: string; customerName: string; salesAgentName?: string;
  isWholeOrder: boolean;
  requestedByName?: string | null;
  requestedAt: string;
  reason?: string | null;
  items: { id: string; productName: string; quantity: number; lineTotal: number }[];
  amountAffected: number;
  orderTotal: number;
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
  sellerNames?: string;
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

type ExpenseTrackerBucket = { accrued: number; paid: number; balance: number };
type ExpenseTrackerSalaryRow = { employeeId: string; fullName: string; designation: string; userId: string | null; accrued: number; paid: number; balance: number; taggable: boolean };
type ExpenseTrackerCommissionRow = { id: string; name: string; accrued: number; paid: number };
type ExpenseTrackerSanketTxn = { id: string; txnDate: string; description: string; amount: number };
type ExpenseTracker = {
  year: number; month: number;
  vendorExpense: ExpenseTrackerBucket & { entries: unknown[] };
  salary: ExpenseTrackerBucket & { byEmployee: ExpenseTrackerSalaryRow[]; sanket: { userId: string | null; amount: number; transactions: ExpenseTrackerSanketTxn[] } };
  commission: ExpenseTrackerBucket & { byAgent: ExpenseTrackerCommissionRow[] };
  total: ExpenseTrackerBucket;
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
type ExpenseCategoryMaster = { id: string; name: string };
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
const PV_STATUS_META: Record<string, { label: string; color: string }> = {
  MATCHED_PAYMENT: { label: "Payment Matched", color: "bg-green-100 text-green-800" },
  MATCHED_VENDOR: { label: "Vendor Matched", color: "bg-blue-100 text-blue-800" },
  MATCHED_EXPENSE: { label: "Expense Matched", color: "bg-purple-100 text-purple-800" },
  MATCHED_COMMISSION: { label: "Commission Matched", color: "bg-blue-100 text-blue-800" },
  MANUAL_REVIEW: { label: "Needs Review", color: "bg-yellow-100 text-yellow-800" },
};
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

type Tab = "pending" | "accounting" | "outstanding" | "dispatch" | "cancellations" | "receipts" | "receipt_history" | "vendors" | "commission" | "payment_verification" | "payment_history" | "expense_tracker";

// ── Payment Verification (bank statement debit sign-off) ───────────────────
type CommissionInfo = { agentName: string; month: string; year: number; label: string };
type PaymentVerificationEntry = {
  id: string;
  txnDate: string;
  description: string;
  amount: number;
  balance: number;
  crDr: string;
  reconcileStatus: string;
  vendorOrExpenseName: string | null;
  commissionInfo: CommissionInfo | null;
  accountantNote: string | null;
  expensePeriod: string | null;
  expensePeriodLabel: string | null;
  checkedById: string | null;
  checkedByName: string | null;
  checkedAt: string | null;
  recheckedById: string | null;
  recheckedByName: string | null;
  recheckedAt: string | null;
};

type SampleOrder = {
  id: string;
  orderNumber: string;
  status: string;
  samplePaymentType: string | null;
  paymentStatus: string;
  grandTotal: number;
  createdAt: string;
  notes?: string | null;
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
  verifiedMonths: string[];
  paidMonths: string[];
};
type CommissionSummary = {
  year: number; month: number;
  availableMonths: string[];
  agents: CommissionAgent[];
};
type CommissionRow = {
  orderItemId: string;
  orderId: string; date: string; invoiceNo: string; partyName: string;
  itemName: string; category: string; transactionType: string;
  gsm: number | null; sizeInches: string | null; printingType: string | null; sides: string | null;
  orderStatus: string; courierName: string | null;
  quantity: number; amount: number;
  ratePerUnit: number | null; discountPct: number;
  cost: number | null; grossProfit: number | null; marginPct: number | null;
  commissionPct: number; commissionAmt: number; calcMethod: string; hasCost: boolean; balanceDue: number;
  calculatedCommissionAmt: number; isOverridden: boolean; overriddenBy: string | null; overriddenAt: string | null;
};
type CommissionPaidTxn = { id: string; description: string; amount: number; txnDate: string };
type CommissionVerification = {
  id: string; verifiedAt: string; verifiedBy: string;
  paid: boolean; paidTransactions: CommissionPaidTxn[];
};
type CommissionSheet = {
  userId: string; year: number; month: number;
  agentName: string | null; agentCategory: string | null;
  saleTotal: number; commissionTotal: number; commissionPct: number;
  bonus: number; totalPayable: number;
  rows: CommissionRow[];
  verification: CommissionVerification | null;
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

const VALID_TABS: Tab[] = ["pending", "accounting", "outstanding", "dispatch", "receipts", "receipt_history", "vendors", "commission", "payment_verification", "payment_history", "expense_tracker"];

export default function AccountsPage() {
  const router = useRouter();
  const isNativeApp = useIsNativeApp();
  // Website keeps its original (desktop-table-style) layout; the Android app
  // gets a compact, horizontally-wrapping layout instead — see useIsNativeApp.
  const cx = (web: string, native: string) => (isNativeApp ? native : web);
  // Deep-links from elsewhere (e.g. the dashboard's Super Admin Tasks
  // section) pass ?tab=payment_verification — a fresh navigation onto this
  // page mounts it, so reading window.location.search once here is enough
  // (avoids next/navigation's useSearchParams, which needs a Suspense
  // boundary this large single-component page doesn't have).
  const [tab, setTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "pending";
    const fromUrl = new URLSearchParams(window.location.search).get("tab") as Tab | null;
    if (fromUrl && VALID_TABS.includes(fromUrl)) return fromUrl;
    return (localStorage.getItem("accounts_active_tab") as Tab) ?? "pending";
  });
  useEffect(() => { localStorage.setItem("accounts_active_tab", tab); }, [tab]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Pending orders
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [overrideOrderId, setOverrideOrderId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // Dispatch orders
  const [dispatchOrders, setDispatchOrders] = useState<DispatchPendingOrder[]>([]);
  const [dispatchLoading, setDispatchLoading] = useState(false);
  const [dispatchExpanded, setDispatchExpanded] = useState<string | null>(null);
  const [dispatchProcessing, setDispatchProcessing] = useState<string | null>(null);
  const [dispatchRejectId, setDispatchRejectId] = useState<string | null>(null);
  const [dispatchRejectReason, setDispatchRejectReason] = useState("");

  // Cancellation requests (agent requests via Orders page, approved/rejected here)
  const [cancelOrders, setCancelOrders] = useState<CancellationPendingOrder[]>([]);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelExpanded, setCancelExpanded] = useState<string | null>(null);
  const [cancelProcessing, setCancelProcessing] = useState<string | null>(null);
  const [cancelRejectId, setCancelRejectId] = useState<string | null>(null);
  const [cancelRejectReason, setCancelRejectReason] = useState("");

  // Sample Kit orders
  const [sampleOrders, setSampleOrders] = useState<SampleOrder[]>([]);
  const [sampleLoading, setSampleLoading] = useState(false);
  const [sampleProcessing, setSampleProcessing] = useState<string | null>(null);
  const [samplePaymentChoice, setSamplePaymentChoice] = useState<Record<string, boolean>>({});
  const [sampleRejectId, setSampleRejectId] = useState<string | null>(null);
  const [sampleRejectReason, setSampleRejectReason] = useState("");
  const [sampleTrackingInputs, setSampleTrackingInputs] = useState<Record<string, string>>({});

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
  const [outstandingSeller, setOutstandingSeller] = useState("");
  const [sendingReminderId, setSendingReminderId] = useState<string | null>(null);
  // Android app only: compact card view instead of the wide table, so this
  // tab doesn't need horizontal scrolling. Defaults on for native.
  const [outstandingCompact, setOutstandingCompact] = useState(true);
  const [receiptsCompact, setReceiptsCompact] = useState(true);
  const [receiptHistoryCompact, setReceiptHistoryCompact] = useState(true);
  const [paymentVerificationCompact, setPaymentVerificationCompact] = useState(true);
  const [paymentHistoryCompact, setPaymentHistoryCompact] = useState(true);
  const [commissionCompact, setCommissionCompact] = useState(true);
  const [expenseTrackerCompact, setExpenseTrackerCompact] = useState(true);

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

  // Payment Verification (bank statement debit sign-off)
  const [pvQueue, setPvQueue] = useState<PaymentVerificationEntry[]>([]);
  const [pvQueueLoading, setPvQueueLoading] = useState(false);
  const [pvHistory, setPvHistory] = useState<PaymentVerificationEntry[]>([]);
  const [pvHistoryLoading, setPvHistoryLoading] = useState(false);
  const [pvNoteDrafts, setPvNoteDrafts] = useState<Record<string, string>>({});
  const [pvSavingNoteId, setPvSavingNoteId] = useState<string | null>(null);
  const [pvCheckingId, setPvCheckingId] = useState<string | null>(null);
  const [pvRecheckingId, setPvRecheckingId] = useState<string | null>(null);
  const [pvVendorExpenseDrafts, setPvVendorExpenseDrafts] = useState<Record<string, string>>({});
  const [pvSavingVendorExpenseId, setPvSavingVendorExpenseId] = useState<string | null>(null);
  const [pvExpenseMonthDrafts, setPvExpenseMonthDrafts] = useState<Record<string, string>>({});
  const [pvSavingExpenseMonthId, setPvSavingExpenseMonthId] = useState<string | null>(null);
  const [pvPage, setPvPage] = useState(1);
  const [pvHistoryPage, setPvHistoryPage] = useState(1);
  const PV_PAGE_SIZE = 50;
  const [pvSelectedIds, setPvSelectedIds] = useState<Set<string>>(new Set());
  const [pvBulkProcessing, setPvBulkProcessing] = useState(false);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategoryMaster[]>([]);

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

  // Picker options for Payment Verification's Vendor / Expense column — registered
  // vendors + configured expense categories, merged and sorted, for a datalist.
  const vendorExpenseOptions = useMemo(() => {
    const names = new Set<string>();
    for (const v of vendors) if (v.name) names.add(v.name);
    for (const c of expenseCategories) if (c.name) names.add(c.name);
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [vendors, expenseCategories]);

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

  const loadCancellations = useCallback(async () => {
    setCancelLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/pending-cancellations`, { headers: getAuthHeaders() });
      if (res.ok) setCancelOrders(await res.json());
    } catch (error) {
      handleLoadError("Cancellation requests", error);
    } finally { setCancelLoading(false); }
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

  const loadPaymentVerification = useCallback(async () => {
    setPvQueueLoading(true);
    setLoadError(null);
    try {
      const headers = getAuthHeaders();
      const needVendors = vendors.length === 0;
      const needCategories = expenseCategories.length === 0;
      const [res, vendorRes, categoryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/accounts/payment-verification`, { headers }),
        needVendors ? fetch(`${API_BASE_URL}/vendors`, { headers }) : Promise.resolve(null),
        needCategories ? fetch(`${API_BASE_URL}/bank-statement/expense-categories`, { headers }) : Promise.resolve(null),
      ]);
      if (vendorRes?.ok) setVendors(await vendorRes.json());
      if (categoryRes?.ok) setExpenseCategories(await categoryRes.json());
      if (res.ok) {
        const data: PaymentVerificationEntry[] = await res.json();
        setPvQueue(data);
        setPvNoteDrafts(prev => {
          const next = { ...prev };
          for (const entry of data) if (next[entry.id] === undefined) next[entry.id] = entry.accountantNote ?? "";
          return next;
        });
        setPvVendorExpenseDrafts(prev => {
          const next = { ...prev };
          for (const entry of data) if (next[entry.id] === undefined) next[entry.id] = entry.vendorOrExpenseName ?? "";
          return next;
        });
        setPvExpenseMonthDrafts(prev => {
          const next = { ...prev };
          for (const entry of data) if (next[entry.id] === undefined) next[entry.id] = entry.expensePeriod ? entry.expensePeriod.slice(0, 7) : "";
          return next;
        });
      }
    } catch (error) {
      handleLoadError("Payment verification", error);
    } finally { setPvQueueLoading(false); }
  }, [handleLoadError, vendors.length, expenseCategories.length]);

  const loadPaymentVerificationHistory = useCallback(async () => {
    setPvHistoryLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-verification-history`, { headers: getAuthHeaders() });
      if (res.ok) setPvHistory(await res.json());
    } catch (error) {
      handleLoadError("Payment history", error);
    } finally { setPvHistoryLoading(false); }
  }, [handleLoadError]);

  async function saveVerificationNote(id: string) {
    const note = pvNoteDrafts[id] ?? "";
    setPvSavingNoteId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${id}/note`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not save note");
      }
      const updated: PaymentVerificationEntry = await res.json();
      setPvQueue(prev => prev.map(e => (e.id === id ? updated : e)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save note");
    } finally { setPvSavingNoteId(null); }
  }

  async function saveVendorExpense(id: string) {
    const label = pvVendorExpenseDrafts[id] ?? "";
    setPvSavingVendorExpenseId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${id}/vendor-expense`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not save vendor/expense");
      }
      const updated: PaymentVerificationEntry = await res.json();
      setPvQueue(prev => prev.map(e => (e.id === id ? updated : e)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save vendor/expense");
    } finally { setPvSavingVendorExpenseId(null); }
  }

  async function saveExpenseMonth(id: string, period: string) {
    setPvSavingExpenseMonthId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${id}/expense-month`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ period: period || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not save expense month");
      }
      const updated: PaymentVerificationEntry = await res.json();
      setPvQueue(prev => prev.map(e => (e.id === id ? updated : e)));
      setPvExpenseMonthDrafts(prev => ({ ...prev, [id]: period }));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save expense month");
    } finally { setPvSavingExpenseMonthId(null); }
  }

  async function handleCheckVerification(entry: PaymentVerificationEntry) {
    setPvCheckingId(entry.id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${entry.id}/check`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not mark as checked");
      }
      const updated: PaymentVerificationEntry = await res.json();
      setPvQueue(prev => prev.map(e => (e.id === entry.id ? updated : e)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not mark as checked");
    } finally { setPvCheckingId(null); }
  }

  async function handleUndoCheck(entry: PaymentVerificationEntry) {
    if (!confirm("Undo Checked for this entry? Vendor/Expense, Expense Month and Note will become editable again.")) return;
    setPvCheckingId(entry.id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${entry.id}/uncheck`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not undo Checked");
      }
      const updated: PaymentVerificationEntry = await res.json();
      setPvQueue(prev => prev.map(e => (e.id === entry.id ? updated : e)));
      // Reset local drafts so the now-editable inputs show the real saved values, not stale drafts.
      setPvVendorExpenseDrafts(prev => { const n = { ...prev }; delete n[entry.id]; return n; });
      setPvExpenseMonthDrafts(prev => { const n = { ...prev }; delete n[entry.id]; return n; });
      setPvNoteDrafts(prev => { const n = { ...prev }; delete n[entry.id]; return n; });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not undo Checked");
    } finally { setPvCheckingId(null); }
  }

  async function handleRecheckVerification(entry: PaymentVerificationEntry) {
    setPvRecheckingId(entry.id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${entry.id}/recheck`, {
        method: "PATCH",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Could not recheck");
      }
      const updated: PaymentVerificationEntry = await res.json();
      // Move locally: drop from the queue, add to history — no refetch, no page reload.
      setPvQueue(prev => prev.filter(e => e.id !== entry.id));
      setPvHistory(prev => [...prev, updated]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not recheck");
    } finally { setPvRecheckingId(null); }
  }

  function togglePvSelect(id: string) {
    setPvSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // A blank Vendor/Expense can't be selected for bulk actions — same rule
  // whether it's still unchecked or already checked, since an entry should
  // always be categorized before it's signed off in bulk.
  function pvIsSelectable(entry: PaymentVerificationEntry) {
    return !!entry.vendorOrExpenseName;
  }

  async function handleBulkCheck() {
    const ids = pvQueue.filter(e => pvSelectedIds.has(e.id) && !e.checkedAt && pvIsSelectable(e)).map(e => e.id);
    if (ids.length === 0) return;
    setPvBulkProcessing(true);
    try {
      const results = await Promise.all(ids.map(async id => {
        try {
          const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${id}/check`, { method: "PATCH", headers: getAuthHeaders() });
          if (!res.ok) return null;
          return (await res.json()) as PaymentVerificationEntry;
        } catch { return null; }
      }));
      setPvQueue(prev => prev.map(e => {
        const idx = ids.indexOf(e.id);
        return idx !== -1 && results[idx] ? results[idx]! : e;
      }));
      const failed = results.filter(r => !r).length;
      if (failed > 0) alert(`${failed} of ${ids.length} entries could not be checked.`);
      setPvSelectedIds(new Set());
    } finally { setPvBulkProcessing(false); }
  }

  async function handleBulkVerify() {
    const ids = pvQueue.filter(e => pvSelectedIds.has(e.id) && e.checkedAt && !e.recheckedAt && pvIsSelectable(e)).map(e => e.id);
    if (ids.length === 0) return;
    if (!confirm(`Verify ${ids.length} entries as Sanket and move them to Payment History? This does not change the Checked status.`)) return;
    setPvBulkProcessing(true);
    try {
      const results = await Promise.all(ids.map(async id => {
        try {
          const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${id}/recheck`, { method: "PATCH", headers: getAuthHeaders() });
          if (!res.ok) return null;
          return (await res.json()) as PaymentVerificationEntry;
        } catch { return null; }
      }));
      const verified = results.filter((r): r is PaymentVerificationEntry => !!r);
      const verifiedIds = new Set(verified.map(r => r.id));
      setPvQueue(prev => prev.filter(e => !verifiedIds.has(e.id)));
      setPvHistory(prev => [...prev, ...verified]);
      const failed = ids.length - verified.length;
      if (failed > 0) alert(`${failed} of ${ids.length} entries could not be verified.`);
      setPvSelectedIds(new Set());
    } finally { setPvBulkProcessing(false); }
  }

  async function handleBulkUndo() {
    const ids = pvQueue.filter(e => pvSelectedIds.has(e.id) && e.checkedAt && !e.recheckedAt).map(e => e.id);
    if (ids.length === 0) return;
    if (!confirm(`Undo Checked for ${ids.length} entries? Their Vendor/Expense, Expense Month and Note will become editable again.`)) return;
    setPvBulkProcessing(true);
    try {
      const results = await Promise.all(ids.map(async id => {
        try {
          const res = await fetch(`${API_BASE_URL}/accounts/payment-verification/${id}/uncheck`, { method: "PATCH", headers: getAuthHeaders() });
          if (!res.ok) return null;
          return (await res.json()) as PaymentVerificationEntry;
        } catch { return null; }
      }));
      setPvQueue(prev => prev.map(e => {
        const idx = ids.indexOf(e.id);
        return idx !== -1 && results[idx] ? results[idx]! : e;
      }));
      // Clear stale drafts for every row that got reopened, so the inputs show the real saved values.
      const undone = new Set(ids.filter((id, i) => results[i]));
      setPvVendorExpenseDrafts(prev => { const n = { ...prev }; undone.forEach(id => delete n[id]); return n; });
      setPvExpenseMonthDrafts(prev => { const n = { ...prev }; undone.forEach(id => delete n[id]); return n; });
      setPvNoteDrafts(prev => { const n = { ...prev }; undone.forEach(id => delete n[id]); return n; });
      const failed = ids.length - undone.size;
      if (failed > 0) alert(`${failed} of ${ids.length} entries could not be undone.`);
      setPvSelectedIds(new Set());
    } finally { setPvBulkProcessing(false); }
  }

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

  const dispatchSampleOrder = useCallback(async (orderId: string, trackingNumber?: string) => {
    setSampleProcessing(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${orderId}/dispatch-sample`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber: trackingNumber || undefined }),
      });
      if (res.ok) {
        setSampleOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: "DISPATCHED", notes: trackingNumber ? `Tracking: ${trackingNumber}` : o.notes } : o));
        setSampleTrackingInputs(prev => { const n = { ...prev }; delete n[orderId]; return n; });
      } else {
        const b = await res.json();
        alert(b.message || "Dispatch failed");
      }
    } finally { setSampleProcessing(null); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "accounting") void loadAccounting(); }, [tab, loadAccounting]);
  useEffect(() => { if (tab === "dispatch") void loadDispatch(); }, [tab, loadDispatch]);
  useEffect(() => { if (tab === "cancellations") void loadCancellations(); }, [tab, loadCancellations]);
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
  useEffect(() => { if (tab === "payment_verification") void loadPaymentVerification(); }, [tab, loadPaymentVerification]);
  useEffect(() => { if (tab === "payment_history") void loadPaymentVerificationHistory(); }, [tab, loadPaymentVerificationHistory]);

  // ── Commission state ────────────────────────────────────────────────────
  const [commissionSummary, setCommissionSummary] = useState<CommissionSummary | null>(null);
  const [commissionLoading, setCommissionLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<CommissionAgent | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [commissionSheet, setCommissionSheet] = useState<CommissionSheet | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  const now = new Date();
  const [commYear] = useState(now.getFullYear());
  const [commMonth] = useState(now.getMonth() + 1);
  const [verifying, setVerifying] = useState(false);
  const [markingCommissionPaid, setMarkingCommissionPaid] = useState(false);
  const [bankMatchCommission, setBankMatchCommission] = useState<{ agentId: string; agentName: string; year: number; month: number; amount: number } | null>(null);
  const [bankMatchCommissionResults, setBankMatchCommissionResults] = useState<BankTxn[]>([]);
  const [bankMatchCommissionLoading, setBankMatchCommissionLoading] = useState(false);
  // ── Expense Tracker ──────────────────────────────────────────────────────
  const [expenseTrackerMonth, setExpenseTrackerMonth] = useState<string>(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [expenseTracker, setExpenseTracker] = useState<ExpenseTracker | null>(null);
  const [expenseTrackerLoading, setExpenseTrackerLoading] = useState(false);
  const [bankMatchSalary, setBankMatchSalary] = useState<{ userId: string; userName: string; year: number; month: number; amount: number } | null>(null);
  const [bankMatchSalaryResults, setBankMatchSalaryResults] = useState<BankTxn[]>([]);
  const [bankMatchSalaryLoading, setBankMatchSalaryLoading] = useState(false);
  const [markingSalaryPaid, setMarkingSalaryPaid] = useState(false);

  const loadExpenseTracker = useCallback(async (monthStr: string) => {
    if (!monthStr) return;
    setExpenseTrackerLoading(true);
    try {
      const [y, m] = monthStr.split("-").map(Number);
      const res = await fetch(`${API_BASE_URL}/accounts/expense-tracker?year=${y}&month=${m}`, { headers: getAuthHeaders() });
      if (res.ok) setExpenseTracker(await res.json());
    } finally {
      setExpenseTrackerLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === "expense_tracker") void loadExpenseTracker(expenseTrackerMonth); }, [tab, expenseTrackerMonth, loadExpenseTracker]);

  // Salary "Mark as Paid" — same bank-match pattern as Commission above, but
  // when there's no fixed target amount (Sanket's own withdrawals, which have
  // no set monthly figure) it searches by date range for that month instead
  // of an exact amount.
  async function openSalaryBankMatch(userId: string, userName: string, year: number, month: number, amount: number) {
    setBankMatchSalary({ userId, userName, year, month, amount });
    setBankMatchSalaryResults([]);
    setBankMatchSalaryLoading(true);
    try {
      const params = new URLSearchParams({ crDr: "DR", limit: "50" });
      if (amount > 0) {
        params.set("amountMin", String(amount));
        params.set("amountMax", String(amount));
      } else {
        params.set("fromDate", `${year}-${String(month).padStart(2, "0")}-01`);
        params.set("toDate", new Date(year, month, 1).toISOString().slice(0, 10));
      }
      const res = await fetch(`${API_BASE_URL}/bank-statement/transactions?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBankMatchSalaryResults(data.data ?? []);
      }
    } finally {
      setBankMatchSalaryLoading(false);
    }
  }

  async function matchSalaryPaid(txn: BankTxn) {
    if (!bankMatchSalary) return;
    setMarkingSalaryPaid(true);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/expense-tracker/salary/${bankMatchSalary.userId}/mark-paid`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ year: bankMatchSalary.year, month: bankMatchSalary.month, transactionId: txn.id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Could not mark as paid: ${err.message || res.statusText}`);
        return;
      }
      setBankMatchSalary(null);
      setBankMatchSalaryResults([]);
      await loadExpenseTracker(expenseTrackerMonth);
    } finally {
      setMarkingSalaryPaid(false);
    }
  }

  async function handleUnmarkSalaryPaid(transactionId: string) {
    if (!confirm("Untag this bank transaction as a salary payment?")) return;
    const res = await fetch(`${API_BASE_URL}/accounts/expense-tracker/salary/unmark-paid/${transactionId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });
    if (res.ok) await loadExpenseTracker(expenseTrackerMonth);
  }

  const [editingCommRow, setEditingCommRow] = useState<number | null>(null);
  const [editCommValue, setEditCommValue] = useState<string>("");
  const [savingCommRow, setSavingCommRow] = useState<number | null>(null);
  // Set right before an edit is cancelled (Escape key or Cancel button) so the
  // input's onBlur — which fires as focus moves away — knows to discard the
  // in-progress value instead of treating the blur as "save on click-away".
  const cancelledCommEditRef = useRef(false);

  // Current logged-in user for role-based access
  const [currentUser] = useState(() => {
    if (typeof window === "undefined") return null;
    try { return JSON.parse(localStorage.getItem("rareprint_user") ?? "null"); } catch { return null; }
  });
  const isAdmin = currentUser?.role === "ADMIN";
  const canSeeDetails = currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTS";
  const isSuperAdmin = currentUser?.email?.toLowerCase?.() === "sanket.rareprint@gmail.com";
  const canCheckPayments = isSuperAdmin || currentUser?.role === "ADMIN" || currentUser?.role === "ACCOUNTS";

  const [commissionError, setCommissionError] = useState<string | null>(null);
  const loadCommissionSummary = useCallback(async (year: number, month: number) => {
    setCommissionLoading(true);
    setCommissionError(null);
    setLoadError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/commission-summary?year=${year}&month=${month}`, { headers: getAuthHeaders() });
      if (res.ok) {
        setCommissionSummary(await res.json());
      } else {
        const text = await res.text();
        setCommissionError(`API error ${res.status}: ${text.slice(0, 200)}`);
      }
    } catch (error) {
      setCommissionError(String(error));
      handleLoadError("Commission summary", error);
    } finally { setCommissionLoading(false); }
  }, [handleLoadError]);

  const loadCommissionSheet = useCallback(async (agentId: string, monthStr: string, opts?: { silent?: boolean }) => {
    const [y, m] = monthStr.split("-").map(Number);
    if (!opts?.silent) { setSheetLoading(true); setCommissionSheet(null); }
    setEditingCommRow(null);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/sales-agents/${agentId}/commission?year=${y}&month=${m}`, { headers: getAuthHeaders() });
      if (res.ok) setCommissionSheet(await res.json());
      else handleLoadError("Commission sheet", await res.text());
    } catch (error) {
      handleLoadError("Commission sheet", error);
    } finally { setSheetLoading(false); }
  }, [handleLoadError]);

  // Manual commission correction (pencil icon) — persists to the backend
  // (CommissionOverride table) so it survives reloads, verify toggles, and
  // month switching, instead of living only in browser memory.
  const saveCommissionOverride = useCallback(async (row: CommissionRow, rowIndex: number, amount: number) => {
    if (!selectedAgent) return;
    setSavingCommRow(rowIndex);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/sales-agents/${selectedAgent.id}/commission/override`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: row.orderItemId, amount }),
      });
      if (res.ok) await loadCommissionSheet(selectedAgent.id, selectedMonth, { silent: true });
      else handleLoadError("Commission override", await res.text());
    } catch (error) {
      handleLoadError("Commission override", error);
    } finally {
      setSavingCommRow(null);
    }
  }, [selectedAgent, selectedMonth, loadCommissionSheet, handleLoadError]);

  const clearCommissionOverride = useCallback(async (row: CommissionRow, rowIndex: number) => {
    if (!selectedAgent) return;
    setSavingCommRow(rowIndex);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/sales-agents/${selectedAgent.id}/commission/override/${row.orderItemId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (res.ok) await loadCommissionSheet(selectedAgent.id, selectedMonth, { silent: true });
      else handleLoadError("Commission override", await res.text());
    } catch (error) {
      handleLoadError("Commission override", error);
    } finally {
      setSavingCommRow(null);
    }
  }, [selectedAgent, selectedMonth, loadCommissionSheet, handleLoadError]);

  // Column definitions shared by the PDF and Excel commission-sheet exports,
  // so both formats always show exactly the same columns (respecting the
  // ADMIN/ACCOUNTS-only "canSeeDetails" columns) without drifting apart.
  const buildCommissionExportColumns = useCallback((): { header: string; value: (row: CommissionRow) => string | number }[] => {
    const cols: { header: string; value: (row: CommissionRow) => string | number }[] = [
      { header: "Date", value: (r) => new Date(r.date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" }) },
      { header: "Invoice", value: (r) => r.invoiceNo },
      { header: "Party Name", value: (r) => r.partyName },
      { header: "Item", value: (r) => r.itemName },
      { header: "Size / GSM", value: (r) => [r.sizeInches ? `${r.sizeInches}"` : "", r.gsm ? `${r.gsm}GSM` : "", r.sides === "SINGLE_SIDE" ? "1S" : r.sides === "DOUBLE_SIDE" ? "2S" : ""].filter(Boolean).join(" ") || "—" },
    ];
    if (canSeeDetails) cols.push({ header: "Order Status", value: (r) => r.orderStatus ? r.orderStatus.replace(/_/g, " ") : "—" });
    cols.push({ header: "Qty", value: (r) => r.quantity });
    cols.push({ header: "Amount", value: (r) => r.amount });
    if (canSeeDetails) {
      cols.push({ header: "Rate Total", value: (r) => r.ratePerUnit ?? "—" });
      cols.push({ header: "Disc%", value: (r) => (r.discountPct > 0 ? `-${r.discountPct.toFixed(1)}%` : "No disc") });
      cols.push({ header: "Cost", value: (r) => r.cost ?? "—" });
      cols.push({ header: "Gr. Profit", value: (r) => r.grossProfit ?? "—" });
      cols.push({ header: "Margin", value: (r) => (r.marginPct != null ? `${r.marginPct.toFixed(1)}%` : "—") });
    }
    cols.push({ header: "Rate%", value: (r) => (r.hasCost ? `${r.commissionPct}%` : "—") });
    if (canSeeDetails) cols.push({ header: "Balance Due", value: (r) => (r.balanceDue > 0 ? r.balanceDue : "Paid") });
    cols.push({ header: "Commission", value: (r) => (r.hasCost ? r.commissionAmt : "—") });
    return cols;
  }, [canSeeDetails]);

  const commissionExportFilename = useCallback((ext: string) => {
    const agentName = (selectedAgent?.name ?? "agent").replace(/[^\w]+/g, "_");
    return `Commission_${agentName}_${selectedMonth || "sheet"}.${ext}`;
  }, [selectedAgent, selectedMonth]);

  const downloadCommissionPdf = useCallback(() => {
    if (!commissionSheet || !selectedAgent) return;
    const columns = buildCommissionExportColumns();
    const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });

    doc.setFontSize(14);
    doc.text(`Commission Sheet — ${selectedAgent.name} — ${selectedMonth}`, 40, 40);
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(
      `Category ${selectedAgent.category ?? "—"}   ·   Commission Rate ${commissionSheet.commissionPct}%   ·   ` +
      `${commissionSheet.verification ? `Verified by ${commissionSheet.verification.verifiedBy}` : "Not verified"}`,
      40, 58,
    );
    doc.setTextColor(20);
    doc.setFontSize(10);
    doc.text(
      `Total Sales: ${fmt(commissionSheet.saleTotal)}    Commission: ${fmt(commissionSheet.commissionTotal)}    ` +
      `Bonus: ${fmt(commissionSheet.bonus)}    TOTAL PAYABLE: ${fmt(commissionSheet.totalPayable)}`,
      40, 76,
    );

    autoTable(doc, {
      head: [columns.map(c => c.header)],
      body: commissionSheet.rows.map(row => columns.map(c => {
        const v = c.value(row);
        return typeof v === "number" ? v.toLocaleString("en-IN") : v;
      })),
      startY: 90,
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 7.5 },
      margin: { left: 40, right: 40 },
    });

    doc.save(commissionExportFilename("pdf"));
  }, [commissionSheet, selectedAgent, selectedMonth, buildCommissionExportColumns, commissionExportFilename]);

  const downloadCommissionExcel = useCallback(() => {
    if (!commissionSheet || !selectedAgent) return;
    const columns = buildCommissionExportColumns();

    const sheetData: (string | number)[][] = [
      [`Commission Sheet — ${selectedAgent.name} — ${selectedMonth}`],
      [`Category ${selectedAgent.category ?? "—"}`, `Commission Rate ${commissionSheet.commissionPct}%`],
      ["Total Sales", commissionSheet.saleTotal, "Commission", commissionSheet.commissionTotal, "Bonus", commissionSheet.bonus, "Total Payable", commissionSheet.totalPayable],
      [],
      columns.map(c => c.header),
      ...commissionSheet.rows.map(row => columns.map(c => c.value(row))),
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);
    ws["!cols"] = columns.map(c => ({ wch: Math.max(10, c.header.length + 2) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Commission");
    XLSX.writeFile(wb, commissionExportFilename("xlsx"));
  }, [commissionSheet, selectedAgent, selectedMonth, buildCommissionExportColumns, commissionExportFilename]);

  const handleVerifyCommission = useCallback(async () => {
    if (!selectedAgent || !selectedMonth) return;
    const [y, m] = selectedMonth.split("-").map(Number);
    setVerifying(true);
    try {
      const isVerified = !!commissionSheet?.verification;
      const method = isVerified ? "DELETE" : "POST";
      const res = await fetch(`${API_BASE_URL}/cost-table/sales-agents/${selectedAgent.id}/commission/verify?year=${y}&month=${m}`, { method, headers: getAuthHeaders() });
      if (res.ok) {
        void loadCommissionSheet(selectedAgent.id, selectedMonth);
        // Reflect the new verified state on the month buttons immediately,
        // without waiting for a full commission-summary refetch.
        const updateVerifiedMonths = (agent: CommissionAgent): CommissionAgent => ({
          ...agent,
          verifiedMonths: isVerified
            ? agent.verifiedMonths.filter(vm => vm !== selectedMonth)
            : agent.verifiedMonths.includes(selectedMonth) ? agent.verifiedMonths : [...agent.verifiedMonths, selectedMonth],
        });
        setSelectedAgent(prev => (prev ? updateVerifiedMonths(prev) : prev));
        setCommissionSummary(prev => prev ? {
          ...prev,
          agents: prev.agents.map(a => a.id === selectedAgent.id ? updateVerifiedMonths(a) : a),
        } : prev);
      }
    } catch { /* ignore */ } finally { setVerifying(false); }
  }, [selectedAgent, selectedMonth, commissionSheet, loadCommissionSheet]);

  useEffect(() => {
    if (tab === "commission") void loadCommissionSummary(commYear, commMonth);
  }, [tab, commYear, commMonth, loadCommissionSummary]);

  useEffect(() => {
    if (selectedAgent && selectedMonth) void loadCommissionSheet(selectedAgent.id, selectedMonth);
  }, [selectedAgent, selectedMonth, loadCommissionSheet]);

  async function approveOrder(id: string, overrideReason?: string) {
    setProcessing(id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${id}/approve`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: overrideReason ? JSON.stringify({ overrideReason }) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const msg: string = err.message || res.statusText;
        // Cost/margin errors → offer override modal instead of plain alert
        if (msg.includes("cost data is missing") || msg.includes("margin is below")) {
          setOverrideOrderId(id);
          setOverrideReason("");
          return;
        }
        alert(`Order approval failed: ${msg}`);
        return;
      }
      await load();
    } finally { setProcessing(null); }
  }

  async function submitOverrideApproval() {
    if (!overrideOrderId || !overrideReason.trim()) return;
    await approveOrder(overrideOrderId, overrideReason.trim());
    setOverrideOrderId(null);
    setOverrideReason("");
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

  async function rejectDispatchOrder() {
    if (!dispatchRejectId || !dispatchRejectReason.trim()) { alert("Please enter a reason"); return; }
    setDispatchProcessing(dispatchRejectId);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${dispatchRejectId}/reject-dispatch`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: dispatchRejectReason }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Failed to reject"); return; }
      setDispatchRejectId(null); setDispatchRejectReason(""); await loadDispatch();
      alert("Dispatch rejected — sales agent has been notified.");
    } finally { setDispatchProcessing(null); }
  }

  async function approveCancellationRequest(id: string) {
    setCancelProcessing(id);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${id}/approve-cancellation`, {
        method: "PATCH", headers: getAuthHeaders(),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Failed to approve cancellation"); return; }
      await loadCancellations();
    } finally { setCancelProcessing(null); }
  }

  async function rejectCancellationRequest() {
    if (!cancelRejectId || !cancelRejectReason.trim()) { alert("Please enter a reason"); return; }
    setCancelProcessing(cancelRejectId);
    try {
      const res = await fetch(`${API_BASE_URL}/accounts/${cancelRejectId}/reject-cancellation`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ reason: cancelRejectReason }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Failed to reject"); return; }
      setCancelRejectId(null); setCancelRejectReason(""); await loadCancellations();
      alert("Cancellation request rejected — sales agent has been notified.");
    } finally { setCancelProcessing(null); }
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

  // ── Commission "Mark as Paid" — same bank-match pattern as receipts above,
  // but searching debits (money leaving the account) around the payout amount
  // instead of credits, and linking to a CommissionVerification instead of a Payment.
  async function openCommissionBankMatch() {
    if (!selectedAgent || !selectedMonth || !commissionSheet) return;
    const [y, m] = selectedMonth.split("-").map(Number);
    setBankMatchCommission({ agentId: selectedAgent.id, agentName: selectedAgent.name, year: y, month: m, amount: commissionSheet.totalPayable });
    setBankMatchCommissionResults([]);
    setBankMatchCommissionLoading(true);
    try {
      const params = new URLSearchParams({
        crDr: "DR",
        amountMin: String(commissionSheet.totalPayable),
        amountMax: String(commissionSheet.totalPayable),
        limit: "50",
      });
      const res = await fetch(`${API_BASE_URL}/bank-statement/transactions?${params}`, { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setBankMatchCommissionResults(data.data ?? []);
      }
    } finally { setBankMatchCommissionLoading(false); }
  }

  async function matchCommissionPaid(txn: BankTxn) {
    if (!bankMatchCommission) return;
    setMarkingCommissionPaid(true);
    try {
      const res = await fetch(
        `${API_BASE_URL}/cost-table/sales-agents/${bankMatchCommission.agentId}/commission/mark-paid?year=${bankMatchCommission.year}&month=${bankMatchCommission.month}`,
        {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: txn.id }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(`Could not mark as paid: ${err.message || res.statusText}`);
        return;
      }
      setBankMatchCommission(null);
      setBankMatchCommissionResults([]);
      const monthStr = `${bankMatchCommission.year}-${String(bankMatchCommission.month).padStart(2, "0")}`;
      await loadCommissionSheet(bankMatchCommission.agentId, monthStr, { silent: true });
      setCommissionSummary(prev => prev ? {
        ...prev,
        agents: prev.agents.map(a => a.id === bankMatchCommission.agentId
          ? { ...a, paidMonths: a.paidMonths.includes(monthStr) ? a.paidMonths : [...a.paidMonths, monthStr] }
          : a),
      } : prev);
    } finally { setMarkingCommissionPaid(false); }
  }

  async function handleUnmarkCommissionPaid() {
    if (!selectedAgent || !selectedMonth) return;
    setMarkingCommissionPaid(true);
    try {
      const [y, m] = selectedMonth.split("-").map(Number);
      const res = await fetch(
        `${API_BASE_URL}/cost-table/sales-agents/${selectedAgent.id}/commission/mark-paid?year=${y}&month=${m}`,
        { method: "DELETE", headers: getAuthHeaders() },
      );
      if (res.ok) {
        await loadCommissionSheet(selectedAgent.id, selectedMonth, { silent: true });
        setCommissionSummary(prev => prev ? {
          ...prev,
          agents: prev.agents.map(a => a.id === selectedAgent.id
            ? { ...a, paidMonths: a.paidMonths.filter(pm => pm !== selectedMonth) }
            : a),
        } : prev);
      }
    } finally { setMarkingCommissionPaid(false); }
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
      await Promise.all([loadReceipts(), load()]);
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
      await Promise.all([loadReceipts(), loadHistory(), load()]);
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
      (!outstandingSeller || (row.sellerNames ?? "").split(", ").includes(outstandingSeller)) &&
      // When the user is actively searching (name/phone/email/order#), ignore the "Ready/Delivered"
      // default scoping so a customer with outstanding balance on ANY order status is still found.
      (!!q || outstandingOrderStatus !== "READY_DELIVERED" || row.reminderAmount > 0) &&
      (outstandingOrderStatus === "READY_DELIVERED" || !outstandingOrderStatus || (row.orderStatuses ?? "").split(", ").includes(outstandingOrderStatus)) &&
      (!q ||
        row.customerName.toLowerCase().includes(q) ||
        row.customerPhone?.toLowerCase().includes(q) ||
        row.customerEmail?.toLowerCase().includes(q) ||
        row.orderNumbers.toLowerCase().includes(q))
    );
  }, [outstanding, outstandingSearch, outstandingStatus, outstandingOrderStatus, outstandingSeller]);
  const outstandingStatuses = useMemo(() => (
    Array.from(new Set(outstanding.flatMap(row => (row.productStatuses ?? "").split(", ").filter(Boolean)))).sort()
  ), [outstanding]);
  const outstandingOrderStatuses = useMemo(() => (
    Array.from(new Set(outstanding.flatMap(row => (row.orderStatuses ?? "").split(", ").filter(Boolean)))).sort()
  ), [outstanding]);
  const outstandingSellers = useMemo(() => (
    Array.from(new Set(outstanding.flatMap(row => (row.sellerNames ?? "").split(", ").filter(Boolean)))).sort()
  ), [outstanding]);
  const outstandingTotal = useMemo(() => filteredOutstanding.reduce((sum, row) => sum + row.outstandingAmount, 0), [filteredOutstanding]);
  const outstandingPaidTotal = useMemo(() => filteredOutstanding.reduce((sum, row) => sum + row.paidAmount, 0), [filteredOutstanding]);

  return (
    <>
      <DashboardShell>
        <div className={`p-4 lg:p-6 space-y-4 min-w-0 ${tab === "commission" && selectedAgent ? "max-w-full" : "max-w-7xl mx-auto"}`}>
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
                { key: "accounting", label: "Billing & GST", count: salesInvoices.length + purchaseBills.length },
                { key: "outstanding", label: "Customer Outstanding", count: outstanding.length },
                { key: "dispatch", label: "Dispatch Approval", count: dispatchOrders.length },
                { key: "cancellations", label: "Cancellation Approval", count: cancelOrders.length },
                { key: "receipts", label: "Receipts Pending", count: pendingPayments.length },
                { key: "receipt_history", label: "Receipt History", count: receiptHistory.length },
                { key: "vendors", label: "Vendor Statements", count: vendorEntries.filter(e => !e.isPaid).length },
                { key: "commission", label: "Commission", count: 0 },
                { key: "payment_verification", label: "Payment Verification", count: pvQueue.length },
                { key: "payment_history", label: "Payment History", count: 0 },
                { key: "expense_tracker", label: "Expense Tracker", count: 0 },
              ] as { key: Tab; label: string; count: number }[]).map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition-colors ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {t.label}
                  {t.count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${tab === t.key ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── OVERRIDE APPROVE MODAL ── */}
          {overrideOrderId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
              <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  <h3 className="text-lg font-bold text-slate-800">Override &amp; Approve</h3>
                </div>
                <p className="text-sm text-slate-500 mb-4">
                  This order has items with missing cost or below-minimum margin (e.g. free stickers, combo discount).
                  Enter a reason to approve anyway — it will be logged for audit.
                </p>
                <textarea
                  className="w-full border border-slate-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                  rows={3}
                  placeholder="e.g. Free stickers given as goodwill gift / Combo discount approved by Sanket"
                  value={overrideReason}
                  onChange={e => setOverrideReason(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-3 mt-4 justify-end">
                  <button
                    onClick={() => { setOverrideOrderId(null); setOverrideReason(""); }}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button
                    onClick={submitOverrideApproval}
                    disabled={!overrideReason.trim() || processing === overrideOrderId}
                    className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
                    {processing === overrideOrderId ? "Approving..." : "Override & Approve"}
                  </button>
                </div>
              </div>
            </div>
          )}

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
                  <div className={cx("flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100", "flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2 bg-slate-50 border-b border-slate-100")}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-blue-700">{order.orderNo}</span>
                      {order.isTest && <span className="rounded-full bg-amber-400 text-amber-900 px-1.5 py-0.5 text-xs font-bold">TEST — approving/rejecting this has no billing impact</span>}
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(order.orderDate)}`}>{orderAge(order.orderDate)}</span>
                      <span className="font-semibold text-slate-800">{order.customerName}</span>
                      {order.customerPhone && <span className="text-slate-400 text-xs">{order.customerPhone}</span>}
                      {order.customerGstNumber && <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs font-mono" title="Customer GSTIN">GST: {order.customerGstNumber}</span>}
                      {order.customerAddress && <span className="text-slate-500 text-xs">📍 {order.customerAddress}</span>}
                      {order.salesAgentName && <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs">{order.salesAgentName}</span>}
                    </div>
                    <span className="text-sm font-bold text-slate-800">{fmt(order.totalAmount)}</span>
                  </div>

                  <div className={cx("p-4 space-y-3", "p-3 space-y-2")}>
                    {!isNativeApp && (
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
                                {item.offerCode && (
                                  <div className={`inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold rounded px-1.5 py-0.5 ${item.offerCode.offerType === "COMBO_DISCOUNT" ? "bg-amber-50 text-amber-700" : "bg-purple-50 text-purple-700"}`}>
                                    {item.offerCode.offerType === "COMBO_DISCOUNT" ? "🎯" : "🎁"} {item.offerCode.code}
                                    {item.offerCode.discountAmount && <span className="font-normal"> −₹{Number(item.offerCode.discountAmount).toLocaleString("en-IN")} combo</span>}
                                  </div>
                                )}
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
                    )}
                    {isNativeApp && (
                      <div className="space-y-1.5">
                        {order.items.map((item, i) => {
                          const n = parseNotes(item.productionNotes);
                          const size = item.sizeInches || n.size || "—";
                          const gsm = item.gsm ?? n.gsm ?? "—";
                          const sides = String(item.sides || n.sides || "—").replace(/_/g, " ");
                          return (
                            <div key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2">
                              <p className="truncate text-sm font-semibold text-slate-800">{item.productName}</p>
                              {item.productDescription && (
                                <p className="truncate text-[11px] font-normal text-slate-500">{item.productDescription}</p>
                              )}
                              <p className="text-[11px] font-mono text-blue-600">{item.sku}</p>
                              {item.offerCode && (
                                <div className={`inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold rounded px-1.5 py-0.5 ${item.offerCode.offerType === "COMBO_DISCOUNT" ? "bg-amber-50 text-amber-700" : "bg-purple-50 text-purple-700"}`}>
                                  {item.offerCode.offerType === "COMBO_DISCOUNT" ? "🎯" : "🎁"} {item.offerCode.code}
                                  {item.offerCode.discountAmount && <span className="font-normal"> −₹{Number(item.offerCode.discountAmount).toLocaleString("en-IN")} combo</span>}
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                <span><span className="text-slate-400">Size</span> <strong className="text-slate-700">{size}</strong></span>
                                <span><span className="text-slate-400">GSM</span> <strong className="text-slate-700">{gsm}</strong></span>
                                <span><span className="text-slate-400">Sides</span> <strong className="text-slate-700">{sides}</strong></span>
                                <span><span className="text-slate-400">Qty</span> <strong className="text-slate-700">{item.quantity}</strong></span>
                                <span><span className="text-slate-400">Rate</span> <strong className="text-slate-700">{fmt(item.unitPrice)}</strong></span>
                                <span>
                                  <span className="text-slate-400">Cost</span>{" "}
                                  {item.costTotal == null ? (
                                    <strong className="rounded-full bg-red-50 px-1.5 py-0.5 text-[11px] font-semibold text-red-600">No cost</strong>
                                  ) : (
                                    <strong className="text-slate-700">{fmt(item.costTotal)}</strong>
                                  )}
                                </span>
                                <span><span className="text-slate-400">Margin</span> <strong className={marginClass(item.marginPct)}>{item.marginPct == null ? "—" : `${item.marginPct.toFixed(1)}%`}</strong></span>
                                <span className="ml-auto"><span className="text-slate-400">Amount</span> <strong className="text-slate-900">{fmt(item.lineTotal)}</strong></span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Payment rows */}
                    {order.payments.length > 0 && (
                      <div className="rounded-lg border border-slate-100 bg-slate-50 divide-y divide-slate-100">
                        <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Payments</div>
                        {order.payments.map(payment => (
                          <div key={payment.id} className={cx(
                            `flex items-center justify-between px-3 py-1.5 ${payment.verificationStatus === "PENDING_VERIFICATION" ? "bg-orange-50" : ""}`,
                            `flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-1.5 ${payment.verificationStatus === "PENDING_VERIFICATION" ? "bg-orange-50" : ""}`
                          )}>
                            <div className={cx("flex items-center gap-3 text-xs text-slate-600", "flex flex-wrap items-center gap-2 text-xs text-slate-600")}>
                              <span className="font-mono text-slate-400">{new Date(payment.date).toLocaleDateString("en-IN")}</span>
                              <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">{payment.method}</span>
                              <span className="text-slate-500">{payment.accountName}</span>
                              {payment.referenceNumber && <span className="font-mono text-slate-400">Ref: {payment.referenceNumber}</span>}
                              {payment.verificationStatus === "PENDING_VERIFICATION" && (
                                <span className="rounded-full bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 font-semibold">⏳ Unverified</span>
                              )}
                              {payment.verificationStatus === "VERIFIED" && (
                                <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 font-semibold">✓ Verified</span>
                              )}
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
                      const hasMissingCost = order.items.some(item => item.costTotal == null && !item.offerCode);
                      const hasPendingPay  = order.hasPendingPayments ?? false;
                      const advancePct     = order.advancePct ?? (order.totalAmount > 0 ? (order.totalPaid / order.totalAmount) * 100 : 100);
                      const belowMinAdv    = advancePct < 40;
                      // Hard block: unverified payments (all users, no exceptions — matches
                      // backend's "hard block, all users" rule). Missing cost slabs is a
                      // soft block that the backend already bypasses for the super-admin
                      // (accounts.service.ts's approveOrder: `if (!isSuperAdmin && !isOverride)`)
                      // — this page already computes isSuperAdmin (see above), so mirror that
                      // here instead of disabling a button the backend would actually accept.
                      const hardBlocked    = hasPendingPay;
                      const canApprove     = !hardBlocked && (isSuperAdmin || !hasMissingCost);
                      return (
                        <>
                          {hasPendingPay && (
                            <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-300 px-3 py-2 text-xs text-orange-800">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span><strong>Unverified payment(s)</strong> — verify all receipts in <strong>Receipts Pending</strong> tab before approving this order.</span>
                            </div>
                          )}
                          {belowMinAdv && !hasPendingPay && (
                            <div className="flex items-center gap-2 rounded-lg bg-yellow-50 border border-yellow-300 px-3 py-2 text-xs text-yellow-800">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span><strong>{advancePct.toFixed(1)}% advance received</strong> — minimum 40% required. Only super-admin can approve below this limit.</span>
                            </div>
                          )}
                          {hasMissingCost && (
                            <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                              <span>
                                Cost data missing for some products.{" "}
                                <a href="/cost-table" className="underline font-semibold hover:text-red-900">
                                  Add cost slabs in Cost Table → Orders Without Cost
                                </a>{" "}
                                {isSuperAdmin ? "— you can still approve as super-admin, but margin/profit reporting will be incomplete for this order." : "before approving."}
                              </span>
                            </div>
                          )}
                          <div className={cx(
                            "flex items-center justify-between pt-2 border-t border-slate-100",
                            "flex flex-col gap-2 pt-2 border-t border-slate-100"
                          )}>
                            <div className={cx("text-xs text-slate-500 space-x-4", "flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500")}>
                              <span>Total: <strong>{fmt(order.totalAmount)}</strong></span>
                              <span>Paid: <strong className={order.totalPaid > 0 ? "text-green-600" : ""}>{fmt(order.totalPaid)}</strong></span>
                              <span>Balance: <strong className="text-red-500">{fmt(order.balanceDue)}</strong></span>
                              <span className={`font-semibold ${advancePct >= 40 ? "text-green-600" : "text-red-500"}`}>{advancePct.toFixed(0)}% advance</span>
                            </div>
                            <div className={cx("flex gap-2", "flex gap-2")}>
                              <button onClick={() => setRejectId(order.id)}
                                className={cx("px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50", "flex-1 px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50")}>
                                Reject
                              </button>
                              <button
                                onClick={() => canApprove && approveOrder(order.id)}
                                disabled={processing === order.id || !canApprove}
                                title={
                                  hasPendingPay ? "Verify all receipts first" :
                                  (hasMissingCost && !isSuperAdmin) ? "Add cost slabs for all products first" :
                                  belowMinAdv ? "Below 40% advance — only super-admin can approve" :
                                  undefined
                                }
                                className={`${cx("inline-flex items-center gap-1", "flex-1 inline-flex items-center justify-center gap-1")} px-3 py-1.5 text-xs rounded-lg ${
                                  !canApprove
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
                        <MobileSelect value={purchaseForm.vendorId} onChange={v => setPurchaseForm(f => ({ ...f, vendorId: v }))}
                          placeholder="Vendor"
                          options={[{ value: "", label: "Vendor" }, ...vendors.map(v => ({ value: v.id, label: v.name }))]}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                        <div className="grid grid-cols-2 gap-2">
                          <input value={purchaseForm.billNumber} onChange={e => setPurchaseForm(f => ({ ...f, billNumber: e.target.value }))} placeholder="Bill no" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <input type="number" value={purchaseForm.subtotal} onChange={e => setPurchaseForm(f => ({ ...f, subtotal: e.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <DateInput value={purchaseForm.billDate} onChange={e => setPurchaseForm(f => ({ ...f, billDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <DateInput value={purchaseForm.dueDate} onChange={e => setPurchaseForm(f => ({ ...f, dueDate: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <input type="number" value={purchaseForm.gstRatePct} onChange={e => setPurchaseForm(f => ({ ...f, gstRatePct: e.target.value }))} placeholder="GST %" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <MobileSelect value={purchaseForm.gstTreatment} onChange={v => setPurchaseForm(f => ({ ...f, gstTreatment: v }))}
                            placeholder="GST Treatment"
                            options={[{ value: "INTRA_STATE", label: "CGST + SGST" }, { value: "INTER_STATE", label: "IGST" }]}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                        </div>
                        <button onClick={createPurchaseBill} disabled={savingAccounting === "purchase"} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                          {savingAccounting === "purchase" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Add Bill
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h2 className="text-sm font-bold text-slate-800">Vendor Payment Out</h2>
                      <div className="mt-3 space-y-2">
                        <MobileSelect value={vendorPaymentForm.vendorId} onChange={v => setVendorPaymentForm(f => ({ ...f, vendorId: v, purchaseBillId: "" }))}
                          placeholder="Vendor"
                          options={[{ value: "", label: "Vendor" }, ...vendors.map(v => ({ value: v.id, label: v.name }))]}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                        <MobileSelect value={vendorPaymentForm.purchaseBillId} onChange={v => setVendorPaymentForm(f => ({ ...f, purchaseBillId: v }))}
                          placeholder="Against bill"
                          options={[{ value: "", label: "Against bill optional" }, ...purchaseBills.filter(b => !vendorPaymentForm.vendorId || b.vendorId === vendorPaymentForm.vendorId).map(b => ({ value: b.id, label: `${b.billNumber} · ${fmt(b.balanceAmount)}` }))]}
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                        <div className="grid grid-cols-2 gap-2">
                          <MobileSelect value={vendorPaymentForm.paymentAccountId} onChange={v => setVendorPaymentForm(f => ({ ...f, paymentAccountId: v }))}
                            placeholder="Account"
                            options={[{ value: "", label: "Account" }, ...paymentAccounts.map(a => ({ value: a.id, label: a.name }))]}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                          <input type="number" value={vendorPaymentForm.amount} onChange={e => setVendorPaymentForm(f => ({ ...f, amount: e.target.value }))} placeholder="Amount" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
                          <MobileSelect value={vendorPaymentForm.method} onChange={v => setVendorPaymentForm(f => ({ ...f, method: v }))}
                            placeholder="Method"
                            options={paymentMethods.map(m => ({ value: m, label: m.replace("_", " ") }))}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
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
                          <MobileSelect value={noteForm.noteType} onChange={v => setNoteForm(f => ({ ...f, noteType: v }))}
                            placeholder="Note Type"
                            options={[{ value: "CREDIT_NOTE", label: "Credit Note" }, { value: "DEBIT_NOTE", label: "Debit Note" }]}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                          <MobileSelect value={noteForm.partyType} onChange={v => setNoteForm(f => ({ ...f, partyType: v, invoiceId: "", purchaseBillId: "" }))}
                            placeholder="Party Type"
                            options={[{ value: "CUSTOMER", label: "Customer" }, { value: "VENDOR", label: "Vendor" }]}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                        </div>
                        {noteForm.partyType === "CUSTOMER" ? (
                          <MobileSelect value={noteForm.invoiceId} onChange={v => setNoteForm(f => ({ ...f, invoiceId: v }))}
                            placeholder="Invoice reference"
                            options={[{ value: "", label: "Invoice reference" }, ...salesInvoices.map(inv => ({ value: inv.id, label: `${inv.invoiceNumber} · ${inv.customerName}` }))]}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
                        ) : (
                          <MobileSelect value={noteForm.purchaseBillId} onChange={v => setNoteForm(f => ({ ...f, purchaseBillId: v }))}
                            placeholder="Purchase bill reference"
                            options={[{ value: "", label: "Purchase bill reference" }, ...purchaseBills.map(b => ({ value: b.id, label: `${b.billNumber} · ${b.vendorName}` }))]}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" />
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
                          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-2 text-left">Invoice</th><th className="px-3 py-2 text-left">Customer</th><th className="px-3 py-2 text-left">GSTIN</th><th className="px-3 py-2 text-right">GST</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2 text-center">WA</th></tr></thead>
                          <tbody className="divide-y divide-slate-100">
                            {salesInvoices.map(inv => <tr key={inv.id}><td className="px-3 py-2 font-semibold text-blue-700">{inv.invoiceNumber}</td><td className="px-3 py-2">{inv.customerName}</td><td className="px-3 py-2 font-mono text-slate-500">{inv.gstNumber || "—"}</td><td className="px-3 py-2 text-right">{fmt(inv.taxAmount)}</td><td className="px-3 py-2 text-right font-semibold">{fmt(inv.totalAmount)}</td><td className="px-3 py-2 text-right text-red-600">{fmt(inv.balanceAmount)}</td><td className="px-3 py-2 text-center">{inv.whatsappStatus}</td></tr>)}
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
                  <MobileSelect
                    value={outstandingStatus}
                    onChange={setOutstandingStatus}
                    placeholder="All Product Status"
                    options={[{ value: "", label: "All Product Status" }, ...outstandingStatuses.map(status => ({ value: status, label: productStatusLabels[status] ?? status.replace(/_/g, " ") }))]}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-400"
                  />
                  <MobileSelect
                    value={outstandingOrderStatus}
                    onChange={setOutstandingOrderStatus}
                    placeholder="Order Status"
                    options={[{ value: "READY_DELIVERED", label: "Ready / Delivered" }, { value: "", label: "All Order Status" }, ...outstandingOrderStatuses.map(status => ({ value: status, label: orderStatusLabels[status] ?? status.replace(/_/g, " ") }))]}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-400"
                  />
                  <MobileSelect
                    value={outstandingSeller}
                    onChange={setOutstandingSeller}
                    placeholder="All Sellers"
                    options={[{ value: "", label: "All Sellers" }, ...outstandingSellers.map(seller => ({ value: seller, label: seller }))]}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 outline-none focus:border-blue-400"
                  />
                </div>
              </div>

              {isNativeApp && (
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[11px] text-slate-400">{filteredOutstanding.length} customers</span>
                  <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                    <button onClick={() => setOutstandingCompact(true)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${outstandingCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Compact
                    </button>
                    <button onClick={() => setOutstandingCompact(false)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${!outstandingCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Table
                    </button>
                  </div>
                </div>
              )}

              {outstandingLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : filteredOutstanding.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <Check className="mx-auto mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm">No customer outstanding found</p>
                </div>
              ) : isNativeApp && outstandingCompact ? (
                <div className="space-y-2">
                  {filteredOutstanding.map(row => {
                    const customerOrderNos = row.orderNumbers.split(", ").filter(Boolean);
                    const customerCourierEntries = Object.values(orderCourierMap).filter(c => c.customerId === row.customerId);
                    const isExpanded = expandedOutstandingId === row.customerId;
                    const bookedCount = customerCourierEntries.filter(c => c.isCourierBooked).length;
                    return (
                      <div key={row.customerId} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                        <div className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate">{row.customerName}</p>
                              <p className="text-xs text-slate-400 truncate">{row.customerPhone || row.customerEmail || "No contact"}</p>
                              {bookedCount > 0 && (
                                <div className="flex items-center gap-1 mt-0.5">
                                  <PackageCheck className="h-3 w-3 text-orange-500" />
                                  <span className="text-[10px] text-orange-600 font-semibold">{bookedCount} COD booked</span>
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-slate-400">Outstanding</p>
                              <p className="text-sm font-bold text-red-600">{fmt(row.outstandingAmount)}</p>
                            </div>
                          </div>

                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                            <span className="text-slate-500">Seller <strong className="text-slate-700">{row.sellerNames || "—"}</strong></span>
                            <span className="text-slate-500">Orders <strong className="text-slate-700">{row.orderCount}</strong></span>
                            <span className="text-slate-500">Total <strong className="text-slate-700">{fmt(row.totalAmount)}</strong></span>
                            <span className="text-slate-500">Paid <strong className="text-green-700">{fmt(row.paidAmount)}</strong></span>
                            <span className="text-slate-500">Last <strong className="text-slate-700">{new Date(row.lastOrderDate).toLocaleDateString("en-IN")}</strong></span>
                          </div>

                          {((row.orderStatuses ?? "").length > 0 || (row.productStatuses ?? "").length > 0) && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {(row.orderStatuses ?? "").split(", ").filter(Boolean).map(status => (
                                <span key={`o-${status}`} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${orderStatusClass[status] ?? "bg-slate-100 text-slate-700"}`}>
                                  {orderStatusLabels[status] ?? status.replace(/_/g, " ")}
                                </span>
                              ))}
                              {(row.productStatuses ?? "").split(", ").filter(Boolean).map(status => (
                                <span key={`p-${status}`} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${productStatusClass[status] ?? "bg-slate-100 text-slate-700"}`}>
                                  {productStatusLabels[status] ?? status.replace(/_/g, " ")}
                                </span>
                              ))}
                            </div>
                          )}

                          <p className="mt-1.5 truncate text-[10px] font-mono text-slate-400">{row.orderNumbers}</p>

                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={() => setExpandedOutstandingId(isExpanded ? null : row.customerId)}
                              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
                            >
                              Courier / COD {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              onClick={() => sendBalanceReminder(row)}
                              disabled={!row.canSendReminder || sendingReminderId === row.customerId}
                              title={row.canSendReminder ? `Send for ${row.reminderOrderNumbers}` : "Needs phone and Ready/Delivered balance"}
                              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:bg-slate-200 disabled:text-slate-400"
                            >
                              {sendingReminderId === row.customerId ? <Loader2 className="h-3 w-3 animate-spin" /> : <MessageCircle className="h-3 w-3" />}
                              {row.reminderAmount > 0 ? fmt(row.reminderAmount) : "Send"}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3 pb-3 bg-orange-50 border-t border-orange-100 pt-2">
                            <div className="text-[11px] font-semibold text-orange-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                              <Truck className="h-3.5 w-3.5" />
                              Courier / COD Status per Order
                              {courierMapLoading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
                            </div>
                            <div className="space-y-1.5">
                              {customerOrderNos.length === 0 ? (
                                <p className="text-[11px] text-slate-400">No orders found</p>
                              ) : customerOrderNos.map(orderNo => {
                                const info = customerCourierEntries.find(c => c.orderNo === orderNo);
                                return (
                                  <div key={orderNo} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white border border-orange-100 px-2.5 py-2">
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
                                          className="ml-auto shrink-0 text-[10px] text-slate-400 hover:text-blue-600 underline"
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
                                          className="ml-auto shrink-0 inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600"
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
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={cx("overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm", "overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm")}>
                  <table className={cx("w-full text-xs", "w-full text-xs min-w-[900px]")}>
                    <thead className="border-b border-slate-200 bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600 w-6"></th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Seller</th>
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
                              <td className="px-3 py-2 text-slate-600">{row.sellerNames || "—"}</td>
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
                                <td colSpan={12} className="px-0 py-0 bg-orange-50 border-b border-orange-100">
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
                                          <div key={orderNo} className={cx(
                                            "flex items-center gap-3 rounded-lg bg-white border border-orange-100 px-3 py-2",
                                            "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-white border border-orange-100 px-2.5 py-2"
                                          )}>
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
                                                  className={cx("ml-auto text-[10px] text-slate-400 hover:text-blue-600 underline", "ml-auto shrink-0 text-[10px] text-slate-400 hover:text-blue-600 underline")}
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
                                                  className={cx("ml-auto inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600", "ml-auto shrink-0 inline-flex items-center gap-1 rounded-lg bg-orange-500 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-orange-600")}
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
                  <div className={cx(
                    "flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100",
                    "flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2 bg-slate-50 border-b border-slate-100"
                  )}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-blue-700">{order.orderNo}</span>
                      {order.isTest && <span className="rounded-full bg-amber-400 text-amber-900 px-1.5 py-0.5 text-xs font-bold">TEST</span>}
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(order.orderDate)}`}>{orderAge(order.orderDate)}</span>
                      <span className="font-semibold text-slate-800">{order.customerName}</span>
                      {order.salesAgentName && <span className="rounded-full bg-purple-50 text-purple-700 px-1.5 py-0.5 text-xs">{order.salesAgentName}</span>}
                      {order.paymentType && <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${order.paymentType === "COD" ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}`}>{order.paymentType}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                      <span className={`text-xs font-bold whitespace-nowrap ${moneyColor(order.balanceDue)}`}>Balance: {fmt(order.balanceDue)}</span>
                      <button onClick={() => setDispatchExpanded(dispatchExpanded === order.id ? null : order.id)}
                        className="p-1 rounded hover:bg-slate-200 shrink-0">
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
                      {/* Photos uploaded by sales in Book Shipment */}
                      {(order.dispatchProductPhoto || order.dispatchBillPhoto) && (
                        <div className="flex gap-3">
                          {order.dispatchProductPhoto && (
                            <a href={order.dispatchProductPhoto} target="_blank" rel="noreferrer" className="group">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Product Photo</p>
                              <img src={order.dispatchProductPhoto} alt="Product" className="h-20 w-20 rounded-lg border border-slate-200 object-cover group-hover:ring-2 group-hover:ring-brand-400" />
                            </a>
                          )}
                          {order.dispatchBillPhoto && (
                            <a href={order.dispatchBillPhoto} target="_blank" rel="noreferrer" className="group">
                              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Bill</p>
                              {order.dispatchBillPhoto.startsWith("data:application/pdf") ? (
                                <div className="h-20 w-20 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-[9px] text-slate-500 font-semibold group-hover:ring-2 group-hover:ring-brand-400">PDF</div>
                              ) : (
                                <img src={order.dispatchBillPhoto} alt="Bill" className="h-20 w-20 rounded-lg border border-slate-200 object-cover group-hover:ring-2 group-hover:ring-brand-400" />
                              )}
                            </a>
                          )}
                        </div>
                      )}
                      {/* Agent Notes */}
                      {order.notes && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                          <p className="font-semibold text-amber-800 text-[10px] uppercase tracking-wide mb-1">Agent Notes</p>
                          <p className="text-amber-900 whitespace-pre-wrap">{order.notes}</p>
                        </div>
                      )}
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setDispatchRejectId(order.id)} disabled={dispatchProcessing === order.id}
                          className="px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60">
                          Reject
                        </button>
                        <button onClick={() => approveDispatch(order.id)} disabled={dispatchProcessing === order.id}
                          className="inline-flex items-center gap-1 px-4 py-2 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60 font-semibold">
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

          {/* ── CANCELLATION APPROVAL TAB ── */}
          {tab === "cancellations" && (
            <div className="space-y-3">
              {cancelLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-red-500" /></div>
              ) : cancelOrders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No cancellation requests pending approval</p>
                </div>
              ) : cancelOrders.map(order => (
                <div key={order.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2 bg-red-50 border-b border-red-100">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-blue-700">{order.orderNo}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${order.isWholeOrder ? "bg-red-600 text-white" : "bg-orange-100 text-orange-700"}`}>
                        {order.isWholeOrder ? "Whole Order" : `${order.items.length} Item(s)`}
                      </span>
                      <span className="font-semibold text-slate-800">{order.customerName}</span>
                      {order.salesAgentName && <span className="rounded-full bg-purple-50 text-purple-700 px-1.5 py-0.5 text-xs">{order.salesAgentName}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-auto">
                      <span className="text-xs font-bold whitespace-nowrap text-red-600">Amount: {fmt(order.amountAffected)}</span>
                      <button onClick={() => setCancelExpanded(cancelExpanded === order.id ? null : order.id)}
                        className="p-1 rounded hover:bg-slate-200 shrink-0">
                        {cancelExpanded === order.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  {cancelExpanded === order.id && (
                    <div className="p-4 space-y-3">
                      <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs space-y-1">
                        <div className="flex justify-between"><span className="text-slate-500">Requested By</span><span className="font-semibold">{order.requestedByName || "—"}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Requested At</span><span className="font-semibold">{new Date(order.requestedAt).toLocaleString()}</span></div>
                        <div className="flex justify-between border-t border-slate-200 pt-1 mt-1"><span className="text-slate-700 font-semibold">Order Total</span><span className="font-semibold">{fmt(order.orderTotal)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-700 font-semibold">Amount Affected</span><span className="font-bold text-red-600">{fmt(order.amountAffected)}</span></div>
                      </div>
                      {order.reason && (
                        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs">
                          <p className="font-semibold text-amber-800 text-[10px] uppercase tracking-wide mb-1">Reason</p>
                          <p className="text-amber-900 whitespace-pre-wrap">{order.reason}</p>
                        </div>
                      )}
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
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setCancelRejectId(order.id)} disabled={cancelProcessing === order.id}
                          className="px-3 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-60">
                          Reject
                        </button>
                        <button onClick={() => approveCancellationRequest(order.id)} disabled={cancelProcessing === order.id}
                          className="inline-flex items-center gap-1 px-4 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 font-semibold">
                          {cancelProcessing === order.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                          Approve Cancellation
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
            <div className="space-y-6">
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
                  {/* ── SECTION 1: PENDING APPROVAL ── */}
                  {sampleOrders.filter(o => o.status === "PENDING_APPROVAL").length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-amber-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                        Pending Accounts Approval ({sampleOrders.filter(o => o.status === "PENDING_APPROVAL").length})
                      </h3>
                      <div className="space-y-3">
                        {sampleOrders.filter(o => o.status === "PENDING_APPROVAL").map(o => (
                          <div key={o.id} className="rounded-xl border-2 border-amber-200 bg-amber-50 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-bold bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full">📦 SAMPLE KIT</span>
                                  <span className="font-bold text-slate-800">{o.orderNumber}</span>
                                  <span className="text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                                </div>
                                <p className="text-sm font-semibold text-slate-700">{o.customer.businessName}</p>
                                <p className="text-xs text-slate-500">{o.customer.phone} · {o.salesAgentName ?? "—"}</p>
                                <p className="text-xs text-slate-500 mt-0.5">{[o.customer.address, o.customer.city, o.customer.state, o.customer.pincode].filter(Boolean).join(", ")}</p>
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
                                  ✅ PREPAID
                                </button>
                                <button
                                  onClick={() => setSamplePaymentChoice(prev => ({ ...prev, [o.id]: false }))}
                                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-semibold border-2 transition-colors ${samplePaymentChoice[o.id] === false || (samplePaymentChoice[o.id] === undefined && o.totalPaid === 0) ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-500"}`}>
                                  💵 COD
                                </button>
                              </div>
                            </div>
                            <div className="flex gap-3 mt-3">
                              <button
                                onClick={() => approveSampleOrder(o.id, samplePaymentChoice[o.id] ?? o.totalPaid > 0)}
                                disabled={sampleProcessing === o.id}
                                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                                {sampleProcessing === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
                                Approve → Ready for Dispatch
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

                  {/* ── SECTION 2: READY FOR DISPATCH ── */}
                  {sampleOrders.filter(o => o.status === "READY_FOR_DISPATCH" || o.status === "APPROVED").length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                        Ready for Dispatch ({sampleOrders.filter(o => o.status === "READY_FOR_DISPATCH" || o.status === "APPROVED").length})
                      </h3>
                      <div className="space-y-3">
                        {sampleOrders.filter(o => o.status === "READY_FOR_DISPATCH" || o.status === "APPROVED").map(o => (
                          <div key={o.id} className="rounded-xl border-2 border-blue-200 bg-blue-50 p-5">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${o.samplePaymentType === "PREPAID" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                    {o.samplePaymentType === "PREPAID" ? "✅ PREPAID" : "💵 COD"}
                                  </span>
                                  <span className="font-bold text-slate-800">{o.orderNumber}</span>
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">📦 SAMPLE KIT</span>
                                </div>
                                <p className="text-sm font-semibold text-slate-700">{o.customer.businessName}</p>
                                <p className="text-xs text-slate-500">{o.customer.phone} · {o.salesAgentName ?? "—"}</p>
                                <p className="text-xs text-slate-600 font-medium mt-0.5">📍 {[o.customer.address, o.customer.city, o.customer.state, o.customer.pincode].filter(Boolean).join(", ")}</p>
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {o.items.map((item, idx) => (
                                    <span key={idx} className="text-xs bg-white border border-blue-200 text-slate-600 px-2 py-0.5 rounded-full">
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
                            <div className="mt-4 flex gap-2">
                              <input
                                type="text"
                                placeholder="Tracking / AWB number (optional)"
                                value={sampleTrackingInputs[o.id] ?? ""}
                                onChange={e => setSampleTrackingInputs(prev => ({ ...prev, [o.id]: e.target.value }))}
                                className="flex-1 border border-blue-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                              />
                              <button
                                onClick={() => dispatchSampleOrder(o.id, sampleTrackingInputs[o.id])}
                                disabled={sampleProcessing === o.id}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50">
                                {sampleProcessing === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                                Mark Dispatched
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── SECTION 3: DISPATCHED HISTORY ── */}
                  {sampleOrders.filter(o => o.status === "DISPATCHED").length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-400" />
                        Dispatched ({sampleOrders.filter(o => o.status === "DISPATCHED").length})
                      </h3>
                      <div className="space-y-2">
                        {sampleOrders.filter(o => o.status === "DISPATCHED").map(o => (
                          <div key={o.id} className="rounded-xl border border-slate-200 bg-white p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${o.samplePaymentType === "PREPAID" ? "bg-green-100 text-green-700" : "bg-orange-100 text-orange-700"}`}>
                                  {o.samplePaymentType === "PREPAID" ? "✅ PREPAID" : "💵 COD"}
                                </span>
                                <div>
                                  <p className="font-semibold text-slate-800 text-sm">{o.orderNumber} · {o.customer.businessName}</p>
                                  <p className="text-xs text-slate-500">{o.items.map(i => `${i.productName} ×${i.quantity}`).join(", ")}</p>
                                  {o.notes && o.notes.startsWith("Tracking:") && (
                                    <p className="text-xs text-blue-600 font-medium mt-0.5">🚚 {o.notes}</p>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-100 text-slate-600">
                                ✅ Dispatched
                              </span>
                            </div>
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
              {isNativeApp && pendingPayments.length > 0 && (
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[11px] text-slate-400">{pendingPayments.length} receipts</span>
                  <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                    <button onClick={() => setReceiptsCompact(true)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${receiptsCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Compact
                    </button>
                    <button onClick={() => setReceiptsCompact(false)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${!receiptsCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Table
                    </button>
                  </div>
                </div>
              )}
              {receiptsLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : pendingPayments.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400">
                  <Check className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No receipts pending verification</p>
                </div>
              ) : isNativeApp && receiptsCompact ? (
                <div className="space-y-2">
                  {pendingPayments.map(p => (
                    <div key={p.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-blue-700 truncate">{p.orderNo}</p>
                          <p className="text-xs text-slate-600 truncate">{p.customerName}</p>
                          {p.customerPhone && <p className="text-[10px] text-slate-400 truncate">{p.customerPhone}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-slate-400">{new Date(p.paymentDate).toLocaleDateString("en-IN")}</p>
                          <p className="text-sm font-bold text-green-700">{fmt(p.amount)}</p>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">{p.method}</span>
                        <span className="text-slate-500">{p.paymentAccountName}</span>
                        {p.salesAgentName && <span className="text-slate-400">· {p.salesAgentName}</span>}
                      </div>
                      <input value={p.id === verifyUtrId ? verifyUtrValue : (utrDraft[p.id] ?? p.referenceNumber ?? "")}
                        onChange={e => {
                          setVerifyUtrValue(e.target.value);
                          setUtrDraft(d => ({ ...d, [p.id]: e.target.value }));
                        }}
                        onFocus={() => { setVerifyUtrId(p.id); setVerifyUtrValue(utrDraft[p.id] ?? p.referenceNumber ?? ""); }}
                        placeholder="UTR / Ref No"
                        className="mt-2 w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-blue-400 bg-white" />
                      <div className="mt-2 flex gap-1.5">
                        <button onClick={() => startEditPayment(p)} disabled={verifyingId === p.id || savingPaymentId === p.id}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-700 font-semibold disabled:opacity-60">
                          <Pencil className="h-3 w-3" />
                          Edit
                        </button>
                        <button onClick={() => openBankMatch(p)} disabled={verifyingId === p.id}
                          className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs bg-green-600 text-white rounded-lg disabled:opacity-60 font-semibold">
                          {verifyingId === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Match & Verify
                        </button>
                        <button onClick={() => setRejectPaymentId(p.id)}
                          className="px-2.5 py-1.5 text-xs border border-red-200 rounded-lg text-red-600 font-semibold">
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                    <span>Total Pending ({pendingPayments.length} receipts)</span>
                    <span className="text-green-700 font-bold">{fmt(pendingPayments.reduce((s, p) => s + p.amount, 0))}</span>
                  </div>
                </div>
              ) : (
                <div className={cx("rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden", "rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto")}>
                  <table className={cx("w-full text-xs", "w-full text-xs min-w-[900px]")}>
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
                <div className="space-y-3">
                  {isNativeApp && receiptHistory.length > 0 && (
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-[11px] text-slate-400">{receiptHistory.length} receipts</span>
                      <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                        <button onClick={() => setReceiptHistoryCompact(true)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${receiptHistoryCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                          Compact
                        </button>
                        <button onClick={() => setReceiptHistoryCompact(false)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${!receiptHistoryCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                          Table
                        </button>
                      </div>
                    </div>
                  )}
                  {historyLoading ? (
                    <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
                  ) : receiptHistory.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">No verified receipts yet.</div>
                  ) : isNativeApp && receiptHistoryCompact ? (
                    <div className="space-y-2">
                      {receiptHistory.map(p => (
                        <div key={p.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-bold text-blue-700 truncate">{p.orderNo}</p>
                              <p className="text-xs text-slate-600 truncate">{p.customerName}</p>
                              {p.customerPhone && <p className="text-[10px] text-slate-400 truncate">{p.customerPhone}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-slate-400">{new Date(p.paymentDate).toLocaleDateString("en-IN")}</p>
                              <p className="text-sm font-bold text-green-700">{fmt(p.amount)}</p>
                            </div>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">{p.method}</span>
                            <span className={`rounded-full px-2 py-0.5 font-semibold ${p.verificationStatus === "VERIFIED" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {p.verificationStatus}
                            </span>
                            <span className="text-slate-500">{p.paymentAccountName}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                            {p.salesAgentName && <span>Agent {p.salesAgentName}</span>}
                            {p.referenceNumber && <span className="font-mono">Ref {p.referenceNumber}</span>}
                            {p.verifiedByName && <span>By {p.verifiedByName}</span>}
                          </div>
                        </div>
                      ))}
                      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Total Verified ({receiptHistory.filter(p => p.verificationStatus === "VERIFIED").length} receipts)</span>
                        <span className="text-green-700 font-bold">{fmt(receiptHistory.filter(p => p.verificationStatus === "VERIFIED").reduce((s, p) => s + p.amount, 0))}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                    <table className={cx("w-full text-sm", "w-full text-sm min-w-[1000px]")}>
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
                    </div>
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
                <MobileSelect value={vendorFilter} onChange={setVendorFilter}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md outline-none bg-white"
                  placeholder="All Vendors"
                  options={[{ value: "", label: "All Vendors" }, ...uniqueVendors.map(v => ({ value: v, label: v }))]} />
                <MobileSelect value={paidFilter} onChange={v => setPaidFilter(v as "all" | "paid" | "unpaid")}
                  className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-md outline-none bg-white"
                  placeholder="All Status"
                  options={[
                    { value: "all", label: "All Status" },
                    { value: "unpaid", label: "Unpaid" },
                    { value: "paid", label: "Paid" },
                  ]} />
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">From:</span>
                  <DateInput value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="px-2 py-1.5 text-xs border border-slate-200 rounded-md outline-none" />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">To:</span>
                  <DateInput value={dateTo} onChange={e => setDateTo(e.target.value)}
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

              {/* Agent list view */}
              {!selectedAgent && (
                commissionLoading ? (
                  <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
                ) : commissionError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
                    <p className="text-sm font-semibold text-red-700 mb-1">Failed to load commission data</p>
                    <p className="text-xs text-red-500 font-mono break-all">{commissionError}</p>
                    <button onClick={() => loadCommissionSummary(commYear, commMonth)} className="mt-3 text-xs text-blue-600 underline">Retry</button>
                  </div>
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
                          {agent.monthsWithData.slice(0, 6).map(m => {
                            const isActive = m === `${commYear}-${String(commMonth).padStart(2,"0")}`;
                            return (
                              <button key={m} onClick={e => { e.stopPropagation(); setSelectedAgent(agent); setSelectedMonth(m); }}
                                className={`text-xs px-2 py-0.5 rounded-full border font-mono transition-colors ${
                                  isActive
                                    ? "bg-brand-600 text-white border-brand-600"
                                    : "border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600"
                                }`}>
                                {agent.verifiedMonths.includes(m) && (
                                  <span className={isActive ? "mr-0.5 text-green-300" : "mr-0.5 text-green-500"} title="Verified">✓</span>
                                )}
                                {agent.paidMonths.includes(m) && (
                                  <span className={isActive ? "mr-0.5 text-blue-200" : "mr-0.5 text-blue-600"} title="Paid">$</span>
                                )}
                                {m}
                              </button>
                            );
                          })}
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
                <div className="rounded-xl border border-slate-200 bg-white overflow-hidden w-full max-w-full min-w-0">
                  {/* Sheet header */}
                  <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-b border-green-200 px-6 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <button onClick={() => { setSelectedAgent(null); setSelectedMonth(""); setCommissionSheet(null); }}
                          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 mb-2">
                          <X className="h-3 w-3" /> Back to Agents
                        </button>
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
                        {selectedAgent.monthsWithData.map(m => {
                          const isActive = m === selectedMonth;
                          return (
                            <button key={m} onClick={() => setSelectedMonth(m)}
                              className={`text-xs px-2.5 py-1 rounded-full border font-mono transition-colors ${
                                isActive
                                  ? "bg-green-600 text-white border-green-600"
                                  : "border-slate-200 text-slate-600 hover:border-green-400 hover:text-green-700"
                              }`}>
                              {selectedAgent.verifiedMonths.includes(m) && (
                                <span className={isActive ? "mr-0.5 text-green-200" : "mr-0.5 text-green-500"} title="Verified">✓</span>
                              )}
                              {selectedAgent.paidMonths.includes(m) && (
                                <span className={isActive ? "mr-0.5 text-blue-200" : "mr-0.5 text-blue-600"} title="Paid">$</span>
                              )}
                              {m}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    {commissionSheet && commissionSheet.rows.length > 0 && (
                      <div className="flex justify-end gap-2 mt-3">
                        <button
                          onClick={downloadCommissionPdf}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" /> Download PDF
                        </button>
                        <button
                          onClick={downloadCommissionExcel}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3.5 w-3.5" /> Download Excel
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Verification status banner — visible to ADMIN and ACCOUNTS only */}
                  {canSeeDetails && commissionSheet && (
                    <div className={`px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b ${
                      commissionSheet.verification
                        ? "bg-green-50 border-green-200"
                        : "bg-amber-50 border-amber-200"
                    }`}>
                      <div className="flex flex-wrap items-center gap-2">
                        {commissionSheet.verification ? (
                          <>
                            <span className="text-green-700 text-sm font-bold">✓ Verified</span>
                            <span className="text-green-600 text-xs">
                              by {commissionSheet.verification.verifiedBy} on{" "}
                              {new Date(commissionSheet.verification.verifiedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-amber-700 text-sm font-bold">⚠ Not Verified</span>
                            <span className="text-amber-600 text-xs">This commission sheet has not been verified yet</span>
                          </>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={handleVerifyCommission}
                          disabled={verifying}
                          className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                            commissionSheet.verification
                              ? "border-red-300 text-red-700 hover:bg-red-50"
                              : "border-green-400 text-green-700 bg-white hover:bg-green-50"
                          }`}>
                          {verifying ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : commissionSheet.verification ? (
                            <X className="h-3 w-3" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          {verifying ? "Saving..." : commissionSheet.verification ? "Unverify" : "Verify"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Paid status banner — only meaningful once verified */}
                  {canSeeDetails && commissionSheet && commissionSheet.verification && (
                    <div className={`px-6 py-3 flex flex-wrap items-center justify-between gap-3 border-b ${
                      commissionSheet.verification.paid ? "bg-blue-50 border-blue-200" : "bg-slate-50 border-slate-200"
                    }`}>
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        {commissionSheet.verification.paid ? (
                          <>
                            <span className="shrink-0 text-blue-700 text-sm font-bold flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" /> Paid</span>
                            <span className="text-blue-600 text-xs break-words">
                              {commissionSheet.verification.paidTransactions.map(t => (
                                <span key={t.id}>
                                  {t.description} · {fmt(t.amount)} · {new Date(t.txnDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                                </span>
                              ))}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-500 text-xs">Not marked as paid yet — total payable {fmt(commissionSheet.totalPayable)}</span>
                        )}
                      </div>
                      {isAdmin && (
                        <button
                          onClick={commissionSheet.verification.paid ? handleUnmarkCommissionPaid : openCommissionBankMatch}
                          disabled={markingCommissionPaid}
                          className={`shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                            commissionSheet.verification.paid
                              ? "border-red-300 text-red-700 hover:bg-red-50"
                              : "border-blue-400 text-blue-700 bg-white hover:bg-blue-50"
                          }`}>
                          {markingCommissionPaid ? <Loader2 className="h-3 w-3 animate-spin" /> : <DollarSign className="h-3 w-3" />}
                          {markingCommissionPaid ? "Saving..." : commissionSheet.verification.paid ? "Mark as Unpaid" : "Mark as Paid"}
                        </button>
                      )}
                    </div>
                  )}

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
                          <p className="text-sm text-slate-500 mb-1">Total Sales</p>
                          <p className="text-lg font-bold text-slate-800">₹{commissionSheet.saleTotal.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="p-4 border-r border-slate-100 text-center">
                          <p className="text-sm text-slate-500 mb-1">Commission ({commissionSheet.commissionPct}%)</p>
                          <p className="text-lg font-bold text-blue-700">₹{commissionSheet.commissionTotal.toLocaleString("en-IN")}</p>
                        </div>
                        <div className="p-4 border-r border-slate-100 text-center">
                          <p className="text-sm text-slate-500 mb-1">Bonus</p>
                          <p className={`text-lg font-bold ${commissionSheet.bonus > 0 ? "text-green-700" : "text-slate-400"}`}>
                            ₹{commissionSheet.bonus.toLocaleString("en-IN")}
                          </p>
                          <p className="text-xs text-slate-400">
                            {commissionSheet.saleTotal < 115000 ? `Need ₹${(115000 - commissionSheet.saleTotal).toLocaleString("en-IN")} more` :
                             commissionSheet.saleTotal < 200000 ? "₹1k (min met)" :
                             commissionSheet.saleTotal < 300000 ? "₹2k (₹2L met)" : "₹3k+ tier"}
                          </p>
                        </div>
                        <div className="p-4 text-center bg-green-50">
                          <p className="text-sm text-green-700 mb-1 font-semibold">TOTAL PAYABLE</p>
                          <p className="text-2xl font-bold text-green-700">₹{commissionSheet.totalPayable.toLocaleString("en-IN")}</p>
                        </div>
                      </div>

                      {/* Below-threshold rate warning */}
                      {commissionSheet.saleTotal < 115000 && (commissionSheet.agentCategory === "A" || commissionSheet.agentCategory === "B") && (
                        <div className="px-4 py-2 bg-orange-50 border-b border-orange-200 flex items-center gap-2 text-xs text-orange-700">
                          <span className="font-bold">⚠ Below ₹1,15,000 threshold —</span>
                          <span>
                            {commissionSheet.agentCategory === "A"
                              ? "Category A rate reduced to 7% (normal: 10%/15%)"
                              : "Category B rate reduced to 5% (normal: 10%)"}
                          </span>
                          <span className="ml-auto text-orange-500">Need ₹{(115000 - commissionSheet.saleTotal).toLocaleString("en-IN")} more for full rate</span>
                        </div>
                      )}

                      {/* Bonus tiers info */}
                      <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex flex-wrap gap-3 text-xs text-amber-700">
                        <span className="font-semibold">Bonus tiers:</span>
                        <span className={commissionSheet.saleTotal >= 115000 ? "font-bold text-green-700" : ""}>₹1L 15K → ₹1,000</span>
                        <span className={commissionSheet.saleTotal >= 200000 ? "font-bold text-green-700" : ""}>₹2L → ₹2,000</span>
                        <span className={commissionSheet.saleTotal >= 300000 ? "font-bold text-green-700" : ""}>₹3L → ₹3,000</span>
                        <span className="text-amber-500">(+₹1,000 per ₹1L above ₹1L)</span>
                      </div>

                      {isNativeApp && (
                        <div className="flex items-center justify-end gap-1.5 px-4 pt-2">
                          <span className="text-[11px] text-slate-400">{commissionSheet.rows.length} items</span>
                          <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                            <button onClick={() => setCommissionCompact(true)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${commissionCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                              Compact
                            </button>
                            <button onClick={() => setCommissionCompact(false)}
                              className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${!commissionCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                              Table
                            </button>
                          </div>
                        </div>
                      )}

                      {isNativeApp && commissionCompact ? (
                        <div className="space-y-2 p-3">
                          {commissionSheet.rows.map((row, i) => (
                            <div key={i} className={`rounded-xl border border-slate-200 bg-white p-3 ${!row.hasCost ? "opacity-60" : ""}`}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="break-words font-mono text-xs text-blue-700">{row.invoiceNo}</p>
                                  <p className="text-sm font-bold text-slate-800">{row.partyName}</p>
                                </div>
                                <span className="shrink-0 text-[11px] text-slate-400">
                                  {new Date(row.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                                </span>
                              </div>

                              <p className="mt-1 text-xs text-slate-600">{row.itemName}</p>

                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {row.sizeInches && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">{row.sizeInches}"</span>
                                )}
                                {(row.gsm || row.sides) && (
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                    {row.gsm ? `${row.gsm}GSM` : ""}{row.gsm && row.sides ? " · " : ""}
                                    {row.sides === "SINGLE_SIDE" ? "1S" : row.sides === "DOUBLE_SIDE" ? "2S" : ""}
                                  </span>
                                )}
                                {canSeeDetails && row.orderStatus && (
                                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                    row.orderStatus === "DELIVERED" ? "bg-green-50 text-green-700" :
                                    row.orderStatus === "DISPATCHED" || row.orderStatus === "PARTIALLY_DISPATCHED" ? "bg-blue-50 text-blue-700" :
                                    row.orderStatus === "IN_PRODUCTION" || row.orderStatus === "READY_FOR_DISPATCH" ? "bg-purple-50 text-purple-700" :
                                    row.orderStatus === "PENDING_DISPATCH_APPROVAL" ? "bg-orange-50 text-orange-600" :
                                    row.orderStatus === "CANCELLED" ? "bg-red-50 text-red-600" :
                                    "bg-slate-50 text-slate-500"
                                  }`}>
                                    {row.orderStatus.replace(/_/g, " ")}
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2 text-xs">
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Qty</span>
                                  <span className="font-mono font-semibold text-slate-700">{row.quantity.toLocaleString("en-IN")}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-400">Amount</span>
                                  <span className="font-mono font-semibold text-slate-800">₹{row.amount.toLocaleString("en-IN")}</span>
                                </div>
                                {canSeeDetails && (
                                  <>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Rate</span>
                                      <span className="font-mono text-slate-600">
                                        {row.ratePerUnit != null ? `₹${row.ratePerUnit.toLocaleString("en-IN", { maximumFractionDigits: 2 })}` : "—"}
                                      </span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Disc%</span>
                                      {row.ratePerUnit != null ? (
                                        row.discountPct > 0 ? (
                                          <span className={`font-semibold ${row.discountPct > 5 ? "text-red-600" : "text-amber-600"}`}>-{row.discountPct.toFixed(1)}%</span>
                                        ) : (
                                          <span className="text-green-600">No disc</span>
                                        )
                                      ) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Cost</span>
                                      <span className="font-mono text-slate-500">{row.cost != null ? `₹${row.cost.toLocaleString("en-IN")}` : "—"}</span>
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Gr. Profit</span>
                                      {row.grossProfit != null ? (
                                        <span className={`font-mono font-semibold ${row.grossProfit >= 0 ? "text-green-700" : "text-red-600"}`}>₹{row.grossProfit.toLocaleString("en-IN")}</span>
                                      ) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Margin</span>
                                      {row.marginPct != null ? (
                                        <span className={`font-semibold ${row.marginPct >= 35 ? "text-green-700" : row.marginPct >= 25 ? "text-amber-600" : "text-red-600"}`}>{row.marginPct.toFixed(1)}%</span>
                                      ) : <span className="text-slate-300">—</span>}
                                    </div>
                                    <div className="flex justify-between">
                                      <span className="text-slate-400">Balance Due</span>
                                      {row.balanceDue > 0 ? (
                                        <span className="font-mono font-semibold text-red-600">₹{row.balanceDue.toLocaleString("en-IN")}</span>
                                      ) : (
                                        <span className="font-semibold text-green-600">✓ Paid</span>
                                      )}
                                    </div>
                                  </>
                                )}
                              </div>

                              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                                <span className="text-xs font-semibold text-slate-500">
                                  {row.hasCost ? <>Rate <span className="font-bold text-green-700">{row.commissionPct}%</span></> : "No cost slab"}
                                </span>
                                <div className="flex items-center gap-1">
                                  {row.hasCost ? (
                                    savingCommRow === i ? (
                                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                                    ) : editingCommRow === i ? (
                                      <div className="flex items-center gap-1">
                                        <span className="text-xs text-slate-400">₹</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className="w-20 rounded border border-blue-400 bg-white px-1 py-1 text-right font-mono text-sm text-blue-800 outline-none"
                                          value={editCommValue}
                                          onChange={e => setEditCommValue(e.target.value)}
                                          autoFocus
                                          onKeyDown={e => {
                                            if (e.key === "Enter") {
                                              const v = parseFloat(editCommValue);
                                              if (!isNaN(v) && v >= 0) void saveCommissionOverride(row, i, v);
                                              setEditingCommRow(null);
                                            }
                                            if (e.key === "Escape") { cancelledCommEditRef.current = true; setEditingCommRow(null); }
                                          }}
                                          onBlur={e => {
                                            if (cancelledCommEditRef.current) { cancelledCommEditRef.current = false; return; }
                                            const relatedTarget = e.relatedTarget as HTMLElement | null;
                                            if (relatedTarget?.closest('[data-comm-edit-btn="true"]')) return;
                                            const v = parseFloat(editCommValue);
                                            if (!isNaN(v) && v >= 0) void saveCommissionOverride(row, i, v);
                                            setEditingCommRow(null);
                                          }}
                                        />
                                        <button
                                          data-comm-edit-btn="true"
                                          onClick={() => {
                                            const v = parseFloat(editCommValue);
                                            if (!isNaN(v) && v >= 0) void saveCommissionOverride(row, i, v);
                                            setEditingCommRow(null);
                                          }}
                                          className="p-0.5 text-green-600" title="Save"
                                        ><Check className="h-4 w-4" /></button>
                                        <button
                                          data-comm-edit-btn="true"
                                          onClick={() => { cancelledCommEditRef.current = true; setEditingCommRow(null); }}
                                          className="p-0.5 text-red-400" title="Cancel"
                                        ><X className="h-4 w-4" /></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1">
                                        <span className={`font-mono text-sm font-bold ${row.isOverridden ? "text-purple-700" : "text-blue-700"}`}
                                          title={row.isOverridden ? `Corrected by ${row.overriddenBy ?? "admin"}${row.overriddenAt ? " on " + new Date(row.overriddenAt).toLocaleDateString("en-IN") : ""} — was ₹${row.calculatedCommissionAmt.toLocaleString("en-IN")}` : undefined}>
                                          ₹{row.commissionAmt.toLocaleString("en-IN")}
                                          {row.isOverridden && <span className="ml-0.5 text-xs text-purple-400">✎</span>}
                                        </span>
                                        {isAdmin && (
                                          <>
                                            <button
                                              onClick={() => { setEditingCommRow(i); setEditCommValue(String(row.commissionAmt)); }}
                                              className="p-0.5 text-slate-300 hover:text-blue-500" title="Edit commission"
                                            ><Pencil className="h-3.5 w-3.5" /></button>
                                            {row.isOverridden && (
                                              <button
                                                onClick={() => void clearCommissionOverride(row, i)}
                                                className="p-0.5 text-slate-300 hover:text-red-500"
                                                title={`Revert to calculated (₹${row.calculatedCommissionAmt.toLocaleString("en-IN")})`}
                                              ><X className="h-3.5 w-3.5" /></button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )
                                  ) : <span className="text-sm text-slate-300">—</span>}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                      <div className="w-full overflow-hidden">
                        <table className="w-full" style={{ fontSize: "11px", borderCollapse: "collapse", tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: "6%" }} />
                            <col style={{ width: "6%" }} />
                            <col style={{ width: "13%" }} />
                            <col style={{ width: "12%" }} />
                            <col style={{ width: "7%" }} />
                            {canSeeDetails && <col style={{ width: "7%" }} />}
                            <col style={{ width: "4%" }} />
                            <col style={{ width: "6%" }} />
                            {canSeeDetails && <col style={{ width: "6%" }} />}
                            {canSeeDetails && <col style={{ width: "4%" }} />}
                            {canSeeDetails && <col style={{ width: "5%" }} />}
                            {canSeeDetails && <col style={{ width: "5%" }} />}
                            {canSeeDetails && <col style={{ width: "4%" }} />}
                            <col style={{ width: "4%" }} />
                            {canSeeDetails && <col style={{ width: "5%" }} />}
                            <col style={{ width: "6%" }} />
                          </colgroup>
                          <thead className="bg-slate-700 text-white">
                            <tr>
                              <th className="px-1 py-1.5 text-left font-semibold">Date</th>
                              <th className="px-1 py-1.5 text-left font-semibold">Invoice</th>
                              <th className="px-1 py-1.5 text-left font-semibold">Party Name</th>
                              <th className="px-1 py-1.5 text-left font-semibold">Item</th>
                              <th className="px-1 py-1.5 text-left font-semibold">Size / GSM</th>
                              {canSeeDetails && <th className="px-1 py-1.5 text-left font-semibold">Order Status</th>}
                              <th className="px-1 py-1.5 text-right font-semibold">Qty</th>
                              <th className="px-1 py-1.5 text-right font-semibold">Amount</th>
                              {canSeeDetails && <th className="px-1 py-1.5 text-right font-semibold">Rate Total</th>}
                              {canSeeDetails && <th className="px-1 py-1.5 text-right font-semibold">Disc%</th>}
                              {canSeeDetails && <th className="px-1 py-1.5 text-right font-semibold">Cost</th>}
                              {canSeeDetails && <th className="px-1 py-1.5 text-right font-semibold">Gr. Profit</th>}
                              {canSeeDetails && <th className="px-1 py-1.5 text-right font-semibold">Margin</th>}
                              <th className="px-1 py-1.5 text-right font-semibold">Rate%</th>
                              {canSeeDetails && <th className="px-1 py-1.5 text-right font-semibold">Balance Due</th>}
                              <th className="px-1 py-1.5 text-right font-semibold">Commission</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {commissionSheet.rows.map((row, i) => (
                              <tr key={i} className={`hover:bg-slate-50 ${!row.hasCost ? "opacity-60" : ""}`}>
                                <td className="px-1 py-1 text-slate-500 break-words">
                                  {new Date(row.date).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                                </td>
                                <td className="px-1 py-1 font-mono text-blue-700 break-words">{row.invoiceNo}</td>
                                <td className="px-1 py-1 text-slate-700 truncate" title={row.partyName}>{row.partyName}</td>
                                <td className="px-1 py-1 text-slate-700 truncate" title={row.itemName}>{row.itemName}</td>
                                <td className="px-1 py-1 break-words">
                                  <div className="flex flex-col" style={{ gap: "1px" }}>
                                    {row.sizeInches && <span className="font-semibold text-slate-800">{row.sizeInches}"</span>}
                                    <span className="text-slate-500">
                                      {row.gsm ? `${row.gsm}GSM` : ""}
                                      {row.gsm && row.sides ? " · " : ""}
                                      {row.sides === "SINGLE_SIDE" ? "1S" : row.sides === "DOUBLE_SIDE" ? "2S" : ""}
                                    </span>
                                    {!row.sizeInches && !row.gsm && !row.sides && <span className="text-slate-300">—</span>}
                                  </div>
                                </td>
                                {canSeeDetails && (
                                  <td className="px-1 py-1 break-words">
                                    {row.orderStatus ? (
                                      <span className={`font-semibold ${
                                        row.orderStatus === "DELIVERED" ? "text-green-700" :
                                        row.orderStatus === "DISPATCHED" || row.orderStatus === "PARTIALLY_DISPATCHED" ? "text-blue-700" :
                                        row.orderStatus === "IN_PRODUCTION" || row.orderStatus === "READY_FOR_DISPATCH" ? "text-purple-700" :
                                        row.orderStatus === "PENDING_DISPATCH_APPROVAL" ? "text-orange-600" :
                                        row.orderStatus === "CANCELLED" ? "text-red-600" :
                                        "text-slate-500"
                                      }`}>
                                        {row.orderStatus.replace(/_/g, " ")}
                                      </span>
                                    ) : <span className="text-slate-300">—</span>}
                                  </td>
                                )}
                                <td className="px-1 py-1 text-right font-mono text-slate-700" style={{ fontSize: "12px" }}>{row.quantity.toLocaleString("en-IN")}</td>
                                <td className="px-1 py-1 text-right font-mono font-semibold text-slate-800 break-words" style={{ fontSize: "12px" }}>₹{row.amount.toLocaleString("en-IN")}</td>
                                {canSeeDetails && (
                                  <td className="px-1 py-1 text-right font-mono text-slate-600 break-words">
                                    {row.ratePerUnit != null
                                      ? `₹${row.ratePerUnit.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
                                      : <span className="text-slate-300">—</span>}
                                  </td>
                                )}
                                {canSeeDetails && (
                                  <td className="px-1 py-1 text-right break-words">
                                    {row.ratePerUnit != null ? (
                                      row.discountPct > 0 ? (
                                        <span className={`font-semibold ${row.discountPct > 5 ? "text-red-600" : "text-amber-600"}`}>
                                          -{row.discountPct.toFixed(1)}%
                                        </span>
                                      ) : (
                                        <span className="text-green-600 text-xs">No disc</span>
                                      )
                                    ) : <span className="text-slate-300">—</span>}
                                  </td>
                                )}
                                {canSeeDetails && (
                                  <td className="px-1 py-1 text-right font-mono text-slate-500 break-words">
                                    {row.cost != null ? `₹${row.cost.toLocaleString("en-IN")}` : <span className="text-slate-300">—</span>}
                                  </td>
                                )}
                                {canSeeDetails && (
                                  <td className="px-1 py-1 text-right font-mono font-semibold break-words">
                                    {row.grossProfit != null ? (
                                      <span className={row.grossProfit >= 0 ? "text-green-700" : "text-red-600"}>
                                        ₹{row.grossProfit.toLocaleString("en-IN")}
                                      </span>
                                    ) : <span className="text-slate-300">—</span>}
                                  </td>
                                )}
                                {canSeeDetails && (
                                  <td className="px-1 py-1 text-right font-semibold break-words">
                                    {row.marginPct != null ? (
                                      <span className={row.marginPct >= 35 ? "text-green-700" : row.marginPct >= 25 ? "text-amber-600" : "text-red-600"}>
                                        {row.marginPct.toFixed(1)}%
                                      </span>
                                    ) : <span className="text-slate-300">—</span>}
                                  </td>
                                )}
                                <td className="px-1 py-1 text-right break-words">
                                  {row.hasCost ? (
                                    <span className="font-bold text-green-700">{row.commissionPct}%</span>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </td>
                                {canSeeDetails && (
                                  <td className="px-1 py-1 text-right font-mono font-semibold break-words">
                                    {row.balanceDue > 0 ? (
                                      <span className="text-red-600">₹{row.balanceDue.toLocaleString("en-IN")}</span>
                                    ) : (
                                      <span className="text-green-600">✓ Paid</span>
                                    )}
                                  </td>
                                )}
                                <td className="px-1 py-1 text-right font-mono font-bold text-blue-700 break-words" style={{ fontSize: "12px" }}>
                                  {row.hasCost ? (
                                    savingCommRow === i ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400 inline-block" />
                                    ) : editingCommRow === i ? (
                                      <div className="flex items-center gap-1 justify-end">
                                        <span className="text-slate-400 text-xs">₹</span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          className="w-24 text-right border border-blue-400 rounded px-1 py-0.5 font-mono outline-none bg-white text-blue-800"
                                          style={{ fontSize: "14px" }}
                                          value={editCommValue}
                                          onChange={e => setEditCommValue(e.target.value)}
                                          autoFocus
                                          onKeyDown={e => {
                                            if (e.key === "Enter") {
                                              const v = parseFloat(editCommValue);
                                              if (!isNaN(v) && v >= 0) void saveCommissionOverride(row, i, v);
                                              setEditingCommRow(null);
                                            }
                                            if (e.key === "Escape") { cancelledCommEditRef.current = true; setEditingCommRow(null); }
                                          }}
                                          onBlur={e => {
                                            // Clicking the Save/Cancel buttons also blurs the input — let
                                            // their own onClick handlers run first via a timeout, and skip
                                            // saving if Escape already cancelled this edit.
                                            if (cancelledCommEditRef.current) { cancelledCommEditRef.current = false; return; }
                                            const relatedTarget = e.relatedTarget as HTMLElement | null;
                                            if (relatedTarget?.closest('[data-comm-edit-btn="true"]')) return;
                                            const v = parseFloat(editCommValue);
                                            if (!isNaN(v) && v >= 0) void saveCommissionOverride(row, i, v);
                                            setEditingCommRow(null);
                                          }}
                                        />
                                        <button
                                          data-comm-edit-btn="true"
                                          onClick={() => {
                                            const v = parseFloat(editCommValue);
                                            if (!isNaN(v) && v >= 0) void saveCommissionOverride(row, i, v);
                                            setEditingCommRow(null);
                                          }}
                                          className="text-green-600 hover:text-green-800 p-0.5"
                                          title="Save"
                                        ><Check className="h-3 w-3" /></button>
                                        <button
                                          data-comm-edit-btn="true"
                                          onClick={() => { cancelledCommEditRef.current = true; setEditingCommRow(null); }}
                                          className="text-red-400 hover:text-red-600 p-0.5"
                                          title="Cancel"
                                        ><X className="h-3 w-3" /></button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-1 justify-end group">
                                        <span className={row.isOverridden ? "text-purple-700" : ""}
                                          title={row.isOverridden ? `Corrected by ${row.overriddenBy ?? "admin"}${row.overriddenAt ? " on " + new Date(row.overriddenAt).toLocaleDateString("en-IN") : ""} — was ₹${row.calculatedCommissionAmt.toLocaleString("en-IN")}` : undefined}>
                                          ₹{row.commissionAmt.toLocaleString("en-IN")}
                                          {row.isOverridden && <span className="text-purple-400 text-xs ml-0.5">✎</span>}
                                        </span>
                                        {isAdmin && (
                                          <>
                                            <button
                                              onClick={() => {
                                                setEditingCommRow(i);
                                                setEditCommValue(String(row.commissionAmt));
                                              }}
                                              className="opacity-0 group-hover:opacity-100 ml-0.5 text-slate-300 hover:text-blue-500 transition-opacity"
                                              title="Edit commission"
                                            ><Pencil className="h-3 w-3" /></button>
                                            {row.isOverridden && (
                                              <button
                                                onClick={() => void clearCommissionOverride(row, i)}
                                                className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity"
                                                title={`Revert to calculated (₹${row.calculatedCommissionAmt.toLocaleString("en-IN")})`}
                                              ><X className="h-3 w-3" /></button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )
                                  ) : (
                                    <span className="text-slate-300 font-normal">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-100 border-t-2 border-slate-300" style={{ fontSize: "11.5px" }}>
                            <tr>
                              {/* Date Invoice Party Item Specs [Status] Qty = 6 or 7 */}
                              <td colSpan={canSeeDetails ? 7 : 6} className="px-1 py-1.5 font-bold text-slate-700">TOTAL</td>
                              <td className="px-1 py-1.5 text-right font-bold text-slate-800 font-mono break-words" style={{ fontSize: "12.5px" }}>₹{commissionSheet.saleTotal.toLocaleString("en-IN")}</td>
                              {canSeeDetails && <td colSpan={5} className="px-1 py-1"></td>}
                              <td className="px-1 py-1.5 text-right font-bold text-slate-600">{commissionSheet.commissionPct}%</td>
                              {canSeeDetails && <td className="px-1 py-1"></td>}
                              <td className="px-1 py-1.5 text-right font-bold font-mono break-words" style={{ fontSize: "12.5px" }}>
                                <span className={commissionSheet.rows.some(r => r.isOverridden) ? "text-purple-700" : "text-blue-700"}>
                                  ₹{commissionSheet.commissionTotal.toLocaleString("en-IN")}
                                </span>
                              </td>
                            </tr>
                            <tr className="bg-green-50 border-t border-green-200">
                              <td colSpan={canSeeDetails ? 15 : 8} className="px-1 py-1.5 font-bold text-slate-700">BONUS</td>
                              <td className="px-1 py-1.5 text-right font-bold text-green-700 font-mono break-words" style={{ fontSize: "12.5px" }}>₹{commissionSheet.bonus.toLocaleString("en-IN")}</td>
                            </tr>
                            <tr className="bg-green-100 border-t border-green-300">
                              <td colSpan={canSeeDetails ? 15 : 8} className="px-1 py-1.5 font-bold text-green-800">TOTAL PAYABLE</td>
                              <td className="px-1 py-1.5 text-right font-bold font-mono break-words" style={{ fontSize: "13px" }}>
                                <span className={commissionSheet.rows.some(r => r.isOverridden) ? "text-purple-800" : "text-green-800"}>
                                  ₹{commissionSheet.totalPayable.toLocaleString("en-IN")}
                                </span>
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                      )}
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

          {/* ── PAYMENT VERIFICATION TAB ── */}
          {tab === "payment_verification" && (
            <div className="space-y-2">
              <datalist id="vendor-expense-options">
                {vendorExpenseOptions.map(name => <option key={name} value={name} />)}
              </datalist>
              {pvSelectedIds.size > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs">
                  <span className="font-semibold text-blue-800">{pvSelectedIds.size} selected</span>
                  {canCheckPayments && (
                    <button onClick={handleBulkCheck} disabled={pvBulkProcessing}
                      className="px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                      {pvBulkProcessing ? "..." : "Bulk Check"}
                    </button>
                  )}
                  {isSuperAdmin && (
                    <button onClick={handleBulkVerify} disabled={pvBulkProcessing}
                      className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                      {pvBulkProcessing ? "..." : "Bulk Verify"}
                    </button>
                  )}
                  {canCheckPayments && (
                    <button onClick={handleBulkUndo} disabled={pvBulkProcessing}
                      className="px-2.5 py-1 rounded-md border border-red-300 bg-red-50 text-red-700 text-xs font-semibold hover:bg-red-100 disabled:opacity-50">
                      {pvBulkProcessing ? "..." : "Bulk Undo"}
                    </button>
                  )}
                  <button onClick={() => setPvSelectedIds(new Set())} className="ml-auto text-slate-500 hover:text-slate-700 font-medium">
                    Clear selection
                  </button>
                </div>
              )}
              {isNativeApp && pvQueue.length > 0 && (
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[11px] text-slate-400">{pvQueue.length} entries</span>
                  <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                    <button onClick={() => setPaymentVerificationCompact(true)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${paymentVerificationCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Compact
                    </button>
                    <button onClick={() => setPaymentVerificationCompact(false)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${!paymentVerificationCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Table
                    </button>
                  </div>
                </div>
              )}
              {pvQueueLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
              ) : pvQueue.length === 0 ? (
                <div className="rounded-xl border border-slate-300 p-10 text-center text-slate-400">Nothing waiting on verification right now.</div>
              ) : isNativeApp && paymentVerificationCompact ? (
                <div className="space-y-2">
                  {pvQueue.slice((pvPage - 1) * PV_PAGE_SIZE, pvPage * PV_PAGE_SIZE).map(entry => (
                    <div key={entry.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-3">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={pvSelectedIds.has(entry.id)}
                          disabled={!pvIsSelectable(entry)}
                          title={!pvIsSelectable(entry) ? "Add a Vendor/Expense before selecting this entry" : undefined}
                          onChange={() => togglePvSelect(entry.id)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="break-words text-sm text-slate-700">{entry.description}</p>
                            <span className="shrink-0 text-sm font-bold text-red-600">-{fmt(entry.amount)}</span>
                          </div>
                          <p className="text-xs text-slate-400">{new Date(entry.txnDate).toLocaleDateString("en-IN")}</p>
                        </div>
                      </div>

                      <div className="mt-2">
                        <label className="mb-1 block text-[10px] font-semibold text-slate-500 uppercase">Vendor / Expense</label>
                        {entry.checkedAt ? (
                          <p className="break-words text-sm text-slate-700">
                            {entry.vendorOrExpenseName || "—"}
                            {entry.commissionInfo && <span className="ml-1 text-blue-600">({entry.commissionInfo.label})</span>}
                          </p>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              list="vendor-expense-options"
                              className="h-9 flex-1 min-w-0 border border-slate-300 rounded px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                              placeholder="Pick or type vendor/expense..."
                              value={pvVendorExpenseDrafts[entry.id] ?? ""}
                              onChange={e => setPvVendorExpenseDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                              onBlur={() => {
                                if ((pvVendorExpenseDrafts[entry.id] ?? "") !== (entry.vendorOrExpenseName ?? "")) saveVendorExpense(entry.id);
                              }}
                            />
                            {pvSavingVendorExpenseId === entry.id && <Loader2 className="h-3 w-3 animate-spin text-slate-400 flex-none" />}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold text-slate-500 uppercase">Expense Month</label>
                          {entry.checkedAt ? (
                            <p className="text-sm text-slate-600">{entry.expensePeriodLabel || "—"}</p>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="month"
                                className="h-9 flex-1 min-w-0 appearance-none border border-slate-300 rounded px-2 text-sm leading-none focus:outline-none focus:ring-1 focus:ring-blue-400"
                                value={pvExpenseMonthDrafts[entry.id] ?? ""}
                                onChange={e => saveExpenseMonth(entry.id, e.target.value)}
                              />
                              {pvSavingExpenseMonthId === entry.id && <Loader2 className="h-3 w-3 animate-spin text-slate-400 flex-none" />}
                            </div>
                          )}
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold text-slate-500 uppercase">Note</label>
                          {entry.checkedAt ? (
                            <p className="text-sm text-slate-600">{entry.accountantNote || "—"}</p>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                className="h-9 flex-1 min-w-0 border border-slate-300 rounded px-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                placeholder="Add note..."
                                value={pvNoteDrafts[entry.id] ?? ""}
                                onChange={e => setPvNoteDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                onBlur={() => {
                                  if ((pvNoteDrafts[entry.id] ?? "") !== (entry.accountantNote ?? "")) saveVerificationNote(entry.id);
                                }}
                              />
                              {pvSavingNoteId === entry.id && <Loader2 className="h-3 w-3 animate-spin text-slate-400 flex-none" />}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5">
                        {entry.checkedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                            <Check className="h-3.5 w-3.5 flex-none" /> <span className="truncate">{entry.checkedByName || "Checked"}</span>
                          </span>
                        ) : canCheckPayments ? (
                          <button
                            onClick={() => handleCheckVerification(entry)}
                            disabled={pvCheckingId === entry.id || !pvIsSelectable(entry)}
                            title={!pvIsSelectable(entry) ? "Add a Vendor/Expense first" : undefined}
                            className="flex-1 min-w-[90px] px-2.5 py-1.5 rounded-md bg-green-600 text-white text-xs font-semibold disabled:opacity-50">
                            {pvCheckingId === entry.id ? "..." : "Checked"}
                          </button>
                        ) : (
                          <span className="text-xs text-slate-400">Pending</span>
                        )}

                        {entry.recheckedAt ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                            <ShieldCheck className="h-3.5 w-3.5 flex-none" /> Verified by {entry.recheckedByName || "Sanket"}
                          </span>
                        ) : isSuperAdmin && entry.checkedAt ? (
                          <button
                            onClick={() => handleRecheckVerification(entry)}
                            disabled={pvRecheckingId === entry.id}
                            className="flex-1 min-w-[80px] px-2.5 py-1.5 rounded-md bg-blue-600 text-white text-xs font-semibold disabled:opacity-50">
                            {pvRecheckingId === entry.id ? "..." : "Verify"}
                          </button>
                        ) : null}

                        {entry.checkedAt && canCheckPayments && (
                          <button
                            onClick={() => handleUndoCheck(entry)}
                            disabled={pvCheckingId === entry.id}
                            title="Undo Checked — reopens the row for editing"
                            className="ml-auto shrink-0 px-2 py-1 rounded border border-red-300 bg-red-50 text-red-700 text-[11px] font-semibold disabled:opacity-50">
                            Undo
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-300">
                  <table className="w-full min-w-[1180px] text-sm border-collapse table-fixed">
                    <colgroup>
                      <col className="w-[36px]" />
                      <col className="w-[85px]" />
                      <col />
                      <col className="w-[95px]" />
                      <col className="w-[150px]" />
                      <col className="w-[110px]" />
                      <col className="w-[170px]" />
                      <col className="w-[160px]" />
                      <col className="w-[160px]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 px-2 py-2 text-left">
                          {(() => {
                            const pageEntries = pvQueue.slice((pvPage - 1) * PV_PAGE_SIZE, pvPage * PV_PAGE_SIZE);
                            const selectable = pageEntries.filter(pvIsSelectable);
                            const allSelected = selectable.length > 0 && selectable.every(e => pvSelectedIds.has(e.id));
                            return (
                              <input
                                type="checkbox"
                                checked={allSelected}
                                disabled={selectable.length === 0}
                                onChange={() => {
                                  setPvSelectedIds(prev => {
                                    const next = new Set(prev);
                                    if (allSelected) selectable.forEach(e => next.delete(e.id));
                                    else selectable.forEach(e => next.add(e.id));
                                    return next;
                                  });
                                }}
                              />
                            );
                          })()}
                        </th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Date</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Description</th>
                        <th className="border border-slate-300 px-3 py-2 text-right font-bold text-slate-800">Amount</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Vendor / Expense</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Expense Month</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Payment Description</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Checked</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Verified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pvQueue.slice((pvPage - 1) * PV_PAGE_SIZE, pvPage * PV_PAGE_SIZE).map(entry => (
                        <tr key={entry.id} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-2 py-2 align-top">
                            <input
                              type="checkbox"
                              checked={pvSelectedIds.has(entry.id)}
                              disabled={!pvIsSelectable(entry)}
                              title={!pvIsSelectable(entry) ? "Add a Vendor/Expense before selecting this entry" : undefined}
                              onChange={() => togglePvSelect(entry.id)}
                            />
                          </td>
                          <td className="border border-slate-300 px-3 py-2 align-top whitespace-nowrap text-slate-600">
                            {new Date(entry.txnDate).toLocaleDateString("en-IN")}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 align-top text-slate-700 truncate max-w-0" title={entry.description}>{entry.description}</td>
                          <td className="border border-slate-300 px-3 py-2 align-top text-right font-semibold text-red-600 whitespace-nowrap">-{fmt(entry.amount)}</td>
                          <td className="border border-slate-300 px-3 py-2 align-top text-slate-700">
                            {entry.checkedAt ? (
                              <>
                                {entry.vendorOrExpenseName || "—"}
                                {entry.commissionInfo && (
                                  <div className="text-[11px] text-blue-600 mt-0.5">{entry.commissionInfo.label}</div>
                                )}
                              </>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  list="vendor-expense-options"
                                  className="flex-1 min-w-0 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  placeholder="Pick or type vendor/expense..."
                                  value={pvVendorExpenseDrafts[entry.id] ?? ""}
                                  onChange={e => setPvVendorExpenseDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                  onBlur={() => {
                                    if ((pvVendorExpenseDrafts[entry.id] ?? "") !== (entry.vendorOrExpenseName ?? "")) saveVendorExpense(entry.id);
                                  }}
                                />
                                {pvSavingVendorExpenseId === entry.id && <Loader2 className="h-3 w-3 animate-spin text-slate-400 flex-none" />}
                              </div>
                            )}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 align-top">
                            {entry.checkedAt ? (
                              <span className="text-slate-600">{entry.expensePeriodLabel || "—"}</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="month"
                                  className="flex-1 min-w-0 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  value={pvExpenseMonthDrafts[entry.id] ?? ""}
                                  onChange={e => saveExpenseMonth(entry.id, e.target.value)}
                                />
                                {pvSavingExpenseMonthId === entry.id && <Loader2 className="h-3 w-3 animate-spin text-slate-400 flex-none" />}
                              </div>
                            )}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 align-top">
                            {entry.checkedAt ? (
                              <span className="text-slate-600">{entry.accountantNote || "—"}</span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  className="flex-1 min-w-0 border border-slate-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  placeholder="Add note..."
                                  value={pvNoteDrafts[entry.id] ?? ""}
                                  onChange={e => setPvNoteDrafts(prev => ({ ...prev, [entry.id]: e.target.value }))}
                                  onBlur={() => {
                                    if ((pvNoteDrafts[entry.id] ?? "") !== (entry.accountantNote ?? "")) saveVerificationNote(entry.id);
                                  }}
                                />
                                {pvSavingNoteId === entry.id && <Loader2 className="h-3 w-3 animate-spin text-slate-400 flex-none" />}
                              </div>
                            )}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 align-top">
                            {entry.checkedAt ? (
                              <div className="flex flex-col items-start gap-1">
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 max-w-full">
                                  <Check className="h-3.5 w-3.5 flex-none" /> <span className="truncate">{entry.checkedByName || "Checked"}</span>
                                </span>
                                {canCheckPayments && (
                                  <button
                                    onClick={() => handleUndoCheck(entry)}
                                    disabled={pvCheckingId === entry.id}
                                    title="Undo Checked — reopens the row for editing"
                                    className="px-2 py-0.5 rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100 text-[11px] font-semibold disabled:opacity-50">
                                    Undo
                                  </button>
                                )}
                              </div>
                            ) : canCheckPayments ? (
                              <button
                                onClick={() => handleCheckVerification(entry)}
                                disabled={pvCheckingId === entry.id || !pvIsSelectable(entry)}
                                title={!pvIsSelectable(entry) ? "Add a Vendor/Expense first" : undefined}
                                className="px-2.5 py-1 rounded-md bg-green-600 text-white text-xs font-semibold hover:bg-green-700 disabled:opacity-50">
                                {pvCheckingId === entry.id ? "..." : "Checked"}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">Pending</span>
                            )}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 align-top">
                            {entry.recheckedAt ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                                <ShieldCheck className="h-3.5 w-3.5 flex-none" /> <span>Verified by {entry.recheckedByName || "Sanket"}</span>
                              </span>
                            ) : isSuperAdmin && entry.checkedAt ? (
                              <button
                                onClick={() => handleRecheckVerification(entry)}
                                disabled={pvRecheckingId === entry.id}
                                className="px-2.5 py-1 rounded-md bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
                                {pvRecheckingId === entry.id ? "..." : "Verify"}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
                )}
              {pvQueue.length > PV_PAGE_SIZE && (
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span>
                    Showing {(pvPage - 1) * PV_PAGE_SIZE + 1}–{Math.min(pvPage * PV_PAGE_SIZE, pvQueue.length)} of {pvQueue.length}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPvPage(p => Math.max(1, p - 1))}
                      disabled={pvPage === 1}
                      className="px-2.5 py-1 rounded-md border border-slate-300 font-medium disabled:opacity-40 hover:bg-slate-50">
                      Prev
                    </button>
                    <button
                      onClick={() => setPvPage(p => (p * PV_PAGE_SIZE < pvQueue.length ? p + 1 : p))}
                      disabled={pvPage * PV_PAGE_SIZE >= pvQueue.length}
                      className="px-2.5 py-1 rounded-md border border-slate-300 font-medium disabled:opacity-40 hover:bg-slate-50">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── PAYMENT HISTORY TAB ── */}
          {tab === "payment_history" && (
            <div className="space-y-2">
              {isNativeApp && pvHistory.length > 0 && (
                <div className="flex items-center justify-end gap-1.5">
                  <span className="text-[11px] text-slate-400">{pvHistory.length} entries</span>
                  <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                    <button onClick={() => setPaymentHistoryCompact(true)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${paymentHistoryCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Compact
                    </button>
                    <button onClick={() => setPaymentHistoryCompact(false)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${!paymentHistoryCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Table
                    </button>
                  </div>
                </div>
              )}
              {pvHistoryLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
              ) : pvHistory.length === 0 ? (
                <div className="rounded-xl border border-slate-300 p-10 text-center text-slate-400">No rechecked entries yet.</div>
              ) : isNativeApp && paymentHistoryCompact ? (
                <div className="space-y-2">
                  {pvHistory.slice((pvHistoryPage - 1) * PV_PAGE_SIZE, pvHistoryPage * PV_PAGE_SIZE).map(p => (
                    <div key={p.id} className="rounded-xl border border-slate-200 bg-white shadow-sm p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs text-slate-700 truncate flex-1">{p.description}</p>
                        <span className="shrink-0 text-sm font-bold text-red-600">-{fmt(p.amount)}</span>
                      </div>
                      <p className="text-[10px] text-slate-400">{new Date(p.txnDate).toLocaleDateString("en-IN")}</p>
                      <div className="mt-1.5 text-xs text-slate-700">
                        {p.vendorOrExpenseName || "—"}
                        {p.commissionInfo && <span className="ml-1 text-blue-600">({p.commissionInfo.label})</span>}
                        {p.expensePeriodLabel && <span className="ml-1 text-slate-400">· {p.expensePeriodLabel}</span>}
                      </div>
                      {p.accountantNote && <p className="mt-0.5 text-[11px] text-slate-500">{p.accountantNote}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-2">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                          <Check className="h-3.5 w-3.5 flex-none" /> {p.checkedByName || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                          <ShieldCheck className="h-3.5 w-3.5 flex-none" /> {p.recheckedByName || "—"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-300">
                  <table className="w-full min-w-[1180px] text-sm border-collapse table-fixed">
                    <colgroup>
                      <col className="w-[85px]" />
                      <col />
                      <col className="w-[95px]" />
                      <col className="w-[150px]" />
                      <col className="w-[110px]" />
                      <col className="w-[170px]" />
                      <col className="w-[160px]" />
                      <col className="w-[160px]" />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Date</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Description</th>
                        <th className="border border-slate-300 px-3 py-2 text-right font-bold text-slate-800">Amount</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Vendor / Expense</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Expense Month</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Payment Description</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Checked</th>
                        <th className="border border-slate-300 px-3 py-2 text-left font-bold text-slate-800">Verified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pvHistory.slice((pvHistoryPage - 1) * PV_PAGE_SIZE, pvHistoryPage * PV_PAGE_SIZE).map(p => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-3 py-2 whitespace-nowrap text-slate-600">{new Date(p.txnDate).toLocaleDateString("en-IN")}</td>
                          <td className="border border-slate-300 px-3 py-2 text-slate-700 truncate max-w-0" title={p.description}>{p.description}</td>
                          <td className="border border-slate-300 px-3 py-2 text-right font-semibold text-red-600 whitespace-nowrap">-{fmt(p.amount)}</td>
                          <td className="border border-slate-300 px-3 py-2 text-slate-700">
                            {p.vendorOrExpenseName || "—"}
                            {p.commissionInfo && <div className="text-[11px] text-blue-600 mt-0.5">{p.commissionInfo.label}</div>}
                          </td>
                          <td className="border border-slate-300 px-3 py-2 text-slate-600">{p.expensePeriodLabel || "—"}</td>
                          <td className="border border-slate-300 px-3 py-2 text-slate-600">{p.accountantNote || "—"}</td>
                          <td className="border border-slate-300 px-3 py-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                              <Check className="h-3.5 w-3.5 flex-none" /> <span>{p.checkedByName || "—"}</span>
                            </span>
                          </td>
                          <td className="border border-slate-300 px-3 py-2">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700">
                              <ShieldCheck className="h-3.5 w-3.5 flex-none" /> <span>{p.recheckedByName || "—"}</span>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
                )}
              {pvHistory.length > PV_PAGE_SIZE && (
                <div className="flex items-center justify-between text-xs text-slate-500 px-1">
                  <span>
                    Showing {(pvHistoryPage - 1) * PV_PAGE_SIZE + 1}–{Math.min(pvHistoryPage * PV_PAGE_SIZE, pvHistory.length)} of {pvHistory.length}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPvHistoryPage(p => Math.max(1, p - 1))}
                      disabled={pvHistoryPage === 1}
                      className="px-2.5 py-1 rounded-md border border-slate-300 font-medium disabled:opacity-40 hover:bg-slate-50">
                      Prev
                    </button>
                    <button
                      onClick={() => setPvHistoryPage(p => (p * PV_PAGE_SIZE < pvHistory.length ? p + 1 : p))}
                      disabled={pvHistoryPage * PV_PAGE_SIZE >= pvHistory.length}
                      className="px-2.5 py-1 rounded-md border border-slate-300 font-medium disabled:opacity-40 hover:bg-slate-50">
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "expense_tracker" && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-slate-500">
                  Shows what expense <strong>belongs to</strong> this month — e.g. June salary paid in July still counts as June's expense — split into what's actually been paid vs still owed.
                </p>
                <input type="month" value={expenseTrackerMonth} onChange={e => setExpenseTrackerMonth(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700" />
              </div>

              {expenseTrackerLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-blue-500" /></div>
              ) : !expenseTracker ? (
                <div className="p-10 text-center text-slate-400">No data.</div>
              ) : (
                <>
                  {/* Totals */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Total Accrued Expense", value: expenseTracker.total.accrued, color: "text-slate-800" },
                      { label: "Paid", value: expenseTracker.total.paid, color: "text-green-700" },
                      { label: "Balance", value: expenseTracker.total.balance, color: "text-red-700" },
                    ].map(c => (
                      <div key={c.label} className="rounded-xl border border-slate-300 bg-white px-4 py-3">
                        <p className="text-xs text-slate-500 font-medium">{c.label}</p>
                        <p className={`text-xl font-bold mt-0.5 ${c.color}`}>{fmt(c.value)}</p>
                      </div>
                    ))}
                  </div>

                  {isNativeApp && (
                    <div className="flex items-center justify-end gap-1.5">
                      <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                        <button onClick={() => setExpenseTrackerCompact(true)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${expenseTrackerCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                          Compact
                        </button>
                        <button onClick={() => setExpenseTrackerCompact(false)}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${!expenseTrackerCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                          Table
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Vendor / Expense */}
                  <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 px-4 py-2">
                      <p className="text-sm font-bold text-slate-800">Vendor / Expense <span className="font-normal text-slate-500">(from Payment Verification)</span></p>
                      <p className="text-xs text-slate-600">
                        Accrued <strong>{fmt(expenseTracker.vendorExpense.accrued)}</strong> · Paid <strong className="text-green-700">{fmt(expenseTracker.vendorExpense.paid)}</strong> · Balance <strong className="text-red-700">{fmt(expenseTracker.vendorExpense.balance)}</strong>
                      </p>
                    </div>
                    {expenseTracker.vendorExpense.entries.length === 0 && (
                      <p className="px-4 py-3 text-xs text-slate-400">No vendor/expense entries for this month.</p>
                    )}
                  </div>

                  {/* Salary */}
                  <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 px-4 py-2">
                      <p className="text-sm font-bold text-slate-800">Salary</p>
                      <p className="text-xs text-slate-600">
                        Accrued <strong>{fmt(expenseTracker.salary.accrued)}</strong> · Paid <strong className="text-green-700">{fmt(expenseTracker.salary.paid)}</strong> · Balance <strong className="text-red-700">{fmt(expenseTracker.salary.balance)}</strong>
                      </p>
                    </div>

                    {isNativeApp && expenseTrackerCompact ? (
                      <div className="space-y-2 p-3">
                        {expenseTracker.salary.byEmployee.map(row => (
                          <div key={row.employeeId} className="rounded-xl border border-slate-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
                                {row.fullName} <span className="font-normal text-xs text-slate-400">({row.designation})</span>
                              </p>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                              <div>
                                <p className="text-slate-400">Accrued</p>
                                <p className="font-mono font-semibold text-slate-700">{fmt(row.accrued)}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Paid</p>
                                <p className="font-mono font-semibold text-green-700">{fmt(row.paid)}</p>
                              </div>
                              <div>
                                <p className="text-slate-400">Balance</p>
                                <p className="font-mono font-semibold text-red-700">{fmt(row.balance)}</p>
                              </div>
                            </div>
                            <div className="mt-2 border-t border-slate-100 pt-2">
                              {!row.taggable ? (
                                <span className="text-xs text-slate-400">No login account — can't be tagged</span>
                              ) : row.balance <= 0 ? (
                                <span className="text-xs font-semibold text-green-700">Fully paid</span>
                              ) : (
                                <button
                                  onClick={() => row.userId && openSalaryBankMatch(row.userId, row.fullName, expenseTracker.year, expenseTracker.month, row.balance)}
                                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                  Mark Paid
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {/* Sanket — pure bank-based, no fixed figure */}
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                          <p className="text-sm font-semibold text-amber-900">
                            Sanket (Owner) <span className="block font-normal text-xs text-amber-700">no fixed salary, bank-tagged only</span>
                          </p>
                          <p className="mt-1 font-mono text-sm font-semibold text-amber-900">{fmt(expenseTracker.salary.sanket.amount)}</p>
                          {expenseTracker.salary.sanket.userId && (
                            <button
                              onClick={() => openSalaryBankMatch(expenseTracker.salary.sanket.userId!, "Sanket", expenseTracker.year, expenseTracker.month, 0)}
                              className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                              + Tag Withdrawal
                            </button>
                          )}
                          {expenseTracker.salary.sanket.transactions.length > 0 && (
                            <div className="mt-2 space-y-1.5 border-t border-amber-200 pt-2">
                              {expenseTracker.salary.sanket.transactions.map(t => (
                                <div key={t.id} className="flex items-start justify-between gap-2 text-xs text-amber-800">
                                  <span className="min-w-0 flex-1 break-words">{new Date(t.txnDate).toLocaleDateString("en-IN")} — {t.description}</span>
                                  <span className="shrink-0 font-semibold">{fmt(t.amount)}</span>
                                  <button onClick={() => handleUnmarkSalaryPaid(t.id)} className="shrink-0 text-red-600 hover:underline">Untag</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                            <th className="px-4 py-2 font-semibold">Employee</th>
                            <th className="px-4 py-2 font-semibold text-right">Accrued</th>
                            <th className="px-4 py-2 font-semibold text-right">Paid</th>
                            <th className="px-4 py-2 font-semibold text-right">Balance</th>
                            <th className="px-4 py-2 font-semibold"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenseTracker.salary.byEmployee.map(row => (
                            <tr key={row.employeeId} className="border-b border-slate-100 last:border-0">
                              <td className="px-4 py-2 text-slate-700">{row.fullName} <span className="text-xs text-slate-400">({row.designation})</span></td>
                              <td className="px-4 py-2 text-right text-slate-700">{fmt(row.accrued)}</td>
                              <td className="px-4 py-2 text-right text-green-700">{fmt(row.paid)}</td>
                              <td className="px-4 py-2 text-right text-red-700">{fmt(row.balance)}</td>
                              <td className="px-4 py-2 text-right">
                                {!row.taggable ? (
                                  <span className="text-xs text-slate-400">No login account — can't be tagged</span>
                                ) : row.balance <= 0 ? (
                                  <span className="text-xs font-semibold text-green-700">Fully paid</span>
                                ) : (
                                  <button
                                    onClick={() => row.userId && openSalaryBankMatch(row.userId, row.fullName, expenseTracker.year, expenseTracker.month, row.balance)}
                                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                    Mark Paid
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {/* Sanket — pure bank-based, no fixed figure */}
                          <tr className="bg-amber-50">
                            <td className="px-4 py-2 font-semibold text-amber-900">Sanket (Owner) <span className="text-xs font-normal text-amber-700">— no fixed salary, bank-tagged only</span></td>
                            <td className="px-4 py-2 text-right font-semibold text-amber-900" colSpan={3}>{fmt(expenseTracker.salary.sanket.amount)}</td>
                            <td className="px-4 py-2 text-right">
                              {expenseTracker.salary.sanket.userId && (
                                <button
                                  onClick={() => openSalaryBankMatch(expenseTracker.salary.sanket.userId!, "Sanket", expenseTracker.year, expenseTracker.month, 0)}
                                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                                  + Tag Withdrawal
                                </button>
                              )}
                            </td>
                          </tr>
                          {expenseTracker.salary.sanket.transactions.map(t => (
                            <tr key={t.id} className="bg-amber-50/50 text-xs text-amber-800">
                              <td className="px-4 py-1.5 pl-8" colSpan={3}>{new Date(t.txnDate).toLocaleDateString("en-IN")} — {t.description}</td>
                              <td className="px-4 py-1.5 text-right font-semibold">{fmt(t.amount)}</td>
                              <td className="px-4 py-1.5 text-right">
                                <button onClick={() => handleUnmarkSalaryPaid(t.id)} className="text-red-600 hover:underline">Untag</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                  </div>

                  {/* Commission */}
                  <div className="rounded-xl border border-slate-300 bg-white overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 px-4 py-2">
                      <p className="text-sm font-bold text-slate-800">Commission</p>
                      <p className="text-xs text-slate-600">
                        Accrued <strong>{fmt(expenseTracker.commission.accrued)}</strong> · Paid <strong className="text-green-700">{fmt(expenseTracker.commission.paid)}</strong> · Balance <strong className="text-red-700">{fmt(expenseTracker.commission.balance)}</strong>
                      </p>
                    </div>

                    {isNativeApp && expenseTrackerCompact ? (
                      <div className="space-y-2 p-3">
                        {expenseTracker.commission.byAgent.filter(a => a.accrued > 0).map(a => (
                          <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3">
                            <p className="text-sm font-semibold text-slate-800 break-words">{a.name}</p>
                            <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                              <div>
                                <p className="text-slate-400">Accrued</p>
                                <p className="font-mono font-semibold text-slate-700">{fmt(a.accrued)}</p>
                              </div>
                              {a.paid > 0
                                ? <span className="font-semibold text-green-700">Paid {fmt(a.paid)}</span>
                                : <span className="font-semibold text-red-700">Balance {fmt(a.accrued)}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[480px] text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                            <th className="px-4 py-2 font-semibold">Agent</th>
                            <th className="px-4 py-2 font-semibold text-right">Accrued</th>
                            <th className="px-4 py-2 font-semibold text-right">Paid / Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expenseTracker.commission.byAgent.filter(a => a.accrued > 0).map(a => (
                            <tr key={a.id} className="border-b border-slate-100 last:border-0">
                              <td className="px-4 py-2 text-slate-700">{a.name}</td>
                              <td className="px-4 py-2 text-right text-slate-700">{fmt(a.accrued)}</td>
                              <td className="px-4 py-2 text-right">
                                {a.paid > 0
                                  ? <span className="text-green-700 font-semibold">Paid {fmt(a.paid)}</span>
                                  : <span className="text-red-700 font-semibold">Balance {fmt(a.accrued)}</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    )}
                    <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
                      Paid/verified via the Commission tab's existing "Mark as Paid" flow.
                    </p>
                  </div>
                </>
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
                <MobileSelect value={codForm.courierPlatform} onChange={v => setCodForm(f => ({ ...f, courierPlatform: v }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 bg-white"
                  placeholder="Courier Platform"
                  options={[
                    { value: "BIGSHIP", label: "BigShip" },
                    { value: "SHIPROCKET", label: "Shiprocket" },
                    { value: "DELHIVERY", label: "Delhivery" },
                    { value: "DTDC", label: "DTDC" },
                    { value: "BLUEDART", label: "BlueDart" },
                    { value: "ECOMEXPRESS", label: "Ecom Express" },
                    { value: "XPRESSBEES", label: "XpressBees" },
                    { value: "OTHER", label: "Other" },
                  ]} />
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
                <DateInput value={editPaymentForm.paymentDate}
                  onChange={e => setEditPaymentForm(f => ({ ...f, paymentDate: e.target.value }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Method</span>
                <MobileSelect value={editPaymentForm.method} onChange={v => setEditPaymentForm(f => ({ ...f, method: v }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
                  placeholder="Method"
                  options={paymentMethods.map(method => ({ value: method, label: method.replace("_", " ") }))} />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold text-slate-600">Received In</span>
                <MobileSelect value={editPaymentForm.paymentAccountId} onChange={v => setEditPaymentForm(f => ({ ...f, paymentAccountId: v }))}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white"
                  placeholder="Select account"
                  options={[
                    { value: "", label: "Select account" },
                    ...paymentAccounts.map(account => ({ value: account.id, label: `${account.name}${account.bankName ? ` (${account.bankName})` : ""}` })),
                  ]} />
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
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-60 font-semibold">
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
                            style={{ background: "#ee1c25", color: "white", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
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

      {/* Commission "Mark as Paid" — Bank Statement Match Popup */}
      {bankMatchCommission && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", padding: "1rem" }}>
          <div style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "620px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "0.875rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Match Commission Payout with Bank Statement</h2>
                  <p style={{ fontSize: "11px", color: "#64748b", margin: "3px 0 0" }}>
                    {bankMatchCommission.agentName} · {bankMatchCommission.year}-{String(bankMatchCommission.month).padStart(2, "0")} · <strong style={{ color: "#ee1c25" }}>{fmt(bankMatchCommission.amount)}</strong>
                  </p>
                </div>
                <button onClick={() => { setBankMatchCommission(null); setBankMatchCommissionResults([]); }}
                  style={{ padding: "4px", borderRadius: "6px", border: "none", background: "none", cursor: "pointer", color: "#94a3b8" }}>x</button>
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "0.75rem 1rem" }}>
              {bankMatchCommissionLoading ? (
                <div style={{ textAlign: "center", padding: "2rem", fontSize: "12px", color: "#64748b" }}>Searching bank statement...</div>
              ) : bankMatchCommissionResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>
                    No debit transactions found for exactly {fmt(bankMatchCommission.amount)}. Import/refresh the bank statement first, or check the exact payout amount.
                  </p>
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
                    {bankMatchCommissionResults.map(txn => (
                      <tr key={txn.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", color: "#475569", whiteSpace: "nowrap" }}>{new Date(txn.txnDate).toLocaleDateString("en-IN")}</td>
                        <td style={{ padding: "6px 8px", color: "#334155", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txn.description}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "#dc2626" }}>{fmt(txn.amount)}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "9999px", background: txn.reconcileStatus === "MATCHED_COMMISSION" ? "#dbeafe" : "#f1f5f9", color: txn.reconcileStatus === "MATCHED_COMMISSION" ? "#1d4ed8" : "#64748b", fontWeight: 600 }}>
                            {txn.reconcileStatus}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <button onClick={() => matchCommissionPaid(txn)} disabled={markingCommissionPaid}
                            style={{ background: "#ee1c25", color: "white", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
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
              <button onClick={() => { setBankMatchCommission(null); setBankMatchCommissionResults([]); }}
                style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "5px 14px", fontSize: "12px", color: "#334155", background: "white", cursor: "pointer" }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expense Tracker Salary "Mark as Paid" / "Tag Withdrawal" — Bank Statement Match Popup */}
      {bankMatchSalary && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.55)", padding: "1rem" }}>
          <div style={{ background: "white", borderRadius: "12px", width: "100%", maxWidth: "620px", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <div style={{ padding: "0.875rem 1rem", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Match Salary Payment with Bank Statement</h2>
                  <p style={{ fontSize: "11px", color: "#64748b", margin: "3px 0 0" }}>
                    {bankMatchSalary.userName} · {bankMatchSalary.year}-{String(bankMatchSalary.month).padStart(2, "0")}
                    {bankMatchSalary.amount > 0 && <> · <strong style={{ color: "#ee1c25" }}>{fmt(bankMatchSalary.amount)}</strong></>}
                  </p>
                </div>
                <button onClick={() => { setBankMatchSalary(null); setBankMatchSalaryResults([]); }}
                  style={{ padding: "4px", borderRadius: "6px", border: "none", background: "none", cursor: "pointer", color: "#94a3b8" }}>x</button>
              </div>
            </div>
            <div style={{ overflowY: "auto", flex: 1, padding: "0.75rem 1rem" }}>
              {bankMatchSalaryLoading ? (
                <div style={{ textAlign: "center", padding: "2rem", fontSize: "12px", color: "#64748b" }}>Searching bank statement...</div>
              ) : bankMatchSalaryResults.length === 0 ? (
                <div style={{ textAlign: "center", padding: "2rem" }}>
                  <p style={{ fontSize: "12px", color: "#94a3b8", margin: 0 }}>
                    {bankMatchSalary.amount > 0
                      ? `No debit transactions found for exactly ${fmt(bankMatchSalary.amount)}. Import/refresh the bank statement first, or check the exact amount.`
                      : "No debit transactions found for this month. Import/refresh the bank statement first."}
                  </p>
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
                    {bankMatchSalaryResults.map(txn => (
                      <tr key={txn.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", color: "#475569", whiteSpace: "nowrap" }}>{new Date(txn.txnDate).toLocaleDateString("en-IN")}</td>
                        <td style={{ padding: "6px 8px", color: "#334155", maxWidth: "220px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{txn.description}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700, color: "#dc2626" }}>{fmt(txn.amount)}</td>
                        <td style={{ padding: "6px 8px" }}>
                          <span style={{ fontSize: "10px", padding: "2px 6px", borderRadius: "9999px", background: txn.reconcileStatus === "MATCHED_SALARY" ? "#dbeafe" : "#f1f5f9", color: txn.reconcileStatus === "MATCHED_SALARY" ? "#1d4ed8" : "#64748b", fontWeight: 600 }}>
                            {txn.reconcileStatus}
                          </span>
                        </td>
                        <td style={{ padding: "6px 8px" }}>
                          <button onClick={() => matchSalaryPaid(txn)} disabled={markingSalaryPaid}
                            style={{ background: "#ee1c25", color: "white", border: "none", borderRadius: "6px", padding: "4px 10px", fontSize: "11px", fontWeight: 600, cursor: "pointer" }}>
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
              <button onClick={() => { setBankMatchSalary(null); setBankMatchSalaryResults([]); }}
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

      {/* Reject Dispatch Modal */}
      {dispatchRejectId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "24rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <h2 className="text-sm font-bold text-slate-800 mb-3">Reject Dispatch</h2>
            <p className="text-xs text-slate-500 mb-2">Sends the order back to Approved status, before dispatch. The sales agent will be notified with your reason.</p>
            <textarea value={dispatchRejectReason} onChange={e => setDispatchRejectReason(e.target.value)}
              placeholder="Enter rejection reason..." rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setDispatchRejectId(null); setDispatchRejectReason(""); }}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={rejectDispatchOrder} disabled={dispatchProcessing === dispatchRejectId}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                {dispatchProcessing === dispatchRejectId ? "Rejecting..." : "Reject Dispatch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Cancellation Modal */}
      {cancelRejectId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
          <div style={{ background: "white", borderRadius: "12px", padding: "1.5rem", width: "100%", maxWidth: "24rem", boxShadow: "0 25px 50px rgba(0,0,0,0.3)" }}>
            <h2 className="text-sm font-bold text-slate-800 mb-3">Reject Cancellation Request</h2>
            <p className="text-xs text-slate-500 mb-2">The order stays as-is and the sales agent will be notified with your reason.</p>
            <textarea value={cancelRejectReason} onChange={e => setCancelRejectReason(e.target.value)}
              placeholder="Enter rejection reason..." rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-red-400 resize-none" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => { setCancelRejectId(null); setCancelRejectReason(""); }}
                className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={rejectCancellationRequest} disabled={cancelProcessing === cancelRejectId}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60">
                {cancelProcessing === cancelRejectId ? "Rejecting..." : "Reject Cancellation"}
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
