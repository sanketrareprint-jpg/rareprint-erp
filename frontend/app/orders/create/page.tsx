"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Product = { id: string; name: string; sku: string; gsm: number; sizeInches: string; sides: string; };
type LineItem = { productId: string; sizeInches: string; gsm: number; sides: string; quantity: number; unitPrice: number; lineTotal: number; specialInstructions: string; };

const LEAD_SOURCES = [
  { value: "", label: "Select source..." },
  { value: "WALK_IN", label: "Walk In" },
  { value: "REPEAT_PURCHASE", label: "Repeat Purchase" },
  { value: "REFERRAL", label: "Referral" },
  { value: "FB_AD", label: "FB Ad" },
  { value: "GOOGLE_AD", label: "Google Ad" },
  { value: "AISENSY_CAMPAIGN", label: "AiSensy Campaign" },
  { value: "INSTAGRAM", label: "Instagram" },
  { value: "WHATSAPP", label: "WhatsApp" },
  { value: "OTHER", label: "Other" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

function emptyLine(): LineItem {
  return { productId: "", sizeInches: "", gsm: 0, sides: "SINGLE_SIDE", quantity: 1, unitPrice: 0, lineTotal: 0, specialInstructions: "" };
}

const S = {
  input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" },
  label: { display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  section: { background: "white", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "14px 16px", marginBottom: "10px" },
  sectionTitle: { fontSize: "12px", fontWeight: 700, color: "#0f172a", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #f1f5f9" },
};

export default function CreateOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "" });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [orderNotes, setOrderNotes] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadMonth, setLeadMonth] = useState(String(new Date().getMonth() + 1));
  const [leadYear, setLeadYear] = useState(String(CURRENT_YEAR));

  const needsDate = leadSource === "FB_AD" || leadSource === "AISENSY_CAMPAIGN";

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/products`, { headers: getAuthHeaders() });
    if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
    setProducts(await res.json());
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function updateLine(index: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === "productId" && typeof value === "string") {
        const prod = products.find(p => p.id === value);
        item.productId  = value;
        item.sizeInches = prod?.sizeInches ?? "";
        item.gsm        = prod?.gsm ?? 0;
        item.sides      = prod?.sides ?? "SINGLE_SIDE";
      } else if (field === "lineTotal" && typeof value === "number") {
        item.lineTotal  = value;
        item.unitPrice  = item.quantity > 0 ? value / item.quantity : 0;
      } else if (field === "quantity" && typeof value === "number") {
        item.quantity   = value;
        item.lineTotal  = value * item.unitPrice;
      } else if (field === "unitPrice" && typeof value === "number") {
        item.unitPrice  = value;
        item.lineTotal  = item.quantity * value;
      } else {
        (item as Record<string, unknown>)[field] = value;
      }
      updated[index] = item;
      return updated;
    });
  }

  const orderTotal = lineItems.reduce((sum, i) => sum + (i.lineTotal || i.quantity * i.unitPrice), 0);

  async function submitOrder() {
    if (!customer.name.trim()) { alert("Customer name is required"); return; }
    if (lineItems.some(i => !i.productId || i.quantity <= 0)) {
      alert("Please fill all product lines"); return;
    }
    setSubmitting(true);
    try {
      const leadSourceValue = leadSource
        ? (needsDate ? `${leadSource}_${MONTHS[Number(leadMonth) - 1]}_${leadYear}` : leadSource)
        : undefined;

      const res = await fetch(`${API_BASE_URL}/orders`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          customer,
          items: lineItems.map(i => ({
            productId:       i.productId,
            quantity:        i.quantity,
            unitPrice:       i.unitPrice || (i.lineTotal / i.quantity),
            artworkNotes:    i.specialInstructions || undefined,
            productionNotes: `Size: ${i.sizeInches}, GSM: ${i.gsm}, Sides: ${i.sides}`,
          })),
          notes:      orderNotes || undefined,
          leadSource: leadSourceValue,
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      router.push("/orders");
    } finally { setSubmitting(false); }
  }

  return (
    <DashboardShell>
      <div style={{ padding: "1rem 1.5rem", maxWidth: "900px", margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: 0 }}>Create New Order</h1>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>Fill in customer and product details</p>
          </div>
          <button onClick={() => router.push("/orders")}
            style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 12px", fontSize: "12px", color: "#334155", background: "white", cursor: "pointer" }}>
            ← Back
          </button>
        </div>

        {/* Top row: Customer + Lead Source + Notes */}
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "10px", marginBottom: "10px" }}>

          {/* Customer Details */}
          <div style={S.section}>
            <p style={S.sectionTitle}>Customer Details</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Full Name *</label>
                <input value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))}
                  placeholder="Customer / Business Name" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Phone</label>
                <input value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))}
                  placeholder="09XXXXXXXXX" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Email</label>
                <input value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))}
                  placeholder="email@example.com" style={S.input} />
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Address</label>
                <input value={customer.address} onChange={e => setCustomer(c => ({ ...c, address: e.target.value }))}
                  placeholder="Street address" style={S.input} />
              </div>
              <div>
                <label style={S.label}>City</label>
                <input value={customer.city} onChange={e => setCustomer(c => ({ ...c, city: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>State</label>
                <input value={customer.state} onChange={e => setCustomer(c => ({ ...c, state: e.target.value }))} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Pincode</label>
                <input value={customer.pincode} onChange={e => setCustomer(c => ({ ...c, pincode: e.target.value }))} style={S.input} />
              </div>
            </div>
          </div>

          {/* Lead Source + Notes stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={S.section}>
              <p style={S.sectionTitle}>Lead Source</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>
                  <label style={S.label}>Source</label>
                  <select value={leadSource} onChange={e => setLeadSource(e.target.value)} style={S.input}>
                    {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                {needsDate && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <div>
                      <label style={S.label}>Month</label>
                      <select value={leadMonth} onChange={e => setLeadMonth(e.target.value)} style={S.input}>
                        {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Year</label>
                      <select value={leadYear} onChange={e => setLeadYear(e.target.value)} style={S.input}>
                        {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={S.section}>
              <p style={S.sectionTitle}>Order Notes</p>
              <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows={4}
                placeholder="Any additional notes or instructions..."
                style={{ ...S.input, resize: "vertical" }} />
            </div>
          </div>
        </div>

        {/* Products */}
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
                <select value={item.productId} onChange={e => updateLine(idx, "productId", e.target.value)} style={S.input}>
                  <option value="">Select...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <input value={item.sizeInches} onChange={e => updateLine(idx, "sizeInches", e.target.value)} placeholder="4x5" style={S.input} />
                <input type="number" value={item.gsm || ""} onChange={e => updateLine(idx, "gsm", Number(e.target.value))} placeholder="70" style={S.input} />
                <select value={item.sides} onChange={e => updateLine(idx, "sides", e.target.value)} style={S.input}>
                  <option value="SINGLE_SIDE">Single</option>
                  <option value="DOUBLE_SIDE">Double</option>
                </select>
                <input type="number" min={1} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} style={S.input} />
                <input type="number" min={0} value={item.unitPrice || ""} onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))} placeholder="0.00" style={S.input} />
                <input type="number" min={0}
                  value={item.lineTotal || (item.quantity * item.unitPrice) || ""}
                  onChange={e => updateLine(idx, "lineTotal", Number(e.target.value))}
                  placeholder="Total ₹"
                  style={{ ...S.input, background: "#f0fdf4", borderColor: "#86efac", fontWeight: 600, color: "#15803d" }} />
                {lineItems.length > 1 ? (
                  <button onClick={() => setLineItems(p => p.filter((_, i) => i !== idx))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: "2px" }}>
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                ) : <div />}
              </div>
              <div style={{ marginBottom: "8px" }}>
                <input value={item.specialInstructions}
                  onChange={e => updateLine(idx, "specialInstructions", e.target.value)}
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
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "12px", color: "#64748b" }}>Order Total: </span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>{fmt(orderTotal)}</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingBottom: "24px" }}>
          <button onClick={() => router.push("/orders")}
            style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "8px 16px", fontSize: "13px", fontWeight: 500, color: "#334155", background: "white", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={submitOrder} disabled={submitting}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", border: "none", background: "#2563eb", padding: "8px 20px", fontSize: "13px", fontWeight: 600, color: "white", cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? <Loader2 style={{ width: 15, height: 15 }} /> : <Plus style={{ width: 15, height: 15 }} />}
            Create Order
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}
