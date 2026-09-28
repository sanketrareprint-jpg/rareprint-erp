"use client";
// Red on-screen alert whenever a call to the ERP server fails with a server
// error (HTTP 500+) or the server can't be reached — so staff know the action
// did NOT save instead of assuming it worked (requested 2026-09-28).
//
// The app makes ~400 separate fetch() calls across its pages, most not
// through lib/apiFetch, so this watches them all from one place: it wraps
// window.fetch once, looks only at requests to API_BASE_URL, and passes every
// response through untouched (it only reads the status code — the body is
// never consumed). 4xx responses (validation messages, "not allowed", etc.)
// are left to each screen's own handling. Mounted once in DashboardShell.
import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { API_BASE_URL } from "@/lib/api";

type ServerAlert = { id: number; title: string; detail: string; time: string; key: string };

const EVENT = "rp-server-error";
const AUTO_HIDE_MS = 20000;
const REPEAT_WINDOW_MS = 10000;

// First path segment → the ERP section staff recognise.
const SECTION_LABELS: Record<string, string> = {
  accounts: "Accounts", billing: "Billing", orders: "Orders", dispatch: "Dispatch", production: "Production",
  "bank-statement": "Bank Statement", remittance: "Remittance", customers: "Customers", "customer-directory": "Customers",
  products: "Products", "cost-table": "Cost Table", hr: "HR", attendance: "Attendance", loyalty: "Loyalty",
  complaints: "Complaints", dashboard: "Dashboard", notifications: "Notifications", "rate-calculator": "Rate Calculator",
  "courier-calculator": "Courier Calculator", bigship: "Bigship", fship: "Fship", "erp-config": "Settings",
};

declare global {
  interface Window { __rpServerErrorWatch?: boolean }
}

function installFetchWatch() {
  if (typeof window === "undefined" || window.__rpServerErrorWatch) return;
  window.__rpServerErrorWatch = true;
  const originalFetch = window.fetch.bind(window);

  const report = (url: string, method: string, status: number | null) => {
    const path = url.slice(API_BASE_URL.length).split("?")[0] || "/";
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { path, method, status } }));
  };

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const watched = url.startsWith(API_BASE_URL);
    try {
      const res = await originalFetch(input, init);
      if (watched && res.status >= 500) report(url, method, res.status);
      return res;
    } catch (err) {
      // A cancelled request (page change, superseded search) is not an error.
      if (watched && !(err instanceof DOMException && err.name === "AbortError")) report(url, method, null);
      throw err;
    }
  };
}

export function ServerErrorIndicator() {
  const [alerts, setAlerts] = useState<ServerAlert[]>([]);

  useEffect(() => {
    installFetchWatch();
    let nextId = 1;
    const lastShown = new Map<string, number>();

    const onError = (e: Event) => {
      const { path, method, status } = (e as CustomEvent<{ path: string; method: string; status: number | null }>).detail;
      const key = `${method} ${path} ${status}`;
      const now = Date.now();
      if (now - (lastShown.get(key) ?? 0) < REPEAT_WINDOW_MS) return; // same failure repeating (e.g. polling)
      lastShown.set(key, now);

      const section = SECTION_LABELS[path.split("/").filter(Boolean)[0] ?? ""] ?? "Server";
      const saving = method !== "GET";
      const alert: ServerAlert = {
        id: nextId++,
        key,
        title: status === null
          ? "Can't reach the server — check your internet connection."
          : saving ? "Server error — this action did NOT save." : "Server error — this data couldn't be loaded.",
        detail: `${section} · ${path}${status ? ` (error ${status})` : ""}`,
        time: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      };
      setAlerts((prev) => [alert, ...prev].slice(0, 3));
      window.setTimeout(() => setAlerts((prev) => prev.filter((a) => a.id !== alert.id)), AUTO_HIDE_MS);
    };

    window.addEventListener(EVENT, onError);
    return () => window.removeEventListener(EVENT, onError);
  }, []);

  if (alerts.length === 0) return null;
  return (
    <div role="alert" aria-live="assertive"
      style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 10000, width: "min(560px, calc(100vw - 24px))", display: "flex", flexDirection: "column", gap: 8 }}>
      {alerts.map((a) => (
        <div key={a.id} className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 shadow-lg">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-semibold text-red-800">{a.title}</p>
            <p className="truncate text-red-700">{a.detail} · {a.time}</p>
            <p className="text-red-600">Please try again. If it keeps happening, tell the admin.</p>
          </div>
          <button onClick={() => setAlerts((prev) => prev.filter((x) => x.id !== a.id))} title="Close"
            className="shrink-0 rounded p-0.5 text-red-500 hover:bg-red-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
