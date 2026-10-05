"use client";
// Auto dialer — Android app only. Calls the agent's queue one after another:
//   GET /dialer/next → native startCall → call ends → outcome screen →
//   POST /dialer/result → 5 s countdown → next.
// Native side: CallManagerPlugin.kt + DialerService.kt (lib/plugins/CallManager.ts).
// Backend: backend/src/dialer (queue order, locks, status updates).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DashboardShell } from "@/components/dashboard-shell";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import { apiFetch, apiMutate } from "@/lib/apiFetch";
import { getStoredUser } from "@/lib/auth";
import {
  dialer,
  requestOverlayPermission,
  type DialerCallEnded,
  type DialerPermissionStatus,
  type DialerSim,
} from "@/lib/plugins/CallManager";

const SIM_KEY = "dialer_sim_id"; // same key as the Phase 1 test screen
const QUEUE_AGENT_KEY = "dialer_queue_agent_id"; // admins: whose leads to dial ("" = my own)
const COUNTDOWN_SECONDS = 5;

type Outcome = "INTERESTED" | "CALLBACK" | "NOT_ANSWERED" | "BUSY" | "WRONG_NUMBER" | "NOT_INTERESTED";
const OUTCOMES: Array<{ value: Outcome; label: string; className: string }> = [
  { value: "INTERESTED", label: "Interested", className: "bg-green-600 text-white" },
  { value: "CALLBACK", label: "Callback", className: "bg-blue-600 text-white" },
  { value: "NOT_ANSWERED", label: "Not answered", className: "bg-slate-600 text-white" },
  { value: "BUSY", label: "Busy", className: "bg-amber-500 text-white" },
  { value: "WRONG_NUMBER", label: "Wrong number", className: "bg-red-700 text-white" },
  { value: "NOT_INTERESTED", label: "Not interested", className: "bg-red-500 text-white" },
];

const SOURCE_LABELS: Record<string, string> = {
  FOLLOW_UP_DUE: "Follow-up due",
  FRESH_LEAD: "New lead",
  NOT_CONTACTED: "Not contacted",
  OLD_CALLBACK: "Older follow-up",
};

interface QueueItem {
  source: string;
  leadId: string | null;
  importedContactId: string | null;
  followUpId: string | null;
  scheduledAt: string | null;
  phone: string;
  name: string | null;
  businessName: string | null;
  productInterest: string | null;
  tags: string[];
  status: string;
  lastNote: string | null;
}
interface SessionStats { callsMade: number; connected: number; talkTimeSec: number; }
interface Seller { id: string; fullName: string; role: string; }

type Phase = "idle" | "loading" | "dialing" | "onCall" | "outcome" | "saving" | "countdown" | "paused" | "empty" | "stopped";

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
const talkTime = (sec: number) => (sec >= 3600 ? `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m` : `${Math.floor(sec / 60)}m ${sec % 60}s`);

