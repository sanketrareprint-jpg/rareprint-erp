"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { MobileSelect } from "@/components/MobileSelect";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders, getStoredUser } from "@/lib/auth";
import { AlertTriangle, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

type Product = { id: string; name: string; sku: string; gsm: number; paperType?: string; sizeInches: string; sides: string; weightPerUnitGrams?: string | number | null };
type Platform = { key: string; label: string; enabled: boolean; configured: boolean };
type PickupAddress = { id: string; name: string; pincode: string; location?: string };
// weightKg is kept as typed text so the box can be cleared/edited freely;
// weightEdited stops quantity/product changes from overwriting a manual value.
type Line = { productId: string; quantity: number; weightKg: string; weightEdited: boolean };
type QuoteRate = { carrierName: string; estimatedDays: number | null; cost: number; multiplier: number; chargeAmount: number };
type QuoteItem = { productName: string; sku: string; quantity: number; weightKg: number; productWeightKg: number | null; weightEdited: boolean };
type Quote = {
  id: string; platform: string; platformLabel: string; pickupName: string; pickupPincode: string; deliveryPincode: string;
  paymentMode: "PREPAID" | "COD"; codAmount: number | null; totalWeightKg: number; items: QuoteItem[]; rates: QuoteRate[];
  createdByName: string | null; createdAt: string;
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
}

function emptyLine(): Line {
  return { productId: "", quantity: 1, weightKg: "", weightEdited: false };
}

function unitGrams(p?: Product): number | null {
  const g = p?.weightPerUnitGrams != null ? Number(p.weightPerUnitGrams) : NaN;
  return Number.isFinite(g) && g > 0 ? g : null;
}

function productWeightKg(p: Product | undefined, quantity: number): string {
  const g = unitGrams(p);
  return g && quantity > 0 ? String(Math.round(g * quantity) / 1000) : "";
}

function productLabel(p: Product) {
  return `[${p.sku}] ${p.name} | ${p.sizeInches} | ${p.gsm} GSM${p.paperType ? ` | ${p.paperType}` : ""}`;
}

const S = {
  input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" },
  label: { display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  section: { background: "white", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "14px 16px", marginBottom: "10px" },
  sectionTitle: { fontSize: "12px", fontWeight: 700, color: "#0f172a", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #f1f5f9" },
  th: { textAlign: "left" as const, fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" as const, padding: "6px 8px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap" as const },
  td: { fontSize: "12px", padding: "6px 8px", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" as const },
};

const TABS = [
  { id: "calculator", label: "Calculator" },
  { id: "history", label: "History" },
] as const;
type Tab = (typeof TABS)[number]["id"];

async function readError(res: Response, fallback: string) {
  try {
    const body = await res.json();
    const msg = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    return msg || fallback;
  } catch {
    return fallback;
  }
}

export default function CourierCalculatorPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("calculator");
  const [isAdmin, setIsAdmin] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loadError, setLoadError] = useState("");

  const [platform, setPlatform] = useState("");
  const [pickups, setPickups] = useState<PickupAddress[]>([]);
  const [pickupsLoading, setPickupsLoading] = useState(false);
  const [pickupId, setPickupId] = useState("");
  const [deliveryPincode, setDeliveryPincode] = useState("");
  const [paymentMode, setPaymentMode] = useState<"PREPAID" | "COD">("PREPAID");
  const [codAmount, setCodAmount] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [productSearch, setProductSearch] = useState<Record<number, string>>({});
  const [productDropdownOpen, setProductDropdownOpen] = useState<Record<number, boolean>>({});

  const [calculating, setCalculating] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [result, setResult] = useState<Quote | null>(null);

  const [history, setHistory] = useState<Quote[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const [savingPlatforms, setSavingPlatforms] = useState(false);

  // Read the role after mount (localStorage is client-only) — see the
  // hydration note in components/dashboard-shell.tsx.
  useEffect(() => { setIsAdmin(getStoredUser()?.role === "ADMIN"); }, []);

  const load = useCallback(async () => {
    try {
      const [prodRes, platRes] = await Promise.all([
        fetch(`${API_BASE_URL}/products`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/courier-calculator/platforms`, { headers: getAuthHeaders() }),
      ]);
      if (prodRes.status === 401 || platRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!prodRes.ok || !platRes.ok) { setLoadError("Could not load products or platforms. Refresh to try again."); return; }
      setProducts(await prodRes.json());
      setPlatforms(await platRes.json());
    } catch {
      setLoadError("Could not load products or platforms. Refresh to try again.");
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  const visiblePlatforms = platforms.filter((p) => p.enabled);

  // Drop a selected platform that the admin just hid.
  useEffect(() => {
    if (platform && !visiblePlatforms.some((p) => p.key === platform)) setPlatform("");
  }, [platform, visiblePlatforms]);

  useEffect(() => {
    setPickups([]);
    setPickupId("");
    if (!platform) return;
    let cancelled = false;
    setPickupsLoading(true);
    fetch(`${API_BASE_URL}/courier-calculator/pickup-addresses?platform=${encodeURIComponent(platform)}`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PickupAddress[]) => {
        if (cancelled) return;
        setPickups(Array.isArray(rows) ? rows : []);
        if (Array.isArray(rows) && rows.length === 1) setPickupId(rows[0].id);
      })
      .catch(() => { if (!cancelled) setPickups([]); })
      .finally(() => { if (!cancelled) setPickupsLoading(false); });
    return () => { cancelled = true; };
  }, [platform]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch(`${API_BASE_URL}/courier-calculator/history?limit=200`, { headers: getAuthHeaders() });
      if (!res.ok) { setHistoryError(await readError(res, "Could not load history")); return; }
      setHistory(await res.json());
    } catch {
      setHistoryError("Could not load history");
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((line, i) => {
      if (i !== idx) return line;
      const next = { ...line, ...patch };
      if (patch.productId !== undefined && patch.productId !== line.productId) next.weightEdited = false;
      if (!next.weightEdited && (patch.productId !== undefined || patch.quantity !== undefined)) {
        next.weightKg = productWeightKg(products.find((p) => p.id === next.productId), next.quantity);
      }
      return next;
    }));
    setResult(null);
  }

  const totalWeightKg = Math.round(lines.reduce((sum, l) => sum + (Number(l.weightKg) || 0), 0) * 1000) / 1000;

  async function calculate() {
    setCalcError("");
    setResult(null);
    if (!platform) return setCalcError("Select a platform");
    if (!pickupId) return setCalcError("Select a pickup address");
    if (!/^\d{6}$/.test(deliveryPincode.trim())) return setCalcError("Delivery pincode must be 6 digits");
    if (paymentMode === "COD" && !(Number(codAmount) > 0)) return setCalcError("Enter the COD amount");
    const filled = lines.filter((l) => l.productId);
    if (filled.length === 0) return setCalcError("Add at least one product");
    if (filled.some((l) => !(l.quantity >= 1))) return setCalcError("Quantity must be at least 1");
    const missingWeight = filled.find((l) => !(Number(l.weightKg) > 0));
    if (missingWeight) {
      const p = products.find((x) => x.id === missingWeight.productId);
      return setCalcError(`Enter the weight for ${p?.name ?? "each product"}`);
    }
    setCalculating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/courier-calculator/calculate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          platform,
          pickupId,
          deliveryPincode: deliveryPincode.trim(),
          paymentMode,
          codAmount: paymentMode === "COD" ? Number(codAmount) : undefined,
          items: filled.map((l) => ({ productId: l.productId, quantity: l.quantity, weightKg: Number(l.weightKg) })),
        }),
      });
      if (!res.ok) { setCalcError(await readError(res, "Could not fetch rates")); return; }
      setResult(await res.json());
    } catch {
      setCalcError("Could not reach the server. Check your connection and try again.");
    } finally {
      setCalculating(false);
    }
  }

  async function togglePlatform(key: string, enabled: boolean) {
    const next = platforms.filter((p) => (p.key === key ? enabled : p.enabled)).map((p) => p.key);
    setSavingPlatforms(true);
    try {
      const res = await fetch(`${API_BASE_URL}/courier-calculator/platforms`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ enabledPlatforms: next }),
      });
      if (!res.ok) { alert(await readError(res, "Could not save platform settings")); return; }
      setPlatforms(await res.json());
    } finally {
      setSavingPlatforms(false);
    }
  }

  return (
    <DashboardShell>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex gap-1 bg-slate-100 px-2 pt-2 pb-0 shrink-0">
          <div className="flex gap-1 bg-slate-100 rounded-t-lg p-1 flex-wrap flex-1">
            <span className="hidden md:flex items-center px-2 text-xs font-bold text-blue-700 whitespace-nowrap">Courier Calculator</span>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "history") void loadHistory(); }}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all min-w-[52px] ${tab === t.id ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-2">
          {loadError && <div style={{ ...S.section, color: "#b91c1c", fontSize: 12 }}>{loadError}</div>}

          {tab === "calculator" && (
            <div style={{ maxWidth: 980, margin: "0 auto" }}>
              {isAdmin && (
                <div style={S.section}>
                  <p style={S.sectionTitle}>Platforms shown in dropdown (admin)</p>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    {platforms.map((p) => (
                      <label key={p.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                        <input type="checkbox" checked={p.enabled} disabled={savingPlatforms} onChange={(e) => void togglePlatform(p.key, e.target.checked)} />
                        {p.label}
                        {!p.configured && <span style={{ color: "#b45309", fontSize: 11 }}>(API not configured)</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div style={S.section}>
                <p style={S.sectionTitle}>Shipment</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <div>
                    <label style={S.label}>Platform</label>
                    <MobileSelect value={platform} onChange={(v) => { setPlatform(v); setResult(null); }} style={S.input}
                      options={[{ value: "", label: visiblePlatforms.length ? "Select platform..." : "No platform enabled" },
                        ...visiblePlatforms.map((p) => ({ value: p.key, label: p.configured ? p.label : `${p.label} (not configured)` }))]} />
                  </div>
                  <div>
                    <label style={S.label}>Pickup address</label>
                    <MobileSelect value={pickupId} onChange={(v) => { setPickupId(v); setResult(null); }} style={S.input} disabled={!platform || pickupsLoading}
                      options={[{ value: "", label: !platform ? "Select platform first" : pickupsLoading ? "Loading..." : pickups.length ? "Select pickup..." : "No pickup addresses found" },
                        ...pickups.map((p) => ({ value: p.id, label: `${p.name} — ${p.pincode}${p.location ? ` (${p.location})` : ""}` }))]} />
                  </div>
                  <div>
                    <label style={S.label}>Delivery pincode</label>
                    <input value={deliveryPincode} inputMode="numeric" maxLength={6} placeholder="6-digit pincode"
                      onChange={(e) => { setDeliveryPincode(e.target.value.replace(/\D/g, "").slice(0, 6)); setResult(null); }} style={S.input} />
                  </div>
                  <div>
                    <label style={S.label}>Payment</label>
                    <MobileSelect value={paymentMode} onChange={(v) => { setPaymentMode(v as "PREPAID" | "COD"); setResult(null); }} style={S.input}
                      options={[{ value: "PREPAID", label: "Prepaid" }, { value: "COD", label: "COD" }]} />
                  </div>
                  {paymentMode === "COD" && (
                    <div>
                      <label style={S.label}>COD amount (₹)</label>
                      <input type="number" min={0} value={codAmount} placeholder="0.00"
                        onChange={(e) => { setCodAmount(e.target.value); setResult(null); }} style={S.input} />
                    </div>
                  )}
                </div>
              </div>

              <div style={S.section}>
                <p style={S.sectionTitle}>Products</p>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 80px 110px 28px", gap: 6, marginBottom: 4 }}>
                  {["Product", "Qty", "Weight (kg)", ""].map((h) => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{h}</span>
                  ))}
                </div>
                {lines.map((line, idx) => {
                  const product = products.find((p) => p.id === line.productId);
                  const noDbWeight = !!product && unitGrams(product) === null;
                  return (
                    <div key={idx} style={{ marginBottom: 6 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 80px 110px 28px", gap: 6, alignItems: "center" }}>
                        <div style={{ position: "relative" }}>
                          <input type="text" placeholder="Search product..."
                            value={productSearch[idx] !== undefined ? productSearch[idx] : (product ? productLabel(product) : "")}
                            onChange={(e) => setProductSearch((s) => ({ ...s, [idx]: e.target.value }))}
                            onFocus={(e) => { e.target.select(); setProductDropdownOpen((s) => ({ ...s, [idx]: true })); }}
                            onBlur={() => setTimeout(() => { setProductDropdownOpen((s) => ({ ...s, [idx]: false })); setProductSearch((s) => { const n = { ...s }; delete n[idx]; return n; }); }, 200)}
                            style={S.input} />
                          {productDropdownOpen[idx] && (
                            <div style={{ position: "absolute", zIndex: 999, background: "white", border: "1px solid #cbd5e1", borderRadius: 6, maxHeight: 200, overflowY: "auto", width: "100%", top: "100%", left: 0, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
                              {products
                                .filter((p) => {
                                  const q = (productSearch[idx] ?? "").toLowerCase();
                                  return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) || (p.sizeInches ?? "").toLowerCase().includes(q);
                                })
                                .map((p) => (
                                  <div key={p.id}
                                    onMouseDown={() => {
                                      updateLine(idx, { productId: p.id });
                                      setProductSearch((s) => { const n = { ...s }; delete n[idx]; return n; });
                                      setProductDropdownOpen((s) => ({ ...s, [idx]: false }));
                                    }}
                                    style={{ padding: "6px 10px", cursor: "pointer", fontSize: 12, borderBottom: "1px solid #f1f5f9" }}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = "#f0f9ff")}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = "white")}>
                                    <span style={{ fontWeight: 700, color: "#ee1c25" }}>[{p.sku}]</span> {p.name} | {p.sizeInches} | {p.gsm} GSM{p.paperType ? ` | ${p.paperType}` : ""}
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                        <input type="number" min={1} value={line.quantity}
                          onChange={(e) => updateLine(idx, { quantity: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} style={S.input} />
                        <input type="number" min={0} step="0.001" value={line.weightKg} placeholder="0.000"
                          onChange={(e) => updateLine(idx, { weightKg: e.target.value, weightEdited: true })}
                          style={{ ...S.input, borderColor: noDbWeight && !(Number(line.weightKg) > 0) ? "#f59e0b" : "#e2e8f0" }} />
                        <button type="button" onClick={() => { setLines((prev) => prev.length > 1 ? prev.filter((_, i) => i !== idx) : [emptyLine()]); setProductSearch({}); setResult(null); }}
                          style={{ border: "none", background: "none", cursor: "pointer", color: "#94a3b8" }} aria-label="Remove product">
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {noDbWeight && (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#b45309", marginTop: 3 }}>
                          <AlertTriangle size={12} /> Weight for this product is not saved in the product database — enter it manually.
                        </div>
                      )}
                      {product && !noDbWeight && line.weightEdited && (
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                          Edited — product database weight is {productWeightKg(product, line.quantity)} kg.{" "}
                          <button type="button" onClick={() => updateLine(idx, { weightKg: productWeightKg(product, line.quantity), weightEdited: false })}
                            style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 11, padding: 0 }}>Use it</button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
                  <button type="button" onClick={() => setLines((prev) => [...prev, emptyLine()])}
                    style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, border: "1px dashed #cbd5e1", borderRadius: 6, padding: "5px 10px", background: "white", cursor: "pointer" }}>
                    <Plus size={13} /> Add product
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>Total weight: {totalWeightKg} kg</span>
                </div>
              </div>

              {calcError && <div style={{ ...S.section, color: "#b91c1c", fontSize: 12, background: "#fef2f2", borderColor: "#fecaca" }}>{calcError}</div>}

              <button type="button" onClick={() => void calculate()} disabled={calculating}
                style={{ width: "100%", padding: "10px", borderRadius: 8, border: "none", background: calculating ? "#94a3b8" : "#ee1c25", color: "white", fontWeight: 700, fontSize: 13, cursor: calculating ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 10 }}>
                {calculating && <Loader2 size={14} className="animate-spin" />} {calculating ? "Fetching rates..." : "Fetch rates"}
              </button>

              {result && (
                <div style={S.section}>
                  <p style={S.sectionTitle}>
                    {result.platformLabel} · {result.pickupName} ({result.pickupPincode}) → {result.deliveryPincode} · {result.totalWeightKg} kg ·{" "}
                    {result.paymentMode === "COD" ? `COD ${fmt(result.codAmount ?? 0)}` : "Prepaid"}
                  </p>
                  <RatesTable rates={result.rates} />
                </div>
              )}
            </div>
          )}

          {tab === "history" && (
            <div style={S.section}>
              <p style={S.sectionTitle}>{isAdmin ? "All rate calculations" : "My rate calculations"}</p>
              {historyLoading ? (
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}><Loader2 size={14} className="animate-spin" /> Loading...</div>
              ) : historyError ? (
                <div style={{ color: "#b91c1c", fontSize: 12 }}>{historyError}</div>
              ) : history.length === 0 ? (
                <div style={{ fontSize: 12, color: "#64748b" }}>No rates calculated yet.</div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>{["Date", "By", "Platform", "Route", "Payment", "Weight", "Products", "Cheapest charge", ""].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {history.map((q) => {
                        const cheapest = q.rates[0];
                        const open = expandedHistoryId === q.id;
                        return (
                          <React.Fragment key={q.id}>
                            <tr>
                              <td style={{ ...S.td, whiteSpace: "nowrap" }}>{new Date(q.createdAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td>
                              <td style={S.td}>{q.createdByName ?? "—"}</td>
                              <td style={S.td}>{q.platformLabel}</td>
                              <td style={{ ...S.td, whiteSpace: "nowrap" }}>{q.pickupName} ({q.pickupPincode}) → {q.deliveryPincode}</td>
                              <td style={{ ...S.td, whiteSpace: "nowrap" }}>{q.paymentMode === "COD" ? `COD ${fmt(q.codAmount ?? 0)}` : "Prepaid"}</td>
                              <td style={{ ...S.td, whiteSpace: "nowrap" }}>{q.totalWeightKg} kg</td>
                              <td style={S.td}>{q.items.map((i) => `${i.productName} × ${i.quantity}`).join(", ")}</td>
                              <td style={{ ...S.td, whiteSpace: "nowrap", fontWeight: 700 }}>{cheapest ? `${fmt(cheapest.chargeAmount)} (${cheapest.carrierName})` : "—"}</td>
                              <td style={S.td}>
                                <button type="button" onClick={() => setExpandedHistoryId(open ? null : q.id)}
                                  style={{ border: "none", background: "none", color: "#2563eb", cursor: "pointer", fontSize: 12, whiteSpace: "nowrap" }}>
                                  {open ? "Hide" : "All rates"}
                                </button>
                              </td>
                            </tr>
                            {open && (
                              <tr>
                                <td colSpan={9} style={{ ...S.td, background: "#f8fafc" }}>
                                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                                    {q.items.map((i) => `${i.productName} × ${i.quantity}: ${i.weightKg} kg${i.weightEdited ? (i.productWeightKg != null ? ` (edited, product DB ${i.productWeightKg} kg)` : " (entered manually)") : ""}`).join(" · ")}
                                  </div>
                                  <RatesTable rates={q.rates} />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}

function RatesTable({ rates }: { rates: QuoteRate[] }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>{["Courier", "ETA", "Platform cost", "Multiplier", "Courier charge"].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rates.map((r, i) => (
            <tr key={`${r.carrierName}-${i}`}>
              <td style={S.td}>{r.carrierName}</td>
              <td style={S.td}>{r.estimatedDays ? `${r.estimatedDays} day${r.estimatedDays === 1 ? "" : "s"}` : "—"}</td>
              <td style={S.td}>{fmt(r.cost)}</td>
              <td style={S.td}>×{r.multiplier}</td>
              <td style={{ ...S.td, fontWeight: 700 }}>{fmt(r.chargeAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
