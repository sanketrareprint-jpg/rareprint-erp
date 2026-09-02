"use client";
import React, { useEffect, useState } from "react";
import { MobileSelect } from "@/components/MobileSelect";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";
import {
  Award, Loader2, AlertCircle, CheckCircle, XCircle, Plus, Paperclip,
  ThumbsUp, ThumbsDown, Trophy, Zap, Send, ChevronDown, ChevronUp,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────

type ClaimType = "MANUAL" | "AUTOMATIC";
type ClaimStatus = "PENDING" | "APPROVED" | "REJECTED";

interface BonusActivity {
  id: string;
  name: string;
  description: string | null;
  points: number;
  claimType: ClaimType;
  isActive: boolean;
  createdAt: string;
}

interface BonusClaim {
  id: string;
  activityId: string;
  userId: string;
  points: number;
  details: string;
  attachmentUrl: string | null;
  attachmentName: string | null;
  status: ClaimStatus;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  activity: BonusActivity;
}

interface WalletTxn {
  id: string;
  coins: number;
  reason: string;
  createdAt: string;
}

interface RewardWallet {
  id: string;
  userId: string;
  coins: number;
  transactions: WalletTxn[];
}

interface LeaderboardRow {
  id: string;
  fullName: string;
  email: string;
  role: string;
  points: number;
}

interface StaffUser {
  id: string;
  fullName: string;
  email: string;
  role: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_META: Record<ClaimStatus, { label: string; color: string }> = {
  PENDING: { label: "Pending", color: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Approved", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "Rejected", color: "bg-red-50 text-red-600" },
};

async function jsonHeaders() {
  return getAuthHeaders();
}

function multipartHeaders() {
  const auth = getAuthHeaders();
  const headers: Record<string, string> = {};
  if (auth.Authorization) headers.Authorization = auth.Authorization;
  return headers;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function BonusPointsTab() {
  const [currentUser] = useState(() => getStoredUser());
  const isAdmin = currentUser?.role === "ADMIN";

  const [wallet, setWallet] = useState<RewardWallet | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  const [activities, setActivities] = useState<BonusActivity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  const [myClaims, setMyClaims] = useState<BonusClaim[]>([]);
  const [myClaimsLoading, setMyClaimsLoading] = useState(true);

  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Claim form ──
  const [claimActivityId, setClaimActivityId] = useState("");
  const [claimDetails, setClaimDetails] = useState("");
  const [claimFile, setClaimFile] = useState<File | null>(null);
  const [claimSubmitting, setClaimSubmitting] = useState(false);

  // ── Admin: activities queue ──
  const [allActivities, setAllActivities] = useState<BonusActivity[]>([]);
  const [pendingClaims, setPendingClaims] = useState<BonusClaim[]>([]);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [newActivity, setNewActivity] = useState<{ name: string; description: string; points: string; claimType: ClaimType }>({
    name: "", description: "", points: "", claimType: "MANUAL",
  });
  const [activitySaving, setActivitySaving] = useState(false);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [creditActivityId, setCreditActivityId] = useState("");
  const [creditUserId, setCreditUserId] = useState("");
  const [creditNote, setCreditNote] = useState("");
  const [crediting, setCrediting] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const loadWallet = async () => {
    setWalletLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/wallet`, { headers: getAuthHeaders() });
      if (res.ok) setWallet(await res.json());
    } catch { /* keep null */ } finally { setWalletLoading(false); }
  };

  const loadActivities = async () => {
    setActivitiesLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/activities`, { headers: getAuthHeaders() });
      if (res.ok) setActivities(await res.json());
    } catch { /* ignore */ } finally { setActivitiesLoading(false); }
  };

  const loadAllActivities = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/activities?all=true`, { headers: getAuthHeaders() });
      if (res.ok) setAllActivities(await res.json());
    } catch { /* ignore */ }
  };

  const loadMyClaims = async () => {
    setMyClaimsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/claims/mine`, { headers: getAuthHeaders() });
      if (res.ok) setMyClaims(await res.json());
    } catch { /* ignore */ } finally { setMyClaimsLoading(false); }
  };

  const loadPendingClaims = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/claims?status=PENDING`, { headers: getAuthHeaders() });
      if (res.ok) setPendingClaims(await res.json());
    } catch { /* ignore */ }
  };

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/leaderboard`, { headers: getAuthHeaders() });
      if (res.ok) setLeaderboard(await res.json());
    } catch { /* ignore */ } finally { setLeaderboardLoading(false); }
  };

  const loadStaffUsers = async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${API_BASE_URL}/complaints/users`, { headers: getAuthHeaders() });
      if (res.ok) setStaffUsers(await res.json());
    } catch { /* ignore */ }
  };

  useEffect(() => {
    void loadWallet();
    void loadActivities();
    void loadMyClaims();
    void loadLeaderboard();
    if (isAdmin) {
      void loadAllActivities();
      void loadPendingClaims();
      void loadStaffUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const claimableActivities = activities.filter((a) => a.isActive && a.claimType === "MANUAL");
  const automaticActivities = (isAdmin ? allActivities : activities).filter((a) => a.claimType === "AUTOMATIC" && a.isActive);

  const handleSubmitClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!claimActivityId) { setError("Choose which activity you're claiming"); return; }
    if (!claimDetails.trim()) { setError("Describe what you did"); return; }
    if (!claimFile) { setError("Attach evidence (screenshot, photo, etc.) — it's required"); return; }

    setClaimSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("activityId", claimActivityId);
      formData.append("details", claimDetails.trim());
      formData.append("file", claimFile);
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/claims`, {
        method: "POST",
        headers: multipartHeaders(),
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Could not submit claim");
      setNotice("Claim submitted — an admin will review it shortly.");
      setClaimActivityId("");
      setClaimDetails("");
      setClaimFile(null);
      void loadMyClaims();
    } catch (err: any) {
      setError(err?.message ?? "Could not submit claim");
    } finally {
      setClaimSubmitting(false);
    }
  };

  const handleReview = async (id: string, action: "approve" | "reject") => {
    setReviewingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/claims/${id}/${action}`, {
        method: "PATCH",
        headers: await jsonHeaders(),
        body: JSON.stringify({ note: reviewNotes[id] ?? "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? `Could not ${action} claim`);
      setNotice(`Claim ${action === "approve" ? "approved" : "rejected"}.`);
      void loadPendingClaims();
      void loadLeaderboard();
    } catch (err: any) {
      setError(err?.message ?? `Could not ${action} claim`);
    } finally {
      setReviewingId(null);
    }
  };

  const handleCreateActivity = async () => {
    setError(null);
    if (!newActivity.name.trim()) { setError("Activity name is required"); return; }
    const points = Number(newActivity.points);
    if (!Number.isFinite(points) || points <= 0) { setError("Points must be a positive number"); return; }
    setActivitySaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/activities`, {
        method: "POST",
        headers: await jsonHeaders(),
        body: JSON.stringify({
          name: newActivity.name.trim(),
          description: newActivity.description.trim() || undefined,
          points,
          claimType: newActivity.claimType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Could not create activity");
      setNotice("Activity added.");
      setNewActivity({ name: "", description: "", points: "", claimType: "MANUAL" });
      setShowActivityForm(false);
      void loadActivities();
      void loadAllActivities();
    } catch (err: any) {
      setError(err?.message ?? "Could not create activity");
    } finally {
      setActivitySaving(false);
    }
  };

  const handleToggleActive = async (activity: BonusActivity) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/activities/${activity.id}`, {
        method: "PATCH",
        headers: await jsonHeaders(),
        body: JSON.stringify({ isActive: !activity.isActive }),
      });
      if (!res.ok) throw new Error("Could not update activity");
      void loadActivities();
      void loadAllActivities();
    } catch (err: any) {
      setError(err?.message ?? "Could not update activity");
    }
  };

  const handleDirectCredit = async () => {
    setError(null);
    setNotice(null);
    if (!creditActivityId) { setError("Choose an automatic activity"); return; }
    if (!creditUserId) { setError("Choose who to credit"); return; }
    setCrediting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/rewards/bonus/claims/direct-credit`, {
        method: "POST",
        headers: await jsonHeaders(),
        body: JSON.stringify({ activityId: creditActivityId, userId: creditUserId, note: creditNote.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Could not credit points");
      setNotice("Points credited.");
      setCreditActivityId("");
      setCreditUserId("");
      setCreditNote("");
      void loadLeaderboard();
      void loadWallet();
    } catch (err: any) {
      setError(err?.message ?? "Could not credit points");
    } finally {
      setCrediting(false);
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800"><XCircle className="w-4 h-4" /></button>
        </div>
      )}
      {notice && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-green-700">{notice}</p>
          <button onClick={() => setNotice(null)} className="ml-auto text-green-600 hover:text-green-800"><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      {/* ── My balance ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500">My Bonus Points</p>
          {walletLoading ? (
            <p className="text-sm text-gray-400 flex items-center gap-2 mt-1"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
          ) : (
            <p className="text-2xl font-bold text-gray-900">{(wallet?.coins ?? 0).toLocaleString("en-IN")} pts</p>
          )}
        </div>
        <Award className="w-10 h-10 text-amber-300" />
      </div>

      {/* ── Submit a claim ── */}
      <form onSubmit={handleSubmitClaim} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Send className="w-4 h-4 text-amber-600" /> Submit a bonus claim</h2>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Activity</label>
          <MobileSelect
            value={claimActivityId}
            onChange={setClaimActivityId}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white"
            options={[{ value: "", label: "Select an activity…" }, ...claimableActivities.map((a) => ({ value: a.id, label: `${a.name} — ${a.points} pts` }))]}
          />
          {activitiesLoading ? null : claimableActivities.length === 0 && (
            <p className="text-xs text-gray-400 mt-1">No claimable activities yet — ask an admin to add some.</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">What did you do?</label>
          <textarea
            value={claimDetails}
            onChange={(e) => setClaimDetails(e.target.value)}
            rows={3}
            placeholder="e.g. Got a 5-star Google review from customer Ramesh Traders on 25 Jul"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-amber-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Evidence attachment (required)</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setClaimFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-amber-50 file:text-amber-700 file:text-xs file:font-medium hover:file:bg-amber-100"
          />
        </div>
        <button
          type="submit"
          disabled={claimSubmitting}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
        >
          {claimSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Submit claim
        </button>
      </form>

      {/* ── My claims ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-800">My claims</h2></div>
        {myClaimsLoading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : myClaims.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-8 text-center">No claims submitted yet.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {myClaims.map((c) => {
              const meta = STATUS_META[c.status];
              return (
                <div key={c.id} className="px-5 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{c.activity?.name ?? "Activity"}</p>
                    <p className="text-xs text-gray-500 truncate">{c.details}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(c.createdAt)}{c.reviewNote ? ` · ${c.reviewNote}` : ""}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>{meta.label}</span>
                    <p className="text-xs text-gray-500 mt-1">{c.points} pts</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Leaderboard ── */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100"><h2 className="text-sm font-semibold text-gray-800 flex items-center gap-1.5"><Trophy className="w-4 h-4 text-amber-500" /> Everyone&apos;s bonus points</h2></div>
        {leaderboardLoading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-500 py-8"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
        ) : leaderboard.length === 0 ? (
          <p className="text-sm text-gray-400 px-5 py-8 text-center">No staff accounts found.</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {leaderboard.map((row, i) => (
              <div key={row.id} className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5">{i + 1}</span>
                  <div>
                    <p className="text-sm text-gray-800">{row.fullName}</p>
                    <p className="text-xs text-gray-400">{row.role}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-amber-700">{row.points.toLocaleString("en-IN")} pts</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Admin panel ── */}
      {isAdmin && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowAdminPanel((v) => !v)}
            className="w-full px-5 py-3 border-b border-gray-100 flex items-center justify-between text-sm font-semibold text-gray-800"
          >
            <span className="flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-600" /> Admin — activities &amp; claim approvals</span>
            {showAdminPanel ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAdminPanel && (
            <div className="p-5 space-y-6">

              {/* Pending claims queue */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Pending claims ({pendingClaims.length})</h3>
                {pendingClaims.length === 0 ? (
                  <p className="text-sm text-gray-400">Nothing waiting for review.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingClaims.map((c) => (
                      <div key={c.id} className="border border-gray-200 rounded-lg p-3 space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800">{c.activity?.name} — {c.points} pts</p>
                            <p className="text-xs text-gray-500">{c.details}</p>
                            <p className="text-xs text-gray-400 mt-0.5">Submitted {fmtDate(c.createdAt)}</p>
                          </div>
                          {c.attachmentUrl && (
                            <a href={c.attachmentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline flex-shrink-0">
                              <Paperclip className="w-3.5 h-3.5" /> {c.attachmentName ?? "attachment"}
                            </a>
                          )}
                        </div>
                        <input
                          type="text"
                          placeholder="Optional note for the claimant…"
                          value={reviewNotes[c.id] ?? ""}
                          onChange={(e) => setReviewNotes({ ...reviewNotes, [c.id]: e.target.value })}
                          className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs outline-none focus:border-amber-400"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleReview(c.id, "approve")}
                            disabled={reviewingId === c.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {reviewingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsUp className="w-3.5 h-3.5" />} Approve
                          </button>
                          <button
                            onClick={() => handleReview(c.id, "reject")}
                            disabled={reviewingId === c.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-medium rounded-lg hover:bg-red-50 disabled:opacity-50"
                          >
                            {reviewingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ThumbsDown className="w-3.5 h-3.5" />} Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity catalog */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Activity catalog</h3>
                  <button
                    onClick={() => setShowActivityForm((v) => !v)}
                    className="flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 font-medium"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add activity
                  </button>
                </div>

                {showActivityForm && (
                  <div className="border border-amber-200 bg-amber-50 rounded-lg p-3 mb-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text" placeholder="Activity name"
                        value={newActivity.name}
                        onChange={(e) => setNewActivity({ ...newActivity, name: e.target.value })}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400"
                      />
                      <input
                        type="number" placeholder="Points"
                        value={newActivity.points}
                        onChange={(e) => setNewActivity({ ...newActivity, points: e.target.value })}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400"
                      />
                    </div>
                    <input
                      type="text" placeholder="Description (optional)"
                      value={newActivity.description}
                      onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400"
                    />
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input type="radio" checked={newActivity.claimType === "MANUAL"} onChange={() => setNewActivity({ ...newActivity, claimType: "MANUAL" })} />
                        Manual (staff submits a claim)
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input type="radio" checked={newActivity.claimType === "AUTOMATIC"} onChange={() => setNewActivity({ ...newActivity, claimType: "AUTOMATIC" })} />
                        Automatic (admin credits directly)
                      </label>
                    </div>
                    <button
                      onClick={handleCreateActivity}
                      disabled={activitySaving}
                      className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {activitySaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Save activity
                    </button>
                  </div>
                )}

                {allActivities.length === 0 ? (
                  <p className="text-sm text-gray-400">No activities defined yet.</p>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-200 rounded-lg overflow-hidden">
                    {allActivities.map((a) => (
                      <div key={a.id} className="px-3 py-2 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 truncate">{a.name} <span className="text-xs text-gray-400">({a.claimType === "MANUAL" ? "Manual" : "Automatic"})</span></p>
                          {a.description && <p className="text-xs text-gray-400 truncate">{a.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-medium text-amber-700">{a.points} pts</span>
                          <button
                            onClick={() => handleToggleActive(a)}
                            className={`text-xs px-2 py-1 rounded-lg border ${a.isActive ? "border-gray-200 text-gray-600 hover:bg-gray-50" : "border-red-200 text-red-500 hover:bg-red-50"}`}
                          >
                            {a.isActive ? "Active" : "Inactive"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Direct credit for automatic activities */}
              <div>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Credit an automatic activity directly</h3>
                {automaticActivities.length === 0 ? (
                  <p className="text-sm text-gray-400">No automatic activities defined yet — add one above with type &quot;Automatic&quot;.</p>
                ) : (
                  <div className="border border-gray-200 rounded-lg p-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <MobileSelect
                        value={creditActivityId}
                        onChange={setCreditActivityId}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 bg-white"
                        options={[{ value: "", label: "Activity…" }, ...automaticActivities.map((a) => ({ value: a.id, label: `${a.name} — ${a.points} pts` }))]}
                      />
                      <MobileSelect
                        value={creditUserId}
                        onChange={setCreditUserId}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400 bg-white"
                        options={[{ value: "", label: "Credit to…" }, ...staffUsers.map((u) => ({ value: u.id, label: u.fullName }))]}
                      />
                    </div>
                    <input
                      type="text" placeholder="Note (optional)"
                      value={creditNote}
                      onChange={(e) => setCreditNote(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm outline-none focus:border-amber-400"
                    />
                    <button
                      onClick={handleDirectCredit}
                      disabled={crediting}
                      className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 text-white text-xs font-medium rounded-lg hover:bg-amber-700 disabled:opacity-50"
                    >
                      {crediting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Credit points
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
