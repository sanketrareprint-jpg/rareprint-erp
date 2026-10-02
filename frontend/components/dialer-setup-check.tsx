"use client";
// Auto dialer — app-launch checks (Android app only; renders nothing on the website/PWA).
//   1. Every launch (and every return from Android Settings): if any dialer
//      permission is missing, show a full-screen "Permissions needed" screen
//      with buttons that grant them or open the app's Settings page.
//   2. Once all permissions are OK, show the battery + autostart setup guide
//      one time (until the agent taps "Done").
import { useCallback, useEffect, useState } from "react";
import { useIsNativeApp } from "@/lib/useIsNativeApp";
import {
  dialer,
  requestOverlayPermission,
  type DialerPermissionStatus,
} from "@/lib/plugins/CallManager";

const GUIDE_DONE_KEY = "rareprint_dialer_setup_guide_done";

type Brand = "xiaomi" | "vivo" | "oppo" | "realme" | "other";

function detectBrand(manufacturer: string): Brand {
  const m = manufacturer.toLowerCase();
  if (m.includes("xiaomi") || m.includes("redmi") || m.includes("poco")) return "xiaomi";
  if (m.includes("vivo") || m.includes("iqoo")) return "vivo";
  if (m.includes("realme")) return "realme";
  if (m.includes("oppo")) return "oppo";
  return "other";
}

const BRAND_STEPS: Record<Brand, { name: string; steps: string[] }> = {
  xiaomi: {
    name: "Xiaomi / Redmi / POCO",
    steps: [
      "Open Settings → Apps → Manage apps → RarePrint → turn Autostart ON.",
      "On the same page, tap Battery saver → choose No restrictions.",
      "Open Recent apps, press and hold RarePrint, and tap the lock icon.",
    ],
  },
  vivo: {
    name: "Vivo / iQOO",
    steps: [
      "Open Settings → Battery → Background power consumption management → RarePrint → Allow.",
      "Open Settings → Apps → Autostart (or i Manager → App manager → Autostart manager) → turn RarePrint ON.",
      "Open Recent apps and swipe down on RarePrint to lock it.",
    ],
  },
  oppo: {
    name: "Oppo",
    steps: [
      "Open Settings → Apps → App management → RarePrint → Battery usage.",
      "Turn ON “Allow auto launch” and “Allow background activity”.",
      "Open Recent apps, tap the ⋮ menu on RarePrint, and tap Lock.",
    ],
  },
  realme: {
    name: "Realme",
    steps: [
      "Open Settings → Apps → App management → RarePrint → Battery usage.",
      "Turn ON “Allow auto launch” and “Allow background activity”.",
      "Open Recent apps, tap the ⋮ menu on RarePrint, and tap Lock.",
    ],
  },
  other: {
    name: "Your phone",
    steps: [
      "Open Settings → Apps → RarePrint → Battery → choose Unrestricted (or No restrictions).",
      "If your phone has an Autostart setting, turn it ON for RarePrint.",
    ],
  },
};

/** Battery button + brand-specific autostart steps. Also used on the dialer test screen. */
export function DialerBatteryGuide({ perms }: { perms: DialerPermissionStatus }) {
  const brand = BRAND_STEPS[detectBrand(perms.brand)];
  return (
    <div className="space-y-3 text-sm text-slate-700">
      <div className="flex items-center justify-between gap-2">
        <span className="break-words">Battery optimization off (app may run in background)</span>
        <span className={perms.batteryUnrestricted ? "text-green-600 font-semibold" : "text-amber-600 font-semibold"}>
          {perms.batteryUnrestricted ? "OK" : "Not yet"}
        </span>
      </div>
      {!perms.batteryUnrestricted && (
        <button className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white font-medium"
          onClick={() => dialer.requestIgnoreBatteryOptimizations().catch(() => {})}>
          Allow background running
        </button>
      )}
      <div>
        <p className="font-semibold">Autostart — {brand.name}</p>
        <ol className="list-decimal pl-5 space-y-1 mt-1">
          {brand.steps.map((s) => <li key={s} className="break-words">{s}</li>)}
        </ol>
        <p className="text-xs text-slate-500 mt-1">Menu names can differ slightly between phone models.</p>
      </div>
      <button className="w-full px-3 py-2 rounded-lg border border-slate-300 font-medium"
        onClick={() => dialer.openAppSettings().catch(() => {})}>
        Open RarePrint app settings
      </button>
    </div>
  );
}

