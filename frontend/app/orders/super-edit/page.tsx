"use client";
import React, { useEffect, useState, Suspense } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MobileSelect } from "@/components/MobileSelect";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

// Full-page super-admin item editor -- deliberately styled/laid out like
// /orders/edit (same S object, same "Products / Line Items" table shape) per
// Sanket's explicit instruction that the old cramped popup wasn't acceptable
// (2026-08-31). Still backed by the safe, single-item OrdersService.
// superAdminEditItem (in-place update, preserves the item's id/relations) --
// NOT the destructive whole-order editOrder() this page's styling is
// borrowed from, which deletes+recreates every item on the order.
//
// Product picker (with searchable SKU) and the Sides dropdown mirror
// /orders/create's product-picker UI verbatim, per Sanket's explicit
// request (2026-09-02) that this page give the same editing interface as
// creating a new order -- the old version had no way to change which
// product/SKU a line item pointed to, and Sides was a raw free-text box.

type Product = { id: string; name: string; sku: string; gsm: number; paperType?: string; sizeInches: string; sides: string };

const S = {
  input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" },
  label: { display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  section: { background: "white", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "14px 16px", marginBottom: "10px" },
  sectionTitle: { fontSize: "12px", fontWeight: 700, color: "#0f172a", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #f1f5f9" },
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

function SuperEditPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const itemId = searchParams.get("itemId");

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderNo, setOrderNo] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState<string | undefined>(undefined);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [form, setForm] = useState({ productId: "", quantity: "", unitPrice: "", size: "", gsm: "", paper: "", sides: "" });
  const amount = (Number(form.quantity) || 0) * (Number(form.unitPrice) || 0);
  const selectedProduct = products.find(p => p.id === form.productId);

  useEffect(() => {
    async function load() {
      if (!itemId) { setLoading(false); return; }
      const [itemRes, productsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/orders/items/${itemId}/superadmin-edit`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/products`, { headers: getAuthHeaders() }),
      ]);
      if (itemRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!itemRes.ok) { const e = await itemRes.json().catch(() => ({})); alert(e.message || "Could not load item"); router.push("/orders"); return; }
      const item = await itemRes.json();
      if (productsRes.ok) setProducts(await productsRes.json());
      setOrderNo(item.orderNo ?? "");
      setForm({
        productId: item.productId ?? "",
        quantity: String(item.quantity ?? ""),
        unitPrice: String(item.unitPrice ?? ""),
        size: item.size ?? "",
        gsm: item.gsm ?? "",
        paper: item.paper ?? "",
        sides: item.sides ?? "",
      });
      setLoading(false);
    }
    load();
  }, [itemId, router]);

  function selectProduct(p: Product) {
    setForm(f => ({
      ...f,
      productId: p.id,
      size: p.sizeInches ?? f.size,
      gsm: p.gsm != null ? String(p.gsm) : f.gsm,
      paper: p.paperType ?? f.paper,
      sides: p.sides ?? f.sides,
    }));
    setProductSearch(undefined);
    setProductDropdownOpen(false);
  }

  async function submitEdit() {
    if (!itemId) return;
    if ((Number(form.quantity) || 0) <= 0) { alert("Quantity must be greater than 0"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/orders/items/${itemId}/superadmin-edit`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: form.productId || undefined,
          quantity: form.quantity ? Number(form.quantity) : undefined,
          unitPrice: form.unitPrice ? Number(form.unitPrice) : undefined,
          size: form.size || undefined,
          gsm: form.gsm || undefined,
          paperType: form.paper || undefined,
          sides: form.sides || undefined,
        }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || "Update failed"); return; }
      alert("Item updated. This order has been sent back to Accounts for re-approval.");
      router.push("/orders");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <DashboardShell><div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px" }}><Loader2 style={{ width: 32, height: 32, color: "#2563eb" }} /></div></DashboardShell>;

  return (
    <DashboardShell>
      <div className="create-order-page" style={{ maxWidth: 900, margin: "0 auto", padding: "16px" }}>
        <div className="create-order-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Super-admin Edit — Order #{orderNo}</h1>
            <p style={{ fontSize: "12px", color: "#64748b" }}>Editable any time before this item is dispatched.</p>
          </div>
          <button onClick={() => router.push("/orders")} style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 14px", fontSize: "12px", color: "#334155", background: "white", cursor: "pointer" }}>← Back</button>
        </div>

        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "10px 14px", marginBottom: "10px", fontSize: "12px", color: "#92400e" }}>
          Changing the product/quantity/amount/quality recalculates the order total and payment status, and sends the whole order back to Accounts for re-approval. Every edit is logged for audit.
        </div>

        <div className="create-order-section" style={S.section}>
          <p style={S.sectionTitle}>Product / Line Item</p>
          <div className="create-order-product-head" style={{ display: "grid", gridTemplateColumns: "2.4fr 85px 65px 90px 85px 85px 105px 105px", gap: "8px", marginBottom: "4px" }}>
            {["Product", "Size", "GSM", "Paper", "Sides", "Qty", "Rate/Unit", "Amount"].map(h => (
              <span key={h} style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
          <div className="create-order-product-row" style={{ display: "grid", gridTemplateColumns: "2.4fr 85px 65px 90px 85px 85px 105px 105px", gap: "8px", alignItems: "center" }}>
            <div className="create-order-product-picker" style={{ position: "relative" }}>
              <input
                type="text"
                placeholder="Search product or product code..."
                value={productSearch !== undefined ? productSearch : (selectedProduct ? `[${selectedProduct.sku}] ${selectedProduct.name} | ${selectedProduct.sizeInches} | ${selectedProduct.gsm} GSM${selectedProduct.paperType ? ` | ${selectedProduct.paperType}` : ""}` : "")}
                onChange={e => setProductSearch(e.target.value)}
                onFocus={e => { e.target.select(); setProductDropdownOpen(true); }}
                onBlur={() => setTimeout(() => { setProductDropdownOpen(false); setProductSearch(undefined); }, 200)}
                style={{ ...S.input, width: "100%" }}
              />
              {productDropdownOpen && (
                <div style={{ position: "absolute", zIndex: 999, background: "white", border: "1px solid #cbd5e1", borderRadius: 6, maxHeight: 220, overflowY: "auto", width: "100%", top: "100%", left: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                  {products
                    .filter(p => {
                      const q = (productSearch ?? "").toLowerCase();
                      return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.sizeInches ?? "").toLowerCase().includes(q);
                    })
                    .map(p => (
                      <div key={p.id}
                        onMouseDown={() => selectProduct(p)}
                        style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                        onMouseLeave={e => (e.currentTarget.style.background = "white")}
                      >
                        <span style={{ fontWeight: 700, color: "#ee1c25" }}>[{p.sku}]</span> {p.name} | {p.sizeInches} | {p.gsm} GSM{p.paperType ? ` | ${p.paperType}` : ""} | {p.sides === "DOUBLE_SIDE" ? "Double" : "Single"}
                      </div>
                    ))}
                </div>
              )}
            </div>
            <input value={form.size} onChange={e => setForm(f => ({ ...f, size: e.target.value }))} placeholder="4x5" style={S.input} />
            <input value={form.gsm} onChange={e => setForm(f => ({ ...f, gsm: e.target.value }))} style={S.input} />
            <input value={form.paper} onChange={e => setForm(f => ({ ...f, paper: e.target.value }))} style={S.input} />
            <MobileSelect value={form.sides} onChange={v => setForm(f => ({ ...f, sides: v }))} style={S.input}
              options={[
                { value: "SINGLE_SIDE", label: "Single" },
                { value: "DOUBLE_SIDE", label: "Double" },
              ]} />
            <input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} style={S.input} />
            <input type="number" min={0} value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} style={S.input} />
            <div style={{ ...S.input, background: "#f0fdf4", borderColor: "#86efac", fontWeight: 600, color: "#15803d", display: "flex", alignItems: "center" }}>{fmt(amount)}</div>
          </div>
        </div>

        <div className="create-order-submit-row" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingBottom: "24px" }}>
          <button onClick={() => router.push("/orders")} style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "8px 16px", fontSize: "13px", color: "#334155", background: "white", cursor: "pointer" }}>Cancel</button>
          <button onClick={submitEdit} disabled={submitting}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", border: "none", background: "#f59e0b", padding: "8px 20px", fontSize: "13px", fontWeight: 600, color: "white", cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? <Loader2 style={{ width: 15, height: 15 }} /> : null}
            {submitting ? "Saving..." : "💾 Save Changes"}
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}

export default function SuperEditPage() {
  return (
    <Suspense fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px" }}><div>Loading...</div></div>}>
      <SuperEditPageInner />
    </Suspense>
  );
}
