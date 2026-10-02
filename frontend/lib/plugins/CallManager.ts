/**
 * CallManager — TypeScript bridge to the native Capacitor plugin.
 * Uses registerPlugin() — the correct API for Capacitor v3/v4/v5.
 *
 * On Android APK  → all calls go to CallManagerPlugin.kt
 * On web / browser → safe fallbacks so the CRM still works
 */
import { registerPlugin } from "@capacitor/core";

// ── Native plugin interface ───────────────────────────────────────────────────
interface NativeCallManager {
  hasOverlayPermission(): Promise<{ granted: boolean }>;
  requestOverlayPermission(): Promise<{ opened?: boolean; granted?: boolean }>;
  requestCallLogPermission(): Promise<{ granted: boolean }>;
  startCallMonitoring(): Promise<{ monitoring: boolean }>;
  stopCallMonitoring(): Promise<{ monitoring: boolean }>;
  showCallOverlay(opts: { leadName: string; phone: string }): Promise<{ shown: boolean }>;
  hideCallOverlay(): Promise<{ hidden: boolean }>;
  makeCall(opts: { phone: string }): Promise<{ dialed: boolean; phone: string }>;
  getRecentCallLogs(opts: { limit: number }): Promise<{ calls: CallLogEntry[] }>;
  addListener(
    event: "callStateChanged",
    handler: (data: CallStateEvent) => void
  ): Promise<{ remove: () => void }>;
  removeAllListeners(): Promise<void>;
  // Auto dialer
  checkPermissions(): Promise<DialerPermissionStatus>;
  requestPermissions(): Promise<DialerPermissionStatus>;
  openAppSettings(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  listSims(): Promise<{ sims: DialerSim[] }>;
  startDialerSession(): Promise<void>;
  stopDialerSession(): Promise<void>;
  startCall(opts: { number: string; simId?: string }): Promise<{ dialing: boolean; number: string }>;
  addListener(event: "callStarted", handler: (data: DialerCallStarted) => void): Promise<{ remove: () => void }>;
  addListener(event: "callEnded", handler: (data: DialerCallEnded) => void): Promise<{ remove: () => void }>;
  addListener(event: "dialerControl", handler: (data: { action: "pause" | "stop" }) => void): Promise<{ remove: () => void }>;
  addListener(event: "dialerError", handler: (data: { message: string }) => void): Promise<{ remove: () => void }>;
}

// Register with Capacitor — returns native plugin on Android, no-op proxy on web
const _plugin = registerPlugin<NativeCallManager>("CallManager");

// ── Types ─────────────────────────────────────────────────────────────────────
export type CallState = "IDLE" | "RINGING" | "OFFHOOK";
export type CallOutcome = "ANSWERED" | "MISSED" | "UNKNOWN";

export interface CallStateEvent {
  state: CallState;
  outcome?: CallOutcome;
  duration?: number;   // seconds
  phone?: string;
}

export interface CallLogEntry {
  number: string;
  type: "INCOMING" | "OUTGOING" | "MISSED" | "UNKNOWN";
  duration: number;    // seconds
  date: number;        // epoch ms
}

// ── Runtime detection ─────────────────────────────────────────────────────────
function isCapacitor(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window as any).Capacitor?.isNativePlatform?.()
  );
}

// ── Overlay permission ────────────────────────────────────────────────────────
export async function hasOverlayPermission(): Promise<boolean> {
  if (!isCapacitor()) return false;
  try {
    const { granted } = await _plugin.hasOverlayPermission();
    return !!granted;
  } catch { return false; }
}

export async function requestOverlayPermission(): Promise<void> {
  if (!isCapacitor()) return;
  try { await _plugin.requestOverlayPermission(); } catch { /* ignore */ }
}

// ── Call-log permission ───────────────────────────────────────────────────────
export async function requestCallLogPermission(): Promise<boolean> {
  if (!isCapacitor()) return false;
  try {
    const { granted } = await _plugin.requestCallLogPermission();
    return !!granted;
  } catch { return false; }
}

// ── Call-state monitoring ─────────────────────────────────────────────────────
let _listenerHandle: { remove: () => void } | null = null;
let _handlers: Array<(e: CallStateEvent) => void> = [];

export async function startCallMonitoring(
  onStateChange: (e: CallStateEvent) => void
): Promise<void> {
  _handlers.push(onStateChange);
  if (_listenerHandle || !isCapacitor()) return;

  try {
    await _plugin.startCallMonitoring();
    _listenerHandle = await _plugin.addListener("callStateChanged", (event) => {
      _handlers.forEach((h) => h(event));
    });
  } catch { /* graceful no-op on web */ }
}

