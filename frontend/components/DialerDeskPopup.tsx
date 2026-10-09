"use client";
// PC popup for the Android auto dialer. While the agent's phone is on a lead
// call (same login), this shows that customer on the desktop:
//  - left: customer details + full call history (auto dialer + CRM calls)
//  - right: the reply form — outcome; Interested → products (from the product
//    database) with quantity + rate, as many as needed; Not interested → reason
//    (rate / quantity / trust / no requirement) with product, quantity and note;
//    callback time; note.
// "Save & call next / pause / stop" saves it on the call (POST /dialer/desk-response);
// the phone saves it with the real call duration as soon as the call ends —
// without asking for the reply again — then dials next, pauses or stops.
// "End call" asks the phone to hang up (POST /dialer/end-call).
// Interested → pick a rate list and open the chat in the agent's own
// WhatsApp Web with the message typed in.
// Mounted by DashboardShell on the website only (never inside the app).
import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneCall, PhoneOff, Minus, MessageCircle, Plus, Trash2 } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import {
  DIALER_OUTCOMES,
  NOT_INTERESTED_REASONS,
  buildReplyDetails,
  describeReplyProducts,
  fillRateListMessage,
  notInterestedReasonLabel,
  productsWhatsAppMessage,
  replyProductRule,
  whatsappAppUrl,
  whatsappWebUrl,
  type DialerOutcome,
  type DialerSettings,
  type NotInterestedReason,
  type ReplyProduct,
  type ReplyProductDraft,
} from "@/lib/dialerShared";

const POLL_MS = 3000;
// After this many failed polls in a row (backend not deployed / DB not migrated
// yet / offline), poll only every BACKOFF_MS instead of flooding the server.
const MAX_FAILS = 3;
const BACKOFF_MS = 60000;
const WHATSAPP_WINDOW = "rareprint_whatsapp"; // reuse one WhatsApp Web tab

type Then = "NEXT" | "PAUSE" | "STOP";
type LiveState = "DIALING" | "ON_CALL" | "WRAP_UP";

interface DeskResponse {
  outcome: DialerOutcome;
  note: string | null;
  callbackAt: string | null;
  submittedAt: string;
  notInterestedReason?: string | null;
  products?: ReplyProduct[];
  then?: Then;
}
interface CallHistoryRow {
  via: "DIALER" | "CRM";
  at: string;
  outcome: DialerOutcome | null;
  note: string | null;
  durationSec: number | null;
  answered: boolean;
  agentName: string;
  notInterestedReason?: string | null;
  products?: ReplyProduct[] | null;
}
interface LiveItem {
  phone: string;
  name: string | null;
  businessName: string | null;
  productInterest: string | null;
  tags: string[];
  status: string;
  lastNote: string | null;
  lockedAt: string;
  liveState?: LiveState;
  endCallRequested?: boolean;
  deskResponse: DeskResponse | null;
  // Auto dialer calls + calls logged from the CRM, newest first (CRM calls have no dialer outcome).
  callHistory?: CallHistoryRow[];
  agent: { name: string; phone: string };
}
interface ProductOption { id: string; name: string; sku?: string | null; }

