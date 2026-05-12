"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen, CheckCircle, Lock, Star, Trophy, Zap, ChevronRight,
  RotateCcw, ArrowRight, Globe, Languages, Target, Award, TrendingUp,
  Clock, AlertCircle, XCircle, Flame
} from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || "https://rareprint-erp-production.up.railway.app";
const AUTH_TOKEN_KEY = "rareprint_token";

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
  keyPoints: string[];
  questions: Question[];
  isLocked?: boolean;
  isCompleted?: boolean;
}

interface Question {
  id: string;
  questionEn: string;
  questionHi: string;
  options: string[];
  correctIndex: number;
}

interface UserProgress {
  topicId: string;
  completed: boolean;
  quizPassed: boolean;
  score: number;
}

type Lang = "en" | "hi";
type Phase = "list" | "read" | "quiz" | "result";

export default function SalesLearningPage() {
  const router = useRouter();
  const [lang, setLang] = useState<Lang>("en");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [progress, setProgress] = useState<Record<string, UserProgress>>({});
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("list");
  const [currentTopic, setCurrentTopic] = useState<Topic | null>(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<"idle" | "correct" | "wrong">("idle");
  const [quizScore, setQuizScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [userId, setUserId] = useState<string>("");

  const getToken = () => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(AUTH_TOKEN_KEY);
  };

  const getUser = useCallback(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem("rareprint_user");
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  const fetchTopics = useCallback(async () => {
    const token = getToken();
    if (!token) { router.push("/login"); return; }
    try {
      const res = await fetch(`${API}/sales-learning/topics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setTopics(data.topics || []);
      setProgress(data.progress || {});
      setStreak(data.streak || 0);
      setTotalPoints(data.totalPoints || 0);
    } catch {
      // fallback: show empty state
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const user = getUser();
    if (user) setUserId(user.id);
    fetchTopics();
  }, [fetchTopics, getUser]);

  const completedCount = Object.values(progress).filter(p => p.completed).length;
  const totalTopics = topics.length;

  const getDifficultyColor = (d: string) => {
    switch (d) {
      case "BEGINNER": return "#22c55e";
      case "INTERMEDIATE": return "#f59e0b";
      case "ADVANCED": return "#ef4444";
      case "PRO": return "#8b5cf6";
      default: return "#6b7280";
    }
  };

  const getDifficultyLabel = (d: string) => {
    const map: Record<string, string> = {
      BEGINNER: "🟢 Beginner", INTERMEDIATE: "🟡 Intermediate",
      ADVANCED: "🔴 Advanced", PRO: "🔵 Pro"
    };
    return map[d] || d;
  };

  const openTopic = (topic: Topic) => {
    if (topic.isLocked) return;
    setCurrentTopic(topic);
    setPhase("read");
    setCurrentQ(0);
    setSelectedAnswer(null);
    setAnswerState("idle");
    setQuizScore(0);
  };

  const startQuiz = () => {
    setPhase("quiz");
    setCurrentQ(0);
    setSelectedAnswer(null);
    setAnswerState("idle");
    setQuizScore(0);
  };

  const handleAnswer = (idx: number) => {
    if (answerState !== "idle" || !currentTopic) return;
    setSelectedAnswer(idx);
    const correct = currentTopic.questions[currentQ].correctIndex;
    if (idx === correct) {
      setAnswerState("correct");
      setQuizScore(s => s + 1);
    } else {
      setAnswerState("wrong");
    }
  };

  const nextAfterAnswer = async () => {
    if (!currentTopic) return;
    if (answerState === "wrong") {
      // Reset to Q1
      setCurrentQ(0);
      setSelectedAnswer(null);
      setAnswerState("idle");
      return;
    }
    // Correct — go next
    if (currentQ < currentTopic.questions.length - 1) {
      setCurrentQ(q => q + 1);
      setSelectedAnswer(null);
      setAnswerState("idle");
    } else {
      // All done — submit
      const token = getToken();
      try {
        await fetch(`${API}/sales-learning/topics/${currentTopic.id}/complete`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ score: quizScore + 1, totalQuestions: currentTopic.questions.length }),
        });
        await fetchTopics();
      } catch { /* silent */ }
      setPhase("result");
    }
  };

  // ── LIST VIEW ──────────────────────────────────────────────────
  if (phase === "list") {
    const grouped: Record<number, Topic[]> = {};
    topics.forEach(t => {
      if (!grouped[t.groupNumber]) grouped[t.groupNumber] = [];
      grouped[t.groupNumber].push(t);
    });

    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", borderBottom: "1px solid #1e3a5f", padding: "20px 24px" }}>
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <div style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", borderRadius: 10, padding: 8 }}>
                    <BookOpen size={20} color="white" />
                  </div>
                  <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, margin: 0, background: "linear-gradient(90deg, #60a5fa, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    Sales Academy
                  </h1>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Medicine Pouch Selling Mastery · RarePrint</p>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                {/* Streak */}
                <div style={{ background: "#1e293b", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Flame size={16} color="#f97316" />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{streak} day streak</span>
                </div>
                {/* Points */}
                <div style={{ background: "#1e293b", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Star size={16} color="#eab308" />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{totalPoints} pts</span>
                </div>
                {/* Lang toggle */}
                <button
                  onClick={() => setLang(l => l === "en" ? "hi" : "en")}
                  style={{ background: lang === "hi" ? "#3b82f6" : "#1e293b", border: "none", borderRadius: 8, padding: "8px 14px", color: "white", cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}
                >
                  <Languages size={14} />
                  {lang === "en" ? "हिंदी" : "English"}
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12, color: "#64748b" }}>
                <span>{completedCount} of {totalTopics} topics completed</span>
                <span>{totalTopics > 0 ? Math.round((completedCount / totalTopics) * 100) : 0}%</span>
              </div>
              <div style={{ background: "#1e293b", borderRadius: 99, height: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", borderRadius: 99, width: `${totalTopics > 0 ? (completedCount / totalTopics) * 100 : 0}%`, transition: "width 0.5s ease" }} />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
              <p>Loading your learning path...</p>
            </div>
          ) : topics.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, background: "#111827", borderRadius: 16, border: "1px solid #1e293b" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🎓</div>
              <h3 style={{ fontFamily: "'Syne', sans-serif", marginBottom: 8 }}>No topics yet</h3>
              <p style={{ color: "#64748b", margin: 0 }}>Ask your admin to add topics from the Admin panel.</p>
            </div>
          ) : (
            Object.entries(grouped).map(([group, groupTopics]) => {
              const groupCompleted = groupTopics.filter(t => progress[t.id]?.completed).length;
              const allDone = groupCompleted === groupTopics.length;
              return (
                <div key={group} style={{ marginBottom: 32 }}>
                  {/* Group header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <div style={{ background: allDone ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {allDone ? <Trophy size={16} color="white" /> : <Target size={16} color="white" />}
                    </div>
                    <div>
                      <h2 style={{ margin: 0, fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700 }}>
                        Group {group} {allDone ? "✓" : ""}
                      </h2>
                      <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>{groupCompleted}/{groupTopics.length} completed</p>
                    </div>
                    {allDone && (
                      <div style={{ marginLeft: "auto", background: "#14532d", color: "#86efac", fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99 }}>
                        MILESTONE UNLOCKED
                      </div>
                    )}
                  </div>

                  {/* Topics */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {groupTopics.map((topic, idx) => {
                      const prog = progress[topic.id];
                      const done = prog?.completed;
                      const locked = topic.isLocked;
                      return (
                        <div
                          key={topic.id}
                          onClick={() => openTopic(topic)}
                          style={{
                            background: locked ? "#0f172a" : done ? "#0f2d1a" : "#111827",
                            border: `1px solid ${done ? "#166534" : locked ? "#1e293b" : "#1e293b"}`,
                            borderRadius: 12,
                            padding: "14px 18px",
                            display: "flex",
                            alignItems: "center",
                            gap: 14,
                            cursor: locked ? "not-allowed" : "pointer",
                            opacity: locked ? 0.5 : 1,
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={e => { if (!locked) (e.currentTarget as HTMLElement).style.borderColor = "#3b82f6"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = done ? "#166534" : "#1e293b"; }}
                        >
                          {/* Status icon */}
                          <div style={{ flexShrink: 0 }}>
                            {locked ? <Lock size={18} color="#475569" /> :
                              done ? <CheckCircle size={20} color="#22c55e" /> :
                                <div style={{ width: 20, height: 20, borderRadius: "50%", border: "2px solid #334155", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#64748b", fontWeight: 700 }}>{topic.orderIndex}</div>}
                          </div>

                          {/* Title */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {lang === "en" ? topic.titleEn : topic.titleHi}
                            </div>
                            <div style={{ fontSize: 11, color: "#64748b" }}>{topic.sourceBook} · {topic.estimatedMins} min</div>
                          </div>

                          {/* Difficulty badge */}
                          <div style={{ fontSize: 11, fontWeight: 600, color: getDifficultyColor(topic.difficulty), flexShrink: 0, display: "none" }} className="diff-badge">
                            {getDifficultyLabel(topic.difficulty)}
                          </div>

                          {/* Arrow */}
                          {!locked && <ChevronRight size={16} color="#475569" style={{ flexShrink: 0 }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  }

  // ── READ VIEW ──────────────────────────────────────────────────
  if (phase === "read" && currentTopic) {
    const keyPoints = Array.isArray(currentTopic.keyPoints)
      ? currentTopic.keyPoints
      : (typeof currentTopic.keyPoints === "string"
        ? JSON.parse(currentTopic.keyPoints)
        : []);

    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

        {/* Top bar */}
        <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "14px 20px", position: "sticky", top: 0, zIndex: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setPhase("list")} style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 12px", color: "#94a3b8", cursor: "pointer", fontSize: 13 }}>
            ← Back
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15 }}>
              Topic {currentTopic.orderIndex}: {lang === "en" ? currentTopic.titleEn : currentTopic.titleHi}
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{currentTopic.sourceBook}</div>
          </div>
          <button
            onClick={() => setLang(l => l === "en" ? "hi" : "en")}
            style={{ background: "#1e293b", border: "none", borderRadius: 8, padding: "6px 12px", color: "white", cursor: "pointer", fontSize: 12, fontWeight: 600 }}
          >
            {lang === "en" ? "हिंदी" : "ENG"}
          </button>
        </div>

        <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 80px" }}>
          {/* Meta */}
          <div style={{ display: "flex", gap: 10, marginBottom: 24, flexWrap: "wrap" }}>
            <span style={{ background: "#1e293b", borderRadius: 99, padding: "4px 12px", fontSize: 12, color: getDifficultyColor(currentTopic.difficulty), fontWeight: 600 }}>
              {getDifficultyLabel(currentTopic.difficulty)}
            </span>
            <span style={{ background: "#1e293b", borderRadius: 99, padding: "4px 12px", fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
              <Clock size={11} /> {currentTopic.estimatedMins} min read
            </span>
          </div>

          {/* Content */}
          <div style={{ background: "#111827", borderRadius: 16, border: "1px solid #1e293b", padding: "24px", marginBottom: 20 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginTop: 0, marginBottom: 16, color: "#60a5fa" }}>
              📖 {lang === "en" ? "Topic Content" : "विषय सामग्री"}
            </h2>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "#cbd5e1", whiteSpace: "pre-wrap" }}>
              {lang === "en" ? currentTopic.contentEn : currentTopic.contentHi}
            </div>
          </div>

          {/* Sales Script */}
          <div style={{ background: "#0f1f0f", borderRadius: 16, border: "1px solid #166534", padding: "24px", marginBottom: 20 }}>
            <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginTop: 0, marginBottom: 16, color: "#86efac" }}>
              🎙️ {lang === "en" ? "Medicine Pouch Sales Script" : "मेडिसिन पाउच सेल्स स्क्रिप्ट"}
            </h2>
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "#bbf7d0", whiteSpace: "pre-wrap" }}>
              {lang === "en" ? currentTopic.scriptEn : currentTopic.scriptHi}
            </div>
          </div>

          {/* Key Points */}
          {keyPoints.length > 0 && (
            <div style={{ background: "#1a0f2e", borderRadius: 16, border: "1px solid #4c1d95", padding: "24px", marginBottom: 28 }}>
              <h2 style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 800, marginTop: 0, marginBottom: 16, color: "#c4b5fd" }}>
                ⭐ {lang === "en" ? "Key Takeaways" : "मुख्य बातें"}
              </h2>
              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {keyPoints.map((pt: string, i: number) => (
                  <li key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10, fontSize: 14, color: "#ddd6fe" }}>
                    <span style={{ color: "#8b5cf6", fontWeight: 700, flexShrink: 0 }}>{i + 1}.</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Start Quiz Button */}
          <button
            onClick={startQuiz}
            style={{ width: "100%", background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", border: "none", borderRadius: 12, padding: "16px", color: "white", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Syne', sans-serif" }}
          >
            <Zap size={20} />
            {lang === "en" ? "Start Quiz — Test Your Knowledge" : "क्विज़ शुरू करें"}
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  // ── QUIZ VIEW ──────────────────────────────────────────────────
  if (phase === "quiz" && currentTopic) {
    const rawQ = currentTopic.questions[currentQ];
    if (!rawQ) return null;
    const q = { ...rawQ, options: Array.isArray(rawQ.options) ? rawQ.options : (typeof rawQ.options === "string" ? JSON.parse(rawQ.options) : []) };
    const totalQs = currentTopic.questions.length;
    const questionText = lang === "en" ? q.questionEn : q.questionHi;

    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", display: "flex", flexDirection: "column" }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

        {/* Header */}
        <div style={{ background: "#0f172a", borderBottom: "1px solid #1e293b", padding: "14px 20px" }}>
          <div style={{ maxWidth: 600, margin: "0 auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 15 }}>Quiz — Topic {currentTopic.orderIndex}</span>
              <span style={{ fontSize: 13, color: "#64748b" }}>Q{currentQ + 1} / {totalQs}</span>
            </div>
            <div style={{ background: "#1e293b", borderRadius: 99, height: 4 }}>
              <div style={{ height: "100%", background: "linear-gradient(90deg, #3b82f6, #8b5cf6)", borderRadius: 99, width: `${((currentQ) / totalQs) * 100}%`, transition: "width 0.4s ease" }} />
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px" }}>
          <div style={{ width: "100%", maxWidth: 600 }}>

            {/* Wrong answer alert */}
            {answerState === "wrong" && (
              <div style={{ background: "#450a0a", border: "1px solid #991b1b", borderRadius: 12, padding: "14px 18px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
                <XCircle size={20} color="#f87171" />
                <div>
                  <div style={{ fontWeight: 700, color: "#fca5a5", fontSize: 14 }}>
                    {lang === "en" ? "Wrong answer — restarting from Q1" : "गलत जवाब — Q1 से शुरू होगा"}
                  </div>
                  <div style={{ fontSize: 12, color: "#ef4444", marginTop: 2 }}>
                    {lang === "en" ? "You must answer all 5 correctly in sequence." : "आपको क्रम से सभी 5 सही देने होंगे।"}
                  </div>
                </div>
              </div>
            )}

            {/* Question */}
            <div style={{ background: "#111827", borderRadius: 16, border: "1px solid #1e293b", padding: "28px", marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
                Question {currentQ + 1}
              </div>
              <p style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.6, margin: 0, color: "#f1f5f9" }}>
                {questionText}
              </p>
            </div>

            {/* Options */}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
              {q.options.map((opt, idx) => {
                let bg = "#111827";
                let border = "#1e293b";
                let color = "#cbd5e1";
                if (selectedAnswer !== null) {
                  if (idx === q.correctIndex) { bg = "#14532d"; border = "#166534"; color = "#86efac"; }
                  else if (idx === selectedAnswer && answerState === "wrong") { bg = "#450a0a"; border = "#991b1b"; color = "#fca5a5"; }
                }
                return (
                  <button
                    key={idx}
                    onClick={() => handleAnswer(idx)}
                    disabled={answerState !== "idle"}
                    style={{ background: bg, border: `1px solid ${border}`, borderRadius: 12, padding: "14px 18px", color, fontSize: 15, fontWeight: 500, cursor: answerState === "idle" ? "pointer" : "default", textAlign: "left", transition: "all 0.2s", display: "flex", alignItems: "center", gap: 12 }}
                  >
                    <span style={{ background: "#1e293b", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0, color: "#94a3b8" }}>
                      {["A", "B", "C", "D"][idx]}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>

            {/* Continue button */}
            {answerState !== "idle" && (
              <button
                onClick={nextAfterAnswer}
                style={{ width: "100%", background: answerState === "correct" ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #ef4444, #dc2626)", border: "none", borderRadius: 12, padding: "14px", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Syne', sans-serif" }}
              >
                {answerState === "correct"
                  ? (currentQ < totalQs - 1 ? <><ChevronRight size={18} />{lang === "en" ? "Next Question" : "अगला सवाल"}</> : <><Trophy size={18} />{lang === "en" ? "Complete Topic!" : "टॉपिक पूरा करें!"}</>)
                  : <><RotateCcw size={18} />{lang === "en" ? "Restart Quiz from Q1" : "Q1 से दोबारा शुरू करें"}</>
                }
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── RESULT VIEW ──────────────────────────────────────────────────
  if (phase === "result" && currentTopic) {
    const nextTopic = topics.find(t => t.orderIndex === currentTopic.orderIndex + 1);
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e2e8f0", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

        <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 64, marginBottom: 20 }}>🎉</div>
          <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 8, background: "linear-gradient(90deg, #60a5fa, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Topic Complete!
          </h1>
          <p style={{ color: "#64748b", fontSize: 15, marginBottom: 28 }}>
            {lang === "en" ? currentTopic.titleEn : currentTopic.titleHi}
          </p>

          {/* Stats */}
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 32 }}>
            <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 24px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#22c55e", fontFamily: "'Syne', sans-serif" }}>✓ 5/5</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Perfect Score</div>
            </div>
            <div style={{ background: "#111827", border: "1px solid #1e293b", borderRadius: 12, padding: "16px 24px" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#eab308", fontFamily: "'Syne', sans-serif" }}>+50</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Points Earned</div>
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {nextTopic && !nextTopic.isLocked && (
              <button
                onClick={() => openTopic(nextTopic)}
                style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)", border: "none", borderRadius: 12, padding: "14px", color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'Syne', sans-serif" }}
              >
                <ArrowRight size={18} />
                {lang === "en" ? "Next Topic" : "अगला टॉपिक"}: {lang === "en" ? nextTopic.titleEn : nextTopic.titleHi}
              </button>
            )}
            <button
              onClick={() => setPhase("list")}
              style={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 12, padding: "14px", color: "#94a3b8", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "'Syne', sans-serif" }}
            >
              {lang === "en" ? "Back to Topic List" : "टॉपिक लिस्ट पर जाएं"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}