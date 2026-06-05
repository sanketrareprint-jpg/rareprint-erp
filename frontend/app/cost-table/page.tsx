"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Settings, Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, IndianRupee, Percent, Save,
  Search, RefreshCw, TrendingUp, Download, Upload,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────

type CostSlab = {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  unitPrice: number;
  setupCost: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
};

type Product = {
  id: string;
  sku: string;
  name: string;
  gsm: number;
  sizeInches: string;
  printingType: string;
  sides: string;
  category: { name: string };
  costSlabs: CostSlab[];
};

type Settings = {
  minApprovalMarginPct: number;
  warningMarginPct: number;
  agentCommissionPct: number;
};

type MarginResult = {
  hasCost: boolean;
  costPerUnit: number | null;
  marginPerUnit: number | null;
  marginPct: number | null;
  totalMargin: number | null;
  commissionAmount: number | null;
  commissionPct: number;
  status: "APPROVED" | "LOW_MARGIN" | "DISAPPROVED" | "NO_COST_DATA";
  message?: string;
  salePricePerUnit: number;
  quantity: number;
  settings: { minApprovalMarginPct: number; warningMarginPct: number };
};

type ImportResult = {
  imported: number;
  skipped: string[];
  errors: string[];
};

type ImportJob = {
  sku: string;
  productId: string;
  slabs: Array<{
    minQuantity: number;
    maxQuantity: number | null;
    unitPrice: number;
    setupCost: number | null;
  }>;
};

const SAMPLE_QUANTITY_TIERS = [
  700, 1000, 1500, 2000, 3000, 3500, 4000, 5000, 6000,
  8000, 9500, 10000, 12000, 15000, 20000, 30000, 40000, 50000,
];

