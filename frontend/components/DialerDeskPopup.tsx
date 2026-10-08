"use client";
// PC popup for the Android auto dialer. While the agent's phone is dialing a
// number (same login), this shows that customer on the desktop with a form to
// note their reply. Submitting saves it on the call (POST /dialer/desk-response);
// the phone saves it with the real call duration once the call ends and dials
// the next number straight away.
// Interested → pick a rate list and open the chat in the agent's own
// WhatsApp Web with the message typed in.
// Mounted by DashboardShell on the website only (never inside the app).
import { useCallback, useEffect, useRef, useState } from "react";
import { PhoneCall, Minus, MessageCircle } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import {
  DIALER_OUTCOMES,
  fillRateListMessage,
  whatsappAppUrl,
  whatsappWebUrl,
  type DialerOutcome,
  type DialerSettings,
} from "@/lib/dialerShared";

const POLL_MS = 3000;
// After this many failed polls in a row (backend not deployed / DB not migrated
// yet / offline), poll only every BACKOFF_MS instead of flooding the server.
const MAX_FAILS = 3;
const BACKOFF_MS = 60000;
const WHATSAPP_WINDOW = "rareprint_whatsapp"; // reuse one WhatsApp Web tab

interface LiveItem {
  phone: string;
  name: string | null;
  businessName: string | null;
  productInterest: string | null;
  tags: string[];
  status: string;
  lastNote: string | null;
  lockedAt: string;
  deskResponse: { outcome: DialerOutcome; note: string | null; callbackAt: string | null; submittedAt: string } | null;
  recentCalls: Array<{ startedAt: string; outcome: DialerOutcome; note: string | null; durationSec: number; answered: boolean; agentName: string }>;
  agent: { name: string; phone: string };
}

const outcomeLabel = (o: string) => DIALER_OUTCOMES.find((x) => x.value === o)?.label ?? o;
const fmtDate = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

