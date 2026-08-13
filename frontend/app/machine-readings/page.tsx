"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Loader2, Gauge, Plus, IndianRupee, AlertTriangle, Trash2, Undo2, RotateCcw } from "lucide-react";

type MachineReadingRow = {
  id: string;
  machineName: string;
  readingDate: string;
  readingValue: number;
  wasReset: boolean;
  notes: string | null;
  isPaid: boolean;
  unitsProduced: number | null;
  paidAmount: number | null;
  paidAt: string | null;
  paidNote: string | null;
  recordedBy: { fullName: string } | null;
  paidBy: { fullName: string } | null;
  diffFromPrevious: number | null;
  amountFromPrevious: number | null;
  suspiciousReset: boolean;
};

type PendingSummary = {
  hasReadings: boolean;
  lastPaidReading: { id: string; readingDate: string; readingValue: number } | null;
  latestReading: { id: string; readingDate: string; readingValue: number; isPaid: boolean } | null;
  unitsProduced: number;
  amountDue: number;
};

type MonthlyRow = {
  monthKey: string;
  label: string;
  unitsProduced: number;
  readingsCount: number;
  estimatedAmount: number;
};

function fmtMoney(n: number) {
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function MachineReadingsPage() {
  const [readings, setReadings] = useState<MachineReadingRow[]>([]);
  const [pending, setPending] = useState<PendingSummary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({ readingDate: todayIso(), readingValue: "", wasReset: false, notes: "" });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const h = getAuthHeaders();
      const [readingsRes, pendingRes, monthlyRes] = await Promise.all([
        fetch(`${API_BASE_URL}/machine-readings`, { headers: h }),
        fetch(`${API_BASE_URL}/machine-readings/pending-summary`, { headers: h }),
        fetch(`${API_BASE_URL}/machine-readings/monthly`, { headers: h }),
      ]);
      if (!readingsRes.ok || !pendingRes.ok || !monthlyRes.ok) { setError("Could not load machine readings"); return; }
      setReadings(await readingsRes.json());
      setPending(await pendingRes.json());
      setMonthly(await monthlyRes.json());
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submitReading = async () => {
    setFormError(null);
    const value = Number(form.readingValue);
    if (!form.readingValue || Number.isNaN(value)) { setFormError("Enter the meter reading"); return; }
    if (value < 0 || value > 1_000_000) { setFormError("Reading must be between 0 and 10,00,000"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/machine-readings`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          readingDate: form.readingDate,
          readingValue: value,
          wasReset: form.wasReset,
          notes: form.notes || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setFormError(body?.message ?? "Could not save reading");
        return;
      }
      setForm({ readingDate: todayIso(), readingValue: "", wasReset: false, notes: "" });
      await load();
    } catch { setFormError("Network error"); }
    finally { setSubmitting(false); }
  };

  const openPayModal = () => {
    if (!pending?.hasReadings) return;
    setPayAmount(pending.amountDue.toFixed(2));
    setPayNote("");
    setPayError(null);
    setPayModalOpen(true);
  };

  const confirmMarkPaid = async () => {
    if (!pending?.latestReading) return;
    setPaySubmitting(true); setPayError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/machine-readings/${pending.latestReading.id}/mark-paid`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          paidAmount: payAmount ? Number(payAmount) : undefined,
          paidNote: payNote || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setPayError(body?.message ?? "Could not mark as paid");
        return;
      }
      setPayModalOpen(false);
      await load();
    } catch { setPayError("Network error"); }
    finally { setPaySubmitting(false); }
  };

  const deleteReading = async (id: string) => {
    if (!confirm("Delete this reading? Only the most recently recorded, unpaid reading can be removed.")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/machine-readings/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.message ?? "Could not delete reading");
        return;
      }
      await load();
    } finally { setDeletingId(null); }
  };

  const undoMarkPaid = async (id: string) => {
    if (!confirm("Undo this payment? Only allowed if no later reading has been marked paid.")) return;
    setUndoingId(id);
    try {
      const res = await fetch(`${API_BASE_URL}/machine-readings/${id}/unmark-paid`, { method: "POST", headers: getAuthHeaders() });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        alert(body?.message ?? "Could not undo payment");
        return;
      }
      await load();
    } finally { setUndoingId(null); }
  };

  if (loading) return (
    <DashboardShell>
      <div className="flex items-center justify-center py-40">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    </DashboardShell>
  );

  return (
    <DashboardShell>
      <div className="p-6 lg:p-8">
        <div className="mx-auto max-w-5xl space-y-5">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-brand-600" /> Machine Readings
            </h1>
            <p className="mt-0.5 text-sm text-slate-600">Envelope Machine — meter readings &amp; operator payments (₹50 per 1000 units).</p>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          {/* ── Pending Payment ── */}
          {pending?.hasReadings && (
            <div className={`rounded-2xl border px-5 py-4 shadow-sm ${pending.unitsProduced > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {pending.lastPaidReading ? `Since ${fmtDate(pending.lastPaidReading.readingDate)} (reading ${pending.lastPaidReading.readingValue.toLocaleString("en-IN")})` : "Since the very first reading"}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">
                    {pending.unitsProduced.toLocaleString("en-IN")} units <span className="text-slate-400 font-normal text-base">produced</span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-600">
                    Latest reading: <strong>{pending.latestReading?.readingValue.toLocaleString("en-IN")}</strong> on {pending.latestReading && fmtDate(pending.latestReading.readingDate)}
                    {pending.latestReading?.isPaid && <span className="ml-2 rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-semibold">Fully settled ✓</span>}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Amount due from operator</p>
                  <p className="text-3xl font-bold text-emerald-700 flex items-center gap-0.5 justify-end"><IndianRupee className="h-6 w-6" />{pending.amountDue.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
                  {!pending.latestReading?.isPaid && pending.unitsProduced > 0 && (
                    <button
                      onClick={openPayModal}
                      className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                    >
                      Mark as Paid
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Record a Reading ── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1.5"><Plus className="h-4 w-4" /> Record a Reading</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Date</label>
                <input type="date" value={form.readingDate} onChange={(e) => setForm({ ...form, readingDate: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Meter Reading</label>
                <input type="number" min={0} max={1000000} value={form.readingValue} onChange={(e) => setForm({ ...form, readingValue: e.target.value })}
                  placeholder="e.g. 876644"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Notes (optional)</label>
                <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Any remark"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600 md:col-span-2">
                <input type="checkbox" checked={form.wasReset} onChange={(e) => setForm({ ...form, wasReset: e.target.checked })} className="h-4 w-4" />
                <span className="flex items-center gap-1"><RotateCcw className="h-3.5 w-3.5" /> Machine was reset since the last reading (counter rolled over at 10,00,000)</span>
              </label>
              <button
                onClick={() => void submitReading()}
                disabled={submitting}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add Reading
              </button>
            </div>
            {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
          </div>

          {/* ── Readings table ── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Date</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Reading</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Diff</th>
                  <th className="px-4 py-2.5 text-right font-semibold text-slate-600">Amount</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Recorded By</th>
                  <th className="px-4 py-2.5 text-left font-semibold text-slate-600">Payment</th>
                  <th className="px-4 py-2.5 text-center font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {readings.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No readings recorded yet.</td></tr>
                ) : readings.map((r, idx) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 whitespace-nowrap text-slate-700">
                      {fmtDate(r.readingDate)}
                      {r.wasReset && <span title="Machine was reset before this reading" className="ml-1.5 rounded-full bg-orange-100 text-orange-700 px-1.5 py-0.5 text-[10px] font-semibold"><RotateCcw className="h-2.5 w-2.5 inline" /> reset</span>}
                      {r.notes && <p className="text-xs text-slate-400 mt-0.5">{r.notes}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-slate-800">{r.readingValue.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-2.5 text-right">
                      {r.diffFromPrevious != null ? (
                        <span className="flex items-center justify-end gap-1">
                          {r.diffFromPrevious.toLocaleString("en-IN")}
                          {r.suspiciousReset && (
                            <span title="Reading dropped from the previous one but 'machine was reset' wasn't ticked — double check this row." className="text-red-500">
                              <AlertTriangle className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{r.amountFromPrevious != null ? fmtMoney(r.amountFromPrevious) : <span className="text-slate-300">—</span>}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.recordedBy?.fullName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {r.isPaid ? (
                        <div>
                          <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-xs font-semibold">
                            Paid {r.paidAmount != null ? fmtMoney(r.paidAmount) : ""}
                          </span>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {r.paidAt && fmtDate(r.paidAt)}{r.paidBy?.fullName ? ` · ${r.paidBy.fullName}` : ""}
                          </p>
                          {r.paidNote && <p className="text-xs text-slate-500 mt-0.5" title="Description / bill number">📝 {r.paidNote}</p>}
                        </div>
                      ) : <span className="text-slate-300 text-xs">Unpaid</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {r.isPaid && idx === 0 && (
                          <button onClick={() => void undoMarkPaid(r.id)} disabled={undoingId === r.id} title="Undo this payment"
                            className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                            {undoingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {!r.isPaid && idx === 0 && (
                          <button onClick={() => void deleteReading(r.id)} disabled={deletingId === r.id} title="Delete this reading"
                            className="rounded border border-red-200 p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-50">
                            {deletingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Monthly production ── */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <p className="text-sm font-semibold text-slate-700 mb-3">Monthly Production</p>
            {monthly.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Not enough readings yet to compute a monthly total.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100">
                      <th className="text-left font-medium py-1.5 pr-2">Month</th>
                      <th className="text-right font-medium py-1.5 px-2">Units Produced</th>
                      <th className="text-right font-medium py-1.5 px-2">Readings</th>
                      <th className="text-right font-medium py-1.5 pl-2">Est. Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((m) => (
                      <tr key={m.monthKey} className="border-b border-slate-50 last:border-0">
                        <td className="py-1.5 pr-2 font-medium text-slate-800">{m.label}</td>
                        <td className="py-1.5 px-2 text-right text-slate-700">{m.unitsProduced.toLocaleString("en-IN")}</td>
                        <td className="py-1.5 px-2 text-right text-slate-500">{m.readingsCount}</td>
                        <td className="py-1.5 pl-2 text-right font-semibold text-emerald-700">{fmtMoney(m.estimatedAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-400">Estimate only — actual payments are settled above via "Mark as Paid," independent of calendar months.</p>
          </div>
        </div>
      </div>

      {/* ── Mark as Paid modal ── */}
      {payModalOpen && pending?.latestReading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={() => !paySubmitting && setPayModalOpen(false)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-base font-bold text-slate-900">Mark as Paid</p>
            <p className="text-sm text-slate-500 mt-1">
              {pending.unitsProduced.toLocaleString("en-IN")} units since {pending.lastPaidReading ? `reading ${pending.lastPaidReading.readingValue.toLocaleString("en-IN")}` : "the first reading"}, up to <strong>{pending.latestReading.readingValue.toLocaleString("en-IN")}</strong>.
            </p>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-500 mb-1">Amount Received (₹)</label>
              <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
              <p className="text-xs text-slate-400 mt-1">Defaults to {pending.unitsProduced.toLocaleString("en-IN")} units ÷ 1000 × ₹50 — edit if the actual amount received differs.</p>
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-500 mb-1">Payment Description / Bill Number</label>
              <textarea value={payNote} onChange={(e) => setPayNote(e.target.value)} rows={2}
                placeholder="e.g. Cash received, bill #1234, UPI ref…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400 resize-none" />
            </div>
            {payError && <p className="mt-2 text-xs text-red-600">{payError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPayModalOpen(false)} disabled={paySubmitting} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => void confirmMarkPaid()} disabled={paySubmitting} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                {paySubmitting && <Loader2 className="h-4 w-4 animate-spin" />} Confirm Paid
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
