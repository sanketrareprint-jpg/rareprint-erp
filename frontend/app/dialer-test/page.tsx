"use client";
// Phase 1 auto-dialer proof test — hidden (no sidebar link; open it by tapping
// the "CRM — Leads" title 5 times in the Android app). Dials the 3 hard-coded
// TEST_NUMBERS back-to-back, auto-advancing 5 s after each call ends.
// No backend calls: results are only shown on screen.
import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardShell } from "@/components/dashboard-shell";
import { DialerBatteryGuide } from "@/components/dialer-setup-check";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import {
  dialer,
  requestOverlayPermission,
  type DialerCallEnded,
  type DialerPermissionStatus,
  type DialerSim,
} from "@/lib/plugins/CallManager";

// Phase 1 test numbers — dummy numbers for the Android emulator (calls go nowhere there).
const TEST_NUMBERS: string[] = ["1111111111", "2222222222", "3333333333"];

const SIM_KEY = "dialer_sim_id";
const COUNTDOWN_SECONDS = 5;

type Phase = "idle" | "dialing" | "onCall" | "countdown" | "paused" | "done";

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString();
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function readStoredSim(): string {
  try { return localStorage.getItem(SIM_KEY) ?? ""; } catch { return ""; }
}
function writeStoredSim(id: string) {
  try { localStorage.setItem(SIM_KEY, id); } catch { /* ignore */ }
}