export async function stopCallMonitoring(
  handler?: (e: CallStateEvent) => void
): Promise<void> {
  if (handler) {
    _handlers = _handlers.filter((h) => h !== handler);
  } else {
    _handlers = [];
  }
  if (_handlers.length === 0) {
    _listenerHandle?.remove();
    _listenerHandle = null;
    if (isCapacitor()) {
      try { await _plugin.stopCallMonitoring(); } catch { /* ignore */ }
    }
  }
}

// ── Overlay ───────────────────────────────────────────────────────────────────
export async function showCallOverlay(
  leadName: string,
  phone: string
): Promise<void> {
  if (!isCapacitor()) return;
  try { await _plugin.showCallOverlay({ leadName, phone }); } catch { /* ignore */ }
}

export async function hideCallOverlay(): Promise<void> {
  if (!isCapacitor()) return;
  try { await _plugin.hideCallOverlay(); } catch { /* ignore */ }
}

// ── Phone call ────────────────────────────────────────────────────────────────
export async function makeCall(phone: string): Promise<void> {
  if (isCapacitor()) {
    try {
      await _plugin.makeCall({ phone });
      return;
    } catch { /* fall through to web */ }
  }
  window.location.href = `tel:${phone}`;
}

// ── Call log ──────────────────────────────────────────────────────────────────
export async function getRecentCallLogs(limit = 20): Promise<CallLogEntry[]> {
  if (!isCapacitor()) return [];
  try {
    const { calls } = await _plugin.getRecentCallLogs({ limit });
    return calls ?? [];
  } catch { return []; }
}

export async function getLastCallForNumber(
  phone: string
): Promise<CallLogEntry | null> {
  const logs = await getRecentCallLogs(50);
  const last10 = phone.replace(/\D/g, "").slice(-10);
  return (
    logs.find((l) => l.number.replace(/\D/g, "").slice(-10) === last10) ?? null
  );
}

// ── Auto dialer ───────────────────────────────────────────────────────────────
// Native side: CallManagerPlugin.kt + DialerService.kt. Unlike the helpers above,
// these throw on failure so the dialer screen can show the error instead of
// silently doing nothing.

export interface DialerPermissionStatus {
  callPhone: boolean;
  phoneState: boolean;
  callLog: boolean;
  notifications: boolean;
  overlay: boolean;              // needed to jump back to the app after each call
  batteryUnrestricted: boolean;  // recommended, not required
  allGranted: boolean;
  brand: string;
}

export interface DialerSim {
  id: string;
  label: string;
  slotIndex: number;  // -1 when the phone doesn't report it
}

export interface DialerCallStarted {
  number: string;
  startedAt: number;  // epoch ms when the call was placed
}

export interface DialerCallEnded {
  number: string;
  durationSec: number;  // from the phone's call log
  answered: boolean;    // durationSec > 0
  startedAt: number;
  callType: "OUTGOING" | "INCOMING" | "MISSED" | "OTHER" | "NOT_IN_CALL_LOG" | "NOT_STARTED";
}

export const dialer = {
  isAvailable: isCapacitor,
  checkPermissions: () => _plugin.checkPermissions(),
  requestPermissions: () => _plugin.requestPermissions(),
  openAppSettings: () => _plugin.openAppSettings(),
  requestIgnoreBatteryOptimizations: () => _plugin.requestIgnoreBatteryOptimizations(),
  listSims: async () => (await _plugin.listSims()).sims ?? [],
  startSession: () => _plugin.startDialerSession(),
  stopSession: () => _plugin.stopDialerSession(),
  startCall: (number: string, simId?: string) => _plugin.startCall({ number, simId }),
  onCallStarted: (h: (e: DialerCallStarted) => void) => _plugin.addListener("callStarted", h),
  onCallEnded: (h: (e: DialerCallEnded) => void) => _plugin.addListener("callEnded", h),
  onControl: (h: (e: { action: "pause" | "stop" }) => void) => _plugin.addListener("dialerControl", h),
  onError: (h: (e: { message: string }) => void) => _plugin.addListener("dialerError", h),
};

// ── One-time app init ─────────────────────────────────────────────────────────
export async function initCallManager(
  onCallEnded: (event: CallStateEvent) => void
): Promise<void> {
  if (!isCapacitor()) return;
  const hasOverlay = await hasOverlayPermission();
  if (!hasOverlay) await requestOverlayPermission();
  await requestCallLogPermission();
  await startCallMonitoring((event) => {
    if (event.state === "IDLE") onCallEnded(event);
  });
}
