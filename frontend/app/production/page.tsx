"use client";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Upload, X, FileText, Image, Download, Paperclip, Search } from "lucide-react";
import { useRouter } from "next/navigation";

const PRODUCTION_STAGES = [
  { value: "NOT_PRINTED", label: "Not Printed" },
  { value: "PRINTING", label: "Printing" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY_FOR_DISPATCH", label: "Ready" },
] as const;

type ProductionStage = (typeof PRODUCTION_STAGES)[number]["value"];
type ProductionCategory = "INHOUSE" | "CLUBBING" | "SHEET_PRODUCTION";

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
  status: string; productionStage: ProductionStage;
  orderDate: string; notes?: string; items: OrderItem[];
};

function parseNotes(notes?: string) {
  if (!notes) return {};
  return {
    size: notes.match(/Size:\s*([^,]+)/)?.[1]?.trim(),
    gsm: notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim(),
    sides: notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim(),
  };
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","tiff","tif"].includes(ext ?? ""))
    return <Image className="h-3.5 w-3.5 text-blue-500" />;
  return <FileText className="h-3.5 w-3.5 text-orange-500" />;
}

const stageColors: Record<string, string> = {
  NOT_PRINTED: "bg-gray-100 text-gray-700",
  PRINTING: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-yellow-100 text-yellow-700",
  READY_FOR_DISPATCH: "bg-green-100 text-green-700",
};
const categoryColors: Record<string, string> = {
  INHOUSE: "bg-violet-100 text-violet-700",
  CLUBBING: "bg-orange-100 text-orange-700",
  SHEET_PRODUCTION: "bg-cyan-100 text-cyan-700",
};
const categoryLabels: Record<string, string> = {
  INHOUSE: "Inhouse",
  CLUBBING: "Clubbing",
  SHEET_PRODUCTION: "Sheet",
};

