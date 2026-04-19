"use client";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Upload, X, FileText, Image, Download, Paperclip, Search, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";

const PRODUCTION_STAGES = [
  { value: "NOT_PRINTED", label: "Not Printed" },
  { value: "PRINTING", label: "Printing" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY_FOR_DISPATCH", label: "Ready" },
] as const;
type ProductionStage = (typeof PRODUCTION_STAGES)[number]["value"];
type ProductionCategory = "INHOUSE" | "CLUBBING" | "SHEET_PRODUCTION";

const SHEET_QUALITIES = ["MAPLITHO","STICKER","BOND","ART_CARD","DUPLEX_CARD_WB","DUPLEX_CARD_GB"];
const SHEET_STATUSES = ["INCOMPLETE","SETTING","PRINTING","PROCESSING","COMPLETE"];
const SHEET_STAGES = ["PAPER_PURCHASE","PLATE_MAKING","PRINTING","BINDING","LAMINATION","EXTRA_PROCESSING"];
const JW_STATUSES = ["PENDING","IN_PROGRESS","COMPLETED"];

type DesignFile = { filename: string; originalName: string; uploadedAt: string; size: number; };
type OrderItem = {
  id: string; productName: string; sku: string; quantity: number;
  unitPrice: number; lineTotal: number; productionNotes?: string;
  artworkNotes?: string; itemProductionStage: ProductionStage;
  productionCategory: ProductionCategory | null;
  designFiles?: DesignFile[];
};
type ProductionOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; salesAgentName?: string;
  status: string; productionStage: string;
  orderDate: string; notes?: string; items: OrderItem[];
};
type Vendor = { id: string; name: string; phone?: string; };
type JobWork = { id: string; vendorId: string; vendorName: string; description: string; cost: number; vendorInvoiceNo?: string; status: string; completedAt?: string; };
type ClubbingItem = { id: string; productName: string; quantity: number; productionNotes?: string; artworkNotes?: string; itemProductionStage: string; jobWorks: JobWork[]; };
type ClubbingOrder = { id: string; orderNo: string; customerName: string; customerPhone?: string; salesAgentName?: string; orderDate: string; items: ClubbingItem[]; };
type SheetItem = { id: string; multiple: number; quantityOnSheet: number; areaSqInches: number; orderItem: { id: string; product: { name: string; sizeInches: string; gsm: number; }; order: { orderNumber: string; customer: { businessName: string; } } } };
type StageVendor = { id: string; stage: string; vendorId: string; cost: number; description?: string; vendorInvoiceNo?: string; vendor: { name: string }; };
type PrintSheet = { id: string; sheetNo: string; gsm: number; quality: string; quantity: number; sizeInches: string; areaSqInches: number; printing: string; status: string; usedAreaSqInches: number; items: SheetItem[]; stageVendors: StageVendor[]; };
type PlaceableItem = { id: string; productName: string; sku: string; gsm: number; openSizeInches: string; quantity: number; orderNo: string; customerName: string; };

