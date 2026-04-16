"use client";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Upload, X, FileText, Image, Download, Paperclip, Search, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";

const PRODUCTION_STAGES = [
  { value: "NOT_PRINTED", label: "Not Printed" },
  { value: "PRINTING", label: "Printing" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY_FOR_DISPATCH", label: "Ready" },
] as const;

type ProductionStage = (typeof PRODUCTION_STAGES)[number]["value"];

type DesignFile = { filename: string; originalName: string; uploadedAt: string; size: number; };

type OrderItem = {
  id: string; productName: string; sku: string; quantity: number;
  unitPrice: number; lineTotal: number; productionNotes?: string;
  artworkNotes?: string; itemProductionStage: ProductionStage;
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
  const size = notes.match(/Size:\s*([^,]+)/)?.[1]?.trim();
  const gsm = notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim();
  const sides = notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim();
  return { size, gsm, sides };
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
  const ext = name.split('.').pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","tiff","tif"].includes(ext ?? "")) return <Image className="h-3.5 w-3.5 text-blue-500" />;
  return <FileText className="h-3.5 w-3.5 text-orange-500" />;
}

const stageColors: Record<string, string> = {
  NOT_PRINTED: "bg-gray-100 text-gray-700",
  PRINTING: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-yellow-100 text-yellow-700",
  READY_FOR_DISPATCH: "bg-green-100 text-green-700",
};
const stageDot: Record<string, string> = {
  NOT_PRINTED: "bg-gray-400",
  PRINTING: "bg-blue-500",
  PROCESSING: "bg-yellow-500",
  READY_FOR_DISPATCH: "bg-green-500",
};

export default function ProductionPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Search + filters
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("ALL");
  const [productFilter, setProductFilter] = useState("ALL");

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
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = originalName; a.click();
        URL.revokeObjectURL(a.href);
      }).catch(() => alert("Download failed"));
  }

  // All unique product names for filter dropdown
  const allProducts = useMemo(() => {
    const set = new Set<string>();
    orders.forEach(o => o.items.forEach(i => set.add(i.productName)));
    return Array.from(set).sort();
  }, [orders]);

  // Filtered orders
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o => {
      const matchSearch = !q ||
        o.orderNo.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.salesAgentName ?? "").toLowerCase().includes(q) ||
        o.items.some(i => i.productName.toLowerCase().includes(q));

      const matchStage = stageFilter === "ALL" ||
        o.items.some(i => i.itemProductionStage === stageFilter);

      const matchProduct = productFilter === "ALL" ||
        o.items.some(i => i.productName === productFilter);

      return matchSearch && matchStage && matchProduct;
    });
  }, [orders, search, stageFilter, productFilter]);

  // Stage counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: 0, NOT_PRINTED: 0, PRINTING: 0, PROCESSING: 0, READY_FOR_DISPATCH: 0 };
    orders.forEach(o => o.items.forEach(i => {
      counts[i.itemProductionStage] = (counts[i.itemProductionStage] ?? 0) + 1;
      counts.ALL++;
    }));
    return counts;
  }, [orders]);

  return (
    <DashboardShell>
      <div className="p-3 lg:p-4">
        <div className="space-y-3">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-slate-900">Production</h1>
              <p className="text-xs text-slate-500">Track item stages · {filtered.length} order{filtered.length !== 1 ? "s" : ""} shown</p>
            </div>
          </div>

          {/* Stage filter pills */}
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: "ALL", label: "All" },
              { value: "NOT_PRINTED", label: "Not Printed" },
              { value: "PRINTING", label: "Printing" },
              { value: "PROCESSING", label: "Processing" },
              { value: "READY_FOR_DISPATCH", label: "Ready" },
            ].map(s => (
              <button key={s.value} onClick={() => setStageFilter(s.value)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold border transition ${stageFilter === s.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"}`}>
                {s.value !== "ALL" && <span className={`w-1.5 h-1.5 rounded-full ${stageDot[s.value]}`} />}
                {s.label}
                <span className={`rounded-full px-1 text-xs ${stageFilter === s.value ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {stageCounts[s.value] ?? 0}
                </span>
              </button>
            ))}
          </div>

          {/* Search + Product filter */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search order, customer, agent…"
                className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
            </div>
            <select value={productFilter} onChange={e => setProductFilter(e.target.value)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400 bg-white">
              <option value="ALL">All Products</option>
              {allProducts.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {(search || stageFilter !== "ALL" || productFilter !== "ALL") && (
              <button onClick={() => { setSearch(""); setStageFilter("ALL"); setProductFilter("ALL"); }}
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 flex items-center gap-1">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
              No orders in production matching your filters.
            </div>
          ) : (
            /* ── Compact table ── */
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-semibold text-slate-600 whitespace-nowrap">Order</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Agent</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Size</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">GSM</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Sides</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Stage</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Files</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const allReady = o.items.every(i => i.itemProductionStage === "READY_FOR_DISPATCH");
                    const expanded = expandedOrderId === o.id;

                    return o.items.map((item, idx) => {
                      const { size, gsm, sides } = parseNotes(item.productionNotes);
                      const sidesLabel = sides === "SINGLE_SIDE" ? "Single" : sides === "DOUBLE_SIDE" ? "Double" : sides ?? "—";
                      const isUpdating = updatingItemId === item.id;
                      const isUploading = uploadingItemId === item.id;
                      const designFiles = item.designFiles ?? [];
                      const isFirstItem = idx === 0;

                      // Apply stage filter to individual items
                      if (stageFilter !== "ALL" && item.itemProductionStage !== stageFilter) return null;
                      if (productFilter !== "ALL" && item.productName !== productFilter) return null;

                      return (
                        <tr key={item.id}
                          className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors ${allReady ? "bg-green-50/30" : ""}`}>

                          {/* Order info — only on first item row */}
                          <td className="px-3 py-1.5 whitespace-nowrap">
                            {isFirstItem && (
                              <div>
                                <p className="font-bold text-slate-900 text-xs">{o.orderNo}</p>
                                <p className="text-slate-400 text-xs">{new Date(o.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</p>
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-1.5">
                            {isFirstItem && (
                              <div>
                                <p className="font-medium text-slate-800 whitespace-nowrap">{o.customerName}</p>
                                {o.customerPhone && <p className="text-slate-400">{o.customerPhone}</p>}
                              </div>
                            )}
                          </td>

                          <td className="px-3 py-1.5">
                            {isFirstItem && o.salesAgentName && (
                              <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium whitespace-nowrap">
                                {o.salesAgentName}
                              </span>
                            )}
                          </td>

                          <td className="px-3 py-1.5">
                            <div>
                              <p className="font-medium text-slate-900 whitespace-nowrap">{item.productName}</p>
                              {item.artworkNotes && (
                                <p className="text-slate-400 truncate max-w-[120px]" title={item.artworkNotes}>{item.artworkNotes}</p>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{size ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{gsm ?? "—"}</td>
                          <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{sidesLabel}</td>
                          <td className="px-3 py-1.5 font-semibold text-slate-800">{item.quantity}</td>

                          {/* Stage selector */}
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              {isUpdating && <Loader2 className="h-3 w-3 animate-spin text-blue-600 shrink-0" />}
                              <select value={item.itemProductionStage} disabled={isUpdating}
                                onChange={e => updateItemStage(item.id, e.target.value as ProductionStage)}
                                className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none disabled:opacity-60 cursor-pointer border-transparent ${stageColors[item.itemProductionStage]}`}>
                                {PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </div>
                          </td>

                          {/* Files count */}
                          <td className="px-3 py-1.5">
                            <button
                              onClick={() => setExpandedOrderId(expanded && expandedOrderId === `${o.id}-${item.id}` ? null : `${o.id}-${item.id}`)}
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium border transition ${designFiles.length > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                              <Paperclip className="h-3 w-3" />
                              {designFiles.length}
                            </button>
                          </td>

                          {/* Upload action */}
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
                      );
                    });
                  })}
                </tbody>
              </table>

              {/* Expanded file detail — shown below table as overlay rows */}
              {filtered.map(o => o.items.map(item => {
                const isExpanded = expandedOrderId === `${o.id}-${item.id}`;
                if (!isExpanded || !item.designFiles?.length) return null;
                return (
                  <div key={`files-${item.id}`} className="border-t border-blue-100 bg-blue-50 px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-blue-800">Files for {item.productName} ({o.orderNo})</p>
                      <button onClick={() => setExpandedOrderId(null)} className="text-blue-400 hover:text-blue-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.designFiles!.map(f => (
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
                  </div>
                );
              }))}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}