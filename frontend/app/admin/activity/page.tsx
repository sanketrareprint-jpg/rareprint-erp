"use client";

import { useEffect, useState, useMemo } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Activity, ChevronDown, ChevronRight, RefreshCw, Loader2,
  Clock, Users, Hash, Star, Calendar,
} from "lucide-react";

type Session = {
  id: string;
  page: string;
  startedAt: string;
  lastPingAt: string;
  activeSeconds: number;
};

type UserStat = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  totalActiveSeconds: number;
  sessionCount: number;
  lastSeen: string | null;
  sessions: Session[];
};

type ReportData = {
  totalLogEntries: number;
  users: UserStat[];
};

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDateTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function RoleBadge({ role }: { role: string }) {
  const colors: Record<string, string> = {
    ADMIN: "bg-purple-100 text-purple-700",
    AGENT: "bg-blue-100 text-blue-700",
    SALES_AGENT: "bg-green-100 text-green-700",
    ACCOUNTS: "bg-yellow-100 text-yellow-700",
    PRODUCTION: "bg-orange-100 text-orange-700",
    DISPATCH: "bg-gray-100 text-gray-700",
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${colors[role] ?? "bg-slate-100 text-slate-600"}`}>
      {role.replace("_", " ")}
    </span>
  );
}

export default function ActivityReportPage() {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`${API_BASE_URL}/activity/report?${params}`, { headers: getAuthHeaders() });
      if (!res.ok) { setError("Could not load report"); return; }
      const json = await res.json() as ReportData;
      setData(json);

      // Auto-expand Prajakta Dalal
      const prajakta = json.users.find(u =>
        u.fullName.toUpperCase().includes("PRAJAKTA")
      );
      if (prajakta) {
        setExpandedUsers(prev => new Set([...prev, prajakta.userId]));
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function toggleUser(userId: string) {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const topUser = useMemo(() => data?.users[0] ?? null, [data]);

  return (
    <DashboardShell>
      <div className="px-6 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Activity size={22} className="text-indigo-600" />
              User Activity Report
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Active time counted only when cursor is moving. Idle / screen-stable time is excluded.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh
          </button>
        </div>

        {/* Filters */}
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">From Date</label>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">To Date</label>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <button onClick={load} disabled={loading}
              className="rounded-lg bg-slate-800 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">
              Apply
            </button>
          </div>
        </section>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Summary cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Hash size={15} /> <span className="text-xs font-semibold uppercase tracking-wide">Total Log Entries</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{data.totalLogEntries.toLocaleString()}</div>
              <div className="text-xs text-slate-400 mt-0.5">activity sessions recorded</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Users size={15} /> <span className="text-xs font-semibold uppercase tracking-wide">Active Users</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{data.users.length}</div>
              <div className="text-xs text-slate-400 mt-0.5">users tracked</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Clock size={15} /> <span className="text-xs font-semibold uppercase tracking-wide">Total Active Time</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">
                {fmtDuration(data.users.reduce((s, u) => s + u.totalActiveSeconds, 0))}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">across all users</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-slate-500 mb-1">
                <Star size={15} /> <span className="text-xs font-semibold uppercase tracking-wide">Most Active</span>
              </div>
              <div className="text-sm font-bold text-slate-900 truncate">{topUser?.fullName ?? "-"}</div>
              <div className="text-xs text-slate-400 mt-0.5">{topUser ? fmtDuration(topUser.totalActiveSeconds) : "-"}</div>
            </div>
          </div>
        )}

        {/* User rows */}
        {data && data.users.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">
            No activity data yet. Data appears once users start interacting with the ERP.
          </div>
        )}

        {data && data.users.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[32px_2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div />
              <div>User</div>
              <div>Role</div>
              <div>Active Time</div>
              <div>Sessions</div>
              <div>Last Seen</div>
            </div>

            {data.users.map((u, idx) => {
              const isPrajakta = u.fullName.toUpperCase().includes("PRAJAKTA");
              const isExpanded = expandedUsers.has(u.userId);
              const rowBg = isPrajakta
                ? "bg-amber-50 border-amber-200"
                : idx % 2 === 0 ? "bg-white" : "bg-slate-50/40";

              return (
                <div key={u.userId}>
                  {/* User summary row */}
                  <div
                    className={`grid grid-cols-[32px_2fr_1fr_1fr_1fr_1fr] gap-2 px-4 py-3 border-b border-slate-100 cursor-pointer hover:bg-indigo-50/50 transition-colors items-center ${rowBg}`}
                    onClick={() => toggleUser(u.userId)}
                  >
                    {/* Expand toggle */}
                    <div className="flex items-center justify-center text-slate-400">
                      {isExpanded
                        ? <ChevronDown size={16} className="text-indigo-500" />
                        : <ChevronRight size={16} />}
                    </div>

                    {/* Name */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center flex-shrink-0">
                          {u.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5 truncate">
                            {u.fullName}
                            {isPrajakta && (
                              <span className="text-[9px] font-bold bg-amber-400 text-amber-900 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                ★ SPECIAL
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 truncate">{u.email}</div>
                        </div>
                      </div>
                    </div>

                    {/* Role */}
                    <div><RoleBadge role={u.role} /></div>

                    {/* Active time */}
                    <div>
                      <div className="text-sm font-bold text-indigo-700">{fmtDuration(u.totalActiveSeconds)}</div>
                      <div className="text-xs text-slate-400">active</div>
                    </div>

                    {/* Sessions */}
                    <div>
                      <div className="text-sm font-semibold text-slate-900">{u.sessionCount}</div>
                      <div className="text-xs text-slate-400">sessions</div>
                    </div>

                    {/* Last seen */}
                    <div className="text-xs text-slate-500">
                      {u.lastSeen ? fmtDateTime(u.lastSeen) : "-"}
                    </div>
                  </div>

                  {/* Expanded session log */}
                  {isExpanded && (
                    <div className={`border-b border-slate-200 ${isPrajakta ? "bg-amber-50/60" : "bg-slate-50"}`}>
                      {/* Prajakta special header */}
                      {isPrajakta && (
                        <div className="px-6 pt-3 pb-1">
                          <div className="inline-flex items-center gap-2 bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-lg">
                            <Star size={13} className="text-amber-500" />
                            Prajakta Dalal — Detailed Session Log
                            <span className="text-amber-600 font-normal">({u.sessionCount} sessions · {fmtDuration(u.totalActiveSeconds)} total)</span>
                          </div>
                        </div>
                      )}

                      <div className="px-6 py-3 space-y-1">
                        {/* Session table header */}
                        <div className="grid grid-cols-[1.5fr_1fr_1fr_80px] gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 px-2 pb-1 border-b border-slate-200">
                          <div>Page</div>
                          <div>Started</div>
                          <div>Last Active</div>
                          <div>Duration</div>
                        </div>

                        {u.sessions.map(s => (
                          <div
                            key={s.id}
                            className="grid grid-cols-[1.5fr_1fr_1fr_80px] gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-white/70 transition-colors"
                          >
                            <div className="font-mono text-slate-700 truncate" title={s.page}>
                              {s.page || "/"}
                            </div>
                            <div className="text-slate-500">{fmtDateTime(s.startedAt)}</div>
                            <div className="text-slate-500">{fmtDateTime(s.lastPingAt)}</div>
                            <div className="font-semibold text-indigo-600">{fmtDuration(s.activeSeconds)}</div>
                          </div>
                        ))}

                        {u.sessions.length === 0 && (
                          <div className="text-xs text-slate-400 py-2 px-2">No sessions recorded.</div>
                        )}
                      </div>

                      {/* Prajakta: per-page breakdown */}
                      {isPrajakta && u.sessions.length > 0 && (
                        <div className="px-6 pb-4">
                          <div className="text-[10px] font-bold uppercase tracking-wide text-amber-700 mb-2 flex items-center gap-1">
                            <Calendar size={11} /> Time Per Page
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(
                              u.sessions.reduce<Record<string, number>>((acc, s) => {
                                const key = s.page || "/";
                                acc[key] = (acc[key] ?? 0) + s.activeSeconds;
                                return acc;
                              }, {})
                            )
                              .sort((a, b) => b[1] - a[1])
                              .map(([page, secs]) => (
                                <div key={page} className="bg-amber-100 border border-amber-200 text-amber-900 text-[11px] px-2.5 py-1 rounded-lg font-medium">
                                  <span className="font-mono">{page}</span>
                                  <span className="ml-1.5 text-amber-700 font-bold">{fmtDuration(secs)}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-indigo-500" />
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
