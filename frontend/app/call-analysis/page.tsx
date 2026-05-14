"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, CheckCircle2, FileAudio, History, Loader2, Mic, Play, Save, Trophy } from "lucide-react";
import { DashboardShell } from "@/components/dashboard-shell";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";

type CategoryScores = Record<string, number>;
type AnalysisResult = {
  id?: string;
  overallScore: number;
  grade: string;
  duration?: string;
  sentiment?: string;
  language?: string;
  categoryScores: CategoryScores;
  strengthsList: string[];
  improvementsList: string[];
  coachFeedback?: string;
  actionItems: string[];
  transcriptSummary?: string;
  hasRealTranscript?: boolean;
};

const CALL_TYPES = ["Cold", "Follow-up", "Closing", "Complaint", "Demo"];
const SAMPLE_WORDS = "Hello customer, this is a RarePrint sales call. I am asking about your printing requirement, quantity, timeline, budget, and next follow up. We discussed product options, pricing, objections, and a clear next action for the next call.".split(" ");

function fmtScore(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function barColor(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 60) return "bg-amber-500";
  return "bg-red-500";
}

function getDuration(audio?: HTMLAudioElement | null) {
  if (!audio?.duration || Number.isNaN(audio.duration)) return "Unknown";
  const mins = Math.floor(audio.duration / 60);
  const secs = Math.round(audio.duration % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function CallAnalysisPage() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const [agentName, setAgentName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [callType, setCallType] = useState(CALL_TYPES[0]);
  const [audioUrl, setAudioUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [transcript, setTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasRealTranscript, setHasRealTranscript] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const wordCount = useMemo(() => transcript.split(/\s+/).filter(Boolean).length, [transcript]);

  useEffect(() => {
    const user = getStoredUser();
    setAgentName(user?.fullName ?? "");
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      recognitionRef.current?.stop?.();
    };
  }, [audioUrl]);

  const handleFile = (file?: File) => {
    if (!file) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(URL.createObjectURL(file));
    setFileName(file.name);
    setTranscript("");
    setResult(null);
    setHasRealTranscript(false);
  };

  const [transcribeDuration, setTranscribeDuration] = useState<string | null>(null);

  const transcribeWithAI = async () => {
    if (!audioUrl || !fileName) return alert("Upload an audio file first");
    setIsTranscribing(true);
    setTranscript("");
    setResult(null);
    try {
      const blob = await fetch(audioUrl).then(r => r.blob());
      const formData = new FormData();
      formData.append("audio", blob, fileName);
      const headers = getAuthHeaders();
      delete (headers as any)['Content-Type'];
      const res = await fetch(`${API_BASE_URL}/call-analysis/transcribe`, {
        method: "POST",
        headers,
        body: formData,
      });
      const data = await res.json();
      if (data.transcript) {
        setTranscript(data.transcript);
        setHasRealTranscript(true);
        if (data.duration) setTranscribeDuration(data.duration);
      } else {
        alert("Transcription failed: " + (data.error || data.message || JSON.stringify(data)));
      }
    } catch (e) {
      alert("Transcription failed: " + String(e));
    } finally {
      setIsTranscribing(false);
    }
  };

  const simulateTranscript = async () => {
    setHasRealTranscript(false);
    setTranscript("");
    for (const word of SAMPLE_WORDS) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      setTranscript((prev) => `${prev} ${word}`.trim());
    }
  };

  const startTranscription = async () => {
    if (!audioUrl) return alert("Upload an audio file first");
    setTranscript("");
    setResult(null);
    setIsListening(true);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    try {
      await audioRef.current?.play();
    } catch {
      // Browser may require a second click; transcription can still fall back.
    }

    if (!SpeechRecognition) {
      await simulateTranscript();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-IN";
    recognitionRef.current = recognition;
    let finalText = "";
    recognition.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += `${text} `;
        else interim += text;
      }
      const next = `${finalText} ${interim}`.trim();
      setTranscript(next);
      if (next.length > 10) setHasRealTranscript(true);
    };
    recognition.onerror = async () => {
      recognition.stop();
      await simulateTranscript();
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    audioRef.current?.addEventListener("ended", () => recognition.stop(), { once: true });
    recognition.start();
  };

  const analyze = async () => {
    if (!customerName.trim()) return alert("Enter customer name");
    if (!transcript.trim()) return alert("Create or paste a transcript first");
    setIsAnalyzing(true);
    try {
      const duration = transcribeDuration || getDuration(audioRef.current);
      const res = await fetch(`${API_BASE_URL}/call-analysis/analyze`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ agentName, customerName, callType, duration, transcript, hasRealTranscript }),
      });
      if (!res.ok) throw new Error("Analysis failed");
      const analysis = await res.json();
      const saved = await fetch(`${API_BASE_URL}/call-analysis`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...analysis, agentName, customerName, callType, duration, transcript, hasRealTranscript }),
      });
      const savedRow = saved.ok ? await saved.json() : null;
      setResult({ ...analysis, id: savedRow?.id, duration, hasRealTranscript });
    } catch {
      alert("Could not analyse this call");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <DashboardShell>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900">Call Analysis</h1>
            <p className="text-xs text-slate-500">Upload a sales call, transcribe it, and coach the next action.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/call-analysis/history" className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
              <History className="h-4 w-4" /> History
            </Link>
            <Link href="/call-analysis/leaderboard" className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white">
              <Trophy className="h-4 w-4" /> Leaderboard
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-bold text-slate-800">Call Details</h2>
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-600">Recording</label>
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-cyan-300 bg-cyan-50 px-4 py-8 text-center text-cyan-700">
                <FileAudio className="mb-2 h-8 w-8" />
                <span className="text-sm font-bold">{fileName || "Upload MP3, WAV, M4A, AAC, OGG"}</span>
                <input className="hidden" type="file" accept="audio/*,.aac,.m4a,.mp3,.wav,.ogg,.flac" onChange={(e) => handleFile(e.target.files?.[0])} />
              </label>
              {audioUrl && <audio ref={audioRef} controls src={audioUrl} className="w-full" />}

              <div>
                <label className="text-xs font-semibold text-slate-600">Agent</label>
                <input value={agentName} onChange={(e) => setAgentName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Customer</label>
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Call Type</label>
                <select value={callType} onChange={(e) => setCallType(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  {CALL_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <button onClick={startTranscription} disabled={isListening || isTranscribing} className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                {isListening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
                {isListening ? "Listening..." : "Play & Transcribe (Mic)"}
              </button>
              <button onClick={transcribeWithAI} disabled={isTranscribing || isListening} className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
                {isTranscribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileAudio className="h-4 w-4" />}
                {isTranscribing ? "Transcribing... (~30 sec)" : "🤖 AI Transcribe (AssemblyAI)"}
              </button>
            </div>
          </section>

          <section className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">Live Transcript</h2>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{wordCount} words</span>
            </div>
            {transcript.includes('Agent:') || transcript.includes('Customer:') ? (
              <div className="h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                {transcript.split('\n\n').filter(Boolean).map((line, i) => {
                  const isAgent = line.startsWith('Agent:');
                  const isCustomer = line.startsWith('Customer:');
                  return (
                    <div key={i} className={`rounded-lg px-3 py-2 ${isAgent ? 'bg-blue-50 border-l-4 border-blue-400' : isCustomer ? 'bg-green-50 border-l-4 border-green-400' : 'bg-white'}`}>
                      {isAgent && <span className="text-sm font-bold text-blue-600 block">🎤 Agent</span>}
                      {isCustomer && <span className="text-sm font-bold text-green-600 block">👤 Customer</span>}
                      <span className="text-sm text-slate-700 leading-6">{line.replace(/^(Agent|Customer): /, '')}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Transcript appears here. Use AI Transcribe button to auto-transcribe your audio file." className="h-64 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700" />
            )}
            <div className="mt-3 flex items-center justify-between">
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${hasRealTranscript ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                {hasRealTranscript ? "Real audio" : "Simulated"}
              </span>
              <button onClick={analyze} disabled={isAnalyzing} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Analyse & Save
              </button>
            </div>
          </section>
        </div>

        {result && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-4 gap-4">
              <div className="flex flex-col items-center justify-center">
                <div className="relative h-32 w-32">
                  <svg className="-rotate-90" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="52" stroke="#e2e8f0" strokeWidth="10" fill="none" />
                    <circle cx="60" cy="60" r="52" stroke="#0891b2" strokeWidth="10" fill="none" strokeLinecap="round" strokeDasharray={`${(result.overallScore / 100) * 327} 327`} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-black ${fmtScore(result.overallScore)}`}>{result.overallScore}</span>
                    <span className="text-xs font-semibold text-slate-500">{result.grade}</span>
                  </div>
                </div>
                <span className="mt-2 rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700">{result.hasRealTranscript ? "Real audio" : "Simulated"}</span>
              </div>

              <div className="col-span-3 space-y-4">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 p-3"><b>Duration</b><br />{result.duration ?? "Unknown"}</div>
                  <div className="rounded-lg bg-slate-50 p-3"><b>Sentiment</b><br />{result.sentiment ?? "Neutral"}</div>
                  <div className="rounded-lg bg-slate-50 p-3"><b>Language</b><br />{result.language ?? "Mixed"}</div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(result.categoryScores).map(([name, score]) => (
                    <div key={name}>
                      <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600"><span>{name}</span><span>{score}</span></div>
                      <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${barColor(score)}`} style={{ width: `${score}%` }} /></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-4">
              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-800">Strengths</h3>
                <div className="flex flex-wrap gap-2">{result.strengthsList.map((x) => <span key={x} className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700">{x}</span>)}</div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-800">Improvements</h3>
                <div className="flex flex-wrap gap-2">{result.improvementsList.map((x) => <span key={x} className="rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-sm font-medium text-amber-700">{x}</span>)}</div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-bold text-slate-800">Action Items</h3>
                <ol className="list-decimal space-y-2 pl-4 text-sm text-slate-700">{result.actionItems.map((x) => <li key={x}>{x}</li>)}</ol>
              </div>
            </div>

            <div className="mt-5 rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4 text-sm leading-7 text-slate-700">{result.coachFeedback}</div>
            <div className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-50 p-3 space-y-2">
              {transcript.includes('Agent:') || transcript.includes('Customer:')
                ? transcript.split('\n\n').filter(Boolean).map((line, i) => {
                    const isAgent = line.startsWith('Agent:');
                    const isCustomer = line.startsWith('Customer:');
                    return (
                      <div key={i} className={`rounded-lg px-3 py-2 ${isAgent ? 'bg-blue-50 border-l-4 border-blue-400' : isCustomer ? 'bg-green-50 border-l-4 border-green-400' : 'bg-white border border-slate-200'}`}>
                        {isAgent && <span className="text-sm font-bold text-blue-600 block mb-1">🎤 Agent</span>}
                        {isCustomer && <span className="text-sm font-bold text-green-600 block mb-1">👤 Customer</span>}
                        <span className="text-sm leading-6 text-slate-700">{line.replace(/^(Agent|Customer): /, '')}</span>
                      </div>
                    );
                  })
                : <p className="text-sm whitespace-pre-wrap text-slate-600">{transcript}</p>
              }
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
