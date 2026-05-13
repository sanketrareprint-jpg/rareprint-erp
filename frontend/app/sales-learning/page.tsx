"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, CheckCircle, Lock, ChevronRight, RotateCcw, Globe, XCircle, Flame, Star } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://rareprint-erp-production.up.railway.app";
const AUTH_TOKEN_KEY = "rareprint_token";

interface Question {
  id: string;
  questionEn: string;
  questionHi: string;
  options: any;
  correctIndex: number;
  explanationEn?: string;
  explanationHi?: string;
}
interface Topic {
  id: string;
  orderIndex: number;
  groupNumber: number;
  titleEn: string;
  titleHi: string;
  sourceBook: string;
  difficulty: string;
  estimatedMins: number;
  contentEn: string;
  contentHi: string;
  scriptEn: string;
  scriptHi: string;
  keyPoints: any;
  questions: Question[];
  isLocked?: boolean;
  isCompleted?: boolean;
}
type Phase = "list" | "read" | "quiz" | "result";
type Lang = "en" | "hi";

const DIFF: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BEGINNER:     { label: "Beginner",     color: "#15803d", bg: "#f0fdf4", border: "#86efac" },
  INTERMEDIATE: { label: "Intermediate", color: "#b45309", bg: "#fffbeb", border: "#fcd34d" },
  ADVANCED:     { label: "Advanced",     color: "#b91c1c", bg: "#fef2f2", border: "#fca5a5" },
  PRO:          { label: "Pro",          color: "#7c3aed", bg: "#faf5ff", border: "#c4b5fd" },
};

function getToken() { return typeof window !== "undefined" ? localStorage.getItem(AUTH_TOKEN_KEY) : null; }
function getUser() { if (typeof window === "undefined") return null; try { return JSON.parse(localStorage.getItem("rareprint_user") || "null"); } catch { return null; } }
function getOpts(q: Question, lang: Lang): string[] {
  const o = q.options;
  if (!o) return [];
  if (Array.isArray(o)) return o;
  if (typeof o === "object") return o[lang] || o["en"] || [];
  if (typeof o === "string") { try { const p = JSON.parse(o); return p[lang] || p["en"] || p || []; } catch { return []; } }
  return [];
}

