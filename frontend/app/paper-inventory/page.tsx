"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, clearAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  Upload, Plus, Trash2, Loader2, FileText, RefreshCw,
  Package, BarChart3, History, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, X, Image as ImageIcon
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type SheetQuality = "MAPLITHO" | "STICKER" | "BOND" | "ART_CARD" | "DUPLEX_CARD_WB" | "DUPLEX_CARD_GB";
type PaperUnit = "REAM" | "PACKET";

interface Vendor { id: string; name: string; phone?: string; isPress?: boolean; }

interface POItem {
  paperName: string;
  gsm: number | string;
  quality: SheetQuality | "";
  sizeInches: string;
  unit: PaperUnit;
  unitQuantity: number | string;
  sheetsPerUnit: number | string;
  pressId: string;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  invoiceNumber?: string;
  invoiceImagePath?: string;
  status: string;
  createdAt: string;
  supplier?: { name: string };
  items: Array<{
    id: string;
    paperName: string;
    gsm: number;
    quality: SheetQuality;
    unit: PaperUnit;
    unitQuantity: number;
    sheetsPerUnit: number;
    totalSheets: number;
    press: { id: string; name: string };
  }>;
}

interface InventoryItem {
  gsm: number;
  quality: string;
  balanceSheets: number;
  balanceReams: string;
}

interface PressStatement {
  pressId: string;
  pressName: string;
  pressPhone: string | null;
  items: InventoryItem[];
  totalSheets: number;
}

interface Transaction {
  id: string;
  pressId: string;
  gsm: number;
  quality: string;
  transactionType: string;
  sheets: number;
  balanceAfter: number;
  notes?: string;
  createdAt: string;
  press: { name: string };
}

// ── Constants ──────────────────────────────────────────────────────────────
const QUALITY_LABELS: Record<SheetQuality, string> = {
  MAPLITHO: "Maplitho",
  STICKER: "Sticker",
  BOND: "Bond",
  ART_CARD: "Art Card",
  DUPLEX_CARD_WB: "Duplex WB",
  DUPLEX_CARD_GB: "Duplex GB",
};
const QUALITIES: SheetQuality[] = ["MAPLITHO", "STICKER", "BOND", "ART_CARD", "DUPLEX_CARD_WB", "DUPLEX_CARD_GB"];

function qualityColor(q: string) {
  const map: Record<string, string> = {
    MAPLITHO: "bg-blue-100 text-blue-700",
    STICKER: "bg-yellow-100 text-yellow-700",
    BOND: "bg-gray-100 text-gray-700",
    ART_CARD: "bg-purple-100 text-purple-700",
    DUPLEX_CARD_WB: "bg-orange-100 text-orange-700",
    DUPLEX_CARD_GB: "bg-red-100 text-red-700",
  };
  return map[q] ?? "bg-gray-100 text-gray-600";
}

function txTypeColor(t: string) {
  if (t === "PURCHASE") return "text-green-600";
  if (t === "PRINTING_DEDUCTION") return "text-red-600";
  return "text-yellow-600";
}

function computeSheets(unit: PaperUnit, unitQty: number, sheetsPerUnit: number): number {
  if (unit === "REAM") return Math.round(unitQty * 500);
  return Math.round(unitQty * sheetsPerUnit);
}

