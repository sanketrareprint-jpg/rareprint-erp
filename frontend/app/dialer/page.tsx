"use client";
// Auto dialer — dialing runs in the Android app only. Calls the agent's queue one after another:
//   GET /dialer/next → native startCall → call ends → outcome screen →
//   POST /dialer/result → next lead dialed straight away (no countdown).
// The outcome can also be typed on the PC (components/DialerDeskPopup.tsx):
// the phone picks it up from GET /dialer/desk-response and saves it itself.
// On the website this page shows the calling stats + (admins) dialer settings.
// Native side: CallManagerPlugin.kt + DialerService.kt (lib/plugins/CallManager.ts).
// Backend: backend/src/dialer (queue order, locks, status updates).
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DashboardShell } from "@/components/dashboard-shell";
import { AgentCallStats } from "@/components/AgentCallStats";
import { DialerSettingsPanel } from "@/components/DialerSettingsPanel";
import { DIAL_LISTS, DIALER_OUTCOMES as OUTCOMES, DIALER_SOURCE_LABELS as SOURCE_LABELS, type DialerOutcome as Outcome } from "@/lib/dialerShared";
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
const LIST_KEY = "dialer_list"; // which list to dial (DIAL_LISTS)
const DESK_POLL_MS = 2000; // outcome screen: how often to check for a response typed on the PC

type OutcomeValues = {
  outcome: Outcome; note: string; callbackAtIso: string | null;
  // From the PC popup only: why not interested + products discussed (sent as-is).
  notInterestedReason?: string | null;
  products?: Array<{ productId: string; quantity: number | null; rate: number | null }>;
};
/** GET /dialer/desk-response */
interface DeskReply {
  response: {
    outcome: Outcome; note: string | null; callbackAt: string | null; submittedAt: string;
    notInterestedReason: string | null;
    products: Array<{ productId: string; quantity: number | null; rate: number | null }>;
    then: "NEXT" | "PAUSE" | "STOP";
  } | null;
  endCallRequested: boolean;
}

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

