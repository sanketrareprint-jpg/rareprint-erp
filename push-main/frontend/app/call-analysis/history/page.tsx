"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Eye, Loader2, Trash2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";

type Row = {
  id: string;
  agentName: string;
  customerName: string;
  callType: string;
  duration?: string;
  overallScore: number;
  grade: string;
  sentiment?: string;
  language?: string;
  transcript?: string;
  transcriptSummary?: string;
  strengthsList: string[];
  improvementsList: string[];
  categoryScores: Record<string, number>;
  coachFeedback?: string;
  actionItems: string[];
  hasRealTranscript: boolean;
  createdAt: string;
};

function scoreClass(score: number) {
  if (score >= 80) return "text-emerald-700 bg-emerald-50";
  if (score >= 60) return "text-amber-700 bg-amber-50";
  return "text-red-700 bg-red-50";
}

export default function CallHistoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState("");
  const [grade, setGrade] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const user = getStoredUser();
  const isAdmin = user?.role === "ADMIN";

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (agent) params.set("agentId", agent);
    if (grade) params.set("grade", grade);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await fetch(`${API_BASE_URL}/call-analysis?${params}`, { headers: getAuthHeaders() });
    if (res.ok) setRows(await res.json());
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const agents = useMemo(() => {
    const map = new Map(rows.map((row) => [row.agentName, row.agentName]));
    return [...map.values()].sort();
  }, [rows]);

  const exportCsv = () => {
    const headers = ["Date", "Agent", "Customer", "Call Type", "Score", "Grade", "Duration"];
    const lines = rows.map((row) => [
      new Date(row.createdAt).toLocaleString("en-IN"),
      row.agentName,
      row.customerName,
      row.callType,
      row.overallScore,
      row.grade,
      row.duration ?? "",
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[headers.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "call-analysis-history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this call analysis?")) return;
    const res = await fetch(`${API_BASE_URL}/call-analysis/${id}`, { method: "DELETE", headers: getAuthHeaders() });
    if (res.ok) setRows((prev) => prev.filter((row) => row.id !== id));
  };

  return (
    <DashboardShell>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/call-analysis" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700"><ArrowLeft className="h-3 w-3" /> Call Analysis</Link>
            <h1 className="text-lg font-bold text-slate-900">Call History</h1>
          </div>
          <button onClick={exportCsv} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white"><Download className="h-4 w-4" /> Export CSV</button>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-5 gap-2">
            <select value={agent} onChange={(e) => setAgent(e.target.value)} disabled={!isAdmin} className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
              <option value="">All agents</option>
              {agents.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs" />
            <select value={grade} onChange={(e) => setGrade(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs">
              <option value="">All grades</option>
              {["Excellent", "Good", "Average", "Needs Work"].map((g) => <option key={g}>{g}</option>)}
            </select>
            <button onClick={load} className="inline-flex items-center justify-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white">Apply</button>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-cyan-600" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Agent</th>
                  <th className="px-3 py-2 text-left">Customer</th>
                  <th className="px-3 py-2 text-left">Call Type</th>
                  <th className="px-3 py-2 text-right">Score</th>
                  <th className="px-3 py-2 text-left">Grade</th>
                  <th className="px-3 py-2 text-left">Duration</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 text-xs text-slate-500">{new Date(row.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800">{row.agentName}</td>
                    <td className="px-3 py-2">{row.customerName}</td>
                    <td className="px-3 py-2">{row.callType}</td>
                    <td className="px-3 py-2 text-right"><span className={`rounded-full px-2 py-1 text-xs font-bold ${scoreClass(row.overallScore)}`}>{row.overallScore}</span></td>
                    <td className="px-3 py-2">{row.grade}</td>
                    <td className="px-3 py-2">{row.duration ?? "Unknown"}</td>
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => setSelected(row)} className="mr-2 rounded-lg border border-slate-200 p-1 text-slate-600"><Eye className="h-4 w-4" /></button>
                      {isAdmin && <button onClick={() => remove(row.id)} className="rounded-lg border border-red-200 p-1 text-red-600"><Trash2 className="h-4 w-4" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {selected && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6" onClick={() => setSelected(null)}>
            <div className="max-h-[88vh] w-full max-w-4xl overflow-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">{selected.customerName} - {selected.overallScore}/100</h2>
                <button onClick={() => setSelected(null)} className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-semibold">Close</button>
              </div>
              <p className="mb-4 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-3 text-sm text-slate-700">{selected.coachFeedback}</p>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(selected.categoryScores).map(([name, score]) => (
                  <div key={name}>
                    <div className="mb-1 flex justify-between text-xs font-semibold"><span>{name}</span><span>{score}</span></div>
                    <div className="h-2 rounded bg-slate-100"><div className="h-2 rounded bg-cyan-600" style={{ width: `${score}%` }} /></div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div><b>Strengths</b><ul className="mt-1 list-disc pl-4">{selected.strengthsList.map((x) => <li key={x}>{x}</li>)}</ul></div>
                <div><b>Improvements</b><ul className="mt-1 list-disc pl-4">{selected.improvementsList.map((x) => <li key={x}>{x}</li>)}</ul></div>
                <div><b>Action Items</b><ol className="mt-1 list-decimal pl-4">{selected.actionItems.map((x) => <li key={x}>{x}</li>)}</ol></div>
              </div>
              <div className="mt-4 max-h-52 overflow-auto rounded-lg bg-slate-50 p-3 text-xs leading-5">{selected.transcript}</div>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