function emptyItem(): POItem {
  return { paperName: "", gsm: "", quality: "", sizeInches: "", unit: "REAM", unitQuantity: "", sheetsPerUnit: 500, pressId: "" };
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function PaperInventoryPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"po" | "statement" | "history">("po");

  // PO state
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const [showCreatePO, setShowCreatePO] = useState(false);

  // Statement
  const [statements, setStatements] = useState<PressStatement[]>([]);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const [filterPressId, setFilterPressId] = useState<string>("");

  // Transactions
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [filterTxPress, setFilterTxPress] = useState<string>("");

  // ── API helpers ──────────────────────────────────────────────────────────
  const apiFetch = useCallback(async (path: string, opts?: RequestInit) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...opts,
      headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) },
    });
    if (res.status === 401) { clearAuth(); router.push("/login"); return null; }
    return res;
  }, [router]);

  // ── Load vendors ─────────────────────────────────────────────────────────
  const loadVendors = useCallback(async () => {
    const res = await apiFetch("/paper-inventory/vendors");
    if (!res) return;
    const data = await res.json();
    setVendors(Array.isArray(data) ? data : []);
  }, [apiFetch]);

  // ── Load purchase orders ──────────────────────────────────────────────────
  const loadPOs = useCallback(async () => {
    setLoadingPOs(true);
    try {
      const res = await apiFetch("/paper-inventory/purchase-orders");
      if (!res) return;
      const data = await res.json();
      setPurchaseOrders(Array.isArray(data) ? data : []);
    } finally { setLoadingPOs(false); }
  }, [apiFetch]);

  // ── Load statement ────────────────────────────────────────────────────────
  const loadStatement = useCallback(async (pressId?: string) => {
    setLoadingStatement(true);
    try {
      const q = pressId ? `?pressId=${pressId}` : "";
      const res = await apiFetch(`/paper-inventory/statement${q}`);
      if (!res) return;
      const data = await res.json();
      setStatements(Array.isArray(data) ? data : []);
    } finally { setLoadingStatement(false); }
  }, [apiFetch]);

  // ── Load transactions ─────────────────────────────────────────────────────
  const loadTransactions = useCallback(async (pressId?: string) => {
    setLoadingTx(true);
    try {
      const q = pressId ? `?pressId=${pressId}` : "";
      const res = await apiFetch(`/paper-inventory/transactions${q}`);
      if (!res) return;
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } finally { setLoadingTx(false); }
  }, [apiFetch]);

  useEffect(() => { loadVendors(); loadPOs(); }, [loadVendors, loadPOs]);
  useEffect(() => { if (tab === "statement") loadStatement(filterPressId || undefined); }, [tab, filterPressId, loadStatement]);
  useEffect(() => { if (tab === "history") loadTransactions(filterTxPress || undefined); }, [tab, filterTxPress, loadTransactions]);

  return (
    <DashboardShell>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Paper Inventory</h1>
            <p className="text-sm text-gray-500 mt-0.5">Purchase paper, track press-wise stock, manage printing allocation</p>
          </div>
          {tab === "po" && (
            <button
              onClick={() => setShowCreatePO(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> New Purchase Order
            </button>
          )}
          {tab === "statement" && (
            <button onClick={() => loadStatement(filterPressId || undefined)} className="flex items-center gap-2 text-sm text-gray-600 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50">
              <RefreshCw className="h-4 w-4" /> Refresh
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          {[
            { key: "po", label: "Purchase Orders", icon: Package },
            { key: "statement", label: "Press Statement", icon: BarChart3 },
            { key: "history", label: "Transaction History", icon: History },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key as typeof tab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === key ? "bg-white text-blue-700 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "po" && (
          <POTab
            purchaseOrders={purchaseOrders}
            loading={loadingPOs}
            onRefresh={loadPOs}
            apiBase={API_BASE_URL}
          />
        )}
        {tab === "statement" && (
          <StatementTab
            statements={statements}
            loading={loadingStatement}
            vendors={vendors}
            filterPressId={filterPressId}
            onFilterChange={(v) => setFilterPressId(v)}
          />
        )}
        {tab === "history" && (
          <HistoryTab
            transactions={transactions}
            loading={loadingTx}
            vendors={vendors}
            filterPressId={filterTxPress}
            onFilterChange={(v) => setFilterTxPress(v)}
          />
        )}
      </div>

      {/* Create PO Modal */}
      {showCreatePO && (
        <CreatePOModal
          vendors={vendors}
          apiBase={API_BASE_URL}
          getHeaders={getAuthHeaders}
          onClose={() => setShowCreatePO(false)}
          onCreated={() => { setShowCreatePO(false); loadPOs(); loadStatement(); }}
        />
      )}
    </DashboardShell>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PO List Tab
// ═══════════════════════════════════════════════════════════════════════════
function POTab({ purchaseOrders, loading, onRefresh, apiBase }: {
  purchaseOrders: PurchaseOrder[];
  loading: boolean;
  onRefresh: () => void;
  apiBase: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>;

  if (!purchaseOrders.length) {
    return (
      <div className="text-center py-16 text-gray-500">
        <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No purchase orders yet</p>
        <p className="text-sm mt-1">Create your first paper PO to get started</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {purchaseOrders.map((po) => (
        <div key={po.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div
            className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-gray-50"
            onClick={() => setExpanded(expanded === po.id ? null : po.id)}
          >
            <div className="flex items-center gap-4">
              <div>
                <div className="font-semibold text-gray-900">{po.poNumber}</div>
                {po.invoiceNumber && <div className="text-xs text-gray-500">Invoice: {po.invoiceNumber}</div>}
              </div>
              {po.supplier && <span className="text-sm text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{po.supplier.name}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${po.status === "RECEIVED" ? "bg-green-100 text-green-700" : po.status === "DRAFT" ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"}`}>
                {po.status}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">{po.items.length} item{po.items.length !== 1 ? "s" : ""}</span>
              <span className="text-sm text-gray-400">{new Date(po.createdAt).toLocaleDateString("en-IN")}</span>
              {expanded === po.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
            </div>
          </div>

          {expanded === po.id && (
            <div className="border-t border-gray-100 px-5 pb-5 pt-4">
              {po.invoiceImagePath && (
                <div className="mb-4">
                  <a href={`${apiBase}/uploads/${po.invoiceImagePath.replace("uploads/", "")}`} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                    <ImageIcon className="h-4 w-4" /> View Invoice Image
                  </a>
                </div>
              )}
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="pb-2 font-medium">Paper</th>
                    <th className="pb-2 font-medium">GSM</th>
                    <th className="pb-2 font-medium">Quality</th>
                    <th className="pb-2 font-medium">Purchased</th>
                    <th className="pb-2 font-medium">Sheets</th>
                    <th className="pb-2 font-medium">Press</th>
                  </tr>
                </thead>
                <tbody>
                  {po.items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0">
                      <td className="py-2 text-gray-900">{item.paperName}</td>
                      <td className="py-2 text-gray-700 font-mono">{item.gsm}</td>
                      <td className="py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${qualityColor(item.quality)}`}>
                          {QUALITY_LABELS[item.quality] ?? item.quality}
                        </span>
                      </td>
                      <td className="py-2 text-gray-700">
                        {item.unitQuantity} {item.unit === "REAM" ? "Ream" : `Packet (${item.sheetsPerUnit} sh/pkt)`}
                      </td>
                      <td className="py-2 font-medium text-gray-900">{item.totalSheets.toLocaleString("en-IN")} sheets</td>
                      <td className="py-2 text-blue-700 font-medium">{item.press?.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Press Statement Tab
// ═══════════════════════════════════════════════════════════════════════════
function StatementTab({ statements, loading, vendors, filterPressId, onFilterChange }: {
  statements: PressStatement[];
  loading: boolean;
  vendors: Vendor[];
  filterPressId: string;
  onFilterChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Filter by Press:</label>
        <select
          value={filterPressId}
          onChange={(e) => onFilterChange(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Presses</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
      ) : statements.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No inventory data yet</p>
          <p className="text-sm mt-1">Create purchase orders to see press-wise balances</p>
        </div>
      ) : (
        <div className="space-y-6">
          {statements.map((press) => (
            <div key={press.pressId} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
              {/* Press header */}
              <div className="px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-gray-900">{press.pressName}</h3>
                    {press.pressPhone && <p className="text-sm text-gray-500">{press.pressPhone}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-700">{press.totalSheets.toLocaleString("en-IN")}</div>
                    <div className="text-xs text-gray-500">total sheets in stock</div>
                  </div>
                </div>
              </div>

              {/* Items table */}
              <div className="px-6 py-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="pb-2 font-medium">GSM</th>
                      <th className="pb-2 font-medium">Paper Type</th>
                      <th className="pb-2 font-medium text-right">Balance (Sheets)</th>
                      <th className="pb-2 font-medium text-right">Balance (Reams)</th>
                      <th className="pb-2 font-medium text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {press.items.map((item, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="py-3 font-mono font-semibold text-gray-900">{item.gsm} GSM</td>
                        <td className="py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${qualityColor(item.quality)}`}>
                            {QUALITY_LABELS[item.quality as SheetQuality] ?? item.quality}
                          </span>
                        </td>
                        <td className="py-3 text-right font-semibold text-gray-900">{item.balanceSheets.toLocaleString("en-IN")}</td>
                        <td className="py-3 text-right text-gray-600">{item.balanceReams}</td>
                        <td className="py-3 text-right">
                          {item.balanceSheets <= 0 ? (
                            <span className="flex items-center justify-end gap-1 text-red-600 text-xs font-medium">
                              <AlertCircle className="h-3.5 w-3.5" /> Out of stock
                            </span>
                          ) : item.balanceSheets < 500 ? (
                            <span className="flex items-center justify-end gap-1 text-orange-500 text-xs font-medium">
                              <AlertCircle className="h-3.5 w-3.5" /> Low stock
                            </span>
                          ) : (
                            <span className="flex items-center justify-end gap-1 text-green-600 text-xs font-medium">
                              <CheckCircle className="h-3.5 w-3.5" /> Available
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Transaction History Tab
// ═══════════════════════════════════════════════════════════════════════════
function HistoryTab({ transactions, loading, vendors, filterPressId, onFilterChange }: {
  transactions: Transaction[];
  loading: boolean;
  vendors: Vendor[];
  filterPressId: string;
  onFilterChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Filter by Press:</label>
        <select
          value={filterPressId}
          onChange={(e) => onFilterChange(e.target.value)}
          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Presses</option>
          {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-500" /></div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No transactions yet</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Press</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Paper</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Sheets</th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance After</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-500 text-xs">{new Date(tx.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-5 py-3 font-medium text-gray-900">{tx.press.name}</td>
                  <td className="px-5 py-3">
                    <span className="font-mono text-xs font-semibold">{tx.gsm} GSM</span>
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${qualityColor(tx.quality)}`}>{QUALITY_LABELS[tx.quality as SheetQuality] ?? tx.quality}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold ${txTypeColor(tx.transactionType)}`}>
                      {tx.transactionType === "PURCHASE" ? "Purchase IN" : tx.transactionType === "PRINTING_DEDUCTION" ? "Print OUT" : "Adjustment"}
                    </span>
                  </td>
                  <td className={`px-5 py-3 text-right font-mono font-bold ${tx.sheets > 0 ? "text-green-600" : "text-red-600"}`}>
                    {tx.sheets > 0 ? "+" : ""}{tx.sheets.toLocaleString("en-IN")}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-gray-700">{tx.balanceAfter.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-3 text-xs text-gray-500 max-w-xs truncate">{tx.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Create PO Modal  — with AI invoice extraction
// ═══════════════════════════════════════════════════════════════════════════
function CreatePOModal({ vendors, apiBase, getHeaders, onClose, onCreated }: {
  vendors: Vendor[];
  apiBase: string;
  getHeaders: () => Record<string, string>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItem[]>([emptyItem()]);
  const [invoiceImagePath, setInvoiceImagePath] = useState("");

  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractSuccess, setExtractSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Upload & Extract ────────────────────────────────────────────────────
  const handleInvoiceUpload = async (file: File) => {
    setUploading(true);
    setExtracting(true);
    setExtractSuccess(false);
    setError(null);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const form = new FormData();
      form.append("invoice", file);
      const res = await fetch(`${apiBase}/paper-inventory/extract-invoice`, {
        method: "POST",
        headers: getHeaders(),
        body: form,
      });
      const data = await res.json();

      if (data.invoiceImagePath) setInvoiceImagePath(data.invoiceImagePath);
      if (data.invoiceNumber) setInvoiceNumber(data.invoiceNumber);

      if (Array.isArray(data.items) && data.items.length > 0) {
        const extracted: POItem[] = data.items.map((it: {
          paperName?: string;
          gsm?: number | null;
          quality?: string | null;
          sizeInches?: string | null;
          unit?: string;
          unitQuantity?: number | null;
          sheetsPerUnit?: number | null;
        }) => ({
          paperName: it.paperName ?? "",
          gsm: it.gsm ?? "",
          quality: (it.quality as SheetQuality) ?? "",
          sizeInches: it.sizeInches ?? "",
          unit: (it.unit === "PACKET" ? "PACKET" : "REAM") as PaperUnit,
          unitQuantity: it.unitQuantity ?? "",
          sheetsPerUnit: it.sheetsPerUnit ?? (it.unit === "PACKET" ? "" : 500),
          pressId: "",
        }));
        setItems(extracted);
        setExtractSuccess(true);
      }
    } catch (e) {
      setError("Could not extract invoice data. Please fill in manually.");
    } finally {
      setUploading(false);
      setExtracting(false);
    }
  };

  // ── Item helpers ─────────────────────────────────────────────────────────
  const updateItem = (index: number, field: keyof POItem, value: string | number) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      // Auto-fill sheetsPerUnit for REAM
      if (field === "unit" && value === "REAM") {
        next[index].sheetsPerUnit = 500;
      }
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError(null);

    // Validate
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.paperName) { setError(`Row ${i + 1}: Paper name is required`); return; }
      if (!it.gsm || isNaN(Number(it.gsm))) { setError(`Row ${i + 1}: Valid GSM is required`); return; }
      if (!it.quality) { setError(`Row ${i + 1}: Quality is required`); return; }
      if (!it.unitQuantity || isNaN(Number(it.unitQuantity))) { setError(`Row ${i + 1}: Valid quantity is required`); return; }
      if (it.unit === "PACKET" && (!it.sheetsPerUnit || isNaN(Number(it.sheetsPerUnit)))) {
        setError(`Row ${i + 1}: Sheets per packet is required for Packet unit`); return;
      }
      if (!it.pressId) { setError(`Row ${i + 1}: Please select a press`); return; }
    }

    setSaving(true);
    try {
      const payload = {
        invoiceNumber: invoiceNumber || undefined,
        invoiceImagePath: invoiceImagePath || undefined,
        supplierId: supplierId || undefined,
        notes: notes || undefined,
        items: items.map((it) => ({
          paperName: it.paperName,
          gsm: Number(it.gsm),
          quality: it.quality as SheetQuality,
          sizeInches: it.sizeInches || undefined,
          unit: it.unit,
          unitQuantity: Number(it.unitQuantity),
          sheetsPerUnit: it.unit === "PACKET" ? Number(it.sheetsPerUnit) : 500,
          pressId: it.pressId,
        })),
      };

      const res = await fetch(`${apiBase}/paper-inventory/purchase-orders`, {
        method: "POST",
        headers: { ...getHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.message ?? "Failed to create purchase order");
        return;
      }

      onCreated();
    } catch (e) {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-bold text-gray-900">New Paper Purchase Order</h2>
            <p className="text-sm text-gray-500 mt-0.5">Upload invoice image for AI auto-fill, or enter manually</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="h-5 w-5 text-gray-500" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Invoice upload + basic info */}
          <div className="grid grid-cols-2 gap-6">
            {/* Left: Upload */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Invoice Image (AI Auto-Fill)</label>
              <div
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${previewUrl ? "border-blue-300 bg-blue-50" : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"}`}
                onClick={() => fileInputRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file) handleInvoiceUpload(file); }}
                onDragOver={(e) => e.preventDefault()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleInvoiceUpload(f); }}
                />
                {previewUrl ? (
                  <div className="space-y-2">
                    <img src={previewUrl} alt="Invoice" className="max-h-28 mx-auto rounded-lg object-contain" />
                    {extracting ? (
                      <div className="flex items-center justify-center gap-2 text-blue-600 text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" /> Extracting invoice data...
                      </div>
                    ) : extractSuccess ? (
                      <div className="flex items-center justify-center gap-2 text-green-600 text-sm">
                        <CheckCircle className="h-4 w-4" /> Items extracted! Review below.
                      </div>
                    ) : null}
                    <p className="text-xs text-gray-500">Click to replace</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="h-8 w-8 mx-auto text-gray-400" />
                    <p className="text-sm text-gray-600 font-medium">Drop or click to upload invoice</p>
                    <p className="text-xs text-gray-400">JPG, PNG, WebP up to 20MB</p>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Invoice details */}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
                <input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="e.g. INV-2025-1234"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier (optional)</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select supplier —</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Any notes about this purchase..."
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Items table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Paper Items — Assign to Press</h3>
              <button onClick={addItem} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium">
                <Plus className="h-4 w-4" /> Add Row
              </button>
            </div>

            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Paper Name</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-20">GSM</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-32">Quality</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-24">Unit</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-20">Qty</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 w-28">Sh/Unit</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 w-24">Sheets</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500">Assign Press ★</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const sheets = (item.unitQuantity !== "" && item.gsm !== "") && !isNaN(Number(item.unitQuantity))
                      ? computeSheets(item.unit, Number(item.unitQuantity), Number(item.sheetsPerUnit) || 500)
                      : null;
                    return (
                      <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <input
                            value={item.paperName}
                            onChange={(e) => updateItem(i, "paperName", e.target.value)}
                            placeholder="Maplitho 70 GSM 18x23"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={item.gsm}
                            onChange={(e) => updateItem(i, "gsm", e.target.value)}
                            placeholder="70"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={item.quality}
                            onChange={(e) => updateItem(i, "quality", e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            <option value="">— type —</option>
                            {QUALITIES.map((q) => <option key={q} value={q}>{QUALITY_LABELS[q]}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={item.unit}
                            onChange={(e) => updateItem(i, "unit", e.target.value)}
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          >
                            <option value="REAM">Ream</option>
                            <option value="PACKET">Packet</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            value={item.unitQuantity}
                            onChange={(e) => updateItem(i, "unitQuantity", e.target.value)}
                            placeholder="10"
                            className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {item.unit === "PACKET" ? (
                            <input
                              type="number"
                              value={item.sheetsPerUnit}
                              onChange={(e) => updateItem(i, "sheetsPerUnit", e.target.value)}
                              placeholder="125"
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-yellow-50"
                            />
                          ) : (
                            <span className="text-xs text-gray-400 px-2">500 (fixed)</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={`text-xs font-semibold ${sheets ? "text-blue-700" : "text-gray-300"}`}>
                            {sheets ? sheets.toLocaleString("en-IN") : "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={item.pressId}
                            onChange={(e) => updateItem(i, "pressId", e.target.value)}
                            className={`w-full border rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${!item.pressId ? "border-orange-300 bg-orange-50" : "border-gray-200"}`}
                          >
                            <option value="">— Select press —</option>
                            {vendors.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}{v.isPress ? " ✓" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          {items.length > 1 && (
                            <button onClick={() => removeItem(i)} className="text-gray-300 hover:text-red-500 p-1">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-2">★ Presses marked with ✓ are tagged as printing presses. Paper balance will be added to the selected press account.</p>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <div className="text-sm text-gray-500">
            {items.length} item{items.length !== 1 ? "s" : ""} &nbsp;·&nbsp;
            Total: <strong className="text-gray-900">
              {items.reduce((sum, it) => {
                const s = (!isNaN(Number(it.unitQuantity)) && Number(it.unitQuantity) > 0)
                  ? computeSheets(it.unit, Number(it.unitQuantity), Number(it.sheetsPerUnit) || 500)
                  : 0;
                return sum + s;
              }, 0).toLocaleString("en-IN")}
            </strong> sheets
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100">Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 font-medium"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
              {saving ? "Saving..." : "Save Purchase Order"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
