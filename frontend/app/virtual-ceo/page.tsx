"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Bot, RefreshCw, AlertTriangle, CheckCircle2, Clock, Send,
  DollarSign, Factory, Truck, Package, BarChart2,
  Zap, Tag, CheckCheck, RotateCcw, Lock, Shield, UserCheck, Users,
  Unlock,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActionItem {
  id: string;
  department: "ACCOUNTS" | "PRODUCTION" | "DISPATCH" | "STOCK";
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: string;
  title: string;
  detail: string;
  orderNo?: string;
  ageHours?: number;
  ageDays?: number;
  actionUrl?: string;
}

interface VirtualCeoReport {
  generatedAt: string;
  summary: {
    totalActions: number;
    highPriority: number;
    mediumPriority: number;
    lowPriority: number;
    accounts: number;
    production: number;
    dispatch: number;
    stock: number;
  };
  accounts: ActionItem[];
  production: ActionItem[];
  dispatch: ActionItem[];
  stock: ActionItem[];
}

type VirtualCeoTag = { id: string; label: string; color: string };
type ErpConfig = {
  virtualCeoTags?: VirtualCeoTag[];
  virtualCeoCardTags?: Record<string, string>;
};

type ReviewStatus = {
  status: "OK" | "REVIEW_REQUIRED" | "REVIEW_PENDING" | "LOCKED";
  deadlineAt?: string;
  completedAt?: string;
  lockedAt?: string;
  reason?: string;
  taskActions?: Record<string, string>;
};

type AdminLockData = {
  requiredReviewers: string[];
  users: Array<{
    id: string;
    fullName: string;
    email: string;
    isActive: boolean;
    isRequiredReviewer: boolean;
    lockData: { lockedAt: string; reason: string } | null;
    pendingData: { deadlineAt: string; shownAt: string } | null;
  }>;
};

type StoredUser = { id: string; fullName?: string; email: string; role: string };

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  HIGH:   { color: "#ef4444", bg: "#fef2f2", badge: "#ef4444", label: "URGENT" },
  MEDIUM: { color: "#f59e0b", bg: "#fffbeb", badge: "#f59e0b", label: "MEDIUM" },
  LOW:    { color: "#10b981", bg: "#f0fdf4", badge: "#10b981", label: "LOW" },
};

const DEPT_CONFIG = {
  ACCOUNTS:   { icon: DollarSign,  color: "#6366f1", label: "Accounts" },
  PRODUCTION: { icon: Factory,     color: "#8b5cf6", label: "Production" },
  DISPATCH:   { icon: Truck,       color: "#f59e0b", label: "Dispatch" },
  STOCK:      { icon: Package,     color: "#10b981", label: "Stock & Costs" },
};

// ─── Countdown Timer ──────────────────────────────────────────────────────────

function useCountdown(deadlineAt: string | undefined) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!deadlineAt) return;
    const update = () => {
      const ms = new Date(deadlineAt).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [deadlineAt]);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const expired = remaining === 0 && !!deadlineAt;
  const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  const pct = deadlineAt
    ? Math.max(0, remaining / (2 * 3600000)) * 100
    : 100;

  return { remaining, expired, label, pct };
}

// ─── Mandatory Review Modal ───────────────────────────────────────────────────

