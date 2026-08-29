"use client";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { PoliciesWidget } from "@/components/PoliciesWidget";
import { MobileSelect } from "@/components/MobileSelect";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Package, Truck, CheckSquare, Square, Search, X, History, MapPin, Building2, Plus, Trash2, Boxes, PackageCheck, IndianRupee, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

// size/gsm/sides come pre-resolved from the backend (parseProductionNotes in
// dispatch.service.ts) -- it already falls back to the linked Product's own
// sizeInches/gsm/sides when an item's free-text productionNotes doesn't have
// one, so use these directly instead of re-parsing productionNotes here.
type ReadyItem = { id: string; productName: string; sku: string; quantity: number; productionNotes?: string; weightKg: number; size?: string | null; gsm?: string | null; sides?: string | null; };
type Warehouse = { id: string; name: string; pincode: string; location: string; address?: string; city?: string; state?: string; source?: string };

type ShipmentHistory = {
  id: string; shipmentNumber: string; carrierName: string | null;
  trackingNumber: string | null; dispatchType: string | null;
  transportName: string | null; lrNumber: string | null; awbNumber: string | null;
  status: string; amount: number | null; isCod: boolean; codAmount: number | null;
  dispatchDate: string; orderId: string; orderNo: string;
  customerName: string; customerPhone: string | null;
  shippingAddress: string | null; salesAgentName: string | null; notes: string | null;
  bigshipOrderId: string | null; bigshipStatus: string | null; bigshipSyncedAt: string | null;
};

type DeliveredReportCandidate = {
  shipmentId: string; orderId: string; orderNo: string;
  customerName: string; customerPhone: string | null;
  shipmentStatus: string; awbNumber: string | null;
};
type DeliveredReportRow = {
  rowNumber: number; awb: string; channelOrderId: string | null;
  receiverName: string | null; receiverMobile: string | null;
  orderDate: string | null; courierName: string | null; productDetails: string | null;
  matchStatus: "MATCHED" | "AMBIGUOUS" | "UNMATCHED";
  matchMethod: string | null; phoneMismatch: boolean;
  matched: DeliveredReportCandidate | null;
  candidates: DeliveredReportCandidate[];
};
type CourierChargeRow = {
  shipmentId: string; orderId: string; orderNo: string;
  customerName: string; salesAgentName: string | null;
  dispatchDate: string; dispatchType: string | null;
  awbNumber: string | null; carrierName: string | null;
  courierOrderStatus: string | null;
  parcelStatus: string | null;
  actual: number | null; taken: number | null; net: number | null;
  hasReportData: boolean;
};
type CourierChargeTotals = { actual: number; taken: number; net: number };
type DeliveredReportPreview = {
  totalRows: number; matched: number; ambiguous: number; unmatched: number;
  rows: DeliveredReportRow[];
};

type DispatchOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; salesAgentName?: string;
  shipTo: string; weightKg: number; orderDate: string;
  customerId: string; customerShippingAddress: string | null;
  customerCity: string | null; customerState: string | null; customerPincode: string | null;
  totalItems: number; readyItems: ReadyItem[];
  dispatchType?: DispatchMethod;
  paymentType?: "COD" | "PREPAID";
  isCod: boolean; codAmount: number | null;
  isSample?: boolean; samplePaymentType?: string | null;
  latestShipment: { awbNumber: string | null; carrierName: string | null; trackingNumber: string | null; notes: string | null } | null;
};

type RateQuote = { rateId: string; carrierName: string; amount: number; currency: string; estimatedDays: number; };
type DispatchMethod = "COURIER" | "TRANSPORT" | "BY_HAND" | "SELF_COLLECTED";
type TransportForm = { transportName: string; lrNumber: string; transportChargesType: "TOPAY" | "PREPAID"; transportBy: string; totalTransportCharges: string; notes: string };
type DirectForm = { deliveryBoyName: string; collectedByName: string; collectedByPhone: string; otp: string };
type PackageBoxForm = { noOfBoxes: string; length: string; breadth: string; height: string; weight: string };

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
function pickupAddressText(warehouse?: Warehouse) {
  if (!warehouse) return "";
  return [warehouse.address, warehouse.city, warehouse.state]
    .map(part => part?.trim())
    .filter(Boolean)
    .join(", ");
}
function defaultPackageBox(weightKg: number): PackageBoxForm {
  return { noOfBoxes: "1", length: "20", breadth: "15", height: "10", weight: Math.max(0.1, weightKg).toFixed(2) };
}

function sanitizePackageBoxes(rows: PackageBoxForm[]) {
  return rows
    .map(row => ({
      noOfBoxes: Math.max(1, Math.floor(Number(row.noOfBoxes) || 1)),
      length: Number(row.length),
      breadth: Number(row.breadth),
      height: Number(row.height),
      weight: Number(row.weight),
    }))
    .filter(row =>
      Number.isFinite(row.length) && row.length > 0 &&
      Number.isFinite(row.breadth) && row.breadth > 0 &&
      Number.isFinite(row.height) && row.height > 0 &&
      Number.isFinite(row.weight) && row.weight > 0
    );
}

function packageTotalWeight(rows: PackageBoxForm[]) {
  return sanitizePackageBoxes(rows).reduce((sum, row) => sum + row.noOfBoxes * row.weight, 0);
}

function orderAge(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return days + ' days';
}
function ageColor(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 3) return 'bg-green-50 text-green-700';
  if (days <= 7) return 'bg-yellow-50 text-yellow-700';
  return 'bg-red-50 text-red-700';
}

