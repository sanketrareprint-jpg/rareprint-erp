"use client";
import React, { useEffect, useState, Suspense } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
type Product = { id: string; name: string; sku: string; gsm: number; sizeInches: string; sides: string; };
type LineItem = { productId: string; sizeInches: string; gsm: number; sides: string; quantity: number; unitPrice: number; lineTotal: number; specialInstructions: string; };
const S = {
  input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" },
  label: { display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  section: { background: "white", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "14px 16px", marginBottom: "10px" },
  sectionTitle: { fontSize: "12px", fontWeight: 700, color: "#0f172a", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #f1f5f9" },
};
function emptyLine(): LineItem {
  return { productId: "", sizeInches: "", gsm: 0, sides: "SINGLE_SIDE", quantity: 1, unitPrice: 0, lineTotal: 0, specialInstructions: "" };
}
function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}
function EditOrderPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id");
  const [products, setProducts] = useState<Product[]>([]);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [productDropdownOpen, setProductDropdownOpen] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [orderNo, setOrderNo] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "" });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [orderNotes, setOrderNotes] = useState("");
  const orderTotal = lineItems.reduce((s, i) => s + (i.lineTotal || i.quantity * i.unitPrice), 0);
  useEffect(() => {
    async function load() {
      const headers = getAuthHeaders();
      const [pRes, oRes] = await Promise.all([
        fetch(`${API_BASE_URL}/products`, { headers }),
        fetch(`${API_BASE_URL}/orders/${orderId}/detail`, { headers }),
      ]);
      if (pRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      const prods = await pRes.json();
      setProducts(Array.isArray(prods) ? prods : []);
      if (oRes.ok) {
        const o = await oRes.json();
        setOrderNo(o.orderNumber ?? "");
        const addr = (o.customerAddress ?? "").split(", ");
        setCustomer({
          name: o.customerName ?? "",
          phone: o.customerPhone ?? "",
          email: o.customerEmail ?? "",
          address: addr[0] ?? "",
          city: addr[1] ?? "",
          state: addr[2] ?? "",
          pincode: addr[3] ?? "",
        });
        setOrderNotes(o.notes ?? "");
        if (o.items?.length) {
          setLineItems(o.items.map((i: any) => ({
            productId: i.productId ?? "",
            sizeInches: i.sizeInches ?? "",
            gsm: i.gsm ?? 0,
            sides: i.sides ?? "SINGLE_SIDE",
            quantity: i.quantity ?? 1,
            unitPrice: Number(i.unitPrice) ?? 0,
            lineTotal: Number(i.lineTotal) ?? 0,
            specialInstructions: i.artworkNotes ?? "",
          })));
        }
      }
      setLoading(false);
    }
    if (orderId) load();
  }, [orderId, router]);
  function updateLine(idx: number, field: keyof LineItem, value: any) {
    setLineItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      if (field === "quantity" || field === "unitPrice") next[idx].lineTotal = next[idx].quantity * next[idx].unitPrice;
      if (field === "lineTotal") next[idx].lineTotal = value;
      if (field === "productId") {
        const p = products.find(x => x.id === value);
        if (p) { next[idx].sizeInches = p.sizeInches; next[idx].gsm = p.gsm; next[idx].sides = p.sides; }
      }
      return next;
    });
  }
  async function submitEdit() {
    if (!customer.name.trim()) { alert("Customer name required"); return; }
    if (lineItems.some(i => !i.productId)) { alert("Select product for all items"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/orders/${orderId}/edit`, {
        method: "PATCH",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ customer, notes: orderNotes, items: lineItems.map(i => ({ productId: i.productId, sizeInches: i.sizeInches, gsm: i.gsm, sides: i.sides, quantity: i.quantity, unitPrice: i.unitPrice, lineTotal: i.lineTotal || i.quantity * i.unitPrice, artworkNotes: i.specialInstructions })) }),
      });
      if (!res.ok) { const e = await res.json(); alert(e.message || "Update failed"); return; }
      alert("Order updated!");
      router.push("/orders");
    } finally { setSubmitting(false); }
  }
  if (loading) return <DashboardShell><div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"200px"}}><Loader2 style={{width:32,height:32,color:"#2563eb"}} /></div></DashboardShell>;
  return (
    <DashboardShell>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a" }}>Edit Order #{orderNo}</h1>
            <p style={{ fontSize: "12px", color: "#64748b" }}>Only editable before accounts approval</p>
          </div>
          <button onClick={() => router.push("/orders")} style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 14px", fontSize: "12px", color: "#334155", background: "white", cursor: "pointer" }}>← Back</button>
        </div>
        <div style={S.section}>
          <p style={S.sectionTitle}>Customer Details</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            {([["Full Name *","name","Customer / Business Name"],["Phone","phone","09XXXXXXXXX"],["Email","email","email@example.com"],["Address","address","Street address"],["City","city","City"],["State","state","State"],["Pincode","pincode","Pincode"]] as [string,string,string][]).map(([label,field,ph]) => (
              <div key={field}>
                <label style={S.label}>{label}</label>
                <input value={(customer as any)[field]} onChange={e => setCustomer(p => ({ ...p, [field]: e.target.value }))} placeholder={ph} style={S.input} />
              </div>
            ))}
          </div>
        </div>
        <div style={S.section}>
          <p style={S.sectionTitle}>Order Notes</p>
          <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows={3} placeholder="Any additional notes..." style={{ ...S.input, resize: "vertical" }} />
        </div>
        <div style={S.section}>
          <p style={S.sectionTitle}>Products / Line Items</p>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 70px 90px 90px 100px 90px 28px", gap: "6px", marginBottom: "4px" }}>
            {["Product","Size","GSM","Sides","Qty","Rate/Unit","Amount",""].map(h => (
              <span key={h} style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
          {lineItems.map((item, idx) => (
            <div key={idx}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 80px 70px 90px 90px 100px 100px 28px", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  <input type="text" placeholder="Search product..."
                    value={productSearch[idx] !== undefined ? productSearch[idx] : (products.find(p => p.id === item.productId) ? `${products.find(p => p.id === item.productId)!.name} | ${products.find(p => p.id === item.productId)!.sizeInches} | ${products.find(p => p.id === item.productId)!.gsm} GSM` : "")}
                    onChange={e => setProductSearch(s => ({ ...s, [idx]: e.target.value }))}
                    onFocus={() => { setProductSearch(s => ({ ...s, [idx]: "" })); setProductDropdownOpen(s => ({ ...s, [idx]: true })); }}
                    onBlur={() => setTimeout(() => { setProductDropdownOpen(s => ({ ...s, [idx]: false })); setProductSearch(s => { const n = {...s}; delete n[idx]; return n; }); }, 200)}
                    style={{ ...S.input, width: "100%" }} />
                  {productDropdownOpen[idx] && (
                    <div style={{ position: "absolute", zIndex: 999, background: "white", border: "1px solid #cbd5e1", borderRadius: 6, maxHeight: 200, overflowY: "auto", width: "100%", top: "100%", left: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                      {products.filter(p => { const q = (productSearch[idx] ?? "").toLowerCase(); return !q || p.name.toLowerCase().includes(q) || (p.sizeInches ?? "").toLowerCase().includes(q); }).map(p => (
                        <div key={p.id} onMouseDown={() => { updateLine(idx, "productId", p.id); setProductSearch(s => ({ ...s, [idx]: "" })); setProductDropdownOpen(s => ({ ...s, [idx]: false })); }}
                          style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                          onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                          {p.name} | {p.sizeInches} | {p.gsm} GSM | {p.sides === "DOUBLE_SIDE" ? "Double" : "Single"}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <input value={item.sizeInches} onChange={e => updateLine(idx, "sizeInches", e.target.value)} placeholder="4x5" style={S.input} />
                <input type="number" value={item.gsm || ""} onChange={e => updateLine(idx, "gsm", Number(e.target.value))} style={S.input} />
                <select value={item.sides} onChange={e => updateLine(idx, "sides", e.target.value)} style={S.input}>
                  <option value="SINGLE_SIDE">Single</option>
                  <option value="DOUBLE_SIDE">Double</option>
                </select>
                <input type="number" min={1} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} style={S.input} />
                <input type="number" min={0} value={item.unitPrice || ""} onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))} style={S.input} />
                <input type="number" min={0} value={item.lineTotal || (item.quantity * item.unitPrice) || ""}
                  onChange={e => updateLine(idx, "lineTotal", Number(e.target.value))}
                  style={{ ...S.input, background: "#f0fdf4", borderColor: "#86efac", fontWeight: 600, color: "#15803d" }} />
                {lineItems.length > 1 ? (
                  <button onClick={() => setLineItems(p => p.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                ) : <div />}
              </div>
              <div style={{ marginBottom: "8px" }}>
                <input value={item.specialInstructions} onChange={e => updateLine(idx, "specialInstructions", e.target.value)}
                  placeholder={`Item ${idx + 1} — special instructions (optional)`}
                  style={{ ...S.input, background: "#fffbeb", borderColor: "#fde68a", fontSize: "11px" }} />
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => setLineItems(p => [...p, emptyLine()])}
              style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px dashed #93c5fd", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: "#2563eb", background: "none", cursor: "pointer" }}>
              <Plus style={{ width: 14, height: 14 }} /> Add Item
            </button>
            <span style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>{fmt(orderTotal)}</span>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingBottom: "24px" }}>
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

export default function EditOrderPage() {
  return (
    <Suspense fallback={<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"200px"}}><div>Loading...</div></div>}>
      <EditOrderPageInner />
    </Suspense>
  );
}
