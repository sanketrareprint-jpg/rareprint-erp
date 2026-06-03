"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  Upload, RefreshCw, Loader2, CheckCircle, AlertCircle, Clock,
  XCircle, ChevronDown, ChevronUp, Plus, Trash2, Search,
  TrendingUp, TrendingDown, Landmark, LayoutList, Tag, Settings2,
  FileText, Eye, RotateCcw,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type BankTxnType = "CR" | "DR";
type BankReconcileStatus =
  | "UNMATCHED"
  | "MATCHED_PAYMENT"
  | "MATCHED_VENDOR"
  | "MATCHED_EXPENSE"
  | "MANUAL_REVIEW"
  | "IGNORED";

interface BankTransaction {
  id: string;
  srl: number;
  txnDate: string;
  valueDate: string;
  description: string;
  chequeNo?: string;
  crDr: BankTxnType;
  amount: string;
  balance: string;
  reconcileStatus: BankReconcileStatus;
  matchedPayment?: { id: string; amount: string; referenceNumber?: string; order?: { id: string } };
  matchedVendor?: { id: string; name: string };
  expenseCategory?: { id: string; name: string };
  reviewNote?: string;
  reconciledAt?: string;
  reconciledBy?: { fullName: string };
}

interface ImportResult {
  sessionId: string;
  accountNumber: string;
  totalInFile: number;
  skipped: number;
  imported: number;
  summary: Record<string, number>;
}

interface Summary {
  total: number;
  byCrDr: { crDr: BankTxnType; _sum: { amount: string }; _count: number }[];
  byStatus: { reconcileStatus: BankReconcileStatus; _count: number }[];
  lastBalance: { balance: string; txnDate: string; txnDateTime?: string | null } | null;
}

interface BankAccountOption {
  accountNumber: string;
  label: string;
  count: number;
  isDefault?: boolean;
}

interface Vendor { id: string; name: string; }
interface VendorKeyword { id: string; keyword: string; vendor: { id: string; name: string }; }
interface ExpenseCategory { id: string; name: string; description?: string; keywords: { id: string; keyword: string }[]; }

// ─── Constants ──────────────────────────────────────────────────────────────

const STATUS_META: Record<BankReconcileStatus, { label: string; color: string; icon: React.ElementType }> = {
  MATCHED_PAYMENT: { label: "Payment Matched",  color: "bg-green-100 text-green-800",  icon: CheckCircle },
  MATCHED_VENDOR:  { label: "Vendor Matched",   color: "bg-blue-100 text-blue-800",    icon: CheckCircle },
  MATCHED_EXPENSE: { label: "Expense Matched",  color: "bg-purple-100 text-purple-800", icon: CheckCircle },
  MANUAL_REVIEW:   { label: "Needs Review",     color: "bg-yellow-100 text-yellow-800", icon: AlertCircle },
  UNMATCHED:       { label: "Unmatched",        color: "bg-gray-100 text-gray-600",    icon: Clock },
  IGNORED:         { label: "Ignored",          color: "bg-red-50 text-red-400",        icon: XCircle },
};

type Tab = "ledger" | "review" | "vendor-mapping" | "expense-mapping" | "sessions";

