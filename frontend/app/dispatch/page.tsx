"use client";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Package, Truck, CheckSquare, Square, Search, X, History, MapPin, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";

type ReadyItem = { id: string; productName: string; sku: string; quantity: number; productionNotes?: string; weightKg: number; };
type Warehouse = { id: string; name: string; pincode: string; location: string; address?: string; city?: string; state?: string; source?: string };

type ShipmentHistory = {
  id: string; shipmentNumber: string; carrierName: string | null;
  trackingNumber: string | null; dispatchType: string | null;
  transportName: string | null; lrNumber: string | null; awbNumber: string | null;
  status: string; amount: number | null; isCod: boolean; codAmount: number | null;
  dispatchDate: string; orderId: string; orderNo: string;
  customerName: string; customerPhone: string | null;
  shippingAddress: string | null; salesAgentName: string | null; notes: string | null;
};

type DispatchOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; salesAgentName?: string;
  shipTo: string; weightKg: number; orderDate: string;
  totalItems: number; readyItems: ReadyItem[];
  dispatchType?: DispatchMethod;
  paymentType?: "COD" | "PREPAID";
  isCod: boolean; codAmount: number | null;
};

type RateQuote = { rateId: string; carrierName: string; amount: number; currency: string; estimatedDays: number; };
type DispatchMethod = "COURIER" | "TRANSPORT" | "BY_HAND" | "SELF_COLLECTED";
type TransportForm = { transportName: string; lrNumber: string; transportChargesType: "TOPAY" | "PREPAID"; transportBy: string; totalTransportCharges: string; notes: string };
type DirectForm = { deliveryBoyName: string; collectedByName: string; collectedByPhone: string; otp: string };

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
function parseNotes(notes?: string) {
  if (!notes) return {};
  const size = notes.match(/Size:\s*([^,]+)/)?.[1]?.trim();
  const gsm = notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim();
  const sides = notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim();
  return { size, gsm, sides };
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
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, Set<string>>>({});
  const [rates, setRates] = useState<Record<string, RateQuote[]>>({});
  const [ratesLoading, setRatesLoading] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState<Record<string, string>>({});
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [courierFilter, setCourierFilter] = useState("ALL");
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<Record<string, string>>({});
  const [customPickup, setCustomPickup] = useState<Record<string, { name: string; pincode: string }>>({});
  const [weightOverride, setWeightOverride] = useState<Record<string, string>>({});
  const [dispatchMethod, setDispatchMethod] = useState<Record<string, DispatchMethod>>({});
  const [transportForm, setTransportForm] = useState<Record<string, TransportForm>>({});
  const [directForm, setDirectForm] = useState<Record<string, DirectForm>>({});
  const [history, setHistory] = useState<ShipmentHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");

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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/history?limit=100`, { headers: getAuthHeaders() });
      if (res.ok) setHistory(await res.json());
    } finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (tab === "history") void loadHistory(); }, [tab, loadHistory]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/dispatch/warehouses`, { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : [])
      .then((data: Warehouse[]) => {
        if (Array.isArray(data) && data.length > 0) setWarehouses(data);
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

  async function fetchRates(orderId: string) {
    setRatesLoading(orderId);
    try {
      const wid = selectedWarehouse[orderId] || warehouses[0]?.id || "";
      const pickup = customPickup[orderId];
      const warehouse = warehouses.find(w => w.id === wid);
      const wkg = parseFloat(weightOverride[orderId] || "0");
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
      const res = await fetch(`${API_BASE_URL}/dispatch/rates/${orderId}?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) { alert("Could not fetch rates"); return; }
      const data = await res.json();
      setRates(prev => ({ ...prev, [orderId]: data.rates }));
      if (data.rates?.length) setSelectedRate(prev => ({ ...prev, [orderId]: data.rates[0].rateId }));
    } finally { setRatesLoading(null); }
  }

  async function book(orderId: string) {
    const itemIds = Array.from(selectedItems[orderId] ?? []);
    if (itemIds.length === 0) { alert("Select at least one item"); return; }
    const rateId = selectedRate[orderId];
    if (!rateId) { alert("Fetch and select a shipping rate first"); return; }
    const orderData = orders.find(o => o.id === orderId);
    const wid = selectedWarehouse[orderId] || warehouses[0]?.id;
    const pickup = customPickup[orderId];
    const warehouse = warehouses.find(w => w.id === wid);
    if (wid === "CUSTOM" && !pickup?.pincode?.trim()) { alert("Enter pickup pincode"); return; }
    setBookingId(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/book`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId, itemIds, rateId,
          isCod: orderData?.isCod ?? false,
          codAmount: orderData?.codAmount ?? undefined,
          warehouseId: wid,
          pickupName: wid === "CUSTOM" ? (pickup?.name.trim() || "Custom Pickup") : warehouse?.name,
          pickupLocation: wid === "CUSTOM" ? (pickup?.name.trim() || "Custom Pickup") : warehouse?.location,
          pickupPincode: wid === "CUSTOM" ? pickup?.pincode.trim() : warehouse?.pincode,
          weightKgOverride: parseFloat(weightOverride[orderId] || "0") || undefined,
        }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        alert(Array.isArray(b.message) ? b.message.join(", ") : (b.message || "Booking failed"));
        return;
      }
      const result = await res.json();
      alert(`✅ Dispatched! Shipment: ${result.shipmentNumber} via ${result.carrierName}`);
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
      if (!res.ok) { const b = await res.json(); alert(b.message || "Could not send OTP"); return; }
      alert("OTP sent to customer. Enter OTP here after parcel is received.");
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
      (h.shipmentNumber ?? "").toLowerCase().includes(q)
    );
  }, [history, historySearch]);

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Dispatch</h1>
              <p className="mt-0.5 text-sm text-slate-600">Select items to dispatch — partial or full.</p>
            </div>
            {/* Tab switcher */}
            <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
              <button onClick={() => setTab("queue")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold transition ${tab === "queue" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <Package className="h-3.5 w-3.5" /> Queue ({orders.length})
              </button>
              <button onClick={() => setTab("history")}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-semibold border-l border-slate-200 transition ${tab === "history" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <History className="h-3.5 w-3.5" /> History
              </button>
            </div>
          </div>

          {/* ── HISTORY TAB ── */}
          {tab === "history" && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input type="text" value={historySearch} onChange={e => setHistorySearch(e.target.value)}
                    placeholder="Search order, customer, courier, tracking…"
                    className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
                </div>
                <button onClick={() => void loadHistory()} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                  <Loader2 className={`h-3 w-3 ${historyLoading ? "animate-spin" : ""}`} /> Refresh
                </button>
                <span className="text-xs text-slate-400">{filteredHistory.length} shipment{filteredHistory.length !== 1 ? "s" : ""}</span>
              </div>
              {historyLoading ? (
                <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
              ) : filteredHistory.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-400 shadow-sm">
                  <History className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No shipment history found.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <table className="w-full text-xs">
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
                        <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredHistory.map(h => (
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
                          <td className="px-4 py-2.5 text-center">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              h.status === "DELIVERED" ? "bg-green-100 text-green-700" :
                              h.status === "IN_TRANSIT" ? "bg-blue-100 text-blue-700" :
                              h.status === "PACKED" ? "bg-yellow-100 text-yellow-700" :
                              "bg-slate-100 text-slate-600"
                            }`}>{h.status}</span>
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
          {/* Search */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search order, customer, phone, agent…"
                className="w-full rounded-lg border border-slate-200 pl-8 pr-3 py-1.5 text-xs outline-none focus:border-blue-400" />
            </div>
            {allCarriers.length > 0 && (
              <select value={courierFilter} onChange={e => setCourierFilter(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400 bg-white">
                <option value="ALL">All Couriers</option>
                {allCarriers.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
            {search && (
              <button onClick={() => setSearch("")} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-500 hover:bg-slate-50 flex items-center gap-1">
                <X className="h-3 w-3" /> Clear
              </button>
            )}
            <span className="text-xs text-slate-400 self-center">{filtered.length} order{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

          {loading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-blue-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white py-16 text-center text-slate-500 shadow-sm">
              {orders.length === 0
                ? "No items ready for dispatch. Mark items as Ready for Dispatch in Production first."
                : "No orders match your search."}
            </div>
          ) : (
            <div className="space-y-6">
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

                return (
                  <div key={o.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {/* Header */}
                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 shrink-0 mt-0.5">
                            <Package className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <p className="font-bold text-slate-900">{o.orderNo}</p>
                              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${ageColor(o.orderDate)}`}>{orderAge(o.orderDate)}</span>
                              {o.salesAgentName && (
                                <span className="rounded-full bg-blue-50 text-blue-700 px-2 py-0.5 text-xs font-semibold border border-blue-100">👤 {o.salesAgentName}</span>
                              )}
                              {o.isCod ? (
                                <span className="rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-bold border border-amber-200">COD{o.codAmount ? ` ${fmt(o.codAmount)}` : ""}</span>
                              ) : (
                                <span className="rounded-full bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-bold border border-emerald-200">PREPAID</span>
                              )}
                            </div>
                            <p className="font-semibold text-slate-800">{o.customerName}</p>
                            {o.customerPhone && <p className="text-xs text-slate-500">📞 {o.customerPhone}</p>}
                            {/* Full Ship-To address */}
                            {o.shipTo && o.shipTo !== "—" && (
                              <div className="mt-1.5 flex items-start gap-1 text-xs text-slate-600">
                                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                                <span className="leading-relaxed">{o.shipTo}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Right column: stats + pickup */}
                        <div className="flex flex-col gap-2 items-end shrink-0">
                          <div className="flex gap-4 text-xs text-right">
                            <div>
                              <p className="text-slate-500">Ready Items</p>
                              <p className="font-semibold text-emerald-600">{o.readyItems.length} of {o.totalItems}</p>
                            </div>
                            <div>
                              <p className="text-slate-500">Sel. Weight</p>
                              <p className="font-semibold text-slate-700">{selectedWeight.toFixed(2)} kg</p>
                            </div>
                          </div>
                          {/* Pickup from */}
                          {activeWarehouse && (
                            <div className="flex items-start gap-1 text-xs text-slate-500 text-right">
                              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span>
                                Pickup: <span className="font-semibold text-slate-700">{activeWarehouse.name}</span> · Pin {activeWarehouse.pincode}
                                {activePickupAddress && <span className="block max-w-[280px] truncate text-[10px] text-slate-400">{activePickupAddress}</span>}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Items */}
                    <div className="px-6 py-4 border-b border-slate-100">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Items to Dispatch</p>
                        <button onClick={() => toggleAll(o.id, o.readyItems)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800">
                          {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                          {allSelected ? "Deselect All" : "Select All"}
                        </button>
                      </div>
                      <div className="space-y-2">
                        {o.readyItems.map((item, idx) => {
                          const { size, gsm, sides } = parseNotes(item.productionNotes);
                          const isSelected = orderSelected.has(item.id);
                          return (
                            <div key={item.id} onClick={() => toggleItem(o.id, item.id)}
                              className={`cursor-pointer rounded-xl border-2 p-3 transition ${isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                              <div className="flex items-center gap-3">
                                {isSelected ? <CheckSquare className="h-5 w-5 text-blue-600 shrink-0" /> : <Square className="h-5 w-5 text-slate-400 shrink-0" />}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-bold">{o.orderNo}-{idx + 1}</span>
                                    <span className="font-semibold text-slate-900 text-sm">{item.productName}</span>
                                    <span className="text-xs text-slate-500">({item.sku})</span>
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-600">
                                    <span>Qty: <strong>{item.quantity}</strong></span>
                                    {size && <span>Size: <strong>{size}</strong></span>}
                                    {gsm && <span>GSM: <strong>{gsm}</strong></span>}
                                    {sides && <span>Sides: <strong>{sides === "SINGLE_SIDE" ? "Single" : sides === "DOUBLE_SIDE" ? "Double" : sides}</strong></span>}
                                    <span>Weight: <strong>{item.weightKg.toFixed(2)} kg</strong></span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Dispatch method */}
                    <div className="px-6 py-4">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Dispatch Method</p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {[
                          { key: "COURIER", label: "Courier" },
                          { key: "TRANSPORT", label: "Transport" },
                          { key: "BY_HAND", label: "By Hand" },
                          { key: "SELF_COLLECTED", label: "Self Collected" },
                        ].map(option => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => {
                              setDispatchMethod(prev => ({ ...prev, [o.id]: option.key as DispatchMethod }));
                              setRates(prev => ({ ...prev, [o.id]: [] }));
                              setSelectedRate(prev => ({ ...prev, [o.id]: "" }));
                            }}
                            className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${method === option.key ? "border-blue-500 bg-blue-50 text-blue-800" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Courier */}
                    {method === "COURIER" && (
                    <div className="px-6 py-4 border-t border-slate-100">
                      <div className="flex flex-wrap items-end gap-3 mb-3">
                        <div className="flex-1 min-w-[160px]">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Shipping</p>
                          <select
                            value={selectedPickupId}
                            onChange={e => {
                              setSelectedWarehouse(prev => ({ ...prev, [o.id]: e.target.value }));
                              setRates(prev => ({ ...prev, [o.id]: [] }));
                              setSelectedRate(prev => ({ ...prev, [o.id]: "" }));
                            }}
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400 bg-white">
                            {warehouses.map(w => (
                              <option key={w.id} value={w.id}>{w.name} ({w.pincode}){w.source === "shiprocket" ? " - Shiprocket" : ""}</option>
                            ))}
                            <option value="CUSTOM">Edit pickup location...</option>
                          </select>
                          {selectedPickupId === "CUSTOM" && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <input
                                type="text"
                                placeholder="Pickup name"
                                value={pickupDraft.name}
                                onChange={e => setCustomPickup(prev => ({ ...prev, [o.id]: { ...(prev[o.id] || { name: "", pincode: "" }), name: e.target.value } }))}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400"
                              />
                              <input
                                type="text"
                                inputMode="numeric"
                                maxLength={6}
                                placeholder="Pickup pincode"
                                value={pickupDraft.pincode}
                                onChange={e => setCustomPickup(prev => ({ ...prev, [o.id]: { ...(prev[o.id] || { name: "", pincode: "" }), pincode: e.target.value.replace(/\D/g, "").slice(0, 6) } }))}
                                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400"
                              />
                            </div>
                          )}
                          {selectedPickupId !== "CUSTOM" && activePickupAddress && (
                            <p className="mt-1 text-[10px] leading-snug text-slate-500">
                              {activePickupAddress}
                            </p>
                          )}
                        </div>
                        <div className="min-w-[110px]">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Weight (kg)</p>
                          <input
                            type="number" step="0.1" min="0.1"
                            placeholder={selectedWeight.toFixed(2)}
                            value={weightOverride[o.id] || ""}
                            onChange={e => setWeightOverride(prev => ({ ...prev, [o.id]: e.target.value }))}
                            className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-blue-400"
                          />
                        </div>
                        <button onClick={() => fetchRates(o.id)} disabled={ratesLoading === o.id || !someSelected}
                          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50 self-end">
                          {ratesLoading === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                          Fetch Rates
                        </button>
                      </div>
                      {orderRates.length > 0 && (
                        <>
                          <div className="grid gap-3 sm:grid-cols-3 mb-4">
                            {orderRates
                              .filter(r => courierFilter === "ALL" || r.carrierName === courierFilter)
                              .map(r => (
                                <label key={r.rateId}
                                  className={`cursor-pointer rounded-xl border-2 p-4 transition ${selectedRate[o.id] === r.rateId ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"}`}>
                                  <input type="radio" name={`rate-${o.id}`} className="sr-only"
                                    checked={selectedRate[o.id] === r.rateId}
                                    onChange={() => setSelectedRate(prev => ({ ...prev, [o.id]: r.rateId }))} />
                                  <p className="font-semibold text-slate-900 text-sm">{r.carrierName}</p>
                                  <p className="mt-1 text-lg font-bold text-blue-700">{fmt(r.amount)}</p>
                                  <p className="mt-1 text-xs text-slate-500">~{r.estimatedDays} days</p>
                                </label>
                              ))}
                          </div>
                          <div className="flex justify-end">
                            <button onClick={() => book(o.id)} disabled={bookingId === o.id || !someSelected}
                              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                              {bookingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                              Dispatch {orderSelected.size} Item{orderSelected.size !== 1 ? "s" : ""}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    )}

                    {/* Transport */}
                    {method === "TRANSPORT" && (
                      <div className="px-6 py-4 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Transport Details</p>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <input value={transport.transportName} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, transportName: e.target.value } }))} placeholder="Transport name" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                          <input value={transport.lrNumber} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, lrNumber: e.target.value } }))} placeholder="LR number" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                          <select value={transport.transportChargesType} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, transportChargesType: e.target.value as "TOPAY" | "PREPAID" } }))} className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400 bg-white">
                            <option value="TOPAY">To Pay</option>
                            <option value="PREPAID">Prepaid</option>
                          </select>
                          <input value={transport.transportBy} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, transportBy: e.target.value } }))} placeholder="Booked by" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                        </div>
                        {transport.transportChargesType === "PREPAID" && (
                          <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr]">
                            <input type="number" min="0" value={transport.totalTransportCharges} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, totalTransportCharges: e.target.value } }))} placeholder="Total transport charges" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                            <input value={transport.notes} onChange={e => setTransportForm(prev => ({ ...prev, [o.id]: { ...transport, notes: e.target.value } }))} placeholder="Transport notes" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                          </div>
                        )}
                        {transport.transportChargesType === "TOPAY" && (
                          <p className="mt-2 text-[10px] text-slate-500">To Pay transport charges will be collected by the transport company from the customer, so no ERP charge is required.</p>
                        )}
                        <div className="mt-3 flex justify-end">
                          <button onClick={() => bookTransport(o.id)} disabled={bookingId === o.id || !someSelected}
                            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                            {bookingId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                            Dispatch by Transport
                          </button>
                        </div>
                      </div>
                    )}

                    {/* By hand / self collected */}
                    {(method === "BY_HAND" || method === "SELF_COLLECTED") && (
                      <div className="px-6 py-4 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{method === "BY_HAND" ? "By Hand Delivery OTP" : "Self Collected OTP"}</p>
                        <div className="grid gap-2 sm:grid-cols-4">
                          {method === "BY_HAND" ? (
                            <input value={direct.deliveryBoyName} onChange={e => setDirectForm(prev => ({ ...prev, [o.id]: { ...direct, deliveryBoyName: e.target.value } }))} placeholder="Delivery boy name" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                          ) : (
                            <>
                              <input value={direct.collectedByName} onChange={e => setDirectForm(prev => ({ ...prev, [o.id]: { ...direct, collectedByName: e.target.value } }))} placeholder="Collected by name" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                              <input value={direct.collectedByPhone} onChange={e => setDirectForm(prev => ({ ...prev, [o.id]: { ...direct, collectedByPhone: e.target.value } }))} placeholder="Collector phone" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                            </>
                          )}
                          <input value={direct.otp} onChange={e => setDirectForm(prev => ({ ...prev, [o.id]: { ...direct, otp: e.target.value.replace(/\D/g, "").slice(0, 6) } }))} placeholder="Enter customer OTP" className="rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400" />
                          <button onClick={() => sendDirectOtp(o.id, method as "BY_HAND" | "SELF_COLLECTED")} disabled={bookingId === o.id || !someSelected} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50">Send OTP</button>
                          <button onClick={() => verifyDirectOtp(o.id)} disabled={bookingId === o.id || !someSelected} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Verify & Deliver</button>
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
    </DashboardShell>
  );
}
