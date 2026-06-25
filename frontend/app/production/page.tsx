"use client";
import React, { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Upload, X, FileText, Image, Download, Paperclip, Search, Plus, Trash2, ChevronDown, ChevronUp, Clock } from "lucide-react";
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
const SHEET_STATUSES = ["INCOMPLETE","COMPLETE","SETTING","PRINTING","PROCESSING"];
const SHEET_NEXT_STATUS: Record<string, string | null> = {
  INCOMPLETE: "COMPLETE",
  COMPLETE: "SETTING",
  SETTING: "PRINTING",
  PRINTING: "PROCESSING",
  PROCESSING: null,
};
const SHEET_STAGES = ["PAPER_PURCHASE","PLATE_MAKING","PRINTING","BINDING","LAMINATION","EXTRA_PROCESSING"];
const JW_STATUSES = ["PENDING","IN_PROGRESS","COMPLETED"];

type DesignFile = { filename: string; originalName: string; uploadedAt: string; size: number; };
type OrderItem = {
  id: string; productName: string; sku: string; quantity: number;
  unitPrice: number; lineTotal: number; productionNotes?: string;
  artworkNotes?: string; itemProductionStage: ProductionStage;
  processingFollowUpDate?: string | null;
  productionCategory: ProductionCategory | null;
  // Resolved by backend: prefers productionNotes, falls back to product table
  size?: string | null;
  gsm?: string | null;
  sides?: string | null;
  designFiles?: DesignFile[];
};
type ProductionOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; salesAgentName?: string;
  status: string; productionStage: string;
  orderDate: string; notes?: string; items: OrderItem[];
};
type Vendor = { id: string; name: string; phone?: string; email?: string | null; };
type JobWork = { id: string; vendorId: string; vendorName: string; description: string; cost: number; vendorInvoiceNo?: string; status: string; dueDate?: string | null; completedAt?: string; };
type ClubbingItem = { id: string; productName: string; quantity: number; productionNotes?: string; artworkNotes?: string; itemProductionStage: string; size?: string | null; gsm?: string | null; sides?: string | null; jobWorks: JobWork[]; designFiles?: DesignFile[]; };
type ClubbingOrder = { id: string; orderNo: string; customerName: string; customerPhone?: string; salesAgentName?: string; orderDate: string; items: ClubbingItem[]; };
type SheetItem = { id: string; multiple: number; quantityOnSheet: number; areaSqInches: number; dueDate?: string | null; itemProductionStage?: string; orderItem: { id: string; itemProductionStage?: string; product: { name: string; sizeInches: string; gsm: number; }; order: { orderNumber: string; orderDate?: string; customer: { businessName: string; }; salesAgent?: { fullName: string | null } | null } } };
type StageVendor = { id: string; stage: string; vendorId: string; cost: number; description?: string; vendorInvoiceNo?: string; vendor: { name: string }; };
type PrintSheet = { id: string; sheetNo: string; gsm: number; quality: string; quantity: number; actualPrintedQuantity?: number | null; sizeInches: string; areaSqInches: number; printing: string; status: string; usedAreaSqInches: number; createdBySource?: string; createdAt?: string; created_at?: string; createdOn?: string; createdDate?: string; items: SheetItem[]; stageVendors: StageVendor[]; };
type PlaceableItem = { id: string; productName: string; sku: string; gsm: number; openSizeInches: string; quantity: number; orderNo: string; customerName: string; };

function parseNotes(notes?: string) {
  if (!notes) return {};
  return {
    // Stop at commas/newlines so "GSM: 70, Sides: DOUBLE_SIDE" doesn't
    // produce "70," with a trailing comma.
    size: notes.match(/Size[\s:]+([^\n,]+)/i)?.[1]?.trim(),
    gsm: notes.match(/GSM[\s:]+([^,\n\s]+)/i)?.[1]?.trim(),
    sides: notes.match(/Sides[\s:]+([^,\n\s]+)/i)?.[1]?.trim(),
  };
}

