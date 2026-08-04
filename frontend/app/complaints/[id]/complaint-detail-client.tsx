"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders, getStoredUser } from "@/lib/auth";
import {
  AlertTriangle, ArrowLeft, Loader2, Paperclip, Save, Send, Star, Upload, UserPlus,
} from "lucide-react";
import {
  CATEGORY_LABELS, CHANNEL_LABELS, ComplaintCommentVisibility, ComplaintDetail, ComplaintResolutionType,
  ComplaintStatus, PRIORITY_COLORS, PRIORITY_LABELS, RESOLUTION_LABELS, STATUS_COLORS, STATUS_LABELS,
  STATUS_TRANSITIONS, UserOption, complaintsApiFetch, fmtDate, isOverdue,
} from "../shared";

export default function ComplaintDetailClient() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [currentUser] = useState(() => getStoredUser());
  const [ticket, setTicket] = useState<ComplaintDetail | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assigneeId, setAssigneeId] = useState("");
  const [assignedTeam, setAssignedTeam] = useState("");
  const [nextStatus, setNextStatus] = useState<ComplaintStatus | "">("");
  const [statusReason, setStatusReason] = useState("");
  const [resolutionType, setResolutionType] = useState<ComplaintResolutionType>("REPRINT");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [csatRating, setCsatRating] = useState(0);
  const [csatFeedback, setCsatFeedback] = useState("");

  const [commentMessage, setCommentMessage] = useState("");
  const [commentVisibility, setCommentVisibility] = useState<ComplaintCommentVisibility>("INTERNAL");
  const [commentSaving, setCommentSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u.fullName])), [users]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ticketRes, usersRes] = await Promise.all([
        complaintsApiFetch(`/complaints/${params.id}`),
        complaintsApiFetch(`/complaints/users`),
      ]);
      if (ticketRes.status === 401) { clearAuth(); router.replace("/login"); return; }
      if (!ticketRes.ok) { setError("Ticket not found"); return; }
      const data: ComplaintDetail = await ticketRes.json();
      setTicket(data);
      setAssigneeId(data.assignedToId ?? "");
      setAssignedTeam(data.assignedTeam ?? "");
      setUsers(usersRes.ok ? await usersRes.json() : []);
    } finally {
      setLoading(false);
    }
  }, [params.id, router]);

  useEffect(() => { void load(); }, [load]);

  async function handleAssign() {
    if (!assigneeId && !assignedTeam.trim()) { setError("Pick a user or team"); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await complaintsApiFetch(`/complaints/${params.id}/assign`, {
        method: "PATCH",
        body: JSON.stringify({ assignedToId: assigneeId || undefined, assignedTeam: assignedTeam.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.message || "Could not assign"); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleStatusChange() {
    if (!nextStatus) return;
    setBusy(true);
    setError(null);
    try {
      const res = await complaintsApiFetch(`/complaints/${params.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ toStatus: nextStatus, reason: statusReason.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.message || "Could not update status"); return; }
      setStatusReason("");
      setNextStatus("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleResolve() {
    setBusy(true);
    setError(null);
    try {
      const res = await complaintsApiFetch(`/complaints/${params.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify({ resolutionType, resolutionNotes: resolutionNotes.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.message || "Could not resolve ticket"); return; }
      setResolutionNotes("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleReopen() {
    setBusy(true);
    setError(null);
    try {
      const res = await complaintsApiFetch(`/complaints/${params.id}/reopen`, {
        method: "POST",
        body: JSON.stringify({ reason: reopenReason.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.message || "Could not reopen ticket"); return; }
      setReopenReason("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleCsat() {
    if (csatRating < 1) { setError("Pick a rating"); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await complaintsApiFetch(`/complaints/${params.id}/csat`, {
        method: "POST",
        body: JSON.stringify({ rating: csatRating, feedback: csatFeedback.trim() || undefined }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.message || "Could not save feedback"); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function handleAddComment() {
    if (!commentMessage.trim()) return;
    setCommentSaving(true);
    setError(null);
    try {
      const res = await complaintsApiFetch(`/complaints/${params.id}/comments`, {
        method: "POST",
        body: JSON.stringify({
          authorName: currentUser?.fullName ?? "Staff",
          visibility: commentVisibility,
          message: commentMessage.trim(),
        }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); setError(b.message || "Could not add comment"); return; }
      setCommentMessage("");
      await load();
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const authHeaders = getAuthHeaders();
      const headers: Record<string, string> = {};
      if (authHeaders.Authorization) headers.Authorization = authHeaders.Authorization;
      const res = await fetch(`${API_BASE_URL}/complaints/${params.id}/attachments/upload`, {
        method: "POST",
        headers,
        body: formData,
      });
      if (!res.ok) { setError("Could not upload attachment"); return; }
      await load();
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <DashboardShell>
        <div className="flex h-full items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></div>
      </DashboardShell>
    );
  }

  if (!ticket) {
    return (
      <DashboardShell>
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
          <p>{error ?? "Ticket not found"}</p>
          <Link href="/complaints" className="text-sm font-semibold text-blue-600 hover:underline">Back to Complaints</Link>
        </div>
      </DashboardShell>
    );
  }

  const overdue = isOverdue(ticket);
  const legalNextStatuses = STATUS_TRANSITIONS[ticket.status].filter((s) => s !== "RESOLVED" && s !== "REOPENED");
  const canAssign = ticket.status === "OPEN" || ticket.status === "REOPENED" || ["ASSIGNED", "IN_PROGRESS", "PENDING_CUSTOMER", "PENDING_VENDOR"].includes(ticket.status);
  const canResolve = STATUS_TRANSITIONS[ticket.status].includes("RESOLVED");
  const canReopen = ticket.status === "CLOSED";
  const canCsat = (ticket.status === "RESOLVED" || ticket.status === "CLOSED") && ticket.csatRating == null;

  return (
    <DashboardShell>
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6">
        <div className="flex flex-none items-center gap-3">
          <button onClick={() => router.push("/complaints")} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">{ticket.ticketNumber}</h1>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLORS[ticket.status]}`}>{STATUS_LABELS[ticket.status]}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${PRIORITY_COLORS[ticket.priority]}`}>{PRIORITY_LABELS[ticket.priority]}</span>
              {overdue && <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"><AlertTriangle className="h-3 w-3" /> SLA Overdue</span>}
            </div>
            <p className="mt-0.5 truncate text-sm font-medium text-slate-700">{ticket.subject}</p>
          </div>
        </div>

        {error && <p className="flex-none rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
          {/* Left: description, comments, attachments */}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pr-1">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Description</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-600">{ticket.description}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Timeline & Comments</h2>
              <div className="space-y-3">
                {mergeTimeline(ticket, usersById).map((entry) => (
                  <div key={entry.key} className="flex gap-2 text-sm">
                    <div className="mt-1 h-2 w-2 flex-none rounded-full bg-slate-300" />
                    <div className="min-w-0 flex-1">
                      {entry.kind === "status" ? (
                        <p className="text-xs text-slate-500">
                          <span className="font-semibold text-slate-700">{entry.actorName}</span> moved ticket
                          {entry.fromStatus ? ` from ${STATUS_LABELS[entry.fromStatus]}` : ""} to <span className="font-semibold">{STATUS_LABELS[entry.toStatus!]}</span>
                          {entry.reason ? ` — ${entry.reason}` : ""}
                        </p>
                      ) : (
                        <div className={`rounded-lg border px-3 py-2 ${entry.visibility === "CUSTOMER" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-slate-50"}`}>
                          <div className="mb-1 flex items-center gap-2 text-xs">
                            <span className="font-semibold text-slate-700">{entry.actorName}</span>
                            <span className={`rounded-full px-1.5 py-0.5 font-semibold ${entry.visibility === "CUSTOMER" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-600"}`}>
                              {entry.visibility === "CUSTOMER" ? "Customer-visible" : "Internal note"}
                            </span>
                          </div>
                          <p className="whitespace-pre-wrap text-sm text-slate-700">{entry.message}</p>
                        </div>
                      )}
                      <p className="mt-0.5 text-xs text-slate-400">{fmtDate(entry.createdAt)}</p>
                    </div>
                  </div>
                ))}
                {ticket.statusLogs.length === 0 && ticket.comments.length === 0 && (
                  <p className="text-xs text-slate-400">No activity yet.</p>
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="mb-2 flex items-center gap-2">
                  <select value={commentVisibility} onChange={(e) => setCommentVisibility(e.target.value as ComplaintCommentVisibility)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold outline-none">
                    <option value="INTERNAL">Internal note</option>
                    <option value="CUSTOMER">Customer-visible reply</option>
                  </select>
                  <p className="text-xs text-slate-400">{commentVisibility === "CUSTOMER" ? "Sent to the customer via WhatsApp" : "Only visible to staff"}</p>
                </div>
                <div className="flex gap-2">
                  <textarea value={commentMessage} onChange={(e) => setCommentMessage(e.target.value)} rows={2} placeholder="Add a note or reply..." className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                  <button onClick={handleAddComment} disabled={commentSaving || !commentMessage.trim()} className="inline-flex items-center gap-1 self-end rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                    {commentSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">Attachments</h2>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Upload
                  <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleUpload(f); e.target.value = ""; }} />
                </label>
              </div>
              {ticket.attachments.length === 0 ? (
                <p className="text-xs text-slate-400">No attachments yet.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {ticket.attachments.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="group flex flex-col items-center gap-1 rounded-lg border border-slate-200 p-2 text-center hover:border-blue-300">
                      {a.fileType?.startsWith("image/") ? (
                        <img src={a.url} alt={a.fileName} className="h-16 w-16 rounded object-cover" />
                      ) : (
                        <Paperclip className="h-8 w-8 text-slate-400" />
                      )}
                      <span className="line-clamp-1 text-xs text-slate-500 group-hover:text-blue-600">{a.fileName}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: info + actions */}
          <div className="flex min-h-0 flex-col gap-4 overflow-y-auto pl-0.5">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold text-slate-900">Details</h2>
              <dl className="space-y-1.5 text-xs">
                <Row label="Customer" value={ticket.customer.businessName} />
                {ticket.customer.phone && <Row label="Phone" value={ticket.customer.phone} />}
                {ticket.order?.orderNumber && <Row label="Order" value={ticket.order.orderNumber} />}
                <Row label="Category" value={CATEGORY_LABELS[ticket.category]} />
                <Row label="Channel" value={CHANNEL_LABELS[ticket.channel]} />
                <Row label="Raised By" value={ticket.raisedBy?.fullName ?? "Customer self-service"} />
                <Row label="Assigned To" value={ticket.assignedTo?.fullName ?? ticket.assignedTeam ?? "Unassigned"} />
                <Row label="Created" value={fmtDate(ticket.createdAt)} />
                <Row label="Response Due" value={fmtDate(ticket.slaResponseDueAt)} />
                <Row label="Resolution Due" value={fmtDate(ticket.slaResolutionDueAt)} highlight={overdue} />
                {ticket.resolvedAt && <Row label="Resolved" value={fmtDate(ticket.resolvedAt)} />}
                {ticket.closedAt && <Row label="Closed" value={fmtDate(ticket.closedAt)} />}
                {ticket.reopenCount > 0 && <Row label="Reopened" value={`${ticket.reopenCount} time(s)`} />}
                {ticket.resolutionType && <Row label="Resolution" value={RESOLUTION_LABELS[ticket.resolutionType]} />}
                {ticket.csatRating != null && <Row label="CSAT" value={`${ticket.csatRating} / 5`} />}
              </dl>
            </div>

            {canAssign && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900"><UserPlus className="h-4 w-4" /> Assign</h2>
                <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                  <option value="">Select a person...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.fullName} ({u.role.replace(/_/g, " ")})</option>)}
                </select>
                <input value={assignedTeam} onChange={(e) => setAssignedTeam(e.target.value)} placeholder="or team, e.g. PRODUCTION" className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
                <button onClick={handleAssign} disabled={busy} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                  {ticket.assignedToId ? "Reassign" : "Assign"}
                </button>
              </div>
            )}

            {legalNextStatuses.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-sm font-semibold text-slate-900">Change Status</h2>
                <select value={nextStatus} onChange={(e) => setNextStatus(e.target.value as ComplaintStatus)} className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none">
                  <option value="">Select next status...</option>
                  {legalNextStatuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                </select>
                <input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Reason (optional)" className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
                <button onClick={handleStatusChange} disabled={busy || !nextStatus} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Update Status</button>
              </div>
            )}

            {canResolve && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
                <h2 className="mb-2 text-sm font-semibold text-emerald-900">Resolve Ticket</h2>
                <select value={resolutionType} onChange={(e) => setResolutionType(e.target.value as ComplaintResolutionType)} className="mb-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none">
                  {Object.entries(RESOLUTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} rows={2} placeholder="Resolution notes (optional)" className="mb-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none" />
                <button onClick={handleResolve} disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Mark Resolved
                </button>
              </div>
            )}

            {canReopen && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 shadow-sm">
                <h2 className="mb-2 text-sm font-semibold text-red-900">Reopen Ticket</h2>
                <input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Reason for reopening" className="mb-2 w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm outline-none" />
                <button onClick={handleReopen} disabled={busy} className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">Reopen</button>
              </div>
            )}

            {canCsat && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h2 className="mb-2 text-sm font-semibold text-slate-900">Customer Satisfaction</h2>
                <div className="mb-2 flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} onClick={() => setCsatRating(n)} className="p-0.5">
                      <Star className={`h-5 w-5 ${n <= csatRating ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                    </button>
                  ))}
                </div>
                <textarea value={csatFeedback} onChange={(e) => setCsatFeedback(e.target.value)} rows={2} placeholder="Feedback (optional)" className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none" />
                <button onClick={handleCsat} disabled={busy} className="w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">Save Feedback</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-slate-400">{label}</dt>
      <dd className={`text-right font-medium ${highlight ? "text-red-600" : "text-slate-700"}`}>{value}</dd>
    </div>
  );
}

type TimelineEntry =
  | { key: string; kind: "status"; createdAt: string; actorName: string; fromStatus?: ComplaintStatus | null; toStatus?: ComplaintStatus; reason?: string | null }
  | { key: string; kind: "comment"; createdAt: string; actorName: string; visibility: ComplaintCommentVisibility; message: string };

function mergeTimeline(ticket: ComplaintDetail, usersById: Map<string, string>): TimelineEntry[] {
  const statusEntries: TimelineEntry[] = ticket.statusLogs.map((log) => ({
    key: `status-${log.id}`,
    kind: "status",
    createdAt: log.createdAt,
    actorName: (log.changedById && usersById.get(log.changedById)) || "System",
    fromStatus: log.fromStatus,
    toStatus: log.toStatus,
    reason: log.reason,
  }));
  const commentEntries: TimelineEntry[] = ticket.comments.map((c) => ({
    key: `comment-${c.id}`,
    kind: "comment",
    createdAt: c.createdAt,
    actorName: c.authorName,
    visibility: c.visibility,
    message: c.message,
  }));
  return [...statusEntries, ...commentEntries].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}
