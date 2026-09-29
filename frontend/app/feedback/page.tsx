"use client";
import React, { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";
import { ArrowLeft, Loader2, Phone, Star } from "lucide-react";
import { useRouter } from "next/navigation";

type PendingOrder = {
  id: string; orderNumber: string; orderDate: string; deliveredAt: string | null;
  customerName: string; customerPhone: string | null; city: string | null;
  salesAgentName: string | null; products: string[]; carrierName: string | null;
};
type OrderItem = {
  id: string; quantity: number; lineTotal: string; artworkNotes: string | null;
  product: { name: string; sku: string; sizeInches: string; gsm: number; paperType: string | null; sides: string };
};
type Shipment = {
  id: string; status: string; carrierName: string | null; awbNumber: string | null; trackingNumber: string | null;
  dispatchType: string | null; transportName: string | null; lrNumber: string | null;
  dispatchDate: string | null; createdAt: string; deliveredAt: string | null;
};
type OrderDetail = {
  id: string; orderNumber: string; orderDate: string; deliveredAt: string | null; notes: string | null; grandTotal: string;
  customer: { businessName: string; contactPerson: string | null; phone: string | null; city: string | null; state: string | null };
  salesAgent: { fullName: string } | null;
  items: OrderItem[]; shipments: Shipment[]; feedback: SubmittedFeedback | null;
};
type ProductRating = { orderItemId: string; productName: string; quantity: number; rating: number };
type SubmittedFeedback = {
  id: string; overallRating: number; productRatings: ProductRating[]; serviceRating: number; deliveryRating: number;
  improvement: string | null; wouldRecommend: "YES" | "MAYBE" | "NO"; referralName: string | null; referralPhone: string | null;
  needsMore: boolean; requirementNote: string | null; willRateOnGoogle: boolean;
  customerWhatsappSent: boolean; agentWhatsappSent: boolean; submittedByName: string | null; createdAt: string;
  order?: { id: string; orderNumber: string; customer: { businessName: string; phone: string | null }; salesAgent: { fullName: string } | null };
};
type SubmitResult = { customerWhatsappSent: boolean; agentMessageNeeded: boolean; agentWhatsappSent: boolean; warnings: string[] };

type Form = {
  overallRating: number; productRatings: Record<string, number>; serviceRating: number; deliveryRating: number;
  improvement: string; wouldRecommend: "" | "YES" | "MAYBE" | "NO"; referralName: string; referralPhone: string;
  needsMore: boolean | null; requirementNote: string; willRateOnGoogle: boolean | null;
};

function emptyForm(): Form {
  return {
    overallRating: 0, productRatings: {}, serviceRating: 0, deliveryRating: 0, improvement: "",
    wouldRecommend: "", referralName: "", referralPhone: "", needsMore: null, requirementNote: "", willRateOnGoogle: null,
  };
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(value: string | number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(value));
}

const S = {
  input: { width: "100%", borderRadius: "6px", border: "1px solid #e2e8f0", padding: "6px 10px", fontSize: "12px", boxSizing: "border-box" as const, background: "white" },
  label: { display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px", textTransform: "uppercase" as const, letterSpacing: "0.03em" },
  section: { background: "white", borderRadius: "10px", border: "1px solid #e2e8f0", padding: "14px 16px", marginBottom: "10px" },
  sectionTitle: { fontSize: "12px", fontWeight: 700, color: "#0f172a", marginBottom: "10px", paddingBottom: "6px", borderBottom: "1px solid #f1f5f9" },
  question: { fontSize: "13px", fontWeight: 600, color: "#0f172a", marginBottom: "6px" },
  field: { padding: "10px 0", borderBottom: "1px solid #f1f5f9" },
};

const TABS = [
  { id: "pending", label: "To Call" },
  { id: "submitted", label: "Submitted" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const RECOMMEND_LABEL: Record<string, string> = { YES: "Yes", MAYBE: "Maybe", NO: "No" };

async function readError(res: Response, fallback: string) {
  try {
    const body = await res.json();
    const msg = Array.isArray(body?.message) ? body.message.join(", ") : body?.message;
    return msg || fallback;
  } catch {
    return fallback;
  }
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}
          style={{ background: "none", border: "none", padding: 2, cursor: "pointer" }}>
          <Star size={26} fill={n <= value ? "#f59e0b" : "none"} color={n <= value ? "#f59e0b" : "#cbd5e1"} />
        </button>
      ))}
      <span style={{ fontSize: 12, color: "#64748b", alignSelf: "center", marginLeft: 4 }}>{value ? `${value}/5` : ""}</span>
    </div>
  );
}