export function DialerDeskPopup() {
  const [item, setItem] = useState<LiveItem | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [outcome, setOutcome] = useState<DialerOutcome | null>(null);
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [settings, setSettings] = useState<DialerSettings | null>(null);
  const [rateListId, setRateListId] = useState("");
  const [editing, setEditing] = useState(false); // "Change answer" on an already-saved response
  const [copied, setCopied] = useState(false);
  // Which call the form belongs to — a new number (or a new lock) resets it.
  const callKeyRef = useRef("");
  const failsRef = useRef(0);

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
      setOutcome(null);
      setNote("");
      setCallbackAt("");
      setError("");
      setRateListId("");
      setEditing(false);
      setCopied(false);
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

  // Rate lists: loaded once, the first time a call shows up.
  useEffect(() => {
    if (!item || settings) return;
    apiFetch<DialerSettings>("/dialer/settings").then((s) => { if (s) setSettings(s); });
  }, [item, settings]);

  if (!item) return null;

  const submitted = editing ? null : item.deskResponse;
  const rateList = settings?.rateLists.find((r) => r.id === rateListId) ?? null;

  const submit = async () => {
    if (!outcome || saving) return;
    if (outcome === "CALLBACK" && !callbackAt) { setError("Pick the callback date and time."); return; }
    setError("");
    setSaving(true);
    const ok = await apiMutate("/dialer/desk-response", "POST", {
      number: item.phone,
      outcome,
      note: note.trim() || undefined,
      callbackAt: outcome === "CALLBACK" ? new Date(callbackAt).toISOString() : undefined,
    }, (msg) => setError(msg));
    setSaving(false);
    if (ok) { setEditing(false); poll(); }
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
        <PhoneCall size={16} /> On call: {item.name || item.phone}
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-[9500] w-[380px] max-w-[calc(100vw-32px)] max-h-[calc(100vh-32px)] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-2 rounded-t-xl bg-green-600 px-4 py-2 text-white">
        <div className="flex items-center gap-2 text-sm font-semibold"><PhoneCall size={16} /> Phone dialer · live call</div>
        <button type="button" onClick={() => setMinimized(true)} aria-label="Minimize" className="rounded p-1 hover:bg-green-700"><Minus size={16} /></button>
      </div>

      <div className="space-y-3 p-4 text-sm">
        <div>
          <div className="text-lg font-bold text-slate-900 break-words">{item.name || "Unnamed"}</div>
          {item.businessName && <div className="text-slate-600 break-words">{item.businessName}</div>}
          <div className="text-slate-500">{item.phone} · {item.status}</div>
        </div>
        {item.productInterest && <div><span className="text-slate-500">Interested in: </span>{item.productInterest}</div>}
        {item.lastNote && <div className="break-words"><span className="text-slate-500">Last note: </span>{item.lastNote}</div>}
        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((t) => <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>)}
          </div>
        )}
        {item.recentCalls.length > 0 && (
          <details className="rounded-lg border border-slate-200 px-3 py-2">
            <summary className="cursor-pointer text-xs font-semibold text-slate-600">Previous dialer calls ({item.recentCalls.length})</summary>
            <ul className="mt-2 space-y-1 text-xs text-slate-700">
              {item.recentCalls.map((c) => (
                <li key={c.startedAt} className="break-words">
                  {fmtDate(c.startedAt)} · {outcomeLabel(c.outcome)} · {c.agentName}{c.note ? ` — ${c.note}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}

        {submitted ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800">
            <div className="font-semibold">Saved: {outcomeLabel(submitted.outcome)}</div>
            {submitted.note && <div className="break-words">{submitted.note}</div>}
            <div className="mt-1 text-xs">Your phone saves this and dials the next number as soon as the call ends.</div>
            <button type="button" className="mt-2 text-xs font-semibold underline" onClick={() => { setOutcome(submitted.outcome); setNote(submitted.note ?? ""); setEditing(true); }}>
              Change answer
            </button>
          </div>
        ) : (
          <>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 break-words">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              {DIALER_OUTCOMES.map((o) => (
                <button key={o.value} type="button" onClick={() => { setOutcome(o.value); setError(""); }}
                  className={`rounded-lg px-2 py-2 text-xs font-medium ${outcome === o.value ? `${o.className} ring-2 ring-offset-1 ring-slate-300` : "border border-slate-300 text-slate-800"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            {outcome === "CALLBACK" && (
              <label className="block">
                <span className="text-slate-700">Callback date &amp; time</span>
                <input type="datetime-local" value={callbackAt} onChange={(e) => { setCallbackAt(e.target.value); setError(""); }}
                  className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
            )}
            <label className="block">
              <span className="text-slate-700">Customer&apos;s reply</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
                className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="What did they say? Product, quantity, budget…" />
            </label>
          </>
        )}

        {(outcome === "INTERESTED" || submitted?.outcome === "INTERESTED") && (
          <section className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center gap-1 font-semibold text-emerald-800"><MessageCircle size={14} /> Send product details on WhatsApp</div>
            {settings && settings.rateLists.length === 0 && (
              <p className="text-xs text-emerald-800">No rate lists yet — an admin can add them on the Dialer page.</p>
            )}
            {settings && settings.rateLists.length > 0 && (
              <>
                <select value={rateListId} onChange={(e) => { setRateListId(e.target.value); setCopied(false); }} className="w-full rounded-lg border bg-white px-3 py-2">
                  <option value="">Choose a rate list…</option>
                  {settings.rateLists.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button type="button" disabled={!rateList} onClick={() => openWhatsApp("web")}
                  className="w-full rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white disabled:opacity-50">
                  Open in my WhatsApp Web
                </button>
                <div className="flex gap-2">
                  <button type="button" disabled={!rateList} onClick={() => openWhatsApp("app")}
                    className="flex-1 rounded-lg border border-emerald-600 bg-white px-2 py-1.5 text-xs font-medium text-emerald-800 disabled:opacity-50">
                    WhatsApp desktop app
                  </button>
                  <button type="button" disabled={!rateList} onClick={copyMessage}
                    className="flex-1 rounded-lg border border-emerald-600 bg-white px-2 py-1.5 text-xs font-medium text-emerald-800 disabled:opacity-50">
                    {copied ? "Copied ✓" : "Copy message"}
                  </button>
                </div>
                <p className="text-xs text-emerald-800">Opens this customer&apos;s chat with the message typed — press Send there. WhatsApp Web reloads each time a chat is opened this way; the desktop app doesn&apos;t. Your WhatsApp quick replies (/) work in the chat too.</p>
              </>
            )}
          </section>
        )}

        {!submitted && (
          <button type="button" onClick={submit} disabled={!outcome || saving}
            className="w-full rounded-lg bg-slate-900 px-4 py-2.5 font-medium text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save & call next"}
          </button>
        )}
      </div>
    </div>
  );
}
