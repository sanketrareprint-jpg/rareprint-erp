"use client";
import { useCallback, useEffect, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";
import {
  Bot, RefreshCw, AlertTriangle, CheckCircle2, Clock, Send,
  DollarSign, Factory, Truck, Package, BarChart2,
  Zap, Tag,
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: ActionItem["priority"] }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span style={{
      display: "inline-block",
      padding: "1px 8px",
      borderRadius: 99,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: "0.05em",
      color: "#fff",
      background: cfg.badge,
    }}>
      {cfg.label}
    </span>
  );
}

function ActionCard({
  item, onNavigate, tags, selectedTagId, onTagChange,
}: {
  item: ActionItem;
  onNavigate: (url: string) => void;
  tags: VirtualCeoTag[];
  selectedTagId?: string;
  onTagChange: (itemId: string, tagId: string) => void;
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
          {/* Row 1: badges + age */}
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
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 99,
                background: "#e0e7ff", color: "#4338ca" }}>
                #{item.orderNo}
              </span>
            )}
            {selectedTag && (
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 10,
                fontWeight: 800,
                padding: "2px 7px",
                borderRadius: 99,
                background: `${selectedTag.color}18`,
                color: selectedTag.color,
                border: `1px solid ${selectedTag.color}40`,
              }}>
                <Tag size={10} /> {selectedTag.label}
              </span>
            )}
          </div>
          {/* Row 2: title */}
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", lineHeight: 1.4, marginBottom: 3 }}>{item.title}</div>
          {/* Row 3: detail — always visible */}
          <div style={{ fontSize: 12, color: "#475569", lineHeight: 1.5 }}>{item.detail}</div>
        </div>
        {tags.length > 0 && (
          <select
            value={selectedTagId ?? ""}
            onChange={(e) => onTagChange(item.id, e.target.value)}
            aria-label={`Tag ${item.title}`}
            style={{
              width: 150,
              padding: "6px 8px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#334155",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            <option value="">No tag</option>
            {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.label}</option>)}
          </select>
        )}
        {item.actionUrl && (
          <button
            onClick={() => onNavigate(item.actionUrl!)}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "none",
              background: "#1e293b", color: "#fff", fontSize: 12,
              fontWeight: 700, cursor: "pointer", flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            Go →
          </button>
        )}
      </div>
    </div>
  );
}