export default function SalesLearningPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<Topic[]>([]);
  const [progress, setProgress] = useState<Record<string, any>>({});
  const [streak, setStreak] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("list");
  const [lang, setLang] = useState<Lang>("en");
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<"idle" | "correct" | "wrong">("idle");
  const [quizScore, setQuizScore] = useState(0);

  const fetchTopics = useCallback(async () => {
    const token = getToken(); const user = getUser();
    if (!token || !user) { router.push("/login"); return; }
    try {
      const res = await fetch(`${API}/sales-learning/topics`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTopics((data.topics || []).map((t: any) => ({ ...t, questions: (t.questions || []) })));
      setProgress(data.progress || {}); setStreak(data.streak || 0); setTotalPoints(data.totalPoints || 0);
    } catch { } finally { setLoading(false); }
  }, [router]);

  useEffect(() => { fetchTopics(); }, [fetchTopics]);

  const completedCount = Object.values(progress).filter((p: any) => p.quizPassed).length;
  const pct = topics.length ? Math.round((completedCount / topics.length) * 100) : 0;

  const handleAnswer = (idx: number) => {
    if (answerState !== "idle" || !currentTopic) return;
    setSelectedAnswer(idx);
    setAnswerState(idx === currentTopic.questions[currentQ].correctIndex ? "correct" : "wrong");
    if (idx === currentTopic.questions[currentQ].correctIndex) setQuizScore(s => s + 1);
  };

  const nextAfterAnswer = async () => {
    if (!currentTopic) return;
    if (answerState === "wrong") { setCurrentQ(0); setSelectedAnswer(null); setAnswerState("idle"); setQuizScore(0); return; }
    if (currentQ < currentTopic.questions.length - 1) { setCurrentQ(q => q + 1); setSelectedAnswer(null); setAnswerState("idle"); }
    else {
      const token = getToken();
      try { await fetch(`${API}/sales-learning/topics/${currentTopic.id}/complete`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ score: quizScore + 1, totalQuestions: currentTopic.questions.length }) }); await fetchTopics(); } catch { }
      setPhase("result");
    }
  };

  const langBtn = (
    <button onClick={() => setLang(lang === "en" ? "hi" : "en")}
      style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "6px 14px", color: "#64748b", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 6, fontWeight: 500 }}>
      <Globe size={13} />{lang === "en" ? "हिंदी" : "English"}
    </button>
  );

  // ── LIST ─────────────────────────────────────────────────
  if (phase === "list") {
    const grouped: Record<number, Topic[]> = {};
    topics.forEach(t => { if (!grouped[t.groupNumber]) grouped[t.groupNumber] = []; grouped[t.groupNumber].push(t); });
    return (
      <div style={{ minHeight: "100vh", background: "#f8fafc", color: "#1e293b", fontFamily: "system-ui,sans-serif", display: "flex", flexDirection: "column" }}>
        {/* Topbar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#ef4444)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BookOpen size={18} color="#fff" />
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a" }}>{lang === "en" ? "Sales Academy" : "सेल्स अकादमी"}</div>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{lang === "en" ? "Medicine Pouch Mastery · 100 Topics" : "मेडिसिन पाउच महारत · 100 टॉपिक"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {streak > 0 && <span style={{ color: "#f59e0b", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><Flame size={15} />{streak}d streak</span>}
            <span style={{ color: "#7c3aed", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 4 }}><Star size={15} />{totalPoints} pts</span>
            {langBtn}
          </div>
        </div>

        {/* Progress bar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #f1f5f9", padding: "10px 24px", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ flex: 1, background: "#e2e8f0", borderRadius: 99, height: 7, overflow: "hidden" }}>
            <div style={{ height: "100%", background: "linear-gradient(90deg,#f59e0b,#ef4444)", width: `${pct}%`, transition: "width 0.5s", borderRadius: 99 }} />
          </div>
          <span style={{ fontSize: 12, color: "#64748b", whiteSpace: "nowrap", fontWeight: 600 }}>{completedCount} / {topics.length} complete · {pct}%</span>
        </div>

        {/* Grid */}
        <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 80, color: "#94a3b8" }}>Loading topics...</div>
          ) : (
            Object.entries(grouped).map(([group, gTopics]) => (
              <div key={group} style={{ marginBottom: 28 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>
                  Group {group} — {gTopics.length} Topics
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(270px,1fr))", gap: 8 }}>
                  {gTopics.map(topic => {
                    const prog = progress[topic.id]; const isDone = prog?.quizPassed; const isLocked = topic.isLocked;
                    const diff = DIFF[topic.difficulty] || DIFF.BEGINNER;
                    return (
                      <div key={topic.id} onClick={() => !isLocked && (setCurrentTopic(topic), setPhase("read"))}
                        style={{ background: isDone ? "#f0fdf4" : "#fff", border: `1px solid ${isDone ? "#86efac" : "#e2e8f0"}`, borderRadius: 10, padding: "12px 14px", cursor: isLocked ? "not-allowed" : "pointer", opacity: isLocked ? 0.45 : 1, display: "flex", alignItems: "flex-start", gap: 10, transition: "box-shadow 0.15s", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                        <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: isDone ? "#dcfce7" : isLocked ? "#f1f5f9" : "#fff7ed", display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${isDone ? "#86efac" : isLocked ? "#e2e8f0" : "#fed7aa"}` }}>
                          {isDone ? <CheckCircle size={15} color="#16a34a" /> : isLocked ? <Lock size={13} color="#94a3b8" /> : <span style={{ fontSize: 11, fontWeight: 700, color: "#ea580c" }}>{topic.orderIndex}</span>}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: isLocked ? "#94a3b8" : "#0f172a", marginBottom: 5, lineHeight: 1.4 }}>{lang === "en" ? topic.titleEn : topic.titleHi}</div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 10, fontWeight: 600, color: diff.color, background: diff.bg, padding: "2px 7px", borderRadius: 4, border: `1px solid ${diff.border}` }}>{diff.label}</span>
                            <span style={{ fontSize: 10, color: "#94a3b8" }}>⏱ {topic.estimatedMins}m</span>
                          </div>
                        </div>
                        {!isLocked && <ChevronRight size={14} color="#cbd5e1" style={{ flexShrink: 0, marginTop: 2 }} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ── READ ─────────────────────────────────────────────────
  if (phase === "read" && currentTopic) {
    const diff = DIFF[currentTopic.difficulty] || DIFF.BEGINNER;
    const kp = Array.isArray(currentTopic.keyPoints) ? currentTopic.keyPoints : (typeof currentTopic.keyPoints === "string" ? JSON.parse(currentTopic.keyPoints) : []);
    return (
      <div style={{ height: "100vh", background: "#f8fafc", color: "#1e293b", fontFamily: "system-ui,sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative" }}>
          <button onClick={() => setPhase("list")} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
            ← {lang === "en" ? "All Topics" : "सभी टॉपिक"}
          </button>
          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontWeight: 700, fontSize: 14, color: "#0f172a", maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "center" }}>
            Topic {currentTopic.orderIndex}: {lang === "en" ? currentTopic.titleEn : currentTopic.titleHi}
          </div>
          {langBtn}
        </div>

        {/* Two-column body */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* LEFT */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", borderRight: "1px solid #e2e8f0" }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: diff.color, background: diff.bg, padding: "3px 10px", borderRadius: 4, border: `1px solid ${diff.border}` }}>{diff.label}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>📖 {currentTopic.sourceBook}</span>
              <span style={{ fontSize: 11, color: "#94a3b8" }}>⏱ {currentTopic.estimatedMins} min</span>
            </div>

            {/* Content card */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px", marginBottom: 14, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#3b82f6", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>📖 {lang === "en" ? "Content" : "सामग्री"}</div>
              <div style={{ color: "#334155", fontSize: 16, lineHeight: 2.0, whiteSpace: "pre-wrap" }}>
                {lang === "en" ? currentTopic.contentEn : currentTopic.contentHi}
              </div>
            </div>

            {/* Script card */}
            {currentTopic.scriptEn && (
              <div style={{ background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 12, padding: "20px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", letterSpacing: 1, marginBottom: 14 }}>🎙️ {lang === "en" ? "Sales Script" : "सेल्स स्क्रिप्ट"}</div>
                <div style={{ color: "#6d28d9", fontSize: 15, lineHeight: 1.9, whiteSpace: "pre-wrap", fontStyle: "italic" }}>
                  {lang === "en" ? currentTopic.scriptEn : currentTopic.scriptHi}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT */}
          <div style={{ width: 300, flexShrink: 0, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 12, background: "#f8fafc" }}>
            {/* Key Takeaways */}
            {kp.length > 0 && (
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 12, padding: "16px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>⭐ {lang === "en" ? "Key Takeaways" : "मुख्य बिंदु"}</div>
                {kp.map((pt: string, i: number) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 10 }}>
                    <span style={{ color: "#2563eb", fontWeight: 700, flexShrink: 0, fontSize: 14 }}>→</span>
                    <span style={{ color: "#1e40af", fontSize: 13, lineHeight: 1.5 }}>{pt}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quiz CTA */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "18px", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#0f172a", marginBottom: 6 }}>{lang === "en" ? "Ready for Quiz?" : "क्विज़ के लिए तैयार?"}</div>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, lineHeight: 1.5 }}>
                {lang === "en" ? "All 5 must be correct. Wrong answer restarts from Q1." : "सभी 5 सही होने चाहिए। गलत = Q1 से शुरू।"}
              </div>
              <button onClick={() => { setCurrentQ(0); setSelectedAnswer(null); setAnswerState("idle"); setQuizScore(0); setPhase("quiz"); }}
                style={{ width: "100%", padding: "13px", borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#ef4444)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                {lang === "en" ? "Start Quiz →" : "क्विज़ शुरू करें →"}
              </button>
            </div>

            {/* Info */}
            <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Topic Info</div>
              <div style={{ fontSize: 13, color: "#64748b", display: "flex", flexDirection: "column", gap: 6 }}>
                <div>📌 Group {currentTopic.groupNumber}</div>
                <div>❓ {currentTopic.questions?.length || 5} Questions</div>
                <div>🏆 +25 points on pass</div>
                <div>🔁 All 5 must be correct</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── QUIZ ─────────────────────────────────────────────────
  if (phase === "quiz" && currentTopic) {
    const rawQ = currentTopic.questions[currentQ];
    if (!rawQ) return null;
    const opts = getOpts(rawQ, lang);
    const totalQs = currentTopic.questions.length;
    return (
      <div style={{ height: "100vh", background: "#f8fafc", color: "#1e293b", fontFamily: "system-ui,sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Topbar */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0, position: "relative" }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: "#0f172a" }}>Quiz — Topic {currentTopic.orderIndex}</span>
          <span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", fontSize: 13, color: "#64748b", fontWeight: 600 }}>Q{currentQ + 1} / {totalQs}</span>
          {langBtn}
        </div>

        {/* Progress */}
        <div style={{ height: 5, background: "#e2e8f0", flexShrink: 0 }}>
          <div style={{ height: "100%", background: "linear-gradient(90deg,#f59e0b,#ef4444)", width: `${((currentQ) / totalQs) * 100}%`, transition: "width 0.4s" }} />
        </div>

        {/* Two-column quiz */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* LEFT: question */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 48px", borderRight: "1px solid #e2e8f0", background: "#fff" }}>
            <div style={{ maxWidth: 480, width: "100%" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 20 }}>Question {currentQ + 1} of {totalQs}</div>
              <p style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.6, margin: "0 0 28px", color: "#0f172a" }}>
                {lang === "en" ? rawQ.questionEn : rawQ.questionHi}
              </p>
              {answerState === "wrong" && (
                <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 10 }}>
                  <XCircle size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div>
                    <div style={{ fontWeight: 700, color: "#dc2626", fontSize: 13, marginBottom: 4 }}>{lang === "en" ? "Wrong! Restarting from Q1..." : "गलत! Q1 से शुरू..."}</div>
                    <div style={{ fontSize: 12, color: "#b91c1c" }}>{lang === "en" ? rawQ.explanationEn : rawQ.explanationHi}</div>
                  </div>
                </div>
              )}
              {answerState === "correct" && (
                <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: "14px 16px", display: "flex", gap: 10, alignItems: "center" }}>
                  <CheckCircle size={18} color="#16a34a" />
                  <span style={{ fontWeight: 700, color: "#16a34a", fontSize: 13 }}>{lang === "en" ? "Correct! ✓" : "सही! ✓"}</span>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: options */}
          <div style={{ width: 420, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "32px 28px", gap: 10, background: "#f8fafc" }}>
            {opts.length > 0 ? opts.map((opt, idx) => {
              let bg = "#fff", border = "#e2e8f0", color = "#334155", fontWeight = 500;
              if (selectedAnswer !== null) {
                if (idx === rawQ.correctIndex) { bg = "#f0fdf4"; border = "#86efac"; color = "#15803d"; fontWeight = 600; }
                else if (idx === selectedAnswer && answerState === "wrong") { bg = "#fef2f2"; border = "#fca5a5"; color = "#dc2626"; fontWeight = 600; }
              }
              return (
                <button key={idx} onClick={() => handleAnswer(idx)} disabled={answerState !== "idle"}
                  style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: "14px 16px", color, fontSize: 14, fontWeight, cursor: answerState === "idle" ? "pointer" : "default", textAlign: "left", transition: "all 0.15s", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
                  <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#f1f5f9", border: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0, color: "#64748b" }}>
                    {String.fromCharCode(65 + idx)}
                  </span>
                  {opt}
                </button>
              );
            }) : <div style={{ color: "#ef4444", textAlign: "center", padding: 20 }}>Options not available</div>}

            {answerState !== "idle" && (
              <button onClick={nextAfterAnswer}
                style={{ marginTop: 6, width: "100%", padding: "14px", borderRadius: 10, background: answerState === "correct" ? "linear-gradient(135deg,#22c55e,#16a34a)" : "linear-gradient(135deg,#ef4444,#dc2626)", border: "none", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(0,0,0,0.12)" }}>
                {answerState === "wrong" ? (lang === "en" ? "↺ Restart from Q1" : "Q1 से शुरू करें") : currentQ < totalQs - 1 ? (lang === "en" ? "Next Question →" : "अगला →") : (lang === "en" ? "Finish Quiz ✓" : "पूरा करें ✓")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT ───────────────────────────────────────────────
  if (phase === "result") {
    return (
      <div style={{ height: "100vh", background: "#f8fafc", color: "#1e293b", fontFamily: "system-ui,sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", background: "#fff", borderRadius: 20, padding: "48px 40px", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", maxWidth: 400, width: "100%" }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>🏆</div>
          <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 10px", color: "#0f172a" }}>{lang === "en" ? "Quiz Passed!" : "क्विज़ पास!"}</h2>
          <p style={{ color: "#64748b", fontSize: 15, marginBottom: 8 }}>{lang === "en" ? "All 5 correct! +25 points earned." : "सभी 5 सही! +25 अंक मिले।"}</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 28 }}>
            <button onClick={() => { setPhase("list"); fetchTopics(); }}
              style={{ padding: "14px", borderRadius: 10, background: "linear-gradient(135deg,#f59e0b,#ef4444)", border: "none", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
              {lang === "en" ? "Next Topic →" : "अगला टॉपिक →"}
            </button>
            <button onClick={() => { setCurrentQ(0); setSelectedAnswer(null); setAnswerState("idle"); setQuizScore(0); setPhase("quiz"); }}
              style={{ padding: "12px", borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", color: "#64748b", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <RotateCcw size={15} /> {lang === "en" ? "Retake Quiz" : "फिर से करें"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}