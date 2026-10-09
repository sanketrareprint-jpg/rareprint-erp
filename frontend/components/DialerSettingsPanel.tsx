"use client";
// Admin-only dialer settings, shown on the Power Dialer page (website):
//  - Rate lists: ready-made product/rate WhatsApp messages agents send to an
//    Interested customer from their own WhatsApp Web (PC popup).
//  - WhatsApp campaign per call outcome: the AiSensy API campaign sent to the
//    customer automatically after the call is saved.
// Backend: GET / PUT /dialer/settings (PUT is admin-only there too).
import { useEffect, useState } from "react";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import { DIALER_OUTCOMES, NOT_INTERESTED_REASONS, RATE_LIST_PLACEHOLDERS, type DialerSettings, type RateList } from "@/lib/dialerShared";

// No WhatsApp ever goes to a wrong number (backend rejects it too).
const CAMPAIGN_OUTCOMES = DIALER_OUTCOMES.filter((o) => o.value !== "WRONG_NUMBER");

export function DialerSettingsPanel() {
  const [rateLists, setRateLists] = useState<RateList[]>([]);
  const [campaigns, setCampaigns] = useState<Partial<Record<string, string>>>({});
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    apiFetch<DialerSettings>("/dialer/settings", {}, (msg) => setMessage({ kind: "error", text: msg })).then((s) => {
      if (s) { setRateLists(s.rateLists); setCampaigns(s.outcomeCampaigns); }
      setLoaded(true);
    });
  }, []);

  const updateList = (i: number, patch: Partial<RateList>) =>
    setRateLists((lists) => lists.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const saved = await apiMutate<DialerSettings>("/dialer/settings", "PUT", { rateLists, outcomeCampaigns: campaigns },
      (msg) => setMessage({ kind: "error", text: msg }));
    setSaving(false);
    if (saved) {
      setRateLists(saved.rateLists);
      setCampaigns(saved.outcomeCampaigns);
      setMessage({ kind: "ok", text: "Dialer settings saved." });
    }
  };

  if (!loaded) return <div className="text-sm text-slate-500">Loading dialer settings…</div>;

  return (
    <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-bold text-slate-900">Dialer settings <span className="text-xs font-normal text-slate-500">(admins)</span></h2>

      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-slate-800">Rate lists (WhatsApp messages for Interested customers)</h3>
          <p className="text-xs text-slate-500">
            The agent picks one in the PC popup and it opens in their WhatsApp Web, ready to send. You can use {RATE_LIST_PLACEHOLDERS}.
            Links to a PDF / image (e.g. Google Drive) can go in the message.
          </p>
        </div>
        {rateLists.length === 0 && <p className="text-sm text-slate-500">No rate lists yet.</p>}
        {rateLists.map((l, i) => (
          <div key={l.id || i} className="space-y-2 rounded-lg border border-slate-200 p-3">
            <div className="flex gap-2">
              <input value={l.name} onChange={(e) => updateList(i, { name: e.target.value })} maxLength={80}
                placeholder="Name, e.g. Visiting cards" className="flex-1 rounded-lg border px-3 py-2 text-sm" />
              <button type="button" onClick={() => setRateLists((lists) => lists.filter((_, idx) => idx !== i))}
                className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">Remove</button>
            </div>
            <textarea value={l.message} onChange={(e) => updateList(i, { message: e.target.value })} rows={5} maxLength={3000}
              placeholder={"Hi {name}, thanks for your time on the call!\nVisiting cards: 1000 pcs ₹450 …\nRate list: https://…\n— {agent}, RarePrint, {agentPhone}"}
              className="w-full rounded-lg border px-3 py-2 text-sm" />
          </div>
        ))}
        <button type="button" onClick={() => setRateLists((lists) => [...lists, { id: "", name: "", message: "" }])}
          className="rounded-lg border px-3 py-2 text-sm font-medium">+ Add rate list</button>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="font-semibold text-slate-800">WhatsApp campaign after each call outcome (AiSensy)</h3>
          <p className="text-xs text-slate-500">
            Enter the AiSensy <b>API campaign</b> name to send to the customer after a call with that outcome; leave blank to send nothing.
            Each template must have exactly 3 variables: {"{{1}}"} customer name, {"{{2}}"} agent name, {"{{3}}"} agent phone
            (from the agent&apos;s user profile — agents without a phone number are skipped). The same outcome isn&apos;t sent to one number twice in 24 hours.
          </p>
        </div>
        {CAMPAIGN_OUTCOMES.map((o) => (
          <div key={o.value} className="space-y-2">
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-32 font-medium text-slate-700">{o.label}</span>
              <input value={campaigns[o.value] ?? ""} onChange={(e) => setCampaigns((c) => ({ ...c, [o.value]: e.target.value }))}
                placeholder="e.g. dialer_missed_call_erp" className="min-w-0 flex-1 rounded-lg border px-3 py-2" />
            </label>
            {o.value === "NOT_INTERESTED" && (
              <div className="ml-4 space-y-2 border-l-2 border-red-100 pl-4">
                <p className="text-xs text-slate-500">
                  Optional, by reason — used instead of the Not interested campaign above when that reason is chosen (blank = use the one above).
                </p>
                {NOT_INTERESTED_REASONS.map((r) => (
                  <label key={r.value} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-28 text-slate-700">{r.label}</span>
                    <input value={campaigns[`NI_${r.value}`] ?? ""} onChange={(e) => setCampaigns((c) => ({ ...c, [`NI_${r.value}`]: e.target.value }))}
                      placeholder={`e.g. dialer_ni_${r.value.toLowerCase()}_erp`} className="min-w-0 flex-1 rounded-lg border px-3 py-2" />
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {message && (
        <div className={`rounded-lg border p-2 text-sm ${message.kind === "ok" ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      )}
      <button type="button" onClick={save} disabled={saving}
        className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save dialer settings"}
      </button>
    </section>
  );
}