type Phase = "idle" | "loading" | "dialing" | "onCall" | "outcome" | "saving" | "paused" | "empty" | "stopped";

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const mmss = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
/** ISO instant → the phone's local "YYYY-MM-DDTHH:mm" for a datetime-local input. */
const toLocalInput = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
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
  const [stats, setStats] = useState<SessionStats | null>(null);
  const [error, setError] = useState("");
  const [afterCall, setAfterCall] = useState<"continue" | "pause" | "stop">("continue");
  const [simWarning, setSimWarning] = useState(""); // set when a call went out on the wrong SIM
  // Admins only: dial a chosen seller's queue instead of their own.
  const [isAdmin, setIsAdmin] = useState(false);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [queueAgentId, setQueueAgentId] = useState("");
  const queueAgentRef = useRef("");
  const [dialList, setDialList] = useState("ALL");
  const dialListRef = useRef("ALL");
  const [fromPc, setFromPc] = useState(false); // outcome being saved came from the PC popup
  const [askList, setAskList] = useState(false); // "Which list to call?" shown before every Start

  // Refs mirror state for native listeners and timers.
  const phaseRef = useRef<Phase>("idle");
  const itemRef = useRef<QueueItem | null>(null);
  const simIdRef = useRef("");
  const afterCallRef = useRef<"continue" | "pause" | "stop">("continue");
  const pendingRef = useRef(false); // lead on screen whose call couldn't be started (Resume retries it)

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const setItemBoth = (i: QueueItem | null) => { itemRef.current = i; setItem(i); };
  const setAfterCallBoth = (a: "continue" | "pause" | "stop") => { afterCallRef.current = a; setAfterCall(a); };

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
        // A saved SIM whose ID isn't on the phone any more (reboot / SIM swap) is
        // cleared — never left looking "chosen" while calls go out on the default SIM.
        if (simIdRef.current && !list.some((s) => s.id === simIdRef.current)) {
          simIdRef.current = "";
          setSimId("");
          try { localStorage.removeItem(SIM_KEY); } catch { /* ignore */ }
          if (list.length > 1) setError("The SIM saved for the dialer isn't on this phone any more — choose the SIM again.");
        }
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
    setPhaseBoth("stopped");
    setAfterCallBoth("continue");
    dialer.stopSession().catch(() => {});
    if (reason) setError(reason);
    loadStats();
  }, [loadStats]);

  /** Dial the lead on screen. */
  const dialItem = useCallback(async (it: QueueItem) => {
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

  /** Get the next lead from the queue and dial it straight away. */
  const queueNext = useCallback(async () => {
    setError("");
    setPhaseBoth("loading");
    const params = new URLSearchParams();
    if (queueAgentRef.current) params.set("asAgentId", queueAgentRef.current);
    if (dialListRef.current !== "ALL") params.set("list", dialListRef.current);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const res = await apiFetch<{ item: QueueItem | null }>(`/dialer/next${qs}`, {}, (msg) => setError(msg));
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
    dialItem(res.item);
  }, [loadStats, dialItem]);

  // Load saved SIM + dial list once.
  useEffect(() => {
    try { const saved = localStorage.getItem(SIM_KEY) ?? ""; simIdRef.current = saved; setSimId(saved); } catch { /* ignore */ }
    try {
      const savedList = localStorage.getItem(LIST_KEY) ?? "ALL";
      if (DIAL_LISTS.some((l) => l.value === savedList)) { dialListRef.current = savedList; setDialList(savedList); }
    } catch { /* ignore */ }
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
        // The phone's call log says this call went out on a different SIM than
        // chosen: warn, and pause after this outcome is saved so it can't repeat.
        if (e.simMatched === false) {
          setSimWarning("This call went out on a different SIM than the one chosen. The dialer will pause after you save — check the SIM choice before resuming.");
          setAfterCallBoth("pause");
        }
        setOutcome(e.answered ? null : "NOT_ANSWERED");
        setNote("");
        setCallbackAt("");
        setPhaseBoth("outcome");
      }),
      dialer.onControl((e) => {
        if (e.action === "stop") {
          if (phaseRef.current === "dialing" || phaseRef.current === "onCall" || phaseRef.current === "outcome") setAfterCallBoth("stop");
          else stopSession();
        } else {
          setAfterCallBoth("pause"); // takes effect once this call's outcome is saved
        }
      }),
      dialer.onError((e) => {
        setError(e.message);
        // Native side refused because the chosen SIM isn't on the phone: reload the SIM list.
        if (/SIM chosen/.test(e.message)) {
          simIdRef.current = "";
          setSimId("");
          try { localStorage.removeItem(SIM_KEY); } catch { /* ignore */ }
          refreshPerms();
        }
        if (phaseRef.current === "dialing") pendingRef.current = true; // the call never went out — Resume retries this lead
        if (phaseRef.current === "dialing" || phaseRef.current === "loading") setPhaseBoth("paused");
      }),
    ];
    const onVisible = () => { if (document.visibilityState === "visible") refreshPerms(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      handles.forEach((h) => h.then((x) => x.remove()).catch(() => {}));
      if (phaseRef.current !== "idle" && phaseRef.current !== "stopped" && phaseRef.current !== "empty") {
        dialer.stopSession().catch(() => {});
      }
    };
  }, [isNative, refreshPerms, loadStats, stopSession]);

  // Tell the backend what this phone is doing, so the PC popup shows only
  // during a lead call: dialing / on call / call ended but outcome not saved.
  // Paused, stopped, queue empty or leaving this screen → NONE (popup closes).
  // "loading" is skipped: the previous number's lock is already gone by then.
  const liveReportedRef = useRef("");
  useEffect(() => {
    if (!isNative || phase === "loading") return;
    const state = phase === "dialing" ? "DIALING"
      : phase === "onCall" ? "ON_CALL"
      : phase === "outcome" || phase === "saving" ? "WRAP_UP"
      : "NONE";
    const number = state === "NONE" ? "" : item?.phone ?? "";
    if (state !== "NONE" && !number) return;
    const key = `${state}|${number}`;
    if (key === liveReportedRef.current) return;
    liveReportedRef.current = key;
    apiMutate("/dialer/live-state", "POST", state === "NONE" ? { state } : { state, number });
  }, [isNative, phase, item]);
  useEffect(() => {
    if (!isNative) return;
    return () => { apiMutate("/dialer/live-state", "POST", { state: "NONE" }); };
  }, [isNative]);

  useEffect(() => {
    if (phase !== "onCall" || !callStartedAt) return;
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - callStartedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase, callStartedAt]);

  /** Start Dialing: check the phone is ready, then ask which list to call. */
  const askToStart = () => {
    setError("");
    if (!perms?.allGranted) { setError("Allow all the permissions below first."); return; }
    if (sims.length > 1 && !sims.some((s) => s.id === simIdRef.current)) { setError("Choose which SIM to call from first."); return; }
    setAskList(true);
  };

  const chooseList = (value: string) => {
    dialListRef.current = value;
    setDialList(value);
    try { localStorage.setItem(LIST_KEY, value); } catch { /* ignore */ }
  };

  const start = async () => {
    setAskList(false);
    setError("");
    if (!perms?.allGranted) { setError("Allow all the permissions below first."); return; }
    if (sims.length > 1 && !sims.some((s) => s.id === simIdRef.current)) { setError("Choose which SIM to call from first."); return; }
    setSimWarning("");
    setAfterCallBoth("continue");
    try {
      await dialer.startSession();
    } catch (e) {
      setError(errMsg(e));
      return;
    }
    queueNext();
  };

  const resume = async () => {
    if (sims.length > 1 && !sims.some((s) => s.id === simIdRef.current)) { setError("Choose which SIM to call from first."); return; }
    setSimWarning("");
    try { await dialer.startSession(); } catch (e) { setError(errMsg(e)); return; }
    const it = itemRef.current;
    if (pendingRef.current && it) dialItem(it); // retry the lead whose call couldn't start
    else queueNext();
  };

  // During a call: pause once this call's outcome is saved.
  const pause = () => setAfterCallBoth("pause");

  const stop = () => {
    if (phaseRef.current === "dialing" || phaseRef.current === "onCall" || phaseRef.current === "outcome" || phaseRef.current === "saving") {
      setAfterCallBoth("stop"); // still save this call's outcome first
    } else {
      stopSession();
    }
  };

  /**
   * Save the outcome, then: "next" = dial the next lead straight away,
   * "pause" / "stop" = don't. A Pause/Stop pressed during the call (page or
   * notification) wins over the button tapped here.
   */
  const saveOutcome = async (mode: "next" | "pause" | "stop", fromDesk?: OutcomeValues) => {
    const current = itemRef.current;
    if (phaseRef.current !== "outcome") return; // already saving (phone tap and PC response racing)
    const values: OutcomeValues | null = fromDesk ?? (outcome ? {
      outcome,
      note: note.trim(),
      callbackAtIso: outcome === "CALLBACK" && callbackAt ? new Date(callbackAt).toISOString() : null,
    } : null);
    if (!current || !ended || !values) return;
    if (values.outcome === "CALLBACK" && !values.callbackAtIso) { setError("Pick the callback date and time."); return; }
    setError("");
    setFromPc(!!fromDesk);
    setPhaseBoth("saving");
    const saved = await apiMutate("/dialer/result", "POST", {
      leadId: current.leadId,
      importedContactId: current.importedContactId,
      followUpId: current.followUpId,
      number: current.phone,
      startedAt: new Date(ended.startedAt).toISOString(),
      durationSec: ended.durationSec,
      answered: ended.answered,
      outcome: values.outcome,
      note: values.note || undefined,
      callbackAt: values.outcome === "CALLBACK" ? values.callbackAtIso : undefined,
      notInterestedReason: values.notInterestedReason || undefined,
      products: values.products?.length ? values.products : undefined,
    }, (msg) => setError(msg));
    setFromPc(false);
    if (!saved) {
      // Keep the screen so nothing is lost; show what the PC sent so the agent can save it by hand.
      if (fromDesk) { setOutcome(fromDesk.outcome); setNote(fromDesk.note); if (fromDesk.callbackAtIso) setCallbackAt(toLocalInput(fromDesk.callbackAtIso)); }
      setPhaseBoth("outcome");
      return;
    }
    loadStats();
    const then = afterCallRef.current !== "continue" ? afterCallRef.current : mode;
    setAfterCallBoth("continue");
    pendingRef.current = false;
    if (then === "stop") stopSession();
    else if (then === "pause") setPhaseBoth("paused");
    else queueNext(); // dial the next lead now
  };
  const saveOutcomeRef = useRef(saveOutcome);
  saveOutcomeRef.current = saveOutcome;
  const deskTriedRef = useRef(""); // PC response already tried — a failed save isn't retried in a loop
  const endCallTriedRef = useRef(""); // PC "End call" already acted on for this call

  // The PC popup (same login), checked every DESK_POLL_MS during the call and
  // on the outcome screen:
  //  - "End call" pressed there while dialing / on the call → hang up here.
  //  - Reply saved there → once the call has ended, save it with the real
  //    duration (no need to choose it again here), then call next / pause /
  //    stop as chosen on the PC.
  useEffect(() => {
    if (!isNative || (phase !== "dialing" && phase !== "onCall" && phase !== "outcome") || !item) return;
    let cancelled = false;
    const check = async () => {
      const res = await apiFetch<DeskReply>(`/dialer/desk-response?phone=${encodeURIComponent(item.phone)}`);
      if (cancelled || !res) return;
      const p = phaseRef.current;
      if (res.endCallRequested && (p === "dialing" || p === "onCall") && endCallTriedRef.current !== item.phone) {
        endCallTriedRef.current = item.phone;
        dialer.endCall().catch((e) => setError(`Could not end the call from the PC: ${errMsg(e)}`));
      }
      if (!res.response || p !== "outcome") return;
      const r = res.response;
      const key = `${item.phone}|${r.submittedAt}`;
      if (deskTriedRef.current === key) return;
      deskTriedRef.current = key;
      const mode = r.then === "PAUSE" ? "pause" : r.then === "STOP" ? "stop" : "next";
      saveOutcomeRef.current(mode, {
        outcome: r.outcome, note: r.note ?? "", callbackAtIso: r.callbackAt,
        notInterestedReason: r.notInterestedReason, products: r.products,
      });
    };
    check();
    const t = setInterval(check, DESK_POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [isNative, phase, item]);

  if (!isNative) {
    return (
      <DashboardShell>
        <div className="p-6 space-y-4">
          <h1 className="text-xl font-bold text-slate-900">Power Dialer</h1>
          <p className="text-sm text-slate-700">
            Dialing runs in the RarePrint Android app. Log in here with the same account: while your phone is dialing,
            this website shows the customer with a form for their reply — saving it makes the phone dial the next number.
          </p>
          <AgentCallStats />
          {isAdmin && <DialerSettingsPanel />}
        </div>
      </DashboardShell>
    );
  }

  const running = ["loading", "dialing", "onCall", "outcome", "saving", "paused"].includes(phase);
  const missingPerms = perms && !perms.allGranted;

  return (
    <DashboardShell>
      <div className="p-4 max-w-xl mx-auto space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Auto Dialer</h1>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 break-words">{error}</div>
        )}
        {simWarning && (
          <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-medium text-red-800 break-words">⚠ {simWarning}</div>
        )}

        {/* Today's stats */}
        {/* flex, not grid: the app's phone CSS forces .grid-cols-N to one column */}
        <section className="dialer-stats flex gap-2 text-center">
          <div className="flex-1 min-w-0 rounded-lg border p-2"><div className="text-xs text-slate-500">Calls today</div><div className="text-lg font-bold">{stats?.callsMade ?? "–"}</div></div>
          <div className="flex-1 min-w-0 rounded-lg border p-2"><div className="text-xs text-slate-500">Connected</div><div className="text-lg font-bold">{stats?.connected ?? "–"}</div></div>
          <div className="flex-1 min-w-0 rounded-lg border p-2"><div className="text-xs text-slate-500">Talk time</div><div className="text-lg font-bold">{stats ? talkTime(stats.talkTimeSec) : "–"}</div></div>
        </section>

        {/* Calls & leads by agent (shared with Dashboard + CRM) */}
        <AgentCallStats />

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

        {/* Optional: lets "End call" on the PC hang up this phone (app builds with end-call support only) */}
        {perms && !missingPerms && perms.endCall === false && (
          <section className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2 text-sm">
            <p className="text-amber-800">Allow RarePrint to end calls, so <b>End call</b> on your PC can hang up this phone.</p>
            <button className="px-3 py-2 rounded-lg bg-amber-600 text-white" onClick={async () => { try { setPerms(await dialer.requestPermissions()); refreshPerms(); } catch (e) { setError(errMsg(e)); } }}>Allow ending calls</button>
          </section>
        )}

        {/* Which list is being dialed (chosen in the prompt on Start Dialing) */}
        {running && (
          <section className="rounded-lg border p-3 text-sm">
            <span className="text-slate-500">Calling list: </span>
            <span className="font-semibold">{DIAL_LISTS.find((l) => l.value === dialList)?.label ?? dialList}</span>
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
            {(phase === "outcome" || phase === "saving") && "Call ended — save the outcome (here or on your PC)."}
            {phase === "paused" && "Paused."}
            {phase === "empty" && "No more leads to call right now."}
            {phase === "stopped" && "Dialer stopped."}
            {afterCall !== "continue" && (phase === "dialing" || phase === "onCall") && (
              <span className="block text-xs text-amber-700">Will {afterCall} after this call.</span>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {!running && (
              <button className="px-4 py-2 rounded-lg bg-green-600 text-white font-medium disabled:opacity-50" disabled={!!missingPerms} onClick={askToStart}>
                Start Dialing
              </button>
            )}
            {phase === "paused" && <button className="px-4 py-2 rounded-lg bg-blue-600 text-white" onClick={resume}>Resume</button>}
            {(phase === "dialing" || phase === "onCall") && afterCall === "continue" && (
              <button className="px-4 py-2 rounded-lg border" onClick={pause}>Pause</button>
            )}
            {running && <button className="px-4 py-2 rounded-lg bg-red-600 text-white" onClick={stop}>Stop</button>}
          </div>
        </section>
      </div>

      {/* "Which list to call?" — asked on every Start Dialing. Portaled for the
          same reason as the outcome screen below. */}
      {askList && !running && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl p-4 space-y-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}>
            <h2 className="text-lg font-bold text-slate-900">Which list do you want to call?</h2>
            <select value={dialList} onChange={(e) => chooseList(e.target.value)}
              className="w-full rounded-lg border px-3 py-3 bg-white text-sm">
              {DIAL_LISTS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
            <div className="flex gap-2">
              <button type="button" onClick={() => setAskList(false)}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-3 text-sm font-medium text-slate-700">
                Cancel
              </button>
              <button type="button" onClick={start}
                className="flex-1 rounded-lg bg-green-600 px-3 py-3 text-sm font-medium text-white">
                Start calling
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

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
            {simWarning && <div className="rounded-lg border-2 border-red-400 bg-red-50 p-3 text-sm font-medium text-red-800 break-words">⚠ {simWarning}</div>}
            {fromPc && <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">Reply received from your PC — saving and calling the next number…</div>}
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
            <button type="button" onClick={() => saveOutcome("next")} disabled={!outcome || phase === "saving"}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-white font-medium disabled:opacity-50">
              {phase === "saving" ? "Saving…" : afterCall === "continue" ? "Save & call next" : "Save"}
            </button>
            {afterCall === "continue" && (
              <div className="flex gap-2">
                <button type="button" onClick={() => saveOutcome("pause")} disabled={!outcome || phase === "saving"}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">
                  Save & pause
                </button>
                <button type="button" onClick={() => saveOutcome("stop")} disabled={!outcome || phase === "saving"}
                  className="flex-1 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-50">
                  Save & stop
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </DashboardShell>
  );
}
