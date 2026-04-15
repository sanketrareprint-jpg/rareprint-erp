"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Upload, X, FileText, Image, Download, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";

const PRODUCTION_STAGES = [
  { value: "NOT_PRINTED", label: "Not Printed" },
  { value: "PRINTING", label: "Printing" },
  { value: "PROCESSING", label: "Processing" },
  { value: "READY_FOR_DISPATCH", label: "Ready for Dispatch" },
] as const;

type ProductionStage = (typeof PRODUCTION_STAGES)[number]["value"];

type DesignFile = {
  filename: string;
  originalName: string;
  uploadedAt: string;
  size: number;
};

type OrderItem = {
  id: string;
  productName: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  productionNotes?: string;
  artworkNotes?: string;
  itemProductionStage: ProductionStage;
  designFiles?: DesignFile[];
};

type ProductionOrder = {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  productionStage: ProductionStage;
  orderDate: string;
  notes?: string;
  items: OrderItem[];
};

function parseProductionNotes(notes?: string) {
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
  if (["jpg", "jpeg", "png", "gif", "webp", "svg", "tiff", "tif"].includes(ext ?? "")) {
    return <Image className="h-4 w-4 text-blue-500" />;
  }
  return <FileText className="h-4 w-4 text-orange-500" />;
}

const stageColors: Record<string, string> = {
  NOT_PRINTED: "bg-gray-100 text-gray-700",
  PRINTING: "bg-blue-100 text-blue-700",
  PROCESSING: "bg-yellow-100 text-yellow-700",
  READY_FOR_DISPATCH: "bg-green-100 text-green-700",
};

