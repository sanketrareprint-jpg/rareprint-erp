"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Product = { id: string; name: string; sku: string; gsm: number; sizeInches: string; sides: string; };
type PaymentAccount = { id: string; name: string; bankName?: string; };
type LineItem = { productId: string; sizeInches: string; gsm: number; sides: string; quantity: number; unitPrice: number; lineTotal: number; specialInstructions: string; };

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash", UPI: "UPI (GPay/PhonePe/Paytm)",
  BANK_TRANSFER: "Bank Transfer / NEFT / RTGS",
  CHEQUE: "Cheque", CARD: "Card (POS)",
};

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

export default function CreateOrderPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState({ name: "", phone: "", email: "", address: "", city: "", state: "", pincode: "" });
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState("CASH");
  const [advanceAccountId, setAdvanceAccountId] = useState("");
  const [advanceReference, setAdvanceReference] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [leadMonth, setLeadMonth] = useState(String(new Date().getMonth() + 1));
  const [leadYear, setLeadYear] = useState(String(CURRENT_YEAR));

  const needsDate = leadSource === "FB_AD" || leadSource === "AISENSY_CAMPAIGN";

  const load = useCallback(async () => {
    const headers = getAuthHeaders();
    const [pRes, aRes] = await Promise.all([
      fetch(`${API_BASE_URL}/products`, { headers }),
      fetch(`${API_BASE_URL}/orders/payment-accounts`, { headers }),
    ]);
    if (pRes.status === 401) { clearAuth(); router.replace("/login"); return; }
    setProducts(await pRes.json());
    const accs = await aRes.json();
    setAccounts(accs);
    if (accs.length > 0) setAdvanceAccountId(accs[0].id);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function updateLine(index: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === "productId" && typeof value === "string") {
        const prod = products.find(p => p.id === value);
        item.productId = value;
        item.sizeInches = prod?.sizeInches ?? "";
        item.gsm = prod?.gsm ?? 0;
        item.sides = prod?.sides ?? "SINGLE_SIDE";
      } else if (field === "lineTotal" && typeof value === "number") {
        item.lineTotal = value;
        item.unitPrice = item.quantity > 0 ? value / item.quantity : 0;
      } else if (field === "quantity" && typeof value === "number") {
        item.quantity = value;
        item.lineTotal = value * item.unitPrice;
      } else if (field === "unitPrice" && typeof value === "number") {
        item.unitPrice = value;
        item.lineTotal = item.quantity * value;
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
    if (lineItems.some(i => !i.productId || i.quantity <= 0 || (i.unitPrice <= 0 && i.lineTotal <= 0))) {
      alert("Please fill all product lines with quantity and amount"); return;
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
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice > 0 ? i.unitPrice : (i.lineTotal / i.quantity),
            artworkNotes: i.specialInstructions || undefined,
            productionNotes: `Size: ${i.sizeInches}, GSM: ${i.gsm}, Sides: ${i.sides}`,
          })),
          advanceAmount: advanceAmount ? Number(advanceAmount) : undefined,
          paymentMethod: advanceMethod,
          paymentAccountId: advanceAccountId || undefined,
          referenceNumber: advanceReference || undefined,
          notes: orderNotes || undefined,
          leadSource: leadSourceValue,
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      router.push("/orders");
    } finally { setSubmitting(false); }
  }

  const inputStyle = { width: "100%", borderRadius: "0.5rem", border: "1px solid #e2e8f0", padding: "0.5rem 0.75rem", fontSize: "0.875rem", boxSizing: "border-box" as const };
  const labelStyle = { display: "block", fontSize: "0.75rem", fontWeight: 500, color: "#64748b", marginBottom: "0.25rem" };
  const sectionStyle = { background: "white", borderRadius: "0.75rem", border: "1px solid #e2e8f0", padding: "1.5rem", marginBottom: "1rem" };
  const gridStyle = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" };

  return (
    <DashboardShell>
      <div style={{ padding: "2rem", maxWidth: "56rem", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0f172a" }}>Create New Order</h1>
            <p style={{ fontSize: "0.875rem", color: "#64748b", marginTop: "0.25rem" }}>Fill in the details below to create a new order.</p>
          </div>
          <button onClick={() => router.push("/orders")}
            style={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", padding: "0.5rem 1rem", fontSize: "0.875rem", color: "#334155", background: "white", cursor: "pointer" }}>
            ← Back to Orders
          </button>
        </div>

        {/* Customer */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0f172a", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #f1f5f9" }}>Customer Details</h3>
          <div style={gridStyle}>
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Full Name *</label>
              <input value={customer.name} onChange={e => setCustomer(c => ({ ...c, name: e.target.value }))} placeholder="Customer / Business Name" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Phone</label>
              <input value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} placeholder="09XXXXXXXXX" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} placeholder="email@example.com" style={inputStyle} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={labelStyle}>Address</label>
              <input value={customer.address} onChange={e => setCustomer(c => ({ ...c, address: e.target.value }))} placeholder="Street address" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>City</label>
              <input value={customer.city} onChange={e => setCustomer(c => ({ ...c, city: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <input value={customer.state} onChange={e => setCustomer(c => ({ ...c, state: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Pincode</label>
              <input value={customer.pincode} onChange={e => setCustomer(c => ({ ...c, pincode: e.target.value }))} style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Lead Source */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0f172a", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #f1f5f9" }}>Lead Source</h3>
          <div style={{ display: "grid", gridTemplateColumns: needsDate ? "1fr 1fr 1fr" : "1fr", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Source</label>
              <select value={leadSource} onChange={e => setLeadSource(e.target.value)} style={inputStyle}>
                {LEAD_SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {needsDate && (
              <>
                <div>
                  <label style={labelStyle}>Month</label>
                  <select value={leadMonth} onChange={e => setLeadMonth(e.target.value)} style={inputStyle}>
                    {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Year</label>
                  <select value={leadYear} onChange={e => setLeadYear(e.target.value)} style={inputStyle}>
                    {YEARS.map(y => <option key={y} value={String(y)}>{y}</option>)}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Products */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0f172a", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #f1f5f9" }}>Products / Line Items</h3>
          {lineItems.map((item, idx) => (
            <div key={idx} style={{ background: "#f8fafc", borderRadius: "0.5rem", border: "1px solid #e2e8f0", padding: "1rem", marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#64748b" }}>ITEM {idx + 1}</span>
                {lineItems.length > 1 && (
                  <button onClick={() => setLineItems(p => p.filter((_, i) => i !== idx))}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
                    <Trash2 style={{ width: 16, height: 16 }} />
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
                <div style={{ gridColumn: "span 3" }}>
                  <label style={labelStyle}>Product *</label>
                  <select value={item.productId} onChange={e => updateLine(idx, "productId", e.target.value)} style={{ ...inputStyle, background: "white" }}>
                    <option value="">Select product...</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Size (inches)</label>
                  <input value={item.sizeInches} onChange={e => updateLine(idx, "sizeInches", e.target.value)} placeholder="e.g. 4x5" style={{ ...inputStyle, background: "white" }} />
                </div>
                <div>
                  <label style={labelStyle}>GSM</label>
                  <input type="number" value={item.gsm || ""} onChange={e => updateLine(idx, "gsm", Number(e.target.value))} placeholder="70" style={{ ...inputStyle, background: "white" }} />
                </div>
                <div>
                  <label style={labelStyle}>Sides</label>
                  <select value={item.sides} onChange={e => updateLine(idx, "sides", e.target.value)} style={{ ...inputStyle, background: "white" }}>
                    <option value="SINGLE_SIDE">Single Side</option>
                    <option value="DOUBLE_SIDE">Double Side</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Quantity *</label>
                  <input type="number" min={1} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} style={{ ...inputStyle, background: "white" }} />
                </div>
                <div>
                  <label style={labelStyle}>Rate per unit (₹)</label>
                  <input type="number" min={0} value={item.unitPrice || ""} onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))} placeholder="0.00" style={{ ...inputStyle, background: "white" }} />
                </div>
                <div>
                  <label style={labelStyle}>Total Amount (₹) *</label>
                  <input type="number" min={0}
                    value={item.lineTotal || ""}
                    onChange={e => updateLine(idx, "lineTotal", Number(e.target.value))}
                    placeholder="Enter total"
                    style={{ ...inputStyle, background: "#f0fdf4", borderColor: "#86efac", fontWeight: 600 }} />
                </div>
                <div style={{ gridColumn: "span 3" }}>
                  <label style={labelStyle}>Special Instructions</label>
                  <textarea value={item.specialInstructions} onChange={e => updateLine(idx, "specialInstructions", e.target.value)}
                    rows={2} placeholder="Special instructions for production..."
                    style={{ ...inputStyle, background: "white", resize: "vertical" as const }} />
                </div>
              </div>
            </div>
          ))}
          <button onClick={() => setLineItems(p => [...p, emptyLine()])}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", border: "1px dashed #93c5fd", borderRadius: "0.5rem", padding: "0.5rem 1rem", fontSize: "0.875rem", color: "#2563eb", background: "none", cursor: "pointer" }}>
            <Plus style={{ width: 16, height: 16 }} /> Add Another Product
          </button>
          <div style={{ textAlign: "right", marginTop: "0.75rem" }}>
            <span style={{ fontSize: "0.875rem", color: "#64748b" }}>Order Total: </span>
            <span style={{ fontSize: "1.25rem", fontWeight: 700, color: "#0f172a" }}>{fmt(orderTotal)}</span>
          </div>
        </div>

        {/* Advance Payment */}
        <div style={sectionStyle}>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, color: "#0f172a", marginBottom: "1rem", paddingBottom: "0.5rem", borderBottom: "1px solid #f1f5f9" }}>Advance Payment (Optional)</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            <div>
              <label style={labelStyle}>Amount (₹)</label>
              <input type="number" value={advanceAmount} onChange={e => setAdvanceAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Payment Method</label>
              <select value={advanceMethod} onChange={e => setAdvanceMethod(e.target.value)} style={inputStyle}>
                {Object.entries(METHOD_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Received In Account</label>
              <select value={advanceAccountId} onChange={e => setAdvanceAccountId(e.target.value)} style={inputStyle}>
                <option value="">Select account...</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: "span 3" }}>
              <label style={labelStyle}>Reference / UTR Number</label>
              <input value={advanceReference} onChange={e => setAdvanceReference(e.target.value)} placeholder="UTR / Cheque no. / Transaction ID" style={inputStyle} />
            </div>
          </div>
        </div>

        {/* Notes */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Order Notes</label>
          <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows={3}
            placeholder="Any additional notes..." style={{ ...inputStyle, resize: "vertical" as const }} />
        </div>

        {/* Submit */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
          <button onClick={() => router.push("/orders")}
            style={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", padding: "0.625rem 1.25rem", fontSize: "0.875rem", fontWeight: 500, color: "#334155", background: "white", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={submitOrder} disabled={submitting}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", borderRadius: "0.5rem", border: "none", background: "#2563eb", padding: "0.625rem 1.5rem", fontSize: "0.875rem", fontWeight: 600, color: "white", cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? <Loader2 style={{ width: 16, height: 16 }} /> : <Plus style={{ width: 16, height: 16 }} />}
            Create Order
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}