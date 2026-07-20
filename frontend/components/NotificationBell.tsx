"use client";

import { MouseEvent as ReactMouseEvent, useEffect, useRef, useState } from "react";
import { Bell, X, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL ?? "https://rareprint-erp-production.up.railway.app";
const AUTH_KEY = "rareprint_token";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_KEY);
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  orderNo?: string;
  itemId?: string;
  sheetId?: string;
  jobWorkId?: string;
  priority: string;
  isRead: boolean;
  isResolved: boolean;
  explanation?: string;
  actionTaken?: string;
  copyToAdmin: boolean;
  createdAt: string;
  productDetails?: ProductDetails;
  productItems?: ProductDetails[];
}

interface ProductDetails {
    itemId?: string;
    productName?: string;
    sku?: string;
    quantity?: number;
    size?: string | null;
    openSize?: string | null;
    gsm?: number | string | null;
    sides?: string | null;
    printingType?: string | null;
    productionCategory?: string | null;
    itemProductionStage?: string | null;
    artworkNotes?: string | null;
    productionNotes?: string | null;
    customerName?: string | null;
    customerPhone?: string | null;
    salesAgentName?: string | null;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function priorityColor(priority: string) {
  if (priority === "URGENT") return "#ef4444";
  if (priority === "HIGH") return "#f59e0b";
  return "#64748b";
}

function priorityLabel(priority: string) {
  if (priority === "URGENT") return "🔴 URGENT";
  if (priority === "HIGH") return "🟡 HIGH";
  return "⚪ NORMAL";
}

export function NotificationBell({ userRole }: { userRole: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"mine" | "admin" | "prajakta">("mine");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [adminNotifs, setAdminNotifs] = useState<Notification[]>([]);
  const [prajaktaNotifs, setPrajaktaNotifs] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const cRes = await fetch(`${API}/notifications/unread-count`, { headers: { Authorization: `Bearer ${token}` } });
      if (cRes.ok) { const d = await cRes.json(); setUnreadCount(Number(d?.count) || 0); }
    } catch {}
  };

