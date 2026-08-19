"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MobileSelect } from "@/components/MobileSelect";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, Trash2, PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";

type Product = { id: string; name: string; sku: string; gsm: number; paperType?: string; sizeInches: string; sides: string; };
type PaymentAccount = { id: string; name: string; accountType: string; bankName?: string };
type LineItem = { productId: string; quantity: number; unitPrice: number; specialInstructions: string };
type CustomerSearchRow = {
  id: string; businessName: string; phone?: string | null; phone2?: string | null;
  email?: string | null; address?: string | null; city?: string | null; state?: string | null; pincode?: string | null;
};
type BookedParcel = {
  id: string; orderNo: string; customerName: string; date: string; status: string;
  parcelCourierCharge: number | null; parcelPaymentType: string | null;
};

function sanitizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

function emptyLine(): LineItem {
  return { productId: "", quantity: 1, unitPrice: 0, specialInstructions: "" };
}

const S = {
  input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" },
  label: { display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  section: { background: "white", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "14px 16px", marginBottom: "10px" },
  sectionTitle: { fontSize: "12px", fontWeight: 700, color: "#0f172a", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #f1f5f9" },
};

export default function ParcelBookingPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [productDropdownOpen, setProductDropdownOpen] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [customer, setCustomer] = useState({ customerId: "", name: "", phone: "", phone2: "", email: "", address: "", city: "", state: "", pincode: "" });
  const [customerMatches, setCustomerMatches] = useState<CustomerSearchRow[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [selectedCustomerLabel, setSelectedCustomerLabel] = useState("");

  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [notes, setNotes] = useState("");

  const [courierCharge, setCourierCharge] = useState("");
  const [paymentType, setPaymentType] = useState<"COD" | "PREPAID">("COD");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentAccountId, setPaymentAccountId] = useState("");

  const [history, setHistory] = useState<BookedParcel[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const load = useCallback(async () => {
    const h = getAuthHeaders();
    const [pRes, aRes, hRes] = await Promise.all([
      fetch(`${API_BASE_URL}/products`, { headers: h }),
      fetch(`${API_BASE_URL}/orders/payment-accounts`, { headers: h }),
      fetch(`${API_BASE_URL}/orders?isParcelBooking=true&limit=25`, { headers: h }),
    ]);
    if (pRes.status === 401) { clearAuth(); router.replace("/login"); return; }
    setProducts(pRes.ok ? await pRes.json() : []);
    if (aRes.ok) {
      const accs = await aRes.json();
      setAccounts(accs);
      if (accs.length > 0) setPaymentAccountId(accs[0].id);
    }
    setHistoryLoading(false);
    if (hRes.ok) {
      const data = await hRes.json();
      setHistory(data.data ?? data ?? []);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const byPhone = customer.phone;
    if (customer.customerId && selectedCustomerLabel === customer.name) return;
    const query = byPhone.length >= 4 ? byPhone : customer.name.trim();
    if (query.trim().length < 2) { setCustomerMatches([]); setCustomerSearchOpen(false); return; }
    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({ search: query.trim(), limit: "8" });
      const res = await fetch(`${API_BASE_URL}/customer-directory/search?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const rows: CustomerSearchRow[] = data.customers ?? [];
      setCustomerMatches(rows);
      setCustomerSearchOpen(rows.length > 0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [customer.name, customer.phone, customer.customerId, selectedCustomerLabel]);

  function fillCustomer(row: CustomerSearchRow) {
    setCustomer({
      customerId: row.id, name: row.businessName ?? "", phone: row.phone ?? "", phone2: row.phone2 ?? "",
      email: row.email ?? "", address: row.address ?? "", city: row.city ?? "", state: row.state ?? "", pincode: row.pincode ?? "",
    });
    setSelectedCustomerLabel(row.businessName);
    setCustomerMatches([]);
    setCustomerSearchOpen(false);
  }

  function updateLine(index: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      (item as Record<string, unknown>)[field] = value;
      updated[index] = item;
      return updated;
    });
  }

  async function submit() {
    setSubmitAttempted(true);
    if (!customer.name.trim()) { alert("Customer name is required"); return; }
    if (!customer.phone.trim() || customer.phone.length !== 10) { alert("A 10-digit phone number is required"); return; }
    const badLineIdx = lineItems.findIndex(i => !i.productId || i.quantity <= 0);
    if (badLineIdx !== -1) { alert(`Item ${badLineIdx + 1}: select a product from the dropdown and enter a quantity greater than 0`); return; }
    const courierNum = Number(courierCharge || 0);
    if (paymentType === "PREPAID" && courierNum > 0 && !paymentAccountId) { alert("Select a payment account to record the prepaid courier charge"); return; }

    setSubmitting(true);
    try {
      const customerPayload = Object.fromEntries(Object.entries(customer).filter(([, v]) => v !== ""));
      const res = await fetch(`${API_BASE_URL}/orders`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customerPayload,
          items: lineItems.map(i => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice || 0,
            artworkNotes: i.specialInstructions || undefined,
          })),
          notes: notes || undefined,
          leadSource: "OTHER",
          isParcelBooking: true,
          courierCharge: courierNum > 0 ? courierNum : undefined,
          parcelPaymentType: paymentType,
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed to book parcel"); return; }
      const created = await res.json();
      const orderId = created?.id ?? created?.order?.id;

      // Prepaid: collect the courier charge as a real Payment now, using the
      // exact same endpoint the Orders page uses to record any payment. It
      // lands as PENDING_VERIFICATION and surfaces in Accounts > Order
      // Approval alongside the parcel itself -- no separate "receipt" system.
      if (paymentType === "PREPAID" && courierNum > 0 && orderId) {
        await fetch(`${API_BASE_URL}/orders/${orderId}/payments`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: courierNum, method: paymentMethod, paymentAccountId,
            notes: "Parcel Booking — courier charge collected prepaid",
          }),
        });
      }

      setCustomer({ customerId: "", name: "", phone: "", phone2: "", email: "", address: "", city: "", state: "", pincode: "" });
      setLineItems([emptyLine()]);
      setCourierCharge("");
      setPaymentType("COD");
      setNotes("");
      setSubmitAttempted(false);
      await load();
      alert("Parcel booked. It will now go through Accounts approval and Dispatch, same as a regular order.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardShell>
      <div style={{ padding: "1rem 1.5rem", maxWidth: "900px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
          <div>
            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <PackagePlus size={20} /> Parcel Booking
            </h1>
            <p style={{ fontSize: "12px", color: "#64748b", margin: "2px 0 0" }}>
              For free gifts / samples — not a real sale. Goes through Accounts approval and Dispatch, same as a normal order.
            </p>
          </div>
        </div>

        <div style={S.section}>
          <p style={S.sectionTitle}>Customer Details</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <div style={{ gridColumn: "span 2", position: "relative" }}>
              <label style={S.label}>Full Name *</label>
              <input value={customer.name} onChange={e => { setSelectedCustomerLabel(""); setCustomer(c => ({ ...c, customerId: "", name: e.target.value })); }}
                onFocus={() => customerMatches.length > 0 && setCustomerSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setCustomerSearchOpen(false), 180)}
                placeholder="Customer / Business Name" style={S.input} />
              {customerSearchOpen && (
                <div style={{ position: "absolute", zIndex: 1000, top: "100%", left: 0, right: 0, marginTop: "4px", maxHeight: "220px", overflowY: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", background: "white", boxShadow: "0 12px 24px rgba(15,23,42,0.14)" }}>
                  {customerMatches.map(row => (
                    <button key={row.id} type="button" onMouseDown={() => fillCustomer(row)}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderBottom: "1px solid #f1f5f9", background: "white", cursor: "pointer" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>{row.businessName}</div>
                      <div style={{ fontSize: "11px", color: "#64748b" }}>{[row.phone, row.address, row.city].filter(Boolean).join(" • ")}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={S.label}>Phone *</label>
              <input value={customer.phone} onChange={e => { setSelectedCustomerLabel(""); setCustomer(c => ({ ...c, customerId: "", phone: sanitizePhone(e.target.value) })); }}
                onFocus={() => customerMatches.length > 0 && setCustomerSearchOpen(true)}
                inputMode="numeric" maxLength={10} placeholder="10-digit mobile number" style={S.input} />
              {submitAttempted && customer.phone.length !== 10 && (
                <p style={{ margin: "3px 0 0", fontSize: "10px", color: "#dc2626", fontWeight: 600 }}>*10-digit phone number is required</p>
              )}
            </div>
            <div>
              <label style={S.label}>Email</label>
              <input value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} placeholder="email@example.com" style={S.input} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={S.label}>Address</label>
              <input value={customer.address} onChange={e => setCustomer(c => ({ ...c, address: e.target.value }))} placeholder="Street address" style={S.input} />
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
              <input value={customer.pincode} onChange={e => setCustomer(c => ({ ...c, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                inputMode="numeric" maxLength={6} style={S.input} />
            </div>
          </div>
        </div>

        <div style={S.section}>
          <p style={S.sectionTitle}>Products Being Sent</p>
          {lineItems.map((item, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "2fr 80px 95px 28px", gap: "6px", marginBottom: "6px", alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  placeholder="Search product..."
                  value={productSearch[idx] !== undefined ? productSearch[idx] : (products.find(p => p.id === item.productId)?.name ?? "")}
                  onChange={e => setProductSearch(s => ({ ...s, [idx]: e.target.value }))}
                  onFocus={e => { e.target.select(); setProductDropdownOpen(s => ({ ...s, [idx]: true })); }}
                  onBlur={() => setTimeout(() => { setProductDropdownOpen(s => ({ ...s, [idx]: false })); setProductSearch(s => { const n = { ...s }; delete n[idx]; return n; }); }, 200)}
                  style={S.input}
                />
                {productDropdownOpen[idx] && (
                  <div style={{ position: "absolute", zIndex: 999, background: "white", border: "1px solid #cbd5e1", borderRadius: 6, maxHeight: 200, overflowY: "auto", width: "100%", top: "100%", left: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                    {products.filter(p => {
                      const q = (productSearch[idx] ?? "").toLowerCase();
                      return !q || p.name.toLowerCase().includes(q);
                    }).map(p => (
                      <div key={p.id}
                        onMouseDown={() => { updateLine(idx, "productId", p.id); setProductSearch(s => { const n = { ...s }; delete n[idx]; return n; }); setProductDropdownOpen(s => ({ ...s, [idx]: false })); }}
                        style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}>
                        {p.name} | {p.sizeInches} | {p.gsm} GSM
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <input type="number" min={1} value={item.quantity} onChange={e => updateLine(idx, "quantity", Number(e.target.value))} style={S.input} />
              <input type="number" min={0} value={item.unitPrice || ""} onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))} placeholder="Value ₹ (optional)" style={S.input} />
              {lineItems.length > 1 ? (
                <button onClick={() => setLineItems(p => p.filter((_, i) => i !== idx))} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              ) : <div />}
            </div>
          ))}
          <button onClick={() => setLineItems(p => [...p, emptyLine()])}
            style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px dashed #93c5fd", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: "#ee1c25", background: "none", cursor: "pointer" }}>
            <Plus style={{ width: 14, height: 14 }} /> Add Item
          </button>
        </div>

        <div style={{ ...S.section, background: "#f0f9ff", border: "1px solid #bae6fd" }}>
          <p style={S.sectionTitle}>Courier Charge</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", alignItems: "start" }}>
            <div>
              <label style={S.label}>Courier Charge (₹)</label>
              <input type="number" min={0} value={courierCharge} onChange={e => setCourierCharge(e.target.value)} placeholder="0.00" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Payment Type</label>
              <div style={{ display: "flex", gap: "6px" }}>
                <button type="button" onClick={() => setPaymentType("COD")}
                  style={{ flex: 1, borderRadius: 6, border: paymentType === "COD" ? "1px solid #f59e0b" : "1px solid #e2e8f0", background: paymentType === "COD" ? "#fef3c7" : "white", color: paymentType === "COD" ? "#92400e" : "#64748b", fontWeight: 600, fontSize: 12, padding: "6px 0", cursor: "pointer" }}>
                  COD
                </button>
                <button type="button" onClick={() => setPaymentType("PREPAID")}
                  style={{ flex: 1, borderRadius: 6, border: paymentType === "PREPAID" ? "1px solid #16a34a" : "1px solid #e2e8f0", background: paymentType === "PREPAID" ? "#dcfce7" : "white", color: paymentType === "PREPAID" ? "#166534" : "#64748b", fontWeight: 600, fontSize: 12, padding: "6px 0", cursor: "pointer" }}>
                  Prepaid
                </button>
              </div>
            </div>
            {paymentType === "PREPAID" && Number(courierCharge || 0) > 0 && (
              <>
                <div>
                  <label style={S.label}>Payment Method</label>
                  <MobileSelect value={paymentMethod} onChange={setPaymentMethod} style={S.input}
                    options={[
                      { value: "CASH", label: "Cash" },
                      { value: "BANK_TRANSFER", label: "Bank Transfer" },
                      { value: "UPI", label: "UPI" },
                      { value: "CHEQUE", label: "Cheque" },
                      { value: "CARD", label: "Card" },
                    ]} />
                </div>
                <div>
                  <label style={S.label}>Payment Account</label>
                  <MobileSelect value={paymentAccountId} onChange={setPaymentAccountId} style={S.input}
                    placeholder="Select account..."
                    options={accounts.map(a => ({ value: a.id, label: a.name }))} />
                </div>
                <p style={{ gridColumn: "span 2", fontSize: 11, color: "#64748b", margin: 0 }}>
                  A payment receipt for ₹{Number(courierCharge || 0).toLocaleString("en-IN")} will be created and sent to Accounts for verification, same as any order payment.
                </p>
              </>
            )}
            {paymentType === "COD" && (
              <p style={{ gridColumn: "span 2", fontSize: 11, color: "#64748b", margin: 0 }}>
                Courier collects this on delivery — no payment receipt is created now.
              </p>
            )}
          </div>
        </div>

        <div style={S.section}>
          <p style={S.sectionTitle}>Notes</p>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Any additional notes..." style={{ ...S.input, resize: "vertical" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", paddingBottom: "16px" }}>
          <button onClick={submit} disabled={submitting}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", border: "none", background: "#ee1c25", padding: "8px 20px", fontSize: "13px", fontWeight: 600, color: "white", cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? <Loader2 style={{ width: 15, height: 15 }} /> : <PackagePlus style={{ width: 15, height: 15 }} />}
            Book Parcel
          </button>
        </div>

        <div style={S.section}>
          <p style={S.sectionTitle}>My Booked Parcels</p>
          {historyLoading ? (
            <p style={{ fontSize: 12, color: "#64748b" }}>Loading…</p>
          ) : history.length === 0 ? (
            <p style={{ fontSize: 12, color: "#64748b" }}>No parcels booked yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#94a3b8", fontSize: 10, textTransform: "uppercase" }}>
                    <th style={{ padding: "4px 8px" }}>Order</th>
                    <th style={{ padding: "4px 8px" }}>Customer</th>
                    <th style={{ padding: "4px 8px" }}>Date</th>
                    <th style={{ padding: "4px 8px" }}>Status</th>
                    <th style={{ padding: "4px 8px" }}>Courier Charge</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(p => (
                    <tr key={p.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>{p.orderNo}</td>
                      <td style={{ padding: "6px 8px" }}>{p.customerName}</td>
                      <td style={{ padding: "6px 8px" }}>{new Date(p.date).toLocaleDateString("en-IN")}</td>
                      <td style={{ padding: "6px 8px" }}>{p.status}</td>
                      <td style={{ padding: "6px 8px" }}>
                        {p.parcelCourierCharge != null ? `${fmt(p.parcelCourierCharge)} (${p.parcelPaymentType ?? "—"})` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