function ChoiceButtons<T extends string>({ options, value, onChange }: { options: Array<{ value: T; label: string }>; value: T | ""; onChange: (v: T) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all ${value === o.value ? "bg-brand-600 text-white border-brand-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const YES_NO = [{ value: "YES" as const, label: "Yes" }, { value: "NO" as const, label: "No" }];
const yesNoValue = (v: boolean | null) => (v === null ? "" : v ? "YES" : "NO");

export default function FeedbackPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("pending");

  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [form, setForm] = useState<Form>(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [lastResult, setLastResult] = useState<{ orderNumber: string; result: SubmitResult } | null>(null);

  const [submitted, setSubmitted] = useState<SubmittedFeedback[]>([]);
  const [submittedLoading, setSubmittedLoading] = useState(false);
  const [submittedError, setSubmittedError] = useState("");

  const handleAuth = useCallback((res: Response) => {
    if (res.status === 401) { clearAuth(); router.replace("/login"); return true; }
    return false;
  }, [router]);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${API_BASE_URL}/feedback/pending`, { headers: getAuthHeaders() });
      if (handleAuth(res)) return;
      if (!res.ok) { setLoadError(await readError(res, "Could not load delivered orders.")); return; }
      setPending(await res.json());
    } catch {
      setLoadError("Could not load delivered orders. Refresh to try again.");
    } finally {
      setPendingLoading(false);
    }
  }, [handleAuth]);

  const loadSubmitted = useCallback(async () => {
    setSubmittedLoading(true);
    setSubmittedError("");
    try {
      const res = await fetch(`${API_BASE_URL}/feedback/submitted`, { headers: getAuthHeaders() });
      if (handleAuth(res)) return;
      if (!res.ok) { setSubmittedError(await readError(res, "Could not load submitted feedback.")); return; }
      setSubmitted(await res.json());
    } catch {
      setSubmittedError("Could not load submitted feedback.");
    } finally {
      setSubmittedLoading(false);
    }
  }, [handleAuth]);

  useEffect(() => { void loadPending(); }, [loadPending]);

  useEffect(() => {
    setDetail(null);
    setDetailError("");
    setSubmitError("");
    setForm(emptyForm());
    if (!selectedId) return;
    let cancelled = false;
    setDetailLoading(true);
    fetch(`${API_BASE_URL}/feedback/orders/${encodeURIComponent(selectedId)}`, { headers: getAuthHeaders() })
      .then(async (res) => {
        if (cancelled || handleAuth(res)) return;
        if (!res.ok) { setDetailError(await readError(res, "Could not load this order.")); return; }
        setDetail(await res.json());
      })
      .catch(() => { if (!cancelled) setDetailError("Could not load this order."); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId, handleAuth]);

  const openOrder = (id: string) => {
    setSelectedId(id);
    setLastResult(null);
  };

  const submit = async () => {
    if (!detail || submitting) return;
    setSubmitError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/feedback/orders/${encodeURIComponent(detail.id)}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          overallRating: form.overallRating || null,
          productRatings: form.productRatings,
          serviceRating: form.serviceRating || null,
          deliveryRating: form.deliveryRating || null,
          improvement: form.improvement,
          wouldRecommend: form.wouldRecommend || null,
          referralName: form.referralName,
          referralPhone: form.referralPhone,
          needsMore: form.needsMore,
          requirementNote: form.requirementNote,
          willRateOnGoogle: form.willRateOnGoogle,
        }),
      });
      if (handleAuth(res)) return;
      if (!res.ok) { setSubmitError(await readError(res, "Could not save feedback.")); return; }
      const result: SubmitResult = await res.json();
      setLastResult({ orderNumber: detail.orderNumber, result });

      // Move to the next order in the list (or back to the list when done).
      const index = pending.findIndex((o) => o.id === detail.id);
      const remaining = pending.filter((o) => o.id !== detail.id);
      setPending(remaining);
      const next = remaining[index] ?? remaining[index - 1] ?? null;
      setSelectedId(next?.id ?? null);
    } catch {
      setSubmitError("Could not save feedback. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const resultBanner = lastResult && (
    <div style={{ ...S.section, background: "#f0fdf4", borderColor: "#bbf7d0", fontSize: 12 }}>
      <p style={{ fontWeight: 700, color: "#166534" }}>Feedback saved for order {lastResult.orderNumber}.</p>
      <p style={{ color: "#166534", marginTop: 2 }}>
        Customer WhatsApp: {lastResult.result.customerWhatsappSent ? "sent" : "not sent"}
        {" · "}Sales agent WhatsApp: {lastResult.result.agentMessageNeeded ? (lastResult.result.agentWhatsappSent ? "sent" : "not sent") : "not needed (no referral or requirement)"}
      </p>
      {lastResult.result.warnings.map((w) => <p key={w} style={{ color: "#b45309", marginTop: 2 }}>{w}</p>)}
    </div>
  );

  const renderList = () => (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      {resultBanner}
      <div style={S.section}>
        <p style={S.sectionTitle}>Delivered orders waiting for feedback (last 60 days)</p>
        {pendingLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}><Loader2 size={14} className="animate-spin" /> Loading…</div>
        ) : pending.length === 0 ? (
          <p style={{ fontSize: 12, color: "#64748b" }}>No delivered orders are waiting for feedback.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {pending.map((o) => (
              <button key={o.id} type="button" onClick={() => openOrder(o.id)}
                className="text-left rounded-lg border border-slate-200 hover:border-brand-600 bg-white transition-all"
                style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{o.customerName}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>Order {o.orderNumber} · Delivered {fmtDate(o.deliveredAt)}</span>
                </div>
                <div style={{ fontSize: 12, color: "#475569", marginTop: 3 }}>{o.products.join(", ") || "—"}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                  {[o.customerPhone, o.city, o.carrierName, o.salesAgentName ? `Agent: ${o.salesAgentName}` : null].filter(Boolean).join(" · ")}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderDetail = () => {
    const position = pending.findIndex((o) => o.id === selectedId);
    return (
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8 }}>
          <button type="button" onClick={() => setSelectedId(null)} className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft size={14} /> Back to list
          </button>
          {position >= 0 && <span style={{ fontSize: 11, color: "#64748b" }}>{position + 1} of {pending.length}</span>}
        </div>
        {resultBanner}
        {detailLoading && <div style={{ ...S.section, display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}><Loader2 size={14} className="animate-spin" /> Loading order…</div>}
        {detailError && <div style={{ ...S.section, color: "#b91c1c", fontSize: 12 }}>{detailError}</div>}
        {detail && (
          <>
            <div style={S.section}>
              <p style={S.sectionTitle}>Order {detail.orderNumber}</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, fontSize: 12 }}>
                <div><span style={S.label}>Customer</span>{detail.customer.businessName}{detail.customer.contactPerson ? ` (${detail.customer.contactPerson})` : ""}</div>
                <div>
                  <span style={S.label}>Phone</span>
                  {detail.customer.phone
                    ? <a href={`tel:${detail.customer.phone}`} className="text-brand-600 font-semibold inline-flex items-center gap-1"><Phone size={12} />{detail.customer.phone}</a>
                    : "—"}
                </div>
                <div><span style={S.label}>City</span>{[detail.customer.city, detail.customer.state].filter(Boolean).join(", ") || "—"}</div>
                <div><span style={S.label}>Sales Agent</span>{detail.salesAgent?.fullName ?? "—"}</div>
                <div><span style={S.label}>Order Date</span>{fmtDate(detail.orderDate)}</div>
                <div><span style={S.label}>Delivered</span>{fmtDate(detail.deliveredAt)}</div>
                <div><span style={S.label}>Order Total</span>{fmtMoney(detail.grandTotal)}</div>
              </div>
              {detail.notes && <p style={{ fontSize: 12, color: "#475569", marginTop: 10 }}><span style={S.label}>Notes</span>{detail.notes}</p>}
            </div>

            <div style={S.section}>
              <p style={S.sectionTitle}>Products</p>
              {detail.items.map((i) => (
                <div key={i.id} style={{ fontSize: 12, padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600 }}>{i.product.name} <span style={{ color: "#94a3b8", fontWeight: 400, fontSize: 11 }}>{i.product.sku}</span></span>
                    <span style={{ fontWeight: 600 }}>Qty {i.quantity} · {fmtMoney(i.lineTotal)}</span>
                  </div>
                  <div style={{ color: "#475569", marginTop: 2 }}>
                    {[i.product.sizeInches, `${i.product.gsm} GSM`, i.product.paperType, i.product.sides.replace(/_/g, " ")].filter(Boolean).join(" · ")}
                  </div>
                  {i.artworkNotes && <div style={{ color: "#64748b", fontSize: 11, marginTop: 2 }}>{i.artworkNotes}</div>}
                </div>
              ))}
            </div>

            <div style={S.section}>
              <p style={S.sectionTitle}>Courier</p>
              {detail.shipments.length === 0 ? (
                <p style={{ fontSize: 12, color: "#64748b" }}>No shipment record on this order.</p>
              ) : detail.shipments.map((s) => (
                <div key={s.id} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, fontSize: 12, padding: "6px 0" }}>
                  <div><span style={S.label}>Courier</span>{s.carrierName || s.transportName || s.dispatchType || "—"}</div>
                  <div><span style={S.label}>AWB / Tracking</span>{s.awbNumber || s.trackingNumber || s.lrNumber || "—"}</div>
                  <div><span style={S.label}>Booking Date</span>{fmtDate(s.dispatchDate ?? s.createdAt)}</div>
                  <div><span style={S.label}>Delivered</span>{fmtDate(s.deliveredAt)}</div>
                  <div><span style={S.label}>Status</span>{s.status.replace(/_/g, " ")}</div>
                </div>
              ))}
            </div>

            {detail.feedback ? (
              <div style={{ ...S.section, fontSize: 12, color: "#64748b" }}>Feedback was already recorded for this order.</div>
            ) : (
              <div style={S.section}>
                <p style={S.sectionTitle}>Customer Feedback</p>

                <div style={S.field}>
                  <p style={S.question}>1. How satisfied are you with your overall experience with Rareprint?</p>
                  <StarRating value={form.overallRating} onChange={(v) => setForm((f) => ({ ...f, overallRating: v }))} />
                </div>

                <div style={S.field}>
                  <p style={S.question}>2. How would you rate the quality of our products and printing?</p>
                  {detail.items.map((i) => (
                    <div key={i.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "4px 0" }}>
                      <span style={{ fontSize: 12, color: "#334155" }}>{i.product.name} <span style={{ color: "#94a3b8" }}>× {i.quantity}</span></span>
                      <StarRating value={form.productRatings[i.id] ?? 0}
                        onChange={(v) => setForm((f) => ({ ...f, productRatings: { ...f.productRatings, [i.id]: v } }))} />
                    </div>
                  ))}
                </div>

                <div style={S.field}>
                  <p style={S.question}>3. How would you rate our customer service and communication?</p>
                  <StarRating value={form.serviceRating} onChange={(v) => setForm((f) => ({ ...f, serviceRating: v }))} />
                </div>

                <div style={S.field}>
                  <p style={S.question}>4. How satisfied are you with our delivery time?</p>
                  <StarRating value={form.deliveryRating} onChange={(v) => setForm((f) => ({ ...f, deliveryRating: v }))} />
                </div>

                <div style={S.field}>
                  <p style={S.question}>5. What can we improve?</p>
                  <textarea rows={2} style={S.input} value={form.improvement} placeholder="Suggestion (optional)"
                    onChange={(e) => setForm((f) => ({ ...f, improvement: e.target.value }))} />
                </div>

                <div style={S.field}>
                  <p style={S.question}>6. Would you recommend Rareprint to others?</p>
                  <ChoiceButtons options={[{ value: "YES", label: "Yes" }, { value: "MAYBE", label: "Maybe" }, { value: "NO", label: "No" }]}
                    value={form.wouldRecommend} onChange={(v) => setForm((f) => ({ ...f, wouldRecommend: v }))} />
                  {form.wouldRecommend === "YES" && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 8 }}>
                      <div>
                        <label style={S.label}>Reference name</label>
                        <input style={S.input} value={form.referralName} onChange={(e) => setForm((f) => ({ ...f, referralName: e.target.value }))} />
                      </div>
                      <div>
                        <label style={S.label}>Reference phone</label>
                        <input style={S.input} inputMode="tel" maxLength={14} value={form.referralPhone}
                          onChange={(e) => setForm((f) => ({ ...f, referralPhone: e.target.value }))} />
                      </div>
                    </div>
                  )}
                </div>

                <div style={S.field}>
                  <p style={S.question}>7. Do you need anything else?</p>
                  <ChoiceButtons options={YES_NO} value={yesNoValue(form.needsMore)}
                    onChange={(v) => setForm((f) => ({ ...f, needsMore: v === "YES" }))} />
                  {form.needsMore && (
                    <textarea rows={2} style={{ ...S.input, marginTop: 8 }} value={form.requirementNote} placeholder="What does the customer need?"
                      onChange={(e) => setForm((f) => ({ ...f, requirementNote: e.target.value }))} />
                  )}
                </div>

                <div style={{ ...S.field, borderBottom: "none" }}>
                  <p style={S.question}>8. Would you rate our service on Google?</p>
                  <ChoiceButtons options={YES_NO} value={yesNoValue(form.willRateOnGoogle)}
                    onChange={(v) => setForm((f) => ({ ...f, willRateOnGoogle: v === "YES" }))} />
                </div>

                {submitError && <p style={{ color: "#b91c1c", fontSize: 12, margin: "8px 0" }}>{submitError}</p>}
                <button type="button" onClick={() => void submit()} disabled={submitting}
                  className="mt-2 w-full sm:w-auto px-6 py-2 rounded-lg text-sm font-semibold bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  {submitting && <Loader2 size={14} className="animate-spin" />} Submit &amp; next order
                </button>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderSubmitted = () => (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={S.section}>
        <p style={S.sectionTitle}>Submitted feedback (latest 200)</p>
        {submittedError && <p style={{ color: "#b91c1c", fontSize: 12 }}>{submittedError}</p>}
        {submittedLoading ? (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}><Loader2 size={14} className="animate-spin" /> Loading…</div>
        ) : submitted.length === 0 ? (
          <p style={{ fontSize: 12, color: "#64748b" }}>No feedback submitted yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {submitted.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200" style={{ padding: "10px 12px", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{f.order?.customer.businessName ?? "—"}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>Order {f.order?.orderNumber ?? "—"} · {fmtDate(f.createdAt)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, marginTop: 8 }}>
                  <div><span style={S.label}>Ratings</span>Overall {f.overallRating}/5 · Service {f.serviceRating}/5 · Delivery {f.deliveryRating}/5</div>
                  <div><span style={S.label}>Products</span>{(f.productRatings ?? []).map((p) => <div key={p.orderItemId}>{p.productName} {p.rating}/5</div>)}</div>
                  <div><span style={S.label}>Improve</span>{f.improvement || "—"}</div>
                  <div>
                    <span style={S.label}>Recommend</span>{RECOMMEND_LABEL[f.wouldRecommend] ?? f.wouldRecommend}
                    {(f.referralName || f.referralPhone) && <div style={{ color: "#475569" }}>{[f.referralName, f.referralPhone].filter(Boolean).join(" · ")}</div>}
                  </div>
                  <div><span style={S.label}>Needs more</span>{f.needsMore ? (f.requirementNote || "Yes") : "No"}</div>
                  <div><span style={S.label}>Google review</span>{f.willRateOnGoogle ? "Yes" : "No"}</div>
                  <div><span style={S.label}>By</span>{f.submittedByName ?? "—"}{f.order?.salesAgent ? ` · Agent: ${f.order.salesAgent.fullName}` : ""}</div>
                  <div><span style={S.label}>WhatsApp</span>Customer: {f.customerWhatsappSent ? "sent" : "not sent"} · Agent: {f.agentWhatsappSent ? "sent" : "—"}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DashboardShell>
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex gap-1 bg-slate-100 px-2 pt-2 pb-0 shrink-0">
          <div className="flex gap-1 bg-slate-100 rounded-t-lg p-1 flex-wrap flex-1">
            <span className="hidden md:flex items-center px-2 text-xs font-bold text-blue-700 whitespace-nowrap">Feedback</span>
            {TABS.map((t) => (
              <button key={t.id} onClick={() => { setTab(t.id); if (t.id === "submitted") void loadSubmitted(); }}
                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all min-w-[52px] ${tab === t.id ? "bg-white text-brand-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {t.label}{t.id === "pending" && !pendingLoading ? ` (${pending.length})` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4 pt-2">
          {loadError && <div style={{ ...S.section, color: "#b91c1c", fontSize: 12 }}>{loadError}</div>}
          {tab === "pending" && (selectedId ? renderDetail() : renderList())}
          {tab === "submitted" && renderSubmitted()}
        </div>
      </div>
    </DashboardShell>
  );
}