export default function DialerTestPage() {
  const isNative = useIsNativeApp();
  const [perms, setPerms] = useState<DialerPermissionStatus | null>(null);
  const [sims, setSims] = useState<DialerSim[]>([]);
  const [simId, setSimId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [index, setIndex] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [results, setResults] = useState<DialerCallEnded[]>([]);
  const [log, setLog] = useState<string[]>([]);

  // Refs mirror state for the native event listeners (registered once).
  const phaseRef = useRef<Phase>("idle");
  const indexRef = useRef(0);
  const simIdRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const numbersMissing = TEST_NUMBERS.some((n) => !n.trim());

  const addLog = useCallback((msg: string) => {
    setLog((l) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...l].slice(0, 100));
  }, []);
  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const setIndexBoth = (i: number) => { indexRef.current = i; setIndex(i); };

  const refreshPerms = useCallback(async () => {
    try {
      const p = await dialer.checkPermissions();
      setPerms(p);
      if (p.phoneState) {
        const list = await dialer.listSims();
        setSims(list);
        if (!simIdRef.current && list.length === 1) {
          simIdRef.current = list[0].id;
          setSimId(list[0].id);
        }
      }
    } catch (e: unknown) {
      addLog(`Permission check failed: ${errMsg(e)}`);
    }
  }, [addLog]);

  // Load the saved SIM once.
  useEffect(() => {
    const savedSim = readStoredSim();
    simIdRef.current = savedSim;
    setSimId(savedSim);
  }, []);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const finishSession = useCallback((reason: string) => {
    clearTimer();
    setPhaseBoth("done");
    dialer.stopSession().catch(() => {});
    addLog(reason);
  }, [addLog]);

  const dialAt = useCallback(async (i: number) => {
    clearTimer();
    if (i >= TEST_NUMBERS.length) { finishSession("All numbers done — session stopped."); return; }
    const number = TEST_NUMBERS[i].trim();
    setIndexBoth(i);
    setPhaseBoth("dialing");
    addLog(`Dialing #${i + 1}: ${number}${simIdRef.current ? ` (SIM ${simIdRef.current})` : " (no SIM chosen)"}`);
    try {
      await dialer.startCall(number, simIdRef.current || undefined);
    } catch (e: unknown) {
      addLog(`startCall failed: ${errMsg(e)}`);
      setPhaseBoth("paused");
    }
  }, [addLog, finishSession]);

  const startCountdown = useCallback((nextIndex: number) => {
    clearTimer();
    if (nextIndex >= TEST_NUMBERS.length) { finishSession("All numbers done — session stopped."); return; }
    setPhaseBoth("countdown");
    let left = COUNTDOWN_SECONDS;
    setCountdown(left);
    timerRef.current = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) dialAt(nextIndex);
    }, 1000);
  }, [dialAt, finishSession]);

  // Native listeners — registered once while on this page.
  useEffect(() => {
    if (!isNative) return;
    refreshPerms();
    const handles: Array<Promise<{ remove: () => void }>> = [
      dialer.onCallStarted((e) => {
        addLog(`callStarted ${e.number}`);
        if (phaseRef.current === "dialing") setPhaseBoth("onCall");
      }),
      dialer.onCallEnded((e) => {
        addLog(`callEnded ${e.number} — ${e.durationSec}s, answered=${e.answered}, type=${e.callType}`);
        setResults((r) => [...r, e]);
        if (phaseRef.current === "dialing" || phaseRef.current === "onCall") {
          startCountdown(indexRef.current + 1);
        }
      }),
      dialer.onControl((e) => {
        addLog(`Notification button: ${e.action}`);
        if (e.action === "stop") finishSession("Stopped from notification.");
        else { clearTimer(); setPhaseBoth("paused"); }
      }),
      dialer.onError((e) => {
        addLog(`Native error: ${e.message}`);
        // e.g. "A call is still in progress" — stop auto-advancing until the agent resumes.
        if (phaseRef.current === "dialing" || phaseRef.current === "countdown") {
          clearTimer();
          setPhaseBoth("paused");
        }
      }),
    ];
    // Re-check permissions when the agent comes back from Android Settings.
    const onVisible = () => { if (document.visibilityState === "visible") refreshPerms(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      handles.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
      clearTimer();
    };
  }, [isNative, refreshPerms, addLog, startCountdown, finishSession]);

  const start = async () => {
    if (numbersMissing) { addLog("Cannot start — TEST_NUMBERS in app/dialer-test/page.tsx are not filled in."); return; }
    if (!perms?.allGranted) { addLog("Cannot start — permissions missing (see above)."); return; }
    if (sims.length > 1 && !simIdRef.current) { addLog("Choose a SIM first."); return; }
    setResults([]);
    try {
      await dialer.startSession();
    } catch (e: unknown) {
      addLog(`startSession failed: ${errMsg(e)}`);
      return;
    }
    dialAt(0);
  };

  const pause = () => { clearTimer(); setPhaseBoth("paused"); addLog("Paused"); };
  const resume = () => { addLog("Resumed"); dialAt(indexRef.current + 1); };
  const skipNext = () => { addLog(`Skipped #${indexRef.current + 2}`); startCountdown(indexRef.current + 2); };
  const stop = () => finishSession("Stopped by agent.");

  if (!isNative) {
    return (
      <DashboardShell>
        <div className="p-6 text-gray-700">Auto dialer works only in the RarePrint Android app</div>
      </DashboardShell>
    );
  }

  const permRows: Array<[keyof DialerPermissionStatus, string]> = [
    ["callPhone", "Make phone calls"],
    ["phoneState", "Phone status (detect call end)"],
    ["callLog", "Call log (real call duration)"],
    ["notifications", "Notifications"],
    ["overlay", "Display over other apps (return to app after call)"],
  ];
  const running = phase === "dialing" || phase === "onCall" || phase === "countdown" || phase === "paused";

  return (
    <DashboardShell>
      <div className="p-4 max-w-xl mx-auto space-y-4">
        <h1 className="text-xl font-bold">Auto Dialer — Phase 1 Test</h1>

        {/* Permissions */}
        <section className="rounded-lg border p-3 space-y-2">
          <h2 className="font-semibold">Permissions</h2>
          {!perms && <p className="text-sm text-gray-500">Checking…</p>}
          {perms && permRows.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between text-sm gap-2">
              <span className="break-words">{label}</span>
              <span className={perms[key] ? "text-green-600" : "text-red-600 font-semibold"}>
                {perms[key] ? "OK" : "Missing"}
              </span>
            </div>
          ))}
          {perms && !perms.allGranted && (
            <p className="text-sm text-red-600">The dialer cannot run until every red item is OK.</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="px-3 py-2 rounded bg-blue-600 text-white text-sm"
              onClick={async () => { try { setPerms(await dialer.requestPermissions()); refreshPerms(); } catch (e: unknown) { addLog(`requestPermissions failed: ${errMsg(e)}`); } }}>
              Grant permissions
            </button>
            <button className="px-3 py-2 rounded border text-sm" onClick={() => dialer.openAppSettings()}>
              Open app settings
            </button>
            {perms && !perms.overlay && (
              <button className="px-3 py-2 rounded border text-sm" onClick={() => requestOverlayPermission()}>
                Allow display over apps
              </button>
            )}
          </div>
        </section>

        {/* Battery + autostart (same guide as the one-time launch screen) */}
        {perms && (
          <section className="rounded-lg border p-3 space-y-2">
            <h2 className="font-semibold">Keep the dialer running</h2>
            <DialerBatteryGuide perms={perms} />
          </section>
        )}

        {/* SIM */}
        <section className="rounded-lg border p-3 space-y-2">
          <h2 className="font-semibold">SIM to call from</h2>
          {sims.length === 0 && <p className="text-sm text-gray-500">No SIMs listed (grant phone status permission first).</p>}
          {sims.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="radio" name="sim" checked={simId === s.id} disabled={running}
                onChange={() => { simIdRef.current = s.id; setSimId(s.id); writeStoredSim(s.id); }} />
              <span className="break-words">{s.label}{s.slotIndex >= 0 ? ` (slot ${s.slotIndex + 1})` : ""}</span>
            </label>
          ))}
        </section>

        {/* Numbers (hard-coded) */}
        <section className="rounded-lg border p-3 space-y-1">
          <h2 className="font-semibold">Test numbers</h2>
          {TEST_NUMBERS.map((n, i) => (
            <div key={i} className={`text-sm ${running && i === index ? "font-bold text-blue-700" : ""}`}>
              #{i + 1}: {n.trim() || <span className="text-red-600">not set</span>}
            </div>
          ))}
          {numbersMissing && (
            <p className="text-sm text-red-600">Fill in TEST_NUMBERS in app/dialer-test/page.tsx and rebuild the APK.</p>
          )}
        </section>

        {/* Controls */}
        <section className="rounded-lg border p-3 space-y-3">
          <div className="text-sm">
            Status: <b>{phase}</b>{running && ` — number ${index + 1} of ${TEST_NUMBERS.length}`}
            {phase === "countdown" && <> — next call in <b>{countdown}s</b></>}
          </div>
          <div className="flex flex-wrap gap-2">
            {!running && <button className="px-4 py-2 rounded bg-green-600 text-white" onClick={start}>Start Dialing</button>}
            {phase === "countdown" && <button className="px-4 py-2 rounded border" onClick={pause}>Pause</button>}
            {phase === "countdown" && <button className="px-4 py-2 rounded border" onClick={skipNext}>Skip</button>}
            {phase === "paused" && <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={resume}>Resume</button>}
            {running && <button className="px-4 py-2 rounded bg-red-600 text-white" onClick={stop}>Stop</button>}
          </div>
        </section>

        {/* Results */}
        {results.length > 0 && (
          <section className="rounded-lg border p-3 space-y-1">
            <h2 className="font-semibold">Results</h2>
            {results.map((r, i) => (
              <div key={i} className="text-sm break-words">
                {fmtTime(r.startedAt)} · {r.number} · {r.answered ? `answered ${r.durationSec}s` : "not answered"} · {r.callType}
              </div>
            ))}
          </section>
        )}

        {/* Event log — screenshot this when reporting a problem */}
        <section className="rounded-lg border p-3">
          <h2 className="font-semibold mb-1">Event log</h2>
          <pre className="text-xs whitespace-pre-wrap break-words max-h-80 overflow-y-auto">{log.join("\n") || "—"}</pre>
        </section>
      </div>
    </DashboardShell>
  );
}