export default function DialerPage() {
  const isNative = useIsNativeApp();
  const [perms, setPerms] = useState<DialerPermissionStatus | null>(null);
  const [sims, setSims] = useState<DialerSim[]>([]);
  const [simId, setSimId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [item, setItem] = useState<QueueItem | null>(null);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [ended, setEnded] = useState<DialerCallEnded | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [note, setNote] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [error, setError] = useState("");
  const [afterCall, setAfterCall] = useState<"continue" | "pause" | "stop">("continue");
  // Admins only: dial a chosen seller's queue instead of their own.
  const [isAdmin, setIsAdmin] = useState(false);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [queueAgentId, setQueueAgentId] = useState("");
  const queueAgentRef = useRef("");

  // Refs mirror state for native listeners and timers.
  const phaseRef = useRef<Phase>("idle");
  const itemRef = useRef<QueueItem | null>(null);
  const simIdRef = useRef("");
  const afterCallRef = useRef<"continue" | "pause" | "stop">("continue");
  const skippedRef = useRef<string[]>([]);
  const pendingRef = useRef(false); // item on screen has been fetched but not dialed yet
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const setItemBoth = (i: QueueItem | null) => { itemRef.current = i; setItem(i); };
  const setAfterCallBoth = (a: "continue" | "pause" | "stop") => { afterCallRef.current = a; setAfterCall(a); };
  const clearCountdown = () => { if (countdownRef.current) clearInterval(countdownRef.current); countdownRef.current = null; };

  const loadStats = useCallback(async () => {
    const s = await apiFetch<SessionStats>("/dialer/session-stats");
    if (s) setStats(s);
  }, []);

  const refreshPerms = useCallback(async () => {
    try {
      const p = await dialer.checkPermissions();
      setPerms(p);
      if (p.phoneState) {
        const list = await dialer.listSims();
        setSims(list);
        if (list.length === 1 && simIdRef.current !== list[0].id) {
          simIdRef.current = list[0].id;
          setSimId(list[0].id);
        }
      }
    } catch (e) {
      setError(`Could not check phone permissions: ${errMsg(e)}`);
    }
  }, []);

  const stopSession = useCallback((reason?: string) => {
    clearCountdown();
    setPhaseBoth("stopped");
    setAfterCallBoth("continue");
    dialer.stopSession().catch(() => {});
    if (reason) setError(reason);
    loadStats();
  }, [loadStats]);

  /** Dial the lead on screen. */
  const dialItem = useCallback(async (it: QueueItem) => {
    clearCountdown();
    pendingRef.current = false;
    setEnded(null);
    setCallStartedAt(null);
    setElapsed(0);
    setPhaseBoth("dialing");
    try {
      await dialer.startCall(it.phone, simIdRef.current || undefined);
    } catch (e) {
      setError(`Could not start the call: ${errMsg(e)}`);
      pendingRef.current = true; // Resume retries this same lead
      setPhaseBoth("paused");
    }
  }, []);

  const startCountdown = useCallback(() => {
    clearCountdown();
    setPhaseBoth("countdown");
    let left = COUNTDOWN_SECONDS;
    setCountdown(left);
    countdownRef.current = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0 && itemRef.current) dialItem(itemRef.current);
    }, 1000);
  }, [dialItem]);

  /**
   * Get the next lead from the queue. dialNow = call it straight away (Start /
   * Resume); otherwise show it as "Next up" during the 5 s countdown so the
   * agent can Skip it.
   */
  const queueNext = useCallback(async (dialNow: boolean) => {
    clearCountdown();
    setError("");
    setPhaseBoth("loading");
    const params = new URLSearchParams();
    if (skippedRef.current.length) params.set("skip", skippedRef.current.join(","));
    if (queueAgentRef.current) params.set("asAgentId", queueAgentRef.current);
    const qs = params.toString();
    const res = await apiFetch<{ item: QueueItem | null }>(
      `/dialer/next${qs ? `?${qs}` : ""}`,
      {},
      (msg) => setError(msg),
    );
    if (phaseRef.current !== "loading") return; // agent pressed Stop meanwhile
    if (!res) { setPhaseBoth("paused"); return; }
    if (!res.item) {
      setItemBoth(null);
      setPhaseBoth("empty");
      dialer.stopSession().catch(() => {});
      loadStats();
      return;
    }
    setItemBoth(res.item);
    pendingRef.current = true;
    if (dialNow) dialItem(res.item);
    else startCountdown();
  }, [loadStats, dialItem, startCountdown]);

  // Load saved SIM once.
  useEffect(() => {
    try { const saved = localStorage.getItem(SIM_KEY) ?? ""; simIdRef.current = saved; setSimId(saved); } catch { /* ignore */ }
  }, []);

  // Admins: load the seller list (same admin-only endpoint Call Compliance uses)
  // and the last queue they picked.
  useEffect(() => {
    if (getStoredUser()?.role !== "ADMIN") return;
    setIsAdmin(true);
    try { const saved = localStorage.getItem(QUEUE_AGENT_KEY) ?? ""; queueAgentRef.current = saved; setQueueAgentId(saved); } catch { /* ignore */ }
    apiFetch<Seller[]>("/call-compliance/agents", {}, (msg) => setError(`Could not load sellers: ${msg}`)).then((list) => {
      if (list) setSellers(list);
    });
  }, []);

  // Native listeners + live call timer.
  useEffect(() => {
    if (!isNative) return;
    refreshPerms();
    loadStats();
    const isCurrent = (number: string) => !!itemRef.current && last10(number) === last10(itemRef.current.phone);
    const handles = [
      dialer.onCallStarted((e) => {
        if (phaseRef.current !== "dialing" || !isCurrent(e.number)) return;
        setCallStartedAt(Date.now());
        setPhaseBoth("onCall");
      }),
      dialer.onCallEnded((e) => {
        // Ignore stale events from an earlier session (they're retained until read).
        if ((phaseRef.current !== "dialing" && phaseRef.current !== "onCall") || !isCurrent(e.number)) return;
        setEnded(e);
        setOutcome(e.answered ? null : "NOT_ANSWERED");
        setNote("");
        setCallbackAt("");
        setPhaseBoth("outcome");
      }),
      dialer.onControl((e) => {
        if (e.action === "stop") {
          if (phaseRef.current === "dialing" || phaseRef.current === "onCall" || phaseRef.current === "outcome") setAfterCallBoth("stop");
          else stopSession();
        } else if (phaseRef.current === "countdown") {
          clearCountdown();
          setPhaseBoth("paused");
        } else {
          setAfterCallBoth("pause");
        }
      }),
      dialer.onError((e) => {
        setError(e.message);
        if (phaseRef.current === "dialing" || phaseRef.current === "countdown" || phaseRef.current === "loading") {
          clearCountdown();
          setPhaseBoth("paused");
        }
      }),
    ];
    const onVisible = () => { if (document.visibilityState === "visible") refreshPerms(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      handles.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
      clearCountdown();
      if (phaseRef.current !== "idle" && phaseRef.current !== "stopped" && phaseRef.current !== "empty") {
        dialer.stopSession().catch(() => {});
      }
    };
  }, [isNative, refreshPerms, loadStats, stopSession]);

  useEffect(() => {
    if (phase !== "onCall" || !callStartedAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - callStartedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase, callStartedAt]);

  const start = async () => {
    setError("");
    if (!perms?.allGranted) { setError("Allow all the permissions below first."); return; }
    if (sims.length > 1 && !simIdRef.current) { setError("Choose which SIM to call from first."); return; }
    skippedRef.current = [];
    setAfterCallBoth("continue");
    try {
      await dialer.startSession();
    } catch (e) {
      setError(errMsg(e));
      return;
    }
    queueNext(true);
  };

  const resume = async () => {
    try { await dialer.startSession(); } catch (e) { setError(errMsg(e)); return; }
    const it = itemRef.current;
    if (pendingRef.current && it) dialItem(it); // the lead that was "Next up" when paused
    else queueNext(true);
  };

  const pause = () => {
    if (phaseRef.current === "countdown") { clearCountdown(); setPhaseBoth("paused"); }
    else setAfterCallBoth("pause"); // during a call: pause once the outcome is saved
  };

  const skip = () => {
    // Skip the "Next up" lead shown during the countdown (it isn't called).
    if (itemRef.current) skippedRef.current.push(last10(itemRef.current.phone));
    queueNext(false);
  };

  const stop = () => {
    if (phaseRef.current === "dialing" || phaseRef.current === "onCall" || phaseRef.current === "outcome" || phaseRef.current === "saving") {
      setAfterCallBoth("stop"); // still save this call's outcome first
    } else {
      stopSession();
    }
  };

  const saveOutcome = async () => {
    const current = itemRef.current;
    if (!current || !ended || !outcome) return;
    if (outcome === "CALLBACK" && !callbackAt) { setError("Pick the callback date and time."); return; }
    setError("");
    setPhaseBoth("saving");
    const saved = await apiMutate("/dialer/result", "POST", {
      leadId: current.leadId,
      importedContactId: current.importedContactId,
      followUpId: current.followUpId,
      number: current.phone,
      startedAt: new Date(ended.startedAt).toISOString(),
      durationSec: ended.durationSec,
      answered: ended.answered,
      outcome,
      note: note.trim() || undefined,
      callbackAt: outcome === "CALLBACK" ? new Date(callbackAt).toISOString() : undefined,
    }, (msg) => setError(msg));
    if (!saved) { setPhaseBoth("outcome"); return; } // keep the screen so nothing is lost
    loadStats();
    const next = afterCallRef.current;
    setAfterCallBoth("continue");
    pendingRef.current = false;
    if (next === "stop") stopSession();
    else if (next === "pause") setPhaseBoth("paused");
    else queueNext(false); // shows the next lead during the countdown
  };

  if (!isNative) {
    return (
      <DashboardShell>
        <div className="p-6 text-slate-700">Auto dialer works only in the RarePrint Android app</div>
      </DashboardShell>
    );
  }

  const running = ["loading", "dialing", "onCall", "outcome", "saving", "countdown", "paused"].includes(phase);
  const missingPerms = perms && !perms.allGranted;

  return (
    <DashboardShell>
      <div className="p-4 max-w-xl mx-auto space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Auto Dialer</h1>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words">{error}</div>
        )}

        {/* Today's stats */}
        {/* flex, not grid: the app's phone CSS forces .grid-cols-N to one column */}
        <section className="dialer-stats flex gap-2 text-center">
          <div className="flex-1 min-w-0 rounded-lg border p-2"><div className="text-xs text-slate-500">Calls today</div><div className="text-lg font-bold">{stats?.callsMade ?? "–"}</div></div>
          <div className="flex-1 min-w-0 rounded-lg border p-2"><div className="text-xs text-slate-500">Connected</div><div className="text-lg font-bold">{stats?.connected ?? "–"}</div></div>
          <div className="flex-1 min-w-0 rounded-lg border p-2"><div className="text-xs text-slate-500">Talk time</div><div className="text-lg font-bold">{stats ? talkTime(stats.talkTimeSec) : "–"}</div></div>
        </section>

        {/* Permissions (the app-launch screen asks too; this covers a revoked permission) */}
        {missingPerms && (
          <section className="rounded-lg border border-red-200 p-3 space-y-2 text-sm">
            <p className="font-semibold text-red-700">The dialer needs these permissions:</p>
            <ul className="list-disc pl-5 text-slate-700">
              {!perms.callPhone && <li>Make phone calls</li>}
              {!perms.phoneState && <li>Phone status (detect when a call ends)</li>}
              {!perms.callLog && <li>Call log (real call duration)</li>}
              {!perms.notifications && <li>Notifications</li>}
              {!perms.overlay && <li>Display over other apps (return to RarePrint after each call)</li>}
            </ul>
            <div className="flex flex-wrap gap-2">
              <button className="px-3 py-2 rounded-lg bg-blue-600 text-white" onClick={async () => { try { setPerms(await dialer.requestPermissions()); refreshPerms(); } catch (e) { setError(errMsg(e)); } }}>Allow permissions</button>
              {!perms.overlay && <button className="px-3 py-2 rounded-lg border" onClick={() => requestOverlayPermission()}>Allow display over apps</button>}
              <button className="px-3 py-2 rounded-lg border" onClick={() => dialer.openAppSettings().catch(() => {})}>Open app settings</button>
            </div>
          </section>
        )}

        {/* Admins: whose leads to dial */}
        {isAdmin && (
          <section className="rounded-lg border p-3 space-y-2">
            <label className="block text-sm">
              <span className="font-semibold">Whose leads to call</span>
              <select value={queueAgentId} disabled={running}
                onChange={(e) => {
                  queueAgentRef.current = e.target.value;
                  setQueueAgentId(e.target.value);
                  try { localStorage.setItem(QUEUE_AGENT_KEY, e.target.value); } catch { /* ignore */ }
                }}
                className="mt-1 w-full rounded-lg border px-3 py-2 bg-white">
                <option value="">My own leads</option>
                {sellers.map((s) => <option key={s.id} value={s.id}>{s.fullName}</option>)}
              </select>
            </label>
            {queueAgentId && (
              <p className="text-xs text-slate-500">
                Calls are saved under your name; the lead&apos;s status and follow-ups update on the seller&apos;s lead.
              </p>
            )}
          </section>
        )}

        {/* Dialer settings: SIM (picked once, saved) */}
        {sims.length > 1 && (
          <section className="rounded-lg border p-3 space-y-2">
            <h2 className="font-semibold text-sm">Call from SIM</h2>
            {sims.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="radio" name="sim" checked={simId === s.id} disabled={running}
                  onChange={() => { simIdRef.current = s.id; setSimId(s.id); try { localStorage.setItem(SIM_KEY, s.id); } catch { /* ignore */ } }} />
                <span className="break-words">{s.label}{s.slotIndex >= 0 ? ` (slot ${s.slotIndex + 1})` : ""}</span>
              </label>
            ))}
          </section>
        )}

        {/* Current lead */}
        {item && running && (
          <section className="rounded-lg border p-4 space-y-2">
            {phase === "countdown" && (
              <div className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Next up</div>
            )}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-lg font-bold text-slate-900 break-words">{item.name || "Unnamed"}</div>
                {item.businessName && <div className="text-sm text-slate-600 break-words">{item.businessName}</div>}
                <div className="text-sm text-slate-500">{item.phone}</div>
              </div>
              <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{SOURCE_LABELS[item.source] ?? item.source}</span>
            </div>
            {item.productInterest && <div className="text-sm"><span className="text-slate-500">Interested in: </span>{item.productInterest}</div>}
            {item.lastNote && <div className="text-sm break-words"><span className="text-slate-500">Last note: </span>{item.lastNote}</div>}
            {item.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {item.tags.map((t) => <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">{t}</span>)}
              </div>
            )}
            <div className="text-xs text-slate-500">Status: {item.status}</div>
          </section>
        )}

        {/* Live status + controls */}
        <section className="rounded-lg border p-4 space-y-3">
          <div className="text-sm text-slate-700">
            {phase === "idle" && "Tap Start Dialing to call your queue."}
            {phase === "loading" && "Getting the next lead…"}
            {phase === "dialing" && "Calling…"}
            {phase === "onCall" && <>On call <b className="font-mono">{mmss(elapsed)}</b></>}
            {(phase === "outcome" || phase === "saving") && "Call ended — save the outcome."}
            {phase === "countdown" && <>Next call in <b>{countdown}s</b></>}
            {phase === "paused" && "Paused."}
            {phase === "empty" && "No more leads to call right now."}
            {phase === "stopped" && "Dialer stopped."}
            {afterCall !== "continue" && (phase === "dialing" || phase === "onCall") && (
              <span className="block text-xs text-amber-700">Will {afterCall} after this call.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!running && (
              <button className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium disabled:opacity-50" disabled={!!missingPerms} onClick={start}>
                Start Dialing
              </button>
            )}
            {phase === "paused" && <button className="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={resume}>Resume</button>}
            {(phase === "countdown" || phase === "dialing" || phase === "onCall") && afterCall === "continue" && (
              <button className="px-4 py-2 rounded-lg border" onClick={pause}>Pause</button>
            )}
            {phase === "countdown" && <button className="px-4 py-2 rounded-lg border" onClick={skip}>Skip</button>}
            {running && <button className="px-4 py-2 rounded-lg bg-red-600 text-white" onClick={stop}>Stop</button>}
          </div>
        </section>
      </div>

      {/* Outcome screen — full-screen above the mobile topbar (z-9000). Portaled
          to <body>: on phones .erp-main is position:fixed, which makes its own
          stacking context, so even z-[9999] inside it stays under the topbar. */}
      {(phase === "outcome" || phase === "saving") && item && ended && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white overflow-y-auto">
          <div className="max-w-md mx-auto p-4 space-y-4" style={{ paddingTop: "calc(env(safe-area-inset-top) + 16px)" }}>
            <div>
              <div className="text-xs text-slate-500">Call ended · {ended.answered ? `talked ${mmss(ended.durationSec)}` : "not answered"}</div>
              <div className="text-xl font-bold text-slate-900 break-words">{item.name || item.phone}</div>
              {item.businessName && <div className="text-sm text-slate-600 break-words">{item.businessName}</div>}
            </div>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words">{error}</div>}
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button key={o.value} type="button" onClick={() => setOutcome(o.value)}
                  className={`rounded-lg px-3 py-3 text-sm font-medium ${outcome === o.value ? `${o.className} ring-4 ring-offset-1 ring-slate-300` : "border border-slate-300 text-slate-800"}`}>
                  {o.label}
                </button>
              ))}
            </div>
            {outcome === "CALLBACK" && (
              <label className="block text-sm">
                <span className="text-slate-700">Callback date & time</span>
                <input type="datetime-local" value={callbackAt} onChange={(e) => { setCallbackAt(e.target.value); setError(""); }}
                  className="mt-1 w-full rounded-lg border px-3 py-2" />
              </label>
            )}
            <label className="block text-sm">
              <span className="text-slate-700">Note (optional)</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000}
                className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="What did they say?" />
            </label>
            {afterCall !== "continue" && <p className="text-xs text-amber-700">The dialer will {afterCall} after you save.</p>}
            <button type="button" onClick={saveOutcome} disabled={!outcome || phase === "saving"}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white font-medium disabled:opacity-50">
              {phase === "saving" ? "Saving…" : afterCall === "continue" ? "Save & next" : "Save"}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </DashboardShell>
  );
}
