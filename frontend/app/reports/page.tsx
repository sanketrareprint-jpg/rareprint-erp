"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import { Download, FileSpreadsheet, Loader2, RefreshCw } from "lucide-react";

type ReportType = "orders" | "vendors" | "stages";
type ReportRow = Record<string, string | number | null>;

const REPORTS: Array<{ key: ReportType; label: string; description: string }> = [
  { key: "orders", label: "Order Report", description: "Customer, products, sales value, payment, and status summary" },
  { key: "vendors", label: "Vendor Report", description: "Vendor job work, purchase bills, and payment totals" },
  { key: "stages", label: "Stage Report", description: "Production item stage and status movement snapshot" },
];

export default function ReportsPage() {
  const [type, setType] = useState<ReportType>("orders");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const columns = useMemo(() => rows[0] ? Object.keys(rows[0]) : [], [rows]);

  async function load() {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ type });
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`${API_BASE_URL}/reports?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) { setError("Could not load report"); return; }
      const data = await res.json();
      setRows(data.rows ?? []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function downloadCsv() {
    const params = new URLSearchParams({ type });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`${API_BASE_URL}/reports/download?${params.toString()}`, { headers: getAuthHeaders() });
    if (!res.ok) { setError("Could not download CSV"); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => { void load(); }, [type]);

  return (
    <DashboardShell>
      <div className="px-6 py-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2"><FileSpreadsheet size={22} className="text-indigo-600" /> Reports</h1>
            <p className="text-sm text-slate-500 mt-1">Generate order, vendor, and production stage reports for review or Excel work.</p>
          </div>
          <button onClick={downloadCsv} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700">
            <Download size={16} /> CSV
          </button>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 md:grid-cols-[1.3fr_180px_180px_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Report Type</label>
              <select value={type} onChange={e => setType(e.target.value as ReportType)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                {REPORTS.map(report => <option key={report.key} value={report.key}>{report.label}</option>)}
              </select>
              <p className="text-xs text-slate-400 mt-1">{REPORTS.find(report => report.key === type)?.description}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">From</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">To</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              Load
            </button>
          </div>
        </section>

        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <section className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">{rows.length} rows</h2>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>{columns.map(column => <th key={column} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{column}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={index} className="border-t border-slate-100">
                    {columns.map(column => <td key={column} className="px-3 py-2 text-slate-700 whitespace-nowrap">{row[column] ?? ""}</td>)}
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td className="px-4 py-10 text-center text-sm text-slate-400" colSpan={Math.max(columns.length, 1)}>No report rows found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
