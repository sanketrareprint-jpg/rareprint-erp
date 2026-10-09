"use client";
// Shows a red popup on whatever screen the user is on when a WhatsApp message
// started by their own action (creating an order, approving it, an upsell...)
// fails to send. The sends run in the background after the screen already got
// its response, so this polls GET /whatsapp/my-failures — but only for a
// minute after the user clicks/types (when an action may have sent a message)
// or opens the page, so idle screens make no requests. Failures from
// scheduled jobs (no user) show only in the admin Dashboard banner.
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders, getStoredUser } from "@/lib/auth";

const POLL_MS = 10_000;
// Keep checking this long after the last click/keypress — sends finish a few
// seconds after the action that started them.
const ACTIVE_WINDOW_MS = 60_000;
const SINCE_KEY_PREFIX = "rareprint_wa_failures_since_";
const AISENSY_OUT_OF_CREDITS_CODE = 402;

type FailureEvent = {
  at: string;
  campaign: string;
  recipientName: string | null;
  recipientPhone: string | null;
  reason: string;
  code: number | null;
};

type Alert = { key: string; label: string; recipients: string[]; reason: string; code: number | null };

const MESSAGE_LABELS: Record<string, string> = {
  order_created_erp: "Order created message",
  order_updated_erp: "Order updated message",
  order_status_support_erp: "Order status update",
  invoice_pdf_erp: "Invoice PDF",
};

// One popup per message type + reason, listing every number it failed for —
// one order can send to the owner and the customer at once.
function groupFailures(events: FailureEvent[]): Alert[] {
  const groups = new Map<string, Alert>();
  for (const e of events) {
    const key = `${e.campaign}|${e.reason}`;
    const recipient = [e.recipientName, e.recipientPhone ? `(${e.recipientPhone})` : ""].filter(Boolean).join(" ");
    const existing = groups.get(key);
    if (existing) {
      if (recipient && !existing.recipients.includes(recipient)) existing.recipients.push(recipient);
    } else {
      groups.set(key, {
        key: `${key}|${e.at}`,
        label: MESSAGE_LABELS[e.campaign] ?? e.campaign,
        recipients: recipient ? [recipient] : [],
        reason: e.reason,
        code: e.code,
      });
    }
  }
  return [...groups.values()];
}

export function WhatsAppFailureAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);

  useEffect(() => {
    let stopped = false;
    let timer: number | undefined;
    let activeUntil = Date.now() + ACTIVE_WINDOW_MS;

    const poll = async () => {
      const user = getStoredUser();
      if (!user?.id || document.visibilityState !== "visible" || Date.now() > activeUntil) return;
      const sinceKey = `${SINCE_KEY_PREFIX}${user.id}`;
      let since: string | null = null;
      try { since = localStorage.getItem(sinceKey); } catch { /* storage blocked */ }
      try {
        const qs = since ? `?since=${encodeURIComponent(since)}` : "";
        const res = await fetch(`${API_BASE_URL}/whatsapp/my-failures${qs}`, { headers: getAuthHeaders() });
        if (!res.ok) return; // logged out / server busy — try again next tick
        const data: { failures?: FailureEvent[] } = await res.json();
        const failures = data.failures ?? [];
        if (stopped || failures.length === 0) return;
        const newest = failures.reduce((max, f) => (f.at > max ? f.at : max), failures[0].at);
        try { localStorage.setItem(sinceKey, newest); } catch { /* storage blocked */ }
        setAlerts((prev) => [...prev, ...groupFailures(failures)].slice(-5));
      } catch {
        // Network error — try again next tick.
      }
    };

    const schedule = () => {
      timer = window.setTimeout(async () => {
        await poll();
        if (!stopped) schedule();
      }, POLL_MS);
    };
    const onActivity = () => { activeUntil = Date.now() + ACTIVE_WINDOW_MS; };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      onActivity();
      void poll();
    };

    void poll();
    schedule();
    document.addEventListener("visibilitychange", onVisible);
    document.addEventListener("click", onActivity, true);
    document.addEventListener("keydown", onActivity, true);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      document.removeEventListener("click", onActivity, true);
      document.removeEventListener("keydown", onActivity, true);
    };
  }, []);

  if (alerts.length === 0) return null;

  return (
    // Phones: under the top header, clear of the bottom nav bar. Desktop: bottom-right.
    <div className="fixed right-4 top-16 z-[9998] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 sm:top-auto sm:bottom-4">
      {alerts.map((a) => (
        <div key={a.key} role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-800 shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <p className="font-bold">⚠ WhatsApp NOT sent — {a.label}</p>
            <button
              type="button"
              aria-label="Dismiss"
              className="shrink-0 px-1 text-sm leading-none text-red-700 hover:text-red-900"
              onClick={() => setAlerts((prev) => prev.filter((x) => x.key !== a.key))}
            >
              ✕
            </button>
          </div>
          {a.recipients.length > 0 && <p className="mt-0.5 break-words">To: {a.recipients.join(", ")}</p>}
          <p className="mt-0.5 break-words">
            AiSensy says: <span className="font-semibold">{a.reason}</span>
            {a.code != null ? ` (code ${a.code})` : ""}
          </p>
          {a.code === AISENSY_OUT_OF_CREDITS_CODE && (
            <p className="mt-0.5">Fix: recharge WhatsApp Conversation Credits in the AiSensy wallet. This message will not be resent automatically.</p>
          )}
        </div>
      ))}
    </div>
  );
}