export default function DispatchPage() {
  const router = useRouter();
  const isNativeApp = useIsNativeApp();
  const [historyCompact, setHistoryCompact] = useState(true);
  const [tab, setTab] = useState<"queue" | "history" | "delivered" | "courier_charges">("queue");
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [markModal, setMarkModal] = useState<{ orderId: string; orderNo: string; isCod: boolean } | null>(null);
  const [markForm, setMarkForm] = useState({ awbNumber: "", carrierName: "", notes: "", codAmount: "" });
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, Set<string>>>({});
  const [rates, setRates] = useState<Record<string, RateQuote[]>>({});
  const [ratesLoading, setRatesLoading] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState<Record<string, string>>({});
  // Per-shipment carrier override for "Fetch Rates" -- empty string means
  // "use the Settings > Carrier Config default", unchanged from before this
  // was added. Sanket asked for a dropdown here specifically (not a global
  // switch) so Bigship/Fship/Shiprocket can be picked per booking.
  const [selectedCarrier, setSelectedCarrier] = useState<Record<string, string>>({});
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<Record<string, File | null>>({});
  const [search, setSearch] = useState("");
  const [courierFilter, setCourierFilter] = useState("ALL");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Record<string, string>>({});
  const [customPickup, setCustomPickup] = useState<Record<string, { name: string; pincode: string }>>({});
  const [weightOverride, setWeightOverride] = useState<Record<string, string>>({});
  const [multiBoxEnabled, setMultiBoxEnabled] = useState<Record<string, boolean>>({});
  const [packageBoxes, setPackageBoxes] = useState<Record<string, PackageBoxForm[]>>({});
  // "Ship to a different address" for just this booking's selected item(s) —
  // for when separate items on the same order need to go to different
  // delivery addresses (different branches/offices of the same customer).
  // Typed fresh per booking, not saved back to the customer/order.
  const [addressOverrideEnabled, setAddressOverrideEnabled] = useState<Record<string, boolean>>({});
  const [addressOverrideForm, setAddressOverrideForm] = useState<Record<string, {
    receiverName: string; receiverPhone: string; address: string; city: string; state: string; pincode: string;
  }>>({});
  // "Edit address" — fixes the customer's actual stored address/pincode
  // (Customer.shippingAddress/city/state/pincode) before dispatching, since
  // that's genuinely wrong data, not a one-off delivery elsewhere. Different
  // from "Ship to a different address" above: this persists to the customer
  // record and affects every future order for them, not just this shipment.
  const [editAddressOpenId, setEditAddressOpenId] = useState<string | null>(null);
  const [editAddressForm, setEditAddressForm] = useState<Record<string, {
    shippingAddress: string; city: string; state: string; pincode: string;
  }>>({});
  const [savingAddressId, setSavingAddressId] = useState<string | null>(null);
  const [dispatchMethod, setDispatchMethod] = useState<Record<string, DispatchMethod>>({});
  const [transportForm, setTransportForm] = useState<Record<string, TransportForm>>({});
  const [directForm, setDirectForm] = useState<Record<string, DirectForm>>({});
  const [history, setHistory] = useState<ShipmentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [returningId, setReturningId] = useState<string | null>(null);
  const [markingDeliveredId, setMarkingDeliveredId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const [settingAwbId, setSettingAwbId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  // ── Bigship "Delivered Orders Report" bulk import ────────────────────────
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportUploading, setReportUploading] = useState(false);
  const [reportPreview, setReportPreview] = useState<DeliveredReportPreview | null>(null);
  const [reportChecked, setReportChecked] = useState<Record<number, boolean>>({});
  const [reportPicks, setReportPicks] = useState<Record<number, string>>({});
  const [reportConfirming, setReportConfirming] = useState(false);
  const reportFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleReportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file later
    if (!file) return;
    setReportUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const headers = getAuthHeaders() as Record<string, string>;
      delete headers["Content-Type"]; // let the browser set the multipart boundary
      const res = await fetch(`${API_BASE_URL}/dispatch/delivered-report/preview`, {
        method: "POST", headers, body: formData,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Could not read this file");
      const preview: DeliveredReportPreview = body;
      setReportPreview(preview);
      // Pre-check every confidently MATCHED row; ambiguous/unmatched rows start
      // unchecked until the admin picks a candidate or decides to skip them.
      const checked: Record<number, boolean> = {};
      for (const row of preview.rows) checked[row.rowNumber] = row.matchStatus === "MATCHED";
      setReportChecked(checked);
      setReportPicks({});
      setReportModalOpen(true);
    } catch (err) {
      alert("Failed to read report: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReportUploading(false);
    }
  };

  const confirmDeliveredReport = async () => {
    if (!reportPreview) return;
    const shipmentIds: string[] = [];
    for (const row of reportPreview.rows) {
      if (!reportChecked[row.rowNumber]) continue;
      if (row.matched) shipmentIds.push(row.matched.shipmentId);
      else if (reportPicks[row.rowNumber]) shipmentIds.push(reportPicks[row.rowNumber]);
    }
    if (shipmentIds.length === 0) { alert("No rows selected."); return; }
    if (!confirm(`Mark ${shipmentIds.length} shipment${shipmentIds.length === 1 ? "" : "s"} as delivered and send each customer the feedback WhatsApp message?`)) return;
    setReportConfirming(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/delivered-report/confirm`, {
        method: "POST", headers: getAuthHeaders(),
        body: JSON.stringify({ shipmentIds }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Failed");
      await loadHistory(historySearch);
      setReportModalOpen(false);
      setReportPreview(null);
      alert(`Done — ${body.succeeded}/${body.total} marked delivered.${body.failed?.length ? ` ${body.failed.length} failed (already delivered or removed since upload).` : ""}`);
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setReportConfirming(false);
    }
  };

  const syncAllBigship = async () => {
    setSyncingAll(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/shipments/sync-bigship-all`, {
        method: "POST", headers: getAuthHeaders(),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.message || "Failed");
      await loadHistory(historySearch);
      alert(`Synced ${b.synced}/${b.total} Bigship shipment${b.total === 1 ? "" : "s"}${b.failed ? ` — ${b.failed} could not be synced (check they're actually shipped in Bigship)` : ""}.`);
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSyncingAll(false);
    }
  };

  // ── Courier Charges (Dispatch > Courier Charges) ──────────────────────────
  // Keeps courier/shipping money entirely separate from the order's own
  // balance — Bigship's COD remittance sometimes bundles freight into
  // "collected", which used to inflate the customer's paid amount and get
  // wrongly adjusted against their next order. Actual cost is auto-fetched
  // from the uploaded monthly Shipping Charges report (matched by AWB);
  // "Taken from customer" is entered by hand here and never touches
  // Order.grandTotal/payments.
  const [courierCharges, setCourierCharges] = useState<CourierChargeRow[]>([]);
  const [courierChargesTotals, setCourierChargesTotals] = useState<CourierChargeTotals>({ actual: 0, taken: 0, net: 0 });
  const [courierChargesLoading, setCourierChargesLoading] = useState(false);
  const [courierChargesMonth, setCourierChargesMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [courierReportUploading, setCourierReportUploading] = useState(false);
  const [savingTakenId, setSavingTakenId] = useState<string | null>(null);
  const [takenDrafts, setTakenDrafts] = useState<Record<string, string>>({});
  const courierReportFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const loadCourierCharges = useCallback(async () => {
    setCourierChargesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/courier-charges?month=${courierChargesMonth}`, { headers: getAuthHeaders() });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Failed to load");
      setCourierCharges(body.rows ?? []);
      setCourierChargesTotals(body.totals ?? { actual: 0, taken: 0, net: 0 });
      setTakenDrafts({});
    } catch (err) {
      console.error(err);
    } finally {
      setCourierChargesLoading(false);
    }
  }, [courierChargesMonth]);

  useEffect(() => { if (tab === "courier_charges") void loadCourierCharges(); }, [tab, loadCourierCharges]);

  const handleCourierReportFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setCourierReportUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const headers = getAuthHeaders() as Record<string, string>;
      delete headers["Content-Type"];
      const res = await fetch(`${API_BASE_URL}/dispatch/courier-charges/import`, { method: "POST", headers, body: formData });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Could not read this file");
      alert(`Shipping Charges report imported — ${body.rowsProcessed} row(s) matched by AWB.`);
      await loadCourierCharges();
    } catch (err) {
      alert("Failed to import report: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCourierReportUploading(false);
    }
  };

  const saveTakenAmount = async (shipmentId: string, rawValue: string) => {
    const amount = Number(rawValue);
    if (rawValue.trim() === "" || Number.isNaN(amount) || amount < 0) {
      alert("Enter a valid, non-negative amount.");
      return;
    }
    setSavingTakenId(shipmentId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/courier-charges/${shipmentId}/collected`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || "Failed to save");
      await loadCourierCharges();
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingTakenId(null);
    }
  };

  const setManualAwb = async (shipmentId: string, currentAwb: string | null) => {
    const awb = window.prompt("Enter the real AWB / tracking number from the courier:", currentAwb ?? "");
    if (awb === null) return;
    const trimmed = awb.trim();
    if (!trimmed) return;
    setSettingAwbId(shipmentId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/shipments/${shipmentId}/awb`, {
        method: "POST", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ awbNumber: trimmed }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.message || "Failed");
      await loadHistory(historySearch);
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSettingAwbId(null);
    }
  };

  const syncBigship = async (shipmentId: string) => {
    setSyncingId(shipmentId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/shipments/${shipmentId}/sync-bigship`, {
        method: "POST", headers: getAuthHeaders(),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(b.message || "Failed");
      await loadHistory(historySearch);
      if (b.success) {
        alert(`Synced from Bigship — AWB: ${b.awbNumber || "not yet assigned"}, Status: ${b.status || "unknown"}`);
      } else {
        alert("Could not sync: " + (b.message || "unknown error"));
      }
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSyncingId(null);
    }
  };

  const markDelivered = async (shipmentId: string) => {
    if (!confirm("Mark this shipment as delivered? This sends the customer a WhatsApp message asking for a Google rating, review, and testimonial.")) return;
    setMarkingDeliveredId(shipmentId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/shipments/${shipmentId}/mark-delivered`, {
        method: "POST", headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadHistory(historySearch);
      alert("Marked delivered — review request sent to the customer.");
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setMarkingDeliveredId(null);
    }
  };

  const returnToQueue = async (orderId: string) => {
    if (!confirm("Return this order to the dispatch queue?")) return;
    setReturningId(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/return-to-queue/${orderId}`, {
        method: "POST", headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error(await res.text());
      await loadHistory(historySearch);
      await load();
      alert("Order returned to queue.");
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setReturningId(null);
    }
  };

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/orders`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { setError("Could not load dispatch queue"); return; }
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
      const initMethods: Record<string, DispatchMethod> = {};
      const initSelected: Record<string, Set<string>> = {};
      for (const o of data) {
        initSelected[o.id] = new Set(o.readyItems.map((i: ReadyItem) => i.id));
        initMethods[o.id] = o.dispatchType || "COURIER";
      }
      setSelectedItems(initSelected);
      setDispatchMethod(prev => ({ ...initMethods, ...prev }));
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, [router]);

  const openEditAddress = (o: DispatchOrder) => {
    setEditAddressForm(prev => ({
      ...prev,
      [o.id]: {
        shippingAddress: o.customerShippingAddress ?? o.shipTo ?? "",
        city: o.customerCity ?? "",
        state: o.customerState ?? "",
        pincode: o.customerPincode ?? "",
      },
    }));
    setEditAddressOpenId(o.id);
  };

  const saveEditAddress = async (o: DispatchOrder) => {
    const form = editAddressForm[o.id];
    if (!form) return;
    if (form.pincode && !/^\d{6}$/.test(form.pincode.trim())) {
      alert("Pincode must be 6 digits");
      return;
    }
    setSavingAddressId(o.id);
    try {
      const res = await fetch(`${API_BASE_URL}/customer-directory/${o.customerId}/address`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || "Failed to update address");
      }
      setEditAddressOpenId(null);
      await load();
    } catch (e) {
      alert("Failed: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSavingAddressId(null);
    }
  };

  // With no search term this is still just the 100 most recently created
  // shipments (same as before). With a search term, it hits the backend's
  // `search` param instead, which queries the full table (not capped to
  // "recent") across order#, customer name/phone, carrier, and
  // tracking/AWB/shipment number -- so a shipment that's aged out of the
  // "last 100" view (like an old one from months back) is still findable.
  const loadHistory = useCallback(async (search?: string) => {
    setHistoryLoading(true);
    try {
      const q = search?.trim();
      const url = `${API_BASE_URL}/dispatch/history?limit=100${q ? `&search=${encodeURIComponent(q)}` : ""}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      if (res.ok) setHistory(await res.json());
    } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Debounced so typing doesn't fire a request per keystroke; tab switches
  // (historySearch usually empty then) load essentially immediately.
  useEffect(() => {
    if (tab !== "history" && tab !== "delivered") return;
    const t = setTimeout(() => { void loadHistory(historySearch); }, historySearch ? 350 : 0);
    return () => clearTimeout(t);
  }, [tab, historySearch, loadHistory]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/dispatch/warehouses`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Warehouse[]) => {
        if (Array.isArray(data) && data.length > 0) {
          // Put RAZA ENVELOP FACTORY 3 first as default pickup location
          const sorted = [...data].sort((a, b) => {
            const aIsRaza = a.name.toUpperCase().includes("RAZA") ? -1 : 0;
            const bIsRaza = b.name.toUpperCase().includes("RAZA") ? -1 : 0;
            return aIsRaza - bIsRaza;
          });
          setWarehouses(sorted);
        }
      })
      .catch(() => {});
  }, []);

  function toggleItem(orderId: string, itemId: string) {
    setSelectedItems(prev => {
      const set = new Set(prev[orderId] ?? []);
      if (set.has(itemId)) set.delete(itemId); else set.add(itemId);
      return { ...prev, [orderId]: set };
    });
  }

  function toggleAll(orderId: string, items: ReadyItem[]) {
    setSelectedItems(prev => {
      const set = prev[orderId] ?? new Set();
      const allSelected = items.every(i => set.has(i.id));
      return { ...prev, [orderId]: allSelected ? new Set() : new Set(items.map(i => i.id)) };
    });
  }

  function getPackageRows(orderId: string, weightKg: number) {
    return packageBoxes[orderId]?.length ? packageBoxes[orderId] : [defaultPackageBox(weightKg)];
  }

  function updatePackageRow(orderId: string, weightKg: number, index: number, patch: Partial<PackageBoxForm>) {
    setPackageBoxes(prev => {
      const rows = getPackageRows(orderId, weightKg).map(row => ({ ...row }));
      rows[index] = { ...rows[index], ...patch };
      return { ...prev, [orderId]: rows };
    });
    setRates(prev => ({ ...prev, [orderId]: [] }));
    setSelectedRate(prev => ({ ...prev, [orderId]: "" }));
  }

  function addPackageRow(orderId: string, weightKg: number) {
    setPackageBoxes(prev => ({ ...prev, [orderId]: [...getPackageRows(orderId, weightKg), defaultPackageBox(Math.max(0.1, weightKg / 2))] }));
    setRates(prev => ({ ...prev, [orderId]: [] }));
    setSelectedRate(prev => ({ ...prev, [orderId]: "" }));
  }

  function removePackageRow(orderId: string, weightKg: number, index: number) {
    setPackageBoxes(prev => {
      const rows = getPackageRows(orderId, weightKg).filter((_, i) => i !== index);
      return { ...prev, [orderId]: rows.length ? rows : [defaultPackageBox(weightKg)] };
    });
    setRates(prev => ({ ...prev, [orderId]: [] }));
    setSelectedRate(prev => ({ ...prev, [orderId]: "" }));
  }

  async function markDispatched() {
    if (!markModal) return;
    setMarkingId(markModal.orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/mark-dispatched`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: markModal.orderId, ...markForm, codAmount: markForm.codAmount ? parseFloat(markForm.codAmount) : undefined }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      alert(`✅ Order ${markModal.orderNo} marked as dispatched!`);
      setMarkModal(null);
      setMarkForm({ awbNumber: "", carrierName: "", notes: "", codAmount: "" });
      await load();
    } finally { setMarkingId(null); }
  }

  async function fetchRates(orderId: string) {
    setRatesLoading(orderId);
    try {
      const wid = selectedWarehouse[orderId] || warehouses[0]?.id || "";
      const pickup = customPickup[orderId];
      const warehouse = warehouses.find(w => w.id === wid);
      const wkg = parseFloat(weightOverride[orderId] || "0");
      const orderData = orders.find(o => o.id === orderId);
      const selected = selectedItems[orderId] ?? new Set();
      const selectedWeight = orderData?.readyItems.filter(i => selected.has(i.id)).reduce((s, i) => s + i.weightKg, 0) ?? 0.5;
      const packageRows = getPackageRows(orderId, selectedWeight);
      const sanitizedBoxes = multiBoxEnabled[orderId] ? sanitizePackageBoxes(packageRows) : [];
      if (multiBoxEnabled[orderId] && sanitizedBoxes.length === 0) { alert("Enter valid package box details"); return; }
      const params = new URLSearchParams();
      if (wid === "CUSTOM") {
        if (!pickup?.pincode?.trim()) { alert("Enter pickup pincode"); return; }
        params.set("pickupName", pickup.name.trim() || "Custom Pickup");
        params.set("pickupLocation", pickup.name.trim() || "Custom Pickup");
        params.set("pickupPincode", pickup.pincode.trim());
      } else if (warehouse) {
        params.set("warehouseId", wid);
        params.set("pickupName", warehouse.name);
        params.set("pickupLocation", warehouse.location);
        params.set("pickupPincode", warehouse.pincode);
      } else if (wid) {
        params.set("warehouseId", wid);
      }
      if (wkg > 0) params.set("weightKg", String(wkg));
      if (sanitizedBoxes.length > 0) params.set("packageBoxes", JSON.stringify(sanitizedBoxes));
      // Only the item(s) actually checked for booking -- otherwise the
      // quoted/declared value included every ready item on the order
      // regardless of what was selected here. Confirmed via a real order
      // (1498), 2026-08-19.
      if (selected.size > 0) params.set("itemIds", Array.from(selected).join(','));
      if (selectedCarrier[orderId]) params.set("carrier", selectedCarrier[orderId]);
      const res = await fetch(`${API_BASE_URL}/dispatch/rates/${orderId}?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(Array.isArray(b.message) ? b.message.join(", ") : (b.message || "Could not fetch rates"));
        return;
      }
      const data = await res.json();
      setRates(prev => ({ ...prev, [orderId]: data.rates }));
      if (data.rates?.length) setSelectedRate(prev => ({ ...prev, [orderId]: data.rates[0].rateId }));
    } finally { setRatesLoading(null); }
  }

  async function book(orderId: string, manualShippingCity?: string) {
    const itemIds = Array.from(selectedItems[orderId] ?? []);
    if (itemIds.length === 0) { alert("Select at least one item"); return; }
    const rateId = selectedRate[orderId];
    if (!rateId) { alert("Fetch and select a shipping rate first"); return; }
    const selectedQuote = (rates[orderId] ?? []).find(r => r.rateId === rateId);
    const orderData = orders.find(o => o.id === orderId);
    const wid = selectedWarehouse[orderId] || warehouses[0]?.id;
    const pickup = customPickup[orderId];
    const warehouse = warehouses.find(w => w.id === wid);
    if (wid === "CUSTOM" && !pickup?.pincode?.trim()) { alert("Enter pickup pincode"); return; }
    const selectedWeight = orderData?.readyItems.filter(i => (selectedItems[orderId] ?? new Set()).has(i.id)).reduce((s, i) => s + i.weightKg, 0) ?? 0.5;
    const sanitizedBoxes = multiBoxEnabled[orderId] ? sanitizePackageBoxes(getPackageRows(orderId, selectedWeight)) : [];
    if (multiBoxEnabled[orderId] && sanitizedBoxes.length === 0) { alert("Enter valid package box details"); return; }
    const addrOverride = addressOverrideEnabled[orderId] ? addressOverrideForm[orderId] : undefined;
    if (addressOverrideEnabled[orderId] && !addrOverride?.address?.trim()) {
      alert("Enter the alternate delivery address, or untick \"Ship to a different address\"");
      return;
    }
    setBookingId(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/book`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId, itemIds, rateId,
          selectedQuote,
          isCod: orderData?.isCod ?? false,
          codAmount: orderData?.codAmount ?? undefined,
          warehouseId: wid,
          pickupName: wid === "CUSTOM" ? (pickup?.name.trim() || "Custom Pickup") : warehouse?.name,
          pickupLocation: wid === "CUSTOM" ? (pickup?.name.trim() || "Custom Pickup") : warehouse?.location,
          pickupPincode: wid === "CUSTOM" ? pickup?.pincode.trim() : warehouse?.pincode,
          weightKgOverride: parseFloat(weightOverride[orderId] || "0") || undefined,
          packageBoxes: sanitizedBoxes.length > 0 ? sanitizedBoxes : undefined,
          manualShippingCity: manualShippingCity || undefined,
          addressOverride: addrOverride?.address?.trim() ? addrOverride : undefined,
        }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        const message = Array.isArray(b.message) ? b.message.join(", ") : (b.message || "Booking failed");
        // Bigship has no pincode->city lookup API at all, so the ERP can only
        // guess the city name it wants — when the guess is wrong, the ERP
        // used to be a dead end (the only way out was to book directly on
        // Bigship's own dashboard). Recognize this specific failure and let
        // the dispatcher type the correct city themselves, then retry with
        // it instead of just showing the raw error.
        if (!manualShippingCity && /shipping city/i.test(message)) {
          const typed = window.prompt(
            `Bigship couldn't automatically match the shipping city for this address.\n\n${message}\n\nEnter the city name Bigship should use (e.g. the nearest major city/district HQ), and we'll retry the booking with it:`,
          );
          if (typed && typed.trim()) {
            await book(orderId, typed.trim());
            return;
          }
        }
        alert(message);
        return;
      }
      const result = await res.json();
      // courierBookingWarning is set whenever the courier never actually
      // returned a real tracking number (booking rejected/failed on their
      // side) -- without this, the ERP said "Dispatched!" unconditionally
      // even when nothing was actually booked with the courier, and the
      // only "number" shown was this ERP's own internal shipment
      // reference, not a real AWB. Confirmed via a real order booked
      // through Fship that never showed up in Fship's own dashboard.
      if (result.courierBookingWarning) {
        alert(`⚠️ Recorded in the ERP, but the courier did NOT confirm this booking:\n\n${result.courierBookingWarning}\n\nShipment ref: ${result.shipmentNumber} (this is our internal reference, not a courier tracking number). Check the courier's balance/dashboard before assuming this is actually shipped.`);
      } else {
        alert(`✅ Dispatched! AWB: ${result.awbNumber ?? "pending"} via ${result.carrierName}\n(Shipment ref: ${result.shipmentNumber})`);
      }
      await load();
    } finally { setBookingId(null); }
  }

  async function bookTransport(orderId: string) {
    const itemIds = Array.from(selectedItems[orderId] ?? []);
    if (itemIds.length === 0) { alert("Select at least one item"); return; }
    const form = transportForm[orderId] || { transportName: "", lrNumber: "", transportChargesType: "TOPAY", transportBy: "", totalTransportCharges: "", notes: "" };
    if (!form.transportName.trim()) { alert("Enter transport name"); return; }
    if (form.transportChargesType === "PREPAID" && !form.totalTransportCharges) { alert("Enter total transport charges"); return; }
    setBookingId(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/book-transport`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          itemIds,
          transportName: form.transportName,
          lrNumber: form.lrNumber || undefined,
          transportChargesType: form.transportChargesType,
          transportBy: form.transportBy || undefined,
          totalTransportCharges: Number(form.totalTransportCharges || 0),
          notes: form.notes || undefined,
        }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { const b = await res.json(); alert(b.message || "Transport dispatch failed"); return; }
      const result = await res.json();
      alert(`Dispatched by transport. Shipment: ${result.shipmentNumber}`);
      await load();
    } finally { setBookingId(null); }
  }

  async function sendDirectOtp(orderId: string, method: "BY_HAND" | "SELF_COLLECTED") {
    const itemIds = Array.from(selectedItems[orderId] ?? []);
    if (itemIds.length === 0) { alert("Select at least one item"); return; }
    const form = directForm[orderId] || { deliveryBoyName: "", collectedByName: "", collectedByPhone: "", otp: "" };
    if (method === "BY_HAND" && !form.deliveryBoyName.trim()) { alert("Enter delivery boy name"); return; }
    if (method === "SELF_COLLECTED" && !form.collectedByName.trim()) { alert("Enter collected by name"); return; }
    setBookingId(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/direct/send-otp`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          itemIds,
          dispatchType: method,
          deliveryBoyName: form.deliveryBoyName || undefined,
          collectedByName: form.collectedByName || undefined,
          collectedByPhone: form.collectedByPhone || undefined,
        }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Could not send OTP"); return; }
      const result = await res.json().catch(() => ({}));
      if (result.whatsappSent) {
        alert("OTP sent to customer via WhatsApp. Enter OTP here after parcel is received.");
      } else {
        alert(`⚠️ WhatsApp message failed to send. OTP: ${result.otp ?? "—"}\n\nShare this with the customer manually (call/SMS), then enter it here after the parcel is received.`);
      }
    } finally { setBookingId(null); }
  }

  async function verifyDirectOtp(orderId: string) {
    const form = directForm[orderId] || { deliveryBoyName: "", collectedByName: "", collectedByPhone: "", otp: "" };
    if (!form.otp.trim()) { alert("Enter OTP"); return; }
    setBookingId(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/direct/verify-otp`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, otp: form.otp }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { const b = await res.json(); alert(b.message || "OTP verification failed"); return; }
      alert("OTP verified. Order marked delivered.");
      await load();
    } finally { setBookingId(null); }
  }

  // All carriers from fetched rates
  const allCarriers = useMemo(() => {
    const set = new Set<string>();
    Object.values(rates).forEach(rs => rs.forEach(r => set.add(r.carrierName)));
    return Array.from(set);
  }, [rates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter(o =>
      !q || o.orderNo.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      (o.customerPhone ?? "").includes(q) ||
      (o.salesAgentName ?? "").toLowerCase().includes(q)
    );
  }, [orders, search]);

  const filteredHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    if (!q) return history;
    return history.filter(h =>
      h.orderNo.toLowerCase().includes(q) ||
      h.customerName.toLowerCase().includes(q) ||
      (h.customerPhone ?? "").includes(q) ||
      (h.carrierName ?? "").toLowerCase().includes(q) ||
      (h.trackingNumber ?? "").toLowerCase().includes(q) ||
      (h.awbNumber ?? "").toLowerCase().includes(q) ||
      (h.shipmentNumber ?? "").toLowerCase().includes(q)
    );
  }, [history, historySearch]);

  // History tab = everything not yet delivered (Packed/In Transit/Cancelled).
  // Delivered parcels get their own tab so the active-shipment list doesn't
  // keep growing forever with parcels there's nothing left to do on.
  const historyActiveCount = useMemo(() => history.filter(h => h.status !== "DELIVERED").length, [history]);
  const historyDeliveredCount = useMemo(() => history.filter(h => h.status === "DELIVERED").length, [history]);
  const displayedHistory = useMemo(() => {
    return tab === "delivered"
      ? filteredHistory.filter(h => h.status === "DELIVERED")
      : filteredHistory.filter(h => h.status !== "DELIVERED");
  }, [filteredHistory, tab]);

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-full space-y-5">
          <PoliciesWidget moduleTag="DISPATCH" />
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Dispatch</h1>
              <p className="mt-0.5 text-sm text-slate-600">Select items to dispatch — partial or full.</p>
            </div>
            {/* Tab switcher */}
            <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button onClick={() => setTab("queue")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition ${tab === "queue" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <Package className="h-3.5 w-3.5" /> Queue ({orders.length})
              </button>
              <button onClick={() => setTab("history")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "history" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <History className="h-3.5 w-3.5" /> History ({historyActiveCount})
              </button>
              <button onClick={() => setTab("delivered")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "delivered" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <PackageCheck className="h-3.5 w-3.5" /> Delivered ({historyDeliveredCount})
              </button>
              <button onClick={() => setTab("courier_charges")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "courier_charges" ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <IndianRupee className="h-3.5 w-3.5" /> Courier Charges
              </button>
            </div>
          </div>

          {/* ── HISTORY / DELIVERED TABS (share one table, filtered by status) ── */}
          {(tab === "history" || tab === "delivered") && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Search order, customer, courier, tracking…"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
                <button onClick={() => void loadHistory(historySearch)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                  <Loader2 className={`h-3 w-3 ${historyLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <button
                  onClick={() => void syncAllBigship()}
                  disabled={syncingAll}
                  title="Sync AWB/status from Bigship for every PACKED/IN_TRANSIT shipment that has a Bigship order"
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1"
                >
                  <Loader2 className={`h-3 w-3 ${syncingAll ? "animate-spin" : ""}`} /> {syncingAll ? "Syncing…" : "🔄 Sync All Bigship"}
                </button>
                <input ref={reportFileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => void handleReportFileChange(e)} />
                <button
                  onClick={() => reportFileInputRef.current?.click()}
                  disabled={reportUploading}
                  title="Upload the Delivered Orders Report exported from Bigship — matches rows against open shipments by AWB / order number / phone, then bulk-marks the matches delivered and sends the feedback WhatsApp"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1"
                >
                  <Loader2 className={`h-3 w-3 ${reportUploading ? "animate-spin" : ""}`} /> {reportUploading ? "Reading…" : "📥 Upload Delivered Report"}
                </button>
                <span className="text-xs text-slate-400">{displayedHistory.length} shipment{displayedHistory.length !== 1 ? "s" : ""}</span>
              </div>
              {isNativeApp && displayedHistory.length > 0 && (
                <div className="flex items-center justify-end gap-1.5">
                  <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-0.5">
                    <button onClick={() => setHistoryCompact(true)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${historyCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Compact
                    </button>
                    <button onClick={() => setHistoryCompact(false)}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md ${!historyCompact ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                      Table
                    </button>
                  </div>
                </div>
              )}
              {historyLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
              ) : displayedHistory.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
                  {tab === "delivered" ? <PackageCheck className="h-10 w-10 mx-auto mb-2 opacity-30" /> : <History className="h-10 w-10 mx-auto mb-2 opacity-30" />}
                  <p>{tab === "delivered" ? "No delivered shipments found." : "No shipment history found."}</p>
                </div>
              ) : isNativeApp && historyCompact ? (
                <div className="space-y-2">
                  {filteredHistory.map(h => (
                    <div key={h.id} className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-blue-700">{h.orderNo}</p>
                          <p className="text-xs text-slate-800 font-medium truncate">{h.customerName}</p>
                          {h.customerPhone && <p className="text-[10px] text-slate-400">{h.customerPhone}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-slate-400">{new Date(h.dispatchDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</p>
                          <p className="text-sm font-bold text-slate-800">{h.amount != null ? fmt(h.amount) : "—"}</p>
                        </div>
                      </div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          h.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                          h.status === "IN_TRANSIT" ? "bg-blue-100 text-blue-700" :
                          h.status === "PACKED" ? "bg-yellow-100 text-yellow-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>{h.status}</span>
                        {h.isCod && (
                          <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-bold">
                            💰 {h.codAmount ? fmt(h.codAmount) : "COD"}
                          </span>
                        )}
                        {(h.carrierName || h.transportName) && (
                          <span className="text-slate-500">{h.carrierName || h.transportName}{h.lrNumber ? ` · LR: ${h.lrNumber}` : ""}</span>
                        )}
                      </div>
                      {(h.trackingNumber || h.awbNumber) && (
                        <p className="mt-1 text-[11px] font-mono text-blue-700">{h.trackingNumber ? h.trackingNumber : `AWB: ${h.awbNumber}`}</p>
                      )}
                      {h.shippingAddress && <p className="mt-1 text-[11px] text-slate-400 truncate" title={h.shippingAddress}>{h.shippingAddress}</p>}
                      {h.bigshipStatus && (
                        <p className="mt-0.5 text-[10px] text-slate-500" title="Live status as reported by Bigship">{h.bigshipStatus}</p>
                      )}
                      {((h.status === "PACKED" || h.status === "IN_TRANSIT" || h.status === "CANCELLED") ||
                        (h.bigshipOrderId && (h.status === "PACKED" || h.status === "IN_TRANSIT"))) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(h.status === "PACKED" || h.status === "IN_TRANSIT" || h.status === "CANCELLED") && (
                            <button
                              onClick={() => void returnToQueue(h.orderId)}
                              disabled={returningId === h.orderId}
                              title="Reset this order back to Ready for Dispatch — use this if the shipment was cancelled or stuck in Bigship and needs to be rebooked"
                              className="flex-1 rounded-lg border border-orange-300 bg-orange-50 px-2 py-1.5 text-[11px] font-semibold text-orange-700 disabled:opacity-50"
                            >↩ Queue</button>
                          )}
                          {(h.status === "PACKED" || h.status === "IN_TRANSIT") && (
                            <button
                              onClick={() => void markDelivered(h.id)}
                              disabled={markingDeliveredId === h.id}
                              title="Mark delivered and send the customer a WhatsApp review/testimonial request"
                              className="flex-1 rounded-lg border border-green-300 bg-green-50 px-2 py-1.5 text-[11px] font-semibold text-green-700 disabled:opacity-50"
                            >{markingDeliveredId === h.id ? "…" : "✅ Delivered"}</button>
                          )}
                          {h.bigshipOrderId && (h.status === "PACKED" || h.status === "IN_TRANSIT") && (
                            <button
                              onClick={() => void syncBigship(h.id)}
                              disabled={syncingId === h.id}
                              title={h.bigshipSyncedAt ? `Last synced ${new Date(h.bigshipSyncedAt).toLocaleString("en-IN")}${h.bigshipStatus ? ` — ${h.bigshipStatus}` : ""}` : "Pull the real AWB and status from Bigship"}
                              className="flex-1 rounded-lg border border-blue-300 bg-blue-50 px-2 py-1.5 text-[11px] font-semibold text-blue-700 disabled:opacity-50"
                            >{syncingId === h.id ? "…" : "🔄 Sync"}</button>
                          )}
                          {(h.status === "PACKED" || h.status === "IN_TRANSIT") && (
                            <button
                              onClick={() => void setManualAwb(h.id, h.trackingNumber)}
                              disabled={settingAwbId === h.id}
                              title="Manually enter the real AWB number (e.g. after shipping it directly from Bigship's dashboard)"
                              className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-2 py-1.5 text-[11px] font-semibold text-gray-700 disabled:opacity-50"
                            >{settingAwbId === h.id ? "…" : "✏️ AWB"}</button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                  <table className="w-full min-w-[900px] text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Date</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Order</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Customer</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Ship To</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Courier / Method</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Tracking</th>
                        <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Amount</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-slate-600">COD</th>
                        <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Actions</th>
                        <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Live Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {displayedHistory.map(h => (
                        <tr key={h.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{new Date(h.dispatchDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}</td>
                          <td className="px-4 py-2.5 font-bold text-blue-700">{h.orderNo}</td>
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-slate-800">{h.customerName}</p>
                            {h.customerPhone && <p className="text-slate-400">{h.customerPhone}</p>}
                          </td>
                          <td className="px-4 py-2.5 text-slate-600 max-w-[160px]">
                            {h.shippingAddress ? (
                              <span title={h.shippingAddress} className="block truncate">{h.shippingAddress}</span>
                            ) : "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {h.carrierName && <p className="font-medium text-slate-800">{h.carrierName}</p>}
                            {h.transportName && <p className="text-slate-500">{h.transportName}{h.lrNumber ? ` · LR: ${h.lrNumber}` : ""}</p>}
                            {!h.carrierName && !h.transportName && <span className="text-slate-400">{h.dispatchType ?? "—"}</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            {h.trackingNumber ? (
                              <span className="font-mono text-blue-700">{h.trackingNumber}</span>
                            ) : h.awbNumber ? (
                              <span className="font-mono text-blue-700">AWB: {h.awbNumber}</span>
                            ) : <span className="text-slate-400">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-800">{h.amount != null ? fmt(h.amount) : "—"}</td>
                          <td className="px-4 py-2.5 text-center">
                            {h.isCod ? (
                              <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[10px] font-bold">
                                💰 {h.codAmount ? fmt(h.codAmount) : "COD"}
                              </span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-4 py-2 text-center align-middle">
                            <div className="flex flex-wrap items-center justify-center gap-1">
                              {(h.status === "PACKED" || h.status === "IN_TRANSIT" || h.status === "CANCELLED") && (
                                <button
                                  onClick={() => void returnToQueue(h.orderId)}
                                  disabled={returningId === h.orderId}
                                  title="Reset this order back to Ready for Dispatch — use this if the shipment was cancelled or stuck in Bigship and needs to be rebooked"
                                  className="rounded border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50 whitespace-nowrap"
                                >↩ Queue</button>
                              )}
                              {(h.status === "PACKED" || h.status === "IN_TRANSIT") && (
                                <button
                                  onClick={() => void markDelivered(h.id)}
                                  disabled={markingDeliveredId === h.id}
                                  title="Mark delivered and send the customer a WhatsApp review/testimonial request"
                                  className="rounded border border-green-300 bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 hover:bg-green-100 disabled:opacity-50 whitespace-nowrap"
                                >{markingDeliveredId === h.id ? "…" : "✅ Delivered"}</button>
                              )}
                              {h.bigshipOrderId && (h.status === "PACKED" || h.status === "IN_TRANSIT") && (
                                <button
                                  onClick={() => void syncBigship(h.id)}
                                  disabled={syncingId === h.id}
                                  title={h.bigshipSyncedAt ? `Last synced ${new Date(h.bigshipSyncedAt).toLocaleString("en-IN")}${h.bigshipStatus ? ` — ${h.bigshipStatus}` : ""}` : "Pull the real AWB and status from Bigship"}
                                  className="rounded border border-blue-300 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50 whitespace-nowrap"
                                >{syncingId === h.id ? "…" : "🔄 Sync"}</button>
                              )}
                              {(h.status === "PACKED" || h.status === "IN_TRANSIT") && (
                                <button
                                  onClick={() => void setManualAwb(h.id, h.trackingNumber)}
                                  disabled={settingAwbId === h.id}
                                  title="Manually enter the real AWB number (e.g. after shipping it directly from Bigship's dashboard)"
                                  className="rounded border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50 whitespace-nowrap"
                                >{settingAwbId === h.id ? "…" : "✏️ AWB"}</button>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-left align-middle text-slate-500">
                            {h.bigshipStatus ? (
                              <span title="Live status as reported by Bigship">{h.bigshipStatus}</span>
                            ) : <span className="text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── COURIER CHARGES TAB ── */}
          {tab === "courier_charges" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <input type="month" value={courierChargesMonth} onChange={e => setCourierChargesMonth(e.target.value)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400" />
                <button onClick={() => void loadCourierCharges()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                  <Loader2 className={`h-3 w-3 ${courierChargesLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <input ref={courierReportFileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => void handleCourierReportFileChange(e)} />
                <button
                  onClick={() => courierReportFileInputRef.current?.click()}
                  disabled={courierReportUploading}
                  title="Upload Bigship's monthly 'Shipping Charges' export — matches rows to shipments by AWB and fills in the Actual column"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1"
                >
                  <Loader2 className={`h-3 w-3 ${courierReportUploading ? "animate-spin" : ""}`} /> {courierReportUploading ? "Reading…" : "📥 Upload Shipping Charges Report"}
                </button>
                <span className="text-xs text-slate-400 ml-auto">{courierCharges.length} shipment{courierCharges.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-500">Actual (courier cost)</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">₹{courierChargesTotals.actual.toLocaleString("en-IN")}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold text-slate-500">Taken from customer</p>
                  <p className="mt-1 text-lg font-bold text-slate-900">₹{courierChargesTotals.taken.toLocaleString("en-IN")}</p>
                </div>
                <div className={`rounded-xl border p-3 ${courierChargesTotals.net >= 0 ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}`}>
                  <p className="text-xs font-semibold text-slate-500">Net (profit/loss)</p>
                  <p className={`mt-1 text-lg font-bold ${courierChargesTotals.net >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {courierChargesTotals.net >= 0 ? "+" : ""}₹{courierChargesTotals.net.toLocaleString("en-IN")}
                  </p>
                </div>
              </div>

              {courierChargesLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
              ) : courierCharges.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
                  <IndianRupee className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No dispatched shipments found for this month.</p>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                  <table className="w-full text-left text-xs" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-3 py-2 font-semibold text-slate-600">Order</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Dispatched</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">AWB / Mode</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Status</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Actual</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Taken from Customer</th>
                        <th className="px-3 py-2 font-semibold text-slate-600">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {courierCharges.map(row => (
                        <tr key={row.shipmentId} className="hover:bg-slate-50">
                          <td className="px-3 py-2 whitespace-nowrap">
                            <p className="font-bold text-blue-700">{row.orderNo}</p>
                            {row.salesAgentName && <p className="text-slate-400">{row.salesAgentName}</p>}
                          </td>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{row.customerName}</td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{new Date(row.dispatchDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.dispatchType === "COURIER" ? (
                              <div>
                                <p className="font-mono text-slate-800">{row.awbNumber ?? "—"}</p>
                                {row.courierOrderStatus && <p className="text-slate-400">{row.courierOrderStatus}</p>}
                              </div>
                            ) : (
                              <span className="rounded-full bg-slate-100 text-slate-500 px-2 py-0.5 font-semibold">
                                {row.dispatchType === "TRANSPORT" ? "Transport" : row.dispatchType === "BY_HAND" ? "By Hand" : row.dispatchType === "SELF_COLLECTED" ? "Self Collected" : row.dispatchType ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {row.parcelStatus ? (
                              <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-semibold">{row.parcelStatus}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-800">
                            {row.actual != null ? `₹${row.actual.toLocaleString("en-IN")}` : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number" min={0} step="0.01"
                                placeholder="0"
                                defaultValue={row.taken ?? ""}
                                onBlur={e => {
                                  const v = e.target.value;
                                  if (v.trim() === "" || Number(v) === row.taken) return;
                                  void saveTakenAmount(row.shipmentId, v);
                                }}
                                disabled={savingTakenId === row.shipmentId}
                                className="w-24 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold outline-none focus:border-blue-400 disabled:opacity-60"
                              />
                              {savingTakenId === row.shipmentId && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-bold">
                            {row.net != null ? (
                              <span className={row.net >= 0 ? "text-green-700" : "text-red-700"}>{row.net >= 0 ? "+" : ""}₹{row.net.toLocaleString("en-IN")}</span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── QUEUE TAB ── */}
          {tab === "queue" && <>
          {/* Search bar */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search order, customer, phone, agent…"
                className="w-full rounded-md border border-slate-200 pl-7 pr-3 py-1 text-xs outline-none focus:border-blue-400" />
            </div>
            {allCarriers.length > 0 && (
              <MobileSelect value={courierFilter} onChange={setCourierFilter}
                className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 bg-white"
                options={[{ value: "ALL", label: "All Couriers" }, ...allCarriers.map(c => ({ value: c, label: c }))]} />
            )}
            {search && (
              <button onClick={() => setSearch("")} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 flex items-center gap-1">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            <span className="text-xs text-slate-400 self-center">{filtered.length} orders</span>
          </div>

          {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white py-10 text-center text-xs text-slate-500 shadow-sm">
              {orders.length === 0 ? "No items ready for dispatch." : "No orders match your search."}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((o) => {
                const orderSelected = selectedItems[o.id] ?? new Set();
                const allSelected = o.readyItems.every(i => orderSelected.has(i.id));
                const someSelected = o.readyItems.some(i => orderSelected.has(i.id));
                const orderRates = rates[o.id] ?? [];
                const selectedWeight = o.readyItems.filter(i => orderSelected.has(i.id)).reduce((s, i) => s + i.weightKg, 0);
                const selectedPickupId = selectedWarehouse[o.id] || warehouses[0]?.id || "CUSTOM";
                const pickupDraft = customPickup[o.id] || { name: "", pincode: "" };
                const activeWarehouse = selectedPickupId === "CUSTOM"
                  ? { id: "CUSTOM", name: pickupDraft.name || "Custom Pickup", pincode: pickupDraft.pincode || "—", location: pickupDraft.name || "Custom Pickup" }
                  : warehouses.find(w => w.id === selectedPickupId) ?? warehouses[0];
                const activePickupAddress = pickupAddressText(activeWarehouse);
                const method = dispatchMethod[o.id] || o.dispatchType || "COURIER";
                const transport = transportForm[o.id] || { transportName: "", lrNumber: "", transportChargesType: "TOPAY", transportBy: "", totalTransportCharges: "", notes: "" };
                const direct = directForm[o.id] || { deliveryBoyName: "", collectedByName: "", collectedByPhone: "", otp: "" };
                const isMultiBox = !!multiBoxEnabled[o.id];
                const currentPackageRows = getPackageRows(o.id, selectedWeight);
                const packageWeight = packageTotalWeight(currentPackageRows);

                return (
                  <div key={o.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">

                    {/* ── Compact Header ── */}
                    <div className="bg-slate-50 border-b border-slate-200 px-3 py-2 flex flex-wrap items-start gap-x-4 gap-y-1">
                      {/* Left: order info */}
                      <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                        <span className="font-bold text-slate-900 text-sm">{o.orderNo}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ageColor(o.orderDate)}`}>{orderAge(o.orderDate)}</span>
                        {o.isSample && <span className="rounded-full bg-amber-200 text-amber-900 px-1.5 py-0.5 text-[10px] font-bold">📦 SAMPLE</span>}
                        {o.salesAgentName && <span className="text-[10px] text-blue-600 font-semibold">👤 {o.salesAgentName}</span>}
                        {o.isSample && o.samplePaymentType
                          ? o.samplePaymentType === "COD"
                            ? <span className="rounded-full bg-orange-100 text-orange-800 px-1.5 py-0.5 text-[10px] font-bold">💵 COD</span>
                            : <span className="rounded-full bg-green-100 text-green-800 px-1.5 py-0.5 text-[10px] font-bold">✅ PREPAID</span>
                          : o.isCod
                            ? <span className="rounded-full bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-bold">COD {o.codAmount ? fmt(o.codAmount) : ""}</span>
                            : <span className="rounded-full bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[10px] font-bold">PREPAID</span>}
                        <span className="font-semibold text-slate-800 text-xs">{o.customerName}</span>
                        {o.customerPhone && <span className="text-[10px] text-slate-500">{o.customerPhone}</span>}
                        {o.shipTo && o.shipTo !== "—" && (
                          <span className="text-[10px] text-slate-500 flex items-center gap-0.5 truncate max-w-[300px]">
                            <MapPin className="h-2.5 w-2.5 shrink-0" />{o.shipTo}
                            {o.customerPincode && <span className="text-slate-400">· {o.customerPincode}</span>}
                          </span>
                        )}
                        <button
                          onClick={() => editAddressOpenId === o.id ? setEditAddressOpenId(null) : openEditAddress(o)}
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-600 hover:text-blue-800"
                          title="Edit this customer's address/pincode"
                        >
                          <Pencil className="h-2.5 w-2.5" /> Edit address
                        </button>
                      </div>
                      {/* Right: weight + pickup */}
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 shrink-0">
                        <span>Items <strong className="text-emerald-600">{o.readyItems.length}/{o.totalItems}</strong></span>
                        <span>Wt <strong className="text-slate-700">{selectedWeight.toFixed(2)}kg</strong></span>
                        {activeWarehouse && (
                          <span className="flex items-center gap-0.5">
                            <Building2 className="h-2.5 w-2.5 shrink-0" />
                            <strong className="text-slate-700">{activeWarehouse.name}</strong> · {activeWarehouse.pincode}
                          </span>
                        )}
                      <button
                        onClick={() => {
                          const s = o.latestShipment;
                          const codMatch = s?.notes?.match(/COD:\s*₹?([\d.]+)/i);
                          setMarkModal({ orderId: o.id, orderNo: o.orderNo, isCod: o.isCod });
                          setMarkForm({
                            awbNumber: s?.awbNumber || s?.trackingNumber || "",
                            carrierName: s?.carrierName || "",
                            notes: "",
                            codAmount: codMatch ? codMatch[1] : (o.codAmount ? String(o.codAmount) : ""),
                          });
                        }}
                        className="ml-2 inline-flex items-center gap-1 rounded-md bg-green-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-green-700"
                        title="Already booked in Bigship? Mark as dispatched"
                      >
                        <CheckSquare className="h-3 w-3" /> Mark Dispatched
                      </button>
                      </div>
                    </div>

                    {editAddressOpenId === o.id && (() => {
                      const form = editAddressForm[o.id] || { shippingAddress: "", city: "", state: "", pincode: "" };
                      const setForm = (patch: Partial<typeof form>) =>
                        setEditAddressForm(prev => ({ ...prev, [o.id]: { ...form, ...patch } }));
                      return (
                        <div className="px-3 py-3 border-b border-slate-100 bg-blue-50/50 space-y-2">
                          <p className="text-[11px] font-semibold text-slate-600">
                            Edit address for {o.customerName} — this updates their saved address, used on every order, not just this one.
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input value={form.shippingAddress} onChange={e => setForm({ shippingAddress: e.target.value })}
                              placeholder="Address" className="sm:col-span-2 rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                            <input value={form.city} onChange={e => setForm({ city: e.target.value })}
                              placeholder="City" className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                            <input value={form.state} onChange={e => setForm({ state: e.target.value })}
                              placeholder="State" className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                            <input value={form.pincode} inputMode="numeric" maxLength={6}
                              onChange={e => setForm({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                              placeholder="Pincode" className="rounded-md border border-slate-300 px-2 py-1.5 text-xs" />
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveEditAddress(o)} disabled={savingAddressId === o.id}
                              className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                              {savingAddressId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Save address
                            </button>
                            <button onClick={() => setEditAddressOpenId(null)} className="text-[11px] text-slate-500 hover:text-slate-700">Cancel</button>
                          </div>
                        </div>
                      );
                    })()}

                    {/* ── Items (compact rows) ── */}
                    <div className="px-3 py-2 border-b border-slate-100">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Items</span>
                        <button onClick={() => toggleAll(o.id, o.readyItems)}
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-600 hover:text-blue-800">
                          {allSelected ? <CheckSquare className="h-3 w-3" /> : <Square className="h-3 w-3" />}
                          {allSelected ? "Deselect All" : "Select All"}
                        </button>
                      </div>
                      <div className="space-y-1">
                        {o.readyItems.map((item, idx) => {
                          const { size, gsm, sides } = item;
                          const isSelected = orderSelected.has(item.id);
                          return (
                            <div key={item.id} onClick={() => toggleItem(o.id, item.id)}
                              className={`cursor-pointer rounded-md border px-2 py-1.5 flex items-center gap-2 transition ${isSelected ? "border-brand-400 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                              {isSelected ? <CheckSquare className="h-3.5 w-3.5 text-brand-600 shrink-0" /> : <Square className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                              <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 text-[10px] font-bold shrink-0">{o.orderNo}-{idx + 1}</span>
                              <span className="font-semibold text-slate-900 text-xs">{item.productName}</span>
                              <span className="text-[10px] text-slate-400">({item.sku})</span>
                              <span className="text-[10px] text-slate-500 ml-auto flex gap-2 shrink-0">
                                <span>Qty <strong>{item.quantity}</strong></span>
                                {size && <span>Size <strong>{size}</strong></span>}
                                {gsm && <span>GSM <strong>{gsm}</strong></span>}
                                {sides && <span>Sides <strong>{sides === "SINGLE_SIDE" ? "S" : sides === "DOUBLE_SIDE" ? "D" : sides}</strong></span>}
                                <span>Wt <strong>{item.weightKg.toFixed(2)}kg</strong></span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Method tabs ── */}
                    <div className="px-3 py-2 flex items-center gap-1.5 border-b border-slate-100">
                      {[
                        { key: "COURIER", label: "Courier" },
                        { key: "TRANSPORT", label: "Transport" },
                        { key: "BY_HAND", label: "By Hand" },
                        { key: "SELF_COLLECTED", label: "Self Collected" },
                      ].map(opt => (
                        <button key={opt.key} type="button"
                          onClick={() => { setDispatchMethod(prev => ({ ...prev, [o.id]: opt.key as DispatchMethod })); setRates(prev => ({ ...prev, [o.id]: [] })); setSelectedRate(prev => ({ ...prev, [o.id]: "" })); }}
                          className={`rounded-md border px-2.5 py-1 text-[11px] font-semibold transition ${method === opt.key ? "border-brand-500 bg-brand-50 text-brand-800" : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                          {opt.label}
                        </button>
                      ))}
                    </div>

                    {/* ── Courier section ── */}
                    {method === "COURIER" && (
                    <div className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <MobileSelect value={selectedPickupId}
                          onChange={v => { setSelectedWarehouse(prev => ({ ...prev, [o.id]: v })); setRates(prev => ({ ...prev, [o.id]: [] })); setSelectedRate(prev => ({ ...prev, [o.id]: "" })); }}
                          className="flex-1 min-w-[160px] rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 bg-white"
                          options={[...warehouses.map(w => ({ value: w.id, label: `${w.name} (${w.pincode})` })), { value: "CUSTOM", label: "Edit pickup…" }]} />
                        {selectedPickupId === "CUSTOM" && (
                          <div className="flex gap-1.5 w-full">
                            <input type="text" placeholder="Pickup name" value={pickupDraft.name}
                              onChange={e => setCustomPickup(prev => ({ ...prev, [o.id]: { ...(prev[o.id] || { name: "", pincode: "" }), name: e.target.value } }))}
                              className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                            <input type="text" inputMode="numeric" maxLength={6} placeholder="Pincode" value={pickupDraft.pincode}
                              onChange={e => setCustomPickup(prev => ({ ...prev, [o.id]: { ...(prev[o.id] || { name: "", pincode: "" }), pincode: e.target.value.replace(/\D/g, "").slice(0, 6) } }))}
                              className="w-24 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                          </div>
                        )}
                        {selectedPickupId !== "CUSTOM" && activePickupAddress && (
                          <span className="text-[10px] text-slate-400 truncate max-w-[260px]">{activePickupAddress}</span>
                        )}
                        <input type="number" step="0.1" min="0.1" placeholder={selectedWeight.toFixed(2)}
                          value={weightOverride[o.id] || ""}
                          onChange={e => setWeightOverride(prev => ({ ...prev, [o.id]: e.target.value }))}
                          className="w-20 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                        <MobileSelect value={selectedCarrier[o.id] || ""}
                          onChange={v => { setSelectedCarrier(prev => ({ ...prev, [o.id]: v })); setRates(prev => ({ ...prev, [o.id]: [] })); setSelectedRate(prev => ({ ...prev, [o.id]: "" })); }}
                          className="min-w-[130px] rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 bg-white"
                          options={[
                            { value: "", label: "Ship via: Default" },
                            { value: "bigship", label: "Bigship" },
                            { value: "fship", label: "Fship" },
                            { value: "shiprocket", label: "Shiprocket" },
                          ]} />
                        <button onClick={() => fetchRates(o.id)} disabled={ratesLoading === o.id || !someSelected}
                          className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50">
                          {ratesLoading === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                          Fetch Rates
                        </button>
                      </div>

                      <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                            <input type="checkbox" checked={isMultiBox}
                              onChange={e => {
                                setMultiBoxEnabled(prev => ({ ...prev, [o.id]: e.target.checked }));
                                setPackageBoxes(prev => ({ ...prev, [o.id]: getPackageRows(o.id, selectedWeight) }));
                                setRates(prev => ({ ...prev, [o.id]: [] }));
                                setSelectedRate(prev => ({ ...prev, [o.id]: "" }));
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-300" />
                            <Boxes className="h-3.5 w-3.5 text-slate-500" />
                            Multi-box shipment
                          </label>
                          {isMultiBox && (
                            <span className="text-[10px] text-slate-500">
                              Total weight <strong className="text-slate-800">{packageWeight.toFixed(2)}kg</strong>
                            </span>
                          )}
                        </div>

                        {isMultiBox && (
                          <div className="mt-2 space-y-1.5">
                            <div className="hidden sm:grid grid-cols-[72px_repeat(4,minmax(0,1fr))_32px] gap-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              <span>Boxes</span><span>L cm</span><span>B cm</span><span>H cm</span><span>Kg/box</span><span />
                            </div>
                            {currentPackageRows.map((box, index) => (
                              <div key={index} className="grid grid-cols-2 sm:grid-cols-[72px_repeat(4,minmax(0,1fr))_32px] gap-1.5">
                                <input type="number" min="1" value={box.noOfBoxes}
                                  onChange={e => updatePackageRow(o.id, selectedWeight, index, { noOfBoxes: e.target.value })}
                                  placeholder="Boxes" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                <input type="number" min="1" step="0.1" value={box.length}
                                  onChange={e => updatePackageRow(o.id, selectedWeight, index, { length: e.target.value })}
                                  placeholder="L cm" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                <input type="number" min="1" step="0.1" value={box.breadth}
                                  onChange={e => updatePackageRow(o.id, selectedWeight, index, { breadth: e.target.value })}
                                  placeholder="B cm" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                <input type="number" min="1" step="0.1" value={box.height}
                                  onChange={e => updatePackageRow(o.id, selectedWeight, index, { height: e.target.value })}
                                  placeholder="H cm" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                <input type="number" min="0.1" step="0.1" value={box.weight}
                                  onChange={e => updatePackageRow(o.id, selectedWeight, index, { weight: e.target.value })}
                                  placeholder="Kg/box" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                                <button type="button" onClick={() => removePackageRow(o.id, selectedWeight, index)}
                                  disabled={currentPackageRows.length === 1}
                                  title="Remove box row"
                                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:text-red-600 disabled:opacity-40">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                            <button type="button" onClick={() => addPackageRow(o.id, selectedWeight)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50">
                              <Plus className="h-3 w-3" /> Add box type
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Ship to a different address — for separate items on the same
                          order going to separate delivery addresses (e.g. different
                          branches/offices of the same customer). Typed fresh for this
                          booking only; not saved back to the customer/order. */}
                      <div className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
                        <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-slate-700">
                          <input type="checkbox" checked={!!addressOverrideEnabled[o.id]}
                            onChange={e => setAddressOverrideEnabled(prev => ({ ...prev, [o.id]: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-slate-300" />
                          <MapPin className="h-3.5 w-3.5 text-slate-500" />
                          Ship to a different address for these items
                        </label>
                        {addressOverrideEnabled[o.id] && (() => {
                          const addrForm = addressOverrideForm[o.id] || { receiverName: "", receiverPhone: "", address: "", city: "", state: "", pincode: "" };
                          const updateAddr = (patch: Partial<typeof addrForm>) =>
                            setAddressOverrideForm(prev => ({ ...prev, [o.id]: { ...addrForm, ...patch } }));
                          return (
                            <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                              <input value={addrForm.receiverName} onChange={e => updateAddr({ receiverName: e.target.value })}
                                placeholder="Receiver name (optional, defaults to customer)" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                              <input value={addrForm.receiverPhone} onChange={e => updateAddr({ receiverPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                                placeholder="Receiver phone (optional)" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                              <input value={addrForm.address} onChange={e => updateAddr({ address: e.target.value })}
                                placeholder="Delivery address *" className="sm:col-span-2 rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                              <input value={addrForm.city} onChange={e => updateAddr({ city: e.target.value })}
                                placeholder="City" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                              <input value={addrForm.state} onChange={e => updateAddr({ state: e.target.value })}
                                placeholder="State" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                              <input value={addrForm.pincode} onChange={e => updateAddr({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                                placeholder="Pincode" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                            </div>
                          );
                        })()}
                      </div>

                      {/* Rate cards — compact rows */}
                      {orderRates.length > 0 && (
                        <>
                          <div className="grid gap-1.5 grid-cols-3 sm:grid-cols-4 mb-2">
                            {orderRates
                              .filter(r => courierFilter === "ALL" || r.carrierName === courierFilter)
                              .map(r => (
                                <label key={r.rateId}
                                  className={`cursor-pointer rounded-md border px-2 py-1.5 flex items-center gap-2 transition ${selectedRate[o.id] === r.rateId ? "border-brand-500 bg-brand-50" : "border-slate-200 hover:border-slate-300"}`}>
                                  <input type="radio" name={`rate-${o.id}`} className="sr-only"
                                    checked={selectedRate[o.id] === r.rateId}
                                    onChange={() => setSelectedRate(prev => ({ ...prev, [o.id]: r.rateId }))} />
                                  <div className="min-w-0">
                                    <p className="text-[11px] font-semibold text-slate-800 truncate">{r.carrierName}</p>
                                    <p className="text-xs font-bold text-blue-700">{fmt(r.amount)} <span className="text-[10px] font-normal text-slate-400">~{r.estimatedDays}d</span></p>
                                  </div>
                                </label>
                              ))}
                          </div>
                          <div className="flex justify-end">
                            <button onClick={() => book(o.id)} disabled={bookingId === o.id || !someSelected}
                              className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                              {bookingId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                              Dispatch {orderSelected.size} Item{orderSelected.size !== 1 ? "s" : ""}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    )}

                    {/* ── Transport ── */}
                    {method === "TRANSPORT" && (
                      <div className="px-3 py-2">
                        <div className="grid gap-1.5 sm:grid-cols-4">
                          <input value={transport.transportName} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, transportName: e.target.value } }))} placeholder="Transport name" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                          <input value={transport.lrNumber} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, lrNumber: e.target.value } }))} placeholder="LR number" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                          <MobileSelect value={transport.transportChargesType} onChange={v => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, transportChargesType: v as "TOPAY" | "PREPAID" } }))} className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 bg-white"
                            options={[
                              { value: "TOPAY", label: "To Pay" },
                              { value: "PREPAID", label: "Prepaid" },
                            ]} />
                          <input value={transport.transportBy} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, transportBy: e.target.value } }))} placeholder="Booked by" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                        </div>
                        {transport.transportChargesType === "PREPAID" && (
                          <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[150px_1fr]">
                            <input type="number" min="0" value={transport.totalTransportCharges} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, totalTransportCharges: e.target.value } }))} placeholder="Charges" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                            <input value={transport.notes} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, notes: e.target.value } }))} placeholder="Notes" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400" />
                          </div>
                        )}
                        <div className="mt-2 flex justify-end">
                          <button onClick={() => bookTransport(o.id)} disabled={bookingId === o.id || !someSelected}
                            className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                            {bookingId === o.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                            Dispatch by Transport
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── By Hand / Self Collected ── */}
                    {(method === "BY_HAND" || method === "SELF_COLLECTED") && (
                      <div className="px-3 py-2">
                        <div className="flex flex-wrap gap-1.5">
                          {method === "BY_HAND"
                            ? <input value={direct.deliveryBoyName} onChange={e => setDirectForm(prev => ({ ...prev, [o.id]: { ...direct, deliveryBoyName: e.target.value } }))} placeholder="Delivery boy name" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 flex-1 min-w-[140px]" />
                            : <>
                                <input value={direct.collectedByName} onChange={e => setDirectForm(prev => ({ ...prev, [o.id]: { ...direct, collectedByName: e.target.value } }))} placeholder="Collected by name" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 flex-1 min-w-[130px]" />
                                <input value={direct.collectedByPhone} onChange={e => setDirectForm(prev => ({ ...prev, [o.id]: { ...direct, collectedByPhone: e.target.value } }))} placeholder="Phone" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 w-28" />
                              </>}
                          <input value={direct.otp} onChange={e => setDirectForm(prev => ({ ...prev, [o.id]: { ...direct, otp: e.target.value.replace(/\D/g, "").slice(0, 6) } }))} placeholder="OTP" className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-400 w-20" />
                          <button onClick={() => sendDirectOtp(o.id, method as "BY_HAND" | "SELF_COLLECTED")} disabled={bookingId === o.id || !someSelected} className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50">Send OTP</button>
                          <button onClick={() => verifyDirectOtp(o.id)} disabled={bookingId === o.id || !someSelected} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Verify & Deliver</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          </>}
        </div>
      </div>

      {/* ── Bigship Delivered Orders Report — preview & confirm ── */}
      {reportModalOpen && reportPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            <div className="p-5 pb-3 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Delivered Orders Report</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {reportPreview.totalRows} delivered row{reportPreview.totalRows === 1 ? "" : "s"} in file ·{" "}
                    <span className="text-emerald-700 font-semibold">{reportPreview.matched} matched</span> ·{" "}
                    <span className="text-amber-700 font-semibold">{reportPreview.ambiguous} need a pick</span> ·{" "}
                    <span className="text-slate-500 font-semibold">{reportPreview.unmatched} no match</span>
                  </p>
                </div>
                <button onClick={() => { setReportModalOpen(false); setReportPreview(null); }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {reportPreview.rows.filter(r => r.matchStatus === "MATCHED").length > 0 && (
                <div>
                  <p className="text-xs font-bold text-emerald-700 mb-2">✅ Matched — will be marked Delivered</p>
                  <div className="space-y-1.5">
                    {reportPreview.rows.filter(r => r.matchStatus === "MATCHED").map(row => (
                      <label key={row.rowNumber} className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/50 px-3 py-2 text-xs cursor-pointer">
                        <input type="checkbox" className="mt-0.5" checked={!!reportChecked[row.rowNumber]}
                          onChange={e => setReportChecked(p => ({ ...p, [row.rowNumber]: e.target.checked }))} />
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-blue-700">{row.matched!.orderNo}</span>
                            <span className="text-slate-600">{row.matched!.customerName}</span>
                            <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-semibold">via {row.matchMethod}</span>
                            {row.phoneMismatch && (
                              <span className="rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold" title={`Report mobile ${row.receiverMobile} doesn't match this order's customer phone ${row.matched!.customerPhone ?? "—"}`}>⚠ phone mismatch</span>
                            )}
                          </div>
                          <p className="text-slate-400 mt-0.5">AWB {row.awb} · {row.receiverName} · {row.receiverMobile ?? "—"}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {reportPreview.rows.filter(r => r.matchStatus === "AMBIGUOUS").length > 0 && (
                <div>
                  <p className="text-xs font-bold text-amber-700 mb-2">⚠ Multiple possible matches — pick the right one</p>
                  <div className="space-y-1.5">
                    {reportPreview.rows.filter(r => r.matchStatus === "AMBIGUOUS").map(row => (
                      <div key={row.rowNumber} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs">
                        <input type="checkbox" className="mt-0.5" checked={!!reportChecked[row.rowNumber]}
                          onChange={e => setReportChecked(p => ({ ...p, [row.rowNumber]: e.target.checked }))} />
                        <div className="flex-1 space-y-1.5">
                          <p className="text-slate-600">AWB {row.awb} · {row.receiverName} · {row.receiverMobile ?? "—"} <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-[10px] font-semibold">via {row.matchMethod}</span></p>
                          <select
                            value={reportPicks[row.rowNumber] ?? ""}
                            onChange={e => setReportPicks(p => ({ ...p, [row.rowNumber]: e.target.value }))}
                            className="w-full rounded-md border border-amber-300 bg-white px-2 py-1 text-xs outline-none"
                          >
                            <option value="">Select the right order…</option>
                            {row.candidates.map(c => (
                              <option key={c.shipmentId} value={c.shipmentId}>{c.orderNo} — {c.customerName} ({c.customerPhone ?? "no phone"})</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reportPreview.rows.filter(r => r.matchStatus === "UNMATCHED").length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 mb-2">No match found — mark these delivered by hand if needed</p>
                  <div className="space-y-1.5">
                    {reportPreview.rows.filter(r => r.matchStatus === "UNMATCHED").map(row => (
                      <div key={row.rowNumber} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                        AWB {row.awb} · {row.receiverName ?? "—"} · {row.receiverMobile ?? "—"} · Channel Order Id: {row.channelOrderId ?? "—"}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2">
              <button onClick={() => { setReportModalOpen(false); setReportPreview(null); }} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button
                onClick={() => void confirmDeliveredReport()}
                disabled={reportConfirming}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                <Loader2 className={`h-3.5 w-3.5 ${reportConfirming ? "animate-spin" : ""}`} />
                {reportConfirming ? "Marking delivered…" : "Mark Delivered & Send Feedback"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark Dispatched Modal ── */}
      {markModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Mark as Dispatched</h2>
            <p className="text-xs text-slate-500 mb-4">Order <strong>{markModal.orderNo}</strong> — already booked externally?</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">AWB / Tracking Number</label>
                <input value={markForm.awbNumber} onChange={e => setMarkForm(f => ({ ...f, awbNumber: e.target.value }))}
                  placeholder="Enter AWB number" className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Carrier / Courier Name</label>
                <input value={markForm.carrierName} onChange={e => setMarkForm(f => ({ ...f, carrierName: e.target.value }))}
                  placeholder="e.g. Delhivery, Ekart" className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  COD Amount (₹) {markModal.isCod && <span className="text-amber-600 font-semibold">· COD Order</span>}
                </label>
                <input
                  type="number"
                  value={markForm.codAmount}
                  onChange={e => setMarkForm(f => ({ ...f, codAmount: e.target.value }))}
                  placeholder="Enter COD amount to collect"
                  className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notes (optional)</label>
                <input value={markForm.notes} onChange={e => setMarkForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Any notes" className="w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setMarkModal(null)} className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={markDispatched} disabled={!!markingId}
                className="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-1">
                {markingId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                Confirm Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