export default function ProductionPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [assigningItemId, setAssigningItemId] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [expandedFileItemId, setExpandedFileItemId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<"unassigned" | "inhouse" | "all">("unassigned");

  // Assign modal
  const [assignModal, setAssignModal] = useState<{ orderId: string; orderNo: string; customerName: string; items: OrderItem[] } | null>(null);
  const [categorySelections, setCategorySelections] = useState<Record<string, ProductionCategory>>({});

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/orders`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { setError("Could not load production orders"); return; }
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  async function updateItemStage(itemId: string, stage: ProductionStage) {
    setUpdatingItemId(itemId);
    try {
      const res = await fetch(`${API_BASE_URL}/production/items/${itemId}/stage`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { const b = await res.json(); alert(b.message || "Update failed"); }
      await load();
    } finally { setUpdatingItemId(null); }
  }

  async function assignCategory(itemId: string, productionCategory: ProductionCategory) {
    setAssigningItemId(itemId);
    try {
      const res = await fetch(`${API_BASE_URL}/production/items/${itemId}/assign-category`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ productionCategory }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
    } finally { setAssigningItemId(null); }
  }

  async function submitAssignments() {
    const entries = Object.entries(categorySelections);
    if (entries.length === 0) { alert("Please select a category for at least one item"); return; }
    for (const [itemId, cat] of entries) {
      await assignCategory(itemId, cat);
    }
    setAssignModal(null);
    setCategorySelections({});
    await load();
  }

  async function uploadFile(itemId: string, file: File) {
    setUploadingItemId(itemId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files`, {
        method: "POST", headers: getAuthHeaders(), body: formData,
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Upload failed"); return; }
      await load();
    } finally {
      setUploadingItemId(null);
      if (fileInputRefs.current[itemId]) fileInputRefs.current[itemId]!.value = "";
    }
  }

  async function deleteFile(itemId: string, filename: string) {
    if (!confirm("Delete this design file?")) return;
    setDeletingFile(filename);
    try {
      const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) { alert("Delete failed"); return; }
      await load();
    } finally { setDeletingFile(null); }
  }

  function downloadFile(itemId: string, filename: string, originalName: string) {
    fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`, { headers: getAuthHeaders() })
      .then(r => r.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = originalName; a.click();
        URL.revokeObjectURL(a.href);
      }).catch(() => alert("Download failed"));
  }

  function openAssignModal(o: ProductionOrder) {
    const unassignedItems = o.items.filter(i => !i.productionCategory);
    if (unassignedItems.length === 0) { alert("All items already assigned"); return; }
    const defaults: Record<string, ProductionCategory> = {};
    unassignedItems.forEach(i => { defaults[i.id] = "INHOUSE"; });
    setCategorySelections(defaults);
    setAssignModal({ orderId: o.id, orderNo: o.orderNo, customerName: o.customerName, items: unassignedItems });
  }

  // Flatten all items with order context for table rendering
  type FlatItem = OrderItem & { orderId: string; orderNo: string; customerName: string; customerPhone?: string; salesAgentName?: string; orderDate: string; isFirstInOrder: boolean; orderItemCount: number; };

  const flatItems = useMemo<FlatItem[]>(() => {
    const q = search.trim().toLowerCase();
    const result: FlatItem[] = [];
    for (const o of orders) {
      let items = o.items;
      if (activeTab === "unassigned") items = o.items.filter(i => !i.productionCategory);
      if (activeTab === "inhouse") items = o.items.filter(i => i.productionCategory === "INHOUSE");
      if (q) {
        const orderMatch = o.orderNo.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || (o.customerPhone ?? "").includes(q) || (o.salesAgentName ?? "").toLowerCase().includes(q);
        if (!orderMatch) items = items.filter(i => i.productName.toLowerCase().includes(q));
        else if (!orderMatch) items = [];
      }
      items.forEach((item, idx) => {
        result.push({ ...item, orderId: o.id, orderNo: o.orderNo, customerName: o.customerName, customerPhone: o.customerPhone, salesAgentName: o.salesAgentName, orderDate: o.orderDate, isFirstInOrder: idx === 0, orderItemCount: items.length });
      });
    }
    return result;
  }, [orders, activeTab, search]);

  // Tab counts
  const unassignedCount = useMemo(() => orders.reduce((s, o) => s + o.items.filter(i => !i.productionCategory).length, 0), [orders]);
  const inhouseCount = useMemo(() => orders.reduce((s, o) => s + o.items.filter(i => i.productionCategory === "INHOUSE").length, 0), [orders]);
  const allCount = useMemo(() => orders.reduce((s, o) => s + o.items.length, 0), [orders]);

  // Unique orders in unassigned tab (for assign button)
  const unassignedOrders = useMemo(() => orders.filter(o => o.items.some(i => !i.productionCategory)), [orders]);

  const tabs = [
    { key: "unassigned", label: "Unassigned", count: unassignedCount, color: "text-red-600" },
    { key: "inhouse",    label: "Inhouse",    count: inhouseCount,    color: "text-violet-600" },
    { key: "all",        label: "All Items",  count: allCount,        color: "text-slate-600" },
  ] as const;

  return (
    <>
      <DashboardShell>
        <div className="p-4 lg:p-5">
          <div className="space-y-3">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Production</h1>
                <p className="text-xs text-slate-500 mt-0.5">Assign and track production for approved orders.</p>
              </div>
              <button onClick={load} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                Refresh
              </button>
            </div>

            {/* Search */}
            <div className="relative max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search order, customer, product…"
                className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
            </div>

            {/* Tabs */}
            <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5 w-fit">
              {tabs.map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${activeTab === tab.key ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Unassigned tab — show order cards with Assign button */}
            {activeTab === "unassigned" && !loading && (
              <div className="space-y-2">
                {unassignedOrders.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
                    ✅ All items have been assigned to a production type.
                  </div>
                ) : unassignedOrders.map(o => {
                  const unassigned = o.items.filter(i => !i.productionCategory);
                  return (
                    <div key={o.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                      {/* Order header */}
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-blue-700 text-sm">{o.orderNo}</span>
                          <span className="text-slate-700 text-sm font-medium">{o.customerName}</span>
                          {o.customerPhone && <span className="text-slate-400 text-xs">{o.customerPhone}</span>}
                          {o.salesAgentName && <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{o.salesAgentName}</span>}
                          <span className="text-slate-400 text-xs">{new Date(o.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                        </div>
                        <button onClick={() => openAssignModal(o)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">
                          Assign Production
                        </button>
                      </div>
                      {/* Items */}
                      <div className="divide-y divide-slate-50">
                        {unassigned.map(item => {
                          const { size, gsm, sides } = parseNotes(item.productionNotes);
                          const sidesLabel = sides === "SINGLE_SIDE" ? "Single" : sides === "DOUBLE_SIDE" ? "Double" : sides ?? "—";
                          return (
                            <div key={item.id} className="flex items-center gap-4 px-4 py-2 text-xs">
                              <span className="font-medium text-slate-800 min-w-[120px]">{item.productName}</span>
                              <span className="text-slate-400">{size ?? "—"}</span>
                              <span className="text-slate-400">{gsm ?? "—"} GSM</span>
                              <span className="text-slate-400">{sidesLabel}</span>
                              <span className="text-slate-600 font-semibold">Qty: {item.quantity}</span>
                              {item.artworkNotes && <span className="text-slate-400 italic truncate max-w-[150px]">{item.artworkNotes}</span>}
                              <span className="rounded-full bg-red-50 text-red-600 px-2 py-0.5 font-semibold ml-auto">Not Assigned</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Inhouse + All tabs — table view */}
            {(activeTab === "inhouse" || activeTab === "all") && (
              loading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
              ) : error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                  <table className="w-full text-left text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 font-semibold text-slate-600 whitespace-nowrap">Order</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Agent</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Product</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Size</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">GSM</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Sides</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Qty</th>
                        {activeTab === "all" && <th className="px-3 py-2 font-semibold text-slate-600">Type</th>}
                        <th className="px-3 py-2 font-semibold text-slate-600">Stage</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Files</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Upload</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {flatItems.length === 0 ? (
                        <tr><td colSpan={12} className="px-4 py-10 text-center text-slate-400">No items found.</td></tr>
                      ) : flatItems.map(item => {
                        const { size, gsm, sides } = parseNotes(item.productionNotes);
                        const sidesLabel = sides === "SINGLE_SIDE" ? "Single" : sides === "DOUBLE_SIDE" ? "Double" : sides ?? "—";
                        const isUpdating = updatingItemId === item.id;
                        const isUploading = uploadingItemId === item.id;
                        const designFiles = item.designFiles ?? [];
                        const isExpanded = expandedFileItemId === item.id;

                        return (
                          <React.Fragment key={item.id}>
                            <tr className={`hover:bg-slate-50 ${item.itemProductionStage === "READY_FOR_DISPATCH" ? "bg-green-50/30" : ""}`}>
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                {item.isFirstInOrder && (
                                  <div>
                                    <p className="font-bold text-blue-700">{item.orderNo}</p>
                                    <p className="text-slate-400">{new Date(item.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</p>
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-1.5">
                                {item.isFirstInOrder && (
                                  <div>
                                    <p className="font-medium text-slate-800 whitespace-nowrap">{item.customerName}</p>
                                    {item.customerPhone && <p className="text-slate-400">{item.customerPhone}</p>}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-1.5">
                                {item.isFirstInOrder && item.salesAgentName && (
                                  <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap">{item.salesAgentName}</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5">
                                <p className="font-medium text-slate-900 whitespace-nowrap">{item.productName}</p>
                                {item.artworkNotes && <p className="text-slate-400 truncate max-w-[120px]">{item.artworkNotes}</p>}
                              </td>
                              <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{size ?? "—"}</td>
                              <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{gsm ?? "—"}</td>
                              <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{sidesLabel}</td>
                              <td className="px-3 py-1.5 font-semibold text-slate-800">{item.quantity}</td>
                              {activeTab === "all" && (
                                <td className="px-3 py-1.5">
                                  {item.productionCategory ? (
                                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${categoryColors[item.productionCategory]}`}>
                                      {categoryLabels[item.productionCategory]}
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-red-50 text-red-500 px-1.5 py-0.5 text-xs font-semibold">Unassigned</span>
                                  )}
                                </td>
                              )}
                              <td className="px-3 py-1.5">
                                {item.productionCategory === "INHOUSE" || activeTab === "all" ? (
                                  <div className="flex items-center gap-1">
                                    {isUpdating && <Loader2 className="h-3 w-3 animate-spin text-blue-600 shrink-0" />}
                                    <select value={item.itemProductionStage} disabled={isUpdating}
                                      onChange={e => updateItemStage(item.id, e.target.value as ProductionStage)}
                                      className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none disabled:opacity-60 cursor-pointer border-transparent ${stageColors[item.itemProductionStage]}`}>
                                      {PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                    </select>
                                  </div>
                                ) : (
                                  <span className="text-slate-300 text-xs">—</span>
                                )}
                              </td>
                              <td className="px-3 py-1.5">
                                <button onClick={() => setExpandedFileItemId(isExpanded ? null : item.id)}
                                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium border transition ${designFiles.length > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                                  <Paperclip className="h-3 w-3" />{designFiles.length}
                                </button>
                              </td>
                              <td className="px-3 py-1.5">
                                <div className="flex items-center gap-1">
                                  <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden"
                                    accept=".jpg,.jpeg,.png,.gif,.pdf,.ai,.psd,.cdr,.zip,.svg,.tiff,.tif,.eps,.webp"
                                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(item.id, f); }} />
                                  <button onClick={() => fileInputRefs.current[item.id]?.click()} disabled={isUploading}
                                    className="inline-flex items-center gap-0.5 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                                    {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                                    {isUploading ? "..." : "Upload"}
                                  </button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && designFiles.length > 0 && (
                              <tr>
                                <td colSpan={12} className="bg-blue-50 border-t border-blue-100 px-4 py-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-xs font-semibold text-blue-800">Files for {item.productName} ({item.orderNo})</p>
                                    <button onClick={() => setExpandedFileItemId(null)}><X className="h-3.5 w-3.5 text-blue-400" /></button>
                                  </div>
                                  <div className="flex flex-wrap gap-2">
                                    {designFiles.map(f => (
                                      <div key={f.filename} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5">
                                        {getFileIcon(f.originalName)}
                                        <div>
                                          <p className="text-xs font-medium text-slate-800 max-w-[160px] truncate">{f.originalName}</p>
                                          <p className="text-xs text-slate-400">{formatBytes(f.size)}</p>
                                        </div>
                                        <button onClick={() => downloadFile(item.id, f.filename, f.originalName)} className="text-slate-400 hover:text-blue-600 p-1"><Download className="h-3 w-3" /></button>
                                        <button onClick={() => deleteFile(item.id, f.filename)} disabled={deletingFile === f.filename} className="text-slate-400 hover:text-red-500 p-1 disabled:opacity-50">
                                          {deletingFile === f.filename ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Loading state for unassigned tab */}
            {activeTab === "unassigned" && loading && (
              <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
            )}

          </div>
        </div>
      </DashboardShell>

      {/* ── Assign Production Modal ─────────────────────────────────────── */}
      {assignModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(15,23,42,0.6)", padding: "1rem" }}>
          <div style={{ width: "100%", maxWidth: "36rem", background: "white", borderRadius: "1rem", border: "1px solid #e2e8f0", padding: "1.5rem", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Assign Production Type</h2>
                <p className="text-xs text-slate-500 mt-0.5">{assignModal.orderNo} — {assignModal.customerName}</p>
              </div>
              <button onClick={() => setAssignModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            <div className="space-y-3">
              {assignModal.items.map(item => {
                const { size, gsm } = parseNotes(item.productionNotes);
                const selected = categorySelections[item.id];
                return (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{item.productName}</p>
                        <p className="text-xs text-slate-400">{size ?? "—"} · {gsm ?? "—"} GSM · Qty {item.quantity}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {(["INHOUSE", "CLUBBING", "SHEET_PRODUCTION"] as ProductionCategory[]).map(cat => (
                        <button key={cat}
                          onClick={() => setCategorySelections(p => ({ ...p, [item.id]: cat }))}
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
              <button onClick={() => setAssignModal(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={submitAssignments} disabled={!!assigningItemId}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60">
                {assigningItemId ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
