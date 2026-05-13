"use client";
import { useState, useEffect } from "react";
import { Users, BookOpen, CheckCircle, Flame, Trophy, TrendingUp, RefreshCw, BarChart2, Target } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://rareprint-erp-production.up.railway.app";
const AUTH_TOKEN_KEY = "rareprint_token";

interface Analytics {
  summary: { totalUsers: number; activeToday: number; totalCompletions: number };
  topicStats: { id: string; titleEn: string; orderIndex: number; completions: number; totalAttempts: number }[];
  leaderboard: { id: string; name: string; completedTopics: number; lastActiveDate: string | null; streak: number }[];
  dailyActivity: { date: string; _sum: { topicsRead: number; quizzesDone: number } }[];
}

function getToken() { return typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null; }

export default function SalesLearningAdminPage() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "topics" | "leaderboard">("overview");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  async function fetchAnalytics() {
    setLoading(true);
    try {
      const res = await fetch(`${API}/sales-learning/admin/analytics`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAnalytics(); }, []);

  const cardStyle = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 22px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" };
  const tabStyle = (active: boolean) => ({ padding: "8px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: active ? "#0f172a" : "transparent", color: active ? "#fff" : "#64748b", transition: "all 0.15s" });

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif" }}>
      <div style={{ textAlign: "center", color: "#94a3b8" }}>
        <RefreshCw size={32} style={{ marginBottom: 12, animation: "spin 1s linear infinite" }} />
        <div>Loading analytics...</div>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,sans-serif", color: "#ef4444" }}>
      Failed to load analytics. Check backend connection.
    </div>
  );

  const { summary, topicStats, leaderboard, dailyActivity } = data;
  const completionRate = topicStats.length > 0 ? Math.round((summary.totalCompletions / (topicStats.length * Math.max(summary.totalUsers, 1))) * 100) : 0;
  const last7Days = dailyActivity.slice(0, 7).reverse();
  const maxActivity = Math.max(...last7Days.map(d => (d._sum?.topicsRead || 0) + (d._sum?.quizzesDone || 0)), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui,sans-serif", color: "#1e293b" }}>
      {/* Header */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "14px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <BarChart2 size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: "#0f172a" }}>Sales Academy — Admin Dashboard</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Last refreshed: {lastRefresh.toLocaleTimeString()}</div>
          </div>
        </div>
        <button onClick={fetchAnalytics} style={{ display: "flex", alignItems: "center", gap: 8, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13, fontWeight: 500, color: "#64748b" }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ padding: "24px 28px", maxWidth: 1300, margin: "0 auto" }}>
        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Users", value: summary.totalUsers, icon: Users, color: "#3b82f6", bg: "#eff6ff" },
            { label: "Active Today", value: summary.activeToday, icon: Flame, color: "#f59e0b", bg: "#fffbeb" },
            { label: "Topics Completed", value: summary.totalCompletions, icon: CheckCircle, color: "#22c55e", bg: "#f0fdf4" },
            { label: "Completion Rate", value: `${completionRate}%`, icon: TrendingUp, color: "#8b5cf6", bg: "#faf5ff" },
          ].map(card => (
            <div key={card.label} style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>{card.label}</div>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: card.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <card.icon size={18} color={card.color} />
                </div>
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: "#0f172a" }}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#f1f5f9", padding: 4, borderRadius: 10, width: "fit-content" }}>
          {(["overview", "topics", "leaderboard"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={tabStyle(tab === t)}>
              {t === "overview" ? "📊 Overview" : t === "topics" ? "📚 Topics" : "🏆 Leaderboard"}
            </button>
          ))}
        </div>

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Daily Activity Chart */}
            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 20 }}>📈 Daily Activity (Last 7 Days)</div>
              {last7Days.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>No activity data yet</div>
              ) : (
                <div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, marginBottom: 8 }}>
                    {last7Days.map((day, i) => {
                      const reads = day._sum?.topicsRead || 0;
                      const quizzes = day._sum?.quizzesDone || 0;
                      const total = reads + quizzes;
                      const h = Math.round((total / maxActivity) * 120);
                      return (
                        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{total}</div>
                          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 1 }}>
                            <div style={{ width: "100%", height: Math.round((reads / maxActivity) * 120), background: "#3b82f6", borderRadius: "4px 4px 0 0", minHeight: reads > 0 ? 4 : 0 }} />
                            <div style={{ width: "100%", height: Math.round((quizzes / maxActivity) * 120), background: "#f59e0b", minHeight: quizzes > 0 ? 4 : 0 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    {last7Days.map((day, i) => (
                      <div key={i} style={{ flex: 1, fontSize: 10, color: "#94a3b8", textAlign: "center" }}>
                        {new Date(day.date).toLocaleDateString("en", { weekday: "short" })}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}><div style={{ width: 12, height: 12, background: "#3b82f6", borderRadius: 3 }} /> Topics Read</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#64748b" }}><div style={{ width: 12, height: 12, background: "#f59e0b", borderRadius: 3 }} /> Quizzes Done</div>
                  </div>
                </div>
              )}
            </div>

            {/* Active Users Today */}
            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 20 }}>🔥 Active Users Today</div>
              {leaderboard.filter(u => {
                if (!u.lastActiveDate) return false;
                const today = new Date(); today.setHours(0, 0, 0, 0);
                return new Date(u.lastActiveDate) >= today;
              }).length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>😴</div>
                  No activity today yet
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {leaderboard.filter(u => {
                    if (!u.lastActiveDate) return false;
                    const today = new Date(); today.setHours(0, 0, 0, 0);
                    return new Date(u.lastActiveDate) >= today;
                  }).map(u => (
                    <div key={u.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, color: "#1d4ed8" }}>
                          {u.name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#0f172a" }}>{u.name || "Unknown"}</div>
                          {u.streak > 0 && <div style={{ fontSize: 11, color: "#f59e0b", display: "flex", alignItems: "center", gap: 3 }}><Flame size={11} />{u.streak} day streak</div>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: "#22c55e" }}>{u.completedTopics}</div>
                        <div style={{ fontSize: 10, color: "#94a3b8" }}>topics done</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Who has completed the most */}
            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 20 }}>📊 Overall Progress Distribution</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[
                  { label: "Completed 0 topics", count: leaderboard.filter(u => u.completedTopics === 0).length, color: "#e2e8f0", text: "#94a3b8" },
                  { label: "Completed 1–10 topics", count: leaderboard.filter(u => u.completedTopics >= 1 && u.completedTopics <= 10).length, color: "#bfdbfe", text: "#1d4ed8" },
                  { label: "Completed 11–25 topics", count: leaderboard.filter(u => u.completedTopics >= 11 && u.completedTopics <= 25).length, color: "#86efac", text: "#15803d" },
                  { label: "Completed 26–50 topics", count: leaderboard.filter(u => u.completedTopics >= 26 && u.completedTopics <= 50).length, color: "#fcd34d", text: "#b45309" },
                  { label: "Completed 50+ topics", count: leaderboard.filter(u => u.completedTopics > 50).length, color: "#fca5a5", text: "#dc2626" },
                ].map(row => (
                  <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 130, fontSize: 12, color: "#64748b", flexShrink: 0 }}>{row.label}</div>
                    <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 99, height: 20, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min((row.count / Math.max(leaderboard.length, 1)) * 100, 100)}%`, background: row.color, borderRadius: 99, transition: "width 0.5s" }} />
                    </div>
                    <div style={{ width: 24, fontSize: 13, fontWeight: 700, color: row.text, textAlign: "right" }}>{row.count}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Topic funnel */}
            <div style={cardStyle}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 20 }}>🎯 Topic Completion Funnel (Top 10)</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {topicStats.slice(0, 10).map(t => {
                  const pct = Math.round((t.completions / Math.max(summary.totalUsers, 1)) * 100);
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 22, fontSize: 11, fontWeight: 700, color: "#94a3b8", flexShrink: 0, textAlign: "right" }}>{t.orderIndex}</div>
                      <div style={{ flex: 1, background: "#f1f5f9", borderRadius: 99, height: 18, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: pct > 50 ? "#86efac" : pct > 20 ? "#fcd34d" : "#bfdbfe", borderRadius: 99, transition: "width 0.5s" }} />
                      </div>
                      <div style={{ width: 36, fontSize: 11, fontWeight: 700, color: "#64748b", textAlign: "right" }}>{pct}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TOPICS TAB */}
        {tab === "topics" && (
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 16 }}>📚 All Topics — Completion Stats</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                    {["#", "Topic", "Completions", "Quiz Attempts", "Pass Rate", "Status"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.8 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {topicStats.map((t, i) => {
                    const passRate = t.totalAttempts > 0 ? Math.round((t.completions / t.totalAttempts) * 100) : 0;
                    const pct = Math.round((t.completions / Math.max(summary.totalUsers, 1)) * 100);
                    return (
                      <tr key={t.id} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                        <td style={{ padding: "10px 12px", color: "#94a3b8", fontWeight: 600 }}>{t.orderIndex}</td>
                        <td style={{ padding: "10px 12px", fontWeight: 500, color: "#0f172a", maxWidth: 300 }}>{t.titleEn}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ width: 60, background: "#f1f5f9", borderRadius: 99, height: 6, overflow: "hidden" }}>
                              <div style={{ height: "100%", width: `${pct}%`, background: "#22c55e", borderRadius: 99 }} />
                            </div>
                            <span style={{ fontWeight: 700, color: "#22c55e" }}>{t.completions}</span>
                            <span style={{ color: "#94a3b8", fontSize: 11 }}>({pct}%)</span>
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#64748b" }}>{t.totalAttempts}</td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontWeight: 700, color: passRate > 60 ? "#16a34a" : passRate > 30 ? "#b45309" : "#dc2626" }}>{passRate}%</span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 4, background: t.completions === 0 ? "#f1f5f9" : pct > 50 ? "#f0fdf4" : "#fffbeb", color: t.completions === 0 ? "#94a3b8" : pct > 50 ? "#15803d" : "#b45309" }}>
                            {t.completions === 0 ? "No completions" : pct > 50 ? "High adoption" : "In progress"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LEADERBOARD TAB */}
        {tab === "leaderboard" && (
          <div style={cardStyle}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 16 }}>🏆 User Leaderboard — All Time</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {leaderboard.length === 0 ? (
                <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>No users have started learning yet</div>
              ) : leaderboard.map((u, i) => {
                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
                const lastActive = u.lastActiveDate ? new Date(u.lastActiveDate).toLocaleDateString("en", { day: "numeric", month: "short" }) : "Never";
                const pct = Math.round((u.completedTopics / 100) * 100);
                return (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", background: i < 3 ? "#fffbeb" : "#f8fafc", border: `1px solid ${i < 3 ? "#fcd34d" : "#e2e8f0"}`, borderRadius: 10 }}>
                    <div style={{ width: 32, fontSize: 18, textAlign: "center", flexShrink: 0 }}>{medal || <span style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8" }}>#{i + 1}</span>}</div>
                    <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#dbeafe", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: "#1d4ed8", flexShrink: 0 }}>
                      {u.name?.charAt(0)?.toUpperCase() || "?"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#0f172a", marginBottom: 4 }}>{u.name || "Unknown User"}</div>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ flex: 1, background: "#e2e8f0", borderRadius: 99, height: 6, overflow: "hidden", maxWidth: 200 }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,#f59e0b,#ef4444)", borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 11, color: "#94a3b8" }}>Last active: {lastActive}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{u.completedTopics}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8" }}>/ 100 topics</div>
                    </div>
                    {u.streak > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#f59e0b", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                        <Flame size={16} />{u.streak}d
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}