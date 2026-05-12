"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Users, Trophy, TrendingUp, Plus, Trash2, Eye, EyeOff } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://rareprint-erp-production.up.railway.app";

export default function AdminSalesLearningPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const getToken = () => typeof window !== "undefined" ? localStorage.getItem("rareprint_token") : null;

  useEffect(() => {
    const fetchTopics = async () => {
      const token = getToken();
      if (!token) { router.push("/login"); return; }
      try {
        const res = await fetch(`${API}/sales-learning/topics`, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        setTopics(data.topics || []);
      } catch {}
      finally { setLoading(false); }
    };
    fetchTopics();
  }, [router]);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
          <div style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", borderRadius: 10, padding: 10 }}>
            <BookOpen size={24} color="white" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Sales Academy Admin</h1>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Manage topics and view analytics</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
          {[
            { label: "Total Topics", value: topics.length, icon: <BookOpen size={20} color="#3b82f6" /> },
            { label: "Active Topics", value: topics.filter(t => t.isActive).length, icon: <Eye size={20} color="#22c55e" /> },
            { label: "Groups", value: Math.max(...(topics.map(t => t.groupNumber).concat([0]))), icon: <Trophy size={20} color="#eab308" /> },
          ].map((stat, i) => (
            <div key={i} style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: "20px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>{stat.icon}<span style={{ fontSize: 13, color: "#64748b" }}>{stat.label}</span></div>
              <div style={{ fontSize: 28, fontWeight: 800 }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>All Topics ({topics.length})</h2>
            <span style={{ fontSize: 12, color: "#64748b" }}>Topics are seeded via the backend seed script</span>
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>Loading...</div>
          ) : (
            <div>
              {topics.map((topic, idx) => (
                <div key={topic.id} style={{ padding: "14px 24px", borderBottom: "1px solid #1e293b", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#64748b", flexShrink: 0 }}>{topic.orderIndex}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{topic.titleEn}</div>
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{topic.sourceBook}  Group {topic.groupNumber}  {topic.difficulty}</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: topic.isActive ? "#14532d" : "#1e293b", color: topic.isActive ? "#86efac" : "#64748b" }}>
                    {topic.isActive ? "ACTIVE" : "INACTIVE"}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b" }}>{topic.questions?.length || 0} Qs</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
