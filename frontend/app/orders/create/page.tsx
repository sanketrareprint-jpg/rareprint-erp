"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Product = { id: string; name: string; sku: string; gsm: number; paperType?: string; sizeInches: string; sides: string; };
type CustomField = { id: string; label: string; type: "text" | "number" | "date" | "select" | "textarea"; required?: boolean; options?: string[] };
type OfferCode = { id: string; code: string; description?: string; productIds: string[]; isActive: boolean };
type LineItem = { productId: string; sizeInches: string; gsm: number; paperType: string; sides: string; quantity: number; unitPrice: number; lineTotal: number; specialInstructions: string; customFields: Record<string, string>; offerCodeId?: string };
type CustomerSearchRow = {
  id: string;
  businessName: string;
  contactPerson?: string | null;
  phone?: string | null;
  phone2?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  orderCount?: number;
};

type PostOfficeResult = {
  Name: string;
  District: string;
  State: string;
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

const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

// Strip spaces, a leading 0 (STD-style prefix), and a +91/91 country code,
// then cap at 10 digits — so however the user types it, the stored value
// is always a plain 10-digit number.
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
  return { productId: "", sizeInches: "", gsm: 0, paperType: "", sides: "SINGLE_SIDE", quantity: 1, unitPrice: 0, lineTotal: 0, specialInstructions: "", customFields: {}, offerCodeId: "" };
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
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [productDropdownOpen, setProductDropdownOpen] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [customer, setCustomer] = useState({ customerId: "", name: "", phone: "", phone2: "", email: "", address: "", city: "", state: "", pincode: "" });
  const [customerMatches, setCustomerMatches] = useState<CustomerSearchRow[]>([]);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [selectedCustomerLabel, setSelectedCustomerLabel] = useState("");
  const [citySuggestions, setCitySuggestions] = useState<PostOfficeResult[]>([]);
  const [citySearchOpen, setCitySearchOpen] = useState(false);
  const [citySearchLoading, setCitySearchLoading] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);
  const [orderFields, setOrderFields] = useState<CustomField[]>([]);
  const [itemFields, setItemFields] = useState<CustomField[]>([]);
  const [offerCodes, setOfferCodes] = useState<OfferCode[]>([]);
  const [customOrderFields, setCustomOrderFields] = useState<Record<string, string>>({});
  const [orderNotes, setOrderNotes] = useState("");
  const [isSample, setIsSample] = useState(false);
  const [leadSource, setLeadSource] = useState("");
  const [leadMonth, setLeadMonth] = useState(String(new Date().getMonth() + 1));
  const [leadYear, setLeadYear] = useState(String(CURRENT_YEAR));

  const needsDate = leadSource === "FB_AD" || leadSource === "AISENSY_CAMPAIGN";

  const load = useCallback(async () => {
    const [res, cfgRes, offerRes] = await Promise.all([
      fetch(`${API_BASE_URL}/products`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/erp-config`, { headers: getAuthHeaders() }),
      fetch(`${API_BASE_URL}/erp-config/offer-codes`, { headers: getAuthHeaders() }),
    ]);
    if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
    setProducts(await res.json());
    if (cfgRes.ok) {
      const cfg = await cfgRes.json();
      setOrderFields(cfg.orderFields ?? []);
      setItemFields(cfg.itemFields ?? []);
    }
    if (offerRes.ok) {
      const codes: OfferCode[] = await offerRes.json();
      setOfferCodes(codes.filter(c => c.isActive));
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function normalizePhone(value: string) {
    const digits = value.replace(/\D/g, "");
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  function fillCustomer(row: CustomerSearchRow) {
    setCustomer({
      customerId: row.id,
      name: row.businessName ?? "",
      phone: row.phone ?? "",
      phone2: row.phone2 ?? "",
      email: row.email ?? "",
      address: row.address ?? "",
      city: row.city ?? "",
      state: row.state ?? "",
      pincode: row.pincode ?? "",
    });
    setSelectedCustomerLabel(row.businessName);
    setCustomerMatches([]);
    setCustomerSearchOpen(false);
  }

  useEffect(() => {
    const byPhone = normalizePhone(customer.phone);
    const query = byPhone.length >= 4 ? customer.phone : customer.name.trim();
    if (customer.customerId && selectedCustomerLabel === customer.name) return;
    if (query.trim().length < 2) {
      setCustomerMatches([]);
      setCustomerSearchOpen(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      setCustomerSearchLoading(true);
      try {
        const params = new URLSearchParams({ search: query.trim(), limit: "8" });
        const res = await fetch(`${API_BASE_URL}/customer-directory/search?${params.toString()}`, { headers: getAuthHeaders() });
        if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
        if (!res.ok) return;
        const data = await res.json();
        const rows: CustomerSearchRow[] = data.customers ?? [];
        setCustomerMatches(rows);
        setCustomerSearchOpen(rows.length > 0);

        if (byPhone.length >= 10) {
          const exact = rows.find((row) => normalizePhone(row.phone ?? "") === byPhone);
          if (exact) fillCustomer(exact);
        }
      } finally {
        setCustomerSearchLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [customer.name, customer.phone, customer.customerId, selectedCustomerLabel, router]);

  // Pincode → City/State autofill, via India Post's public pincode API.
  // Fires once a full 6-digit pincode is entered. Best-effort: if the
  // lookup fails (offline, rate-limited, unknown pincode) we just leave
  // City/State as-is rather than blocking the user.
  useEffect(() => {
    const pin = customer.pincode;
    if (pin.length !== 6) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const postOffice: PostOfficeResult | undefined = data?.[0]?.PostOffice?.[0];
        if (!postOffice || cancelled) return;
        setCustomer((c) => (c.pincode === pin ? { ...c, city: postOffice.District, state: postOffice.State } : c));
      } catch {
        // Ignore — pincode autofill is a convenience, not a requirement.
      }
    })();

    return () => { cancelled = true; };
  }, [customer.pincode]);

  // City → State autofill + India-wide city/town search, via the same
  // India Post API (searching by post-office/area name).
  useEffect(() => {
    const query = customer.city.trim();
    if (query.length < 3) {
      setCitySuggestions([]);
      setCitySearchOpen(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setCitySearchLoading(true);
      try {
        const res = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(query)}`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const results: PostOfficeResult[] = data?.[0]?.PostOffice ?? [];
        // De-dupe by District+State pair (a single town has many post offices)
        const seen = new Set<string>();
        const deduped = results.filter((r) => {
          const key = `${r.District}|${r.State}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 8);
        if (cancelled) return;
        setCitySuggestions(deduped);
        setCitySearchOpen(deduped.length > 0);
        // Unambiguous match (every result agrees on the same state) — safe
        // to fill State automatically, per the requirement that typing a
        // city must fill State without an explicit selection.
        const uniqueStates = new Set(deduped.map((r) => r.State));
        if (uniqueStates.size === 1) {
          setCustomer((c) => (c.city.trim() === query ? { ...c, state: deduped[0].State } : c));
        }
      } catch {
        // Ignore — city search is a convenience, not a requirement.
      } finally {
        if (!cancelled) setCitySearchLoading(false);
      }
    }, 300);

    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [customer.city]);

  function selectCitySuggestion(result: PostOfficeResult) {
    setCustomer((c) => ({ ...c, city: result.District, state: result.State }));
    setCitySuggestions([]);
    setCitySearchOpen(false);
  }

  function updateLine(index: number, field: keyof LineItem, value: string | number) {
    setLineItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index] };
      if (field === "productId" && typeof value === "string") {
        const prod = products.find(p => p.id === value);
        item.productId  = value;
        item.sizeInches = prod?.sizeInches ?? "";
        item.gsm        = prod?.gsm ?? 0;
        item.paperType  = prod?.paperType ?? "";
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

  function updateLineCustom(index: number, fieldId: string, value: string) {
    setLineItems(prev => prev.map((item, i) => i === index ? { ...item, customFields: { ...item.customFields, [fieldId]: value } } : item));
  }

  function renderCustomField(field: CustomField, value: string, onChange: (value: string) => void) {
    if (field.type === "select") {
      return (
        <select value={value ?? ""} onChange={e => onChange(e.target.value)} style={S.input}>
          <option value="">Select...</option>
          {(field.options ?? []).map(option => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    }
    if (field.type === "textarea") {
      return <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} rows={2} style={{ ...S.input, resize: "vertical" }} />;
    }
    return <input type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} value={value ?? ""} onChange={e => onChange(e.target.value)} style={S.input} />;
  }

  const orderTotal = lineItems.reduce((sum, i) => sum + (i.lineTotal || i.quantity * i.unitPrice), 0);

  async function submitOrder() {
    if (!customer.name.trim()) { alert("Customer name is required"); return; }
    if (customer.phone && customer.phone.length !== 10) { alert("Phone number must be exactly 10 digits"); return; }
    if (customer.phone2 && customer.phone2.length !== 10) { alert("Phone 2 number must be exactly 10 digits"); return; }
    if (!leadSource) { alert("Lead source is required"); return; }
    if (lineItems.some(i => !i.productId || i.quantity <= 0)) {
      alert("Please fill all product lines"); return;
    }
    const missingOrderField = orderFields.find(f => f.required && !customOrderFields[f.id]?.trim());
    if (missingOrderField) { alert(`${missingOrderField.label} is required`); return; }
    const missingItemField = lineItems.flatMap((item, index) => itemFields.filter(f => f.required && !item.customFields[f.id]?.trim()).map(f => `Item ${index + 1}: ${f.label}`))[0];
    if (missingItemField) { alert(`${missingItemField} is required`); return; }
    setSubmitting(true);
    try {
      const leadSourceValue = leadSource
        ? (needsDate ? `${leadSource}_${MONTHS[Number(leadMonth) - 1]}_${leadYear}` : leadSource)
        : undefined;

      const customerPayload = Object.fromEntries(Object.entries(customer).filter(([, v]) => v !== ""));
      const res = await fetch(`${API_BASE_URL}/orders`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customerPayload,
          items: lineItems.map(i => ({
            productId:       i.productId,
            quantity:        i.quantity,
            unitPrice:       i.unitPrice || (i.lineTotal / i.quantity),
            artworkNotes:    i.specialInstructions || undefined,
            productionNotes: `Size: ${i.sizeInches}, GSM: ${i.gsm}${i.paperType ? `, Paper: ${i.paperType}` : ""}, Sides: ${i.sides}`,
            customFields:    i.customFields,
            offerCodeId:     i.offerCodeId || undefined,
          })),
          notes:      orderNotes || undefined,
          leadSource: leadSourceValue,
          isSample:   isSample || undefined,
          customFields: customOrderFields,
        }),
      });
      if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
      router.push("/orders");
    } finally { setSubmitting(false); }
  }

  return (
    <DashboardShell>
      <div className="create-order-page" style={{ padding: "1rem 1.5rem", maxWidth: "900px", margin: "0 auto" }}>

        {/* Header */}
        <div className="create-order-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
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
        <div className="create-order-top-grid" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: "10px", marginBottom: "10px" }}>

          {/* Customer Details */}
          <div className="create-order-section" style={S.section}>
            <p style={S.sectionTitle}>Customer Details</p>
            <div className="create-order-field-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div className="create-order-field-wide" style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Full Name *</label>
                <div style={{ position: "relative" }}>
                  <input value={customer.name} onChange={e => {
                    setSelectedCustomerLabel("");
                    setCustomer(c => ({ ...c, customerId: "", name: e.target.value }));
                  }}
                    onFocus={() => customerMatches.length > 0 && setCustomerSearchOpen(true)}
                    onBlur={() => window.setTimeout(() => setCustomerSearchOpen(false), 180)}
                    placeholder="Customer / Business Name" style={S.input} />
                  {customerSearchOpen && (
                    <div style={{ position: "absolute", zIndex: 1000, top: "100%", left: 0, right: 0, marginTop: "4px", maxHeight: "220px", overflowY: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", background: "white", boxShadow: "0 12px 24px rgba(15,23,42,0.14)" }}>
                      {customerMatches.map(row => (
                        <button key={row.id} type="button" onMouseDown={() => fillCustomer(row)}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderBottom: "1px solid #f1f5f9", background: "white", cursor: "pointer" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 700, color: "#0f172a" }}>{row.businessName}</span>
                            <span style={{ fontSize: "10px", color: "#64748b", flexShrink: 0 }}>{row.orderCount ?? 0} orders</span>
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {[row.phone, row.address, row.city, row.pincode].filter(Boolean).join(" • ")}
                          </div>
                        </button>
                      ))}
                      {customerSearchLoading && <div style={{ padding: "8px 10px", fontSize: "11px", color: "#64748b" }}>Searching old customers...</div>}
                    </div>
                  )}
                </div>
                {customer.customerId && (
                  <p style={{ margin: "4px 0 0", fontSize: "10px", color: "#059669", fontWeight: 600 }}>Old customer selected. Details will be reused.</p>
                )}
              </div>
              <div>
                <label style={S.label}>Phone</label>
                <input value={customer.phone} onChange={e => {
                  setSelectedCustomerLabel("");
                  setCustomer(c => ({ ...c, customerId: "", phone: sanitizePhone(e.target.value) }));
                }}
                  onFocus={() => customerMatches.length > 0 && setCustomerSearchOpen(true)}
                  inputMode="numeric" maxLength={10}
                  placeholder="10-digit mobile number" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Phone 2</label>
                <input value={customer.phone2} onChange={e => setCustomer(c => ({ ...c, phone2: sanitizePhone(e.target.value) }))}
                  inputMode="numeric" maxLength={10}
                  placeholder="10-digit mobile number (optional)" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Email</label>
                <input value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))}
                  placeholder="email@example.com" style={S.input} />
              </div>
              <div className="create-order-field-wide" style={{ gridColumn: "span 2" }}>
                <label style={S.label}>Address</label>
                <input value={customer.address} onChange={e => setCustomer(c => ({ ...c, address: e.target.value }))}
                  placeholder="Street address" style={S.input} />
              </div>
              <div style={{ position: "relative" }}>
                <label style={S.label}>City</label>
                <input value={customer.city}
                  onChange={e => setCustomer(c => ({ ...c, city: e.target.value }))}
                  onFocus={() => citySuggestions.length > 0 && setCitySearchOpen(true)}
                  onBlur={() => window.setTimeout(() => setCitySearchOpen(false), 180)}
                  placeholder="Search any city/town in India" style={S.input} autoComplete="off" />
                {citySearchOpen && (
                  <div style={{ position: "absolute", zIndex: 1000, top: "100%", left: 0, right: 0, marginTop: "4px", maxHeight: "200px", overflowY: "auto", border: "1px solid #cbd5e1", borderRadius: "8px", background: "white", boxShadow: "0 12px 24px rgba(15,23,42,0.14)" }}>
                    {citySuggestions.map((r, i) => (
                      <button key={`${r.District}-${r.State}-${i}`} type="button" onMouseDown={() => selectCitySuggestion(r)}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 10px", border: "none", borderBottom: "1px solid #f1f5f9", background: "white", cursor: "pointer", fontSize: "12px" }}>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>{r.District}</span>
                        <span style={{ color: "#64748b" }}>, {r.State}</span>
                      </button>
                    ))}
                    {citySearchLoading && <div style={{ padding: "7px 10px", fontSize: "11px", color: "#64748b" }}>Searching...</div>}
                  </div>
                )}
              </div>
              <div>
                <label style={S.label}>State</label>
                <select value={customer.state} onChange={e => setCustomer(c => ({ ...c, state: e.target.value }))} style={S.input}>
                  <option value="">Select state...</option>
                  {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Pincode</label>
                <input value={customer.pincode}
                  onChange={e => setCustomer(c => ({ ...c, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                  inputMode="numeric" maxLength={6}
                  placeholder="6-digit pincode" style={S.input} />
              </div>
            </div>
          </div>

          {orderFields.length > 0 && (
            <div className="create-order-section" style={S.section}>
              <p style={S.sectionTitle}>Custom Order Fields</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                {orderFields.map(field => (
                  <div key={field.id} className={field.type === "textarea" ? "create-order-field-wide" : ""} style={field.type === "textarea" ? { gridColumn: "span 2" } : undefined}>
                    <label style={S.label}>{field.label}{field.required ? " *" : ""}</label>
                    {renderCustomField(field, customOrderFields[field.id] ?? "", value => setCustomOrderFields(prev => ({ ...prev, [field.id]: value })))}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Lead Source + Notes stacked */}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div className="create-order-section" style={S.section}>
              <p style={S.sectionTitle}>Lead Source *</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div>
                  <label style={S.label}>Source *</label>
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
            <div className="create-order-section" style={S.section}>
              <p style={S.sectionTitle}>Order Notes</p>
              <textarea value={orderNotes} onChange={e => setOrderNotes(e.target.value)} rows={4}
                placeholder="Any additional notes or instructions..."
                style={{ ...S.input, resize: "vertical" }} />
            </div>
            <div className="create-order-section" style={{ ...S.section, background: isSample ? "#fef3c7" : "#f8fafc", border: isSample ? "2px solid #f59e0b" : "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }} onClick={() => setIsSample(v => !v)}>
                <div style={{
                  width: 44, height: 24, borderRadius: 12, background: isSample ? "#f59e0b" : "#cbd5e1",
                  position: "relative", transition: "background 0.2s", flexShrink: 0,
                }}>
                  <div style={{
                    position: "absolute", top: 3, left: isSample ? 23 : 3,
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 14, color: isSample ? "#92400e" : "#475569", margin: 0 }}>
                    📦 Sample Kit Order
                  </p>
                  <p style={{ fontSize: 12, color: "#64748b", margin: "2px 0 0" }}>
                    {isSample
                      ? "This order will go to Accounts for approval → then directly to Dispatch (PREPAID or COD based on payment)"
                      : "Toggle on if this is a sample kit being sent to a customer"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="create-order-section" style={S.section}>
          <p style={S.sectionTitle}>Products / Line Items</p>
          <div className="create-order-product-head" style={{ display: "grid", gridTemplateColumns: "2fr 75px 55px 80px 75px 75px 95px 95px 28px", gap: "6px", marginBottom: "4px" }}>
            {["Product","Size","GSM","Paper","Sides","Qty","Rate/Unit","Amount",""].map(h => (
              <span key={h} style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</span>
            ))}
          </div>
          {lineItems.map((item, idx) => (
            <div key={idx}>
              <div className="create-order-product-row" style={{ display: "grid", gridTemplateColumns: "2fr 75px 55px 80px 75px 75px 95px 95px 28px", gap: "6px", marginBottom: "4px", alignItems: "center" }}>
                <div className="create-order-product-picker" style={{ position: "relative" }}>
                  <input
                    type="text"
                    placeholder="Search product..."
                    value={productSearch[idx] !== undefined ? productSearch[idx] : (products.find(p => p.id === item.productId) ? `${products.find(p => p.id === item.productId)!.name} | ${products.find(p => p.id === item.productId)!.sizeInches} | ${products.find(p => p.id === item.productId)!.gsm} GSM${products.find(p => p.id === item.productId)!.paperType ? ` | ${products.find(p => p.id === item.productId)!.paperType}` : ""}` : "")}
                    onChange={e => setProductSearch(s => ({ ...s, [idx]: e.target.value }))}
                    onFocus={() => { setProductSearch(s => ({ ...s, [idx]: "" })); setProductDropdownOpen(s => ({ ...s, [idx]: true })); }}
                    onBlur={() => setTimeout(() => { setProductDropdownOpen(s => ({ ...s, [idx]: false })); setProductSearch(s => { const n = {...s}; delete n[idx]; return n; }); }, 200)}
                    style={{ ...S.input, width: "100%" }}
                  />
                  {productDropdownOpen[idx] && (
                    <div style={{ position: "absolute", zIndex: 999, background: "white", border: "1px solid #cbd5e1", borderRadius: 6, maxHeight: 200, overflowY: "auto", width: "100%", top: "100%", left: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                      {products
                        .filter(p => {
                          const q = (productSearch[idx] ?? "").toLowerCase();
                          return !q || p.name.toLowerCase().includes(q) || (p.sizeInches ?? "").toLowerCase().includes(q);
                        })
                        .map(p => (
                          <div key={p.id}
                            onMouseDown={() => {
                              updateLine(idx, "productId", p.id);
                              setProductSearch(s => ({ ...s, [idx]: "" }));
                              setProductDropdownOpen(s => ({ ...s, [idx]: false }));
                            }}
                            style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f0f9ff")}
                            onMouseLeave={e => (e.currentTarget.style.background = "white")}
                          >
                            {p.name} | {p.sizeInches} | {p.gsm} GSM{p.paperType ? ` | ${p.paperType}` : ""} | {p.sides === "DOUBLE_SIDE" ? "Double" : "Single"}
                          </div>
                        ))}
                    </div>
                  )}
                </div>
                <input value={item.sizeInches} onChange={e => updateLine(idx, "sizeInches", e.target.value)} placeholder="4x5" style={S.input} />
                <input type="number" value={item.gsm || ""} onChange={e => updateLine(idx, "gsm", Number(e.target.value))} placeholder="70" style={S.input} />
                <div style={{ ...S.input, background: "#f8fafc", color: item.paperType ? "#0f172a" : "#94a3b8", fontSize: "11px", display: "flex", alignItems: "center" }}>
                  {item.paperType || "-"}
                </div>
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
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px", marginBottom: "8px", alignItems: "center" }}>
                <input value={item.specialInstructions}
                  onChange={e => updateLine(idx, "specialInstructions", e.target.value)}
                  placeholder={`Item ${idx + 1} — special instructions (optional)`}
                  style={{ ...S.input, background: "#fffbeb", borderColor: "#fde68a", fontSize: "11px" }} />
                {/* Offer code selector — only shown when active codes exist for this product */}
                {(() => {
                  const applicable = offerCodes.filter(oc => oc.productIds.length === 0 || oc.productIds.includes(item.productId));
                  if (applicable.length === 0) return null;
                  return (
                    <div style={{ display: "flex", alignItems: "center", gap: "4px", flexShrink: 0 }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>Offer Code</span>
                      <select
                        value={item.offerCodeId ?? ""}
                        onChange={e => setLineItems(prev => prev.map((li, i) => i === idx ? { ...li, offerCodeId: e.target.value } : li))}
                        style={{ ...S.input, width: "auto", minWidth: "130px", background: item.offerCodeId ? "#f5f3ff" : "white", borderColor: item.offerCodeId ? "#a78bfa" : "#e2e8f0", color: item.offerCodeId ? "#5b21b6" : "#334155", fontWeight: item.offerCodeId ? 700 : 400, fontSize: "11px" }}
                      >
                        <option value="">— None —</option>
                        {applicable.map(oc => (
                          <option key={oc.id} value={oc.id}>{oc.code}{oc.description ? ` — ${oc.description}` : ""}</option>
                        ))}
                      </select>
                    </div>
                  );
                })()}
              </div>
              {itemFields.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px", margin: "0 0 10px 0", padding: "8px", borderRadius: "8px", background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                  {itemFields.map(field => (
                    <div key={field.id}>
                      <label style={S.label}>{field.label}{field.required ? " *" : ""}</label>
                      {renderCustomField(field, item.customFields[field.id] ?? "", value => updateLineCustom(idx, field.id, value))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className="create-order-total-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => setLineItems(p => [...p, emptyLine()])}
              style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "1px dashed #93c5fd", borderRadius: "6px", padding: "5px 12px", fontSize: "12px", color: "#ee1c25", background: "none", cursor: "pointer" }}>
              <Plus style={{ width: 14, height: 14 }} /> Add Item
            </button>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontSize: "12px", color: "#64748b" }}>Order Total: </span>
              <span style={{ fontSize: "20px", fontWeight: 700, color: "#0f172a" }}>{fmt(orderTotal)}</span>
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="create-order-submit-row" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingBottom: "24px" }}>
          <button onClick={() => router.push("/orders")}
            style={{ borderRadius: "6px", border: "1px solid #e2e8f0", padding: "8px 16px", fontSize: "13px", fontWeight: 500, color: "#334155", background: "white", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={submitOrder} disabled={submitting}
            style={{ display: "inline-flex", alignItems: "center", gap: "6px", borderRadius: "6px", border: "none", background: "#ee1c25", padding: "8px 20px", fontSize: "13px", fontWeight: 600, color: "white", cursor: "pointer", opacity: submitting ? 0.6 : 1 }}>
            {submitting ? <Loader2 style={{ width: 15, height: 15 }} /> : <Plus style={{ width: 15, height: 15 }} />}
            Create Order
          </button>
        </div>
      </div>
    </DashboardShell>
  );
}




