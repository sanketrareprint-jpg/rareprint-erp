"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import DateInput from "@/components/DateInput";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, Trash2, TicketPercent } from "lucide-react";

// Order-level offers — created here by an admin, picked once per order on
// Create Order. Prices and commission for offer lines are worked out by the
// backend (backend/src/offers); this page only defines the offers.

type Product = { id: string; name: string; sku: string };
type OfferType = "DISCOUNT" | "FREE_ON_QTY" | "COMBO";
type ComboRow = { productId: string; quantity: string; lineTotal: string };
type Offer = {
  id: string; code: string; description: string | null; offerType: OfferType; notes: string | null;
  isActive: boolean; validFrom: string | null; validTo: string | null; productIds: string[];
  discountMode: "AMOUNT" | "PERCENT" | null; discountValue: number | null;
  buyProductId: string | null; buyQuantity: number | null; freeProductId: string | null; freeQuantity: number | null;
  comboItems: Array<{ productId: string; quantity: number; lineTotal: number }> | null;
  usedOnLines: number;
};

const TYPE_LABEL: Record<OfferType, string> = { DISCOUNT: "Discount", FREE_ON_QTY: "Free Item", COMBO: "Combo" };
const TYPE_STYLE: Record<OfferType, string> = {
  DISCOUNT: "bg-green-50 text-green-700 border-green-100",
  FREE_ON_QTY: "bg-purple-50 text-purple-700 border-purple-100",
  COMBO: "bg-amber-50 text-amber-700 border-amber-100",
};
const INPUT = "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300";
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const emptyComboRow = (): ComboRow => ({ productId: "", quantity: "", lineTotal: "" });

