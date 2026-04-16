"use client";
import React, { useCallback, useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Package, Truck, CheckSquare, Square, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";

type ReadyItem = { id: string; productName: string; sku: string; quantity: number; productionNotes?: string; weightKg: number; };

type DispatchOrder = {
  id: string; orderNo: string; customerName: string;
  customerPhone?: string; salesAgentName?: string;
  shipTo: string; weightKg: number; orderDate: string;
  totalItems: number; readyItems: ReadyItem[];
};

type RateQuote = { rateId: string; carrierName: string; amount: number; currency: string; estimatedDays: number; };

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
}
function parseNotes(notes?: string) {
  if (!notes) return {};
  const size = notes.match(/Size:\s*([^,]+)/)?.[1]?.trim();
  const gsm = notes.match(/GSM:\s*([^,]+)/)?.[1]?.trim();
  const sides = notes.match(/Sides:\s*([^,]+)/)?.[1]?.trim();
  return { size, gsm, sides };
}

export default function DispatchPage() {
  const router = useRouter();
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

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/orders`, { headers: getAuthHeaders() });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { setError("Could not load dispatch queue"); return; }
      const data = await res.json();
      setOrders(Array.isArray(data) ? data : []);
      const initSelected: Record<string, Set<string>> = {};
      for (const o of data) initSelected[o.id] = new Set(o.readyItems.map((i: ReadyItem) => i.id));
      setSelectedItems(initSelected);
    } catch { setError("Network error."); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

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
      const res = await fetch(`${API_BASE_URL}/dispatch/rates/${orderId}`, { headers: getAuthHeaders() });
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
    setBookingId(orderId);
    try {
      const res = await fetch(`${API_BASE_URL}/dispatch/book`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, itemIds, rateId }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { const b = await res.json(); alert(b.message || "Booking failed"); return; }
      const result = await res.json();
      alert(`✅ Dispatched! Shipment: ${result.shipmentNumber} via ${result.carrierName}`);
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

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Dispatch</h1>
            <p className="mt-0.5 text-sm text-slate-600">Select items to dispatch — partial or full.</p>
          </div>

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

                return (
                  <div key={o.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    {/* Header */}
                    <div className="bg-slate-50 border-b border-slate-200 px-6 py-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-5">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 shrink-0">
                            <Package className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900">{o.orderNo}</p>
                            <p className="text-sm text-slate-600">{o.customerName}</p>
                            {o.customerPhone && <p className="text-xs text-slate-500">{o.customerPhone}</p>}
                          </div>
                          {o.salesAgentName && (
                            <span className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-1 text-xs font-semibold border border-blue-100">
                              👤 {o.salesAgentName}
                            </span>
                          )}
                          <div>
                            <p className="text-xs text-slate-500">Ship To</p>
                            <p className="text-sm text-slate-700 max-w-[200px] truncate">{o.shipTo}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Ready Items</p>
                            <p className="text-sm font-semibold text-emerald-600">{o.readyItems.length} of {o.totalItems}</p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Selected Weight</p>
                            <p className="text-sm font-semibold text-slate-700">{selectedWeight.toFixed(2)} kg</p>
                          </div>
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

                    {/* Rates */}
                    <div className="px-6 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Shipping</p>
                        <button onClick={() => fetchRates(o.id)} disabled={ratesLoading === o.id || !someSelected}
                          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-50">
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