// Get product details, preferring backend-resolved fields, then falling back
// to parsing productionNotes. The backend already does this resolution but
// older API responses or stale caches may not include them — keep the
// fallback so the UI never shows "—" when data is actually available.
function getItemDetails(item: { size?: string | null; gsm?: string | null; sides?: string | null; productionNotes?: string }) {
  const parsed = parseNotes(item.productionNotes);
  const sidesRaw = item.sides ?? parsed.sides ?? null;
  return {
    size: item.size ?? parsed.size ?? null,
    gsm: item.gsm ?? parsed.gsm ?? null,
    sides: sidesRaw === "SINGLE_SIDE" ? "Single" : sidesRaw === "DOUBLE_SIDE" ? "Double" : sidesRaw,
  };
}
function fmt(n: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n); }
async function readApiError(res: Response, fallback: string) {
  const body = await res.json().catch(() => null);
  const message = Array.isArray(body?.message) ? body.message.join("\n") : body?.message;
  return message || fallback;
}
function formatBytes(b: number) { if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b/1024).toFixed(1)} KB`; return `${(b/1048576).toFixed(1)} MB`; }
function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","tiff","tif"].includes(ext ?? "")) return <Image className="h-3.5 w-3.5 text-blue-500" />;
  return <FileText className="h-3.5 w-3.5 text-orange-500" />;
}
const stageColors: Record<string, string> = { NOT_PRINTED:"bg-gray-100 text-gray-700", PRINTING:"bg-blue-100 text-blue-700", PROCESSING:"bg-yellow-100 text-yellow-700", READY_FOR_DISPATCH:"bg-green-100 text-green-700" };
const categoryColors: Record<string, string> = { INHOUSE:"bg-violet-100 text-violet-700", CLUBBING:"bg-orange-100 text-orange-700", SHEET_PRODUCTION:"bg-cyan-100 text-cyan-700" };
const categoryLabels: Record<string, string> = { INHOUSE:"Inhouse", CLUBBING:"Clubbing", SHEET_PRODUCTION:"Sheet" };
const sheetStatusColors: Record<string, string> = { INCOMPLETE:"bg-gray-100 text-gray-600", SETTING:"bg-yellow-100 text-yellow-700", PRINTING:"bg-blue-100 text-blue-700", PROCESSING:"bg-orange-100 text-orange-700", COMPLETE:"bg-green-100 text-green-700", DONE:"bg-emerald-100 text-emerald-800" };
const jwStatusColors: Record<string, string> = { PENDING:"bg-gray-100 text-gray-600", IN_PROGRESS:"bg-blue-100 text-blue-700", COMPLETED:"bg-green-100 text-green-700" };
function sheetPrintingLabel(value?: string | null) {
  return value === "DOUBLE_SIDE" ? "Double Side" : "Single Side";
}
function sheetPrintingClass(value?: string | null) {
  return value === "DOUBLE_SIDE" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700";
}
function formatSheetCreatedAt(value?: string | number | Date | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
function getSheetCreatedLabel(sheet: PrintSheet) {
  return formatSheetCreatedAt(sheet.createdAt ?? sheet.created_at ?? sheet.createdOn ?? sheet.createdDate ?? null);
}
function displaySheetNo(value?: string | null) {
  return (value ?? "").replace(/^sheet\s*no\s*:\s*/i, "").trim();
}
function dateInputValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function getAllowedSheetStatuses(currentStatus: string) {
  const nextStatus = SHEET_NEXT_STATUS[currentStatus];
  return nextStatus ? [currentStatus, nextStatus] : [currentStatus];
}

function orderAge(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d';
  return days + 'd';
}
function ageColor(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 3) return 'bg-green-50 text-green-700';
  if (days <= 7) return 'bg-yellow-50 text-yellow-700';
  return 'bg-red-50 text-red-700';
}

export default function ProductionPage() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string>("");
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("rareprint_user") || "{}");
      setUserRole(u.role || "");
    } catch {}
  }, []);
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

  // Lock INHOUSE role to inhouse tab only
  useEffect(() => {
    if (userRole === "INHOUSE") setActiveTab("inhouse");
  }, [userRole]);

  // Assign modal
  const [assignModal, setAssignModal] = useState<{ orderId: string; orderNo: string; customerName: string; items: OrderItem[] } | null>(null);
  const [categorySelections, setCategorySelections] = useState<Record<string, ProductionCategory>>({});

  // Clubbing state
  const [expandedClubbingOrder, setExpandedClubbingOrder] = useState<string | null>(null);
  const [expandedClubbingItem, setExpandedClubbingItem] = useState<string | null>(null);
  const [jwForm, setJwForm] = useState<Record<string, { vendorId: string; description: string; cost: string; vendorInvoiceNo: string }>>({});
  const [savingJw, setSavingJw] = useState(false);
  // Clubbing sub-tabs
  const [clubSubTab, setClubSubTab] = useState<"unassigned"|"in_progress"|"received">("unassigned");
  // Send dialog (assign vendor)
  const [sendDialog, setSendDialog] = useState<{ itemId: string; productName: string; orderNo: string; size?: string | null; gsm?: string | null; sides?: string | null; quantity?: number; customerName?: string; orderDate?: string } | null>(null);
  const [sendVendorId, setSendVendorId] = useState("");
  const [sendDesc, setSendDesc] = useState("");
  const [sendDueDate, setSendDueDate] = useState("");
  const [sendingSend, setSendingSend] = useState(false);
  // Received dialog (fill cost + inv no)
  const [receiveDialog, setReceiveDialog] = useState<{ jwId: string; vendorName: string; productName: string } | null>(null);
  const [receiveCost, setReceiveCost] = useState("");
  const [receiveInvNo, setReceiveInvNo] = useState("");
  const [savingReceive, setSavingReceive] = useState(false);

  // Vendor modal
  const [vendorModal, setVendorModal] = useState(false);
  const [newVendor, setNewVendor] = useState({ name: "", phone: "", email: "", gstNumber: "" });
  const [savingVendor, setSavingVendor] = useState(false);

  // Sheet state
  const [createSheetModal, setCreateSheetModal] = useState(false);
  const [sheetForm, setSheetForm] = useState({ gsm: "", quality: "MAPLITHO", quantity: "", actualPrintedQuantity: "", sizeInches: "", printing: "SINGLE_SIDE" });
  const [editSheetModal, setEditSheetModal] = useState<PrintSheet | null>(null);
  const [editSheetForm, setEditSheetForm] = useState({ sheetNo: "", gsm: "", quality: "MAPLITHO", quantity: "", actualPrintedQuantity: "", sizeInches: "", printing: "SINGLE_SIDE" });
  const [savingSheet, setSavingSheet] = useState(false);
  const [autoOrganizing, setAutoOrganizing] = useState(false);
  const [savingEditSheet, setSavingEditSheet] = useState(false);
  const [expandedSheet, setExpandedSheet] = useState<string | null>(null);
  const [placeableItems, setPlaceableItems] = useState<PlaceableItem[]>([]);
  const [loadingPlaceable, setLoadingPlaceable] = useState(false);
  const [placingItem, setPlacingItem] = useState<string | null>(null);
  const [stageVendorForm, setStageVendorForm] = useState<Record<string, { stage: string; vendorId: string; cost: string; description: string; vendorInvoiceNo: string }>>({});
  const [savingStageVendor, setSavingStageVendor] = useState(false);

  // Multiple dialog state for sheet placement
  const [multipleDialog, setMultipleDialog] = useState<{ sheetId: string; sheetNo: string; sheetQty: number; item: PlaceableItem; maxMultiple: number; suggestedMultiple: number } | null>(null);
  const [multipleValue, setMultipleValue] = useState("1");
  const [sheetSubTab, setSheetSubTab] = useState("unassigned");
  const [sheetSearch, setSheetSearch] = useState("");
  const [sheetFilters, setSheetFilters] = useState({ product: "", size: "", gsm: "", sides: "" });
  const [sheetHistory, setSheetHistory] = useState<{ logs: any[]; total: number; page: number }>({ logs: [], total: 0, page: 1 });
  const [sheetHistoryLoading, setSheetHistoryLoading] = useState(false);
  const [sheetHistorySearch, setSheetHistorySearch] = useState("");
  const [processingSubTab, setProcessingSubTab] = useState<"printing"|"processing">("printing");
  const [settingDialog, setSettingDialog] = useState<{ sheetId: string; sheetNo: string } | null>(null);
  const [settingForm, setSettingForm] = useState({
    plateVendorId: "", plateDesc: "", plateRate: "", plateQty: "", plateAmount: "",
    printVendorId: "", printDesc: "", printRate: "", printQty: "", printAmount: "",
  });
  const [savingSetting, setSavingSetting] = useState(false);
  const [processingVendorFilter, setProcessingVendorFilter] = useState("");
  const [processingItemVendors, setProcessingItemVendors] = useState<Record<string, string>>({});

  const [ordersData, setOrdersData] = useState<ProductionOrder[]>([]);
  const [clubData, setClubData] = useState<ClubbingOrder[]>([]);
  const [sheetsData, setSheetsData] = useState<PrintSheet[]>([]);
  const [vendorsData, setVendorsData] = useState<Vendor[]>([]);

  const loadSheets = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/production/sheets`, { headers: getAuthHeaders() });
    if (res.ok) setSheetsData(await res.json());
  }, []);

  const loadSheetHistory = useCallback(async (search = "", page = 1) => {
    setSheetHistoryLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50", toStatus: "PRINTING" });
      if (search) params.set("search", search);
      const res = await fetch(`${API_BASE_URL}/production/sheets/history?${params}`, { headers: getAuthHeaders() });
      if (res.ok) setSheetHistory(await res.json());
    } finally {
      setSheetHistoryLoading(false);
    }
  }, []);

  const loadAll = useCallback(async (silent = false) => {
    setError(null);
    if (!silent) setLoading(true);
    try {
      const h = getAuthHeaders();
      const oRes = await fetch(`${API_BASE_URL}/production/orders`, { headers: h });
      if (oRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      setOrdersData(oRes.ok ? await oRes.json() : []);
      if (!silent) setLoading(false);

      const [cRes, sRes, vRes] = await Promise.all([
        fetch(`${API_BASE_URL}/production/clubbing/orders`, { headers: h }),
        fetch(`${API_BASE_URL}/production/sheets`, { headers: h }),
        fetch(`${API_BASE_URL}/vendors`, { headers: h }),
      ]);
      if (cRes.ok) setClubData(await cRes.json());
      if (sRes.ok) setSheetsData(await sRes.json());
      if (vRes.ok) setVendorsData(await vRes.json());
    } catch { setError("Network error."); }
    finally { if (!silent) setLoading(false); }
  }, [router]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  useEffect(() => {
    if (sheetSubTab === "history") void loadSheetHistory(sheetHistorySearch);
  }, [sheetSubTab, loadSheetHistory]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const order = params.get("order");
    const targetTab = params.get("tab");
    const targetSubTab = params.get("subtab");
    if (targetTab === "unassigned" || targetTab === "inhouse" || targetTab === "clubbing" || targetTab === "sheets" || targetTab === "all") {
      setActiveTab(targetTab);
    }
    if (targetSubTab) setSheetSubTab(targetSubTab);
    if (order) setSearch(order);
  }, []);

  // Sync active tabs to URL so refresh restores position
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", activeTab);
    if (activeTab === "sheets" && sheetSubTab) {
      params.set("subtab", sheetSubTab);
    } else {
      params.delete("subtab");
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, "", newUrl);
  }, [activeTab, sheetSubTab]);

  // Load saved processing vendors from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("procVendors");
      if (saved) setProcessingItemVendors(JSON.parse(saved));
    } catch {}
  }, []);

  async function updateItemStage(itemId: string, stage: ProductionStage) {
    setUpdatingItemId(itemId);
    try {
      const res = await fetch(`${API_BASE_URL}/production/items/${itemId}/stage`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { const b = await res.json(); alert(b.message || "Update failed"); }
      await loadAll(true);
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
    await loadAll(true);
  }

  async function uploadFile(itemId: string, file: File) {
    setUploadingItemId(itemId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files`, { method: "POST", headers: (() => { const h = getAuthHeaders(); delete (h as any)["Content-Type"]; return h; })(), body: formData });
      if (!res.ok) { alert("Upload failed"); return; }
      await loadAll(true);
    } finally { setUploadingItemId(null); if (fileInputRefs.current[itemId]) fileInputRefs.current[itemId]!.value = ""; }
  }

  async function deleteFile(itemId: string, filename: string) {
    if (!confirm("Delete this file?")) return;
    setDeletingFile(filename);
    try {
      await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`, { method: "DELETE", headers: getAuthHeaders() });
      await loadAll(true);
    } finally { setDeletingFile(null); }
  }

  async function downloadFile(itemId: string, filename: string, originalName: string) {
    const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/design-files/${filename}`, { headers: getAuthHeaders() });
    if (!res.ok) {
      alert("File download failed. Please upload the attachment again.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = originalName;
    a.click();
    URL.revokeObjectURL(url);
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
      await loadAll(true);
    } finally { setSavingJw(false); }
  }

  async function sendToVendor() {
    if (!sendDialog || !sendVendorId) { alert("Please select a vendor"); return; }
    setSendingSend(true);

    // ── Build URLs BEFORE any await so browser allows window.open ────────────
    const selectedVendor = vendorsData.find(v => v.id === sendVendorId);
    const vendorName = selectedVendor?.name ?? "Vendor";
    const vendorEmail = selectedVendor?.email ?? "";
    const { size, gsm, sides, quantity, productName, orderNo, customerName, orderDate } = sendDialog;
    const sidesLabel = sides === "SINGLE_SIDE" ? "Single Side" : sides === "DOUBLE_SIDE" ? "Double Side" : (sides ?? "—");
    const dueDateStr = sendDueDate ? new Date(sendDueDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "Not specified";
    const subject = `Job Work Order — Order #${orderNo} | ${productName}`;
    const emailBody = [
      `Dear ${vendorName},`,
      ``,
      `Please find below the job work details for Order #${orderNo}:`,
      ``,
      `Customer       : ${customerName ?? "—"}`,
      `Order Date     : ${orderDate ? new Date(orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}`,
      ``,
      `────────────────────────────────`,
      `Product        : ${productName}`,
      `Size           : ${size ?? "—"}`,
      `GSM            : ${gsm ?? "—"}`,
      `Sides          : ${sidesLabel}`,
      `Quantity       : ${quantity ?? "—"}`,
      `────────────────────────────────`,
      ``,
      `Description    : ${sendDesc || "Job Work"}`,
      `Schedule Date  : ${dueDateStr}`,
      ``,
      `Kindly confirm receipt and expected delivery date.`,
      ``,
      `Regards,`,
      `Rareprint Team`,
      `purchase.rareprint@gmail.com`,
    ].join("\n");

    const rawPhone = (selectedVendor?.phone ?? "").replace(/\D/g, "");
    const waPhone = rawPhone.length === 10 ? `91${rawPhone}` : rawPhone;
    const waText = [
      `*Job Work Order — #${orderNo}*`,
      ``,
      `Dear ${vendorName},`,
      `Please find below the job work details:`,
      ``,
      `*Customer:* ${customerName ?? "—"}`,
      `*Product:* ${productName}`,
      `*Size:* ${size ?? "—"}`,
      `*GSM:* ${gsm ?? "—"}`,
      `*Sides:* ${sidesLabel}`,
      `*Qty:* ${quantity ?? "—"}`,
      `*Description:* ${sendDesc || "Job Work"}`,
      `*Schedule Date:* ${dueDateStr}`,
      ``,
      `Kindly confirm receipt. Thank you!`,
      `— Rareprint`,
    ].join("\n");

    // Open WhatsApp NOW (synchronous, within user gesture — browser won't block)
    if (waPhone.length >= 10) {
      window.open(`https://wa.me/${waPhone}?text=${encodeURIComponent(waText)}`, "_blank");
    }

    try {
      const res = await fetch(`${API_BASE_URL}/production/clubbing/jobworks`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: sendDialog.itemId, vendorId: sendVendorId, description: sendDesc || "Job Work", cost: 0, dueDate: sendDueDate || null }),
      });
      if (!res.ok) { alert("Failed to send to vendor"); return; }
      // Set item stage to PRINTING
      await fetch(`${API_BASE_URL}/production/items/${sendDialog.itemId}/stage`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ stage: "PRINTING" }),
      });

      // Create Gmail draft via backend API (no popup needed)
      if (vendorEmail) {
        try {
          await fetch(`${API_BASE_URL}/production/send-vendor-draft`, {
            method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ to: vendorEmail, subject, body: emailBody }),
          });
        } catch {
          console.warn("Gmail draft creation failed — continuing");
        }
      }

      setSendDialog(null); setSendVendorId(""); setSendDesc(""); setSendDueDate("");
      await loadAll(true);
    } finally { setSendingSend(false); }
  }

  async function updateInhouseFollowUpDate(itemId: string, processingFollowUpDate: string) {
    const res = await fetch(`${API_BASE_URL}/production/items/${itemId}/follow-up-date`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ processingFollowUpDate: processingFollowUpDate || null }),
      keepalive: true,
    });
    if (!res.ok) { alert(await readApiError(res, "Could not save follow-up date")); return; }
    await loadAll(true);
  }

  async function updateJobWorkDueDate(jwId: string, dueDate: string) {
    const res = await fetch(`${API_BASE_URL}/production/clubbing/jobworks/${jwId}`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: dueDate || null }),
      keepalive: true,
    });
    if (!res.ok) { alert(await readApiError(res, "Could not save follow-up date")); return; }
    await loadAll(true);
  }

  async function updateSheetItemDueDate(sheetItemId: string, dueDate: string) {
    const res = await fetch(`${API_BASE_URL}/production/sheets/sheet-items/${sheetItemId}/due-date`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ dueDate: dueDate || null }),
      keepalive: true,
    });
    if (!res.ok) { alert(await readApiError(res, "Could not save follow-up date")); return; }
    await loadAll(true);
  }

  async function receiveFromVendor() {
    if (!receiveDialog) return;
    if (!receiveCost || !receiveInvNo) { alert("Cost and Invoice No are required to receive"); return; }
    setSavingReceive(true);
    try {
      // Update job work with cost + invoice + status COMPLETED
      await fetch(`${API_BASE_URL}/production/clubbing/jobworks/${receiveDialog.jwId}`, {
        method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED", cost: Number(receiveCost), vendorInvoiceNo: receiveInvNo }),
      });
      // Find the item and set stage to PROCESSING
      const allItems = clubData.flatMap(o => o.items);
      const item = allItems.find(i => i.jobWorks.some(j => j.id === receiveDialog.jwId));
      if (item) {
        await fetch(`${API_BASE_URL}/production/items/${item.id}/stage`, {
          method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ stage: "PROCESSING" }),
        });
      }
      setReceiveDialog(null); setReceiveCost(""); setReceiveInvNo("");
      await loadAll(true);
    } finally { setSavingReceive(false); }
  }

  async function updateJwStatus(jwId: string, status: string) {
    await fetch(`${API_BASE_URL}/production/clubbing/jobworks/${jwId}`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadAll(true);
  }

  async function deleteJobWork(jwId: string) {
    if (!confirm("Remove this job work?")) return;
    await fetch(`${API_BASE_URL}/production/clubbing/jobworks/${jwId}`, { method: "DELETE", headers: getAuthHeaders() });
    await loadAll(true);
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
      await loadAll(true);
    } finally { setSavingVendor(false); }
  }

  // ── Sheet ─────────────────────────────────────────────────────────────────
  async function createSheet() {
    if (!sheetForm.gsm || !sheetForm.quantity || !sheetForm.sizeInches) { alert("Fill GSM, quantity and size"); return; }
    setSavingSheet(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          gsm: Number(sheetForm.gsm),
          quality: sheetForm.quality,
          quantity: Number(sheetForm.quantity),
          actualPrintedQuantity: sheetForm.actualPrintedQuantity ? Number(sheetForm.actualPrintedQuantity) : null,
          sizeInches: sheetForm.sizeInches,
          printing: sheetForm.printing,
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      setCreateSheetModal(false); setSheetForm({ gsm: "", quality: "MAPLITHO", quantity: "", actualPrintedQuantity: "", sizeInches: "", printing: "SINGLE_SIDE" });
      const created = await res.json().catch(() => null);
      if (created?.id) setSheetsData(prev => [{ ...created, items: [], stageVendors: [] }, ...prev]);
      else await loadSheets();
    } finally { setSavingSheet(false); }
  }

  async function autoOrganizeSheets() {
    if (!confirm("Auto create ERP sheets and assign compatible unassigned items now?")) return;
    setAutoOrganizing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets/auto-organize`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { alert(body.message || "Auto sheet organize failed"); return; }
      alert(`ERP auto sheets created: ${body.created ?? 0}`);
      await loadAll(true);
      setSheetSubTab("created");
    } finally {
      setAutoOrganizing(false);
    }
  }

  function openEditSheet(sheet: PrintSheet) {
    const canEdit = sheet.status === "INCOMPLETE" || sheet.status === "COMPLETE" || sheet.status === "SETTING";
    if (!canEdit) {
      alert("Sheets can be edited until complete status.");
      return;
    }
    setEditSheetModal(sheet);
    setEditSheetForm({
      sheetNo: sheet.sheetNo,
      gsm: String(sheet.gsm),
      quality: sheet.quality,
      quantity: String(sheet.quantity),
      actualPrintedQuantity: sheet.actualPrintedQuantity ? String(sheet.actualPrintedQuantity) : "",
      sizeInches: sheet.sizeInches,
      printing: sheet.printing,
    });
  }

  async function updateSheet() {
    if (!editSheetModal) return;
    if (!editSheetForm.sheetNo || !editSheetForm.gsm || !editSheetForm.quantity || !editSheetForm.sizeInches) {
      alert("Fill sheet number, GSM, quantity and size");
      return;
    }
    setSavingEditSheet(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets/${editSheetModal.id}`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetNo: editSheetForm.sheetNo,
          gsm: Number(editSheetForm.gsm),
          quality: editSheetForm.quality,
          quantity: Number(editSheetForm.quantity),
          actualPrintedQuantity: editSheetForm.actualPrintedQuantity ? Number(editSheetForm.actualPrintedQuantity) : null,
          sizeInches: editSheetForm.sizeInches,
          printing: editSheetForm.printing,
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      setEditSheetModal(null);
      const updated = await res.json().catch(() => null);
      if (updated?.id) setSheetsData(prev => prev.map(sheet => sheet.id === updated.id ? { ...sheet, ...updated } : sheet));
      else await loadSheets();
    } finally { setSavingEditSheet(false); }
  }

  async function deleteSheet(sheet: PrintSheet) {
    const canDelete = sheet.status === "INCOMPLETE" || (sheet.createdBySource === "AUTO" && sheet.status === "COMPLETE");
    if (!canDelete) {
      alert("Only incomplete sheets or AUTO complete sheets can be deleted.");
      return;
    }
    if (!confirm(`Delete sheet ${sheet.sheetNo}? Assigned items will become unassigned again.`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets/${sheet.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); alert(body.message || "Delete failed"); return; }
      setSheetsData(prev => prev.filter(s => s.id !== sheet.id));
      if (expandedSheet === sheet.id) setExpandedSheet(null);
    } catch {
      alert("Delete failed");
    }
  }

  async function loadPlaceableItems(gsm: number) {
    setLoadingPlaceable(true);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets/placeable-items?gsm=${gsm}`, { headers: getAuthHeaders() });
      setPlaceableItems(res.ok ? await res.json() : []);
    } finally { setLoadingPlaceable(false); }
  }

  // Compute how much qty of an item is already assigned across all sheets
  function getAssignedQty(orderItemId: string): number {
    return sheetsData.reduce((total, sheet) =>
      total + sheet.items.filter(si => si.orderItem.id === orderItemId).reduce((s, si) => s + (si.quantityOnSheet ?? si.multiple * sheet.quantity), 0), 0);
  }

  function openMultipleDialog(sheetId: string, item: PlaceableItem) {
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (!sheet) return;
    const sizeStr = (item.openSizeInches ?? "0x0").replace("*", "x");
    const [w, h] = sizeStr.split("x").map(Number);
    if (!w || !h) { alert("Invalid product size"); return; }
    const itemArea = w * h;
    const available = sheet.areaSqInches - sheet.usedAreaSqInches;
    const fitsByArea = itemArea > 0 ? Math.floor(available / itemArea) : 0;
    if (fitsByArea === 0) { alert("Not enough space on sheet"); return; }

    // Balance qty = order qty minus what's already assigned on other sheets
    const alreadyAssigned = getAssignedQty(item.id);
    const balanceQty = item.quantity - alreadyAssigned;
    if (balanceQty <= 0) { alert("This item is already fully assigned"); return; }

    // Max multiple = limited by both area and balance qty
    const maxByQty = Math.floor(balanceQty / sheet.quantity);
    const maxMultiple = Math.min(fitsByArea, maxByQty > 0 ? maxByQty : 1);
    // If balance < sheet.quantity, we still allow 1x but it will be capped at balanceQty
    const effectiveMax = fitsByArea > 0 ? Math.min(fitsByArea, Math.ceil(balanceQty / sheet.quantity)) : 0;
    if (effectiveMax === 0) { alert("Not enough space on sheet"); return; }

    // Suggested multiple = exactly what fills the balance
    const suggested = Math.min(effectiveMax, Math.ceil(balanceQty / sheet.quantity));

    setMultipleDialog({ sheetId, sheetNo: sheet.sheetNo, sheetQty: sheet.quantity, item, maxMultiple: effectiveMax, suggestedMultiple: suggested });
    setMultipleValue(String(suggested));
  }

  async function confirmPlaceWithMultiple() {
    if (!multipleDialog) return;
    const { sheetId, item, maxMultiple, sheetQty } = multipleDialog;
    const val = parseInt(multipleValue);
    if (!val || val < 1) { alert("Enter a valid multiple (minimum 1)"); return; }
    if (val > maxMultiple) { alert(`Maximum allowed is ${maxMultiple}x — would exceed order balance or sheet space`); return; }

    const sheet = sheetsData.find(s => s.id === sheetId);
    if (!sheet) return;
    const sizeStr = (item.openSizeInches ?? "0x0").replace("*", "x");
    const [w, h] = sizeStr.split("x").map(Number);
    const itemArea = w * h;

    // Cap quantityOnSheet at balanceQty
    const alreadyAssigned = getAssignedQty(item.id);
    const balanceQty = item.quantity - alreadyAssigned;
    const quantityOnSheet = Math.min(val * sheetQty, balanceQty);

    setPlacingItem(item.id);
    setMultipleDialog(null);
    try {
      const res = await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/items`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderItemId: item.id, productId: item.id, multiple: val, quantityOnSheet, areaSqInches: itemArea * val }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      const payload = await res.json().catch(() => null);
      if (payload?.sheet?.id && payload?.item?.id) {
        setSheetsData(prev => prev.map(sheet => sheet.id === sheetId
          ? {
              ...sheet,
              usedAreaSqInches: payload.sheet.usedAreaSqInches,
              items: [...sheet.items, payload.item],
            }
          : sheet
        ));
        setPlaceableItems(prev => prev.filter(pi => {
          if (pi.id !== item.id) return true;
          const assignedAfter = alreadyAssigned + quantityOnSheet;
          return assignedAfter < pi.quantity;
        }));
      } else {
        await loadSheets();
      }
      await loadPlaceableItems(sheet.gsm);
    } finally { setPlacingItem(null); }
  }

  async function removeSheetItem(id: string) {
    if (!confirm("Remove this item from sheet?")) return;
    const res = await fetch(`${API_BASE_URL}/production/sheets/sheet-items/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    if (!res.ok) { alert("Failed to remove item"); return; }
    const payload = await res.json().catch(() => null);
    if (payload?.sheetId) {
      setSheetsData(prev => prev.map(sheet => sheet.id === payload.sheetId
        ? {
            ...sheet,
            usedAreaSqInches: payload.sheet?.usedAreaSqInches ?? Math.max(0, sheet.usedAreaSqInches),
            items: sheet.items.filter(item => item.id !== id),
          }
        : sheet
      ));
    } else {
      await loadSheets();
    }
  }

  async function unassignItemFromSheets(itemId: string) {
    if (!confirm("Unassign from Sheets?")) return;
    const res = await fetch(`${API_BASE_URL}/production/items/${itemId}/assign-category`, {
      method: "PATCH",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ productionCategory: null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.message || "Failed to unassign from Sheets");
      return;
    }
    await loadAll(true);
  }

  async function updateSheetStatus(sheetId: string, status: string) {
    // Intercept COMPLETE → SETTING: must fill plate + print vendor info first
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (sheet) {
      const allowedStatuses = getAllowedSheetStatuses(sheet.status);
      if (!allowedStatuses.includes(status)) {
        alert(`Move sheet step by step. Next allowed status is ${SHEET_NEXT_STATUS[sheet.status] ?? sheet.status}.`);
        return;
      }
    }
    if (sheet && sheet.status === "COMPLETE" && status === "SETTING") {
      const printQty = String(sheet.actualPrintedQuantity ?? sheet.quantity);
      setSettingDialog({ sheetId, sheetNo: sheet.sheetNo });
      setSettingForm({
        plateVendorId: "",
        plateDesc: "",
        plateRate: "1000",
        plateQty: "1",
        plateAmount: "",
        printVendorId: "",
        printDesc: "",
        printRate: "",
        printQty,
        printAmount: "",
      });
      return;
    }
    const prevExpanded = expandedSheet;
    const res = await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/status`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const stageMap: Record<string, string> = { INCOMPLETE: "NOT_PRINTED", COMPLETE: "NOT_PRINTED", SETTING: "NOT_PRINTED", PRINTING: "PRINTING", PROCESSING: "PROCESSING", DONE: "READY_FOR_DISPATCH" };
      setSheetsData(prev => prev.map(sheet => sheet.id === sheetId
        ? {
            ...sheet,
            status,
            items: sheet.items.map(si => ({
              ...si,
              orderItem: { ...si.orderItem, itemProductionStage: stageMap[status] ?? si.orderItem.itemProductionStage },
            })),
          }
        : sheet
      ));
    } else {
      const body = await res.json().catch(() => null);
      alert(body?.message || "Sheet status update failed");
      await loadSheets();
    }
    setExpandedSheet(prevExpanded);
  }

  async function submitSettingDialog() {
    if (!settingDialog) return;
    const { sheetId } = settingDialog;
    if (!settingForm.plateVendorId || !settingForm.plateRate || !settingForm.plateQty) { alert("Plate Making: select vendor, rate and quantity"); return; }
    if (!settingForm.printVendorId || !settingForm.printRate || !settingForm.printQty) { alert("Printing: select vendor, rate and quantity"); return; }
    setSavingSetting(true);
    try {
      const h = { ...getAuthHeaders(), "Content-Type": "application/json" };
      const plateTotal = Number(settingForm.plateRate) * Number(settingForm.plateQty);
      const printTotal = Number(settingForm.printRate) * Number(settingForm.printQty);
      if (!Number.isFinite(plateTotal) || plateTotal <= 0) { alert("Plate Making: enter a valid rate and quantity"); return; }
      if (!Number.isFinite(printTotal) || printTotal <= 0) { alert("Printing: enter a valid rate and quantity"); return; }

      const plateRes = await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/stage-vendors`, {
        method: "POST", headers: h,
        body: JSON.stringify({ stage: "PLATE_MAKING", vendorId: settingForm.plateVendorId, cost: plateTotal, description: settingForm.plateDesc || undefined }),
      });
      if (!plateRes.ok) { alert(await readApiError(plateRes, "Failed to save plate making vendor")); return; }

      const printRes = await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/stage-vendors`, {
        method: "POST", headers: h,
        body: JSON.stringify({ stage: "PRINTING", vendorId: settingForm.printVendorId, cost: printTotal, description: settingForm.printDesc || undefined }),
      });
      if (!printRes.ok) { alert(await readApiError(printRes, "Failed to save printing vendor")); return; }

      const settingRes = await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/status`, {
        method: "PATCH", headers: h, body: JSON.stringify({ status: "SETTING" }),
      });
      if (!settingRes.ok) { alert(await readApiError(settingRes, "Failed to move sheet to setting")); return; }

      const printingRes = await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/status`, {
        method: "PATCH", headers: h, body: JSON.stringify({ status: "PRINTING" }),
      });
      if (!printingRes.ok) { alert(await readApiError(printingRes, "Failed to move sheet to printing")); return; }

      setSettingDialog(null);
      await loadAll(true);
      setProcessingSubTab("printing");
    } finally { setSavingSetting(false); }
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
      await loadAll(true);
    } finally { setSavingStageVendor(false); }
  }

  async function deleteStageVendor(id: string) {
    if (!confirm("Remove vendor from this stage?")) return;
    await fetch(`${API_BASE_URL}/production/sheets/stage-vendors/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    await loadAll(true);
  }

  // ── Derived counts ────────────────────────────────────────────────────────
  const unassignedCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.filter(i => !i.productionCategory).length, 0), [ordersData]);
  const inhouseCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.filter(i => i.productionCategory === "INHOUSE" && i.itemProductionStage !== "READY_FOR_DISPATCH").length, 0), [ordersData]);
  const allCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.length, 0), [ordersData]);
  const unassignedOrders = useMemo(() => ordersData.filter(o => o.items.some(i => !i.productionCategory)), [ordersData]);
  const printingPendingCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.filter(i => i.productionCategory === "INHOUSE" && (i.itemProductionStage === "NOT_PRINTED" || i.itemProductionStage === "PRINTING")).length, 0), [ordersData]);
  const processingPendingCount = useMemo(() => ordersData.reduce((s, o) => s + o.items.filter(i => i.productionCategory === "INHOUSE" && i.itemProductionStage === "PROCESSING").length, 0), [ordersData]);

  type FlatItem = OrderItem & { orderId: string; orderNo: string; customerName: string; customerPhone?: string; salesAgentName?: string; orderDate: string; isFirstInOrder: boolean; };
  const flatItems = useMemo<FlatItem[]>(() => {
    const q = search.trim().toLowerCase();
    const result: FlatItem[] = [];
    for (const o of ordersData) {
      let items = activeTab === "inhouse" ? o.items.filter(i => { if (i.productionCategory !== "INHOUSE") return false; if (inhouseSubTab === "printing_pending") return i.itemProductionStage === "NOT_PRINTED" || i.itemProductionStage === "PRINTING"; if (inhouseSubTab === "processing_pending") return i.itemProductionStage === "PROCESSING"; return true; }) : o.items;
      if (q) items = items.filter(i => o.orderNo.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || i.productName.toLowerCase().includes(q));
      items.forEach((item, idx) => result.push({ ...item, orderId: o.id, orderNo: o.orderNo, customerName: o.customerName, customerPhone: o.customerPhone, salesAgentName: o.salesAgentName, orderDate: o.orderDate, isFirstInOrder: idx === 0 }));
    }
    return result;
  }, [ordersData, activeTab, search, inhouseSubTab]);

  const IS = { input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" } };

  const tabs = [
    { key: "unassigned", label: "Unassigned", count: unassignedCount },
    { key: "inhouse",    label: "Inhouse",    count: inhouseCount },
    { key: "clubbing",   label: "Clubbing",   count: clubData.reduce((s,o) => s + o.items.filter(i => i.itemProductionStage !== "READY_FOR_DISPATCH").length, 0) },
    { key: "sheets",     label: "Sheets",     count: sheetsData.length },
    { key: "all",        label: "All",        count: allCount },
  ] as const;

  return (
    <>
      <DashboardShell>
        <div className="flex h-[calc(100vh-1rem)] min-h-0 flex-col gap-3 overflow-hidden p-4 lg:p-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Production</h1>
              <p className="text-xs text-slate-500 mt-0.5">Assign and track production for approved orders.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setVendorModal(true)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">+ Vendor</button>
              {activeTab === "sheets" && <button onClick={() => setCreateSheetModal(true)} className="rounded-lg bg-cyan-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-cyan-700">+ New Sheet</button>}
              <button onClick={() => loadAll()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">Refresh</button>
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
            {tabs.filter(tab => userRole === "INHOUSE" ? tab.key === "inhouse" : true).map(tab => (
              <button key={tab.key} onClick={() => { if (userRole !== "INHOUSE") setActiveTab(tab.key); }}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition ${activeTab === tab.key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {tab.label}
                <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${activeTab === tab.key ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>{tab.count}</span>
              </button>
            ))}
          </div>

          {activeTab === "inhouse" && (
            <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1 w-fit">
              <button onClick={() => setInhouseSubTab("printing_pending")} className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${inhouseSubTab === "printing_pending" ? "bg-white text-blue-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
                Printing Pending <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${inhouseSubTab === "printing_pending" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>{printingPendingCount}</span>
              </button>
              <button onClick={() => setInhouseSubTab("processing_pending")} className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${inhouseSubTab === "processing_pending" ? "bg-white text-yellow-600 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
                Processing Pending <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${inhouseSubTab === "processing_pending" ? "bg-yellow-100 text-yellow-700" : "bg-slate-200 text-slate-500"}`}>{processingPendingCount}</span>
              </button>
            </div>
          )}

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
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
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(o.orderDate)}`}>{orderAge(o.orderDate)}</span>
                      <span className="text-slate-700 text-sm font-medium">{o.customerName}</span>
                      {o.customerPhone && <span className="text-slate-400 text-xs">{o.customerPhone}</span>}
                      {o.salesAgentName && <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{o.salesAgentName}</span>}
                    </div>
                    <button onClick={() => openAssignModal(o)} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700">Assign Production</button>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {o.items.filter(i => !i.productionCategory).map(item => {
                      const { size, gsm, sides } = getItemDetails(item);
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
            <>
            <div className="space-y-3 md:hidden">
              {flatItems.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 shadow-sm">No items.</div>
              ) : flatItems.map(item => {
                const { size, gsm, sides } = getItemDetails(item);
                const isUpdating = updatingItemId === item.id;
                const isUploading = uploadingItemId === item.id;
                const designFiles = item.designFiles ?? [];
                const isExpanded = expandedFileItemId === item.id;
                const sheetAssignments = sheetsData.flatMap(s => s.items.filter(si => si.orderItem.id === item.id).map(si => ({ no: s.sheetNo, qty: si.quantityOnSheet })));
                return (
                  <div key={item.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="bg-slate-900 px-3 py-2 text-white">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-base font-bold leading-none">{item.orderNo}</p>
                            <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${ageColor(item.orderDate)}`}>{orderAge(item.orderDate)}</span>
                            {activeTab === "all" && (
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.productionCategory ? categoryColors[item.productionCategory] : "bg-red-50 text-red-600"}`}>
                                {item.productionCategory ? categoryLabels[item.productionCategory] : "Unassigned"}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 truncate text-sm font-semibold">{item.customerName}</p>
                          <p className="text-xs text-slate-300">{item.customerPhone ?? "No phone"}</p>
                        </div>
                        {item.salesAgentName && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold">{item.salesAgentName}</span>}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-900">{item.productName}</p>
                          {item.artworkNotes && <p className="truncate text-xs text-slate-400">{item.artworkNotes}</p>}
                        </div>
                        <span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-900">Qty: {item.quantity}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-slate-500">
                        <span className="rounded-full bg-slate-50 px-2 py-1">Size {size ?? "—"}</span>
                        <span className="rounded-full bg-slate-50 px-2 py-1">{gsm ?? "—"} GSM</span>
                        <span className="rounded-full bg-slate-50 px-2 py-1">{sides ?? "—"}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        {isUpdating && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
                        <select value={item.itemProductionStage} disabled={isUpdating} onChange={e => updateItemStage(item.id, e.target.value as ProductionStage)}
                          className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm font-bold outline-none disabled:opacity-60 ${stageColors[item.itemProductionStage]}`}>
                          {PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                        {userRole !== "INHOUSE" && (
                          <button onClick={async () => { if (!confirm("Unassign from Inhouse?")) return; await fetch(`${API_BASE_URL}/production/items/${item.id}/assign-category`, { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ productionCategory: null }) }); await loadAll(true); }} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">Undo</button>
                        )}
                      </div>
                      {item.itemProductionStage === "PROCESSING" && (
                        <div className="mt-2">
                          <label className="mb-1 block text-xs font-bold text-slate-500">Schedule Date</label>
                          <input type="date" key={item.processingFollowUpDate ?? "empty"} defaultValue={dateInputValue(item.processingFollowUpDate)} onBlur={e => updateInhouseFollowUpDate(item.id, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none" />
                        </div>
                      )}
                      {sheetAssignments.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {sheetAssignments.map((a, i) => <span key={i} className="rounded-full bg-cyan-50 border border-cyan-200 px-2 py-1 text-xs font-bold text-cyan-700">{a.no} · {a.qty}</span>)}
                        </div>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button onClick={() => setExpandedFileItemId(isExpanded ? null : item.id)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold ${designFiles.length > 0 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                          Files {designFiles.length}
                        </button>
                        <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden" accept="image/*,.pdf,.zip,.ai,.psd,.cdr,.eps" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(item.id, f); }} />
                        <button onClick={() => fileInputRefs.current[item.id]?.click()} disabled={isUploading} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">
                          {isUploading ? "Uploading..." : "Upload"}
                        </button>
                      </div>
                      {isExpanded && designFiles.length > 0 && (
                        <div className="mt-3 space-y-2 rounded-xl bg-blue-50 p-3">
                          {designFiles.map(f => <div key={f.filename} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs"><FileText className="h-3 w-3 text-slate-400" /><span className="min-w-0 flex-1 truncate">{f.originalName}</span><button onClick={() => downloadFile(item.id, f.filename, f.originalName)} className="font-bold text-blue-700">Open</button></div>)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto md:block">
              <table className="w-full text-left text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-3 py-2 font-semibold text-slate-600">Order</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Age</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Customer</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Agent</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Product</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Size</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">GSM</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Qty</th>
                    {activeTab === "all" && <th className="px-3 py-2 font-semibold text-slate-600">Type</th>}
                    <th className="px-3 py-2 font-semibold text-slate-600">Stage</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Schedule</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Sheets</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Files</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Upload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {flatItems.length === 0 ? (
                    <tr><td colSpan={13} className="px-4 py-10 text-center text-slate-400">No items.</td></tr>
                  ) : flatItems.map(item => {
                    const { size, gsm, sides } = getItemDetails(item);
                    const isUpdating = updatingItemId === item.id;
                    const isUploading = uploadingItemId === item.id;
                    const designFiles = item.designFiles ?? [];
                    const isExpanded = expandedFileItemId === item.id;
                    return (
                      <React.Fragment key={item.id}>
                        <tr className={`hover:bg-slate-50 ${item.itemProductionStage === "READY_FOR_DISPATCH" ? "bg-green-50/30" : ""}`}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{item.isFirstInOrder && <div><p className="font-bold text-blue-700">{item.orderNo}</p><p className="text-slate-400">{new Date(item.orderDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</p></div>}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{item.isFirstInOrder && <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(item.orderDate)}`}>{orderAge(item.orderDate)}</span>}</td>
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
                            {item.itemProductionStage === "PROCESSING" ? (
                              <input type="date" key={item.processingFollowUpDate ?? "empty"} defaultValue={dateInputValue(item.processingFollowUpDate)} onChange={e => { if (e.target.value || e.target.value === "") updateInhouseFollowUpDate(item.id, e.target.value); }}
                                className="w-32 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold outline-none" />
                            ) : <span className="text-slate-300 text-xs">—</span>}
                          </td>
                              {userRole !== "INHOUSE" && <button onClick={async () => { if (!confirm("Unassign from Inhouse?")) return; await fetch(`${API_BASE_URL}/production/items/${item.id}/assign-category`, { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ productionCategory: null }) }); await loadAll(true); }} className="inline-flex items-center rounded bg-red-100 border border-red-200 px-1.5 py-0.5 text-xs font-semibold text-red-600 hover:bg-red-200 ml-1">✕</button>}
                          <td className="px-3 py-1.5 max-w-[160px]">
                            {(() => {
                              const sa = sheetsData.flatMap(s => s.items.filter(si => si.orderItem.id === item.id).map(si => ({ no: s.sheetNo, qty: si.quantityOnSheet })));
                              if (!sa.length) return <span className="text-slate-300 text-xs">—</span>;
                              return <div className="flex flex-wrap gap-0.5">{sa.map((a, i) => (
                                <span key={i} className="inline-flex rounded-full bg-cyan-50 border border-cyan-200 px-1.5 py-0.5 text-xs font-semibold text-cyan-700 whitespace-nowrap">{a.no} · {a.qty}</span>
                              ))}</div>;
                            })()} 
                          </td>
                          <td className="px-3 py-1.5">
                            <button onClick={() => setExpandedFileItemId(isExpanded ? null : item.id)}
                              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium border ${designFiles.length > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                              <Paperclip className="h-3 w-3" />{designFiles.length}
                            </button>
                          </td>
                          <td className="px-3 py-1.5">
                            <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden"
                              accept="image/*,.pdf,.zip,.ai,.psd,.cdr,.eps"
                              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(item.id, f); }} />
                            <button onClick={() => fileInputRefs.current[item.id]?.click()} disabled={isUploading}
                              className="inline-flex items-center gap-0.5 rounded-md bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                              {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                              {isUploading ? "..." : "Upload"}
                            </button>
                          </td>
                        </tr>
                        {isExpanded && designFiles.length > 0 && (
                          <tr><td colSpan={13} className="bg-blue-50 border-t border-blue-100 px-4 py-3">
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
            </>
          )}

          {/* ── CLUBBING TAB ── */}
          {!loading && activeTab === "clubbing" && (
            <div className="space-y-3">
              {/* Clubbing Sub-tabs */}
              <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1 w-fit">
                {([
                  { key: "unassigned", label: "🏭 Unassigned", color: "text-slate-600" },
                  { key: "in_progress", label: "⏳ In Progress", color: "text-blue-600" },
                  { key: "received", label: "✅ Received", color: "text-green-600" },
                ] as { key: "unassigned"|"in_progress"|"received"; label: string; color: string }[]).map(t => {
                  const count = clubData.reduce((s, o) => s + o.items.filter(i => {
                    if (t.key === "unassigned") return i.jobWorks.length === 0;
                    if (t.key === "in_progress") return i.jobWorks.some(j => j.status === "PENDING" || j.status === "IN_PROGRESS");
                    if (t.key === "received") return i.jobWorks.some(j => j.status === "COMPLETED") && i.itemProductionStage !== "READY_FOR_DISPATCH";
                    return false;
                  }).length, 0);
                  return (
                    <button key={t.key} onClick={() => setClubSubTab(t.key)}
                      className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${clubSubTab === t.key ? `bg-white shadow-sm border border-slate-200 ${t.color}` : "text-slate-500 hover:text-slate-700"}`}>
                      {t.label}
                      <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${clubSubTab === t.key ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-500"}`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Clubbing Items Table */}
              {(() => {
                const allItems = clubData.flatMap(o => o.items.filter(item => {
                  if (clubSubTab === "unassigned") return item.jobWorks.length === 0;
                  if (clubSubTab === "in_progress") return item.jobWorks.some(j => j.status === "PENDING" || j.status === "IN_PROGRESS");
                  if (clubSubTab === "received") return item.jobWorks.some(j => j.status === "COMPLETED") && item.itemProductionStage !== "READY_FOR_DISPATCH";
                  return false;
                }).map(item => ({ ...item, orderNo: o.orderNo, customerName: o.customerName, salesAgentName: o.salesAgentName, orderDate: o.orderDate, orderId: o.id })));

                if (allItems.length === 0) return (
                  <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
                    {clubSubTab === "unassigned" && "No unassigned clubbing items."}
                    {clubSubTab === "in_progress" && "No items in progress."}
                    {clubSubTab === "received" && "No received items."}
                  </div>
                );

                return (
                  <>
                  <div className="space-y-3 md:hidden">
                    {allItems.map((item: any) => {
                      const { size, gsm, sides } = getItemDetails(item);
                      const activeJw = item.jobWorks.find((j: JobWork) => j.status === "PENDING" || j.status === "IN_PROGRESS" || j.status === "COMPLETED");
                      const completedJw = item.jobWorks.find((j: JobWork) => j.status === "COMPLETED");
                      const df = item.designFiles ?? [];
                      const isExp = expandedFileItemId === item.id;
                      return (
                        <div key={item.id} className="overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
                          <div className="bg-orange-600 px-3 py-2 text-white">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-base font-bold leading-none">{item.orderNo}</p>
                                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${item.orderDate ? ageColor(item.orderDate) : "bg-white/20 text-white"}`}>{item.orderDate ? orderAge(item.orderDate) : "—"}</span>
                                </div>
                                <p className="mt-1 truncate text-sm font-semibold">{item.customerName}</p>
                              </div>
                              {(item as any).salesAgentName && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold">{(item as any).salesAgentName}</span>}
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate font-bold text-slate-900">{item.productName}</p>
                                {item.artworkNotes && <p className="truncate text-xs text-slate-400">{item.artworkNotes}</p>}
                              </div>
                              <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${stageColors[item.itemProductionStage] ?? "bg-gray-100 text-gray-600"}`}>{item.itemProductionStage.replace(/_/g, " ")}</span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-slate-500">
                              <span className="rounded-full bg-slate-50 px-2 py-1">Qty {item.quantity}</span>
                              <span className="rounded-full bg-slate-50 px-2 py-1">Size {size ?? "—"}</span>
                              <span className="rounded-full bg-slate-50 px-2 py-1">{gsm ?? "—"} GSM</span>
                              <span className="rounded-full bg-slate-50 px-2 py-1">{sides ?? "—"}</span>
                            </div>
                            {clubSubTab !== "unassigned" && (
                              <div className="mt-2 rounded-lg bg-orange-50 px-3 py-2 text-xs">
                                <div className="flex justify-between gap-2"><span className="text-slate-500">Vendor</span><strong className="text-orange-700">{activeJw?.vendorName ?? completedJw?.vendorName ?? "—"}</strong></div>
                                {clubSubTab === "in_progress" && <div className="mt-1 flex justify-between gap-2"><span className="text-slate-500">Cost</span><strong>{activeJw?.cost > 0 ? fmt(activeJw.cost) : "—"}</strong></div>}
                                {clubSubTab === "in_progress" && activeJw && <div className="mt-2"><label className="mb-1 block text-xs font-bold text-slate-500">Schedule Date</label><input type="date" key={activeJw.dueDate ?? "empty"} defaultValue={dateInputValue(activeJw.dueDate)} onBlur={e => updateJobWorkDueDate(activeJw.id, e.target.value)} className="w-full rounded-lg border border-orange-200 bg-white px-3 py-2 text-sm font-semibold outline-none" /></div>}
                                {clubSubTab === "received" && <div className="mt-1 flex justify-between gap-2"><span className="text-slate-500">Invoice</span><strong>{completedJw?.vendorInvoiceNo ?? "—"}</strong></div>}
                              </div>
                            )}
                            <div className="mt-2 flex gap-2">
                              <button onClick={() => setExpandedFileItemId(isExp ? null : item.id)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold ${df.length > 0 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>Files {df.length}</button>
                              <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden" accept=".pdf,.ai,.psd,.cdr,.png,.jpg,.svg,.eps,.zip" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(item.id, f); }} />
                              <button onClick={() => { const inp = fileInputRefs.current[item.id]; if (inp) { inp.value = ""; inp.click(); } }} disabled={uploadingItemId === item.id} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">Upload</button>
                            </div>
                            {isExp && df.length > 0 && (
                              <div className="mt-3 space-y-2 rounded-xl bg-blue-50 p-3">
                                {df.map((f: any) => <div key={f.filename} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs"><FileText className="h-3 w-3 text-slate-400" /><span className="min-w-0 flex-1 truncate">{f.originalName}</span><button onClick={() => downloadFile(item.id, f.filename, f.originalName)} className="font-bold text-blue-700">Open</button></div>)}
                              </div>
                            )}
                            <div className="mt-2 flex gap-2">
                              {clubSubTab === "unassigned" && (
                                <>
                                  <button onClick={() => { setSendDialog({ itemId: item.id, productName: item.productName, orderNo: item.orderNo, size: item.size, gsm: item.gsm, sides: item.sides, quantity: item.quantity, customerName: item.customerName, orderDate: item.orderDate }); setSendVendorId(""); setSendDesc(""); setSendDueDate(""); }} className="flex-1 rounded-lg bg-orange-600 px-3 py-2 text-sm font-bold text-white">Send</button>
                                  <button onClick={async () => { if (!confirm("Unassign from Clubbing?")) return; await fetch(`${API_BASE_URL}/production/items/${item.id}/assign-category`, { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ productionCategory: null }) }); await loadAll(true); }} className="flex-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">Undo</button>
                                </>
                              )}
                              {clubSubTab === "in_progress" && activeJw && <button onClick={() => { setReceiveDialog({ jwId: activeJw.id, vendorName: activeJw.vendorName, productName: item.productName }); setReceiveCost(""); setReceiveInvNo(""); }} className="w-full rounded-xl bg-green-600 px-3 py-2 text-sm font-bold text-white">Received</button>}
                              {clubSubTab === "received" && <button onClick={() => updateItemStage(item.id, "READY_FOR_DISPATCH")} disabled={updatingItemId === item.id} className="w-full rounded-xl bg-green-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">Mark Ready</button>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto md:block">
                    <table className="w-full text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead>
                        <tr className="bg-orange-50 border-b border-orange-100">
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Age</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Agent</th>
                         <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                         <th className="px-3 py-2 text-left font-semibold text-slate-600">Size</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">GSM</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Sides</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Stage</th>
                          {clubSubTab !== "unassigned" && <th className="px-3 py-2 text-left font-semibold text-slate-600">Vendor</th>}
                          {clubSubTab === "in_progress" && <th className="px-3 py-2 text-left font-semibold text-slate-600">Cost</th>}
                          {clubSubTab === "in_progress" && <th className="px-3 py-2 text-left font-semibold text-slate-600">Schedule</th>}
                          {clubSubTab === "received" && <th className="px-3 py-2 text-left font-semibold text-slate-600">Invoice</th>}
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Files</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {allItems.map((item: any) => {
                          const { size, gsm, sides } = getItemDetails(item);
                          const activeJw = item.jobWorks.find((j: JobWork) => j.status === "PENDING" || j.status === "IN_PROGRESS" || j.status === "COMPLETED");
                          const completedJw = item.jobWorks.find((j: JobWork) => j.status === "COMPLETED");
                          return (
                            <tr key={item.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-bold text-blue-700 whitespace-nowrap">{item.orderNo}</td>
                              <td className="px-3 py-2 whitespace-nowrap"><span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${item.orderDate ? ageColor(item.orderDate) : "bg-slate-100 text-slate-500"}`}>{item.orderDate ? orderAge(item.orderDate) : "—"}</span></td>
                              <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{item.customerName}</td>
                              <td className="px-3 py-2">{(item as any).salesAgentName ? <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{(item as any).salesAgentName}</span> : <span className="text-slate-400 text-xs">—</span>}</td>
                              <td className="px-3 py-2">
                                <p className="font-semibold text-slate-800">{item.productName}</p>
                                {item.artworkNotes && <p className="text-slate-400 text-xs">{item.artworkNotes}</p>}
                              </td>
                              <td className="px-3 py-2 text-slate-600">{size ?? "—"}</td>
                              <td className="px-3 py-2 text-slate-600">{gsm ?? "—"}</td>
                              <td className="px-3 py-2 text-slate-600">{sides ?? "—"}</td>
                              <td className="px-3 py-2 font-semibold text-slate-800">{item.quantity}</td>
                              <td className="px-3 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stageColors[item.itemProductionStage] ?? "bg-gray-100 text-gray-600"}`}>
                                  {item.itemProductionStage.replace(/_/g, " ")}
                                </span>
                              </td>
                              {clubSubTab !== "unassigned" && (
                                <td className="px-3 py-2 font-semibold text-orange-700">{activeJw?.vendorName ?? completedJw?.vendorName ?? "—"}</td>
                              )}
                              {clubSubTab === "in_progress" && (
                                <td className="px-3 py-2 text-slate-600">{activeJw?.cost > 0 ? fmt(activeJw.cost) : "—"}</td>
                              )}
                              {clubSubTab === "in_progress" && (
                                <td className="px-3 py-2">
                                  {activeJw ? <input type="date" key={activeJw.dueDate ?? "empty"} defaultValue={dateInputValue(activeJw.dueDate)} onBlur={e => updateJobWorkDueDate(activeJw.id, e.target.value)}
                                    className="w-32 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold outline-none" /> : <span className="text-slate-300">—</span>}
                                </td>
                              )}
                              {clubSubTab === "received" && (
                                <td className="px-3 py-2 text-slate-500">{completedJw?.vendorInvoiceNo ?? "—"}</td>
                              )}
<td className="px-3 py-2">
                                {(() => { const df = item.designFiles ?? []; const isExp = expandedFileItemId === item.id; return (<div className="flex flex-col gap-1"><div className="flex items-center gap-1"><button onClick={() => setExpandedFileItemId(isExp ? null : item.id)} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium border ${df.length > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}><Paperclip className="h-3 w-3" />{df.length}</button><input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden" accept=".pdf,.ai,.psd,.cdr,.png,.jpg,.svg,.eps,.zip" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(item.id, f); }} /><button onClick={() => { const inp = fileInputRefs.current[item.id]; if (inp) { inp.value = ""; inp.click(); } }} disabled={uploadingItemId === item.id} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Upload className="h-3 w-3" /></button></div>{isExp && df.length > 0 && (<div className="space-y-0.5 mt-1">{df.map((f: any) => (<div key={f.filename} className="flex items-center gap-1 rounded bg-white border border-slate-200 px-1.5 py-0.5"><FileText className="h-3 w-3 text-slate-400 flex-shrink-0" /><span className="text-xs text-slate-600 truncate max-w-[100px]">{f.originalName}</span><button onClick={() => downloadFile(item.id, f.filename, f.originalName)} className="text-slate-400 hover:text-blue-600 ml-auto"><Download className="h-3 w-3" /></button></div>))}</div>)}</div>); })()}
                              </td>
                              <td className="px-3 py-2">
                                {clubSubTab === "unassigned" && (
                                  <div className="flex gap-1">
                                    <button onClick={() => { setSendDialog({ itemId: item.id, productName: item.productName, orderNo: item.orderNo, size: item.size, gsm: item.gsm, sides: item.sides, quantity: item.quantity, customerName: item.customerName, orderDate: item.orderDate }); setSendVendorId(""); setSendDesc(""); setSendDueDate(""); }}
                                      className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-700">
                                      Send →
                                    </button>
                                    <button onClick={async () => { if (!confirm("Unassign from Clubbing?")) return; await fetch(`${API_BASE_URL}/production/items/${item.id}/assign-category`, { method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" }, body: JSON.stringify({ productionCategory: null }) }); await loadAll(true); }} className="inline-flex items-center rounded bg-red-100 border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-200">✕ Undo</button>
                                  </div>
                                )}
                                {clubSubTab === "in_progress" && activeJw && (
                                  <button onClick={() => { setReceiveDialog({ jwId: activeJw.id, vendorName: activeJw.vendorName, productName: item.productName }); setReceiveCost(""); setReceiveInvNo(""); }}
                                    className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">
                                    Received ✓
                                  </button>
                                )}
                                {clubSubTab === "received" && (
                                  <button onClick={() => updateItemStage(item.id, "READY_FOR_DISPATCH")} disabled={updatingItemId === item.id} className="inline-flex items-center rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-60">READY</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* ── SHEETS TAB ── */}
          {!loading && activeTab === "sheets" && (
            <div className="space-y-3">
              <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-2 bg-slate-50/95 pb-2 backdrop-blur">
                <div className="flex flex-wrap gap-2 items-center w-full">
                  <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1 w-fit">
                    {[
                      { key: "unassigned", label: "Unassigned", color: "text-slate-600" },
                      { key: "created",    label: "Created Sheets", color: "text-cyan-700" },
                      { key: "processing", label: "Processing Sheets", color: "text-orange-600" },
                      { key: "history",    label: "History", color: "text-purple-700" },
                    ].map(t => {
                      const aqm: Record<string,number> = {};
                      sheetsData.forEach(s => s.items.forEach(si => { aqm[si.orderItem.id] = (aqm[si.orderItem.id] || 0) + (si.quantityOnSheet || si.multiple * s.quantity); }));
                      const count = t.key === "unassigned"
                        ? ordersData.reduce((sum, o) => sum + o.items.filter(i => i.productionCategory === "SHEET_PRODUCTION" && (i.quantity - (aqm[i.id] || 0)) > 0).length, 0)
                        : t.key === "created" ? sheetsData.filter(s => s.status === "INCOMPLETE" || s.status === "SETTING").length
                        : t.key === "processing" ? sheetsData.filter(s => s.status === "SETTING" || s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "DONE").filter(s => s.items.some(si => si.orderItem?.itemProductionStage !== "READY_FOR_DISPATCH")).length
                        : sheetHistory.total;
                      return (
                        <button key={t.key} onClick={() => setSheetSubTab(t.key)}
                          className={`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${sheetSubTab === t.key ? "bg-white shadow-sm border border-slate-200 " + t.color : "text-slate-500 hover:text-slate-700"}`}>
                          {t.label}
                          <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${sheetSubTab === t.key ? (t.key === "history" ? "bg-purple-100 text-purple-700" : "bg-cyan-100 text-cyan-700") : "bg-slate-200 text-slate-500"}`}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex-1 flex items-center gap-2 min-w-[200px]">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={sheetSubTab === "history" ? sheetHistorySearch : sheetSearch}
                        onChange={e => {
                          if (sheetSubTab === "history") {
                            setSheetHistorySearch(e.target.value);
                            void loadSheetHistory(e.target.value);
                          } else {
                            setSheetSearch(e.target.value);
                          }
                        }}
                        placeholder={sheetSubTab === "history" ? "Search sheet no, order, product…" : "Search order, customer, sheet…"}
                        className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                      />
                    </div>
                    {sheetSubTab !== "history" && (
                      <button onClick={autoOrganizeSheets} disabled={autoOrganizing}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">
                        {autoOrganizing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                        Auto Create ERP Sheets
                      </button>
                    )}
                  </div>
                </div>
              </div>
              {sheetSubTab === "unassigned" && (() => {
                const aqm: Record<string,number> = {};
                sheetsData.forEach(s => s.items.forEach(si => { aqm[si.orderItem.id] = (aqm[si.orderItem.id] || 0) + (si.quantityOnSheet || si.multiple * s.quantity); }));
                const rawItems = ordersData.flatMap(o => o.items.filter(i => i.productionCategory === "SHEET_PRODUCTION" && (i.quantity - (aqm[i.id] || 0)) > 0).map(i => ({ ...i, orderNo: o.orderNo, customerName: o.customerName, orderDate: o.orderDate, salesAgentName: o.salesAgentName }))).filter(i => !sheetSearch || i.orderNo?.toLowerCase().includes(sheetSearch.toLowerCase()) || i.customerName?.toLowerCase().includes(sheetSearch.toLowerCase()) || i.productName?.toLowerCase().includes(sheetSearch.toLowerCase()));
                const itemMeta = rawItems.map(item => ({ item, ...getItemDetails(item) }));
                const uniq = (values: (string | null | undefined)[]) => Array.from(new Set(values.filter(Boolean).map(String))).sort((a,b) => a.localeCompare(b, undefined, { numeric: true }));
                const filterOptions = {
                  product: uniq(rawItems.map(i => i.productName)),
                  size: uniq(itemMeta.map(i => i.size)),
                  gsm: uniq(itemMeta.map(i => i.gsm)),
                  sides: uniq(itemMeta.map(i => i.sides)),
                };
                const items = itemMeta
                  .filter(({ item, size, gsm, sides }) =>
                    (!sheetFilters.product || item.productName === sheetFilters.product) &&
                    (!sheetFilters.size || size === sheetFilters.size) &&
                    (!sheetFilters.gsm || gsm === sheetFilters.gsm) &&
                    (!sheetFilters.sides || sides === sheetFilters.sides)
                  )
                  .map(({ item }) => item);
                if (rawItems.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">All sheet items are fully assigned.</div>;
                return (
                  <div className="space-y-2">
                    <div className="sticky top-12 z-20 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-center gap-2 flex-wrap">
                        {([
                          ["product", "Product", filterOptions.product],
                          ["size", "Size", filterOptions.size],
                          ["gsm", "GSM", filterOptions.gsm],
                          ["sides", "Sides", filterOptions.sides],
                        ] as const).map(([key, label, options]) => (
                          <label key={key} className="flex items-center gap-1 text-xs font-semibold text-slate-600">
                            {label}
                            <select value={sheetFilters[key]} onChange={e => setSheetFilters(p => ({ ...p, [key]: e.target.value }))} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none">
                              <option value="">All</option>
                              {options.map(option => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </label>
                        ))}
                        <button onClick={() => setSheetFilters({ product: "", size: "", gsm: "", sides: "" })} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50">
                          Clear
                        </button>
                        <span className="ml-auto text-xs text-slate-400">{items.length} of {rawItems.length}</span>
                      </div>
                    </div>
                    {items.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No items match these filters.</div> : (
                    <>
                    <div className="space-y-3 md:hidden">
                      {items.map(item => {
                        const { size, gsm, sides } = getItemDetails(item);
                        const assigned = aqm[item.id] || 0;
                        const balance = item.quantity - assigned;
                        const itemGsm = gsm ? parseInt(gsm) : 0;
                        const compatibleSheets = sheetsData.filter(s =>
                          (s.status === "INCOMPLETE" || s.status === "COMPLETE" || s.status === "SETTING") &&
                          s.gsm === itemGsm &&
                          s.quantity <= balance
                        );
                        const df = item.designFiles ?? [];
                        const isExp = expandedFileItemId === item.id;
                        return (
                          <div key={item.id} className="overflow-hidden rounded-xl border border-cyan-100 bg-white shadow-sm">
                            <div className="bg-cyan-700 px-3 py-2 text-white">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="text-base font-bold leading-none">{item.orderNo}</p>
                                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${item.orderDate ? ageColor(item.orderDate) : "bg-white/20 text-white"}`}>{item.orderDate ? orderAge(item.orderDate) : "—"}</span>
                                  </div>
                                  <p className="mt-1 truncate text-sm font-semibold">{item.customerName}</p>
                                </div>
                                {(item as any).salesAgentName && <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold">{(item as any).salesAgentName}</span>}
                              </div>
                            </div>
                            <div className="p-3">
                              <p className="truncate font-bold text-slate-900">{item.productName}</p>
                              <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-slate-500">
                                <span className="rounded-full bg-slate-50 px-2 py-1">Size {size || "—"}</span>
                                <span className="rounded-full bg-slate-50 px-2 py-1">{gsm || "—"} GSM</span>
                                <span className="rounded-full bg-slate-50 px-2 py-1">{sides || "—"}</span>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                                <div className="rounded-lg bg-slate-50 px-2 py-1"><p className="text-[10px] font-semibold text-slate-400">Order</p><p className="text-sm font-bold text-slate-900">{item.quantity}</p></div>
                                <div className="rounded-lg bg-orange-50 px-2 py-1"><p className="text-[10px] font-semibold text-orange-500">Assigned</p><p className="text-sm font-bold text-orange-700">{assigned}</p></div>
                                <div className="rounded-lg bg-cyan-50 px-2 py-1"><p className="text-[10px] font-semibold text-cyan-500">Balance</p><p className="text-sm font-bold text-cyan-700">{balance}</p></div>
                              </div>
                              <div className="mt-2 flex gap-2">
                                <button onClick={() => setExpandedFileItemId(isExp ? null : item.id)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold ${df.length > 0 ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>Files {df.length}</button>
                                <input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden" accept=".pdf,.ai,.psd,.cdr,.png,.jpg,.svg,.eps,.zip" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(item.id, f); }} />
                                <button onClick={() => { const inp = fileInputRefs.current[item.id]; if (inp) { inp.value = ""; inp.click(); } }} disabled={uploadingItemId === item.id} className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">Upload</button>
                              </div>
                              {isExp && df.length > 0 && <div className="mt-3 space-y-2 rounded-xl bg-blue-50 p-3">{df.map((f: any) => <div key={f.filename} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs"><FileText className="h-3 w-3 text-slate-400" /><span className="min-w-0 flex-1 truncate">{f.originalName}</span><button onClick={() => downloadFile(item.id, f.filename, f.originalName)} className="font-bold text-blue-700">Open</button></div>)}</div>}
                              <div className="mt-2">
                                {compatibleSheets.length === 0 ? (
                                  <div className="flex gap-2">
                                    <span className="flex-1 rounded-lg bg-slate-50 px-3 py-2 text-sm font-bold text-slate-400">No compatible sheet</span>
                                    <button
                                      type="button"
                                      aria-label="Unassign from Sheets"
                                      title="Unassign from Sheets"
                                      onClick={() => void unassignItemFromSheets(item.id)}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex gap-2">
                                    <select id={`mobile-sel-${item.id}`} defaultValue="" className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none">
                                      <option value="">Select sheet...</option>
                                      {compatibleSheets.map(s => <option key={s.id} value={s.id}>{s.sheetNo} - {s.quantity} Qty</option>)}
                                    </select>
                                    <button onClick={() => {
                                      const sel = document.getElementById(`mobile-sel-${item.id}`) as HTMLSelectElement;
                                      if (!sel?.value) { alert("Select a sheet first"); return; }
                                      const pi: PlaceableItem = { id: item.id, productName: item.productName, sku: item.sku || "", gsm: itemGsm, openSizeInches: (size || "0x0").replace(/\*/g,"x"), quantity: item.quantity, orderNo: item.orderNo, customerName: item.customerName };
                                      openMultipleDialog(sel.value, pi);
                                    }} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white">Assign</button>
                                    <button
                                      type="button"
                                      aria-label="Unassign from Sheets"
                                      title="Unassign from Sheets"
                                      onClick={() => void unassignItemFromSheets(item.id)}
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 hover:bg-red-50"
                                    >
                                      <X className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto md:block">
                      <table className="w-full min-w-[1180px] text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead><tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Age</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Agent</th>
                         <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                         <th className="px-3 py-2 text-left font-semibold text-slate-600">Size</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">GSM</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Sides</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order Qty</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Assigned</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Balance</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Files</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Assign Sheet</th>
                      </tr></thead>
                      <tbody>{items.map(item => {
                        const { size, gsm, sides } = getItemDetails(item);
                        const assigned = aqm[item.id] || 0;
                        const balance = item.quantity - assigned;
                        // Find compatible sheets (same GSM, has space, sheetQty <= balanceQty)
                        const itemGsm = gsm ? parseInt(gsm) : 0;
                        const compatibleSheets = sheetsData.filter(s =>
                          (s.status === "INCOMPLETE" || s.status === "COMPLETE" || s.status === "SETTING") &&
                          s.gsm === itemGsm &&
                          s.quantity <= balance
                        );
                        return (
                          <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-3 py-2 font-bold text-blue-700">{item.orderNo}</td>
                            <td className="px-3 py-2 whitespace-nowrap"><span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${item.orderDate ? ageColor(item.orderDate) : "bg-slate-100 text-slate-500"}`}>{item.orderDate ? orderAge(item.orderDate) : "—"}</span></td>
                            <td className="px-3 py-2 text-slate-700">{item.customerName}</td>
                            <td className="px-3 py-2">{(item as any).salesAgentName ? <span className="rounded-full bg-blue-50 text-blue-700 px-1.5 py-0.5 text-xs font-medium">{(item as any).salesAgentName}</span> : <span className="text-slate-400 text-xs">—</span>}</td>
                             <td className="px-3 py-2 font-semibold text-slate-800">{item.productName}</td>
                            <td className="px-3 py-2 text-slate-500">{size || "—"}</td>
                            <td className="px-3 py-2 text-slate-500">{gsm || "—"}</td>
                            <td className="px-3 py-2 text-slate-500">{sides || "—"}</td>
                            <td className="px-3 py-2 font-semibold">{item.quantity}</td>
                            <td className="px-3 py-2 text-orange-600 font-semibold">{assigned}</td>
                            <td className="px-3 py-2 text-cyan-700 font-bold">{balance}</td>
<td className="px-3 py-2">
                              {(() => { const df = item.designFiles ?? []; const isExp = expandedFileItemId === item.id; return (<div className="flex flex-col gap-1"><div className="flex items-center gap-1"><button onClick={() => setExpandedFileItemId(isExp ? null : item.id)} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium border ${df.length > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}><Paperclip className="h-3 w-3" />{df.length}</button><input type="file" ref={el => { fileInputRefs.current[item.id] = el; }} className="hidden" accept=".pdf,.ai,.psd,.cdr,.png,.jpg,.svg,.eps,.zip" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(item.id, f); }} /><button onClick={() => { const inp = fileInputRefs.current[item.id]; if (inp) { inp.value = ""; inp.click(); } }} disabled={uploadingItemId === item.id} className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-1.5 py-0.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Upload className="h-3 w-3" /></button></div>{isExp && df.length > 0 && (<div className="space-y-0.5 mt-1">{df.map((f: any) => (<div key={f.filename} className="flex items-center gap-1 rounded bg-white border border-slate-200 px-1.5 py-0.5"><FileText className="h-3 w-3 text-slate-400 flex-shrink-0" /><span className="text-xs text-slate-600 truncate max-w-[100px]">{f.originalName}</span><button onClick={() => downloadFile(item.id, f.filename, f.originalName)} className="text-slate-400 hover:text-blue-600 ml-auto"><Download className="h-3 w-3" /></button></div>))}</div>)}</div>); })()}
                            </td>
                            <td className="px-3 py-2">
                              {compatibleSheets.length === 0 ? (
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400 text-xs">No sheets</span>
                                  <button
                                    type="button"
                                    aria-label="Unassign from Sheets"
                                    title="Unassign from Sheets"
                                    onClick={() => void unassignItemFromSheets(item.id)}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <select id={`sel-${item.id}`} defaultValue="" className="rounded-md border border-slate-200 px-1.5 py-1 text-xs outline-none bg-white">
                                    <option value="">Select sheet...</option>
                                    {compatibleSheets.map(s => {
                                      const used = Math.round((s.usedAreaSqInches / s.areaSqInches) * 100);
                                      return <option key={s.id} value={s.id}>{s.sheetNo} - {s.quantity} Qty ({used}% used)</option>;
                                    })}
                                  </select>
                                  <button onClick={() => {
                                    const sel = document.getElementById(`sel-${item.id}`) as HTMLSelectElement;
                                    if (!sel?.value) { alert("Select a sheet first"); return; }
                                    const pi: PlaceableItem = { id: item.id, productName: item.productName, sku: item.sku || "", gsm: itemGsm, openSizeInches: (size || "0x0").replace(/\*/g,"x"), quantity: item.quantity, orderNo: item.orderNo, customerName: item.customerName };
                                    openMultipleDialog(sel.value, pi);
                                  }} className="inline-flex items-center gap-0.5 rounded-lg bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-700">
                                    <Plus className="h-3 w-3" /> Assign
                                  </button>
                                  <button
                                    type="button"
                                    aria-label="Unassign from Sheets"
                                    title="Unassign from Sheets"
                                    onClick={() => void unassignItemFromSheets(item.id)}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}

                            </td>
                          </tr>
                        );
                      })}</tbody>
                      </table>
                    </div>
                    </>
                    )}
                  </div>
                );
              })()}
              {sheetSubTab === "created" && (() => {
                const filtered = sheetsData.filter(s => s.status === "INCOMPLETE" || s.status === "COMPLETE").filter(s => !sheetSearch || s.sheetNo?.toLowerCase().includes(sheetSearch.toLowerCase()) || s.items.some(si => si.orderItem?.order?.orderNumber?.toLowerCase().includes(sheetSearch.toLowerCase()) || si.orderItem?.order?.customer?.businessName?.toLowerCase().includes(sheetSearch.toLowerCase())));
                if (filtered.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No sheets in this stage.</div>;
                return (
                  <div className="space-y-2">
                    {filtered.map(sheet => {
                      const isExp = expandedSheet === sheet.id;
                      const usedPct = sheet.areaSqInches > 0 ? Math.round((sheet.usedAreaSqInches / sheet.areaSqInches) * 100) : 0;
                      const svf = stageVendorForm[sheet.id] || { stage: "", vendorId: "", cost: "", description: "", vendorInvoiceNo: "" };
                      const createdLabel = sheet.createdBySource === "AUTO" ? getSheetCreatedLabel(sheet) : null;
                      return (
                        <div key={sheet.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-cyan-50 border-b border-cyan-100 cursor-pointer" onClick={() => { setExpandedSheet(isExp ? null : sheet.id); if (!isExp) loadPlaceableItems(sheet.gsm); }}>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-bold text-cyan-700 text-sm">Sheet No: {displaySheetNo(sheet.sheetNo)}</span>
                              {sheet.createdBySource === "AUTO" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">AUTO</span>}
                              <span className="text-slate-600 text-xs">
                                {sheet.gsm} GSM · {sheet.quality.replace(/_/g," ")} · {sheet.sizeInches}" · Qty {sheet.quantity}
                                {sheet.actualPrintedQuantity ? ` · Actual ${sheet.actualPrintedQuantity}` : ""}
                              </span>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${sheetPrintingClass(sheet.printing)}`}>{sheetPrintingLabel(sheet.printing)}</span>
                              {createdLabel && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                                  <Clock className="h-3 w-3" /> Created: {createdLabel}
                                </span>
                              )}
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sheetStatusColors[sheet.status]}`}>{sheet.status}</span>
                              <span className="text-xs text-slate-500">{usedPct}% used · {sheet.items.length} items</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {(sheet.status === "INCOMPLETE" || sheet.status === "COMPLETE" || sheet.status === "SETTING") && (
                                <button onClick={e => { e.stopPropagation(); openEditSheet(sheet); }} className="rounded-md border border-cyan-200 bg-white px-2 py-1 text-xs font-semibold text-cyan-700 hover:bg-cyan-50">
                                  {sheet.status === "SETTING" ? "Actual Qty" : "Edit"}
                                </button>
                              )}
                              {(sheet.status === "INCOMPLETE" || (sheet.createdBySource === "AUTO" && sheet.status === "COMPLETE")) && (
                                <button onClick={e => { e.stopPropagation(); void deleteSheet(sheet); }} className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50">
                                  Delete
                                </button>
                              )}
                              <select value={sheet.status} onClick={e => e.stopPropagation()} onChange={e => updateSheetStatus(sheet.id, e.target.value)} className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none border-transparent ${sheetStatusColors[sheet.status]}`}>
                                {getAllowedSheetStatuses(sheet.status).map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              {isExp ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                            </div>
                          </div>
                          {isExp && (
                            <div className="p-4 space-y-4">
                              <div>
                                <div className="flex justify-between text-xs text-slate-500 mb-1"><span>Space: {sheet.usedAreaSqInches.toFixed(1)} / {sheet.areaSqInches} sq in</span><span>{usedPct}%</span></div>
                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className={`h-full rounded-full ${usedPct > 90 ? "bg-red-500" : usedPct > 70 ? "bg-yellow-500" : "bg-cyan-500"}`} style={{ width: usedPct+"%" }} /></div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-2">Items on sheet</p>
                                {sheet.items.length === 0 ? <p className="text-xs text-slate-400">No items placed yet.</p> : (
                                  <div className="space-y-1.5">{sheet.items.map(si => (
                                    <div key={si.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                      <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                      <span className="text-slate-500">{si.orderItem.order.orderNumber} — {si.orderItem.order.customer.businessName}</span>
                                      <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-medium">{si.orderItem.product.sizeInches}"</span>
                                      <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-medium">{si.orderItem.product.gsm} GSM</span>
                                      <span className="text-cyan-700 font-semibold">x{si.multiple} · Qty {si.quantityOnSheet}</span>
                                      <button onClick={() => removeSheetItem(si.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                    </div>))}</div>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-2">Place items (GSM: {sheet.gsm})</p>
                                {loadingPlaceable ? <Loader2 className="h-4 w-4 animate-spin text-cyan-600" /> : placeableItems.length === 0 ? (
                                  <p className="text-xs text-slate-400">No unplaced items with {sheet.gsm} GSM.</p>
                                ) : (
                                  <div className="space-y-1.5">{placeableItems.map(pi => {
                                    const sz = (pi.openSizeInches || "0x0").replace(/\*/g,"x").split("x").map(Number);
                                    const itemArea = (sz[0]&&sz[1]) ? sz[0]*sz[1] : 0;
                                    const fitsByArea = itemArea > 0 ? Math.floor((sheet.areaSqInches-sheet.usedAreaSqInches)/itemArea) : 0;
                                    const alreadyAssigned = getAssignedQty(pi.id);
                                    const balanceQty = pi.quantity - alreadyAssigned;
                                    const maxMultiple = fitsByArea > 0 ? Math.min(fitsByArea, Math.ceil(balanceQty/sheet.quantity)) : 0;
                                    const canPlace = maxMultiple > 0 && balanceQty > 0 && sheet.quantity <= balanceQty;
                                    return (
                                      <div key={pi.id} className="flex items-center gap-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs">
                                        <span className="font-semibold text-slate-800">{pi.productName}</span>
                                        <span className="text-slate-500">{pi.orderNo} — {pi.customerName}</span>
                                        <span className="text-cyan-700 font-semibold">Balance: {balanceQty} · Max: {maxMultiple}x</span>
                                        <button onClick={() => openMultipleDialog(sheet.id, pi)} disabled={!canPlace || placingItem === pi.id}
                                          className="ml-auto inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50">
                                          {placingItem === pi.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Place
                                        </button>
                                      </div>);
                                  })}</div>
                                )}
                              </div>

                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {sheetSubTab === "processing" && (
                <div className="space-y-3">
                  <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                    <button onClick={() => setProcessingSubTab("printing")}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${processingSubTab === "printing" ? "bg-white shadow-sm text-blue-700 border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
                      Printing Sheets
                      <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${processingSubTab === "printing" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}`}>
                        {sheetsData.filter(s => s.status === "SETTING" || s.status === "PRINTING").filter(s => s.items.some(si => si.orderItem?.itemProductionStage !== "READY_FOR_DISPATCH")).length}
                      </span>
                    </button>
                    <button onClick={() => setProcessingSubTab("processing")}
                      className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${processingSubTab === "processing" ? "bg-white shadow-sm text-orange-700 border border-slate-200" : "text-slate-500 hover:text-slate-700"}`}>
                      Processing Orders
                      <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${processingSubTab === "processing" ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-500"}`}>
                        {sheetsData.filter(s => s.status === "PROCESSING" || s.status === "DONE").flatMap(s => s.items).filter(si => si.orderItem?.itemProductionStage !== "READY_FOR_DISPATCH").length}
                      </span>
                    </button>
                  </div>

                  {processingSubTab === "printing" && (() => {
                    const printSheets = sheetsData.filter(s => s.status === "SETTING" || s.status === "PRINTING").filter(s => !sheetSearch || s.sheetNo?.toLowerCase().includes(sheetSearch.toLowerCase()) || s.items.some(si => si.orderItem?.order?.orderNumber?.toLowerCase().includes(sheetSearch.toLowerCase()) || si.orderItem?.order?.customer?.businessName?.toLowerCase().includes(sheetSearch.toLowerCase())));
                    if (printSheets.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No sheets in printing stage.</div>;
                    return (
                      <div className="space-y-2">
                        {printSheets.map(sheet => {
                          const isExp = expandedSheet === sheet.id;
                          const createdLabel = sheet.createdBySource === "AUTO" ? getSheetCreatedLabel(sheet) : null;
                          return (
                            <div key={sheet.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100 cursor-pointer"
                                onClick={() => setExpandedSheet(isExp ? null : sheet.id)}>
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="font-bold text-blue-700 text-sm">Sheet No: {displaySheetNo(sheet.sheetNo)}</span>
                                  <span className="text-slate-600 text-xs">
                                    {sheet.gsm} GSM · {sheet.quality.replace(/_/g," ")} · {sheet.sizeInches}" · Qty {sheet.quantity}
                                    {sheet.actualPrintedQuantity ? ` · Actual ${sheet.actualPrintedQuantity}` : ""}
                                  </span>
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${sheetPrintingClass(sheet.printing)}`}>{sheetPrintingLabel(sheet.printing)}</span>
                                  {createdLabel && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                                      <Clock className="h-3 w-3" /> Created: {createdLabel}
                                    </span>
                                  )}
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sheetStatusColors[sheet.status] || "bg-gray-100 text-gray-600"}`}>{sheet.status}</span>
                                  <span className="text-xs text-slate-500">{sheet.items.length} items</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <select value={sheet.status} onClick={e => e.stopPropagation()} onChange={e => updateSheetStatus(sheet.id, e.target.value)}
                                    className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none border-transparent ${sheetStatusColors[sheet.status] || "bg-gray-100"}`}>
                                    {getAllowedSheetStatuses(sheet.status).map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  {isExp ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                                </div>
                              </div>
                              {isExp && (
                                <div className="p-4 space-y-3">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-600 mb-2">Items on sheet</p>
                                    <div className="space-y-1.5">{sheet.items.map(si => (
                                      <div key={si.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                        <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                        <span className="text-slate-500">{si.orderItem.order.orderNumber} — {si.orderItem.order.customer.businessName}</span>
                                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5">{si.orderItem.product.sizeInches}"</span>
                                        <span className="text-cyan-700 font-semibold">x{si.multiple} · Qty {si.quantityOnSheet}</span>
                                      </div>
                                    ))}</div>
                                  </div>
                                  {sheet.stageVendors.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-slate-600 mb-2">Stage Vendors</p>
                                      <div className="space-y-1">{sheet.stageVendors.map(sv => (
                                        <div key={sv.id} className="flex items-center gap-3 text-xs rounded-lg border border-slate-200 bg-white px-3 py-2">
                                          <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">{sv.stage.replace(/_/g," ")}</span>
                                          <span className="font-semibold">{sv.vendor.name}</span>
                                          {sv.description && <span className="text-slate-400">{sv.description}</span>}
                                          <span className="ml-auto font-bold text-cyan-700">{fmt(sv.cost)}</span>
                                        </div>
                                      ))}</div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {processingSubTab === "processing" && (() => {
                    const procSheets = sheetsData.filter(s => s.status === "PROCESSING" || s.status === "DONE");
                    // Filter out items already marked READY_FOR_DISPATCH using sheetOrderItems
                    const allItems = procSheets.flatMap(sheet => sheet.items.map(si => ({ ...si, sheet })))
                      .filter(si => si.orderItem?.itemProductionStage !== "READY_FOR_DISPATCH");
                    // Load saved vendors from sessionStorage (persists during session, not across refreshes)
                    // Use ordersData to get current stage
                    // Use orderItem.id as key (stable across loadAll refreshes)
                    const getItemVendor = (orderItemId: string) => processingItemVendors[orderItemId] || "";
                    const saveItemVendor = (orderItemId: string, vendorId: string) => {
                      setProcessingItemVendors(p => {
                        const updated = { ...p, [orderItemId]: vendorId };
                        try { sessionStorage.setItem("procVendors", JSON.stringify(updated)); } catch {}
                        return updated;
                      });
                    };
                    return (
                      <div className="space-y-3">
                        <div className="sticky top-12 z-20 flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <label className="text-xs font-semibold text-slate-600">Filter by Vendor:</label>
                          <select value={processingVendorFilter} onChange={e => setProcessingVendorFilter(e.target.value)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none bg-white">
                            <option value="">All Vendors</option>
                            {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                          {processingVendorFilter && <button onClick={() => setProcessingVendorFilter("")} className="text-xs text-slate-400 hover:text-slate-600">x Clear</button>}
                          <span className="text-xs text-slate-400 ml-2">{allItems.length} items pending</span>
                        </div>
                        {allItems.length === 0 ? (
                          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">All items are ready for dispatch.</div>
                        ) : (
                          <>
                          <div className="space-y-3 md:hidden">
                            {allItems.filter(si => !processingVendorFilter || getItemVendor(si.orderItem.id) === processingVendorFilter).map(si => (
                              <div key={si.id} className="overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
                                <div className="bg-orange-700 px-3 py-2 text-white">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-base font-bold">{si.orderItem.order.orderNumber}</p>
                                      <p className="text-xs text-orange-100">Sheet {si.sheet.sheetNo}</p>
                                    </div>
                                    {si.orderItem.order.orderDate && <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ageColor(si.orderItem.order.orderDate)}`}>{orderAge(si.orderItem.order.orderDate)}</span>}
                                  </div>
                                  <p className="mt-2 truncate text-sm font-semibold">{si.orderItem.order.customer.businessName}</p>
                                </div>
                                <div className="p-3">
                                  <p className="truncate font-bold text-slate-900">{si.orderItem.product.name}</p>
                                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-slate-500">
                                    <span className="rounded-full bg-slate-50 px-2 py-1">Size {si.orderItem.product.sizeInches}"</span>
                                    <span className="rounded-full bg-slate-50 px-2 py-1">Qty {si.quantityOnSheet}</span>
                                  </div>
                                  <div className="mt-2">
                                    <label className="mb-1 block text-xs font-bold text-slate-500">Processing Vendor</label>
                                    <select value={getItemVendor(si.orderItem.id)} onChange={e => saveItemVendor(si.orderItem.id, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none">
                                      <option value="">Select Vendor...</option>
                                      {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                  </div>
                                  <div className="mt-2">
                                    <label className="mb-1 block text-xs font-bold text-slate-500">Schedule Date</label>
                                    <input type="date" key={si.dueDate ?? "empty"} defaultValue={dateInputValue(si.dueDate)} onBlur={e => updateSheetItemDueDate(si.id, e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none" />
                                  </div>
                                  <button
                                    onClick={async () => {
                                      if (!confirm("Mark this item as Ready for Dispatch?")) return;
                                      try {
                                        const res = await fetch(API_BASE_URL + "/production/items/" + si.orderItem.id + "/stage", {
                                          method: "PATCH",
                                          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                          body: JSON.stringify({ stage: "READY_FOR_DISPATCH" }),
                                        });
                                        if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
                                        await loadAll(true);
                                      } catch { alert("Network error"); }
                                    }}
                                    className="mt-2 w-full rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white">
                                    Mark Ready
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="hidden rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto md:block">
                            <table className="w-full min-w-[1180px] table-fixed text-xs">
                              <colgroup>
                                <col className="w-[10%]" />
                                <col className="w-[5%]" />
                                <col className="w-[5%]" />
                                <col className="w-[24%]" />
                                <col className="w-[11%]" />
                                <col className="w-[13%]" />
                                <col className="w-[5%]" />
                                <col className="w-[5%]" />
                                <col className="w-[14%]" />
                                <col className="w-[8%]" />
                                <col className="w-[8%]" />
                              </colgroup>
                              <thead><tr className="border-b border-slate-100 bg-slate-50">
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Sheet No</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Age</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Agent</th>
                         <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                         <th className="px-3 py-2 text-left font-semibold text-slate-600">Size</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Processing Vendor</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Schedule</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
                              </tr></thead>
                              <tbody>
                                {allItems.filter(si => !processingVendorFilter || getItemVendor(si.orderItem.id) === processingVendorFilter).map(si => (
                                  <tr key={si.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="px-3 py-2 font-bold text-cyan-700 whitespace-nowrap">{displaySheetNo(si.sheet.sheetNo)}</td>
                                    <td className="px-3 py-2 font-bold text-blue-700">{si.orderItem.order.orderNumber}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{si.orderItem.order.orderDate ? <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(si.orderItem.order.orderDate)}`}>{orderAge(si.orderItem.order.orderDate)}</span> : <span className="text-slate-300">—</span>}</td>
                                    <td className="px-3 py-2 text-slate-700">{si.orderItem.order.customer.businessName}</td>
                                    <td className="px-3 py-2 text-slate-600">{si.orderItem.order.salesAgent?.fullName ? <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">{si.orderItem.order.salesAgent.fullName}</span> : <span className="text-slate-300">—</span>}</td>
                                    <td className="px-3 py-2 font-semibold text-slate-800">{si.orderItem.product.name}</td>
                                    <td className="px-3 py-2 text-slate-500">{si.orderItem.product.sizeInches}"</td>
                                    <td className="px-3 py-2 font-semibold">{si.quantityOnSheet}</td>
                                    <td className="px-3 py-2">
                                      <select value={getItemVendor(si.orderItem.id)}
                                        onChange={e => saveItemVendor(si.orderItem.id, e.target.value)}
                                        className="rounded-md border border-slate-200 px-1.5 py-1 text-xs outline-none bg-white">
                                        <option value="">Select Vendor...</option>
                                        {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2">
                                      <input type="date" key={si.dueDate ?? "empty"} defaultValue={dateInputValue(si.dueDate)} onBlur={e => updateSheetItemDueDate(si.id, e.target.value)}
                                        className="w-32 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold outline-none" />
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={async () => {
                                          if (!confirm("Mark this item as Ready for Dispatch?")) return;
                                          try {
                                            const res = await fetch(API_BASE_URL + "/production/items/" + si.orderItem.id + "/stage", {
                                              method: "PATCH",
                                              headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                              body: JSON.stringify({ stage: "READY_FOR_DISPATCH" }),
                                            });
                                            if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
                                            await loadAll(true);
                                          } catch { alert("Network error"); }
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
                                        Ready
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── HISTORY SUB-TAB ── */}
              {sheetSubTab === "history" && (
                <div className="space-y-3">
                  {sheetHistoryLoading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400 text-sm gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading history…
                    </div>
                  ) : sheetHistory.logs.length === 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No sheet history found.</div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Sheet No</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">GSM · Size · Qty</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Items</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Sent To Printing By</th>
                              <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Date &amp; Time</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sheetHistory.logs.map((log: any) => {
                              const meta = log.metadata as any || {};
                              return (
                                <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                  <td className="px-4 py-2.5 font-bold text-blue-700">{meta.sheetNo || "–"}</td>
                                  <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                                    {meta.sheetGsm ? `${meta.sheetGsm} GSM` : "–"}
                                    {meta.sheetSize ? ` · ${meta.sheetSize}"` : ""}
                                    {meta.sheetQuantity ? ` · Qty ${meta.sheetQuantity}` : ""}
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500">{(log as any)._itemCount || 1}</td>
                                  <td className="px-4 py-2.5 text-slate-600">{log.changedBy?.fullName || "System"}</td>
                                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                                    {new Date(log.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {sheetHistory.total > 50 && (
                        <div className="flex items-center justify-between px-1 text-xs text-slate-500">
                          <span>{sheetHistory.total} total entries</span>
                          <div className="flex gap-2">
                            {sheetHistory.page > 1 && (
                              <button onClick={() => loadSheetHistory(sheetHistorySearch, sheetHistory.page - 1)}
                                className="rounded-md border border-slate-200 px-3 py-1 hover:bg-slate-50">← Prev</button>
                            )}
                            <span className="px-2 py-1">Page {sheetHistory.page}</span>
                            {sheetHistory.page * 50 < sheetHistory.total && (
                              <button onClick={() => loadSheetHistory(sheetHistorySearch, sheetHistory.page + 1)}
                                className="rounded-md border border-slate-200 px-3 py-1 hover:bg-slate-50">Next →</button>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          </div>

        </div>
      </DashboardShell>

      {/* ── Send to Vendor Dialog ── */}
      {sendDialog && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"26rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Send to Vendor</h2>
                <p className="text-xs text-slate-500 mt-0.5">{sendDialog.orderNo} — {sendDialog.productName}</p>
              </div>
              <button onClick={() => setSendDialog(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Vendor <span className="text-red-500">*</span></label>
                <select value={sendVendorId} onChange={e => setSendVendorId(e.target.value)} style={IS.input}>
                  <option value="">Select vendor...</option>
                  {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Description <span className="text-slate-400 font-normal">(optional)</span></label>
                <input value={sendDesc} onChange={e => setSendDesc(e.target.value)} placeholder="e.g. Lamination, Die cut" style={IS.input} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Schedule Date <span className="text-slate-400 font-normal">(CEO report)</span></label>
                <input type="date" value={sendDueDate} onChange={e => setSendDueDate(e.target.value)} style={IS.input} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setSendDialog(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={sendToVendor} disabled={sendingSend || !sendVendorId}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60">
                {sendingSend ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Receive from Vendor Dialog ── */}
      {receiveDialog && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"26rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Mark as Received</h2>
                <p className="text-xs text-slate-500 mt-0.5">{receiveDialog.productName} — {receiveDialog.vendorName}</p>
              </div>
              <button onClick={() => setReceiveDialog(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Cost (₹) <span className="text-red-500">*</span></label>
                <input type="number" value={receiveCost} onChange={e => setReceiveCost(e.target.value)} placeholder="Enter amount paid to vendor" style={IS.input} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice No <span className="text-red-500">*</span></label>
                <input value={receiveInvNo} onChange={e => setReceiveInvNo(e.target.value)} placeholder="Vendor invoice number" style={IS.input} />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReceiveDialog(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={receiveFromVendor} disabled={savingReceive || !receiveCost || !receiveInvNo}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60">
                {savingReceive ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirm Received ✓
              </button>
            </div>
          </div>
        </div>
      )}

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
                const { size, gsm, sides } = parseNotes(item.productionNotes);
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

      {/* Setting Dialog */}
      {settingDialog && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"32rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Sheet Setting Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">{settingDialog.sheetNo} — Fill plate and printing vendor info</p>
              </div>
              <button onClick={() => setSettingDialog(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 mb-3">
              <p className="text-xs font-bold text-slate-700 mb-2">Plate Making</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                  <select value={settingForm.plateVendorId} onChange={e => setSettingForm(p => ({ ...p, plateVendorId: e.target.value }))} style={IS.input}>
                    <option value="">Select vendor...</option>{vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select></div>
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Description</label>
                  <input value={settingForm.plateDesc} onChange={e => setSettingForm(p => ({ ...p, plateDesc: e.target.value }))} placeholder="Optional" style={IS.input} /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Rate (Rs) *</label>
                  <input type="number" value={settingForm.plateRate} onChange={e => setSettingForm(p => ({ ...p, plateRate: e.target.value, plateAmount: "" }))} placeholder="0.00" style={IS.input} /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Quantity *</label>
                  <input type="number" value={settingForm.plateQty} onChange={e => setSettingForm(p => {
                    const qty = Number(e.target.value);
                    const amount = Number(p.plateAmount);
                    return { ...p, plateQty: e.target.value, plateRate: amount > 0 && qty > 0 ? String(amount / qty) : p.plateRate };
                  })} placeholder="0" style={IS.input} /></div>
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Direct Amount (Rs)</label>
                  <input type="number" value={settingForm.plateAmount} onChange={e => setSettingForm(p => {
                    const amount = Number(e.target.value);
                    const qty = Number(p.plateQty);
                    return { ...p, plateAmount: e.target.value, plateRate: amount > 0 && qty > 0 ? String(amount / qty) : p.plateRate };
                  })} placeholder="Enter total amount directly" style={IS.input} /></div>
                {settingForm.plateRate && settingForm.plateQty && (
                  <div className="col-span-2 text-right text-xs font-bold text-cyan-700">Total: {fmt(Number(settingForm.plateRate) * Number(settingForm.plateQty))}</div>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 mb-4">
              <p className="text-xs font-bold text-slate-700 mb-2">Printing</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                  <select value={settingForm.printVendorId} onChange={e => setSettingForm(p => ({ ...p, printVendorId: e.target.value }))} style={IS.input}>
                    <option value="">Select vendor...</option>{vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select></div>
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Description</label>
                  <input value={settingForm.printDesc} onChange={e => setSettingForm(p => ({ ...p, printDesc: e.target.value }))} placeholder="Optional" style={IS.input} /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Rate (Rs) *</label>
                  <input type="number" value={settingForm.printRate} onChange={e => setSettingForm(p => ({ ...p, printRate: e.target.value, printAmount: "" }))} placeholder="0.00" style={IS.input} /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Quantity *</label>
                  <input type="number" value={settingForm.printQty} onChange={e => setSettingForm(p => {
                    const qty = Number(e.target.value);
                    const amount = Number(p.printAmount);
                    return { ...p, printQty: e.target.value, printRate: amount > 0 && qty > 0 ? String(amount / qty) : p.printRate };
                  })} placeholder="0" style={IS.input} /></div>
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Direct Amount (Rs)</label>
                  <input type="number" value={settingForm.printAmount} onChange={e => setSettingForm(p => {
                    const amount = Number(e.target.value);
                    const qty = Number(p.printQty);
                    return { ...p, printAmount: e.target.value, printRate: amount > 0 && qty > 0 ? String(amount / qty) : p.printRate };
                  })} placeholder="Enter total amount directly" style={IS.input} /></div>
                {settingForm.printRate && settingForm.printQty && (
                  <div className="col-span-2 text-right text-xs font-bold text-cyan-700">Total: {fmt(Number(settingForm.printRate) * Number(settingForm.printQty))}</div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSettingDialog(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitSettingDialog} disabled={savingSetting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {savingSetting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit and Move to Printing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sheet Multiple Dialog ── */}
      {multipleDialog && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"26rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Place on Sheet</h2>
                <p className="text-xs text-slate-500 mt-0.5">{multipleDialog.item.productName} · {multipleDialog.sheetNo}</p>
              </div>
              <button onClick={() => setMultipleDialog(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            {(() => {
              const alreadyAssigned = getAssignedQty(multipleDialog.item.id);
              const balanceQty = multipleDialog.item.quantity - alreadyAssigned;
              const val = parseInt(multipleValue) || 0;
              const willPrint = Math.min(val * multipleDialog.sheetQty, balanceQty);
              const remainingAfter = balanceQty - willPrint;
              return (
                <div className="space-y-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Order Qty</span><span className="font-semibold text-slate-800">{multipleDialog.item.quantity}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Already Assigned</span><span className="font-semibold text-orange-600">{alreadyAssigned}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Balance Qty</span><span className="font-semibold text-cyan-700">{balanceQty}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Sheet Qty</span><span className="font-semibold">{multipleDialog.sheetQty}</span></div>
                    <div className="border-t border-slate-200 pt-1 flex justify-between"><span className="text-slate-500">Will Print</span><span className="font-bold text-green-700">{willPrint}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Remaining After</span><span className={`font-bold ${remainingAfter > 0 ? "text-orange-500" : "text-green-600"}`}>{remainingAfter}</span></div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Multiple (×) <span className="text-red-500">*</span>
                      <span className="text-slate-400 font-normal ml-1">Max: {multipleDialog.maxMultiple}×</span>
                    </label>
                    <input type="number" min={1} max={multipleDialog.maxMultiple} value={multipleValue}
                      onChange={e => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v)) setMultipleValue(String(Math.min(Math.max(1, v), multipleDialog.maxMultiple)));
                        else setMultipleValue(e.target.value);
                      }}
                      style={{ width:"100%",borderRadius:"6px",border:"1px solid #e2e8f0",padding:"8px 10px",fontSize:"14px",boxSizing:"border-box" as const }} />
                    <p className="text-xs text-slate-400 mt-1">Suggested: {multipleDialog.suggestedMultiple}× (fills balance exactly)</p>
                  </div>
                  {val > multipleDialog.maxMultiple && (
                    <p className="text-xs text-red-600 font-semibold">Exceeds max allowed ({multipleDialog.maxMultiple}×)</p>
                  )}
                </div>
              );
            })()}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setMultipleDialog(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmPlaceWithMultiple} disabled={!!placingItem}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
                {placingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Place on Sheet
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
                <label className="block text-xs font-medium text-slate-700 mb-1">Actual Printed Qty</label>
                <input type="number" value={sheetForm.actualPrintedQuantity} onChange={e => setSheetForm(p => ({ ...p, actualPrintedQuantity: e.target.value }))} placeholder="Optional" style={IS.input} />
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

      {/* ── Edit Sheet Modal ── */}
      {editSheetModal && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"32rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Edit Sheet</h2>
                <p className="text-xs text-slate-500 mt-0.5">Only incomplete sheets can be edited.</p>
              </div>
              <button onClick={() => setEditSheetModal(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Sheet Number *</label>
                <input disabled={editSheetModal.status === "SETTING"} value={editSheetForm.sheetNo} onChange={e => setEditSheetForm(p => ({ ...p, sheetNo: e.target.value }))} placeholder="SHT-2026-001" style={IS.input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">GSM *</label>
                <input disabled={editSheetModal.status === "SETTING"} type="number" value={editSheetForm.gsm} onChange={e => setEditSheetForm(p => ({ ...p, gsm: e.target.value }))} style={IS.input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quality *</label>
                <select disabled={editSheetModal.status === "SETTING"} value={editSheetForm.quality} onChange={e => setEditSheetForm(p => ({ ...p, quality: e.target.value }))} style={IS.input}>
                  {SHEET_QUALITIES.map(q => <option key={q} value={q}>{q.replace(/_/g, " ")}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Quantity *</label>
                <input disabled={editSheetModal.status === "SETTING"} type="number" value={editSheetForm.quantity} onChange={e => setEditSheetForm(p => ({ ...p, quantity: e.target.value }))} style={IS.input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Actual Printed Qty</label>
                <input type="number" value={editSheetForm.actualPrintedQuantity} onChange={e => setEditSheetForm(p => ({ ...p, actualPrintedQuantity: e.target.value }))} placeholder="Blank = planned qty" style={IS.input} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Size (WxH inches) *</label>
                <input disabled={editSheetModal.status === "SETTING"} value={editSheetForm.sizeInches} onChange={e => setEditSheetForm(p => ({ ...p, sizeInches: e.target.value }))} placeholder="e.g. 18x23" style={IS.input} />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-700 mb-1">Printing</label>
                <select disabled={editSheetModal.status === "SETTING"} value={editSheetForm.printing} onChange={e => setEditSheetForm(p => ({ ...p, printing: e.target.value }))} style={IS.input}>
                  <option value="SINGLE_SIDE">Single Side</option>
                  <option value="DOUBLE_SIDE">Double Side</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditSheetModal(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={updateSheet} disabled={savingEditSheet}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
                {savingEditSheet ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}




