const STATE_LABELS: Record<LiveState, { label: string; className: string }> = {
  DIALING: { label: "Ringing", className: "bg-amber-400 text-amber-950" },
  ON_CALL: { label: "On call", className: "bg-white text-green-700" },
  WRAP_UP: { label: "Call ended — save the reply", className: "bg-slate-900 text-white" },
};
const THEN_LABELS: Record<Then, string> = { NEXT: "then call next", PAUSE: "then pause", STOP: "then stop" };
const emptyRow = (): ReplyProductDraft => ({ productId: "", quantity: "", rate: "" });
const outcomeLabel = (o: string) => DIALER_OUTCOMES.find((x) => x.value === o)?.label ?? o;
const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const fmtDuration = (sec: number | null) => (sec == null ? "" : sec >= 60 ? `${Math.floor(sec / 60)}m ${sec % 60}s` : `${sec}s`);
/** ISO instant → local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
const toLocalInput = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export function DialerDeskPopup() {
  const [item, setItem] = useState<LiveItem | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [outcome, setOutcome] = useState<DialerOutcome | null>(null);
  const [reason, setReason] = useState<NotInterestedReason | "">("");
  const [rows, setRows] = useState<ReplyProductDraft[]>([emptyRow()]);
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [saving, setSaving] = useState<Then | null>(null);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<DialerSettings | null>(null);
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const [rateListId, setRateListId] = useState("");
  const [editing, setEditing] = useState(false); // "Change answer" on an already-saved response
  const [copied, setCopied] = useState(false);
  // Which call the form belongs to — a new number (or a new lock) resets it.
  const callKeyRef = useRef("");
  const failsRef = useRef(0);

  const resetForm = () => {
    setOutcome(null);
    setReason("");
    setRows([emptyRow()]);
    setNote("");
    setCallbackAt("");
    setError("");
    setRateListId("");
    setEditing(false);
    setCopied(false);
    setEnding(false);
  };

  const poll = useCallback(async () => {
    // Never inside the Android app — the phone has its own outcome screen.
    if (Capacitor.isNativePlatform() || document.visibilityState !== "visible") return;
    const res = await apiFetch<{ item: LiveItem | null }>("/dialer/live");
    if (!res) { failsRef.current += 1; return; } // keep what's on screen
    failsRef.current = 0;
    const next = res.item;
    const key = next ? `${next.phone}|${next.lockedAt}` : "";
    if (key !== callKeyRef.current) {
      callKeyRef.current = key;
      resetForm();
      setMinimized(false);
    }
    setItem(next);
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const loop = async () => {
      await poll();
      if (!stopped) timer = setTimeout(loop, failsRef.current >= MAX_FAILS ? BACKOFF_MS : POLL_MS);
    };
    loop();
    document.addEventListener("visibilitychange", poll);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener("visibilitychange", poll); };
  }, [poll]);

  // Rate lists + product list: loaded once, the first time a call shows up.
  useEffect(() => {
    if (!item) return;
    if (!settings) apiFetch<DialerSettings>("/dialer/settings").then((s) => { if (s) setSettings(s); });
    if (!products) apiFetch<ProductOption[]>("/products").then((p) => { if (p) setProducts(p); });
  }, [item, settings, products]);

  if (!item) return null;

  const submitted = editing ? null : item.deskResponse;
  const callHistory = item.callHistory ?? [];
  const rateList = settings?.rateLists.find((r) => r.id === rateListId) ?? null;
  const productRule = replyProductRule(outcome, reason);
  const withRate = reason !== "QUANTITY";
  const liveState = item.liveState ?? "ON_CALL";
  const canEndCall = liveState === "DIALING" || liveState === "ON_CALL";

  const submit = async (then: Then) => {
    if (!outcome || saving) return;
    if (outcome === "CALLBACK" && !callbackAt) { setError("Pick the callback date and time."); return; }
    const details = buildReplyDetails(outcome, reason, rows);
    if ("error" in details) { setError(details.error); return; }
    setError("");
    setSaving(then);
    const ok = await apiMutate("/dialer/desk-response", "POST", {
      number: item.phone,
      outcome,
      note: note.trim() || undefined,
      callbackAt: outcome === "CALLBACK" ? new Date(callbackAt).toISOString() : undefined,
      ...details.value,
      then,
    }, (msg) => setError(msg));
    setSaving(null);
    if (ok) { setEditing(false); poll(); }
  };

  const endCall = async () => {
    if (ending) return;
    setEnding(true);
    const ok = await apiMutate("/dialer/end-call", "POST", { number: item.phone }, (msg) => setError(msg));
    if (!ok) setEnding(false);
    else poll();
  };

  const changeAnswer = (r: DeskResponse) => {
    setOutcome(r.outcome);
    setNote(r.note ?? "");
    setCallbackAt(r.callbackAt ? toLocalInput(r.callbackAt) : "");
    setReason((r.notInterestedReason as NotInterestedReason) ?? "");
    setRows(r.products?.length
      ? r.products.map((p) => ({ productId: p.productId, quantity: String(p.quantity), rate: p.rate == null ? "" : String(p.rate) }))
      : [emptyRow()]);
    setEditing(true);
  };

  const updateRow = (i: number, patch: Partial<ReplyProductDraft>) =>
    setRows((list) => list.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  // Products for "Send these products on WhatsApp": what's typed in the form,
  // or what was already saved for this call. Rows without a product or quantity are skipped.
  const productName = (id: string) => products?.find((p) => p.id === id)?.name ?? "Product";
  const productsToSend: Array<{ name: string; quantity: number; rate: number | null }> = submitted
    ? (submitted.outcome === "INTERESTED" ? submitted.products ?? [] : []).map((p) => ({ name: p.productName ?? productName(p.productId), quantity: p.quantity, rate: p.rate }))
    : rows
        .filter((r) => r.productId && Number(r.quantity) > 0)
        .map((r) => ({ name: productName(r.productId), quantity: Number(r.quantity), rate: r.rate.trim() && Number.isFinite(Number(r.rate)) ? Number(r.rate) : null }));
  const sendProducts = (where: "web" | "app") => {
    if (!productsToSend.length) return;
    const text = productsWhatsAppMessage(productsToSend, { name: item.name, agent: item.agent.name, agentPhone: item.agent.phone });
    if (where === "web") window.open(whatsappWebUrl(item.phone, text), WHATSAPP_WINDOW);
    else window.location.href = whatsappAppUrl(item.phone, text);
  };

  const rateListText = () => rateList ? fillRateListMessage(rateList.message, {
    name: item.name, business: item.businessName, agent: item.agent.name, agentPhone: item.agent.phone,
  }) : "";
  const openWhatsApp = (where: "web" | "app") => {
    if (!rateList) return;
    if (where === "web") window.open(whatsappWebUrl(item.phone, rateListText()), WHATSAPP_WINDOW);
    else window.location.href = whatsappAppUrl(item.phone, rateListText());
  };
  const copyMessage = async () => {
    if (!rateList) return;
    try { await navigator.clipboard.writeText(rateListText()); setCopied(true); } catch { setError("Could not copy — select the text and copy it by hand."); }
  };

  if (minimized) {
    return (
      <button type="button" onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-[9500] flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        <PhoneCall size={16} /> {STATE_LABELS[liveState].label}: {item.name || item.phone}
      </button>
    );
  }

  const state = STATE_LABELS[liveState];

  return (
    <div className="fixed right-4 top-4 bottom-4 z-[9500] flex w-[960px] max-w-[calc(100vw-32px)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-green-600 px-5 py-3 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <PhoneCall size={22} />
          <div className="min-w-0">
            <div className="truncate text-xl font-bold">{item.name || "Unnamed"}</div>
            <div className="text-sm text-green-50">{item.phone}{item.businessName ? ` · ${item.businessName}` : ""}</div>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${state.className}`}>{state.label}</span>
        </div>
        <div className="flex items-center gap-2">
          {canEndCall && (
            <button type="button" onClick={endCall} disabled={ending || item.endCallRequested}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow hover:bg-red-700 disabled:opacity-70">
              <PhoneOff size={16} /> {ending || item.endCallRequested ? "Ending call…" : "End call"}
            </button>
          )}
          <button type="button" onClick={() => setMinimized(true)} aria-label="Minimize" className="rounded p-2 hover:bg-green-700"><Minus size={18} /></button>
        </div>
      </div>

      {error && <div className="border-b border-red-200 bg-red-50 px-5 py-2 text-sm text-red-700 break-words">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:overflow-hidden">
        {/* Left: customer + call history */}
        <div className="space-y-4 border-b border-slate-200 p-5 text-sm lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div><div className="text-xs text-slate-500">Status</div><div className="font-semibold text-slate-800">{item.status}</div></div>
            <div><div className="text-xs text-slate-500">Interested in</div><div className="font-semibold text-slate-800 break-words">{item.productInterest || "—"}</div></div>
          </div>
          {item.lastNote && (
            <div className="rounded-lg bg-amber-50 p-3 break-words"><span className="text-xs font-semibold text-amber-800">Last note: </span>{item.lastNote}</div>
          )}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {item.tags.map((t) => <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>)}
            </div>
          )}

          <div>
            <h3 className="mb-2 font-bold text-slate-900">Call history ({callHistory.length})</h3>
            {callHistory.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-slate-500">First call to this customer.</p>
            ) : (
              <ul className="space-y-2">
                {callHistory.map((c) => (
                  <li key={`${c.via}-${c.at}`} className="rounded-lg border border-slate-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">
                        {c.outcome ? outcomeLabel(c.outcome) : c.answered ? "Answered" : "Not answered"}
                        {c.notInterestedReason ? ` · ${notInterestedReasonLabel(c.notInterestedReason)}` : ""}
                      </span>
                      <span className="text-xs text-slate-500">{fmtDate(c.at)}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.via === "CRM" ? "Logged in CRM" : "Auto dialer"} · {c.agentName}{c.durationSec ? ` · ${fmtDuration(c.durationSec)}` : ""}
                    </div>
                    {c.products && c.products.length > 0 && <div className="mt-1 text-slate-700">{describeReplyProducts(c.products)}</div>}
                    {c.note && <div className="mt-1 break-words text-slate-700">{c.note}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Right: reply form */}
        <div className="space-y-4 p-5 text-sm lg:overflow-y-auto">
          {submitted ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">
              <div className="text-base font-bold">
                Saved: {outcomeLabel(submitted.outcome)}
                {submitted.notInterestedReason ? ` · ${notInterestedReasonLabel(submitted.notInterestedReason)}` : ""}
                {` — ${THEN_LABELS[submitted.then ?? "NEXT"]}`}
              </div>
              {submitted.products && submitted.products.length > 0 && <div className="mt-1">{describeReplyProducts(submitted.products)}</div>}
              {submitted.callbackAt && <div className="mt-1">Callback: {fmtDate(submitted.callbackAt)}</div>}
              {submitted.note && <div className="mt-1 break-words">{submitted.note}</div>}
              <div className="mt-2 text-xs">
                {liveState === "WRAP_UP"
                  ? "Your phone is saving this now."
                  : "Your phone saves this as soon as the call ends — no need to choose the reply there."}
              </div>
              <button type="button" className="mt-3 text-sm font-semibold underline" onClick={() => changeAnswer(submitted)}>
                Change answer
              </button>
            </div>
          ) : (
            <>
              <div>
                <h3 className="mb-2 font-bold text-slate-900">Customer&apos;s reply</h3>
                <div className="grid grid-cols-3 gap-2">
                  {DIALER_OUTCOMES.map((o) => (
                    <button key={o.value} type="button" onClick={() => { setOutcome(o.value); setReason(""); setRows([emptyRow()]); setError(""); }}
                      className={`rounded-lg px-2 py-3 text-sm font-semibold ${outcome === o.value ? `${o.className} ring-2 ring-offset-1 ring-slate-300` : "border border-slate-300 text-slate-800 hover:bg-slate-50"}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {outcome === "NOT_INTERESTED" && (
                <label className="block">
                  <span className="font-semibold text-slate-800">Why not interested?</span>
                  <select value={reason} onChange={(e) => { setReason(e.target.value as NotInterestedReason | ""); setRows([emptyRow()]); setError(""); }}
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2">
                    <option value="">Choose a reason…</option>
                    {NOT_INTERESTED_REASONS.map((r, i) => <option key={r.value} value={r.value}>{i + 1}. {r.label}</option>)}
                  </select>
                </label>
              )}

              {productRule !== "none" && (
                <section className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="font-semibold text-slate-800">
                    {outcome === "INTERESTED" ? "Products the customer wants"
                      : reason === "RATE" ? "Product the customer asked the rate for"
                      : "Product and the quantity the customer needs"}
                    {productRule === "required" ? " *" : " (optional)"}
                  </div>
                  <div className={`grid gap-2 text-xs font-semibold text-slate-500 ${withRate ? "grid-cols-[minmax(0,1fr)_96px_96px_32px]" : "grid-cols-[minmax(0,1fr)_120px_32px]"}`}>
                    <span>Product</span><span>{reason === "QUANTITY" ? "Required qty" : "Quantity"}</span>
                    {withRate && <span>{reason === "RATE" ? "Asking rate ₹/pc" : "Rate ₹/pc"}</span>}<span />
                  </div>
                  {rows.map((r, i) => (
                    <div key={i} className={`grid items-center gap-2 ${withRate ? "grid-cols-[minmax(0,1fr)_96px_96px_32px]" : "grid-cols-[minmax(0,1fr)_120px_32px]"}`}>
                      <select value={r.productId} onChange={(e) => updateRow(i, { productId: e.target.value })}
                        className="min-w-0 rounded-lg border bg-white px-2 py-2">
                        <option value="">{products ? "Choose product…" : "Loading products…"}</option>
                        {(products ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ""}</option>)}
                      </select>
                      <input value={r.quantity} onChange={(e) => updateRow(i, { quantity: e.target.value.replace(/[^\d]/g, "") })}
                        inputMode="numeric" placeholder="Qty" className="min-w-0 rounded-lg border px-2 py-2" />
                      {withRate && (
                        <input value={r.rate} onChange={(e) => updateRow(i, { rate: e.target.value.replace(/[^\d.]/g, "") })}
                          inputMode="decimal" placeholder="₹" className="min-w-0 rounded-lg border px-2 py-2" />
                      )}
                      <button type="button" aria-label="Remove product" disabled={rows.length === 1}
                        onClick={() => setRows((list) => list.filter((_, idx) => idx !== i))}
                        className="flex h-8 w-8 items-center justify-center rounded text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setRows((list) => [...list, emptyRow()])}
                    className="flex items-center gap-1 rounded-lg border border-dashed border-slate-400 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white">
                    <Plus size={14} /> Add another product
                  </button>
                </section>
              )}

              {outcome === "CALLBACK" && (
                <label className="block">
                  <span className="font-semibold text-slate-800">Callback date &amp; time</span>
                  <input type="datetime-local" value={callbackAt} onChange={(e) => { setCallbackAt(e.target.value); setError(""); }}
                    className="mt-1 w-full rounded-lg border px-3 py-2" />
                </label>
              )}

              <label className="block">
                <span className="font-semibold text-slate-800">Note</span>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  placeholder={reason === "RATE" ? "What rate is the customer asking for? Anything else they said…"
                    : reason === "TRUST" ? "What are they unsure about?"
                    : "What did the customer say?"} />
              </label>
            </>
          )}

          {(outcome === "INTERESTED" || submitted?.outcome === "INTERESTED") && (
            <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-1 font-semibold text-emerald-800"><MessageCircle size={14} /> Send product details on WhatsApp</div>
              {/* 1. The products entered above, with quantity + rate */}
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" disabled={!productsToSend.length} onClick={() => sendProducts("web")}
                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white disabled:opacity-50">
                  Send {productsToSend.length ? `these ${productsToSend.length} product${productsToSend.length > 1 ? "s" : ""}` : "the products above"} — WhatsApp Web
                </button>
                <button type="button" disabled={!productsToSend.length} onClick={() => sendProducts("app")}
                  className="rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-medium text-emerald-800 disabled:opacity-50">
                  Desktop app
                </button>
              </div>
              {!productsToSend.length && <p className="text-xs text-emerald-800">Add the products (and quantity) above to send them.</p>}
              {/* 2. A ready-made rate list (Dialer settings) */}
              <div className="pt-1 text-xs font-semibold text-emerald-800">Or send a rate list</div>
              {settings && settings.rateLists.length === 0 && (
                <p className="text-xs text-emerald-800">No rate lists yet — an admin can add them on the Dialer page.</p>
              )}
              {settings && settings.rateLists.length > 0 && (
                <>
                  <select value={rateListId} onChange={(e) => { setRateListId(e.target.value); setCopied(false); }} className="w-full rounded-lg border bg-white px-3 py-2">
                    <option value="">Choose a rate list…</option>
                    {settings.rateLists.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" disabled={!rateList} onClick={() => openWhatsApp("web")}
                      className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white disabled:opacity-50">
                      Open in my WhatsApp Web
                    </button>
                    <button type="button" disabled={!rateList} onClick={() => openWhatsApp("app")}
                      className="rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-medium text-emerald-800 disabled:opacity-50">
                      WhatsApp desktop app
                    </button>
                    <button type="button" disabled={!rateList} onClick={copyMessage}
                      className="rounded-lg border border-emerald-600 bg-white px-3 py-2 text-xs font-medium text-emerald-800 disabled:opacity-50">
                      {copied ? "Copied ✓" : "Copy message"}
                    </button>
                  </div>
                </>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Footer: save buttons */}
      {!submitted && (
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => submit("NEXT")} disabled={!outcome || !!saving}
              className="min-w-[180px] flex-[2] rounded-lg bg-slate-900 px-4 py-3 text-base font-bold text-white disabled:opacity-50">
              {saving === "NEXT" ? "Saving…" : "Save & call next"}
            </button>
            <button type="button" onClick={() => submit("PAUSE")} disabled={!outcome || !!saving}
              className="min-w-[130px] flex-1 rounded-lg border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-800 disabled:opacity-50">
              {saving === "PAUSE" ? "Saving…" : "Save & pause"}
            </button>
            <button type="button" onClick={() => submit("STOP")} disabled={!outcome || !!saving}
              className="min-w-[130px] flex-1 rounded-lg border border-red-300 bg-white px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50">
              {saving === "STOP" ? "Saving…" : "Save & stop"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
