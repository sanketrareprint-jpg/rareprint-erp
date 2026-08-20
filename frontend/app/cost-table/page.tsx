"use client";
import React, { useEffect, useState, useCallback, useRef } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MobileSelect } from "@/components/MobileSelect";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Settings, Plus, Trash2, Edit2, Check, X, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, XCircle, IndianRupee, Percent, Save,
  Search, RefreshCw, TrendingUp, Download, Upload,
  BarChart3, Users, ShoppingCart,
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

type RateSlab = {
  id: string;
  minQuantity: number;
  maxQuantity: number | null;
  rateAmount: number;
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
  rateSlabs: RateSlab[];
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

type ProfitabilityRow = {
  orderId: string;
  orderNo: string;
  orderDate: string;
  salesAgentName: string | null;
  saleTotal: number;
  costTotal: number | null;
  grossProfit: number | null;
  commissionTotal: number | null;
  netGrossProfit: number | null;
  hasMissingCost: boolean;
};
type Profitability = {
  month: string;
  totals: { saleTotal: number; costTotal: number; grossProfit: number; commissionTotal: number; netGrossProfit: number };
  missingCostOrderCount: number;
  agents: Array<{ id: string; name: string; category: string | null; saleTotal: number; grossProfit: number; commissionTotal: number; netGrossProfit: number; orderCount: number }>;
  rows: ProfitabilityRow[];
};
type NoCostProduct = { id: string; sku: string; name: string; description?: string | null; category?: { name: string }; gsm: number; sizeInches: string; sides: string };
type SalesAgent = { id: string; fullName: string; email: string; salesAgentCategory: "A" | "B" | "C" | "D" | null; usesAgencyRatesForCommission?: boolean };

// ── Agency Rates (Cost Table > Agency Rates) ─────────────────────────────
type AgencyRateColumn = { id: string; quantity: number };
type AgencyRateRow = { id: string; productId: string; sku: string; name: string; details: string; cells: Record<string, number> };
type AgencyRatesData = { columns: AgencyRateColumn[]; rows: AgencyRateRow[] };

type OrderWithoutCostItem = {
  productId: string;
  sku: string;
  productName: string;
  gsm: number;
  sizeInches: string;
  sides: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
};
type OrderWithoutCost = {
  id: string;
  orderNo: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  salesAgentName: string | null;
  orderDate: string;
  totalAmount: number;
  itemsWithNoCost: OrderWithoutCostItem[];
};

type IncreasedCostItem = {
  productId: string;
  sku: string;
  productName: string;
  gsm: number;
  category: string | null;
  quantity: number;
  predictedCost: number;
  actualCost: number;
  increase: number;
  increasePct: number | null;
  vendors: string[];
  invoiceNumbers: string[];
};
type IncreasedCostOrder = {
  id: string;
  orderNo: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  salesAgentName: string | null;
  orderDate: string;
  totalAmount: number;
  totalIncrease: number;
  itemsWithIncreasedCost: IncreasedCostItem[];
};

type OrderWithoutRateItem = {
  productId: string;
  sku: string;
  productName: string;
  gsm: number;
  sizeInches: string;
  sides: string;
  category: string | null;
  quantity: number;
  unitPrice: number;
};
type OrderWithoutRate = {
  id: string;
  orderNo: string;
  status: string;
  customerName: string;
  customerPhone: string | null;
  salesAgentName: string | null;
  orderDate: string;
  totalAmount: number;
  itemsWithNoRate: OrderWithoutRateItem[];
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

// Rate slab ranges can overlap (e.g. an older open-ended "50,000+" rate left
// in place after a newer, narrower "100,000+" rate is added). When several
// slabs match a given quantity, the most specific one — i.e. the one with
// the highest minQuantity — should win. This mirrors the backend's
// matchingSlab() logic used for real order pricing, so the Cost Table screen
// shows the same rate that actually gets billed.
function matchRateSlab<T extends { minQuantity: number; maxQuantity: number | null }>(
  slabs: T[] | undefined,
  quantity: number,
): T | null {
  const matches = (slabs ?? []).filter(
    rs => rs.minQuantity <= quantity && (rs.maxQuantity == null || rs.maxQuantity >= quantity),
  );
  if (matches.length === 0) return null;
  return matches.reduce((best, rs) => (rs.minQuantity > best.minQuantity ? rs : best));
}

function money(n: number | null | undefined) {
  if (n === null || n === undefined) return "-";
  return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
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
  const [activeTab, setActiveTab] = useState<"table" | "checker" | "settings" | "profit" | "orders" | "rates" | "increased" | "agencyRates">("table");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const rateFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingRates, setImportingRates] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Slab editing state
  const [editingSlabId, setEditingSlabId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CostSlab>>({});
  const [editSaleRate, setEditSaleRate] = useState<string>("");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [newSlab, setNewSlab] = useState({ minQuantity: "", maxQuantity: "", unitPrice: "", setupCost: "", saleRate: "" });

  // Settings editing
  const [settingsForm, setSettingsForm] = useState<Settings>({ minApprovalMarginPct: 15, warningMarginPct: 20, agentCommissionPct: 10 });
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Margin checker
  const [checker, setChecker] = useState({ productId: "", quantity: "", salePrice: "" });
  const [checkerResult, setCheckerResult] = useState<MarginResult | null>(null);
  const [checkerLoading, setCheckerLoading] = useState(false);
  const [profitability, setProfitability] = useState<Profitability | null>(null);
  const [noCostProducts, setNoCostProducts] = useState<NoCostProduct[]>([]);
  const [salesAgents, setSalesAgents] = useState<SalesAgent[]>([]);
  const [profitLoading, setProfitLoading] = useState(false);
  const [ordersWithoutCost, setOrdersWithoutCost] = useState<OrderWithoutCost[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [ordersWithoutRate, setOrdersWithoutRate] = useState<OrderWithoutRate[]>([]);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [expandedRateOrder, setExpandedRateOrder] = useState<string | null>(null);
  const [increasedCost, setIncreasedCost] = useState<IncreasedCostOrder[]>([]);
  const [increasedCostLoading, setIncreasedCostLoading] = useState(false);

  // ── Agency Rates ──────────────────────────────────────────────────────
  const [agencyRates, setAgencyRates] = useState<AgencyRatesData>({ columns: [], rows: [] });
  const [agencyRatesLoading, setAgencyRatesLoading] = useState(false);
  const [newAgencySku, setNewAgencySku] = useState("");
  const [addingAgencyProduct, setAddingAgencyProduct] = useState(false);
  const [newAgencyQty, setNewAgencyQty] = useState("");
  const [addingAgencyColumn, setAddingAgencyColumn] = useState(false);
  const [agencyCellDrafts, setAgencyCellDrafts] = useState<Record<string, string>>({});
  const [savingAgencyCell, setSavingAgencyCell] = useState<string | null>(null);
  const [expandedIncreasedOrder, setExpandedIncreasedOrder] = useState<string | null>(null);
  const [addRateModal, setAddRateModal] = useState<{
    productId: string;
    sku: string;
    productName: string;
    orderNo: string;
  } | null>(null);
  const [modalRate, setModalRate] = useState({ minQuantity: "", maxQuantity: "", rateAmount: "" });
  const [modalRateSaving, setModalRateSaving] = useState(false);

  const [addCostModal, setAddCostModal] = useState<{
    productId: string;
    sku: string;
    productName: string;
    orderNo: string;
  } | null>(null);
  const [modalSlab, setModalSlab] = useState({ minQuantity: "", maxQuantity: "", unitPrice: "", setupCost: "" });
  const [modalSaving, setModalSaving] = useState(false);

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

  const loadProfit = useCallback(async () => {
    setProfitLoading(true);
    try {
      const [profitRes, noCostRes, agentsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/cost-table/profitability`, { headers }),
        fetch(`${API_BASE_URL}/cost-table/products-without-cost`, { headers }),
        fetch(`${API_BASE_URL}/cost-table/sales-agents`, { headers }),
      ]);
      if (profitRes.ok) setProfitability(await profitRes.json());
      if (noCostRes.ok) setNoCostProducts(await noCostRes.json());
      if (agentsRes.ok) setSalesAgents(await agentsRes.json());
    } finally {
      setProfitLoading(false);
    }
  }, []);

  useEffect(() => { if (activeTab === "profit") loadProfit(); }, [activeTab, loadProfit]);

  const loadOrdersWithoutCost = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/orders-without-cost`, { headers });
      if (res.ok) setOrdersWithoutCost(await res.json());
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => { if (activeTab === "orders") loadOrdersWithoutCost(); }, [activeTab, loadOrdersWithoutCost]);

  const loadOrdersWithoutRate = useCallback(async () => {
    setRatesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/orders-without-rate`, { headers });
      if (res.ok) setOrdersWithoutRate(await res.json());
    } finally {
      setRatesLoading(false);
    }
  }, []);

  useEffect(() => { if (activeTab === "rates") loadOrdersWithoutRate(); }, [activeTab, loadOrdersWithoutRate]);

  const loadIncreasedCost = useCallback(async () => {
    setIncreasedCostLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/increased-cost`, { headers });
      if (res.ok) setIncreasedCost(await res.json());
    } finally {
      setIncreasedCostLoading(false);
    }
  }, []);

  useEffect(() => { if (activeTab === "increased") loadIncreasedCost(); }, [activeTab, loadIncreasedCost]);

  const loadAgencyRates = useCallback(async () => {
    setAgencyRatesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/agency-rates`, { headers });
      if (res.ok) setAgencyRates(await res.json());
    } finally {
      setAgencyRatesLoading(false);
    }
  }, []);

  useEffect(() => { if (activeTab === "agencyRates") loadAgencyRates(); }, [activeTab, loadAgencyRates]);

  async function addAgencyProduct() {
    const sku = newAgencySku.trim();
    if (!sku) return;
    setAddingAgencyProduct(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/agency-rates/products`, {
        method: "POST", headers, body: JSON.stringify({ sku }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { alert(body.message || "Failed to add product"); return; }
      setNewAgencySku("");
      await loadAgencyRates();
    } finally {
      setAddingAgencyProduct(false);
    }
  }

  async function deleteAgencyProduct(id: string) {
    if (!confirm("Remove this product row from the Agency Rates table? Its rates will be deleted too.")) return;
    await fetch(`${API_BASE_URL}/cost-table/agency-rates/products/${id}`, { method: "DELETE", headers });
    await loadAgencyRates();
  }

  async function addAgencyColumn() {
    const qty = Number(newAgencyQty);
    if (!Number.isFinite(qty) || qty <= 0) { alert("Enter a valid quantity"); return; }
    setAddingAgencyColumn(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/agency-rates/columns`, {
        method: "POST", headers, body: JSON.stringify({ quantity: qty }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { alert(body.message || "Failed to add column"); return; }
      setNewAgencyQty("");
      await loadAgencyRates();
    } finally {
      setAddingAgencyColumn(false);
    }
  }

  async function deleteAgencyColumn(id: string) {
    if (!confirm("Remove this quantity column? Every rate entered under it (for every product) will be deleted too.")) return;
    await fetch(`${API_BASE_URL}/cost-table/agency-rates/columns/${id}`, { method: "DELETE", headers });
    await loadAgencyRates();
  }

  async function saveAgencyCell(productId: string, quantity: number, rawValue: string) {
    const key = `${productId}:${quantity}`;
    const trimmed = rawValue.trim();
    const rate = trimmed === "" ? null : Number(trimmed);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) { alert("Enter a valid, non-negative rate."); return; }
    setSavingAgencyCell(key);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/agency-rates/cell`, {
        method: "PUT", headers, body: JSON.stringify({ productId, quantity, rate }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Failed to save rate"); return; }
      setAgencyCellDrafts(d => { const next = { ...d }; delete next[key]; return next; });
      await loadAgencyRates();
    } finally {
      setSavingAgencyCell(null);
    }
  }

  async function toggleAgentAgencyRates(userId: string, enabled: boolean) {
    await fetch(`${API_BASE_URL}/cost-table/sales-agents/${userId}/agency-rates-flag`, {
      method: "PUT", headers, body: JSON.stringify({ enabled }),
    });
    setSalesAgents(prev => prev.map(a => a.id === userId ? { ...a, usesAgencyRatesForCommission: enabled } : a));
  }

  async function updateAgentCategory(userId: string, category: "A" | "B" | "C" | "D" | "") {
    await fetch(`${API_BASE_URL}/cost-table/sales-agents/${userId}/category`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ category: category || null }),
    });
    await loadProfit();
  }

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
        .map((h, index) => ({ quantity: Math.round(parseFloat(String(h).replace(/[^\d.]/g, ""))), index }))
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

  function downloadRateSampleCsv() {
    const headers = ["PRODUCT CODE", "DESCRIPTION", ...SAMPLE_QUANTITY_TIERS.map(String)];
    const rows = [
      headers,
      ...products.slice(0, 3).map((p) => [
        p.sku,
        p.name,
        ...SAMPLE_QUANTITY_TIERS.map((qty, index) => index < 4 ? String(qty * 1.1) : ""),
      ]),
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "rate-list-sample.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function importRateCsv(file: File) {
    setImportingRates(true);
    setImportResult(null);
    try {
      const rows = parseCsv(await file.text());
      const header = rows[0] || [];
      const codeIndex = header.findIndex(h => h.trim().toLowerCase().replace(/[_-]/g, " ") === "product code");
      const skuIndex = codeIndex >= 0 ? codeIndex : header.findIndex(h => h.trim().toLowerCase() === "sku");
      const quantityColumns = header
        .map((h, index) => ({ quantity: Math.round(parseFloat(String(h).replace(/[^\d.]/g, ""))), index }))
        .filter(col => Number.isFinite(col.quantity) && col.quantity > 0)
        .sort((a, b) => a.quantity - b.quantity);
      if (skuIndex < 0 || quantityColumns.length === 0) {
        setImportResult({ imported: 0, skipped: [], errors: ["Rate CSV must include PRODUCT CODE and quantity columns."] });
        return;
      }
      const productBySku = new Map(products.map(p => [p.sku.trim().toUpperCase(), p]));
      const skipped: string[] = [];
      const errors: string[] = [];
      let imported = 0;
      const jobs = rows.slice(1).map(row => {
        const sku = String(row[skuIndex] || "").trim();
        const product = productBySku.get(sku.toUpperCase());
        if (!sku) return null;
        if (!product) { skipped.push(`${sku}: product SKU not found`); return null; }
        const pricedTiers = quantityColumns
          .map(col => ({ minQuantity: col.quantity, rateAmount: cleanCost(String(row[col.index] || "")) }))
          .filter((tier): tier is { minQuantity: number; rateAmount: number } => tier.rateAmount !== null);
        if (pricedTiers.length === 0) { skipped.push(`${sku}: no valid rate values`); return null; }
        return {
          sku,
          productId: product.id,
          slabs: pricedTiers.map((tier, index) => ({
            minQuantity: tier.minQuantity,
            maxQuantity: pricedTiers[index + 1] ? pricedTiers[index + 1].minQuantity - 1 : null,
            rateAmount: tier.rateAmount,
          })),
        };
      }).filter(Boolean) as Array<{ sku: string; productId: string; slabs: any[] }>;
      let cursor = 0;
      async function worker() {
        while (cursor < jobs.length) {
          const job = jobs[cursor++];
          try {
            const res = await fetch(`${API_BASE_URL}/cost-table/products/${job.productId}/rate-slabs/bulk`, {
              method: "POST",
              headers,
              body: JSON.stringify({ slabs: job.slabs, replaceAll: true }),
            });
            if (res.ok) imported++;
            else errors.push(`${job.sku}: rate import failed`);
          } catch {
            errors.push(`${job.sku}: rate import failed`);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(8, jobs.length) }, () => worker()));
      setImportResult({ imported, skipped, errors });
    } finally {
      setImportingRates(false);
      if (rateFileInputRef.current) rateFileInputRef.current.value = "";
    }
  }

  const filtered = products.filter(p =>
    p.sku.toLowerCase().includes(search.toLowerCase()) ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category?.name || "").toLowerCase().includes(search.toLowerCase())
  );

  // ── Add Cost Modal ────────────────────────────────────────────────────────

  async function saveModalCostSlab() {
    if (!addCostModal || !modalSlab.minQuantity || !modalSlab.unitPrice) return;
    setModalSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/slabs`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: addCostModal.productId,
          minQuantity: Number(modalSlab.minQuantity),
          maxQuantity: modalSlab.maxQuantity ? Number(modalSlab.maxQuantity) : null,
          unitPrice: Number(modalSlab.unitPrice),
          setupCost: modalSlab.setupCost ? Number(modalSlab.setupCost) : null,
        }),
      });
      if (res.ok) {
        const savedProductId = addCostModal.productId;
        setAddCostModal(null);
        setModalSlab({ minQuantity: "", maxQuantity: "", unitPrice: "", setupCost: "" });
        // Optimistically remove just this product from the local list — no full reload needed
        setOrdersWithoutCost(prev =>
          prev
            .map(order => ({
              ...order,
              itemsWithNoCost: order.itemsWithNoCost.filter(item => item.productId !== savedProductId),
            }))
            .filter(order => order.itemsWithNoCost.length > 0)
        );
      }
    } finally {
      setModalSaving(false);
    }
  }

  async function saveModalRateSlab() {
    if (!addRateModal || !modalRate.minQuantity || !modalRate.rateAmount) return;
    setModalRateSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/cost-table/products/${addRateModal.productId}/rate-slabs/bulk`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slabs: [{
            minQuantity: Number(modalRate.minQuantity),
            maxQuantity: modalRate.maxQuantity ? Number(modalRate.maxQuantity) : null,
            rateAmount: Number(modalRate.rateAmount),
          }],
        }),
      });
      if (res.ok) {
        const savedProductId = addRateModal.productId;
        setAddRateModal(null);
        setModalRate({ minQuantity: "", maxQuantity: "", rateAmount: "" });
        // Optimistic update — remove just this product from local list, no full reload
        setOrdersWithoutRate(prev =>
          prev
            .map(order => ({
              ...order,
              itemsWithNoRate: order.itemsWithNoRate.filter(item => item.productId !== savedProductId),
            }))
            .filter(order => order.itemsWithNoRate.length > 0)
        );
      }
    } finally {
      setModalRateSaving(false);
    }
  }

  // ── Slab actions ──────────────────────────────────────────────────────────

  async function saveSlab(slabId: string) {
    await fetch(`${API_BASE_URL}/cost-table/slabs/${slabId}`, {
      method: "PUT", headers, body: JSON.stringify(editForm),
    });
    // Also save sale rate if provided
    if (editSaleRate && editingProductId && editForm.minQuantity != null) {
      await fetch(`${API_BASE_URL}/cost-table/products/${editingProductId}/rate-slabs/bulk`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slabs: [{
            minQuantity: editForm.minQuantity,
            maxQuantity: editForm.maxQuantity ?? null,
            rateAmount: Number(editSaleRate),
          }],
        }),
      });
    }
    setEditingSlabId(null);
    setEditSaleRate("");
    setEditingProductId(null);
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
    // Also save sale rate if provided
    if (newSlab.saleRate) {
      await fetch(`${API_BASE_URL}/cost-table/products/${productId}/rate-slabs/bulk`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          slabs: [{
            minQuantity: Number(newSlab.minQuantity),
            maxQuantity: newSlab.maxQuantity ? Number(newSlab.maxQuantity) : null,
            rateAmount: Number(newSlab.saleRate),
          }],
        }),
      });
    }
    setAddingFor(null);
    setNewSlab({ minQuantity: "", maxQuantity: "", unitPrice: "", setupCost: "", saleRate: "" });
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
            <button onClick={downloadRateSampleCsv} className="inline-flex items-center gap-2 px-3 py-1.5 text-sm border border-purple-200 text-purple-700 rounded-lg hover:bg-purple-50">
              <Download size={14} /> Rate CSV
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing || products.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={14} /> {importing ? `Importing ${importProgress?.done ?? 0}/${importProgress?.total ?? 0}` : "Import CSV"}
            </button>
            <button
              onClick={() => rateFileInputRef.current?.click()}
              disabled={importingRates || products.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload size={14} /> {importingRates ? "Importing rates..." : "Import Rates"}
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
            <input
              ref={rateFileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) importRateCsv(file);
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
            { key: "orders", label: "Orders Without Cost", icon: ShoppingCart, badge: ordersWithoutCost.length },
            { key: "rates", label: "Orders Without Rate", icon: AlertTriangle, badge: ordersWithoutRate.length },
            { key: "increased", label: "Increased Cost", icon: TrendingUp, badge: increasedCost.length },
            { key: "agencyRates", label: "Agency Rates", icon: IndianRupee },
            { key: "profit", label: "Profit", icon: BarChart3 },
            { key: "checker", label: "Margin Checker", icon: TrendingUp },
            { key: "settings", label: "Settings", icon: Settings },
          ] as const).map(({ key, label, icon: Icon, badge }: { key: string; label: string; icon: React.ElementType; badge?: number }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as "table" | "orders" | "rates" | "increased" | "profit" | "checker" | "settings" | "agencyRates")}
              className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === key
                  ? "border-brand-600 text-brand-600"
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
                                  <th className="text-left pb-2 font-medium text-blue-600">Sale Rate</th>
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
                                        <td className="py-1.5 pr-2">
                                          <input type="number" step="0.01" placeholder="e.g. 4999" value={editSaleRate}
                                            onChange={e => setEditSaleRate(e.target.value)}
                                            className="w-24 border border-blue-300 rounded px-2 py-1 text-sm text-blue-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500" />
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
                                        <td className="py-2 pr-2 font-semibold text-blue-600">
                                          {(() => {
                                            const r = matchRateSlab(product.rateSlabs, slab.minQuantity);
                                            return r ? fmt(r.rateAmount) : <span className="text-gray-300 font-normal">—</span>;
                                          })()}
                                        </td>
                                        <td className="py-2 pr-2 text-gray-400 text-xs">{new Date(slab.effectiveFrom).toLocaleDateString("en-IN")}</td>
                                        <td className="py-2">
                                          <div className="flex gap-1">
                                            <button onClick={() => {
                                              setEditingSlabId(slab.id);
                                              setEditForm(slab);
                                              setEditingProductId(product.id);
                                              const existingRate = matchRateSlab(product.rateSlabs, slab.minQuantity);
                                              setEditSaleRate(existingRate ? String(existingRate.rateAmount) : "");
                                            }} className="p-1 text-blue-500 hover:bg-blue-50 rounded"><Edit2 size={13} /></button>
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
                            <div>
                              <label className="block text-xs text-blue-600 mb-1 font-medium">Sale Rate (₹)</label>
                              <input type="number" step="0.01" value={newSlab.saleRate} onChange={e => setNewSlab(s => ({ ...s, saleRate: e.target.value }))}
                                className="w-28 border border-blue-300 rounded px-2 py-1.5 text-sm text-blue-700 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500" placeholder="e.g. 4999" />
                            </div>
                            <div className="flex gap-2 pb-0.5">
                              <button onClick={() => addSlab(product.id)}
                                className="px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium">
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

        {/* ── TAB: Profit ───────────────────────────────────────────────── */}
        {activeTab === "profit" && (
          <div className="space-y-4">
            {profitLoading ? (
              <div className="text-center py-16 text-gray-400">Loading profit data...</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  {[
                    ["Sales", profitability?.totals.saleTotal, "text-slate-900"],
                    ["Cost", profitability?.totals.costTotal, "text-blue-700"],
                    ["Gross Profit", profitability?.totals.grossProfit, "text-green-700"],
                    ["Commission", profitability?.totals.commissionTotal, "text-purple-700"],
                    ["Gross to Gross", profitability?.totals.netGrossProfit, "text-emerald-700"],
                  ].map(([label, value, color]) => (
                    <div key={String(label)} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold text-gray-400">{label}</p>
                      <p className={`mt-1 text-xl font-bold ${color}`}>{money(value as number)}</p>
                    </div>
                  ))}
                </div>

                {(() => {
                  // Orders whose computed cost blows way past the sale price
                  // are almost always a bad cost-slab entry (e.g. a total/
                  // batch price typed in as a per-unit price), not a real
                  // loss. Surfacing them here is how you find the order/
                  // product responsible for a month's profit total looking
                  // wrong, since a single bad slab can swing the whole month.
                  const suspects = (profitability?.rows ?? [])
                    .filter(r => !r.hasMissingCost && r.costTotal != null && r.saleTotal > 0 && r.costTotal > r.saleTotal * 3)
                    .sort((a, b) => (a.grossProfit ?? 0) - (b.grossProfit ?? 0))
                    .slice(0, 10);
                  if (suspects.length === 0) return null;
                  return (
                    <div className="rounded-lg border border-red-200 bg-red-50 shadow-sm">
                      <div className="flex items-center justify-between border-b border-red-100 px-4 py-3">
                        <h2 className="flex items-center gap-2 text-sm font-bold text-red-800">
                          <AlertTriangle size={15} /> Likely bad cost data — cost is 3x+ the sale price
                        </h2>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">{suspects.length}</span>
                      </div>
                      <p className="px-4 pt-2 text-xs text-red-700">
                        These orders are dragging this month's profit total way down. Almost always caused by a cost slab entered as a total/batch price instead of a per-unit price — open the order, check each product's cost slab below, and fix the unit price.
                      </p>
                      <div className="max-h-80 overflow-auto divide-y divide-red-100 mt-2">
                        {suspects.map(row => (
                          <div key={row.orderId} className="flex items-center justify-between gap-3 px-4 py-2">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-xs font-bold text-blue-700">{row.orderNo}</span>
                                <span className="text-xs text-gray-400">{row.salesAgentName ?? "No agent"}</span>
                              </div>
                              <p className="text-xs text-gray-500">
                                Sale {money(row.saleTotal)} · Cost {money(row.costTotal)} · Gross {money(row.grossProfit)}
                              </p>
                            </div>
                            <button onClick={() => { setActiveTab("orders"); }}
                              className="rounded-lg border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 flex-shrink-0">
                              Review
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                      <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><AlertTriangle size={15} /> Products With No Cost</h2>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">{noCostProducts.length}</span>
                    </div>
                    <div className="max-h-80 overflow-auto divide-y divide-gray-50">
                      {noCostProducts.length === 0 ? (
                        <p className="p-4 text-sm text-gray-400">All active products have cost slabs.</p>
                      ) : noCostProducts.map(product => (
                        <div key={product.id} className="flex items-center justify-between gap-3 px-4 py-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-bold text-blue-700">{product.sku}</span>
                              <span className="truncate text-sm font-semibold text-gray-900">{product.name}</span>
                            </div>
                            <p className="text-xs text-gray-400">{product.category?.name} · {product.gsm}gsm · {product.sizeInches} · {product.sides}</p>
                          </div>
                          <button onClick={() => { setActiveTab("table"); setSearch(product.sku); }}
                            className="rounded-lg border border-blue-200 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50">
                            Add Cost
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                    <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                      <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900"><Users size={15} /> Sales Agent Categories</h2>
                    </div>
                    <div className="max-h-80 overflow-auto divide-y divide-gray-50">
                      {salesAgents.map(agent => (
                        <div key={agent.id} className="flex items-center justify-between gap-3 px-4 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-gray-900">{agent.fullName}</p>
                            <p className="text-xs text-gray-400">{agent.email}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs text-gray-500" title="When on, this agent's commission sheet checks Cost Table > Agency Rates first (exact product+quantity match) before the normal category calc">
                              <input type="checkbox" checked={!!agent.usesAgencyRatesForCommission}
                                onChange={e => toggleAgentAgencyRates(agent.id, e.target.checked)} />
                              Agency Rates
                            </label>
                            <MobileSelect value={agent.salesAgentCategory ?? ""} onChange={v => updateAgentCategory(agent.id, v as any)}
                              className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm"
                              options={[
                                { value: "", label: "No category" },
                                { value: "A", label: "A - 10%, stickers 15%" },
                                { value: "B", label: "B - 10%" },
                                { value: "C", label: "C - 12%, stickers 17%" },
                                { value: "D", label: "D - fixed rate upper" },
                              ]} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-100 px-4 py-3">
                    <h2 className="text-sm font-bold text-gray-900">This Month Commission By Agent</h2>
                  </div>
                  <div className="overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Agent</th>
                          <th className="px-3 py-2 text-left">Category</th>
                          <th className="px-3 py-2 text-right">Orders</th>
                          <th className="px-3 py-2 text-right">Sales</th>
                          <th className="px-3 py-2 text-right">Gross Profit</th>
                          <th className="px-3 py-2 text-right">Commission</th>
                          <th className="px-3 py-2 text-right">Gross to Gross</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(profitability?.agents ?? []).map(agent => (
                          <tr key={agent.id}>
                            <td className="px-3 py-2 font-semibold text-gray-900">{agent.name}</td>
                            <td className="px-3 py-2 text-gray-500">{agent.category ?? "-"}</td>
                            <td className="px-3 py-2 text-right">{agent.orderCount}</td>
                            <td className="px-3 py-2 text-right">{money(agent.saleTotal)}</td>
                            <td className="px-3 py-2 text-right text-green-700">{money(agent.grossProfit)}</td>
                            <td className="px-3 py-2 text-right text-purple-700">{money(agent.commissionTotal)}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700">{money(agent.netGrossProfit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
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
                <MobileSelect
                  value={checker.productId}
                  onChange={v => { setChecker(c => ({ ...c, productId: v })); setCheckerResult(null); }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  options={[{ value: "", label: "— Select a product —" }, ...products.map(p => ({ value: p.id, label: `${p.sku} — ${p.name}` }))]}
                />
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
                className="w-full py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
        {/* ── TAB: Orders Without Cost ─────────────────────────────────── */}
        {activeTab === "orders" && (
          <div className="space-y-4">
            {/* Info banner */}
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-start gap-3">
              <ShoppingCart size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">All orders missing cost data</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Every order from the order book that has one or more products with no cost slabs is shown here — across all statuses.
                  Orders in <strong>Pending Approval</strong> cannot be approved until cost is added. Click <strong>"Add Cost"</strong> on any product to add its cost slab.
                </p>
              </div>
            </div>

            {ordersLoading ? (
              <div className="text-center py-16 text-gray-400">Loading orders…</div>
            ) : ordersWithoutCost.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                <p className="text-sm text-gray-500 font-medium">All orders have cost data!</p>
                <p className="text-xs text-gray-400 mt-1">No orders in the order book are missing cost slabs.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ordersWithoutCost.map(order => (
                  <div key={order.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    {/* Order header */}
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-blue-700 font-mono">{order.orderNo}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          order.status === "PENDING_APPROVAL" ? "bg-amber-50 border-amber-300 text-amber-700" :
                          order.status === "APPROVED" ? "bg-green-50 border-green-300 text-green-700" :
                          order.status === "IN_PRODUCTION" ? "bg-blue-50 border-blue-300 text-blue-700" :
                          order.status === "READY_FOR_DISPATCH" || order.status === "DISPATCHED" || order.status === "DELIVERED" ? "bg-emerald-50 border-emerald-300 text-emerald-700" :
                          order.status === "CANCELLED" || order.status === "REJECTED" ? "bg-red-50 border-red-300 text-red-600" :
                          "bg-gray-100 border-gray-200 text-gray-600"
                        }`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                        <span className="font-semibold text-gray-800 text-sm">{order.customerName}</span>
                        {order.customerPhone && <span className="text-gray-400 text-xs">{order.customerPhone}</span>}
                        {order.salesAgentName && (
                          <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium">{order.salesAgentName}</span>
                        )}
                        <span className="text-xs text-gray-400">{new Date(order.orderDate).toLocaleDateString("en-IN")}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-sm font-bold text-gray-800">₹{order.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                          {order.itemsWithNoCost.length} missing
                        </span>
                        {expandedOrder === order.id ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                      </div>
                    </div>

                    {/* Expanded: items missing cost */}
                    {expandedOrder === order.id && (
                      <div className="border-t border-amber-100 px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Products with no cost slabs</p>
                        {order.itemsWithNoCost.map(item => (
                          <div
                            key={item.productId}
                            className="flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-blue-700 bg-white border border-blue-100 rounded px-1.5 py-0.5">{item.sku}</span>
                                <span className="font-medium text-gray-900 text-sm">{item.productName}</span>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {item.category && <span>{item.category} &middot; </span>}
                                {item.gsm}gsm &middot; {item.sizeInches} &middot; {item.sides}
                                <span className="ml-2 font-semibold text-gray-700">Qty: {item.quantity.toLocaleString("en-IN")}</span>
                                <span className="ml-2 text-gray-500">@ {fmt(item.unitPrice)}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setAddCostModal({ productId: item.productId, sku: item.sku, productName: item.productName, orderNo: order.orderNo });
                                setModalSlab({ minQuantity: "", maxQuantity: "", unitPrice: "", setupCost: "" });
                              }}
                              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand-600 text-white rounded-lg hover:bg-brand-700"
                            >
                              <Plus size={12} /> Add Cost
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Orders Without Rate ──────────────────────────────────── */}
        {activeTab === "rates" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">All orders missing rate sheet data</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Every order that has one or more products with no rate slabs is shown here — across all statuses.
                  Without rate data, agent commission cannot be calculated. Click <strong>"Add Rate"</strong> on any product to add its rate slab.
                </p>
              </div>
            </div>

            {ratesLoading ? (
              <div className="text-center py-16 text-gray-400">Loading orders…</div>
            ) : ordersWithoutRate.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                <p className="text-sm text-gray-500 font-medium">All orders have rate data!</p>
                <p className="text-xs text-gray-400 mt-1">No orders in the order book are missing rate slabs.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ordersWithoutRate.map(order => (
                  <div key={order.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => setExpandedRateOrder(expandedRateOrder === order.id ? null : order.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-blue-700 font-mono">{order.orderNo}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          order.status === "PENDING_APPROVAL" ? "bg-amber-50 border-amber-300 text-amber-700" :
                          order.status === "APPROVED" ? "bg-green-50 border-green-300 text-green-700" :
                          order.status === "IN_PRODUCTION" ? "bg-blue-50 border-blue-300 text-blue-700" :
                          order.status === "READY_FOR_DISPATCH" || order.status === "DISPATCHED" || order.status === "DELIVERED" ? "bg-emerald-50 border-emerald-300 text-emerald-700" :
                          order.status === "CANCELLED" || order.status === "REJECTED" ? "bg-red-50 border-red-300 text-red-600" :
                          "bg-gray-100 border-gray-200 text-gray-600"
                        }`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                        <span className="font-semibold text-gray-800 text-sm">{order.customerName}</span>
                        {order.customerPhone && <span className="text-gray-400 text-xs">{order.customerPhone}</span>}
                        {order.salesAgentName && (
                          <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium">{order.salesAgentName}</span>
                        )}
                        <span className="text-xs text-gray-400">{new Date(order.orderDate).toLocaleDateString("en-IN")}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-sm font-bold text-gray-800">₹{order.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                          {order.itemsWithNoRate.length} missing
                        </span>
                        {expandedRateOrder === order.id ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                      </div>
                    </div>

                    {expandedRateOrder === order.id && (
                      <div className="border-t border-amber-100 px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Products with no rate slabs</p>
                        {order.itemsWithNoRate.map(item => (
                          <div
                            key={item.productId}
                            className="flex items-center justify-between gap-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-blue-700 bg-white border border-blue-100 rounded px-1.5 py-0.5">{item.sku}</span>
                                <span className="font-medium text-gray-900 text-sm">{item.productName}</span>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {item.category && <span>{item.category} &middot; </span>}
                                {item.gsm}gsm &middot; {item.sizeInches} &middot; {item.sides}
                                <span className="ml-2 font-semibold text-gray-700">Qty: {item.quantity.toLocaleString("en-IN")}</span>
                                <span className="ml-2 text-gray-500">@ {fmt(item.unitPrice)}</span>
                              </div>
                            </div>
                            <button
                              onClick={() => {
                                setAddRateModal({ productId: item.productId, sku: item.sku, productName: item.productName, orderNo: order.orderNo });
                                setModalRate({ minQuantity: "", maxQuantity: "", rateAmount: "" });
                              }}
                              className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700"
                            >
                              <Plus size={12} /> Add Rate
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Increased Cost ───────────────────────────────────────── */}
        {activeTab === "increased" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 flex items-start gap-3">
              <TrendingUp size={16} className="text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-800">Orders where actual vendor cost exceeded the predicted cost</p>
                <p className="text-xs text-red-700 mt-0.5">
                  "Actual cost" is the amount a production manager enters in Production &gt; Clubbing when marking a job work
                  <strong> Received</strong>. Shown here whenever that real vendor cost came in higher than the Cost Table's
                  predicted cost slab for that product/quantity — meaning the order's recorded margin is now overstated.
                </p>
              </div>
            </div>

            {increasedCostLoading ? (
              <div className="text-center py-16 text-gray-400">Loading orders…</div>
            ) : increasedCost.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-400" />
                <p className="text-sm text-gray-500 font-medium">No cost overruns found!</p>
                <p className="text-xs text-gray-400 mt-1">No received job-work costs currently exceed their predicted cost slab.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {increasedCost.map(order => (
                  <div key={order.id} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                    <div
                      className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer hover:bg-gray-100 select-none"
                      onClick={() => setExpandedIncreasedOrder(expandedIncreasedOrder === order.id ? null : order.id)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-blue-700 font-mono">{order.orderNo}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${
                          order.status === "PENDING_APPROVAL" ? "bg-amber-50 border-amber-300 text-amber-700" :
                          order.status === "APPROVED" ? "bg-green-50 border-green-300 text-green-700" :
                          order.status === "IN_PRODUCTION" ? "bg-blue-50 border-blue-300 text-blue-700" :
                          order.status === "READY_FOR_DISPATCH" || order.status === "DISPATCHED" || order.status === "DELIVERED" ? "bg-emerald-50 border-emerald-300 text-emerald-700" :
                          order.status === "CANCELLED" || order.status === "REJECTED" ? "bg-red-50 border-red-300 text-red-600" :
                          "bg-gray-100 border-gray-200 text-gray-600"
                        }`}>
                          {order.status.replace(/_/g, " ")}
                        </span>
                        <span className="font-semibold text-gray-800 text-sm">{order.customerName}</span>
                        {order.customerPhone && <span className="text-gray-400 text-xs">{order.customerPhone}</span>}
                        {order.salesAgentName && (
                          <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-medium">{order.salesAgentName}</span>
                        )}
                        <span className="text-xs text-gray-400">{new Date(order.orderDate).toLocaleDateString("en-IN")}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-sm font-bold text-gray-800">₹{order.totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
                        <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                          +{fmt(order.totalIncrease)}
                        </span>
                        {expandedIncreasedOrder === order.id ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
                      </div>
                    </div>

                    {expandedIncreasedOrder === order.id && (
                      <div className="border-t border-red-100 px-4 py-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Products over predicted cost</p>
                        {order.itemsWithIncreasedCost.map(item => (
                          <div
                            key={item.productId}
                            className="flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-xs font-bold text-blue-700 bg-white border border-blue-100 rounded px-1.5 py-0.5">{item.sku}</span>
                                <span className="font-medium text-gray-900 text-sm">{item.productName}</span>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                {item.category && <span>{item.category} &middot; </span>}
                                {item.gsm}gsm
                                <span className="ml-2 font-semibold text-gray-700">Qty: {item.quantity.toLocaleString("en-IN")}</span>
                                <span className="ml-2 text-gray-500">Predicted: {fmt(item.predictedCost)}</span>
                                <span className="ml-2 text-gray-700 font-semibold">Actual: {fmt(item.actualCost)}</span>
                                {item.vendors.length > 0 && <span className="ml-2 text-gray-400">Vendor: {item.vendors.join(", ")}</span>}
                                {item.invoiceNumbers.length > 0 && <span className="ml-2 text-gray-400">Inv: {item.invoiceNumbers.join(", ")}</span>}
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-red-600 text-white text-xs font-bold">
                                +{fmt(item.increase)}{item.increasePct != null && ` (${item.increasePct}%)`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Agency Rates Tab */}
        {activeTab === "agencyRates" && (
          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-start gap-3">
              <IndianRupee size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-blue-800">Agency-negotiated rates, by product × exact quantity</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  For an agent with "Agency Rates" turned on (Profit tab &gt; Sales Agent Categories), a product+quantity found
                  here overrides their normal commission calc: commission = Sale − Agency Rate. Quantity must match one of the
                  columns exactly — a product not in this table (or sold at a quantity with no matching column) still uses the
                  agent's normal commission calc.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input value={newAgencySku} onChange={e => setNewAgencySku(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addAgencyProduct(); }}
                placeholder="Product code (SKU)…" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm w-48" />
              <button onClick={addAgencyProduct} disabled={addingAgencyProduct || !newAgencySku.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50">
                <Plus size={14} /> Add Product
              </button>
              <div className="w-px h-6 bg-gray-200 mx-1" />
              <input value={newAgencyQty} onChange={e => setNewAgencyQty(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={e => { if (e.key === "Enter") addAgencyColumn(); }}
                placeholder="Quantity…" className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm w-32" />
              <button onClick={addAgencyColumn} disabled={addingAgencyColumn || !newAgencyQty.trim()}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                <Plus size={14} /> Add Quantity Column
              </button>
            </div>

            {agencyRatesLoading ? (
              <div className="text-center py-16 text-gray-400">Loading…</div>
            ) : agencyRates.rows.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
                <p className="text-sm text-gray-500 font-medium">No products added yet</p>
                <p className="text-xs text-gray-400 mt-1">Type a product code above to add the first row.</p>
              </div>
            ) : (
              <div className="overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                <table className="text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Product Code</th>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap">Product</th>
                      {agencyRates.columns.length === 0 ? (
                        <th className="px-3 py-2 text-left font-medium text-gray-400 whitespace-nowrap">No quantity columns yet</th>
                      ) : agencyRates.columns.map(col => (
                        <th key={col.id} className="px-3 py-2 text-center font-semibold text-gray-700 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            {col.quantity.toLocaleString("en-IN")}
                            <button onClick={() => deleteAgencyColumn(col.id)} title="Delete this column" className="text-gray-300 hover:text-red-500">
                              <X size={12} />
                            </button>
                          </div>
                        </th>
                      ))}
                      <th className="px-3 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {agencyRates.rows.map(row => (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="sticky left-0 bg-white px-3 py-2 font-mono text-xs font-bold text-blue-700 whitespace-nowrap">{row.sku}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <p className="text-sm font-medium text-gray-900">{row.name}</p>
                          {row.details && <p className="text-xs text-gray-400">{row.details}</p>}
                        </td>
                        {agencyRates.columns.map(col => {
                          const key = `${row.productId}:${col.quantity}`;
                          const existing = row.cells[String(col.quantity)];
                          const draft = agencyCellDrafts[key];
                          const value = draft !== undefined ? draft : (existing != null ? String(existing) : "");
                          return (
                            <td key={col.id} className="px-2 py-1 text-center">
                              <input
                                value={value}
                                onChange={e => setAgencyCellDrafts(d => ({ ...d, [key]: e.target.value }))}
                                onBlur={e => {
                                  if (agencyCellDrafts[key] === undefined) return;
                                  saveAgencyCell(row.productId, col.quantity, e.target.value);
                                }}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                                disabled={savingAgencyCell === key}
                                placeholder="—"
                                className="w-24 rounded border border-gray-200 px-2 py-1 text-sm text-right focus:border-brand-400 outline-none disabled:opacity-50"
                              />
                            </td>
                          );
                        })}
                        <td className="px-2 py-1">
                          <button onClick={() => deleteAgencyProduct(row.id)} title="Remove this product row" className="text-gray-300 hover:text-red-500">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Settings Tab */}
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
                  <span className="text-sm text-gray-500">% of margin</span>
                </div>
              </div>
              <div className="pt-2 border-t border-gray-100 flex items-center gap-3">
                <button
                  onClick={saveSettings}
                  disabled={settingsSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  <Save size={14} /> {settingsSaving ? "Saving..." : "Save Settings"}
                </button>
                {settingsSaved && (
                  <span className="inline-flex items-center gap-1 text-sm text-green-600 font-medium">
                    <CheckCircle size={14} /> Saved!
                  </span>
                )}
              </div>
            </div>

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

      {/* Add Cost Modal */}
      {addCostModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Add Cost Slab</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  For order <strong className="text-amber-700">{addCostModal.orderNo}</strong>
                </p>
              </div>
              <button onClick={() => setAddCostModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>

            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-700 bg-white border border-blue-100 rounded px-1.5 py-0.5">{addCostModal.sku}</span>
              <span className="text-sm font-medium text-gray-800">{addCostModal.productName}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Min Qty <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={modalSlab.minQuantity}
                  onChange={e => setModalSlab(s => ({ ...s, minQuantity: e.target.value }))}
                  placeholder="e.g. 500"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Qty (blank = no limit)</label>
                <input
                  type="number"
                  value={modalSlab.maxQuantity}
                  onChange={e => setModalSlab(s => ({ ...s, maxQuantity: e.target.value }))}
                  placeholder="leave blank"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cost / Unit (Rs.) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={modalSlab.unitPrice}
                  onChange={e => setModalSlab(s => ({ ...s, unitPrice: e.target.value }))}
                  placeholder="e.g. 2.50"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Setup Cost (Rs.)</label>
                <input
                  type="number"
                  step="0.01"
                  value={modalSlab.setupCost}
                  onChange={e => setModalSlab(s => ({ ...s, setupCost: e.target.value }))}
                  placeholder="optional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <p className="text-xs text-gray-400">
              This slab applies to all orders of this product. You can add more slabs or edit them in the Cost Slabs tab.
            </p>

            <div className="flex gap-3 pt-1">
              <button
                onClick={saveModalCostSlab}
                disabled={modalSaving || !modalSlab.minQuantity || !modalSlab.unitPrice}
                className="flex-1 py-2.5 bg-brand-600 text-white text-sm font-semibold rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {modalSaving ? "Saving..." : "Save Cost Slab"}
              </button>
              <button onClick={() => setAddCostModal(null)} className="px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Add Rate Modal */}
      {addRateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900">Add Rate Slab</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  For order <strong className="text-amber-700">{addRateModal.orderNo}</strong>
                </p>
              </div>
              <button onClick={() => setAddRateModal(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-blue-700 bg-white border border-blue-100 rounded px-1.5 py-0.5">{addRateModal.sku}</span>
              <span className="text-sm font-medium text-gray-800">{addRateModal.productName}</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Min Qty <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  value={modalRate.minQuantity}
                  onChange={e => setModalRate(s => ({ ...s, minQuantity: e.target.value }))}
                  placeholder="e.g. 500"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Qty (blank = no limit)</label>
                <input
                  type="number"
                  value={modalRate.maxQuantity}
                  onChange={e => setModalRate(s => ({ ...s, maxQuantity: e.target.value }))}
                  placeholder="leave blank"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate Amount (Rs.) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={modalRate.rateAmount}
                  onChange={e => setModalRate(s => ({ ...s, rateAmount: e.target.value }))}
                  placeholder="e.g. 3500"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <p className="text-xs text-gray-400">
              This rate slab applies to all orders of this product. You can manage all rate slabs in the Rate Calc section.
            </p>

            <div className="flex gap-3 pt-1">
              <button
                onClick={saveModalRateSlab}
                disabled={modalRateSaving || !modalRate.minQuantity || !modalRate.rateAmount}
                className="flex-1 py-2.5 bg-amber-600 text-white text-sm font-semibold rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {modalRateSaving ? "Saving..." : "Save Rate Slab"}
              </button>
              <button onClick={() => setAddRateModal(null)} className="px-4 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
