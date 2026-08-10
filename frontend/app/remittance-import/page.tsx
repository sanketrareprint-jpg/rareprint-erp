"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  Upload, Loader2, CheckCircle, AlertCircle, XCircle,
  PackageCheck, Search, FileText, Ban, Link2,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type MatchStatus = "NEEDS_REVIEW" | "MATCHED" | "POSTED" | "DUPLICATE" | "REJECTED";
type Tab = "matched" | "review" | "posted" | "rejected" | "sessions";

interface OrderRef {
  id: string;
  orderNumber: string;
  grandTotal: string;
  paymentStatus: string;
  balanceDue: number;
  customer: { businessName: string; phone: string | null };
}

interface RemittanceRecord {
  id: string;
  sessionId: string;
  remittanceRef?: string | null;
  awbNumber: string;
  courierName?: string | null;
  deliveryDate?: string | null;
  remittanceDate?: string | null;
  collectableAmount: string;
  earlyCodAmount?: string | null;
  otherDeduction?: string | null;
  netPayableAmount: string;
  channelOrderId?: string | null;
  receiverName?: string | null;
  receiverMobile?: string | null;
  matchStatus: MatchStatus;
  matchMethod?: string | null;
  mobileMismatch: boolean;
  reviewNote?: string | null;
  matchedOrder?: OrderRef | null;
  suggestedOrder?: OrderRef | null;
  postedPayment?: { id: string; amount: string; paymentDate: string } | null;
  postedBy?: { id: string; fullName: string } | null;
  createdAt: string;
}

interface ImportSession {
  id: string;
  fileName: string;
  deliveredFileName?: string | null;
  rowsFound: number;
  rowsMatched: number;
  rowsNeedReview: number;
  rowsDuplicate: number;
  rowsPosted: number;
  createdAt: string;
  remittanceDateFrom?: string | null;
  remittanceDateTo?: string | null;
  importedBy?: { fullName: string };
}

interface OrderSearchResult {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string | null;
  grandTotal: string;
  paymentStatus: string;
  balanceDue: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined) {
  if (amount == null) return "—";
  return "₹" + Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 });
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** Formats the remittance date(s) for a session — a single date when every row in the
 *  imported report shares one date, or a "from – to" range if the report spans more than one. */
function fmtRemittanceDateRange(from?: string | null, to?: string | null) {
  if (!from && !to) return "—";
  if (!from) return fmtDate(to);
  if (!to || from === to) return fmtDate(from);
  return `${fmtDate(from)} – ${fmtDate(to)}`;
}