  const fetchNotifications = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const nRes = await fetch(`${API}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
      if (nRes.ok) setNotifications(asArray<Notification>(await nRes.json()));
      await fetchUnreadCount();
    } catch {}
  };

  const fetchAdminNotifs = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/notifications/admin`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setAdminNotifs(asArray<Notification>(await res.json()));
    } catch {}
  };

  const fetchPrajaktaNotifs = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/notifications/user-view?email=prajakta.rareprint@gmail.com`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPrajaktaNotifs(asArray<Notification>(await res.json()));
    } catch {}
  };

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetchNotifications();
    if (userRole === "ADMIN" && tab === "admin") fetchAdminNotifs();
    if (userRole === "ADMIN" && tab === "prajakta") fetchPrajaktaNotifs();
  }, [open, tab]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const doAction = async (id: string, action: string) => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      await fetch(`${API}/notifications/${id}/resolve`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ actionTaken: action }),
      });
      await fetchNotifications();
    } finally { setLoading(false); }
  };

  const doExplain = async (id: string) => {
    const token = getToken();
    const explanation = commentText[id];
    if (!token || !explanation?.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API}/notifications/${id}/explain`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ explanation }),
      });
      setCommentText(prev => ({ ...prev, [id]: "" }));
      await fetchNotifications();
    } finally { setLoading(false); }
  };

  const doEscalate = async (id: string) => {
    const token = getToken();
    if (!token) return;
    await fetch(`${API}/notifications/${id}/escalate`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    await fetchNotifications();
  };

  const doAskDesign = async (itemId: string, notifId: string) => {
    const token = getToken();
    if (!token) return;
    await fetch(`${API}/notifications/ask-design/${itemId}`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` },
    });
    await doAction(notifId, "ASK_DESIGN_SENT");
  };

  const markAllRead = async () => {
    const token = getToken();
    if (!token) return;
    await fetch(`${API}/notifications/mark-all-read`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const getButtons = (n: Notification) => {
    const type = n.type;
    if (n.isResolved) return null;

    const btn = (label: string, action: string, color = "#ee1c25") => (
      <button key={action} onClick={() => doAction(n.id, action)} style={{
        padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
        background: color, color: "white", fontSize: "11px", fontWeight: 600,
      }}>{label}</button>
    );

    const escalateBtn = (
      <button key="escalate" onClick={() => doEscalate(n.id)} style={{
        padding: "4px 10px", borderRadius: "6px", border: "1px solid #f59e0b",
        cursor: "pointer", background: "transparent", color: "#f59e0b", fontSize: "11px", fontWeight: 600,
      }}>⚠️ Send to Admin</button>
    );

    if (type === "PRODUCTION_UNASSIGNED") return <>{btn("✅ Assign Now", "ASSIGNED")}{escalateBtn}</>;
    if (type === "INHOUSE_DESIGN_NOT_STARTED") return <>{btn("▶️ Start Printing", "STARTED")}{btn("💬 Problem", "COMMENTED", "#64748b")}</>;
    if (type === "INHOUSE_DESIGN_MISSING") return (
      <button onClick={() => n.itemId && doAskDesign(n.itemId, n.id)} style={{
        padding: "4px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
        background: "#7c3aed", color: "white", fontSize: "11px", fontWeight: 600,
      }}>📤 Ask for Design</button>
    );
    if (type === "INHOUSE_PRINTING_STUCK") return <>{btn("🔄 Move to Processing", "MOVED_PROCESSING", "#059669")}{escalateBtn}</>;
    if (type === "INHOUSE_PROCESSING_STUCK") return <>{btn("✅ Mark Ready", "MARKED_READY", "#059669")}{escalateBtn}</>;
    if (type === "CLUBBING_VENDOR_NOT_ASSIGNED") return <>{btn("🏭 Assign Vendor", "VENDOR_ASSIGNED")}{escalateBtn}</>;
    if (type === "CLUBBING_DUE_DATE_MISSING") return btn("📅 Set Due Date", "DUE_DATE_SET", "#0891b2");
    if (type === "CLUBBING_FOLLOW_UP") return <>{btn("✅ On Time", "FOLLOW_UP_ON_TIME", "#059669")}{btn("⏰ Delayed", "FOLLOW_UP_DELAYED", "#dc2626")}</>;
    if (type === "CLUBBING_OVERDUE") return <>{btn("💬 Show Cause", "SHOW_CAUSE", "#64748b")}{btn("✅ Mark Received", "MARKED_RECEIVED", "#059669")}</>;
    if (type === "SHEET_NOT_ASSIGNED") return <>{btn("📋 Assign to Sheet", "SHEET_ASSIGNED")}{escalateBtn}</>;
    if (type === "SHEET_COMPLETE_STUCK") return <>{btn("▶️ Move to Printing", "MOVED_PRINTING", "#059669")}{escalateBtn}</>;
    if (type === "SHEET_PRINTING_STUCK") return <>{btn("💬 Show Cause", "SHOW_CAUSE", "#64748b")}{btn("🔄 Move to Processing", "MOVED_PROCESSING", "#059669")}</>;
    if (type === "SHEET_PROCESSING_DUE_DATE_MISSING") return btn("📅 Set Due Date", "DUE_DATE_SET", "#0891b2");
    if (type === "SHEET_PROCESSING_FOLLOW_UP") return <>{btn("✅ On Time", "FOLLOW_UP_ON_TIME", "#059669")}{btn("⏰ Delayed", "FOLLOW_UP_DELAYED", "#dc2626")}</>;
    if (type === "SHEET_PROCESSING_OVERDUE") return <>{btn("💬 Show Cause", "SHOW_CAUSE", "#64748b")}{btn("✅ Mark Ready", "MARKED_READY", "#059669")}</>;
    if (type === "DESIGN_UPLOAD_REQUEST") return btn("✅ Design Uploaded", "DESIGN_UPLOADED", "#059669");
    return btn("✅ Resolve", "RESOLVED");
  };

  const displayList = tab === "admin" ? adminNotifs : tab === "prajakta" ? prajaktaNotifs : notifications;
  const prajaktaPending = prajaktaNotifs.filter(n => !n.isResolved).length;
  const prajaktaResolved = prajaktaNotifs.filter(n => n.isResolved).length;

  const productionTabFor = (type: string) => {
    if (type.includes("CLUBBING")) return "clubbing";
    if (type.includes("SHEET")) return "sheets";
    if (type.includes("INHOUSE")) return "inhouse";
    return "all";
  };

  const openLinkedProduct = (n: Notification) => {
    if (!n.orderNo && !n.itemId && !n.sheetId) return;
    const params = new URLSearchParams();
    params.set("tab", productionTabFor(n.type));
    if (n.orderNo) params.set("order", n.orderNo);
    if (n.itemId) params.set("item", n.itemId);
    if (n.sheetId) params.set("sheet", n.sheetId);
    setOpen(false);
    router.push(`/production?${params.toString()}`);
  };

  const handleCardClick = (event: ReactMouseEvent<HTMLDivElement>, n: Notification) => {
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest("input") || target.closest("a")) return;
    openLinkedProduct(n);
  };

  const renderProductDetails = (item: ProductDetails, highlighted = false) => (
    <div key={item.itemId || item.sku || item.productName} style={{
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 10px",
      padding: "8px", border: highlighted ? "1px solid #93c5fd" : "1px solid #e2e8f0",
      borderRadius: "8px", background: highlighted ? "#eff6ff" : "#f8fafc",
      fontSize: "11px", color: "#334155",
    }}>
      <div style={{ gridColumn: "1 / -1", fontWeight: 800, color: "#0f172a", fontSize: "12px" }}>
        {item.productName || "Product"}{item.sku ? ` · ${item.sku}` : ""}
      </div>
      <div><strong>Qty:</strong> {item.quantity ?? "-"}</div>
      <div><strong>Size:</strong> {item.size || "-"}</div>
      <div><strong>GSM:</strong> {item.gsm || "-"}</div>
      <div><strong>Sides:</strong> {String(item.sides || "-").replace(/_/g, " ")}</div>
      <div><strong>Stage:</strong> {String(item.itemProductionStage || "-").replace(/_/g, " ")}</div>
      <div><strong>Agent:</strong> {item.salesAgentName || "-"}</div>
      {item.productionNotes && (
        <div style={{ gridColumn: "1 / -1" }}><strong>Production:</strong> {item.productionNotes}</div>
      )}
      {item.artworkNotes && (
        <div style={{ gridColumn: "1 / -1" }}><strong>Artwork:</strong> {item.artworkNotes}</div>
      )}
    </div>
  );

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      {/* Bell Button */}
      <button onClick={() => setOpen(o => !o)} style={{
        position: "relative", background: "transparent", border: "none",
        cursor: "pointer", color: "#93c5fd", padding: "6px", borderRadius: "8px",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Bell size={20} />
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: "0px", right: "0px",
            background: "#ef4444", color: "white", borderRadius: "50%",
            width: "16px", height: "16px", fontSize: "9px", fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: "fixed", top: "56px", right: "10px", width: "480px", maxWidth: "calc(100vw - 24px)", maxHeight: "calc(100vh - 66px)",
          background: "white", borderRadius: "14px", boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
          display: "flex", flexDirection: "column", zIndex: 9999, overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#1e293b" }}>🔔 Notifications</span>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ fontSize: "11px", color: "#ee1c25", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>
                  Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b" }}><X size={16} /></button>
            </div>
          </div>

          {/* Tabs (admin only) */}
          {userRole === "ADMIN" && (
            <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0" }}>
              {(["mine", "admin", "prajakta"] as const).map(t => {
                const label = t === "mine" ? "My Notifications" : t === "admin" ? "Escalated" : "Prajakta";
                const isActive = tab === t;
                return (
                  <button key={t} onClick={() => setTab(t)} style={{
                    flex: 1, padding: "8px 4px", fontSize: "11px", fontWeight: 600, border: "none", cursor: "pointer",
                    background: isActive ? "#fef1f1" : "transparent",
                    color: isActive ? "#ee1c25" : "#64748b",
                    borderBottom: isActive ? "2px solid #ee1c25" : "2px solid transparent",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                  }}>
                    {label}
                    {t === "prajakta" && prajaktaNotifs.length > 0 && (
                      <span style={{
                        background: prajaktaPending > 0 ? "#ef4444" : "#22c55e",
                        color: "white", borderRadius: "999px", padding: "0 5px",
                        fontSize: "9px", fontWeight: 700, lineHeight: "16px",
                      }}>{prajaktaPending > 0 ? prajaktaPending : "✓"}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Prajakta summary bar */}
          {tab === "prajakta" && (
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "7px 14px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0",
              fontSize: "11px", fontWeight: 600, gap: "8px",
            }}>
              <div style={{ display: "flex", gap: "12px" }}>
                <span style={{ color: "#ef4444" }}>🔴 Pending: {prajaktaPending}</span>
                <span style={{ color: "#059669" }}>✅ Resolved: {prajaktaResolved}</span>
                <span style={{ color: "#64748b" }}>Total: {prajaktaNotifs.length}</span>
              </div>
              <button onClick={async () => {
                const token = getToken();
                if (!token) return;
                await fetch(`${API}/notifications/auto-resolve`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                await fetchPrajaktaNotifs();
              }} style={{
                padding: "3px 10px", borderRadius: "6px", border: "1px solid #a5b4fc",
                background: "#eef2ff", color: "#4338ca", fontSize: "10px", fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap",
              }}>⚡ Clear Resolved</button>
            </div>
          )}

          {/* List */}
          <div style={{ overflowY: "auto", flex: 1 }}>
            {displayList.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                ✅ All clear — no notifications
              </div>
            ) : displayList.map(n => (
              <div key={n.id} onClick={(event) => handleCardClick(event, n)} title="Open linked product in Production" style={{
                padding: "12px 14px", borderBottom: "1px solid #f1f5f9",
                background: n.isRead ? "white" : "#f8faff",
                opacity: n.isResolved ? 0.6 : 1,
                cursor: n.orderNo || n.itemId || n.sheetId ? "pointer" : "default",
              }}>
                {/* Priority + Title */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "10px", fontWeight: 700, color: priorityColor(n.priority) }}>
                        {priorityLabel(n.priority)}
                      </span>
                      {tab === "prajakta" && (
                        <span style={{
                          fontSize: "10px", fontWeight: 700, padding: "1px 7px", borderRadius: "999px",
                          background: n.isResolved ? "#dcfce7" : "#fee2e2",
                          color: n.isResolved ? "#15803d" : "#dc2626",
                          border: `1px solid ${n.isResolved ? "#86efac" : "#fca5a5"}`,
                        }}>
                          {n.isResolved ? "✅ Resolved" : "🔴 Pending"}
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: "13px", color: "#1e293b", marginTop: "2px" }}>
                      {n.title}
                    </div>
                  </div>
                  <span style={{ fontSize: "10px", color: "#94a3b8", whiteSpace: "nowrap", marginLeft: "8px" }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </div>

                {/* Order No */}
                {n.orderNo && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "11px", color: "#2563eb", fontWeight: 600, marginBottom: "4px" }}>
                    <span>📋 {n.orderNo}</span>
                    <button onClick={() => openLinkedProduct(n)} style={{
                      border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1d4ed8",
                      borderRadius: "999px", padding: "2px 8px", fontSize: "10px", fontWeight: 700,
                      cursor: "pointer",
                    }}>Open</button>
                  </div>
                )}

                {/* Message */}
                <div style={{ fontSize: "12px", color: "#475569", lineHeight: 1.4, marginBottom: "8px" }}>
                  {n.message}
                </div>

                {/* Product Details */}
                {(n.productItems?.length || n.productDetails) && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "8px" }}>
                    {(Array.isArray(n.productItems) && n.productItems.length ? n.productItems : n.productDetails ? [n.productDetails] : []).map(item =>
                      renderProductDetails(item, Boolean(n.itemId && item.itemId === n.itemId))
                    )}
                  </div>
                )}

                {/* Resolved badge */}
                {n.isResolved && (
                  <div style={{
                    fontSize: "11px", color: "#059669", fontWeight: 600, marginBottom: "6px",
                    padding: "5px 8px", background: "#f0fdf4", borderRadius: "6px",
                    border: "1px solid #bbf7d0",
                  }}>
                    ✅ Resolved — Action: <strong>{n.actionTaken ?? "—"}</strong>
                    {(n as any).resolvedAt && (
                      <span style={{ color: "#64748b", fontWeight: 400, marginLeft: "6px" }}>
                        ({new Date((n as any).resolvedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })})
                      </span>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {!n.isResolved && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "6px" }}>
                    {getButtons(n)}
                  </div>
                )}

                {/* Comment box toggle */}
                {!n.isResolved && (
                  <div>
                    <button onClick={() => setExpandedId(expandedId === n.id ? null : n.id)} style={{
                      fontSize: "11px", color: "#64748b", background: "none", border: "none",
                      cursor: "pointer", display: "flex", alignItems: "center", gap: "3px", padding: 0,
                    }}>
                      <ChevronRight size={12} style={{ transform: expandedId === n.id ? "rotate(90deg)" : "none", transition: "0.2s" }} />
                      Add explanation
                    </button>
                    {expandedId === n.id && (
                      <div style={{ marginTop: "6px", display: "flex", gap: "6px" }}>
                        <input
                          value={commentText[n.id] ?? ""}
                          onChange={e => setCommentText(prev => ({ ...prev, [n.id]: e.target.value }))}
                          placeholder="Write explanation..."
                          style={{
                            flex: 1, padding: "6px 8px", borderRadius: "6px", border: "1px solid #e2e8f0",
                            fontSize: "12px", outline: "none",
                          }}
                        />
                        <button onClick={() => doExplain(n.id)} style={{
                          padding: "6px 10px", borderRadius: "6px", background: "#1e3a5f",
                          color: "white", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 600,
                        }}>Send</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Existing explanation */}
                {n.explanation && (
                  <div style={{ marginTop: "6px", padding: "6px 8px", background: "#fef9c3", borderRadius: "6px", fontSize: "11px", color: "#92400e" }}>
                    💬 {n.explanation}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
