"use client";
// Per-agent calling summary — calls made, reply outcomes, new leads, pipeline
// and follow-ups due. Shown on the Dashboard, CRM and Auto Dialer pages.
// Backend: GET /dialer/agent-stats (admins see every agent, others themselves).
import { useEffect, useState } from "react";
import { PhoneCall, Loader2 } from "lucide-react";
import { MobileSelect } from "@/components/MobileSelect";
import { apiFetch } from "@/lib/apiFetch";
import { getStoredUser } from "@/lib/auth";

type Period = "today" | "7d" | "month";

interface AgentStatsRow {
  agentId: string;
  agentName: string;
  callsMade: number;
  interested: number;
  callback: number;
  notAnswered: number;
  busy: number;
  wrongNumber: number;
  notInterested: number;
  answeredOther: number;
  newLeads: number;
  pipeline: number;
  followUpsDue: number;
}
interface AgentStatsResponse {
  period: Period;
  since: string;
  agents: AgentStatsRow[];
  totals: Omit<AgentStatsRow, "agentId" | "agentName">;
}

const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "month", label: "This month" },
];

const COLUMNS: Array<{ key: keyof AgentStatsResponse["totals"]; label: string; title: string; className: string }> = [
  { key: "callsMade", label: "Calls", title: "Calls made in the period (auto dialer + CRM)", className: "text-slate-900 font-bold" },
  { key: "interested", label: "Interested", title: "Auto dialer: Interested", className: "text-green-700" },
  { key: "callback", label: "Callback", title: "Auto dialer: Callback", className: "text-blue-700" },
  { key: "notInterested", label: "Not int.", title: "Auto dialer: Not interested", className: "text-red-600" },
  { key: "busy", label: "Busy", title: "Busy (auto dialer + CRM)", className: "text-amber-600" },
  { key: "notAnswered", label: "No ans.", title: "Not answered (auto dialer + CRM)", className: "text-slate-600" },
  { key: "wrongNumber", label: "Wrong no.", title: "Auto dialer: Wrong number", className: "text-red-800" },
  { key: "answeredOther", label: "Answered", title: "CRM calls logged as Answered (no reply category)", className: "text-slate-600" },
  { key: "newLeads", label: "New leads", title: "Leads in NEW status right now", className: "text-indigo-700 font-semibold" },
  { key: "pipeline", label: "Pipeline", title: "Contacted / Interested / Quoted right now", className: "text-blue-700 font-semibold" },
  { key: "followUpsDue", label: "Follow-ups", title: "Customers with a follow-up due by end of today", className: "text-red-600 font-semibold" },
];

export function AgentCallStats({ className = "" }: { className?: string }) {
  const [allowed, setAllowed] = useState(false);
  const [period, setPeriod] = useState<Period>("today");
  const [data, setData] = useState<AgentStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Read the role after mount (localStorage isn't available during SSR).
  useEffect(() => {
    const role = getStoredUser()?.role;
    setAllowed(role === "ADMIN" || role === "SALES_AGENT");
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    apiFetch<AgentStatsResponse>(`/dialer/agent-stats?period=${period}`, {}, (msg) => { if (!cancelled) setError(msg); })
      .then((res) => { if (!cancelled && res) setData(res); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [allowed, period]);

  if (!allowed) return null;

  return (
    <div className={`bg-white rounded-lg border border-slate-200 px-3 py-1.5 shadow-sm ${className}`}>
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <PhoneCall className="h-3 w-3 text-emerald-500" />
        <p className="text-xs font-semibold text-slate-700">Calls &amp; Leads — by Agent</p>
        <MobileSelect
          value={period}
          onChange={(v) => setPeriod(v as Period)}
          className="text-slate-600 bg-white border border-slate-200 rounded outline-none"
          style={{ fontSize: "10px", padding: "1px 3px" }}
          options={PERIOD_OPTIONS}
        />
        {loading && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
        {data && <span className="text-xs text-slate-400 ml-auto">{data.totals.callsMade.toLocaleString("en-IN")} calls</span>}
      </div>

      {error && <p className="text-xs text-red-600 py-1 break-words">Could not load call stats: {error}</p>}

      {data && data.agents.length === 0 && !error && (
        <p className="text-xs text-slate-400 text-center py-3">No agents to show</p>
      )}

      {data && data.agents.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs tabular-nums">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100">
                <th className="text-left font-medium py-1 pr-2 whitespace-nowrap">Agent</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} title={c.title} className="text-right font-medium py-1 px-1.5 whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.agents.map((a) => (
                <tr key={a.agentId} className="border-b border-slate-50 last:border-0">
                  <td className="text-left py-0.5 pr-2 text-slate-700 font-medium whitespace-nowrap">{a.agentName || "—"}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className={`text-right py-0.5 px-1.5 ${a[c.key] ? c.className : "text-slate-300"}`}>{a[c.key]}</td>
                  ))}
                </tr>
              ))}
              {data.agents.length > 1 && (
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td className="text-left py-0.5 pr-2 text-slate-700 font-semibold">Total</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="text-right py-0.5 px-1.5 font-semibold text-slate-800">{data.totals[c.key]}</td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
