"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { clearAuth, getStoredUser } from "@/lib/auth";
import {
  AlertTriangle, Clock, LayoutGrid, List, Loader2, Plus, Search, User,
} from "lucide-react";
import {
  CATEGORY_LABELS, ComplaintListItem, ComplaintPriority, ComplaintStatus,
  KANBAN_COLUMNS, PRIORITY_COLORS, PRIORITY_LABELS, STATUS_COLORS, STATUS_LABELS,
  complaintsApiFetch, fmtDate, isOverdue,
} from "./shared";

type ViewMode = "board" | "table";
type Stats = { openCount: number; overdueCount: number; avgResolutionHours: number; byCategory: { category: string; count: number }[] };

export default function ComplaintsPage() {
  const router = useRouter();
  const [currentUser] = useState(() => getStoredUser());
  const [complaints, setComplaints] = useState<ComplaintListItem[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("board");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<ComplaintPriority | "ALL">("ALL");
  const [statusFilter, setStatusFilter] = useState<ComplaintStatus | "ALL">("ALL");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      if (priorityFilter !== "ALL") params.set("priority", priorityFilter);
      if (overdueOnly) params.set("overdue", "true");
      const [listRes, statsRes] = await Promise.all([
        complaintsApiFetch(`/complaints?${params}`),
        complaintsApiFetch(`/complaints/stats`),
      ]);
      if (listRes.status === 401 || statsRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      setComplaints(listRes.ok ? await listRes.json() : []);
      setStats(statsRes.ok ? await statsRes.json() : null);
    } finally {
      setLoading(false);
    }
  }, [overdueOnly, priorityFilter, router, statusFilter]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return complaints;
    return complaints.filter((c) =>
      c.ticketNumber.toLowerCase().includes(term) ||
      c.subject.toLowerCase().includes(term) ||
      c.customer.businessName.toLowerCase().includes(term) ||
      (c.order?.orderNumber ?? "").toLowerCase().includes(term),
    );
  }, [complaints, search]);

  const byColumn = useMemo(() => {
    const map = new Map<ComplaintStatus, ComplaintListItem[]>();
    for (const col of KANBAN_COLUMNS) map.set(col.key, []);
    for (const c of visible) {
      if (map.has(c.status)) map.get(c.status)!.push(c);
    }
    return map;
  }, [visible]);

  return (
    <DashboardShell>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6">
        <div className="flex flex-none flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Complaints</h1>
            <p className="text-sm text-slate-500">Track customer complaints from first report through resolution, with SLA deadlines.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="font-bold text-slate-900">{stats?.openCount ?? "—"}</p><p className="text-slate-500">Open</p></div>
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2"><p className="font-bold text-red-700">{stats?.overdueCount ?? "—"}</p><p className="text-red-600">Overdue</p></div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="font-bold text-slate-900">{stats ? `${stats.avgResolutionHours}h` : "—"}</p><p className="text-slate-500">Avg Resolve</p></div>
            </div>
            <Link href="/complaints/new" className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              <Plus className="h-4 w-4" /> New Ticket
            </Link>
          </div>
        </div>

        <div className="flex flex-none flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ticket #, subject, customer, order..."
              className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as ComplaintPriority | "ALL")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none">
            <option value="ALL">All Priorities</option>
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {view === "table" && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ComplaintStatus | "ALL")} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none">
              <option value="ALL">All Statuses</option>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          )}
          <button
            onClick={() => setOverdueOnly((v) => !v)}
            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold ${overdueOnly ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 text-slate-600"}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" /> Overdue only
          </button>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button onClick={() => setView("board")} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${view === "board" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
              <LayoutGrid className="h-3.5 w-3.5" /> Board
            </button>
            <button onClick={() => setView("table")} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold ${view === "table" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}>
              <List className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white py-20"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
        ) : view === "board" ? (
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-x-auto pb-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {KANBAN_COLUMNS.map((col) => (
              <div key={col.key} className="flex min-h-0 min-w-[240px] flex-col rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex flex-none items-center justify-between border-b border-slate-200 px-3 py-2">
                  <p className="text-xs font-bold text-slate-700">{col.label}</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500">{byColumn.get(col.key)?.length ?? 0}</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {(byColumn.get(col.key) ?? []).map((c) => (
                    <TicketCard key={c.id} ticket={c} />
                  ))}
                  {(byColumn.get(col.key) ?? []).length === 0 && (
                    <p className="px-2 py-6 text-center text-xs text-slate-400">No tickets</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Ticket #</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Assigned To</th>
                  <th className="px-3 py-2">SLA Due</th>
                  <th className="px-3 py-2">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((c) => (
                  <tr key={c.id} onClick={() => router.push(`/complaints/${c.id}`)} className="cursor-pointer hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{c.ticketNumber}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{c.customer.businessName}</p>
                      {c.customer.phone && <p className="text-xs text-slate-400">{c.customer.phone}</p>}
                    </td>
                    <td className="px-3 py-2 max-w-[240px] truncate">{c.subject}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{CATEGORY_LABELS[c.category]}</td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[c.priority]}`}>{PRIORITY_LABELS[c.priority]}</span></td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[c.status]}`}>{STATUS_LABELS[c.status]}</span>
                      {isOverdue(c) && <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">Overdue</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{c.assignedTo?.fullName ?? "Unassigned"}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(c.slaResolutionDueAt)}</td>
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
                {visible.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-400">No tickets found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function TicketCard({ ticket }: { ticket: ComplaintListItem }) {
  const overdue = isOverdue(ticket);
  return (
    <Link
      href={`/complaints/${ticket.id}`}
      className={`block rounded-lg border bg-white p-3 shadow-sm transition hover:shadow-md ${overdue ? "border-red-300" : "border-slate-200"}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-500">{ticket.ticketNumber}</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PRIORITY_COLORS[ticket.priority]}`}>{PRIORITY_LABELS[ticket.priority]}</span>
      </div>
      <p className="mb-1.5 line-clamp-2 text-sm font-semibold text-slate-900">{ticket.subject}</p>
      <p className="mb-2 truncate text-xs text-slate-500">{ticket.customer.businessName}</p>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span className="inline-flex items-center gap-1">
          <User className="h-3 w-3" /> {ticket.assignedTo?.fullName ?? "Unassigned"}
        </span>
        {overdue ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-1.5 py-0.5 font-semibold text-red-700">
            <AlertTriangle className="h-3 w-3" /> Overdue
          </span>
        ) : ticket.slaResolutionDueAt ? (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" /> {new Date(ticket.slaResolutionDueAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
