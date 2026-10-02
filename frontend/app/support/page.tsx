"use client";
// Public complaint/query form — no login. Customers open it from the link in
// their order status WhatsApp (?t=<signed order token>, see backend
// common/complaint-link.ts); submitting registers a ticket in Complaints.
import React, { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquareWarning, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

type FormData = {
  orderNumber: string;
  customerName: string;
  products: string[];
  categories: { value: string; label: string }[];
  tickets: { ticketNumber: string; subject: string; status: string; createdAt: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Received", ASSIGNED: "Assigned", IN_PROGRESS: "In progress",
  PENDING_CUSTOMER: "Waiting for you", PENDING_VENDOR: "In progress",
  RESOLVED: "Resolved", CLOSED: "Closed",
};

async function readError(res: Response, fallback: string) {
  const e = await res.json().catch(() => ({}));
  return (Array.isArray(e.message) ? e.message.join(", ") : e.message) || fallback;
}

function SupportForm() {
  const token = useSearchParams().get("t") ?? "";
  const [data, setData] = useState<FormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<"COMPLAINT" | "QUERY" | "">("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("This link is invalid. Please use the link from your WhatsApp message."); setLoading(false); return; }
    fetch(`${API_BASE_URL}/complaint-form?t=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await readError(res, "This link is invalid. Please use the link from your WhatsApp message."));
        setData(await res.json());
      })
      .catch((err) => setError(err.message || "Could not open this form."))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!type || !category || description.trim().length < 5 || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/complaint-form?t=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, category, description: description.trim() }),
      });
      if (!res.ok) { setSubmitError(await readError(res, "Could not submit. Please try again.")); return; }
      setTicketNumber((await res.json()).ticketNumber);
    } catch {
      setSubmitError("Could not submit. Check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const choice = (active: boolean) =>
    `flex-1 rounded-lg border px-3 py-2.5 text-sm font-semibold ${active ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 text-slate-600"}`;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-800">
          <MessageSquareWarning size={22} />
          <h1 className="text-lg font-bold">RarePrint — Complaint / Query</h1>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
            <Loader2 size={16} className="animate-spin" /> Loading...
          </div>
        )}

        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        {!loading && !error && data && (ticketNumber ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 flex items-start gap-2">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Thank you. Your request has been registered.</div>
              <div className="mt-1">Ticket number: <span className="font-bold">{ticketNumber}</span></div>
              <div className="text-xs text-green-700 mt-1">Our team will get in touch with you soon.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="text-sm text-slate-600">
              Hi {data.customerName}, tell us about any problem or question with order <span className="font-semibold">#{data.orderNumber}</span>
              {data.products.length > 0 && <> ({data.products.join(", ")})</>}.
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Is this a complaint or a question?</label>
              <div className="mt-1 flex gap-2">
                <button type="button" className={choice(type === "COMPLAINT")} onClick={() => setType("COMPLAINT")}>Complaint</button>
                <button type="button" className={choice(type === "QUERY")} onClick={() => setType("QUERY")}>Query / Question</button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">What is it about?</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white">
                <option value="">Select…</option>
                {data.categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Details</label>
              <textarea rows={4} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the issue or your question" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{submitError}</div>
            )}

            <button onClick={submit} disabled={!type || !category || description.trim().length < 5 || submitting}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold bg-brand-600 text-white rounded-lg px-4 py-2.5 hover:bg-brand-700 disabled:opacity-50">
              {submitting && <Loader2 size={16} className="animate-spin" />}
              Submit
            </button>

            {data.tickets.length > 0 && (
              <div className="border-t border-slate-200 pt-3">
                <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Your earlier requests for this order</div>
                {data.tickets.map((t) => (
                  <div key={t.ticketNumber} className="text-sm text-slate-600 flex justify-between gap-2 py-0.5">
                    <span>{t.ticketNumber}</span>
                    <span className="text-slate-500">{STATUS_LABEL[t.status] ?? t.status}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        ))}
      </div>
    </div>
  );
}

export default function SupportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-500">Loading...</div>}>
      <SupportForm />
    </Suspense>
  );
}
