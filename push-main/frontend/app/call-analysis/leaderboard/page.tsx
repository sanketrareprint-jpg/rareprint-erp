"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

type LeaderRow = {
  agentId: string;
  agentName: string;
  totalCalls: number;
  averageScore: number;
  bestScore: number;
  trend: "improving" | "declining" | "steady";
};

function cardTone(score: number) {
  if (score >= 80) return "border-emerald-200 bg-emerald-50";
  if (score >= 60) return "border-amber-200 bg-amber-50";
  return "border-red-200 bg-red-50";
}

function scoreText(score: number) {
  if (score >= 80) return "text-emerald-700";
  if (score >= 60) return "text-amber-700";
  return "text-red-700";
}

export default function CallLeaderboardPage() {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/call-analysis/leaderboard`, { headers: getAuthHeaders() })
      .then((res) => res.ok ? res.json() : [])
      .then(setRows)
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardShell>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/call-analysis" className="mb-1 inline-flex items-center gap-1 text-xs font-semibold text-cyan-700"><ArrowLeft className="h-3 w-3" /> Call Analysis</Link>
            <h1 className="text-lg font-bold text-slate-900">Call Analysis Leaderboard</h1>
            <p className="text-xs text-slate-500">Agent rankings by average call quality score.</p>
          </div>
          <Trophy className="h-8 w-8 text-amber-500" />
        </div>

        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-cyan-600" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">No call analyses yet.</div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {rows.map((row, index) => (
              <div key={row.agentId} className={`rounded-xl border p-4 shadow-sm ${cardTone(row.averageScore)}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-500">Rank #{index + 1}</p>
                    <h2 className="mt-1 text-base font-black text-slate-900">{row.agentName}</h2>
                  </div>
                  <span className={`text-3xl font-black ${scoreText(row.averageScore)}`}>{row.averageScore}</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-white/70 p-3">
                    <p className="text-slate-500">Calls analysed</p>
                    <p className="text-lg font-bold text-slate-900">{row.totalCalls}</p>
                  </div>
                  <div className="rounded-lg bg-white/70 p-3">
                    <p className="text-slate-500">Best score</p>
                    <p className="text-lg font-bold text-slate-900">{row.bestScore}</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/70 p-2 text-xs font-semibold text-slate-700">
                  {row.trend === "declining" ? <TrendingDown className="h-4 w-4 text-red-600" /> : <TrendingUp className="h-4 w-4 text-emerald-600" />}
                  Trend: {row.trend}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