// ── Helpers ───────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      row.push(cell.trim());
      cell = "";
      continue;
    }

    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += ch;
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function cleanCost(value: string) {
  const numeric = value.replace(/[₹,\s]/g, "").replace(/\/-$/, "");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function totalTierCostToUnitCost(totalCost: number, quantity: number) {
  return Number((totalCost / quantity).toFixed(4));
}

function StatusBadge({ status }: { status: string }) {
  if (status === "APPROVED")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800"><CheckCircle size={12} />Approved</span>;
  if (status === "LOW_MARGIN")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800"><AlertTriangle size={12} />Low Margin</span>;
  if (status === "DISAPPROVED")
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800"><XCircle size={12} />Disapproved</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">No Cost Data</span>;
}

// ── Main Component ────────────────────────────────────────────────────────

export default function CostTablePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings>({ minApprovalMarginPct: 15, warningMarginPct: 20, agentCommissionPct: 10 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"table" | "checker" | "settings">("table");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Slab editing state
  const [editingSlabId, setEditingSlabId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CostSlab>>({});
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newSlab, setNewSlab] = useState({ minQuantity: "", maxQuantity: "", unitPrice: "", setupCost: "" });

  // Settings editing
  const [settingsForm, setSettingsForm] = useState<Settings>({ minApprovalMarginPct: 15, warningMarginPct: 20, agentCommissionPct: 10 });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Margin checker
  const [checker, setChecker] = useState({ productId: "", quantity: "", salePrice: "" });
  const [checkerResult, setCheckerResult] = useState<MarginResult | null>(null);
  const [checkerLoading, setCheckerLoading] = useState(false);

  const headers = getAuthHeaders();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${API_BASE_URL}/cost-table/products`, { headers }),
        fetch(`${API_BASE_URL}/cost-table/settings`, { headers }),
      ]);
      if (pRes.ok) setProducts(await pRes.json());
      if (sRes.ok) {
        const s = await sRes.json();
        setSettings(s);
        setSettingsForm(s);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function downloadSampleCsv() {
    const headers = ["PRODUCT CODE", "DESCRIPTION", ...SAMPLE_QUANTITY_TIERS.map(String)];
    const exampleRows = products.slice(0, 3).map((p, index) => {
      const sampleRates = SAMPLE_QUANTITY_TIERS.map((_, tierIndex) =>
        tierIndex < 4 ? (SAMPLE_QUANTITY_TIERS[tierIndex] * (0.7 + index * 0.05)).toFixed(2) : ""
      );
      return [p.sku, p.name, ...sampleRates];
    });
    const rows = [headers, ...exampleRows];
    const csv = rows
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cost-table-sample.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importCsv(file: File) {
    setImporting(true);
    setImportProgress(null);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const header = rows[0] || [];
      const codeIndex = header.findIndex(h => h.trim().toLowerCase().replace(/[_-]/g, " ") === "product code");
      const skuIndex = codeIndex >= 0 ? codeIndex : header.findIndex(h => h.trim().toLowerCase() === "sku");
      const quantityColumns = header
        .map((h, index) => ({ quantity: Number(String(h).replace(/[^\d]/g, "")), index }))
        .filter(col => Number.isFinite(col.quantity) && col.quantity > 0)
        .sort((a, b) => a.quantity - b.quantity);

      if (skuIndex < 0 || quantityColumns.length === 0) {
        setImportResult({
          imported: 0,
          skipped: [],
          errors: ["CSV must include PRODUCT CODE and at least one quantity column like 1000 or 5000."],
        });
        return;
      }

      const productBySku = new Map(products.map(p => [p.sku.trim().toUpperCase(), p]));
      const skipped: string[] = [];
      const errors: string[] = [];
      const jobs: ImportJob[] = [];
      let imported = 0;

      for (const row of rows.slice(1)) {
        const sku = String(row[skuIndex] || "").trim();
        if (!sku) continue;
        const product = productBySku.get(sku.toUpperCase());
        if (!product) {
          skipped.push(`${sku}: product SKU not found`);
          continue;
        }

        const pricedTiers = quantityColumns
          .map(col => ({ minQuantity: col.quantity, totalCost: cleanCost(String(row[col.index] || "")) }))
          .filter((tier): tier is { minQuantity: number; totalCost: number } => tier.totalCost !== null);

        if (pricedTiers.length === 0) {
          skipped.push(`${sku}: no valid cost values`);
          continue;
        }

        jobs.push({
          sku,
          productId: product.id,
          slabs: pricedTiers.map((tier, index) => ({
            minQuantity: tier.minQuantity,
            maxQuantity: pricedTiers[index + 1] ? pricedTiers[index + 1].minQuantity - 1 : null,
            unitPrice: totalTierCostToUnitCost(tier.totalCost, tier.minQuantity),
            setupCost: null,
          })),
        });
      }

      setImportProgress({ done: 0, total: jobs.length });
      const concurrency = 8;
      let cursor = 0;
      let done = 0;

      async function worker() {
        while (cursor < jobs.length) {
          const job = jobs[cursor++];
          try {
            const res = await fetch(`${API_BASE_URL}/cost-table/products/${job.productId}/slabs/bulk`, {
              method: "POST",
              headers,
              body: JSON.stringify({ slabs: job.slabs }),
            });

            if (res.ok) imported++;
            else errors.push(`${job.sku}: import failed`);
          } catch {
            errors.push(`${job.sku}: import failed`);
          } finally {
            done++;
            setImportProgress({ done, total: jobs.length });
          }
        }
      }

      await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()));

      setImportResult({ imported, skipped, errors });
      await load();
    } finally {
      setImporting(false);
      setImportProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filtered = products.filter(p =>
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  // ── Slab actions ──────────────────────────────────────────────────────────

  async function saveSlab(slabId: string) {
    await fetch(`${API_BASE_URL}/cost-table/slabs/${slabId}`, {
      method: "PUT", headers, body: JSON.stringify(editForm),
    });
    setEditingSlabId(null);
    load();
  }

  async function deleteSlab(slabId: string) {
    if (!confirm("Delete this cost slab?")) return;
    await fetch(`${API_BASE_URL}/cost-table/slabs/${slabId}`, { method: "DELETE", headers });
    load();
  }

  async function addSlab(productId: string) {
    if (!newSlab.minQuantity || !newSlab.unitPrice) return;
    await fetch(`${API_BASE_URL}/cost-table/slabs`, {
      method: "POST", headers,
      body: JSON.stringify({
        productId,
        minQuantity: Number(newSlab.minQuantity),
        maxQuantity: newSlab.maxQuantity ? Number(newSlab.maxQuantity) : null,
        unitPrice: Number(newSlab.unitPrice),
        setupCost: newSlab.setupCost ? Number(newSlab.setupCost) : null,
      }),
    });
    setAddingFor(null);
    setNewSlab({ minQuantity: "", maxQuantity: "", unitPrice: "", setupCost: "" });
    load();
  }

  // ── Settings save ─────────────────────────────────────────────────────────

  async function saveSettings() {
    setSettingsSaving(true);
    const res = await fetch(`${API_BASE_URL}/cost-table/settings`, {
      method: "PUT", headers, body: JSON.stringify(settingsForm),
    });
    if (res.ok) {
      const s = await res.json();
      setSettings(s);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    }
    setSettingsSaving(false);
  }

  // ── Margin checker ────────────────────────────────────────────────────────

  async function runCheck() {
    if (!checker.productId || !checker.quantity || !checker.salePrice) return;
    setCheckerLoading(true);
    const res = await fetch(`${API_BASE_URL}/cost-table/check-margin`, {
      method: "POST", headers,
      body: JSON.stringify({
        productId: checker.productId,
        quantity: Number(checker.quantity),
        salePricePerUnit: Number(checker.salePrice),
      }),
    });
    if (res.ok) setCheckerResult(await res.json());
    setCheckerLoading(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cost Table</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage product cost slabs, margin rules &amp; agent commission</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={downloadSampleCsv} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              <Download size={14} /> Sample CSV
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || products.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={14} /> {importing ? `Importing ${importProgress?.done ?? 0}/${importProgress?.total ?? 0}` : "Import CSV"}
            </button>
            <span className="text-xs text-gray-400">CSV rates are total slab amounts</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) importCsv(file);
              }}
            />
            <button onClick={load} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {([
            { key: "table", label: "Cost Slabs", icon: IndianRupee },
            { key: "checker", label: "Margin Checker", icon: TrendingUp },
            { key: "settings", label: "Settings", icon: Settings },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {/* ── TAB: Cost Slabs ───────────────────────────────────────────── */}
        {activeTab === "table" && (
          <div className="space-y-3">
            {importResult && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${
                importResult.errors.length > 0
                  ? "bg-red-50 border-red-200 text-red-700"
                  : "bg-green-50 border-green-200 text-green-700"
              }`}>
                <div className="font-semibold">
                  Imported {importResult.imported} product{importResult.imported !== 1 ? "s" : ""}.
                  {importResult.skipped.length > 0 && ` Skipped ${importResult.skipped.length}.`}
                </div>
                {(importResult.skipped.length > 0 || importResult.errors.length > 0) && (
                  <div className="mt-2 max-h-28 overflow-auto text-xs space-y-1">
                    {[...importResult.errors, ...importResult.skipped].slice(0, 30).map((message, index) => (
                      <div key={`${message}-${index}`}>{message}</div>
                    ))}
                    {[...importResult.errors, ...importResult.skipped].length > 30 && (
                      <div>Showing first 30 messages only.</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by SKU, product name or category…"
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Info strip */}
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-4 py-2">
              <span>Min Approval Margin: <strong className="text-blue-700">{settings.minApprovalMarginPct}%</strong></span>
              <span>·</span>
              <span>Warning Below: <strong className="text-amber-600">{settings.warningMarginPct}%</strong></span>
              <span>·</span>
              <span>Agent Commission: <strong className="text-green-700">{settings.agentCommissionPct}% of margin</strong></span>
              <span className="ml-auto cursor-pointer text-blue-600 hover:underline" onClick={() => setActiveTab("settings")}>
                Change in Settings →
              </span>
            </div>

            {loading ? (
              <div className="text-center py-16 text-gray-400">Loading products…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16 text-gray-400">No products found</div>
            ) : (
              <div className="space-y-2">
                {filtered.map(product => (
                  <div key={product.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    {/* Product header row */}
                    <div
                      className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 select-none"
                      onClick={() => setExpandedId(expandedId === product.id ? null : product.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono font-bold text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded px-2 py-0.5 shrink-0">
                          {product.sku}
                        </span>
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900 text-sm truncate">{product.name}</div>
                          <div className="text-xs text-gray-400">
                            {product.category?.name} · {product.gsm}gsm · {product.sizeInches} · {product.printingType} · {product.sides}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          product.costSlabs.length > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {product.costSlabs.length} slab{product.costSlabs.length !== 1 ? "s" : ""}
                        </span>
                        {expandedId === product.id ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                      </div>
                    </div>

                    {/* Expanded slabs */}
                    {expandedId === product.id && (
                      <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                        {/* Slabs table */}
                        {product.costSlabs.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-gray-500 border-b border-gray-100">
                                  <th className="text-left pb-2 font-medium">Min Qty</th>
                                  <th className="text-left pb-2 font-medium">Max Qty</th>
                                  <th className="text-left pb-2 font-medium">Cost / Unit</th>
                                  <th className="text-left pb-2 font-medium">Setup Cost</th>
                                  <th className="text-left pb-2 font-medium">Effective From</th>
                                  <th className="pb-2" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50">
                                {product.costSlabs.map(slab => (
                                  <tr key={slab.id} className="hover:bg-gray-50">
                                    {editingSlabId === slab.id ? (
                                      <>
                                        <td className="py-1.5 pr-2">
                                          <input type="number" value={editForm.minQuantity ?? ""} onChange={e => setEditForm(f => ({ ...f, minQuantity: Number(e.target.value) }))}
                                            className="w-20 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                        </td>
                                        <td className="py-1.5 pr-2">
                                          <input type="number" placeholder="∞" value={editForm.maxQuantity ?? ""} onChange={e => setEditForm(f => ({ ...f, maxQuantity: e.target.value ? Number(e.target.value) : null }))}
                                            className="w-20 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                        </td>
                                        <td className="py-1.5 pr-2">
                                          <input type="number" step="0.01" value={editForm.unitPrice ?? ""} onChange={e => setEditForm(f => ({ ...f, unitPrice: Number(e.target.value) }))}
                                            className="w-24 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                        </td>
                                        <td className="py-1.5 pr-2">
                                          <input type="number" step="0.01" placeholder="0" value={editForm.setupCost ?? ""} onChange={e => setEditForm(f => ({ ...f, setupCost: e.target.value ? Number(e.target.value) : null }))}
                                            className="w-24 border border-blue-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                                        </td>
                                        <td className="py-1.5 pr-2 text-gray-400 text-xs">{new Date(slab.effectiveFrom).toLocaleDateString("en-IN")}</td>
                                        <td className="py-1.5">
                                          <div className="flex gap-1">
                                            <button onClick={() => saveSlab(slab.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={14} /></button>
                                            <button onClick={() => setEditingSlabId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={14} /></button>
                                          </div>
                                        </td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="py-2 pr-2 font-medium text-gray-700">{slab.minQuantity.toLocaleString("en-IN")}</td>
                                        <td className="py-2 pr-2 text-gray-600">{slab.maxQuantity ? slab.maxQuantity.toLocaleString("en-IN") : "∞"}</td>
                                        <td className="py-2 pr-2 font-semibold text-gray-900">{fmt(slab.unitPrice)}</td>
                                        <td className="py-2 pr-2 text-gray-500">{slab.setupCost ? fmt(slab.setupCost) : "—"}</td>
                                        <td className="py-2 pr-2 text-gray-400 text-xs">{new Date(slab.effectiveFrom).toLocaleDateString("en-IN")}</td>
                                        <td className="py-2">
                                          <div className="flex gap-1">
                                            <button onClick={() => { setEditingSlabId(slab.id); setEditForm(slab); }}
                                              className="p-1 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={13} /></button>
                                            <button onClick={() => deleteSlab(slab.id)}
                                              className="p-1 text-red-400 hover:bg-red-50 rounded"><Trash2 size={13} /></button>
                                          </div>
                                        </td>
                                      </>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No cost slabs yet. Add one below.</p>
                        )}

                        {/* Add new slab */}
                        {addingFor === product.id ? (
                          <div className="flex flex-wrap gap-2 items-end bg-blue-50 border border-blue-100 rounded-lg p-3">
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Min Qty *</label>
                              <input type="number" value={newSlab.minQuantity} onChange={e => setNewSlab(s => ({ ...s, minQuantity: e.target.value }))}
                                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="e.g. 500" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Max Qty (blank = ∞)</label>
                              <input type="number" value={newSlab.maxQuantity} onChange={e => setNewSlab(s => ({ ...s, maxQuantity: e.target.value }))}
                                className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="e.g. 1000" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Cost / Unit (₹) *</label>
                              <input type="number" step="0.01" value={newSlab.unitPrice} onChange={e => setNewSlab(s => ({ ...s, unitPrice: e.target.value }))}
                                className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="e.g. 2.50" />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 mb-1">Setup Cost (₹)</label>
                              <input type="number" step="0.01" value={newSlab.setupCost} onChange={e => setNewSlab(s => ({ ...s, setupCost: e.target.value }))}
                                className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="optional" />
                            </div>
                            <div className="flex gap-2 pb-0.5">
                              <button onClick={() => addSlab(product.id)}
                                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
                                Add Slab
                              </button>
                              <button onClick={() => setAddingFor(null)}
                                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50">
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAddingFor(product.id); setEditingSlabId(null); }}
                            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            <Plus size={14} /> Add Cost Slab
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Margin Checker ───────────────────────────────────────── */}
        {activeTab === "checker" && (
          <div className="max-w-xl space-y-4">
            <p className="text-sm text-gray-500">
              Enter a product, quantity and sale price to instantly see the cost, margin and approval status.
            </p>
            <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4 shadow-sm">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                <select
                  value={checker.productId}
                  onChange={e => { setChecker(c => ({ ...c, productId: e.target.value })); setCheckerResult(null); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Select a product —</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Order Quantity</label>
                  <input
                    type="number"
                    value={checker.quantity}
                    onChange={e => { setChecker(c => ({ ...c, quantity: e.target.value })); setCheckerResult(null); }}
                    placeholder="e.g. 5000"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Sale Price / Unit (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={checker.salePrice}
                    onChange={e => { setChecker(c => ({ ...c, salePrice: e.target.value })); setCheckerResult(null); }}
                    placeholder="e.g. 3.50"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                onClick={runCheck}
                disabled={checkerLoading || !checker.productId || !checker.quantity || !checker.salePrice}
                className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {checkerLoading ? "Checking…" : "Check Margin & Approval"}
              </button>
            </div>

            {/* Result */}
            {checkerResult && (
              <div className={`border rounded-xl p-5 space-y-4 ${
                checkerResult.status === "APPROVED" ? "bg-green-50 border-green-200" :
                checkerResult.status === "LOW_MARGIN" ? "bg-amber-50 border-amber-200" :
                checkerResult.status === "DISAPPROVED" ? "bg-red-50 border-red-200" :
                "bg-gray-50 border-gray-200"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 text-base">Result</span>
                  <StatusBadge status={checkerResult.status} />
                </div>

                {!checkerResult.hasCost ? (
                  <p className="text-sm text-gray-500">{checkerResult.message}</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Cost / Unit</div>
                      <div className="font-bold text-gray-900 text-base">{fmt(checkerResult.costPerUnit)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Sale Price / Unit</div>
                      <div className="font-bold text-gray-900 text-base">{fmt(checkerResult.salePricePerUnit)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Margin / Unit</div>
                      <div className={`font-bold text-base ${(checkerResult.marginPerUnit ?? 0) < 0 ? "text-red-600" : "text-gray-900"}`}>
                        {fmt(checkerResult.marginPerUnit)}
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Margin %</div>
                      <div className={`font-bold text-base ${
                        (checkerResult.marginPct ?? 0) < (checkerResult.settings?.minApprovalMarginPct ?? 15)
                          ? "text-red-600"
                          : (checkerResult.marginPct ?? 0) < (checkerResult.settings?.warningMarginPct ?? 20)
                          ? "text-amber-600"
                          : "text-green-700"
                      }`}>
                        {checkerResult.marginPct?.toFixed(1)}%
                      </div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="text-xs text-gray-400 mb-0.5">Total Margin (Qty × {checker.quantity})</div>
                      <div className="font-bold text-gray-900 text-base">{fmt(checkerResult.totalMargin)}</div>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-green-100 bg-green-50">
                      <div className="text-xs text-gray-400 mb-0.5">Agent Commission ({checkerResult.commissionPct}% of margin)</div>
                      <div className="font-bold text-green-700 text-base">{fmt(checkerResult.commissionAmount)}</div>
                    </div>
                  </div>
                )}

                <div className="text-xs text-gray-400 pt-1 border-t border-gray-200 flex gap-3">
                  <span>Min approval: {checkerResult.settings?.minApprovalMarginPct}%</span>
                  <span>·</span>
                  <span>Warning below: {checkerResult.settings?.warningMarginPct}%</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Settings ─────────────────────────────────────────────── */}
        {activeTab === "settings" && (
          <div className="max-w-lg space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
              <h2 className="font-semibold text-gray-900 text-base flex items-center gap-2">
                <Settings size={16} /> System Settings
              </h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Approval Margin % <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-400 mb-2">Orders below this margin will be automatically <strong className="text-red-600">DISAPPROVED</strong></p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0" max="100" step="0.5"
                    value={settingsForm.minApprovalMarginPct}
                    onChange={e => setSettingsForm(s => ({ ...s, minApprovalMarginPct: Number(e.target.value) }))}
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Percent size={14} className="text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Warning Margin %</label>
                <p className="text-xs text-gray-400 mb-2">Orders between this and the minimum will show an <strong className="text-amber-600">AMBER WARNING</strong></p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0" max="100" step="0.5"
                    value={settingsForm.warningMarginPct}
                    onChange={e => setSettingsForm(s => ({ ...s, warningMarginPct: Number(e.target.value) }))}
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <Percent size={14} className="text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agent Commission %</label>
                <p className="text-xs text-gray-400 mb-2">Sales agent earns this percentage of the <strong>margin amount</strong> on approved orders</p>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0" max="100" step="0.5"
                    value={settingsForm.agentCommissionPct}
                    onChange={e => setSettingsForm(s => ({ ...s, agentCommissionPct: Number(e.target.value) }))}
                    className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500">% of margin ₹</span>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
                <button
                  onClick={saveSettings}
                  disabled={settingsSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save size={14} /> {settingsSaving ? "Saving…" : "Save Settings"}
                </button>
                {settingsSaved && (
                  <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                    <CheckCircle size={14} /> Saved!
                  </span>
                )}
              </div>
            </div>

            {/* Current values preview */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-2">
              <p className="font-medium text-gray-700 text-xs uppercase tracking-wide">Current Active Settings</p>
              <div className="grid grid-cols-3 gap-2 mt-2">
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
                  <div className="text-xs text-red-400 mb-0.5">Disapprove below</div>
                  <div className="font-bold text-red-700 text-lg">{settings.minApprovalMarginPct}%</div>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-center">
                  <div className="text-xs text-amber-400 mb-0.5">Warn below</div>
                  <div className="font-bold text-amber-700 text-lg">{settings.warningMarginPct}%</div>
                </div>
                <div className="bg-green-50 border border-green-100 rounded-lg p-3 text-center">
                  <div className="text-xs text-green-400 mb-0.5">Commission</div>
                  <div className="font-bold text-green-700 text-lg">{settings.agentCommissionPct}%</div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </DashboardShell>
  );
}