function parseNotes(notes?: string) {
  if (!notes) return {};
  return {
    size: notes.match(/Size:\s*([^,]+)/)?.[1]?.trim(),
    gsm: notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim(),
    sides: notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim(),
  };
}
function fmt(n: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n); }
function formatBytes(b: number) { if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b/1024).toFixed(1)} KB`; return `${(b/1048576).toFixed(1)} MB`; }
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","tiff","tif"].includes(ext ?? "")) return <Image className="h-3.5 w-3.5 text-blue-500" />;
  return <FileText className="h-3.5 w-3.5 text-orange-500" />;
}
const stageColors: Record<string, string> = { NOT_PRINTED:"bg-gray-100 text-gray-700", PRINTING:"bg-blue-100 text-blue-700", PROCESSING:"bg-yellow-100 text-yellow-700", READY_FOR_DISPATCH:"bg-green-100 text-green-700" };
const categoryColors: Record<string, string> = { INHOUSE:"bg-violet-100 text-violet-700", CLUBBING:"bg-orange-100 text-orange-700", SHEET_PRODUCTION:"bg-cyan-100 text-cyan-700" };
const categoryLabels: Record<string, string> = { INHOUSE:"Inhouse", CLUBBING:"Clubbing", SHEET_PRODUCTION:"Sheet" };
const sheetStatusColors: Record<string, string> = { INCOMPLETE:"bg-gray-100 text-gray-600", SETTING:"bg-yellow-100 text-yellow-700", PRINTING:"bg-blue-100 text-blue-700", PROCESSING:"bg-orange-100 text-orange-700", COMPLETE:"bg-green-100 text-green-700" };
const jwStatusColors: Record<string, string> = { PENDING:"bg-gray-100 text-gray-600", IN_PROGRESS:"bg-blue-100 text-blue-700", COMPLETED:"bg-green-100 text-green-700" };

export default function ProductionPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [clubbingOrders, setClubbingOrders] = useState<ClubbingOrder[]>([]);
  const [sheets, setSheets] = useState<PrintSheet[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [expandedFileItemId, setExpandedFileItemId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"unassigned"|"inhouse"|"clubbing"|"sheets"|"all">("unassigned");
  const [inhouseSubTab, setInhouseSubTab] = useState<"printing_pending"|"processing_pending">("printing_pending");

  // Assign modal
  const [assignModal, setAssignModal] = useState<{ orderId: string; orderNo: string; customerName: string; items: OrderItem[] } | null>(null);
  const [categorySelections, setCategorySelections] = useState<Record<string, ProductionCategory>>({});

  // Clubbing state
  const [expandedClubbingOrder, setExpandedClubbingOrder] = useState<string | null>(null);
  const [expandedClubbingItem, setExpandedClubbingItem] = useState<string | null>(null);
  const [jwForm, setJwForm] = useState<Record<string, { vendorId: string; description: string; cost: string; vendorInvoiceNo: string }>>({});
  const [savingJw, setSavingJw] = useState(false);

  // Vendor modal
  const [vendorModal, setVendorModal] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", phone: "", email: "", gstNumber: "" });
  const [savingVendor, setSavingVendor] = useState(false);

  // Sheet state
  const [createSheetModal, setCreateSheetModal] = useState(false);
  const [sheetForm, setSheetForm] = useState({ gsm: "", quality: "MAPLITHO", quantity: "", sizeInches: "", printing: "SINGLE_SIDE" });
  const [savingSheet, setSavingSheet] = useState(false);
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);
  const [placeableItems, setPlaceableItems] = useState<PlaceableItem[]>([]);
  const [loadingPlaceable, setLoadingPlaceable] = useState(false);
  const [placingItem, setPlacingItem] = useState<string | null>(null);
  const [stageVendorForm, setStageVendorForm] = useState<Record<string, { stage: string; vendorId: string; cost: string; description: string; vendorInvoiceNo: string }>>({});
  const [savingStageVendor, setSavingStageVendor] = useState(false);

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const h = getAuthHeaders();
      const [oRes, cRes, sRes, vRes] = await Promise.all([
        fetch(`${API_BASE_URL}/production/orders`, { headers: h }),
        fetch(`${API_BASE_URL}/production/clubbing/orders`, { headers: h }),
        fetch(`${API_BASE_URL}/production/sheets`, { headers: h }),
        fetch(`${API_BASE_URL}/vendors`, { headers: h }),
      ]);
      if (oRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      setOrders(oRes.ok ? await oRes.json() : []);
      setClubbingOrders(cRes.ok ? await cRes.json() : []);
      setSheets(sRes.ok ? await sRes.json() : []);
      setVendors(vRes.ok ? await vRes.json() : []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  // fix double-parse issue
  const [ordersData, setOrdersData] = useState<ProductionOrder[]>([]);
  const [clubData, setClubData] = useState<ClubbingOrder[]>([]);
  const [sheetsData, setSheetsData] = useState<PrintSheet[]>([]);
  const [vendorsData, setVendorsData] = useState<Vendor[]>([]);

  const loadAll = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const h = getAuthHeaders();
      const [oRes, cRes, sRes, vRes] = await Promise.all([
        fetch(`${API_BASE_URL}/production/orders`, { headers: h }),
        fetch(`${API_BASE_URL}/production/clubbing/orders`, { headers: h }),
        fetch(`${API_BASE_URL}/production/sheets`, { headers: h }),
        fetch(`${API_BASE_URL}/vendors`, { headers: h }),
      ]);
      if (oRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      setOrdersData(oRes.ok ? await oRes.json() : []);
      setClubData(cRes.ok ? await cRes.json() : []);
      setSheetsData(sRes.ok ? await sRes.json() : []);
      setVendorsData(vRes.ok ? await vRes.json() : []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  async function updateItemStage(itemId: string, stage: ProductionStage) {
    setUpdatingItemId(itemId);
    try {
      const res = await fetch(`${API_BASE_URL}/production/items/${itemId}/stage`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { const b = await res.json(); alert(b.message || "Update failed"); }
      await loadAll();
    } finally { setUpdatingItemId(null); }
  }

  async function assignCategory(itemId: string, productionCategory: ProductionCategory) {
    setAssigningItemId(itemId);
    try {
      const res = await fetch(`${API_BASE_URL}/production/items/${itemId}/assign-category`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ productionCategory }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
    } finally { setAssigningItemId(null); }
  }

  async function submitAssignments() {
    const entries = Object.entries(categorySelections);
    if (entries.length === 0) { alert("Select a category for at least one item"); return; }
    for (const [itemId, cat] of entries) await assignCategory(itemId, cat);
    setAssignModal(null); setCategorySelections({});
    await loadAll();
  }

  async function uploadFile(itemId: string, file: File) {
    setUploadingItemId(itemId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files`, { method: "POST", headers: getAuthHeaders(), body: formData });
      if (!res.ok) { alert("Upload failed"); return; }
      await loadAll();
    } finally { setUploadingItemId(null); if (fileInputRefs.current[itemId]) fileInputRefs.current[itemId]!.value = ""; }
  }

  async function deleteFile(itemId: string, filename: string) {
    if (!confirm("Delete this file?")) return;
    setDeletingFile(filename);
    try {
      await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`, { method: "DELETE", headers: getAuthHeaders() });
      await loadAll();
    } finally { setDeletingFile(null); }
  }

  function downloadFile(itemId: string, filename: string, originalName: string) {
    fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`, { headers: getAuthHeaders() })
      .then(r => r.blob()).then(blob => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = originalName; a.click(); URL.revokeObjectURL(a.href); });
  }

  function openAssignModal(o: ProductionOrder) {
    const items = o.items.filter(i => !i.productionCategory);
    if (items.length === 0) { alert("All items already assigned"); return; }
    const defaults: Record<string, ProductionCategory> = {};
    items.forEach(i => { defaults[i.id] = "INHOUSE"; });
    setCategorySelections(defaults);
    setAssignModal({ orderId: o.id, orderNo: o.orderNo, customerName: o.customerName, items });
  }

  // ── Clubbing ─────────────────────────────────────────────────────────────
  async function addJobWork(itemId: string) {
    const f = jwForm[itemId];
    if (!f?.vendorId || !f?.description || !f?.cost) { alert("Fill vendor, description and cost"); return; }
    setSavingJw(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/clubbing/jobworks`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: itemId, vendorId: f.vendorId, description: f.description, cost: Number(f.cost), vendorInvoiceNo: f.vendorInvoiceNo || undefined }),
      });
      if (!res.ok) { alert("Failed to add job work"); return; }
      setJwForm(p => ({ ...p, [itemId]: { vendorId: "", description: "", cost: "", vendorInvoiceNo: "" } }));
      await loadAll();
    } finally { setSavingJw(false); }
  }

  async function updateJwStatus(jwId: string, status: string) {
    await fetch(`${API_BASE_URL}/production/clubbing/jobworks/${jwId}`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadAll();
  }

  async function deleteJobWork(jwId: string) {
    if (!confirm("Remove this job work?")) return;
    await fetch(`${API_BASE_URL}/production/clubbing/jobworks/${jwId}`, { method: "DELETE", headers: getAuthHeaders() });
    await loadAll();
  }

  // ── Vendor ───────────────────────────────────────────────────────────────
  async function createVendor() {
    if (!newVendor.name.trim()) { alert("Vendor name required"); return; }
    setSavingVendor(true);
    try {
      const res = await fetch(`${API_BASE_URL}/vendors`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(newVendor),
      });
      if (!res.ok) { alert("Failed"); return; }
      setVendorModal(false); setNewVendor({ name: "", phone: "", email: "", gstNumber: "" });
      await loadAll();
    } finally { setSavingVendor(false); }
  }

  // ── Sheet ─────────────────────────────────────────────────────────────────
  async function createSheet() {
    if (!sheetForm.gsm || !sheetForm.quantity || !sheetForm.sizeInches) { alert("Fill GSM, quantity and size"); return; }
    setSavingSheet(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ gsm: Number(sheetForm.gsm), quality: sheetForm.quality, quantity: Number(sheetForm.quantity), sizeInches: sheetForm.sizeInches, printing: sheetForm.printing }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      setCreateSheetModal(false); setSheetForm({ gsm: "", quality: "MAPLITHO", quantity: "", sizeInches: "", printing: "SINGLE_SIDE" });
      await loadAll();
    } finally { setSavingSheet(false); }
  }

  async function loadPlaceableItems(gsm: number) {
    setLoadingPlaceable(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets/placeable-items?gsm=${gsm}`, { headers: getAuthHeaders() });
      setPlaceableItems(res.ok ? await res.json() : []);
    } finally { setLoadingPlaceable(false); }
  }

  async function placeItemOnSheet(sheetId: string, item: PlaceableItem) {
    const [w, h] = item.openSizeInches.split("x").map(Number);
    if (!w || !h) { alert("Invalid product size"); return; }
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (!sheet) return;
    const itemArea = w * h;
    const available = sheet.areaSqInches - sheet.usedAreaSqInches;
    const multiple = Math.floor(available / itemArea);
    if (multiple === 0) { alert("Not enough space on sheet"); return; }
    const quantityOnSheet = Math.min(multiple, item.quantity);
    setPlacingItem(item.id);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/items`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: item.id, productId: item.id, multiple, quantityOnSheet, areaSqInches: itemArea * multiple }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      await loadAll();
      await loadPlaceableItems(sheet.gsm);
    } finally { setPlacingItem(null); }
  }

  async function removeSheetItem(id: string) {
    if (!confirm("Remove this item from sheet?")) return;
    await fetch(`${API_BASE_URL}/production/sheets/sheet-items/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    await loadAll();
  }

  async function updateSheetStatus(sheetId: string, status: string) {
    await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/status`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadAll();
  }

  async function addStageVendor(sheetId: string) {
    const f = stageVendorForm[sheetId];
    if (!f?.stage || !f?.vendorId || !f?.cost) { alert("Fill stage, vendor and cost"); return; }
    setSavingStageVendor(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/stage-vendors`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ stage: f.stage, vendorId: f.vendorId, cost: Number(f.cost), description: f.description || undefined, vendorInvoiceNo: f.vendorInvoiceNo || undefined }),
      });
      if (!res.ok) { alert("Failed"); return; }
      setStageVendorForm(p => ({ ...p, [sheetId]: { stage: "", vendorId: "", cost: "", description: "", vendorInvoiceNo: "" } }));
      await loadAll();
    } finally { setSavingStageVendor(false); }
  }

  async function deleteStageVendor(id: string) {
    if (!confirm("Remove vendor from this stage?")) return;
    await fetch(`${API_BASE_URL}/production/sheets/stage-vendors/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    await loadAll();
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const unassignedCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.filter(i => !i.productionCategory).length, 0), [ordersData]);
  const inhouseCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.filter(i => i.productionCategory === "INHOUSE").length, 0), [ordersData]);
  const allCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.length, 0), [ordersData]);
  const unassignedOrders = useMemo(() => ordersData.filter(o => o.items.some(i => !i.productionCategory)), [ordersData]);
  const printingPendingCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.filter(i => i.productionCategory === "INHOUSE" && (i.itemProductionStage === "NOT_PRINTED" || i.itemProductionStage === "PRINTING")).length, 0), [ordersData]);
  const processingPendingCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.filter(i => i.productionCategory === "INHOUSE" && i.itemProductionStage === "PROCESSING").length, 0), [ordersData]);

  type FlatItem = OrderItem & { orderId: string; orderNo: string; customerName: string; customerPhone?: string; salesAgentName?: string; orderDate: string; isFirstInOrder: boolean; };
  const flatItems = useMemo<FlatItem[]>(() => {
    const q = search.trim().toLowerCase();
    const result: FlatItem[] = [];
    for (const o of ordersData) {
      let items = activeTab === "inhouse"
        ? o.items.filter(i => {
            if (i.productionCategory !== "INHOUSE") return false;
            if (inhouseSubTab === "printing_pending") return i.itemProductionStage === "NOT_PRINTED" || i.itemProductionStage === "PRINTING";
            if (inhouseSubTab === "processing_pending") return i.itemProductionStage === "PROCESSING";
            return true;
          })
        : o.items;
      if (q) items = items.filter(i => o.orderNo.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || i.productName.toLowerCase().includes(q));
      items.forEach((item, idx) => result.push({ ...item, orderId: o.id, orderNo: o.orderNo, customerName: o.customerName, customerPhone: o.customerPhone, salesAgentName: o.salesAgentName, orderDate: o.orderDate, isFirstInOrder: idx === 0 }));
    }
    return result;
  }, [ordersData, activeTab, search]);

  const IS = { input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" } };

  const tabs = [
    { key: "unassigned", label: "Unassigned", count: unassignedCount },
    { key: "inhouse",    label: "Inhouse",    count: inhouseCount },
    { key: "clubbing",   label: "Clubbing",   count: clubData.reduce((s,o) => s + o.items.length, 0) },
    { key: "sheets",     label: "Sheets",     count: sheetsData.length },
    { key: "all",        label: "All",        count: allCount },
  ] as const;

  return (
    <>
      <DashboardShell>
        <div className="p-4 lg:p-5 space-y-3">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Production</h1>
              <p className="text-xs text-slate-500 mt-0.5">Assign and track production for approved orders.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setVendorModal(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">+ Vendor</button>
              {activeTab === "sheets" && <button onClick={() => setCreateSheetModal(true)} className="rounded-lg bg-cyan-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-cyan-700">+ New Sheet</button>}
              <button onClick={loadAll} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Refresh</button>
            </div>
          </div>

          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search order, customer, product…"
              className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 w-fit flex-wrap">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {tab.label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${activeTab === tab.key ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>{tab.count}</span>
              </button>
            ))}
          </div>

          {/* ── INHOUSE SUB-TABS ── */}
          {activeTab === "inhouse" && (
            <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1 w-fit">
              <button
                onClick={() => setInhouseSubTab("printing_pending")}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${inhouseSubTab === "printing_pending" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
                🖨️ Printing Pending
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${inhouseSubTab === "printing_pending" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>
                  {printingPendingCount}
                </span>
              </button>
              <button
                onClick={() => setInhouseSubTab("processing_pending")}
                className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${inhouseSubTab === "processing_pending" ? "bg-white text-yellow-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
                ⚙️ Processing Pending
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${inhouseSubTab === "processing_pending" ? "bg-yellow-100 text-yellow-700" : "bg-slate-200 text-slate-500"}`}>
                  {processingPendingCount}
                </span>
              </button>
            </div>
          )}

          {loading && <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>}
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

          {/* ── UNASSIGNED TAB ── */}
          {!loading && activeTab === "unassigned" && (
            <div className="space-y-2">
              {unassignedOrders.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">✅ All items assigned.</div>
              ) : unassignedOrders.map(o => (
                <div key={o.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-blue-700 text-sm">{o.orderNo}</span>
                      <span className="text-slate-700 text-sm font-medium">{o.customerName}</span>
                      {o.customerPhone && <span className="text-slate-400 text-xs">{o.customerPhone}</span>}
                      {o.salesAgentName && <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{o.salesAgentName}</span>}
                    </div>
                    <button onClick={() => openAssignModal(o)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">Assign Production</button>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {o.items.filter(i => !i.productionCategory).map(item => {
                      const { size, gsm, sides } = parseNotes(item.productionNotes);
                      return (
                        <div key={item.id} className="flex items-center gap-4 px-4 py-2 text-xs flex-wrap">
                          <span className="font-medium text-slate-800">{item.productName}</span>
                          <span className="text-slate-400">{size ?? "—"}</span>
                          <span className="text-slate-400">{gsm ?? "—"} GSM</span>
                          <span className="text-slate-400">{sides ?? "—"}</span>
                          <span className="text-slate-600 font-semibold">Qty: {item.quantity}</span>
                          <span className="rounded-full bg-red-50 text-red-600 px-2 py-0.5 font-semibold ml-auto">Not Assigned</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── INHOUSE + ALL TAB ── */}
          {!loading && (activeTab === "inhouse" || activeTab === "all") && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 font-semibold text-slate-600">Order</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Customer</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Agent</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Product</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Size</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">GSM</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Qty</th>
                    {activeTab === "all" && <th className="px-3 py-2 font-semibold text-slate-600">Type</th>}
                    <th className="px-3 py-2 font-semibold text-slate-600">Stage</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Files</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Upload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {flatItems.length === 0 ? (
                    <tr><td colSpan={11} className="px-4 py-10 text-center text-slate-400">No items.</td></tr>
                  ) : flatItems.map(item => {
                    const { size, gsm } = parseNotes(item.productionNotes);
                    const isUpdating = updatingItemId === item.id;
                    const isUploading = uploadingItemId === item.id;
                    const designFiles = item.designFiles ?? [];
                    const isExpanded = expandedFileItemId === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        <tr className={`hover:bg-slate-50 ${item.itemProductionStage === "READY_FOR_DISPATCH" ? "bg-green-50/30" : ""}`}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{item.isFirstInOrder && <div><p className="font-bold text-blue-700">{item.orderNo}</p><p className="text-slate-400">{new Date(item.orderDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</p></div>}</td>
                          <td className="px-3 py-1.5">{item.isFirstInOrder && <div><p className="font-medium text-slate-800 whitespace-nowrap">{item.customerName}</p>{item.customerPhone && <p className="text-slate-400">{item.customerPhone}</p>}</div>}</td>
                          <td className="px-3 py-1.5">{item.isFirstInOrder && item.salesAgentName && <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{item.salesAgentName}</span>}</td>
                          <td className="px-3 py-1.5"><p className="font-medium text-slate-900 whitespace-nowrap">{item.productName}</p>{item.artworkNotes && <p className="text-slate-400 truncate max-w-[120px]">{item.artworkNotes}</p>}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{size ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{gsm ?? "—"}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800">{item.quantity}</td>
                          {activeTab === "all" && <td className="px-3 py-1.5">{item.productionCategory ? <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${categoryColors[item.productionCategory]}`}>{categoryLabels[item.productionCategory]}</span> : <span className="rounded-full bg-red-50 text-red-500 px-1.5 py-0.5 text-xs font-semibold">Unassigned</span>}</td>}
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              {isUpdating && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                              <select value={item.itemProductionStage} disabled={isUpdating} onChange={e => updateItemStage(item.id, e.target.value as ProductionStage)}
                                className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none disabled:opacity-60 cursor-pointer border-transparent ${stageColors[item.itemProductionStage]}`}>
                                {PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <button onClick={() => setExpandedFileItemId(isExpanded ? null : item.id)}
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium border ${designFiles.length > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                              <Paperclip className="h-3 w-3" />{designFiles.length}
                            </button>
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden"
                              accept=".jpg,.jpeg,.png,.gif,.pdf,.ai,.psd,.cdr,.zip,.svg,.tiff,.tif,.eps,.webp"
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(item.id, f); }} />
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button onClick={() => fileInputRefs.current[item.id]?.click()} disabled={isUploading}
                                className="inline-flex items-center gap-0.5 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                                {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                {isUploading ? "..." : "Upload"}
                              </button>
                              {activeTab === "inhouse" && inhouseSubTab === "printing_pending" && (item.itemProductionStage === "NOT_PRINTED" || item.itemProductionStage === "PRINTING") && (
                                <button onClick={() => updateItemStage(item.id, "PROCESSING")} disabled={isUpdating}
                                  className="inline-flex items-center gap-0.5 rounded-md bg-yellow-500 px-2 py-0.5 text-xs font-semibold text-white hover:bg-yellow-600 disabled:opacity-60 whitespace-nowrap">
                                  {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                  Move to Processing
                                </button>
                              )}
                              {activeTab === "inhouse" && inhouseSubTab === "processing_pending" && item.itemProductionStage === "PROCESSING" && (
                                <button onClick={() => updateItemStage(item.id, "READY_FOR_DISPATCH")} disabled={isUpdating}
                                  className="inline-flex items-center gap-0.5 rounded-md bg-green-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60 whitespace-nowrap">
                                  {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                  Mark Ready
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {isExpanded && designFiles.length > 0 && (
                          <tr><td colSpan={11} className="bg-blue-50 border-t border-blue-100 px-4 py-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-semibold text-blue-800">Files for {item.productName}</p>
                              <button onClick={() => setExpandedFileItemId(null)}><X className="h-3.5 w-3.5 text-blue-400" /></button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {designFiles.map(f => (
                                <div key={f.filename} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                                  {getFileIcon(f.originalName)}
                                  <div><p className="text-xs font-medium text-slate-800 max-w-[160px] truncate">{f.originalName}</p><p className="text-xs text-slate-400">{formatBytes(f.size)}</p></div>
                                  <button onClick={() => downloadFile(item.id, f.filename, f.originalName)} className="text-slate-400 hover:text-blue-600 p-1"><Download className="h-3 w-3" /></button>
                                  <button onClick={() => deleteFile(item.id, f.filename)} disabled={deletingFile === f.filename} className="text-slate-400 hover:text-red-500 p-1 disabled:opacity-50">
                                    {deletingFile === f.filename ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                  </button>
                                </div>
                              ))}
                            </div>
                          </td></tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── CLUBBING TAB ── */}
          {!loading && activeTab === "clubbing" && (
            <div className="space-y-3">
              {clubData.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No clubbing items. Assign items as Clubbing from the Unassigned tab.</div>
              ) : clubData.map(o => (
                <div key={o.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-orange-50 border-b border-orange-100 cursor-pointer" onClick={() => setExpandedClubbingOrder(expandedClubbingOrder === o.id ? null : o.id)}>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-blue-700 text-sm">{o.orderNo}</span>
                      <span className="text-slate-700 text-sm font-medium">{o.customerName}</span>
                      {o.salesAgentName && <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{o.salesAgentName}</span>}
                      <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-xs font-semibold">{o.items.length} item{o.items.length > 1 ? "s" : ""}</span>
                      <span className="text-xs text-slate-500 font-semibold">Total cost: {fmt(o.items.reduce((s, i) => s + i.jobWorks.reduce((ss, j) => ss + j.cost, 0), 0))}</span>
                    </div>
                    {expandedClubbingOrder === o.id ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                  </div>
                  {expandedClubbingOrder === o.id && (
                    <div className="divide-y divide-slate-100">
                      {o.items.map(item => {
                        const { size, gsm } = parseNotes(item.productionNotes);
                        const isExpItem = expandedClubbingItem === item.id;
                        const f = jwForm[item.id] ?? { vendorId: "", description: "", cost: "", vendorInvoiceNo: "" };
                        const totalCost = item.jobWorks.reduce((s, j) => s + j.cost, 0);
                        return (
                          <div key={item.id}>
                            <div className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-50" onClick={() => setExpandedClubbingItem(isExpItem ? null : item.id)}>
                              <div className="flex items-center gap-3 text-xs flex-wrap">
                                <span className="font-semibold text-slate-800">{item.productName}</span>
                                <span className="text-slate-400">{size ?? "—"} · {gsm ?? "—"} GSM · Qty {item.quantity}</span>
                                {item.artworkNotes && <span className="text-slate-400 italic">{item.artworkNotes}</span>}
                                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${stageColors[item.itemProductionStage] ?? "bg-gray-100 text-gray-600"}`}>{item.itemProductionStage.replace(/_/g, " ")}</span>
                                <span className="text-orange-700 font-semibold">{item.jobWorks.length} vendor{item.jobWorks.length !== 1 ? "s" : ""} · {fmt(totalCost)}</span>
                              </div>
                              {isExpItem ? <ChevronUp className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                            </div>
                            {isExpItem && (
                              <div className="px-4 pb-4 space-y-3 bg-orange-50/30">
                                {/* Existing job works */}
                                {item.jobWorks.length > 0 && (
                                  <div className="space-y-1.5">
                                    {item.jobWorks.map(jw => (
                                      <div key={jw.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                                        <div className="flex-1 min-w-0">
                                          <p className="font-semibold text-slate-800">{jw.vendorName}</p>
                                          <p className="text-slate-500">{jw.description}</p>
                                          {jw.vendorInvoiceNo && <p className="text-slate-400">Invoice: {jw.vendorInvoiceNo}</p>}
                                        </div>
                                        <span className="font-bold text-orange-700 whitespace-nowrap">{fmt(jw.cost)}</span>
                                        <select value={jw.status} onChange={e => updateJwStatus(jw.id, e.target.value)}
                                          className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none border-transparent ${jwStatusColors[jw.status]}`}>
                                          {JW_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                                        </select>
                                        <button onClick={() => deleteJobWork(jw.id)} className="text-slate-300 hover:text-red-500 p-1"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {/* Add job work form */}
                                <div className="rounded-lg border border-dashed border-orange-200 bg-white p-3">
                                  <p className="text-xs font-semibold text-orange-700 mb-2">+ Add Vendor / Job Work</p>
                                  <div className="grid grid-cols-2 gap-2 mb-2">
                                    <div>
                                      <label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                                      <select value={f.vendorId} onChange={e => setJwForm(p => ({ ...p, [item.id]: { ...f, vendorId: e.target.value } }))} style={IS.input}>
                                        <option value="">Select vendor...</option>
                                        {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-500 mb-1">Cost (₹) *</label>
                                      <input type="number" value={f.cost} onChange={e => setJwForm(p => ({ ...p, [item.id]: { ...f, cost: e.target.value } }))} placeholder="0.00" style={IS.input} />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-500 mb-1">Description *</label>
                                      <input value={f.description} onChange={e => setJwForm(p => ({ ...p, [item.id]: { ...f, description: e.target.value } }))} placeholder="e.g. Lamination, Die cut" style={IS.input} />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-slate-500 mb-1">Invoice No</label>
                                      <input value={f.vendorInvoiceNo} onChange={e => setJwForm(p => ({ ...p, [item.id]: { ...f, vendorInvoiceNo: e.target.value } }))} placeholder="Optional" style={IS.input} />
                                    </div>
                                  </div>
                                  <button onClick={() => addJobWork(item.id)} disabled={savingJw}
                                    className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
                                    {savingJw ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── SHEETS TAB ── */}
          {!loading && activeTab === "sheets" && (
            <div className="space-y-3">
              {sheetsData.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No sheets yet. Click "+ New Sheet" to create one.</div>
              ) : sheetsData.map(sheet => {
                const isExp = expandedSheet === sheet.id;
                const usedPct = sheet.areaSqInches > 0 ? Math.round((sheet.usedAreaSqInches / sheet.areaSqInches) * 100) : 0;
                const svf = stageVendorForm[sheet.id] ?? { stage: "", vendorId: "", cost: "", description: "", vendorInvoiceNo: "" };
                return (
                  <div key={sheet.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    {/* Sheet header */}
                    <div className="flex items-center justify-between px-4 py-2.5 bg-cyan-50 border-b border-cyan-100 cursor-pointer" onClick={() => {
                      setExpandedSheet(isExp ? null : sheet.id);
                      if (!isExp) loadPlaceableItems(sheet.gsm);
                    }}>
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="font-bold text-cyan-700 text-sm">{sheet.sheetNo}</span>
                        <span className="text-slate-600 text-xs">{sheet.gsm} GSM · {sheet.quality.replace(/_/g, " ")} · {sheet.sizeInches}" · Qty {sheet.quantity}</span>
                        <span className="text-xs text-slate-500">{sheet.printing === "SINGLE_SIDE" ? "Single" : "Double"} side</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sheetStatusColors[sheet.status]}`}>{sheet.status}</span>
                        <span className="text-xs text-slate-500">{usedPct}% used · {sheet.items.length} item{sheet.items.length !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <select value={sheet.status} onClick={e => e.stopPropagation()} onChange={e => updateSheetStatus(sheet.id, e.target.value)}
                          className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none border-transparent ${sheetStatusColors[sheet.status]}`}>
                          {SHEET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        {isExp ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                      </div>
                    </div>

                    {isExp && (
                      <div className="p-4 space-y-4">
                        {/* Space bar */}
                        <div>
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>Space used: {sheet.usedAreaSqInches.toFixed(1)} / {sheet.areaSqInches} sq in</span>
                            <span>{usedPct}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${usedPct > 90 ? "bg-red-500" : usedPct > 70 ? "bg-yellow-500" : "bg-cyan-500"}`} style={{ width: `${usedPct}%` }} />
                          </div>
                        </div>

                        {/* Items on sheet */}
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2">Items on this sheet</p>
                          {sheet.items.length === 0 ? <p className="text-xs text-slate-400">No items placed yet.</p> : (
                            <div className="space-y-1.5">
                              {sheet.items.map(si => (
                                <div key={si.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                  <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                  <span className="text-slate-500">{si.orderItem.order.orderNumber} — {si.orderItem.order.customer.businessName}</span>
                                  <span className="text-slate-400">{si.orderItem.product.sizeInches}"</span>
                                  <span className="text-cyan-700 font-semibold">×{si.multiple} · Qty {si.quantityOnSheet}</span>
                                  <span className="text-slate-400">{si.areaSqInches.toFixed(1)} sq in</span>
                                  <button onClick={() => removeSheetItem(si.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Placeable items */}
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2">Place items (GSM: {sheet.gsm})</p>
                          {loadingPlaceable ? <Loader2 className="h-4 w-4 animate-spin text-cyan-600" /> : placeableItems.length === 0 ? (
                            <p className="text-xs text-slate-400">No unplaced items with {sheet.gsm} GSM.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {placeableItems.map(pi => {
                                const [w, h] = pi.openSizeInches.split("x").map(Number);
                                const itemArea = (w && h) ? w * h : 0;
                                const available = sheet.areaSqInches - sheet.usedAreaSqInches;
                                const fits = itemArea > 0 ? Math.floor(available / itemArea) : 0;
                                return (
                                  <div key={pi.id} className="flex items-center gap-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs">
                                    <span className="font-semibold text-slate-800">{pi.productName}</span>
                                    <span className="text-slate-500">{pi.orderNo} — {pi.customerName}</span>
                                    <span className="text-slate-400">{pi.openSizeInches}" · Qty {pi.quantity}</span>
                                    <span className="text-cyan-700 font-semibold">Fits: {fits}×</span>
                                    <button onClick={() => placeItemOnSheet(sheet.id, pi)} disabled={fits === 0 || placingItem === pi.id}
                                      className="ml-auto inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50">
                                      {placingItem === pi.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Place
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Stage vendors */}
                        <div>
                          <p className="text-xs font-semibold text-slate-600 mb-2">Stage Vendors</p>
                          {sheet.stageVendors.length > 0 && (
                            <div className="space-y-1.5 mb-3">
                              {sheet.stageVendors.map(sv => (
                                <div key={sv.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                                  <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-semibold">{sv.stage.replace(/_/g, " ")}</span>
                                  <span className="font-semibold text-slate-800">{sv.vendor.name}</span>
                                  {sv.description && <span className="text-slate-400">{sv.description}</span>}
                                  {sv.vendorInvoiceNo && <span className="text-slate-400">Inv: {sv.vendorInvoiceNo}</span>}
                                  <span className="font-bold text-cyan-700 whitespace-nowrap">{fmt(sv.cost)}</span>
                                  <button onClick={() => deleteStageVendor(sv.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="rounded-lg border border-dashed border-cyan-200 bg-cyan-50/50 p-3">
                            <p className="text-xs font-semibold text-cyan-700 mb-2">+ Assign Stage Vendor</p>
                            <div className="grid grid-cols-3 gap-2 mb-2">
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Stage *</label>
                                <select value={svf.stage} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, stage: e.target.value } }))} style={IS.input}>
                                  <option value="">Select...</option>
                                  {SHEET_STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                                <select value={svf.vendorId} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, vendorId: e.target.value } }))} style={IS.input}>
                                  <option value="">Select...</option>
                                  {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Cost (₹) *</label>
                                <input type="number" value={svf.cost} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, cost: e.target.value } }))} placeholder="0.00" style={IS.input} />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Description</label>
                                <input value={svf.description} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, description: e.target.value } }))} placeholder="Optional" style={IS.input} />
                              </div>
                              <div>
                                <label className="block text-xs text-slate-500 mb-1">Invoice No</label>
                                <input value={svf.vendorInvoiceNo} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, vendorInvoiceNo: e.target.value } }))} placeholder="Optional" style={IS.input} />
                              </div>
                            </div>
                            <button onClick={() => addStageVendor(sheet.id)} disabled={savingStageVendor}
                              className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
                              {savingStageVendor ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </DashboardShell>

      {/* ── Assign Modal ── */}
      {assignModal && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"36rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)",maxHeight:"90vh",overflowY:"auto" }}>
            <div className="flex items-center justify-between mb-4">
              <div><h2 className="text-base font-semibold text-slate-900">Assign Production Type</h2><p className="text-xs text-slate-500 mt-0.5">{assignModal.orderNo} — {assignModal.customerName}</p></div>
              <button onClick={() => setAssignModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {assignModal.items.map(item => {
                const { size, gsm } = parseNotes(item.productionNotes);
                const selected = categorySelections[item.id];
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2"><p className="text-sm font-semibold text-slate-800">{item.productName}</p><p className="text-xs text-slate-400">{size ?? "—"} · {gsm ?? "—"} GSM · Qty {item.quantity}</p></div>
                    <div className="flex gap-2">
                      {(["INHOUSE","CLUBBING","SHEET_PRODUCTION"] as ProductionCategory[]).map(cat => (
                        <button key={cat} onClick={() => setCategorySelections(p => ({ ...p, [item.id]: cat }))}
                          className={`flex-1 rounded-lg border py-2 text-xs font-semibold transition ${selected === cat ? categoryColors[cat] + " border-current" : "border-slate-200 text-slate-500 hover:border-slate-300 bg-white"}`}>
                          {categoryLabels[cat]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setAssignModal(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitAssignments} disabled={!!assigningItemId}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                {assigningItemId ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vendor Modal ── */}
      {vendorModal && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"28rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Add Vendor</h2>
              <button onClick={() => setVendorModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              {[["Name *","name","text","Vendor / Business name"],["Phone","phone","text",""],["Email","email","email",""],["GST Number","gstNumber","text",""]].map(([label,field,type,placeholder]) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
                  <input type={type} value={(newVendor as any)[field]} onChange={e => setNewVendor(p => ({ ...p, [field]: e.target.value }))} placeholder={placeholder} style={IS.input} />
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setVendorModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={createVendor} disabled={savingVendor}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60">
                {savingVendor ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Vendor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Create Sheet Modal ── */}
      {createSheetModal && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"32rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900">Create New Sheet</h2>
              <button onClick={() => setCreateSheetModal(false)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">GSM *</label>
                <input type="number" value={sheetForm.gsm} onChange={e => setSheetForm(p => ({ ...p, gsm: e.target.value }))} placeholder="e.g. 130" style={IS.input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quality *</label>
                <select value={sheetForm.quality} onChange={e => setSheetForm(p => ({ ...p, quality: e.target.value }))} style={IS.input}>
                  {SHEET_QUALITIES.map(q => <option key={q} value={q}>{q.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantity *</label>
                <input type="number" value={sheetForm.quantity} onChange={e => setSheetForm(p => ({ ...p, quantity: e.target.value }))} placeholder="e.g. 500" style={IS.input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Size (WxH inches) *</label>
                <input value={sheetForm.sizeInches} onChange={e => setSheetForm(p => ({ ...p, sizeInches: e.target.value }))} placeholder="e.g. 18x23" style={IS.input} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Printing</label>
                <select value={sheetForm.printing} onChange={e => setSheetForm(p => ({ ...p, printing: e.target.value }))} style={IS.input}>
                  <option value="SINGLE_SIDE">Single Side</option>
                  <option value="DOUBLE_SIDE">Double Side</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setCreateSheetModal(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={createSheet} disabled={savingSheet}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
                {savingSheet ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Create Sheet
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