function ReviewModal({
  allItems, taskActions, deadlineAt, onAction, onComplete, onExpired,
}: {
  allItems: ActionItem[];
  taskActions: Record<string, string>;
  deadlineAt: string | undefined;
  onAction: (itemId: string, action: "updated" | "followup" | null) => void;
  onComplete: () => void;
  onExpired: () => void;
}) {
  const { label, pct, expired } = useCountdown(deadlineAt);
  const prevExpired = useRef(false);

  useEffect(() => {
    if (expired && !prevExpired.current) {
      prevExpired.current = true;
      onExpired();
    }
  }, [expired, onExpired]);

  const tagged = allItems.filter(i => taskActions[i.id]);
  const done = tagged.length;
  const total = allItems.length;
  const allTagged = done >= total && total > 0;
  const timerColor = pct > 50 ? "#10b981" : pct > 20 ? "#f59e0b" : "#ef4444";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.85)",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      overflowY: "auto", padding: "24px 16px",
    }}>
      <div style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 780,
        boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
        margin: "auto",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
          borderRadius: "16px 16px 0 0", padding: "20px 24px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: "50%",
              background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
              <Shield size={22} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>Daily CEO Review Required</div>
              <div style={{ fontSize: 12, color: "#94a3b8" }}>
                Review each task and mark it as Updated or Follow Up before continuing
              </div>
            </div>
          </div>

          {/* Timer */}
          <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ color: "#94a3b8", fontSize: 12, fontWeight: 600 }}>⏱ Time Remaining</span>
              <span style={{ color: timerColor, fontSize: 22, fontWeight: 800, fontFamily: "monospace" }}>{label}</span>
            </div>
            <div style={{ height: 6, background: "#1e293b", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: timerColor, borderRadius: 3, transition: "width 1s linear, background 0.3s" }} />
            </div>
          </div>

          {/* Progress */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 12 }}>
            <span style={{ color: "#94a3b8", fontSize: 12 }}>Tasks reviewed: <strong style={{ color: "#fff" }}>{done}/{total}</strong></span>
            {allTagged && (
              <button
                onClick={onComplete}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 18px", borderRadius: 8, border: "none",
                  background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
                }}
              >
                <CheckCheck size={16} /> Mark Review Complete ✅
              </button>
            )}
          </div>
        </div>

        {/* Task list */}
        <div style={{ padding: 20, maxHeight: "65vh", overflowY: "auto" }}>
          {total === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
              <CheckCircle2 size={32} color="#10b981" />
              <div style={{ marginTop: 8, fontWeight: 600 }}>No action items today!</div>
              <button onClick={onComplete} style={{ marginTop: 12, padding: "8px 20px", background: "#10b981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 700 }}>
                Complete Review ✅
              </button>
            </div>
          )}
          {allItems.map(item => {
            const cfg = PRIORITY_CONFIG[item.priority];
            const action = taskActions[item.id];
            return (
              <div key={item.id} style={{
                background: action ? (action === "updated" ? "#f0fdf4" : "#fffbeb") : cfg.bg,
                border: `1px solid ${action ? (action === "updated" ? "#bbf7d0" : "#fde68a") : cfg.color + "33"}`,
                borderLeft: `4px solid ${action ? (action === "updated" ? "#10b981" : "#f59e0b") : cfg.color}`,
                borderRadius: 10, padding: "12px 14px", marginBottom: 8,
              }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                      <span style={{ background: cfg.badge, color: "#fff", padding: "1px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700 }}>{cfg.label}</span>
                      <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{item.category}</span>
                      {item.orderNo && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "#e0e7ff", color: "#4338ca" }}>#{item.orderNo}</span>}
                      {action === "updated" && <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 99, background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", gap: 3 }}><CheckCheck size={10} /> Updated</span>}
                      {action === "followup" && <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 8px", borderRadius: 99, background: "#fef9c3", color: "#ca8a04", display: "flex", alignItems: "center", gap: 3 }}><RotateCcw size={10} /> Follow Up</span>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 2 }}>{item.title}</div>
                    <div style={{ fontSize: 12, color: "#475569" }}>{item.detail}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => onAction(item.id, action === "updated" ? null : "updated")}
                      style={{
                        padding: "5px 10px", borderRadius: 6, border: `1px solid ${action === "updated" ? "#16a34a" : "#cbd5e1"}`,
                        background: action === "updated" ? "#16a34a" : "#fff",
                        color: action === "updated" ? "#fff" : "#475569",
                        fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <CheckCheck size={11} /> Updated
                    </button>
                    <button
                      onClick={() => onAction(item.id, action === "followup" ? null : "followup")}
                      style={{
                        padding: "5px 10px", borderRadius: 6, border: `1px solid ${action === "followup" ? "#ca8a04" : "#cbd5e1"}`,
                        background: action === "followup" ? "#ca8a04" : "#fff",
                        color: action === "followup" ? "#fff" : "#475569",
                        fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      <RotateCcw size={11} /> Follow Up
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        {!allTagged && total > 0 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #f1f5f9", background: "#f8fafc", borderRadius: "0 0 16px 16px" }}>
            <div style={{ fontSize: 12, color: "#64748b", textAlign: "center" }}>
              Tag all {total} tasks as <strong>Updated</strong> or <strong>Follow Up</strong> to complete the review
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Locked Screen ────────────────────────────────────────────────────────────

function LockedScreen({ lockedAt, reason }: { lockedAt?: string; reason?: string }) {
  const timeStr = lockedAt ? new Date(lockedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.92)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: "40px 48px",
        maxWidth: 480, width: "90%", textAlign: "center",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#fef2f2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Lock size={32} color="#ef4444" />
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", marginBottom: 8 }}>Account Temporarily Locked</div>
        <div style={{ fontSize: 14, color: "#64748b", marginBottom: 16, lineHeight: 1.6 }}>
          {reason ?? "CEO review was not completed within the required time."}
        </div>
        {timeStr && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 20 }}>Locked at: {timeStr} IST</div>}
        <div style={{
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 10, padding: "14px 18px", marginBottom: 24,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", marginBottom: 4 }}>What to do?</div>
          <div style={{ fontSize: 12, color: "#991b1b" }}>
            Contact <strong>Sanket (Admin)</strong> to unlock your account from the Virtual CEO → CEO Settings panel.
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#cbd5e1" }}>RarePrint ERP · Virtual CEO Enforcement</div>
      </div>
    </div>
  );
}

// ─── Admin CEO Settings Panel ─────────────────────────────────────────────────

function CeoSettingsPanel() {
  const [lockData, setLockData] = useState<AdminLockData | null>(null);
  const [loading, setLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<Array<{ id: string; fullName: string; email: string; role: string }>>([]);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [lockRes, usersRes] = await Promise.all([
        fetch(`${API_BASE_URL}/virtual-ceo/admin/lock-status`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/users`, { headers: getAuthHeaders() }),
      ]);
      if (lockRes.ok) setLockData(await lockRes.json());
      if (usersRes.ok) {
        const data = await usersRes.json();
        setAllUsers(Array.isArray(data) ? data : (data.users ?? []));
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleReviewer = async (userId: string, currentlyRequired: boolean) => {
    if (!lockData) return;
    const next = currentlyRequired
      ? lockData.requiredReviewers.filter(id => id !== userId)
      : [...lockData.requiredReviewers, userId];
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE_URL}/virtual-ceo/admin/required-reviewers`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: next }),
      });
      if (res.ok) { await loadData(); }
    } finally { setSaving(false); }
  };

  const unlockUser = async (userId: string) => {
    setUnlocking(userId);
    try {
      const res = await fetch(`${API_BASE_URL}/virtual-ceo/admin/unlock/${userId}`, {
        method: "POST", headers: getAuthHeaders(),
      });
      if (res.ok) await loadData();
    } finally { setUnlocking(null); }
  };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}><RefreshCw size={24} style={{ animation: "spin 1s linear infinite" }} /></div>;

  const lockedUsers = lockData?.users.filter(u => u.lockData) ?? [];
  const pendingUsers = lockData?.users.filter(u => u.pendingData && !u.lockData) ?? [];
  const reviewers = lockData?.users.filter(u => u.isRequiredReviewer) ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* Locked accounts */}
      {lockedUsers.length > 0 && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#dc2626", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Lock size={16} /> Locked Accounts ({lockedUsers.length})
          </div>
          {lockedUsers.map(u => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", borderRadius: 8, marginBottom: 8, border: "1px solid #fecaca" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{u.fullName}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{u.email}</div>
                <div style={{ fontSize: 11, color: "#dc2626", marginTop: 2 }}>
                  Locked: {new Date(u.lockData!.lockedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {u.lockData!.reason}
                </div>
              </div>
              <button
                onClick={() => unlockUser(u.id)}
                disabled={unlocking === u.id}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "7px 14px", borderRadius: 7, border: "none",
                  background: unlocking === u.id ? "#94a3b8" : "#10b981",
                  color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}
              >
                <Unlock size={13} /> {unlocking === u.id ? "Unlocking…" : "Unlock Account"}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending review (popup shown, in countdown) */}
      {pendingUsers.length > 0 && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 12, padding: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#92400e", marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={16} /> Review In Progress ({pendingUsers.length})
          </div>
          {pendingUsers.map(u => (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#fff", borderRadius: 8, marginBottom: 8, border: "1px solid #fde68a" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#1e293b", fontSize: 14 }}>{u.fullName}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{u.email}</div>
                <div style={{ fontSize: 11, color: "#92400e", marginTop: 2 }}>
                  Deadline: {new Date(u.pendingData!.deadlineAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                </div>
              </div>
              <button
                onClick={() => unlockUser(u.id)}
                style={{ padding: "7px 14px", borderRadius: 7, border: "none", background: "#f59e0b", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
              >
                Clear Timer
              </button>
            </div>
          ))}
        </div>
      )}

      {lockedUsers.length === 0 && pendingUsers.length === 0 && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 8, color: "#15803d" }}>
          <CheckCircle2 size={18} /> All required reviewers are active — no accounts locked
        </div>
      )}

      {/* Required reviewers */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", marginBottom: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <UserCheck size={16} color="#6366f1" /> Required Daily Reviewers
        </div>
        <div style={{ fontSize: 12, color: "#64748b", marginBottom: 16 }}>
          Users marked here must review the CEO report every day. Missing a review triggers a 2-hour enforcement popup — if not completed, their account is locked until you unlock it here.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {allUsers.filter(u => u.role !== "ADMIN").map(u => {
            const required = lockData?.requiredReviewers.includes(u.id) ?? false;
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: required ? "#f0f9ff" : "#f8fafc", borderRadius: 8, border: `1px solid ${required ? "#bae6fd" : "#e2e8f0"}` }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 13 }}>{u.fullName}</div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{u.email} · {u.role}</div>
                </div>
                <button
                  onClick={() => toggleReviewer(u.id, required)}
                  disabled={saving}
                  style={{
                    padding: "6px 14px", borderRadius: 7, border: `1px solid ${required ? "#0ea5e9" : "#cbd5e1"}`,
                    background: required ? "#0ea5e9" : "#fff",
                    color: required ? "#fff" : "#64748b",
                    fontWeight: 700, fontSize: 11, cursor: saving ? "not-allowed" : "pointer",
                  }}
                >
                  {required ? "✓ Required" : "+ Add"}
                </button>
              </div>
            );
          })}
          {allUsers.filter(u => u.role !== "ADMIN").length === 0 && (
            <div style={{ color: "#94a3b8", fontSize: 13, textAlign: "center", padding: 20 }}>No users found</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: ActionItem["priority"] }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span style={{ display: "inline-block", padding: "1px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: "#fff", background: cfg.badge }}>
      {cfg.label}
    </span>
  );
}

function ActionCard({
  item, onNavigate, tags, selectedTagId, onTagChange, taskAction, onTaskAction,
}: {
  item: ActionItem;
  onNavigate: (url: string) => void;
  tags: VirtualCeoTag[];
  selectedTagId?: string;
  onTagChange: (itemId: string, tagId: string) => void;
  taskAction?: string;
  onTaskAction: (itemId: string, action: "updated" | "followup" | null) => void;
}) {
  const cfg = PRIORITY_CONFIG[item.priority];
  const ageLabel = item.ageDays != null ? `${item.ageDays}d` : item.ageHours != null ? `${item.ageHours}h` : null;
  const selectedTag = tags.find(t => t.id === selectedTagId);

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.color}33`,
      borderLeft: `4px solid ${cfg.color}`,
      borderRadius: 10,
      padding: "12px 14px",
      marginBottom: 8,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Row 1: badges */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
            <PriorityBadge priority={item.priority} />
            <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{item.category}</span>
            {ageLabel && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                background: item.ageDays != null && item.ageDays > 3 ? "#fee2e2" : "#f1f5f9",
                color: item.ageDays != null && item.ageDays > 3 ? "#dc2626" : "#64748b" }}>
                {ageLabel} old
              </span>
            )}
            {item.orderNo && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99, background: "#e0e7ff", color: "#4338ca" }}>
                #{item.orderNo}
              </span>
            )}
            {selectedTag && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 99, background: `${selectedTag.color}18`, color: selectedTag.color, border: `1px solid ${selectedTag.color}40` }}>
                <Tag size={10} /> {selectedTag.label}
              </span>
            )}
            {taskAction === "updated" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 99, background: "#dcfce7", color: "#16a34a" }}>
                <CheckCheck size={10} /> Updated
              </span>
            )}
            {taskAction === "followup" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 99, background: "#fef9c3", color: "#ca8a04" }}>
                <RotateCcw size={10} /> Follow Up
              </span>
            )}
          </div>
          {/* Row 2: title */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", lineHeight: 1.4, marginBottom: 3 }}>{item.title}</div>
          {/* Row 3: detail */}
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{item.detail}</div>
        </div>

        {/* Right side controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0, alignItems: "flex-end" }}>
          {/* Action buttons */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onClick={() => onTaskAction(item.id, taskAction === "updated" ? null : "updated")}
              title="Mark as Updated"
              style={{
                padding: "5px 9px", borderRadius: 6, border: `1px solid ${taskAction === "updated" ? "#16a34a" : "#cbd5e1"}`,
                background: taskAction === "updated" ? "#16a34a" : "#fff",
                color: taskAction === "updated" ? "#fff" : "#64748b",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 3,
              }}
            >
              <CheckCheck size={11} /> Updated
            </button>
            <button
              onClick={() => onTaskAction(item.id, taskAction === "followup" ? null : "followup")}
              title="Mark as Follow Up"
              style={{
                padding: "5px 9px", borderRadius: 6, border: `1px solid ${taskAction === "followup" ? "#ca8a04" : "#cbd5e1"}`,
                background: taskAction === "followup" ? "#ca8a04" : "#fff",
                color: taskAction === "followup" ? "#fff" : "#64748b",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 3,
              }}
            >
              <RotateCcw size={11} /> Follow Up
            </button>
          </div>
          {/* Tag selector */}
          {tags.length > 0 && (
            <select
              value={selectedTagId ?? ""}
              onChange={(e) => onTagChange(item.id, e.target.value)}
              aria-label={`Tag ${item.title}`}
              style={{ width: 130, padding: "4px 6px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontSize: 11, fontWeight: 700 }}
            >
              <option value="">No tag</option>
              {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.label}</option>)}
            </select>
          )}
          {/* Go button */}
          {item.actionUrl && (
            <button
              onClick={() => onNavigate(item.actionUrl!)}
              style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "#1e293b", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
            >
              Go →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DepartmentSection({
  title, icon: Icon, color, items, onNavigate, tags, cardTags, onTagChange, taskActions, onTaskAction,
}: {
  title: string; icon: React.ElementType; color: string; items: ActionItem[];
  onNavigate: (url: string) => void; tags: VirtualCeoTag[];
  cardTags: Record<string, string>; onTagChange: (itemId: string, tagId: string) => void;
  taskActions: Record<string, string>;
  onTaskAction: (itemId: string, action: "updated" | "followup" | null) => void;
}) {
  const high   = items.filter(i => i.priority === "HIGH").length;
  const medium = items.filter(i => i.priority === "MEDIUM").length;
  const low    = items.filter(i => i.priority === "LOW").length;

  if (items.length === 0) {
    return (
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
        <CheckCircle2 size={24} color="#10b981" style={{ marginBottom: 6 }} />
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div>All clear! ✅</div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ background: color + "10", borderBottom: `2px solid ${color}30`, padding: "14px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon size={20} color={color} />
        <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", flex: 1 }}>{title}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {high > 0   && <span style={{ background: "#ef4444", color: "#fff", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{high} urgent</span>}
          {medium > 0 && <span style={{ background: "#f59e0b", color: "#fff", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{medium} medium</span>}
          {low > 0    && <span style={{ background: "#10b981", color: "#fff", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{low} low</span>}
        </div>
      </div>
      <div style={{ padding: "12px 14px" }}>
        {(["HIGH", "MEDIUM", "LOW"] as const).flatMap(p =>
          items.filter(i => i.priority === p).map(item => (
            <ActionCard key={item.id} item={item} onNavigate={onNavigate} tags={tags}
              selectedTagId={cardTags[item.id]} onTagChange={onTagChange}
              taskAction={taskActions[item.id]} onTaskAction={onTaskAction}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: React.ElementType }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${color}30`, borderTop: `4px solid ${color}`, borderRadius: 10, padding: "16px 18px", flex: 1, minWidth: 120, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={16} color={color} />
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "daily" | "accounts" | "production" | "dispatch" | "stock" | "ceo-settings";

export default function VirtualCeoPage() {
  const [report, setReport]       = useState<VirtualCeoReport | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [tab, setTab]             = useState<Tab>("daily");
  const [sending, setSending]     = useState(false);
  const [sentOk, setSentOk]       = useState<boolean | null>(null);
  const [erpConfig, setErpConfig] = useState<ErpConfig | null>(null);
  const [tagSavingId, setTagSavingId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus | null>(null);
  const [taskActions, setTaskActions] = useState<Record<string, string>>({});
  const [currentUser, setCurrentUser] = useState<StoredUser | null>(null);

  // Load current user from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rareprint_user");
      if (raw) setCurrentUser(JSON.parse(raw) as StoredUser);
      else {
        const token = localStorage.getItem("rareprint_token");
        if (token) {
          const payload = JSON.parse(atob(token.split(".")[1])) as { sub: string; email: string; role: string; fullName?: string };
          setCurrentUser({ id: payload.sub, email: payload.email, role: payload.role, fullName: payload.fullName });
        }
      }
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [res, erpRes, reviewRes] = await Promise.all([
        fetch(`${API_BASE_URL}/virtual-ceo/report`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/erp-config`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/virtual-ceo/review-status`, { headers: getAuthHeaders() }),
      ]);
      if (!res.ok) { setError("Could not load report"); return; }
      setReport(await res.json());
      if (erpRes.ok) setErpConfig(await erpRes.json());
      if (reviewRes.ok) {
        const rv = await reviewRes.json() as ReviewStatus & { taskActions?: Record<string, string> };
        setReviewStatus(rv);
        if (rv.taskActions) setTaskActions(rv.taskActions);
      }
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // When popup is first shown, notify backend to start timer
  const popupShownRef = useRef(false);
  useEffect(() => {
    if (
      (reviewStatus?.status === "REVIEW_REQUIRED" || reviewStatus?.status === "REVIEW_PENDING") &&
      !popupShownRef.current
    ) {
      popupShownRef.current = true;
      fetch(`${API_BASE_URL}/virtual-ceo/popup-shown`, { method: "POST", headers: getAuthHeaders() })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.deadlineAt) {
            setReviewStatus(prev => prev ? { ...prev, status: "REVIEW_PENDING", deadlineAt: data.deadlineAt } : prev);
          }
        })
        .catch(() => { /* silent */ });
    }
  }, [reviewStatus?.status]);

  const handleTaskAction = async (itemId: string, action: "updated" | "followup" | null) => {
    const next = { ...taskActions };
    if (action) next[itemId] = action; else delete next[itemId];
    setTaskActions(next);
    try {
      await fetch(`${API_BASE_URL}/virtual-ceo/task-action`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action }),
      });
    } catch { /* silent */ }
  };

  const handleCompleteReview = async () => {
    try {
      await fetch(`${API_BASE_URL}/virtual-ceo/complete-review`, { method: "POST", headers: getAuthHeaders() });
      setReviewStatus(prev => prev ? { ...prev, status: "OK", completedAt: new Date().toISOString() } : prev);
    } catch { /* silent */ }
  };

  const handleExpired = async () => {
    // Deadline passed — the server will lock on next check; show locked state immediately
    setReviewStatus({ status: "LOCKED", lockedAt: new Date().toISOString(), reason: "CEO review not completed within 2 hours" });
  };

  const triggerWhatsApp = async () => {
    setSending(true); setSentOk(null);
    try {
      const res = await fetch(`${API_BASE_URL}/virtual-ceo/trigger-whatsapp`, { headers: getAuthHeaders() });
      setSentOk(res.ok);
    } catch { setSentOk(false); }
    finally { setSending(false); }
  };

  const navigate = (url: string) => { window.location.href = url; };

  const updateCardTag = async (itemId: string, tagId: string) => {
    if (!erpConfig) return;
    const nextCardTags = { ...(erpConfig.virtualCeoCardTags ?? {}) };
    if (tagId) nextCardTags[itemId] = tagId; else delete nextCardTags[itemId];
    const nextConfig = { ...erpConfig, virtualCeoCardTags: nextCardTags };
    setErpConfig(nextConfig);
    setTagSavingId(itemId);
    try {
      const res = await fetch(`${API_BASE_URL}/erp-config`, {
        method: "PUT",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(nextConfig),
      });
      if (res.ok) setErpConfig(await res.json());
    } finally { setTagSavingId(null); }
  };

  const generatedAt = report ? new Date(report.generatedAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }) : "";

  const isAdmin = currentUser?.role === "ADMIN";

  // ── Render loading / error ──────────────────────────────────────────────────
  if (loading) return (
    <DashboardShell>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12 }}>
        <RefreshCw size={32} color="#6366f1" style={{ animation: "spin 1s linear infinite" }} />
        <div style={{ color: "#64748b", fontSize: 14 }}>Analysing all departments…</div>
        <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
      </div>
    </DashboardShell>
  );

  if (error || !report) return (
    <DashboardShell>
      <div style={{ padding: 32, color: "#ef4444", textAlign: "center" }}>
        <AlertTriangle size={32} />
        <div style={{ marginTop: 8 }}>{error ?? "No data"}</div>
        <button onClick={load} style={{ marginTop: 12, padding: "8px 20px", background: "#1e293b", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Retry</button>
      </div>
    </DashboardShell>
  );

  const allItems = [...report.accounts, ...report.production, ...report.dispatch, ...report.stock];
  const urgentItems = allItems.filter(i => i.priority === "HIGH");
  const tags = erpConfig?.virtualCeoTags ?? [];
  const cardTags = erpConfig?.virtualCeoCardTags ?? {};

  const TABS: { id: Tab; label: string; icon: React.ElementType; adminOnly?: boolean }[] = [
    { id: "daily",        label: "📋 Daily Schedule", icon: BarChart2 },
    { id: "accounts",     label: "💰 Accounts",        icon: DollarSign },
    { id: "production",   label: "🏭 Production",       icon: Factory },
    { id: "dispatch",     label: "📦 Dispatch",         icon: Truck },
    { id: "stock",        label: "📊 Stock & Costs",    icon: Package },
    { id: "ceo-settings", label: "⚙️ CEO Settings",    icon: Shield, adminOnly: true },
  ];

  return (
    <DashboardShell>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>

      {/* ── Locked overlay ── */}
      {reviewStatus?.status === "LOCKED" && (
        <LockedScreen lockedAt={reviewStatus.lockedAt} reason={reviewStatus.reason} />
      )}

      {/* ── Mandatory review modal ── */}
      {(reviewStatus?.status === "REVIEW_REQUIRED" || reviewStatus?.status === "REVIEW_PENDING") && (
        <ReviewModal
          allItems={allItems}
          taskActions={taskActions}
          deadlineAt={reviewStatus.deadlineAt}
          onAction={handleTaskAction}
          onComplete={handleCompleteReview}
          onExpired={handleExpired}
        />
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Header ── */}
        <div style={{
          background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
          borderRadius: 16, padding: "24px 28px", marginBottom: 24,
          display: "flex", alignItems: "center", gap: 16,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Bot size={28} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Virtual CEO</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>
              Last updated: {generatedAt} · Auto-WhatsApp daily at 10:00 AM
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap", alignItems: "center" }}>
            {reviewStatus?.status === "OK" && reviewStatus.completedAt && (
              <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}>
                <CheckCheck size={12} /> Review done today
              </span>
            )}
            <button onClick={load} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, border: "none", background: "#334155", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={triggerWhatsApp}
              disabled={sending}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, border: "none", background: sending ? "#475569" : "#25d366", color: "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "not-allowed" : "pointer" }}
            >
              <Send size={14} /> {sending ? "Sending…" : "Send WhatsApp Now"}
            </button>
          </div>
        </div>

        {sentOk === true && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#15803d", fontSize: 13, fontWeight: 600 }}>✅ WhatsApp report sent to Prajakta & Sanket!</div>}
        {sentOk === false && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#dc2626", fontSize: 13, fontWeight: 600 }}>❌ WhatsApp send failed. Check phone numbers in environment variables.</div>}

        {/* ── Review progress banner (when in normal OK state) ── */}
        {reviewStatus?.status === "OK" && !reviewStatus.completedAt && allItems.length > 0 && (
          <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
            <Users size={16} color="#0284c7" />
            <div style={{ flex: 1, fontSize: 13, color: "#0284c7" }}>
              <strong>{Object.keys(taskActions).length}/{allItems.length}</strong> tasks tagged today · Use the <strong>Updated</strong> / <strong>Follow Up</strong> buttons on each task card
            </div>
            {Object.keys(taskActions).length >= allItems.length && allItems.length > 0 && (
              <button onClick={handleCompleteReview} style={{ padding: "6px 14px", borderRadius: 7, border: "none", background: "#10b981", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
                Complete Review ✅
              </button>
            )}
          </div>
        )}

        {/* ── Summary Cards ── */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <SummaryCard label="Total Actions" value={report.summary.totalActions} color="#6366f1" icon={Zap} />
          <SummaryCard label="🔴 Urgent"    value={report.summary.highPriority}  color="#ef4444" icon={AlertTriangle} />
          <SummaryCard label="🟡 Medium"    value={report.summary.mediumPriority} color="#f59e0b" icon={Clock} />
          <SummaryCard label="Accounts"     value={report.summary.accounts}       color="#6366f1" icon={DollarSign} />
          <SummaryCard label="Production"   value={report.summary.production}     color="#8b5cf6" icon={Factory} />
          <SummaryCard label="Dispatch"     value={report.summary.dispatch}       color="#f59e0b" icon={Truck} />
          <SummaryCard label="Stock"        value={report.summary.stock}          color="#10b981" icon={Package} />
        </div>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, overflowX: "auto", background: "#f1f5f9", borderRadius: 10, padding: 4 }}>
          {TABS.filter(t => !t.adminOnly || isAdmin).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "none",
                background: tab === t.id ? "#fff" : "transparent",
                color: tab === t.id ? "#1e293b" : "#64748b",
                fontWeight: tab === t.id ? 700 : 500, fontSize: 13, cursor: "pointer",
                boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── CEO Settings Tab ── */}
        {tab === "ceo-settings" && isAdmin && <CeoSettingsPanel />}

        {/* ── Daily Schedule Tab ── */}
        {tab === "daily" && (
          <div>
            {urgentItems.length > 0 && (
              <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: "16px 18px", marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: "#ef4444", fontSize: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={16} /> {urgentItems.length} Urgent Items — Act Now
                </div>
                {urgentItems.map(item => (
                  <ActionCard key={item.id} item={item} onNavigate={navigate} tags={tags}
                    selectedTagId={cardTags[item.id]} onTagChange={updateCardTag}
                    taskAction={taskActions[item.id]} onTaskAction={handleTaskAction}
                  />
                ))}
                {tagSavingId && <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>Saving tag...</div>}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))", gap: 16 }}>
              {(["ACCOUNTS", "PRODUCTION", "DISPATCH", "STOCK"] as const).map(dept => {
                const cfg = DEPT_CONFIG[dept];
                const deptItems = allItems.filter(i => i.department === dept);
                return (
                  <DepartmentSection key={dept} title={cfg.label} icon={cfg.icon} color={cfg.color}
                    items={deptItems} onNavigate={navigate} tags={tags} cardTags={cardTags}
                    onTagChange={updateCardTag} taskActions={taskActions} onTaskAction={handleTaskAction}
                  />
                );
              })}
            </div>

            {/* Industry Standard Reports */}
            <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px", marginTop: 24 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", marginBottom: 14 }}>📈 Industry Standard Reports (Recommended)</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
                {[
                  { title: "On-Time Delivery Rate", desc: "% orders delivered by promised date", dept: "Dispatch" },
                  { title: "Production Cycle Time", desc: "Avg hours from approval to ready-for-dispatch", dept: "Production" },
                  { title: "Order Fulfillment Rate", desc: "Orders completed vs cancelled", dept: "Production" },
                  { title: "Outstanding Receivables", desc: "Balance due aging (0–7d, 7–30d, 30d+)", dept: "Accounts" },
                  { title: "Vendor Payment Dues", desc: "Unpaid jobwork by vendor", dept: "Stock" },
                  { title: "Courier Charge Variance", desc: "Quoted vs actual courier cost per order", dept: "Dispatch" },
                  { title: "Paper Consumption Rate", desc: "Sheets consumed vs purchased this month", dept: "Stock" },
                  { title: "Order Bottleneck Report", desc: "Orders stuck > 2d at each stage", dept: "Production" },
                ].map(r => (
                  <div key={r.title} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{r.desc}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: "#e0e7ff", color: "#4338ca" }}>{r.dept}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Suggestions */}
            <div style={{ background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)", border: "1px solid #bbf7d0", borderRadius: 12, padding: "20px 24px", marginTop: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#15803d", marginBottom: 14 }}>💡 Process Improvement Suggestions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { title: "Auto-assign production category at order approval", detail: "When an order is approved, system auto-categorizes items as INHOUSE/CLUBBING/SHEET based on product rules — eliminates manual step." },
                  { title: "SLA alerts: notify manager before deadline, not after", detail: "Set automatic WhatsApp alerts 4h before an order's expectedDelivery so the manager can act proactively." },
                  { title: "Vendor response time tracking", detail: "Log when a job is sent to vendor and when it's returned. Flag vendors with >3 day avg turnaround." },
                  { title: "Auto-book Shiprocket when order reaches READY_FOR_DISPATCH", detail: "Reduce the 2-day booking delay by triggering shipment booking automatically (with manager confirmation via WhatsApp)." },
                  { title: "Daily paper consumption forecast", detail: "Based on active print sheets, forecast when each paper stock will run out and auto-alert before shortage." },
                ].map(s => (
                  <div key={s.title} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ fontSize: 18, flexShrink: 0 }}>→</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#15803d" }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: "#047857" }}>{s.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Department-specific tabs ── */}
        {tab === "accounts" && (
          <DepartmentSection title="Accounts" icon={DEPT_CONFIG.ACCOUNTS.icon} color={DEPT_CONFIG.ACCOUNTS.color}
            items={report.accounts} onNavigate={navigate} tags={tags} cardTags={cardTags}
            onTagChange={updateCardTag} taskActions={taskActions} onTaskAction={handleTaskAction}
          />
        )}
        {tab === "production" && (
          <DepartmentSection title="Production" icon={DEPT_CONFIG.PRODUCTION.icon} color={DEPT_CONFIG.PRODUCTION.color}
            items={report.production} onNavigate={navigate} tags={tags} cardTags={cardTags}
            onTagChange={updateCardTag} taskActions={taskActions} onTaskAction={handleTaskAction}
          />
        )}
        {tab === "dispatch" && (
          <DepartmentSection title="Dispatch" icon={DEPT_CONFIG.DISPATCH.icon} color={DEPT_CONFIG.DISPATCH.color}
            items={report.dispatch} onNavigate={navigate} tags={tags} cardTags={cardTags}
            onTagChange={updateCardTag} taskActions={taskActions} onTaskAction={handleTaskAction}
          />
        )}
        {tab === "stock" && (
          <DepartmentSection title="Stock & Costs" icon={DEPT_CONFIG.STOCK.icon} color={DEPT_CONFIG.STOCK.color}
            items={report.stock} onNavigate={navigate} tags={tags} cardTags={cardTags}
            onTagChange={updateCardTag} taskActions={taskActions} onTaskAction={handleTaskAction}
          />
        )}

      </div>
    </DashboardShell>
  );
}
