"use client";
import React, { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MobileSelect } from "@/components/MobileSelect";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

// Upsell an already-approved order: raise qty/rate on existing items (never
// lower — enforced again on the backend) and/or add new items under the same
// order number. Nothing changes on the order until Accounts approves the
// request (Accounts > Order Approval > Upsell Requests).

type Product = { id: string; name: string; sku: string; gsm: number; paperType?: string; sizeInches: string; sides: string };
type UpsellItem = {
  id: string; productId: string; productName: string;
  size: string; gsm: string; paper: string; sides: string;
  quantity: number; unitPrice: number; lineTotal: number;
  itemProductionStage: string;
};
type UpsellOrder = {
  id: string; orderNo: string; orderDate: string; status: string;
  customerName: string; customerPhone?: string | null; grandTotal: number;
  upsellPending: boolean; cancellationPending: boolean;
  items: UpsellItem[];
};
type EditedItem = { quantity: number; unitPrice: number };
type NewLine = { productId: string; sizeInches: string; gsm: number; paperType: string; sides: string; quantity: number; unitPrice: number; specialInstructions: string };

const S = {
  input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" },
  label: { display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  section: { background: "white", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "14px 16px", marginBottom: "10px" },
  sectionTitle: { fontSize: "12px", fontWeight: 700, color: "#0f172a", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #f1f5f9" },
};
const STATUS_LABEL: Record<string, string> = { APPROVED: "Approved", IN_PRODUCTION: "In Production", READY_FOR_DISPATCH: "Ready for Dispatch" };
const STAGE_LABEL: Record<string, string> = { NOT_PRINTED: "Not Printed", PRINTING: "Printing", PROCESSING: "Processing", READY_FOR_DISPATCH: "Ready" };

function emptyLine(): NewLine {
  return { productId: "", sizeInches: "", gsm: 0, paperType: "", sides: "SINGLE_SIDE", quantity: 1, unitPrice: 0, specialInstructions: "" };
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}
// Same 2-decimal rounding the backend applies, so the totals shown here
// match what Accounts will see.
function lineAmount(quantity: number, unitPrice: number) {
  return Math.round(quantity * unitPrice * 100) / 100;
}

export default function UpsellOrderPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<UpsellOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [edited, setEdited] = useState<Record<string, EditedItem>>({});
  const [newLines, setNewLines] = useState<NewLine[]>([]);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [productDropdownOpen, setProductDropdownOpen] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const headers = getAuthHeaders();
        const [oRes, pRes] = await Promise.all([
          fetch(`${API_BASE_URL}/orders/upsell/eligible`, { headers }),
          fetch(`${API_BASE_URL}/products`, { headers }),
        ]);
        if (oRes.status === 401 || pRes.status === 401) { clearAuth(); router.replace("/login"); return; }
        if (!oRes.ok) { setLoadError("Could not load your orders. Please retry."); return; }
        setOrders(await oRes.json());
        const prods = await pRes.json().catch(() => []);
        setProducts(Array.isArray(prods) ? prods : []);
      } catch {
        setLoadError("Could not load your orders. Please retry.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [router]);

  const selected = orders.find(o => o.id === selectedId) ?? null;

  const filteredOrders = useMemo(() => {
    const q = orderSearch.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(o => o.orderNo.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q) || (o.customerPhone ?? "").includes(q));
  }, [orders, orderSearch]);

  function selectOrder(o: UpsellOrder) {
    if (o.upsellPending || o.cancellationPending) return;
    setSelectedId(o.id);
    setEdited(Object.fromEntries(o.items.map(i => [i.id, { quantity: i.quantity, unitPrice: i.unitPrice }])));
    setNewLines([]);
    setProductSearch({});
    setProductDropdownOpen({});
  }

  function updateExisting(itemId: string, field: keyof EditedItem, value: number) {
    setEdited(prev => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  }

  function updateNewLine(idx: number, field: keyof NewLine, value: any) {
    setNewLines(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "productId") {
        const p = products.find(x => x.id === value);
        if (p) { next[idx].sizeInches = p.sizeInches; next[idx].gsm = p.gsm; next[idx].paperType = p.paperType ?? ""; next[idx].sides = p.sides; }
      }
      return next;
    });
  }

  // Amount shown for an existing row: unchanged rows keep their billed
  // lineTotal (can differ from qty × rate on older orders); changed rows are
  // qty × rate, the same as the backend.
  function existingAmount(item: UpsellItem) {
    const e = edited[item.id];
    if (!e || (e.quantity === item.quantity && e.unitPrice === item.unitPrice)) return item.lineTotal;
    return lineAmount(e.quantity, e.unitPrice);
  }

  const existingProblems = selected ? selected.items.filter(i => {
    const e = edited[i.id];
    if (!e) return false;
    return !Number.isInteger(e.quantity) || e.quantity < i.quantity || !(e.unitPrice >= i.unitPrice) || existingAmount(i) < i.lineTotal;
  }) : [];
  const changedCount = selected ? selected.items.filter(i => {
    const e = edited[i.id];
    return e && (e.quantity !== i.quantity || e.unitPrice !== i.unitPrice);
  }).length : 0;
  const newTotal = selected
    ? selected.items.reduce((s, i) => s + existingAmount(i), 0) + newLines.reduce((s, l) => s + lineAmount(l.quantity, l.unitPrice), 0)
    : 0;
  const currentItemsTotal = selected ? selected.items.reduce((s, i) => s + i.lineTotal, 0) : 0;
  const addedAmount = Math.round((newTotal - currentItemsTotal) * 100) / 100;

  async function submitUpsell() {
    if (!selected) return;
    if (existingProblems.length > 0) {
      alert(`Quantity and rate can only be increased. Check: ${existingProblems.map(i => i.productName).join(", ")}`);
      return;
    }
    if (newLines.some(l => !l.productId)) { alert("Select a product for every new item"); return; }
    if (newLines.some(l => !Number.isInteger(l.quantity) || l.quantity <= 0)) { alert("Quantity must be greater than 0 for every new item"); return; }
    if (newLines.some(l => !(l.unitPrice >= 0))) { alert("Enter a valid rate for every new item"); return; }
    if (changedCount === 0 && newLines.length === 0) { alert("Nothing to upsell — raise a quantity/rate or add an item"); return; }
    if (!confirm(`Send this upsell of ${fmt(addedAmount)} on order #${selected.orderNo} to Accounts for approval? The order stays as it is until Accounts approves.`)) return;

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${selected.id}/upsell`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          items: selected.items.map(i => ({ itemId: i.id, quantity: edited[i.id]?.quantity ?? i.quantity, unitPrice: edited[i.id]?.unitPrice ?? i.unitPrice })),
          newItems: newLines.map(l => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, sizeInches: l.sizeInches, gsm: l.gsm, paperType: l.paperType, sides: l.sides, artworkNotes: l.specialInstructions })),
        }),
      });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || "Failed to submit upsell"); return; }
      alert("Upsell sent to Accounts for approval.");
      router.push("/orders");
    } finally { setSubmitting(false); }
  }

  if (loading) return <DashboardShell><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px" }}><Loader2 style={{ width: 32, height: 32, color: "#2563eb" }} className="animate-spin" /></div></DashboardShell>;

  return (
    <DashboardShell>
      <div className="create-order-page" style={{ maxWidth: 900, margin: "0 auto", padding: "16px" }}>
        <div className="create-order-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Upsell Order{selected ? ` #${selected.orderNo}` : ""}</h1>
            <p style={{ fontSize: "12px", color: "#64748b" }}>Increase quantity/rate or add items to an approved order. Goes to Accounts for approval.</p>
          </div>
          <button onClick={() => router.push("/orders")} style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 14px", fontSize: "12px", color: "#334155", background: "white", cursor: "pointer" }}>← Back</button>
        </div>

        {loadError && (
          <div role="alert" style={{ ...S.section, borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b", fontSize: "13px" }}>{loadError}</div>
        )}

        {/* Step 1 — pick the order */}
        <div className="create-order-section" style={S.section}>
          <p style={S.sectionTitle}>Select Order</p>
          {selected ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "12px", color: "#0f172a" }}>
                <b>#{selected.orderNo}</b> · {selected.customerName} · {STATUS_LABEL[selected.status] ?? selected.status} · Current total <b>{fmt(selected.grandTotal)}</b>
              </div>
              <button onClick={() => setSelectedId(null)} style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "4px 10px", fontSize: "12px", color: "#334155", background: "white", cursor: "pointer" }}>Change order</button>
            </div>
          ) : (
            <>
              <input value={orderSearch} onChange={e => setOrderSearch(e.target.value)} placeholder="Search order no, customer or phone…" style={{ ...S.input, marginBottom: "8px" }} />
              {filteredOrders.length === 0 ? (
                <p style={{ fontSize: "12px", color: "#94a3b8", padding: "12px 0", textAlign: "center" }}>
                  {orders.length === 0 ? "No approved orders available to upsell. Only Approved / In Production / Ready for Dispatch orders with nothing dispatched can be upsold." : "No orders match your search."}
                </p>
              ) : (
                <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid #f1f5f9", borderRadius: "6px" }}>
                  {filteredOrders.map(o => {
                    const blocked = o.upsellPending || o.cancellationPending;
                    return (
                      <div key={o.id} onClick={() => selectOrder(o)}
                        style={{ padding: "8px 10px", borderBottom: "1px solid #f1f5f9", cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.55 : 1, fontSize: "12px", display: "flex", justifyContent: "space-between", gap: "8px" }}
                        onMouseEnter={e => { if (!blocked) e.currentTarget.style.background = "#f0f9ff"; }}
                        onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                        <span>
                          <b>#{o.orderNo}</b> · {o.customerName} · {new Date(o.orderDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          {o.upsellPending && <span style={{ marginLeft: 6, color: "#b45309", fontWeight: 600 }}>Upsell pending approval</span>}
                          {o.cancellationPending && <span style={{ marginLeft: 6, color: "#b91c1c", fontWeight: 600 }}>Cancellation pending</span>}
                        </span>
                        <span style={{ whiteSpace: "nowrap", color: "#475569" }}>{STATUS_LABEL[o.status] ?? o.status} · {fmt(o.grandTotal)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <>
            {/* Step 2 — raise existing items */}
            <div className="create-order-section" style={S.section}>
              <p style={S.sectionTitle}>Current Items — quantity and rate can only be increased</p>
              <div className="create-order-product-head" style={{ display: "grid", gridTemplateColumns: "2fr 90px 80px 95px 95px", gap: "6px", marginBottom: "4px" }}>
                {["Product", "Stage", "Qty", "Rate/Unit", "Amount"].map(h => (
                  <span key={h} style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</span>
                ))}
              </div>
              {selected.items.map(item => {
                const e = edited[item.id] ?? { quantity: item.quantity, unitPrice: item.unitPrice };
                const bad = existingProblems.some(p => p.id === item.id);
                const started = item.itemProductionStage !== "NOT_PRINTED";
                return (
                  <div key={item.id} style={{ marginBottom: "8px" }}>
                    <div className="create-order-product-row" style={{ display: "grid", gridTemplateColumns: "2fr 90px 80px 95px 95px", gap: "6px", alignItems: "center" }}>
                      <div style={{ fontSize: "12px", color: "#0f172a" }}>
                        <div style={{ fontWeight: 600 }}>{item.productName}</div>
                        <div style={{ fontSize: "11px", color: "#64748b" }}>{[item.size, item.gsm && `${item.gsm} GSM`, item.paper, item.sides].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span style={{ fontSize: "11px", fontWeight: 600, color: started ? "#b45309" : "#475569" }}>{STAGE_LABEL[item.itemProductionStage] ?? item.itemProductionStage}</span>
                      <input type="number" min={item.quantity} value={e.quantity} onChange={ev => updateExisting(item.id, "quantity", Number(ev.target.value))}
                        style={{ ...S.input, borderColor: bad ? "#f87171" : "#e2e8f0" }} />
                      <input type="number" min={item.unitPrice} step="0.01" value={e.unitPrice} onChange={ev => updateExisting(item.id, "unitPrice", Number(ev.target.value))}
                        style={{ ...S.input, borderColor: bad ? "#f87171" : "#e2e8f0" }} />
                      <div style={{ ...S.input, background: "#f0fdf4", borderColor: "#86efac", fontWeight: 600, color: "#15803d" }}>{fmt(existingAmount(item))}</div>
                    </div>
                    {bad && <p style={{ fontSize: "11px", color: "#dc2626", marginTop: "2px" }}>Can't go below qty {item.quantity}, rate {item.unitPrice} or amount {fmt(item.lineTotal)}.</p>}
                    {started && e.quantity > item.quantity && (
                      <p style={{ fontSize: "11px", color: "#b45309", marginTop: "2px" }}>Already in production — the extra {e.quantity - item.quantity} will be added as a new line to print.</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Step 3 — add new items */}
            <div className="create-order-section" style={S.section}>
              <p style={S.sectionTitle}>Add Items</p>
              {newLines.length > 0 && (
                <div className="create-order-product-head" style={{ display: "grid", gridTemplateColumns: "2fr 75px 55px 80px 75px 75px 95px 95px 28px", gap: "6px", marginBottom: "4px" }}>
                  {["Product", "Size", "GSM", "Paper", "Sides", "Qty", "Rate/Unit", "Amount", ""].map(h => (
                    <span key={h} style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</span>
                  ))}
                </div>
              )}
              {newLines.map((item, idx) => (
                <div key={idx}>
                  <div className="create-order-product-row" style={{ display: "grid", gridTemplateColumns: "2fr 75px 55px 80px 75px 75px 95px 95px 28px", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
                    <div className="create-order-product-picker" style={{ position: "relative" }}>
                      <input type="text" placeholder="Search product..."
                        value={productSearch[idx] !== undefined ? productSearch[idx] : (() => { const p = products.find(x => x.id === item.productId); return p ? `${p.name} | ${p.sizeInches} | ${p.gsm} GSM${p.paperType ? ` | ${p.paperType}` : ""}` : ""; })()}
                        onChange={e => setProductSearch(s => ({ ...s, [idx]: e.target.value }))}
                        onFocus={() => { setProductSearch(s => ({ ...s, [idx]: "" })); setProductDropdownOpen(s => ({ ...s, [idx]: true })); }}
                        onBlur={() => setTimeout(() => { setProductDropdownOpen(s => ({ ...s, [idx]: false })); setProductSearch(s => { const n = { ...s }; delete n[idx]; return n; }); }, 200)}
                        style={{ ...S.input, width: "100%" }} />
                      {productDropdownOpen[idx] && (
                        <div style={{ position: "absolute", zIndex: 999, background: "white", border: "1px solid #cbd5e1", borderRadius: 6, maxHeight: 200, overflowY: "auto", width: "100%", top: "100%", left: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                          {products.filter(p => { const q = (productSearch[idx] ?? "").toLowerCase(); return !q || p.name.toLowerCase().includes(q) || (p.sizeInches ?? "").toLowerCase().includes(q); }).map(p => (
                            <div key={p.id} onMouseDown={() => { updateNewLine(idx, "productId", p.id); setProductSearch(s => ({ ...s, [idx]: "" })); setProductDropdownOpen(s => ({ ...s, [idx]: false })); }}
                              style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}
                              onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                              onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                              {p.name} | {p.sizeInches} | {p.gsm} GSM{p.paperType ? ` | ${p.paperType}` : ""} | {p.sides === "DOUBLE_SIDE" ? "Double" : "Single"}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <input value={item.sizeInches} onChange={e => updateNewLine(idx, "sizeInches", e.target.value)} placeholder="4x5" style={S.input} />
                    <input type="number" value={item.gsm || ""} onChange={e => updateNewLine(idx, "gsm", Number(e.target.value))} style={S.input} />
                    <div style={{ ...S.input, background: "#f8fafc", color: item.paperType ? "#0f172a" : "#94a3b8", fontSize: "11px", display: "flex", alignItems: "center" }}>
                      {item.paperType || "-"}
                    </div>
                    <MobileSelect value={item.sides} onChange={v => updateNewLine(idx, "sides", v)} style={S.input}
                      options={[
                        { value: "SINGLE_SIDE", label: "Single" },
                        { value: "DOUBLE_SIDE", label: "Double" },
                      ]} />
                    <input type="number" min={1} value={item.quantity} onChange={e => updateNewLine(idx, "quantity", Number(e.target.value))} style={S.input} />
                    <input type="number" min={0} step="0.01" value={item.unitPrice || ""} onChange={e => updateNewLine(idx, "unitPrice", Number(e.target.value))} style={S.input} />
                    <div style={{ ...S.input, background: "#f0fdf4", borderColor: "#86efac", fontWeight: 600, color: "#15803d" }}>{fmt(lineAmount(item.quantity, item.unitPrice))}</div>
                    <button onClick={() => setNewLines(p => p.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
                      <Trash2 style={{ width: 14, height: 14 }} />
                    </button>
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <input value={item.specialInstructions} onChange={e => updateNewLine(idx, "specialInstructions", e.target.value)}
                      placeholder={`New item ${idx + 1} — special instructions (optional)`}
                      style={{ ...S.input, background: "#fffbeb", borderColor: "#fde68a", fontSize: "11px" }} />
                  </div>
                </div>
              ))}
              <button onClick={() => setNewLines(p => [...p, emptyLine()])}
                style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px dashed #93c5fd", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: "#ee1c25", background: "none", cursor: "pointer" }}>
                <Plus style={{ width: 14, height: 14 }} /> Add Item
              </button>
            </div>

            {/* Totals + submit */}
            <div className="create-order-section" style={S.section}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#475569", marginBottom: "4px" }}>
                <span>Current order total</span><span>{fmt(selected.grandTotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#15803d", fontWeight: 600, marginBottom: "4px" }}>
                <span>Upsell amount</span><span>+ {fmt(addedAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "16px", fontWeight: 700, color: "#0f172a", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
                <span>New order total</span><span>{fmt(selected.grandTotal + addedAmount)}</span>
              </div>
            </div>
            <div className="create-order-submit-row" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingBottom: "24px" }}>
              <button onClick={() => router.push("/orders")} style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "8px 16px", fontSize: "13px", color: "#334155", background: "white", cursor: "pointer" }}>Cancel</button>
              <button onClick={submitUpsell} disabled={submitting}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", border: "none", background: "#059669", padding: "8px 20px", fontSize: "13px", fontWeight: 600, color: "white", cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.6 : 1 }}>
                {submitting ? <Loader2 style={{ width: 15, height: 15 }} className="animate-spin" /> : null}
                {submitting ? "Submitting..." : "Submit for Approval"}
              </button>
            </div>
          </>
        )}
      </div>
    </DashboardShell>
  );
}