export default function ProductionPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
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
        method: "POST",
        headers: getAuthHeaders(),
        body: formData,
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(b.message || "Upload failed");
        return;
      }
      await load();
    } finally {
      setUploadingItemId(null);
      // Reset file input
      if (fileInputRefs.current[itemId]) {
        fileInputRefs.current[itemId]!.value = "";
      }
    }
  }

  async function deleteFile(itemId: string, filename: string) {
    if (!confirm("Delete this design file?")) return;
    setDeletingFile(filename);
    try {
      const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) { alert("Delete failed"); return; }
      await load();
    } finally { setDeletingFile(null); }
  }

  function downloadFile(itemId: string, filename: string, originalName: string) {
    const url = `${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`;
    const headers = getAuthHeaders();
    fetch(url, { headers })
      .then(res => res.blob())
      .then(blob => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = originalName;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch(() => alert("Download failed"));
  }

  return (
    <DashboardShell>
      <div className="p-4 lg:p-5">
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Production</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Track each item's production status and attach design files.
            </p>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          )}

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
              No orders in production. Approve orders from Accounts first.
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((o) => {
                const allReady = o.items.every(i => i.itemProductionStage === "READY_FOR_DISPATCH");
                const anyInProgress = o.items.some(i =>
                  i.itemProductionStage === "PRINTING" || i.itemProductionStage === "PROCESSING"
                );
                const orderBadgeLabel = allReady ? "All Ready" : anyInProgress ? "In Progress" : "Not Started";
                const orderBadgeColor = allReady
                  ? stageColors.READY_FOR_DISPATCH
                  : anyInProgress ? stageColors.PRINTING : stageColors.NOT_PRINTED;

                return (
                  <div key={o.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

                    {/* Order Header */}
                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-wrap">
                          <div>
                            <p className="text-xs text-slate-400">Order No</p>
                            <p className="text-sm font-bold text-slate-900">{o.orderNo}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Customer</p>
                            <p className="text-sm font-semibold text-slate-800">{o.customerName}</p>
                            {o.customerPhone && <p className="text-xs text-slate-400">{o.customerPhone}</p>}
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Date</p>
                            <p className="text-sm text-slate-700">
                              {new Date(o.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Items</p>
                            <p className="text-sm text-slate-700">{o.items.length}</p>
                          </div>
                        </div>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${orderBadgeColor}`}>
                          {orderBadgeLabel}
                        </span>
                      </div>
                      {o.notes && (
                        <div className="mt-2 rounded-lg bg-amber-50 border border-amber-100 px-3 py-1.5">
                          <p className="text-xs text-amber-700">
                            <span className="font-semibold">Notes:</span> {o.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Items */}
                    <div className="px-4 py-3">
                      <div className="space-y-3">
                        {(o.items ?? []).map((item, idx) => {
                          const { size, gsm, sides } = parseProductionNotes(item.productionNotes);
                          const itemCode = `${o.orderNo}-${idx + 1}`;
                          const isUpdating = updatingItemId === item.id;
                          const isUploading = uploadingItemId === item.id;
                          const designFiles = item.designFiles ?? [];

                          return (
                            <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">

                              {/* Item Header */}
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-bold">
                                    {itemCode}
                                  </span>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">{item.productName}</p>
                                    <p className="text-xs text-slate-400">{item.sku}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {isUpdating && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />}
                                  <select
                                    value={item.itemProductionStage}
                                    disabled={isUpdating}
                                    onChange={(e) => updateItemStage(item.id, e.target.value as ProductionStage)}
                                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold outline-none disabled:opacity-60 cursor-pointer ${stageColors[item.itemProductionStage]} border-transparent`}
                                  >
                                    {PRODUCTION_STAGES.map((s) => (
                                      <option key={s.value} value={s.value}>{s.label}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>

                              {/* Specs */}
                              <div className="grid grid-cols-6 gap-1.5 text-xs mb-2">
                                {[
                                  { label: "Size", value: size ?? "—" },
                                  { label: "GSM", value: gsm ?? "—" },
                                  { label: "Sides", value: sides === "SINGLE_SIDE" ? "Single" : sides === "DOUBLE_SIDE" ? "Double" : sides ?? "—" },
                                  { label: "Qty", value: item.quantity },
                                  { label: "Rate", value: fmt(item.unitPrice) },
                                  { label: "Total", value: fmt(item.lineTotal) },
                                ].map(({ label, value }) => (
                                  <div key={label} className="bg-white rounded-lg border border-slate-200 px-2 py-1.5">
                                    <p className="text-slate-400 text-xs mb-0.5">{label}</p>
                                    <p className="font-semibold text-slate-800 text-xs">{value}</p>
                                  </div>
                                ))}
                              </div>

                              {item.artworkNotes && (
                                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-1.5 mb-2">
                                  <p className="text-xs text-blue-700">
                                    <span className="font-semibold">Instructions:</span> {item.artworkNotes}
                                  </p>
                                </div>
                              )}

                              {/* ── Design Files Section ── */}
                              <div className="mt-2 rounded-lg border border-dashed border-slate-300 bg-white p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-1.5">
                                    <Paperclip className="h-3.5 w-3.5 text-slate-500" />
                                    <span className="text-xs font-semibold text-slate-600">
                                      Design Files
                                      {designFiles.length > 0 && (
                                        <span className="ml-1.5 rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 text-xs font-bold">
                                          {designFiles.length}
                                        </span>
                                      )}
                                    </span>
                                  </div>

                                  {/* Upload Button */}
                                  <div>
                                    <input
                                      type="file"
                                      ref={el => { fileInputRefs.current[item.id] = el; }}
                                      className="hidden"
                                      accept=".jpg,.jpeg,.png,.gif,.pdf,.ai,.psd,.cdr,.zip,.svg,.tiff,.tif,.eps,.webp"
                                      onChange={e => {
                                        const file = e.target.files?.[0];
                                        if (file) uploadFile(item.id, file);
                                      }}
                                    />
                                    <button
                                      onClick={() => fileInputRefs.current[item.id]?.click()}
                                      disabled={isUploading}
                                      className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                                    >
                                      {isUploading
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <Upload className="h-3 w-3" />}
                                      {isUploading ? "Uploading..." : "Upload File"}
                                    </button>
                                  </div>
                                </div>

                                {/* File List */}
                                {designFiles.length === 0 ? (
                                  <p className="text-xs text-slate-400 text-center py-2">
                                    No design files attached yet. Upload PDF, AI, PSD, CDR, images etc.
                                  </p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {designFiles.map((f) => (
                                      <div key={f.filename} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                          {getFileIcon(f.originalName)}
                                          <div className="min-w-0">
                                            <p className="text-xs font-medium text-slate-800 truncate max-w-[200px]">
                                              {f.originalName}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                              {formatBytes(f.size)} · {new Date(f.uploadedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                                            </p>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => downloadFile(item.id, f.filename, f.originalName)}
                                            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"
                                            title="Download"
                                          >
                                            <Download className="h-3 w-3" />
                                          </button>
                                          <button
                                            onClick={() => deleteFile(item.id, f.filename)}
                                            disabled={deletingFile === f.filename}
                                            className="rounded-md border border-red-100 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-60"
                                            title="Delete"
                                          >
                                            {deletingFile === f.filename
                                              ? <Loader2 className="h-3 w-3 animate-spin" />
                                              : <X className="h-3 w-3" />}
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}