const GST_BANK_ACCOUNT = "0513102000013378";

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number) {
  return "₹" + Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function BankStatementPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Upload state ──
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState("");

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<Tab>("ledger");

  // ── Ledger state ──
  const [bankAccounts, setBankAccounts] = useState<BankAccountOption[]>([
    { accountNumber: GST_BANK_ACCOUNT, label: "GST Bank", count: 0, isDefault: true },
  ]);
  const [selectedAccount, setSelectedAccount] = useState(GST_BANK_ACCOUNT);
  const [txns, setTxns] = useState<BankTransaction[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnPage, setTxnPage] = useState(1);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [filterStatus, setFilterStatus] = useState<BankReconcileStatus | "">("");
  const [filterCrDr, setFilterCrDr] = useState<BankTxnType | "">("");
  const [filterSearch, setFilterSearch] = useState("");
  const [filterFromDate, setFilterFromDate] = useState("2026-04-01");
  const [filterToDate, setFilterToDate] = useState("");
  const [expandedTxn, setExpandedTxn] = useState<string | null>(null);

  // ── Summary state ──
  const [summary, setSummary] = useState<Summary | null>(null);

  // ── Reconcile modal ──
  const [reconciling, setReconciling] = useState<BankTransaction | null>(null);
  const [reconcileForm, setReconcileForm] = useState({
    reconcileStatus: "MANUAL_REVIEW" as BankReconcileStatus,
    matchedPaymentId: "",
    matchedVendorId: "",
    expenseCategoryId: "",
    reviewNote: "",
  });
  const [reconcilingLoading, setReconcilingLoading] = useState(false);

  // ── Vendor mapping ──
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [vendorKeywords, setVendorKeywords] = useState<VendorKeyword[]>([]);
  const [newVkKeyword, setNewVkKeyword] = useState("");
  const [newVkVendorId, setNewVkVendorId] = useState("");
  const [vkLoading, setVkLoading] = useState(false);

  // ── Expense mapping ──
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [newExpKeyword, setNewExpKeyword] = useState("");
  const [newExpCatId, setNewExpCatId] = useState("");
  const [expLoading, setExpLoading] = useState(false);

  // ── Sessions ──
  const [sessions, setSessions] = useState<any[]>([]);

  // ─── API helpers ──────────────────────────────────────────────────────────

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const headers = getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers: { ...headers, ...(opts?.headers ?? {}) } });
    if (res.status === 401) { router.push("/login"); return null; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || res.statusText); }
    return res.json();
  }, [router]);

  // ─── Load data ────────────────────────────────────────────────────────────

  const loadBankAccounts = useCallback(async () => {
    const data = await apiFetch("/bank-statement/accounts").catch(() => []);
    const accounts: BankAccountOption[] = data?.length ? data : [];
    if (!accounts.some((a) => a.accountNumber === GST_BANK_ACCOUNT)) {
      accounts.unshift({ accountNumber: GST_BANK_ACCOUNT, label: "GST Bank", count: 0, isDefault: true });
    }
    setBankAccounts(accounts);
  }, [apiFetch]);

  const loadSummary = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedAccount) params.set("accountNumber", selectedAccount);
    if (filterFromDate) params.set("fromDate", filterFromDate);
    if (filterToDate) params.set("toDate", filterToDate);
    const qs = params.toString();
    const data = await apiFetch(`/bank-statement/summary${qs ? `?${qs}` : ""}`).catch(() => null);
    if (data) setSummary(data);
  }, [apiFetch, selectedAccount, filterFromDate, filterToDate]);

  const loadTxns = useCallback(async (page = 1) => {
    setLoadingTxns(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (selectedAccount) params.set("accountNumber", selectedAccount);
      if (filterStatus) params.set("reconcileStatus", filterStatus);
      if (filterCrDr) params.set("crDr", filterCrDr);
      if (filterFromDate) params.set("fromDate", filterFromDate);
      if (filterToDate) params.set("toDate", filterToDate);
      const data = await apiFetch(`/bank-statement/transactions?${params}`);
      if (data) { setTxns(data.data); setTxnTotal(data.total); setTxnPage(page); }
    } finally { setLoadingTxns(false); }
  }, [apiFetch, selectedAccount, filterStatus, filterCrDr, filterFromDate, filterToDate]);

  const loadVendorKeywords = useCallback(async () => {
    const [vks, vs] = await Promise.all([
      apiFetch("/bank-statement/vendor-keywords").catch(() => []),
      apiFetch("/vendors").catch(() => []),
    ]);
    if (vks) setVendorKeywords(vks);
    if (vs) setVendors(vs);
  }, [apiFetch]);

  const loadExpenseCategories = useCallback(async () => {
    const data = await apiFetch("/bank-statement/expense-categories").catch(() => []);
    if (data) setExpenseCategories(data);
  }, [apiFetch]);

  const loadSessions = useCallback(async () => {
    const params = new URLSearchParams();
    if (selectedAccount) params.set("accountNumber", selectedAccount);
    const qs = params.toString();
    const data = await apiFetch(`/bank-statement/sessions${qs ? `?${qs}` : ""}`).catch(() => []);
    if (data) setSessions(data);
  }, [apiFetch, selectedAccount]);

  useEffect(() => { loadBankAccounts(); }, [loadBankAccounts]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (activeTab === "ledger" || activeTab === "review") loadTxns(1); }, [activeTab, selectedAccount, filterStatus, filterCrDr, loadTxns]);
  useEffect(() => { if (activeTab === "vendor-mapping") loadVendorKeywords(); }, [activeTab, loadVendorKeywords]);
  useEffect(() => { if (activeTab === "expense-mapping") loadExpenseCategories(); }, [activeTab, loadExpenseCategories]);
  useEffect(() => { if (activeTab === "sessions") loadSessions(); }, [activeTab, loadSessions]);

  // ─── Import ───────────────────────────────────────────────────────────────

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      // Don't pass Content-Type here — browser must set it to multipart/form-data with boundary
      const { "Content-Type": _ct, ...uploadHeaders } = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/bank-statement/import`, {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Import failed"); }
      const result = await res.json();
      setImportResult(result);
      if (result.accountNumber) setSelectedAccount(result.accountNumber);
      loadBankAccounts();
      loadSummary();
      loadTxns(1);
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ─── Reconcile ────────────────────────────────────────────────────────────

  const openReconcile = (txn: BankTransaction) => {
    setReconciling(txn);
    setReconcileForm({
      reconcileStatus: txn.reconcileStatus,
      matchedPaymentId: txn.matchedPayment?.id ?? "",
      matchedVendorId: txn.matchedVendor?.id ?? "",
      expenseCategoryId: txn.expenseCategory?.id ?? "",
      reviewNote: txn.reviewNote ?? "",
    });
  };

  const submitReconcile = async () => {
    if (!reconciling) return;
    setReconcilingLoading(true);
    try {
      await apiFetch(`/bank-statement/transactions/${reconciling.id}/reconcile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reconcileStatus: reconcileForm.reconcileStatus,
          matchedPaymentId: reconcileForm.matchedPaymentId || undefined,
          matchedVendorId: reconcileForm.matchedVendorId || undefined,
          expenseCategoryId: reconcileForm.expenseCategoryId || undefined,
          reviewNote: reconcileForm.reviewNote || undefined,
        }),
      });
      setReconciling(null);
      loadTxns(txnPage);
      loadSummary();
    } finally { setReconcilingLoading(false); }
  };

  // ─── Re-match ─────────────────────────────────────────────────────────────

  const [rematching, setRematching] = useState(false);
  const handleRematch = async () => {
    setRematching(true);
    try {
      const params = new URLSearchParams();
      if (selectedAccount) params.set("accountNumber", selectedAccount);
      const qs = params.toString();
      const r = await apiFetch(`/bank-statement/rematch${qs ? `?${qs}` : ""}`, { method: "POST" });
      if (r) { alert(`Re-matched: ${r.updated} of ${r.processed} transactions updated.`); loadTxns(txnPage); loadSummary(); }
    } finally { setRematching(false); }
  };

  // ─── Vendor keyword actions ───────────────────────────────────────────────

  const addVendorKeyword = async () => {
    if (!newVkKeyword.trim() || !newVkVendorId) return;
    setVkLoading(true);
    try {
      await apiFetch("/bank-statement/vendor-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newVkKeyword.trim(), vendorId: newVkVendorId }),
      });
      setNewVkKeyword(""); setNewVkVendorId("");
      loadVendorKeywords();
    } finally { setVkLoading(false); }
  };

  const deleteVendorKeyword = async (id: string) => {
    await apiFetch(`/bank-statement/vendor-keywords/${id}`, { method: "DELETE" });
    loadVendorKeywords();
  };

  // ─── Expense category actions ─────────────────────────────────────────────

  const addExpenseCategory = async () => {
    if (!newCatName.trim()) return;
    setExpLoading(true);
    try {
      await apiFetch("/bank-statement/expense-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim() }),
      });
      setNewCatName(""); loadExpenseCategories();
    } finally { setExpLoading(false); }
  };

  const addExpenseKeyword = async () => {
    if (!newExpKeyword.trim() || !newExpCatId) return;
    setExpLoading(true);
    try {
      await apiFetch("/bank-statement/expense-keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newExpKeyword.trim(), categoryId: newExpCatId }),
      });
      setNewExpKeyword(""); setNewExpCatId(""); loadExpenseCategories();
    } finally { setExpLoading(false); }
  };

  const deleteExpenseKeyword = async (id: string) => {
    await apiFetch(`/bank-statement/expense-keywords/${id}`, { method: "DELETE" });
    loadExpenseCategories();
  };

  // ─── Computed ─────────────────────────────────────────────────────────────

  const totalCR = summary?.byCrDr.find((r) => r.crDr === "CR")?._sum.amount ?? "0";
  const totalDR = summary?.byCrDr.find((r) => r.crDr === "DR")?._sum.amount ?? "0";
  const reviewCount = summary?.byStatus.find((r) => r.reconcileStatus === "MANUAL_REVIEW")?._count ?? 0;

  const displayedTxns = filterSearch
    ? txns.filter((t) => t.description.toLowerCase().includes(filterSearch.toLowerCase()))
    : txns;

  const reviewTxns = txns.filter((t) => t.reconcileStatus === "MANUAL_REVIEW" || t.reconcileStatus === "UNMATCHED");
  const selectedBank = bankAccounts.find((account) => account.accountNumber === selectedAccount)
    ?? { accountNumber: selectedAccount, label: selectedAccount === GST_BANK_ACCOUNT ? "GST Bank" : `CC Bank ${selectedAccount.slice(-4)}` };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Landmark className="w-7 h-7 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Bank Statement</h1>
              <p className="text-xs text-gray-500">IDBI · {selectedBank.label} · A/c {selectedBank.accountNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedAccount}
              onChange={(e) => { setSelectedAccount(e.target.value); setTxnPage(1); }}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-blue-400"
            >
              {bankAccounts.map((account) => (
                <option key={account.accountNumber} value={account.accountNumber}>
                  {account.label} · {account.accountNumber}
                </option>
              ))}
            </select>
            <button
              onClick={handleRematch}
              disabled={rematching}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {rematching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Re-run Auto-match
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? "Importing…" : "Import Statement"}
            </button>
            <input ref={fileRef} type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={handleImport} />
          </div>
        </div>

        {/* ── Import result banner ── */}
        {importResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Import complete — {importResult.imported} new transactions</p>
              <p className="text-sm text-green-700 mt-0.5">
                {importResult.skipped} rows skipped (already imported) ·
                Matched payments: {importResult.summary.matched_payment} ·
                Vendors: {importResult.summary.matched_vendor} ·
                Expenses: {importResult.summary.matched_expense} ·
                Needs review: {importResult.summary.manual_review}
              </p>
            </div>
            <button onClick={() => setImportResult(null)} className="ml-auto text-green-600 hover:text-green-800"><XCircle className="w-4 h-4" /></button>
          </div>
        )}
        {importError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" /> {importError}
            <button onClick={() => setImportError("")} className="ml-auto"><XCircle className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Summary cards ── */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">Current Balance</p>
              <p className="text-lg font-bold text-gray-900">{summary.lastBalance ? fmt(summary.lastBalance.balance) : "—"}</p>
              {summary.lastBalance && <p className="text-xs text-gray-400 mt-0.5">{fmtDate(summary.lastBalance.txnDate)}</p>}
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5 text-green-500" />Total Credits</p>
              <p className="text-lg font-bold text-green-600">{fmt(totalCR)}</p>
              <p className="text-xs text-gray-400">{summary.byCrDr.find((r) => r.crDr === "CR")?._count ?? 0} transactions</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5 text-red-500" />Total Debits</p>
              <p className="text-lg font-bold text-red-600">{fmt(totalDR)}</p>
              <p className="text-xs text-gray-400">{summary.byCrDr.find((r) => r.crDr === "DR")?._count ?? 0} transactions</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 text-yellow-500" />Needs Review</p>
              <p className="text-lg font-bold text-yellow-600">{reviewCount}</p>
              <p className="text-xs text-gray-400">{summary.total} total entries</p>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
          {(["ledger","review","vendor-mapping","expense-mapping","sessions"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "ledger" && <span className="flex items-center gap-1.5"><LayoutList className="w-3.5 h-3.5" />Ledger</span>}
              {tab === "review" && <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-yellow-500" />Review Queue {reviewCount > 0 && <span className="bg-yellow-500 text-white text-xs rounded-full px-1.5">{reviewCount}</span>}</span>}
              {tab === "vendor-mapping" && <span className="flex items-center gap-1.5"><Tag className="w-3.5 h-3.5" />Vendor Map</span>}
              {tab === "expense-mapping" && <span className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" />Expense Map</span>}
              {tab === "sessions" && <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Import History</span>}
            </button>
          ))}
        </div>

        {/* ════════════════ LEDGER TAB ════════════════ */}
        {activeTab === "ledger" && (
          <div className="bg-white rounded-xl border border-gray-200">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100">
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 flex-1 min-w-48">
                <Search className="w-4 h-4 text-gray-400" />
                <input
                  className="bg-transparent text-sm outline-none flex-1"
                  placeholder="Search description…"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </div>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50"
              >
                <option value="">All Statuses</option>
                {Object.entries(STATUS_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
              <select
                value={filterCrDr}
                onChange={(e) => setFilterCrDr(e.target.value as any)}
                className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50"
              >
                <option value="">CR + DR</option>
                <option value="CR">Credits only</option>
                <option value="DR">Debits only</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                From
                <input
                  type="date"
                  value={filterFromDate}
                  onChange={(e) => setFilterFromDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-700"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                To
                <input
                  type="date"
                  value={filterToDate}
                  onChange={(e) => setFilterToDate(e.target.value)}
                  className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 text-gray-700"
                />
              </label>
              {(filterFromDate !== "2026-04-01" || filterToDate) && (
                <button
                  onClick={() => { setFilterFromDate("2026-04-01"); setFilterToDate(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Reset dates
                </button>
              )}
              <button onClick={() => loadTxns(txnPage)} className="p-1.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100">
                <RefreshCw className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Table */}
            {loadingTxns ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 w-8">#</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Date</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Description</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Amount</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Balance</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Status</th>
                      <th className="px-4 py-2.5 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {displayedTxns.map((txn) => {
                      const meta = STATUS_META[txn.reconcileStatus];
                      const Icon = meta.icon;
                      const isExpanded = expandedTxn === txn.id;
                      return (
                        <React.Fragment key={txn.id}>
                          <tr className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedTxn(isExpanded ? null : txn.id)}>
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{txn.srl}</td>
                            <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(txn.txnDate)}</td>
                            <td className="px-4 py-2.5 text-gray-800 max-w-xs truncate">{txn.description}</td>
                            <td className={`px-4 py-2.5 font-medium text-right whitespace-nowrap ${txn.crDr === "CR" ? "text-green-600" : "text-red-600"}`}>
                              {txn.crDr === "CR" ? "+" : "−"}{fmt(txn.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-600 text-right whitespace-nowrap">{fmt(txn.balance)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${meta.color}`}>
                                <Icon className="w-3 h-3" />{meta.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-blue-50">
                              <td colSpan={7} className="px-6 py-3">
                                <div className="flex flex-wrap items-start gap-4">
                                  <div className="text-xs text-gray-600 space-y-1 flex-1">
                                    <p><span className="font-medium">Full description:</span> {txn.description}</p>
                                    {txn.chequeNo && <p><span className="font-medium">Cheque/Ref:</span> {txn.chequeNo}</p>}
                                    {txn.matchedPayment && <p><span className="font-medium">Matched Order:</span> {txn.matchedPayment.order?.id} · Ref: {txn.matchedPayment.referenceNumber}</p>}
                                    {txn.matchedVendor && <p><span className="font-medium">Vendor:</span> {txn.matchedVendor.name}</p>}
                                    {txn.expenseCategory && <p><span className="font-medium">Expense Category:</span> {txn.expenseCategory.name}</p>}
                                    {txn.reviewNote && <p><span className="font-medium">Note:</span> {txn.reviewNote}</p>}
                                    {txn.reconciledBy && <p><span className="font-medium">Reconciled by:</span> {txn.reconciledBy.fullName}</p>}
                                  </div>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); openReconcile(txn); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium hover:bg-gray-50 flex-shrink-0"
                                  >
                                    <Eye className="w-3.5 h-3.5" /> Edit Mapping
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {displayedTxns.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-12 text-gray-400">No transactions found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {txnTotal > 50 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
                <span>{txnTotal} total entries</span>
                <div className="flex gap-2">
                  <button disabled={txnPage <= 1} onClick={() => loadTxns(txnPage - 1)} className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40">Prev</button>
                  <span className="px-3 py-1">Page {txnPage} of {Math.ceil(txnTotal / 50)}</span>
                  <button disabled={txnPage >= Math.ceil(txnTotal / 50)} onClick={() => loadTxns(txnPage + 1)} className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40">Next</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ REVIEW QUEUE TAB ════════════════ */}
        {activeTab === "review" && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Transactions Needing Review</h2>
              <span className="text-sm text-gray-500">{reviewTxns.length} entries</span>
            </div>
            <div className="divide-y divide-gray-50">
              {reviewTxns.length === 0 && <p className="text-center py-12 text-gray-400">All transactions are reconciled 🎉</p>}
              {reviewTxns.map((txn) => (
                <div key={txn.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className={`text-xs font-bold px-2 py-0.5 rounded ${txn.crDr === "CR" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {txn.crDr}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 truncate">{txn.description}</p>
                    <p className="text-xs text-gray-400">{fmtDate(txn.txnDate)}</p>
                  </div>
                  <p className={`font-semibold text-sm whitespace-nowrap ${txn.crDr === "CR" ? "text-green-600" : "text-red-600"}`}>
                    {txn.crDr === "CR" ? "+" : "−"}{fmt(txn.amount)}
                  </p>
                  <button
                    onClick={() => openReconcile(txn)}
                    className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-shrink-0"
                  >
                    Map Now
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════ VENDOR MAPPING TAB ════════════════ */}
        {activeTab === "vendor-mapping" && (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Add keywords found in transaction descriptions. When a debit transaction contains a keyword, it is automatically mapped to the vendor account.
            </div>

            {/* Add new */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Add Keyword → Vendor Rule</h3>
              <div className="flex gap-2 flex-wrap">
                <input
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
                  placeholder="Keyword (e.g. BIGSHIP, SAACHI, AISENSY)"
                  value={newVkKeyword}
                  onChange={(e) => setNewVkKeyword(e.target.value)}
                />
                <select
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
                  value={newVkVendorId}
                  onChange={(e) => setNewVkVendorId(e.target.value)}
                >
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
                <button
                  onClick={addVendorKeyword}
                  disabled={vkLoading || !newVkKeyword.trim() || !newVkVendorId}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {vkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Rule
                </button>
              </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800">Active Rules ({vendorKeywords.length})</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {vendorKeywords.length === 0 && <p className="text-center py-10 text-gray-400">No vendor keywords yet</p>}
                {vendorKeywords.map((vk) => (
                  <div key={vk.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-3">
                      <span className="bg-gray-100 text-gray-700 font-mono text-sm px-2 py-0.5 rounded">{vk.keyword}</span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span className="text-sm text-gray-800 font-medium">{vk.vendor.name}</span>
                    </div>
                    <button onClick={() => deleteVendorKeyword(vk.id)} className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ════════════════ EXPENSE MAPPING TAB ════════════════ */}
        {activeTab === "expense-mapping" && (
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
              Create expense categories and add keywords. Debit transactions matching a keyword are auto-posted to that category.
            </div>

            {/* Add category */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Add Expense Category</h3>
              <div className="flex gap-2">
                <input
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1"
                  placeholder="e.g. Logistics, Software & SaaS, Advertising"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <button
                  onClick={addExpenseCategory}
                  disabled={expLoading || !newCatName.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {expLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                </button>
              </div>
            </div>

            {/* Add keyword */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h3 className="font-semibold text-gray-800 mb-3">Add Keyword → Category Rule</h3>
              <div className="flex gap-2 flex-wrap">
                <input
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
                  placeholder="Keyword (e.g. GOOGLE, SWIGGY, NAUKRI)"
                  value={newExpKeyword}
                  onChange={(e) => setNewExpKeyword(e.target.value)}
                />
                <select
                  className="border border-gray-200 rounded-lg px-3 py-2 text-sm flex-1 min-w-48"
                  value={newExpCatId}
                  onChange={(e) => setNewExpCatId(e.target.value)}
                >
                  <option value="">Select category…</option>
                  {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button
                  onClick={addExpenseKeyword}
                  disabled={expLoading || !newExpKeyword.trim() || !newExpCatId}
                  className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700 disabled:opacity-50"
                >
                  {expLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Rule
                </button>
              </div>
            </div>

            {/* Categories list */}
            <div className="space-y-3">
              {expenseCategories.length === 0 && (
                <div className="bg-white rounded-xl border border-gray-200 py-10 text-center text-gray-400">No expense categories yet</div>
              )}
              {expenseCategories.map((cat) => (
                <div key={cat.id} className="bg-white rounded-xl border border-gray-200">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <span className="font-semibold text-gray-800">{cat.name}</span>
                    <span className="text-xs text-gray-400">{cat.keywords.length} keywords</span>
                  </div>
                  <div className="flex flex-wrap gap-2 p-3">
                    {cat.keywords.length === 0 && <span className="text-xs text-gray-400">No keywords yet</span>}
                    {cat.keywords.map((kw) => (
                      <span key={kw.id} className="inline-flex items-center gap-1 bg-purple-50 text-purple-800 text-xs font-mono px-2 py-1 rounded-full">
                        {kw.keyword}
                        <button onClick={() => deleteExpenseKeyword(kw.id)} className="ml-0.5 hover:text-red-500"><XCircle className="w-3 h-3" /></button>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════ IMPORT HISTORY TAB ════════════════ */}
        {activeTab === "sessions" && (
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">Import History</h2>
            </div>
            <div className="divide-y divide-gray-50">
              {sessions.length === 0 && <p className="text-center py-12 text-gray-400">No imports yet</p>}
              {sessions.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.fileName}</p>
                    <p className="text-xs text-gray-400">{fmtDate(s.createdAt)} · by {s.importedBy?.fullName}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-600">
                    <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{s.rowsImported} imported</span>
                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s.rowsSkipped} skipped</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === "COMPLETED" ? "bg-green-100 text-green-700" : s.status === "FAILED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ════════════════ RECONCILE MODAL ════════════════ */}
      {reconciling && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Edit Mapping</h3>
              <button onClick={() => setReconciling(null)} className="text-gray-400 hover:text-gray-600"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Transaction info */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-medium text-gray-800 truncate">{reconciling.description}</p>
                <p className={`font-bold ${reconciling.crDr === "CR" ? "text-green-600" : "text-red-600"}`}>
                  {reconciling.crDr === "CR" ? "+" : "−"}{fmt(reconciling.amount)} · {fmtDate(reconciling.txnDate)}
                </p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Reconcile Status</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={reconcileForm.reconcileStatus}
                  onChange={(e) => setReconcileForm((f) => ({ ...f, reconcileStatus: e.target.value as BankReconcileStatus }))}
                >
                  {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              {/* Vendor */}
              {(reconcileForm.reconcileStatus === "MATCHED_VENDOR") && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={reconcileForm.matchedVendorId}
                    onChange={(e) => setReconcileForm((f) => ({ ...f, matchedVendorId: e.target.value }))}
                  >
                    <option value="">Select vendor…</option>
                    {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
              )}

              {/* Expense category */}
              {(reconcileForm.reconcileStatus === "MATCHED_EXPENSE") && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Expense Category</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    value={reconcileForm.expenseCategoryId}
                    onChange={(e) => setReconcileForm((f) => ({ ...f, expenseCategoryId: e.target.value }))}
                  >
                    <option value="">Select category…</option>
                    {expenseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {/* Note */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Review Note (optional)</label>
                <textarea
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                  rows={2}
                  value={reconcileForm.reviewNote}
                  onChange={(e) => setReconcileForm((f) => ({ ...f, reviewNote: e.target.value }))}
                  placeholder="Add a note…"
                />
              </div>
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setReconciling(null)} className="flex-1 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Cancel</button>
              <button
                onClick={submitReconcile}
                disabled={reconcilingLoading}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {reconcilingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Save Mapping
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