export function DialerSetupCheck() {
  const isNative = useIsNativeApp();
  const [perms, setPerms] = useState<DialerPermissionStatus | null>(null);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);   // "Not now" — until next launch
  const [guideDone, setGuideDone] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setPerms(await dialer.checkPermissions());
      setError("");
    } catch (e: unknown) {
      setError(`Could not check dialer permissions: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, []);

  useEffect(() => {
    if (!isNative) return;
    try { setGuideDone(localStorage.getItem(GUIDE_DONE_KEY) === "1"); } catch { setGuideDone(false); }
    refresh();
    // Re-check when the agent comes back from Android Settings.
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [isNative, refresh]);

  if (!isNative || dismissed) return null;

  const shell = (title: string, body: React.ReactNode) => (
    <div className="fixed inset-0 z-[9999] bg-white overflow-y-auto">
      <div className="max-w-md mx-auto px-4 py-6 space-y-4">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        {body}
      </div>
    </div>
  );

  if (error) {
    return shell("Auto dialer check failed", (
      <>
        <p className="text-sm text-red-600 break-words">{error}</p>
        <button className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white" onClick={refresh}>Try again</button>
        <button className="w-full px-3 py-2 rounded-lg border" onClick={() => setDismissed(true)}>Not now</button>
      </>
    ));
  }
  if (!perms) return null;

  if (!perms.allGranted) {
    const rows: Array<[boolean, string]> = [
      [perms.callPhone, "Make phone calls — lets the dialer call each lead without you tapping"],
      [perms.phoneState, "Phone status — tells the dialer when a call has ended"],
      [perms.callLog, "Call log — reads how long each call really lasted"],
      [perms.notifications, "Notifications — shows “Dialer running” with Pause / Stop"],
      [perms.overlay, "Display over other apps — brings RarePrint back after each call"],
    ];
    return shell("Permissions needed for the auto dialer", (
      <>
        <p className="text-sm text-slate-600">
          The auto dialer can’t work until every item below is allowed.
        </p>
        <ul className="space-y-2">
          {rows.map(([ok, label]) => (
            <li key={label} className="flex items-start justify-between gap-3 text-sm">
              <span className="break-words">{label}</span>
              <span className={ok ? "text-green-600 font-semibold shrink-0" : "text-red-600 font-semibold shrink-0"}>
                {ok ? "Allowed" : "Missing"}
              </span>
            </li>
          ))}
        </ul>
        {(!perms.callPhone || !perms.phoneState || !perms.callLog || !perms.notifications) && (
          <button className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white font-medium"
            onClick={async () => {
              try { setPerms(await dialer.requestPermissions()); }
              catch (e: unknown) { setError(`Permission request failed: ${e instanceof Error ? e.message : String(e)}`); }
            }}>
            Allow permissions
          </button>
        )}
        {!perms.overlay && (
          <button className="w-full px-3 py-2 rounded-lg bg-blue-600 text-white font-medium"
            onClick={() => requestOverlayPermission()}>
            Allow display over other apps
          </button>
        )}
        <p className="text-xs text-slate-500">
          If Android no longer shows the permission popup, open app settings → Permissions and allow them there.
        </p>
        <button className="w-full px-3 py-2 rounded-lg border border-slate-300 font-medium"
          onClick={() => dialer.openAppSettings().catch(() => {})}>
          Open RarePrint app settings
        </button>
        <button className="w-full px-3 py-2 text-sm text-slate-500" onClick={() => setDismissed(true)}>
          Not now (asks again next time the app opens)
        </button>
      </>
    ));
  }

  if (!guideDone) {
    return shell("One-time setup: keep the dialer running", (
      <>
        <p className="text-sm text-slate-600">
          Some phones close apps in the background to save battery. Do these steps once so the
          dialer isn’t stopped in the middle of a session.
        </p>
        <DialerBatteryGuide perms={perms} />
        <button className="w-full px-3 py-2 rounded-lg bg-green-600 text-white font-medium"
          onClick={() => {
            try { localStorage.setItem(GUIDE_DONE_KEY, "1"); } catch { /* ignore */ }
            setGuideDone(true);
          }}>
          Done
        </button>
      </>
    ));
  }

  return null;
}
