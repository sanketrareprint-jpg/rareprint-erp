"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders, getStoredUser } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, AlertCircle, PhoneOff, ArrowLeft, Search, Download } from "lucide-react";

type NotContactedLead = {
  id: string;
  name: string | null;
  phone: string;
  tagRaw: string | null;
  lastActiveAt: string | null;
  createdOnAt: string | null;
  agentId: string;
  agentName: string | null;
};

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function NotContactedLeadsPage() {
  const router = useRouter();
  const [currentUser] = useState(() => getStoredUser());
  const [leads, setLeads] = useState<NotContactedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState<string>(""); // "" = all time
  const [availableMonths, setAvailableMonths] = useState<{ month: string; label: string }[]>([]);

  const load = useCallback(async (m: string) => {
    setLoading(true); setError(null);
    try {
      const h = getAuthHeaders();
      const qs = m ? `?month=${m}` : "";
      const res = await fetch(`${API_BASE_URL}/call-compliance/not-contacted${qs}`, { headers: h });
      if (res.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!res.ok) { setError("Could not load not-contacted leads"); return; }
      setLeads(await res.json());
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { void load(month); }, [month, load]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/call-compliance/months`, { headers: getAuthHeaders() });
        if (res.ok) setAvailableMonths(await res.json());
      } catch { /* ignore */ }
    })();
  }, []);

  const agents = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of leads) if (l.agentName) map.set(l.agentId, l.agentName);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [leads]);

  const filtered = leads.filter((l) => {
    if (agentFilter !== "ALL" && l.agentId !== agentFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!(l.name?.toLowerCase().includes(q) || l.phone.includes(q) || l.tagRaw?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  function exportCsv() {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ["Name", "Phone"],
      ...filtered.map((l) => [l.name || "", l.phone]),
    ];
    const csv = rows.map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `not-contacted-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return (
    <DashboardShell><div className="flex items-center justify-center py-40"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div></DashboardShell>
  );

  return (
    <DashboardShell>
      <div className="p-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Link href="/crm" className="text-slate-400 hover:text-slate-600"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
              <PhoneOff className="h-4 w-4 text-red-500" />Not-Contacted Leads
            </h1>
            <p className="text-xs text-slate-400">
              {currentUser?.role === "ADMIN" ? "AiSensy-tagged contacts across all agents that were never called" : "Your AiSensy-tagged contacts that you haven't called yet"}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">{filtered.length} of {leads.length}</span>
            <button
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              title="Export Name + Phone as CSV"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" /><span>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, tag…"
              className="w-full border border-slate-200 rounded-md pl-7 pr-2 py-1.5 text-xs"
            />
          </div>
          {agents.length > 1 && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1.5 text-xs"
            >
              <option value="ALL">All agents</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
          {availableMonths.length > 0 && (
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="border border-slate-200 rounded-md px-2 py-1.5 text-xs"
              title="Tagged in this month (createdOnAt), checked against the agent's full call history"
            >
              <option value="">All time</option>
              {availableMonths.map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}
            </select>
          )}
        </div>

        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="text-left px-3 py-1.5 font-medium">Name</th>
                <th className="text-left px-3 py-1.5 font-medium">Phone</th>
                {agents.length > 1 && <th className="text-left px-3 py-1.5 font-medium">Agent</th>}
                <th className="text-left px-3 py-1.5 font-medium">Tag</th>
                <th className="text-left px-3 py-1.5 font-medium">Last Active</th>
                <th className="text-left px-3 py-1.5 font-medium">Tagged On</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8">
                  {leads.length === 0 ? "Nothing to show — either no data has been imported yet, or everyone's been contacted 🎉" : "No matches for this filter"}
                </td></tr>
              )}
              {filtered.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-1.5 font-medium text-slate-800 truncate max-w-[180px]">{l.name || "—"}</td>
                  <td className="px-3 py-1.5 font-mono text-slate-600">{l.phone}</td>
                  {agents.length > 1 && <td className="px-3 py-1.5 text-slate-600">{l.agentName}</td>}
                  <td className="px-3 py-1.5 text-slate-500">{l.tagRaw || "—"}</td>
                  <td className="px-3 py-1.5 text-slate-500">{fmtDate(l.lastActiveAt)}</td>
                  <td className="px-3 py-1.5 text-slate-500">{fmtDate(l.createdOnAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardShell>
  );
}