function DepartmentSection({
  title, icon: Icon, color, items, onNavigate, tags, cardTags, onTagChange,
}: {
  title: string;
  icon: React.ElementType;
  color: string;
  items: ActionItem[];
  onNavigate: (url: string) => void;
  tags: VirtualCeoTag[];
  cardTags: Record<string, string>;
  onTagChange: (itemId: string, tagId: string) => void;
}) {
  const high   = items.filter(i => i.priority === "HIGH").length;
  const medium = items.filter(i => i.priority === "MEDIUM").length;
  const low    = items.filter(i => i.priority === "LOW").length;

  if (items.length === 0) {
    return (
      <div style={{
        background: "#f8fafc",
        border: "1px solid #e2e8f0",
        borderRadius: 12,
        padding: 20,
        textAlign: "center",
        color: "#94a3b8",
        fontSize: 13,
      }}>
        <CheckCircle2 size={24} color="#10b981" style={{ marginBottom: 6 }} />
        <div style={{ fontWeight: 600 }}>{title}</div>
        <div>All clear! ✅</div>
      </div>
    );
  }

  return (
    <div style={{
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      overflow: "hidden",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      {/* Header */}
      <div style={{
        background: color + "10",
        borderBottom: `2px solid ${color}30`,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 10,
      }}>
        <Icon size={20} color={color} />
        <span style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", flex: 1 }}>{title}</span>
        <div style={{ display: "flex", gap: 6 }}>
          {high > 0   && <span style={{ background: "#ef4444", color: "#fff", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{high} urgent</span>}
          {medium > 0 && <span style={{ background: "#f59e0b", color: "#fff", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{medium} medium</span>}
          {low > 0    && <span style={{ background: "#10b981", color: "#fff", padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 700 }}>{low} low</span>}
        </div>
      </div>
      {/* Items */}
      <div style={{ padding: "12px 14px" }}>
        {/* Show HIGH first, then MEDIUM, then LOW */}
        {["HIGH", "MEDIUM", "LOW"].flatMap(p =>
          items
            .filter(i => i.priority === p)
            .map(item => (
              <ActionCard
                key={item.id}
                item={item}
                onNavigate={onNavigate}
                tags={tags}
                selectedTagId={cardTags[item.id]}
                onTagChange={onTagChange}
              />
            ))
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, icon: Icon }: {
  label: string; value: number; color: string; icon: React.ElementType;
}) {
  return (
    <div style={{
      background: "#fff",
      border: `1px solid ${color}30`,
      borderTop: `4px solid ${color}`,
      borderRadius: 10,
      padding: "16px 18px",
      flex: 1,
      minWidth: 120,
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon size={16} color={color} />
        <span style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color }}>
        {value}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "daily" | "accounts" | "production" | "dispatch" | "stock";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "daily",      label: "📋 Daily Schedule", icon: BarChart2 },
  { id: "accounts",   label: "💰 Accounts",        icon: DollarSign },
  { id: "production", label: "🏭 Production",       icon: Factory },
  { id: "dispatch",   label: "📦 Dispatch",         icon: Truck },
  { id: "stock",      label: "📊 Stock & Costs",    icon: Package },
];

export default function VirtualCeoPage() {
  const [report, setReport]     = useState<VirtualCeoReport | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [tab, setTab]           = useState<Tab>("daily");
  const [sending, setSending]   = useState(false);
  const [sentOk, setSentOk]     = useState<boolean | null>(null);
  const [erpConfig, setErpConfig] = useState<ErpConfig | null>(null);
  const [tagSavingId, setTagSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [res, erpRes] = await Promise.all([
        fetch(`${API_BASE_URL}/virtual-ceo/report`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE_URL}/erp-config`, { headers: getAuthHeaders() }),
      ]);
      if (!res.ok) { setError("Could not load report"); return; }
      setReport(await res.json());
      if (erpRes.ok) setErpConfig(await erpRes.json());
    } catch { setError("Network error"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
    if (tagId) nextCardTags[itemId] = tagId;
    else delete nextCardTags[itemId];
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
    } finally {
      setTagSavingId(null);
    }
  };

  const generatedAt = report ? new Date(report.generatedAt).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }) : "";

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

  return (
    <DashboardShell>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>

        {/* ── Header ── */}
        <div style={{
          background: "linear-gradient(135deg, #1e293b 0%, #334155 100%)",
          borderRadius: 16,
          padding: "24px 28px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 16,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Bot size={28} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>Virtual CEO</div>
            <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>
              Last updated: {generatedAt} · Auto-WhatsApp daily at 10:00 AM
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
            <button
              onClick={load}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 8, border: "none",
                background: "#334155", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <button
              onClick={triggerWhatsApp}
              disabled={sending}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "9px 16px", borderRadius: 8, border: "none",
                background: sending ? "#475569" : "#25d366",
                color: "#fff", fontSize: 13, fontWeight: 600, cursor: sending ? "not-allowed" : "pointer",
              }}
            >
              <Send size={14} /> {sending ? "Sending…" : "Send WhatsApp Now"}
            </button>
          </div>
        </div>

        {sentOk === true && <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#15803d", fontSize: 13, fontWeight: 600 }}>✅ WhatsApp report sent to Prajakta & Sanket!</div>}
        {sentOk === false && <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#dc2626", fontSize: 13, fontWeight: 600 }}>❌ WhatsApp send failed. Check phone numbers in environment variables.</div>}

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
        <div style={{
          display: "flex", gap: 4, marginBottom: 20, overflowX: "auto",
          background: "#f1f5f9", borderRadius: 10, padding: 4,
        }}>
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: tab === t.id ? "#fff" : "transparent",
                color: tab === t.id ? "#1e293b" : "#64748b",
                fontWeight: tab === t.id ? 700 : 500,
                fontSize: 13, cursor: "pointer",
                boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Daily Schedule Tab ── */}
        {tab === "daily" && (
          <div>
            {urgentItems.length > 0 && (
              <div style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: 12,
                padding: "16px 18px",
                marginBottom: 20,
              }}>
                <div style={{ fontWeight: 700, color: "#ef4444", fontSize: 15, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={16} /> {urgentItems.length} Urgent Items — Act Now
                </div>
                {urgentItems.map(item => (
                  <ActionCard
                    key={item.id}
                    item={item}
                    onNavigate={navigate}
                    tags={tags}
                    selectedTagId={cardTags[item.id]}
                    onTagChange={updateCardTag}
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
                  <DepartmentSection
                    key={dept}
                    title={cfg.label}
                    icon={cfg.icon}
                    color={cfg.color}
                    items={deptItems}
                    onNavigate={navigate}
                    tags={tags}
                    cardTags={cardTags}
                    onTagChange={updateCardTag}
                  />
                );
              })}
            </div>

            {/* ── Industry Standard Reports box ── */}
            <div style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "20px 24px",
              marginTop: 24,
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1e293b", marginBottom: 14 }}>
                📈 Industry Standard Reports (Recommended)
              </div>
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
                  <div key={r.title} style={{
                    background: "#fff",
                    border: "1px solid #e2e8f0",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>{r.title}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginBottom: 6 }}>{r.desc}</div>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      padding: "2px 6px", borderRadius: 4,
                      background: "#e0e7ff", color: "#4338ca",
                    }}>{r.dept}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Suggestions ── */}
            <div style={{
              background: "linear-gradient(135deg, #f0fdf4, #ecfdf5)",
              border: "1px solid #bbf7d0",
              borderRadius: 12,
              padding: "20px 24px",
              marginTop: 16,
            }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#15803d", marginBottom: 14 }}>
                💡 Process Improvement Suggestions
              </div>
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
          <DepartmentSection title="Accounts" icon={DEPT_CONFIG.ACCOUNTS.icon} color={DEPT_CONFIG.ACCOUNTS.color} items={report.accounts} onNavigate={navigate} tags={tags} cardTags={cardTags} onTagChange={updateCardTag} />
        )}
        {tab === "production" && (
          <DepartmentSection title="Production" icon={DEPT_CONFIG.PRODUCTION.icon} color={DEPT_CONFIG.PRODUCTION.color} items={report.production} onNavigate={navigate} tags={tags} cardTags={cardTags} onTagChange={updateCardTag} />
        )}
        {tab === "dispatch" && (
          <DepartmentSection title="Dispatch" icon={DEPT_CONFIG.DISPATCH.icon} color={DEPT_CONFIG.DISPATCH.color} items={report.dispatch} onNavigate={navigate} tags={tags} cardTags={cardTags} onTagChange={updateCardTag} />
        )}
        {tab === "stock" && (
          <DepartmentSection title="Stock & Costs" icon={DEPT_CONFIG.STOCK.icon} color={DEPT_CONFIG.STOCK.color} items={report.stock} onNavigate={navigate} tags={tags} cardTags={cardTags} onTagChange={updateCardTag} />
        )}

      </div>
    </DashboardShell>
  );
}
