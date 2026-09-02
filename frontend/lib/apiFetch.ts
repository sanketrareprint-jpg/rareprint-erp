/**
 * apiFetch — safe fetch wrapper for all RarePrint ERP modules
 *
 * Guarantees:
 *  - Returns typed data on success, null on any failure
 *  - Redirects to /login on 401 (no manual check needed)
 *  - Never throws — catch block returns null + calls onError if supplied
 *  - Never sets array state to an error object (the root cause of .map crashes)
 *
 * Usage (in any page):
 *
 *   const orders = await apiFetch<Order[]>("/accounts/pending");
 *   if (orders) setOrders(orders);         // only set state when it's real data
 *
 *   // With error banner:
 *   const data = await apiFetch<Report>("/reports/summary", {}, (msg) => setLoadError(msg));
 */

import { API_BASE_URL } from "@/lib/api";
import { clearAuth, getAuthHeaders } from "@/lib/auth";

type ApiFetchOptions = RequestInit & {
  /** Extra headers merged on top of auth headers */
  headers?: Record<string, string>;
};

type ErrorCallback = (message: string) => void;

/**
 * fetchWithRetry — retries once (after a short delay) ONLY when `fetch()`
 * itself throws (DNS failure, connection reset, TLS handshake failure, a
 * CORS block, a brief mobile-signal drop, a Railway container mid-restart,
 * etc.) — never on a real HTTP error response, since those resolve normally
 * and shouldn't be retried blindly.
 *
 * Why this exists: some users on the Android app were hitting an opaque
 * "Network error" / "Could not reach the server" on their very first
 * request, with no way to tell (from the generic message alone) whether it
 * was a real outage or just a one-off transient blip. A single retry with a
 * short backoff silently recovers from the transient case — which covers
 * most real-world mobile-network flakiness — without the user noticing.
 * Genuine outages still fail after the retry and surface an error as before.
 */
export async function fetchWithRetry(
  input: string,
  init: RequestInit,
  attempts = 2,
): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(input, init);
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

/** Turns a caught fetch error into a message that actually says what went
 * wrong (e.g. "TypeError: Failed to fetch") instead of a bare guess, so a
 * user reporting the error gives us something diagnosable. */
export function describeFetchError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

/**
 * GET request. Returns data or null.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
  onError?: ErrorCallback
): Promise<T | null> {
  try {
    const res = await fetchWithRetry(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...(options.headers ?? {}),
      },
    });

    if (res.status === 401) {
      clearAuth();
      if (typeof window !== "undefined") window.location.href = "/login";
      return null;
    }

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const body = await res.json();
        if (body?.message) detail = body.message;
      } catch { /* ignore */ }
      onError?.(`Could not load data (${detail}). Please reload or check the backend.`);
      return null;
    }

    return (await res.json()) as T;
  } catch (err) {
    onError?.(`Request failed after retrying: ${describeFetchError(err)}. Check your internet connection.`);
    return null;
  }
}

/**
 * POST / PATCH / PUT / DELETE. Returns response body or null.
 * Pass body as a plain object — it will be JSON-stringified.
 */
export async function apiMutate<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  onError?: ErrorCallback
): Promise<T | null> {
  try {
    // Deliberately NOT using fetchWithRetry here (unlike apiFetch above):
    // this is POST/PATCH/PUT/DELETE, so if `fetch()` throws we can't tell
    // whether the request never reached the server or the server processed
    // it but the response was lost in transit. Blindly retrying a mutation
    // (payment, dispatch action, commission override, etc.) risks a
    // duplicate action — worse than a clear error the user can retry
    // manually. Read-only GETs are safe to auto-retry; writes are not.
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: getAuthHeaders(),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 401) {
      clearAuth();
      if (typeof window !== "undefined") window.location.href = "/login";
      return null;
    }

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const errBody = await res.json();
        if (errBody?.message) detail = errBody.message;
      } catch { /* ignore */ }
      onError?.(`Action failed: ${detail}`);
      return null;
    }

    // Some endpoints return 204 No Content
    const text = await res.text();
    return text ? (JSON.parse(text) as T) : (null as T);
  } catch (err) {
    onError?.(`Request failed: ${describeFetchError(err)}. Check your internet connection and try again.`);
    return null;
  }
}