export default function OffersPage() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [saving, setSaving] = useState(false);

  const [offerType, setOfferType] = useState<OfferType>("DISCOUNT");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [discountMode, setDiscountMode] = useState<"AMOUNT" | "PERCENT">("AMOUNT");
  const [discountValue, setDiscountValue] = useState("");
  const [discountProductIds, setDiscountProductIds] = useState<string[]>([]);
  const [buyProductId, setBuyProductId] = useState("");
  const [buyQuantity, setBuyQuantity] = useState("");
  const [freeProductId, setFreeProductId] = useState("");
  const [freeQuantity, setFreeQuantity] = useState("");
  const [comboRows, setComboRows] = useState<ComboRow[]>([emptyComboRow(), emptyComboRow()]);

  const load = useCallback(async () => {
    const [offersRes, productsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/offers`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/products`, { headers: getAuthHeaders() }),
    ]);
    if (offersRes.status === 403) { setForbidden(true); setLoading(false); return; }
    if (offersRes.ok) setOffers(await offersRes.json());
    if (productsRes.ok) setProducts(await productsRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const productName = (id: string | null) => products.find(p => p.id === id)?.name ?? id ?? "—";
  const comboTotal = comboRows.reduce((s, r) => s + (Number(r.lineTotal) || 0), 0);

  function resetForm() {
    setCode(""); setDescription(""); setNotes(""); setValidFrom(""); setValidTo("");
    setDiscountValue(""); setDiscountProductIds([]);
    setBuyProductId(""); setBuyQuantity(""); setFreeProductId(""); setFreeQuantity("");
    setComboRows([emptyComboRow(), emptyComboRow()]);
  }

  async function createOffer() {
    if (!code.trim()) { alert("Offer code is required"); return; }
    if (!description.trim()) { alert("Offer text is required"); return; }
    const body: Record<string, unknown> = {
      code, description, offerType, notes: notes || undefined,
      validFrom: validFrom || undefined, validTo: validTo || undefined,
    };
    if (offerType === "DISCOUNT") {
      Object.assign(body, { discountMode, discountValue: Number(discountValue), productIds: discountProductIds });
    } else if (offerType === "FREE_ON_QTY") {
      Object.assign(body, { buyProductId, buyQuantity: Number(buyQuantity), freeProductId, freeQuantity: Number(freeQuantity) });
    } else {
      body.comboItems = comboRows
        .filter(r => r.productId || r.quantity || r.lineTotal)
        .map(r => ({ productId: r.productId, quantity: Number(r.quantity), lineTotal: Number(r.lineTotal) }));
    }
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/offers`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { alert(data.message || "Could not create the offer"); return; }
      setOffers(prev => [{ ...data, usedOnLines: 0 }, ...prev]);
      resetForm();
    } finally { setSaving(false); }
  }

  async function toggleActive(offer: Offer) {
    const res = await fetch(`${API_BASE_URL}/offers/${offer.id}/active`, {
      method: "PATCH",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !offer.isActive }),
    });
    if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Could not update the offer"); return; }
    setOffers(prev => prev.map(o => o.id === offer.id ? { ...o, isActive: !o.isActive } : o));
  }

  async function deleteOffer(offer: Offer) {
    if (!confirm(`Delete offer "${offer.code}"?`)) return;
    const res = await fetch(`${API_BASE_URL}/offers/${offer.id}`, { method: "DELETE", headers: getAuthHeaders() });
    if (!res.ok) { const b = await res.json().catch(() => ({})); alert(b.message || "Could not delete the offer"); return; }
    setOffers(prev => prev.filter(o => o.id !== offer.id));
  }

  function describeRule(o: Offer) {
    if (o.offerType === "DISCOUNT") {
      const off = o.discountMode === "PERCENT" ? `${o.discountValue}% off` : `${inr(o.discountValue ?? 0)} off each line`;
      const on = o.productIds.length ? o.productIds.map(productName).join(", ") : "all products";
      return `${off} the rate-card price — ${on}`;
    }
    if (o.offerType === "FREE_ON_QTY") {
      return `Buy ${o.buyQuantity} × ${productName(o.buyProductId)} → ${o.freeQuantity} × ${productName(o.freeProductId)} free`;
    }
    const items = o.comboItems ?? [];
    const total = items.reduce((s, i) => s + i.lineTotal, 0);
    return `${items.map(i => `${i.quantity} × ${productName(i.productId)} (${inr(i.lineTotal)})`).join(" + ")} = ${inr(total)}`;
  }

  const productOptions = products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>);

  return (
    <DashboardShell>
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3">
          <TicketPercent size={20} className="shrink-0 self-start mt-1 text-indigo-500" />
          <div>
            <h1 className="font-semibold text-gray-900 text-lg">Offers</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Sales agents pick one offer per order on Create Order. Offer lines load with locked quantity and price, and the order goes to Accounts for approval as usual.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-400" /></div>
        ) : forbidden ? (
          <p className="text-sm text-gray-500">Only administrators can manage offers.</p>
        ) : (
          <>
            {/* Create */}
            <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">Create Offer</p>

              <div className="grid grid-cols-3 gap-2">
                {(["DISCOUNT", "FREE_ON_QTY", "COMBO"] as OfferType[]).map(t => (
                  <button key={t} type="button" onClick={() => setOfferType(t)}
                    className={`text-xs font-semibold py-2 rounded-lg border transition-colors ${offerType === t ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
                {offerType === "DISCOUNT" && "A fixed ₹ amount or % off the Cost Table rate-card price, on selected products or all products."}
                {offerType === "FREE_ON_QTY" && "Buy a fixed quantity of one product, get a fixed quantity of another free. The bought line is charged at its rate-card price."}
                {offerType === "COMBO" && "Fixed products at fixed quantities for a fixed price."}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Offer Code *</label>
                  <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="e.g. DIWALI10" className={INPUT} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Offer Text * <span className="text-gray-400">(shown to agents)</span></label>
                  <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. 10% off all envelopes" className={INPUT} />
                </div>
              </div>

              {offerType === "DISCOUNT" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">Discount Type *</label>
                      <select value={discountMode} onChange={e => setDiscountMode(e.target.value as "AMOUNT" | "PERCENT")} className={INPUT}>
                        <option value="AMOUNT">₹ amount off each line</option>
                        <option value="PERCENT">% off</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600">{discountMode === "PERCENT" ? "Discount %" : "Discount ₹"} *</label>
                      <input type="number" min={0} value={discountValue} onChange={e => setDiscountValue(e.target.value)} className={INPUT} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Products <span className="text-gray-400">(none selected = all products; Ctrl/Cmd-click to pick several)</span></label>
                    <select multiple value={discountProductIds} onChange={e => setDiscountProductIds(Array.from(e.target.selectedOptions, o => o.value))} className={`${INPUT} min-h-[100px]`}>
                      {productOptions}
                    </select>
                  </div>
                </div>
              )}

              {offerType === "FREE_ON_QTY" && (
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Product to Buy *</label>
                    <select value={buyProductId} onChange={e => setBuyProductId(e.target.value)} className={INPUT}>
                      <option value="">Select product…</option>{productOptions}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Buy Qty *</label>
                    <input type="number" min={1} value={buyQuantity} onChange={e => setBuyQuantity(e.target.value)} className={INPUT} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Free Product *</label>
                    <select value={freeProductId} onChange={e => setFreeProductId(e.target.value)} className={INPUT}>
                      <option value="">Select product…</option>{productOptions}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Free Qty *</label>
                    <input type="number" min={1} value={freeQuantity} onChange={e => setFreeQuantity(e.target.value)} className={INPUT} />
                  </div>
                </div>
              )}

              {offerType === "COMBO" && (
                <div className="space-y-2">
                  {comboRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_90px_110px_28px] gap-2 items-end">
                      <div className="space-y-1">
                        {idx === 0 && <label className="text-xs font-medium text-gray-600">Product *</label>}
                        <select value={row.productId} onChange={e => setComboRows(prev => prev.map((r, i) => i === idx ? { ...r, productId: e.target.value } : r))} className={INPUT}>
                          <option value="">Select product…</option>{productOptions}
                        </select>
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && <label className="text-xs font-medium text-gray-600">Qty *</label>}
                        <input type="number" min={1} value={row.quantity} onChange={e => setComboRows(prev => prev.map((r, i) => i === idx ? { ...r, quantity: e.target.value } : r))} className={INPUT} />
                      </div>
                      <div className="space-y-1">
                        {idx === 0 && <label className="text-xs font-medium text-gray-600">Amount ₹ *</label>}
                        <input type="number" min={0} value={row.lineTotal} onChange={e => setComboRows(prev => prev.map((r, i) => i === idx ? { ...r, lineTotal: e.target.value } : r))} className={INPUT} />
                      </div>
                      <button type="button" disabled={comboRows.length <= 1} onClick={() => setComboRows(prev => prev.filter((_, i) => i !== idx))}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-30 mb-1">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center justify-between">
                    <button type="button" onClick={() => setComboRows(prev => [...prev, emptyComboRow()])}
                      className="inline-flex items-center gap-1 text-xs text-indigo-600 border border-dashed border-indigo-200 rounded-lg px-3 py-1.5">
                      <Plus size={12} /> Add product
                    </button>
                    <span className="text-sm text-gray-700">Combo price: <strong>{inr(comboTotal)}</strong></span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Valid From</label>
                  <DateInput value={validFrom} onChange={e => setValidFrom(e.target.value)} className={INPUT} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Valid To (blank = no expiry)</label>
                  <DateInput value={validTo} onChange={e => setValidTo(e.target.value)} className={INPUT} />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Notes for Accounts Team</label>
                <input value={notes} onChange={e => setNotes(e.target.value)} className={INPUT} />
              </div>

              <div className="flex justify-end">
                <button type="button" onClick={createOffer} disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 text-white text-sm font-semibold px-4 py-2 disabled:opacity-60">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create Offer
                </button>
              </div>
            </section>

            {/* List */}
            <section className="bg-white border border-gray-200 rounded-2xl p-5 space-y-2 shadow-sm">
              <p className="text-sm font-semibold text-gray-900">All Offers</p>
              {offers.length === 0 && <p className="text-xs text-gray-400">No offers yet.</p>}
              {offers.map(o => {
                // Valid To is inclusive until 23:59 IST (same as the backend's isOfferInWindow).
                const expired = !!o.validTo && new Date(o.validTo).getTime() + 86400000 - 19800000 <= Date.now();
                const live = o.isActive && !expired;
                return (
                  <div key={o.id} className={`rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 ${live ? "" : "opacity-60"}`}>
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-indigo-700 text-sm bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">{o.code}</span>
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium border ${TYPE_STYLE[o.offerType]}`}>{TYPE_LABEL[o.offerType]}</span>
                          <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${live ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {expired ? "Expired" : o.isActive ? "Active" : "Inactive"}
                          </span>
                          {o.usedOnLines > 0 && <span className="text-xs text-gray-500">used on {o.usedOnLines} order line(s)</span>}
                        </div>
                        {o.description && <p className="text-xs text-gray-700 mt-1">{o.description}</p>}
                        <p className="text-xs text-gray-500 mt-1">{describeRule(o)}</p>
                        {o.notes && <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">📋 {o.notes}</p>}
                        {(o.validFrom || o.validTo) && (
                          <p className="text-xs text-gray-400 mt-1">
                            Valid: {o.validFrom ? new Date(o.validFrom).toLocaleDateString("en-IN") : "—"} → {o.validTo ? new Date(o.validTo).toLocaleDateString("en-IN") : "No end date"}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button type="button" onClick={() => toggleActive(o)} className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-100 text-gray-600">
                          {o.isActive ? "Deactivate" : "Activate"}
                        </button>
                        {o.usedOnLines === 0 && (
                          <button type="button" onClick={() => deleteOffer(o)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