const MATCH_METHOD_LABEL: Record<string, string> = {
  MOBILE: "Mobile number",
  "MOBILE+ORDER_NUMBER": "Mobile + Order #",
  "MOBILE+SHIPMENT_AWB": "Mobile + AWB",
  "MOBILE+ORDER_NUMBER+SHIPMENT_AWB": "Mobile + Order # + AWB",
  MOBILE_AMBIGUOUS: "Mobile (multiple orders)",
  "ORDER_NUMBER+SHIPMENT_AWB": "Order # + AWB",
  ORDER_NUMBER: "Order #",
  SHIPMENT_AWB: "Shipment AWB",
  PHONE_SUGGESTED: "Phone (suggested)",
  MANUAL: "Manual",
};

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function RemittanceImportPage() {
  const router = useRouter();
  const remittanceFileRef = useRef<HTMLInputElement>(null);
  const deliveredFileRef = useRef<HTMLInputElement>(null);

  const [showImportPanel, setShowImportPanel] = useState(false);
  const [remittanceFile, setRemittanceFile] = useState<File | null>(null);
  const [deliveredFile, setDeliveredFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState("");

  const [sessions, setSessions] = useState<ImportSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  const [activeTab, setActiveTab] = useState<Tab>("review");
  const [records, setRecords] = useState<RemittanceRecord[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [recordsPage, setRecordsPage] = useState(1);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [summary, setSummary] = useState<{ byStatus: Array<{ matchStatus: MatchStatus; _count: number; _sum: { collectableAmount: string | null; netPayableAmount: string | null } }> } | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [amountOverrides, setAmountOverrides] = useState<Record<string, string>>({});
  const [posting, setPosting] = useState(false);

  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [matchQuery, setMatchQuery] = useState("");
  const [matchResults, setMatchResults] = useState<OrderSearchResult[]>([]);
  const [matchSearching, setMatchSearching] = useState(false);
  const [rejectNoteDraft, setRejectNoteDraft] = useState("");

  const STATUS_FOR_TAB: Record<Tab, MatchStatus | null> = {
    matched: "MATCHED",
    review: "NEEDS_REVIEW",
    posted: "POSTED",
    rejected: "REJECTED",
    sessions: null,
  };

  // ─── API helpers ────────────────────────────────────────────────────────────

  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const headers = getAuthHeaders();
    const res = await fetch(`${API_BASE_URL}${path}`, { ...opts, headers: { ...headers, ...(opts?.headers ?? {}) } });
    if (res.status === 401) { router.push("/login"); return null; }
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || res.statusText); }
    return res.json();
  }, [router]);

  // ─── Load data ──────────────────────────────────────────────────────────────

  const loadSessions = useCallback(async () => {
    const data = await apiFetch("/remittance/sessions").catch(() => []);
    if (data) setSessions(data);
  }, [apiFetch]);

  const loadSummary = useCallback(async () => {
    const qs = selectedSessionId ? `?sessionId=${selectedSessionId}` : "";
    const data = await apiFetch(`/remittance/summary${qs}`).catch(() => null);
    if (data) setSummary(data);
  }, [apiFetch, selectedSessionId]);

  const loadRecords = useCallback(async (page = 1) => {
    const status = STATUS_FOR_TAB[activeTab];
    if (!status) return;
    setLoadingRecords(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50", matchStatus: status });
      if (selectedSessionId) params.set("sessionId", selectedSessionId);
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      const data = await apiFetch(`/remittance/records?${params}`);
      if (data) { setRecords(data.data); setRecordsTotal(data.total); setRecordsPage(page); }
    } finally { setLoadingRecords(false); }
  }, [apiFetch, activeTab, selectedSessionId, debouncedSearch]);

  // Debounce the search box so we're not firing a request on every keystroke —
  // matches the pattern used on the Orders page's search field.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    setSelectedIds(new Set());
    setExpandedRecord(null);
    if (activeTab !== "sessions") loadRecords(1);
  }, [activeTab, selectedSessionId, debouncedSearch, loadRecords]);

  const countFor = (status: MatchStatus) => summary?.byStatus.find((s) => s.matchStatus === status)?._count ?? 0;

  // ─── Import ─────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!remittanceFile) { setImportError("Please choose the Remittance Report file"); return; }
    setImporting(true);
    setImportError("");
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("remittanceFile", remittanceFile);
      if (deliveredFile) formData.append("deliveredOrdersFile", deliveredFile);
      const { "Content-Type": _ct, ...uploadHeaders } = getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/remittance/import`, {
        method: "POST",
        headers: uploadHeaders,
        body: formData,
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "Import failed"); }
      const result = await res.json();
      setImportResult(result);
      setRemittanceFile(null);
      setDeliveredFile(null);
      if (remittanceFileRef.current) remittanceFileRef.current.value = "";
      if (deliveredFileRef.current) deliveredFileRef.current.value = "";
      setSelectedSessionId(result.sessionId);
      setActiveTab(result.needsReview > 0 ? "review" : "matched");
      loadSessions();
      loadSummary();
    } catch (err: any) {
      setImportError(err.message);
    } finally {
      setImporting(false);
    }
  };

  // ─── Posting ────────────────────────────────────────────────────────────────

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const postOne = async (id: string) => {
    setPosting(true);
    try {
      const override = amountOverrides[id];
      const body = override ? { amount: parseFloat(override) } : {};
      await apiFetch(`/remittance/records/${id}/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      await Promise.all([loadRecords(recordsPage), loadSummary(), loadSessions()]);
    } catch (err: any) {
      alert(err.message || "Failed to post receipt");
    } finally {
      setPosting(false);
    }
  };

  const postSelected = async () => {
    if (selectedIds.size === 0) return;
    setPosting(true);
    try {
      // Post one-by-one so per-row amount overrides are respected.
      for (const id of Array.from(selectedIds)) {
        const override = amountOverrides[id];
        const body = override ? { amount: parseFloat(override) } : {};
        await apiFetch(`/remittance/records/${id}/post`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      }
      setSelectedIds(new Set());
      await Promise.all([loadRecords(1), loadSummary(), loadSessions()]);
    } finally {
      setPosting(false);
    }
  };

  // ─── Manual match ───────────────────────────────────────────────────────────

  const openMatchPanel = (record: RemittanceRecord) => {
    const already = expandedRecord === record.id;
    setExpandedRecord(already ? null : record.id);
    setMatchQuery(record.receiverMobile || record.channelOrderId || "");
    setMatchResults([]);
    setRejectNoteDraft("");
  };

  useEffect(() => {
    if (!expandedRecord || matchQuery.trim().length < 2) { setMatchResults([]); return; }
    const t = setTimeout(async () => {
      setMatchSearching(true);
      try {
        const data = await apiFetch(`/remittance/order-search?q=${encodeURIComponent(matchQuery.trim())}`);
        if (data) setMatchResults(data);
      } finally { setMatchSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [matchQuery, expandedRecord, apiFetch]);

  const confirmMatch = async (recordId: string, orderId: string) => {
    try {
      await apiFetch(`/remittance/records/${recordId}/match`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId }) });
      setExpandedRecord(null);
      await Promise.all([loadRecords(recordsPage), loadSummary()]);
    } catch (err: any) {
      alert(err.message || "Failed to match order");
    }
  };

  const rejectRecord = async (recordId: string) => {
    try {
      await apiFetch(`/remittance/records/${recordId}/reject`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: rejectNoteDraft }) });
      setExpandedRecord(null);
      await Promise.all([loadRecords(recordsPage), loadSummary()]);
    } catch (err: any) {
      alert(err.message || "Failed to reject row");
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      <div className="p-4 md:p-6 space-y-5 max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <PackageCheck className="w-7 h-7 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">COD Remittance Import</h1>
              <p className="text-xs text-gray-500">Match courier remittance reports to orders and post receipts</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 outline-none focus:border-blue-400 max-w-64"
            >
              <option value="">All imports</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>{s.fileName} · {fmtDate(s.createdAt)}</option>
              ))}
            </select>
            <button
              onClick={() => setShowImportPanel((v) => !v)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              <Upload className="w-4 h-4" /> Import Reports
            </button>
          </div>
        </div>

        {/* ── Import panel ── */}
        {showImportPanel && (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <p className="text-sm text-gray-600">Upload both courier exports. The Remittance Report is required; the Delivered Orders Report supplies the order number / receiver mobile used for matching, so include it whenever you have it.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">Remittance Report (required)</span>
                <input
                  ref={remittanceFileRef}
                  type="file"
                  accept=".xls,.xlsx,.csv"
                  onChange={(e) => setRemittanceFile(e.target.files?.[0] ?? null)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-500">Delivered Orders Report (recommended)</span>
                <input
                  ref={deliveredFileRef}
                  type="file"
                  accept=".xls,.xlsx,.csv"
                  onChange={(e) => setDeliveredFile(e.target.files?.[0] ?? null)}
                  className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50"
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleImport}
                disabled={importing || !remittanceFile}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {importing ? "Importing…" : "Upload & Match"}
              </button>
              {importError && <span className="text-sm text-red-600">{importError}</span>}
            </div>
          </div>
        )}

        {/* ── Import result banner ── */}
        {importResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-green-800">Import complete — {importResult.totalInFile} rows processed</p>
              <p className="text-sm text-green-700 mt-0.5">
                Matched (ready to post): {importResult.matched} · Needs review: {importResult.needsReview} · Already imported: {importResult.duplicate}
              </p>
            </div>
            <button onClick={() => setImportResult(null)} className="ml-auto text-green-600 hover:text-green-800"><XCircle className="w-4 h-4" /></button>
          </div>
        )}

        {/* ── Summary cards ── */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5 text-blue-500" />Ready to Post</p>
              <p className="text-lg font-bold text-blue-600">{countFor("MATCHED")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5 text-yellow-500" />Needs Review</p>
              <p className="text-lg font-bold text-yellow-600">{countFor("NEEDS_REVIEW")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><PackageCheck className="w-3.5 h-3.5 text-green-500" />Posted</p>
              <p className="text-lg font-bold text-green-600">{countFor("POSTED")}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1 flex items-center gap-1"><Ban className="w-3.5 h-3.5 text-gray-400" />Rejected</p>
              <p className="text-lg font-bold text-gray-500">{countFor("REJECTED")}</p>
            </div>
          </div>
        )}

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit flex-wrap">
          {(["review", "matched", "posted", "rejected", "sessions"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-white shadow text-gray-900" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "review" && <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-yellow-500" />Needs Review {countFor("NEEDS_REVIEW") > 0 && <span className="bg-yellow-500 text-white text-xs rounded-full px-1.5">{countFor("NEEDS_REVIEW")}</span>}</span>}
              {tab === "matched" && <span className="flex items-center gap-1.5"><CheckCircle className="w-3.5 h-3.5 text-blue-500" />Ready to Post</span>}
              {tab === "posted" && <span className="flex items-center gap-1.5"><PackageCheck className="w-3.5 h-3.5 text-green-500" />Posted</span>}
              {tab === "rejected" && <span className="flex items-center gap-1.5"><Ban className="w-3.5 h-3.5" />Rejected</span>}
              {tab === "sessions" && <span className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" />Import History</span>}
            </button>
          ))}
        </div>

        {/* ── Search — filters the current tab server-side across AWB, receiver
             name/mobile, channel order id, remittance ref, and matched/suggested
             order number + customer name/phone. Doesn't apply to Import History. ── */}
        {activeTab !== "sessions" && (
          <div className="relative max-w-sm">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search AWB, mobile, name, order #..."
              className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Clear"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        {/* ════════════════ SESSIONS TAB ════════════════ */}
        {activeTab === "sessions" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Imported</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Remittance Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Remittance File</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Delivered Orders File</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Rows</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Matched</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Review</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Posted</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setSelectedSessionId(s.id); setActiveTab("review"); }}>
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(s.createdAt)}</td>
                    <td className="px-4 py-2.5 text-gray-800 whitespace-nowrap">{fmtRemittanceDateRange(s.remittanceDateFrom, s.remittanceDateTo)}</td>
                    <td className="px-4 py-2.5 text-gray-800">{s.fileName}</td>
                    <td className="px-4 py-2.5 text-gray-500">{s.deliveredFileName || "—"}</td>
                    <td className="px-4 py-2.5 text-right">{s.rowsFound}</td>
                    <td className="px-4 py-2.5 text-right text-blue-600">{s.rowsMatched}</td>
                    <td className="px-4 py-2.5 text-right text-yellow-600">{s.rowsNeedReview}</td>
                    <td className="px-4 py-2.5 text-right text-green-600">{s.rowsPosted}</td>
                    <td className="px-4 py-2.5 text-gray-500">{s.importedBy?.fullName || "—"}</td>
                  </tr>
                ))}
                {sessions.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12 text-gray-400">No imports yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ════════════════ MATCHED (Ready to Post) TAB ════════════════ */}
        {activeTab === "matched" && (
          <div className="bg-white rounded-xl border border-gray-200">
            {selectedIds.size > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                <span className="text-sm text-blue-800">{selectedIds.size} selected</span>
                <button
                  onClick={postSelected}
                  disabled={posting}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {posting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
                  Post {selectedIds.size} Receipt{selectedIds.size > 1 ? "s" : ""}
                </button>
              </div>
            )}
            {loadingRecords ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-2.5 w-8"></th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">AWB</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Order</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Customer</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Matched via</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Customer balance due</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Receipt amount</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Net to bank</th>
                      <th className="px-4 py-2.5 w-28"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {records.map((r) => {
                      const balanceDue = r.matchedOrder?.balanceDue;
                      const collected = Number(amountOverrides[r.id] ?? r.collectableAmount);
                      const mismatch = balanceDue != null && Math.abs(balanceDue - collected) > 1;
                      return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5">
                          <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelected(r.id)} />
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{r.awbNumber}</td>
                        <td className="px-4 py-2.5 text-gray-800">#{r.matchedOrder?.orderNumber}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.matchedOrder?.customer.businessName}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-400">{MATCH_METHOD_LABEL[r.matchMethod ?? ""] ?? r.matchMethod}</td>
                        <td className={`px-4 py-2.5 text-right text-xs ${mismatch ? "text-amber-600 font-semibold" : "text-gray-500"}`}>
                          {balanceDue != null ? fmt(balanceDue) : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            defaultValue={r.collectableAmount}
                            onChange={(e) => setAmountOverrides((prev) => ({ ...prev, [r.id]: e.target.value }))}
                            className="w-24 text-right border border-gray-200 rounded px-2 py-1 text-sm"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400 text-xs">{fmt(r.netPayableAmount)}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => postOne(r.id)}
                            disabled={posting}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                          >
                            Post
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                    {records.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-12 text-gray-400">{debouncedSearch ? "No matches for your search" : "Nothing ready to post"}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ NEEDS REVIEW TAB ════════════════ */}
        {activeTab === "review" && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {loadingRecords ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : records.length === 0 ? (
              <p className="text-center py-12 text-gray-400">{debouncedSearch ? "No matches for your search" : "Nothing needs review 🎉"}</p>
            ) : records.map((r) => {
              const isExpanded = expandedRecord === r.id;
              return (
                <div key={r.id} className="p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="flex-1 min-w-64">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-500">{r.awbNumber}</span>
                        {r.channelOrderId && <span className="text-xs text-gray-400">Channel Id: {r.channelOrderId}</span>}
                        {r.mobileMismatch && <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">Mobile mismatch</span>}
                      </div>
                      <p className="text-sm text-gray-800 mt-1">{r.receiverName || "Unknown receiver"} · {r.receiverMobile || "no mobile"}</p>
                      {r.reviewNote && <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-100 rounded px-2 py-1 mt-1.5">{r.reviewNote}</p>}
                      {r.suggestedOrder && (
                        <p className="text-xs text-gray-500 mt-1.5">
                          Suggested: <span className="font-medium text-gray-700">Order #{r.suggestedOrder.orderNumber}</span> — {r.suggestedOrder.customer.businessName} ({r.suggestedOrder.customer.phone || "no phone"}), balance due {fmt(r.suggestedOrder.balanceDue)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-800">{fmt(r.collectableAmount)}</p>
                      <p className="text-xs text-gray-400">collected</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {r.suggestedOrder && (
                        <button
                          onClick={() => confirmMatch(r.id, r.suggestedOrder!.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                        >
                          <Link2 className="w-3.5 h-3.5" /> Confirm suggested
                        </button>
                      )}
                      <button
                        onClick={() => openMatchPanel(r)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-gray-200 text-xs font-medium rounded-lg hover:bg-gray-50"
                      >
                        <Search className="w-3.5 h-3.5" /> {isExpanded ? "Close" : "Match manually"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-3">
                      <div className="flex items-center gap-2">
                        <Search className="w-4 h-4 text-gray-400" />
                        <input
                          autoFocus
                          value={matchQuery}
                          onChange={(e) => setMatchQuery(e.target.value)}
                          placeholder="Search order number, customer name, or phone…"
                          className="flex-1 bg-white text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:border-blue-400"
                        />
                        {matchSearching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                      </div>
                      <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                        {matchResults.map((o) => (
                          <div key={o.id} className="flex items-center justify-between py-2 px-1">
                            <div>
                              <p className="text-sm text-gray-800">#{o.orderNumber} — {o.customerName}</p>
                              <p className="text-xs text-gray-400">{o.customerPhone || "no phone"} · balance due {fmt(o.balanceDue)} · {o.paymentStatus}</p>
                            </div>
                            <button
                              onClick={() => confirmMatch(r.id, o.id)}
                              className="px-2.5 py-1 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                            >
                              Match
                            </button>
                          </div>
                        ))}
                        {matchQuery.trim().length >= 2 && !matchSearching && matchResults.length === 0 && (
                          <p className="text-xs text-gray-400 py-2">No orders found</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-2 border-t border-gray-200">
                        <input
                          value={rejectNoteDraft}
                          onChange={(e) => setRejectNoteDraft(e.target.value)}
                          placeholder="Reason (optional) — e.g. duplicate, cancelled order…"
                          className="flex-1 bg-white text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none"
                        />
                        <button
                          onClick={() => rejectRecord(r.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50"
                        >
                          <Ban className="w-3.5 h-3.5" /> Reject row
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ════════════════ POSTED TAB ════════════════ */}
        {activeTab === "posted" && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            {loadingRecords ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">AWB</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Order</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Customer</th>
                    <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500">Receipt Amount</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">Posted</th>
                    <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{r.awbNumber}</td>
                      <td className="px-4 py-2.5 text-gray-800">#{r.matchedOrder?.orderNumber}</td>
                      <td className="px-4 py-2.5 text-gray-600">{r.matchedOrder?.customer.businessName}</td>
                      <td className="px-4 py-2.5 text-right text-green-600 font-medium">{fmt(r.postedPayment?.amount)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{fmtDate(r.postedPayment?.paymentDate)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{r.postedBy?.fullName || "—"}</td>
                    </tr>
                  ))}
                  {records.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-12 text-gray-400">{debouncedSearch ? "No matches for your search" : "No receipts posted yet"}</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ════════════════ REJECTED TAB ════════════════ */}
        {activeTab === "rejected" && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
            {loadingRecords ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
            ) : records.length === 0 ? (
              <p className="text-center py-12 text-gray-400">{debouncedSearch ? "No matches for your search" : "No rejected rows"}</p>
            ) : records.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="font-mono text-xs text-gray-500 w-36">{r.awbNumber}</span>
                <span className="text-sm text-gray-600 flex-1">{r.reviewNote || "Rejected"}</span>
                <span className="text-sm font-medium text-gray-700">{fmt(r.collectableAmount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Pagination (matched/review/posted/rejected) ── */}
        {activeTab !== "sessions" && recordsTotal > 50 && (
          <div className="flex items-center justify-between px-1 text-sm text-gray-600">
            <span>{recordsTotal} total entries</span>
            <div className="flex gap-2">
              <button disabled={recordsPage <= 1} onClick={() => loadRecords(recordsPage - 1)} className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40">Prev</button>
              <span className="px-3 py-1">Page {recordsPage} of {Math.ceil(recordsTotal / 50)}</span>
              <button disabled={recordsPage >= Math.ceil(recordsTotal / 50)} onClick={() => loadRecords(recordsPage + 1)} className="px-3 py-1 border border-gray-200 rounded disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
