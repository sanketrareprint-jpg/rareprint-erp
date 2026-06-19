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

import { API_BASE_URL, getAuthHeaders } from "@/lib/api";
import { clearAuth } from "@/lib/auth";

type ApiFetchOptions = RequestInit & {
  /** Extra headers merged on top of auth headers */
  headers?: Record<string, string>;
};

type ErrorCallback = (message: string) => void;

/**
 * GET request. Returns data or null.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
  onError?: ErrorCallback
): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
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
    const msg = err instanceof Error ? err.message : "Network error";
    onError?.(`Request failed: ${msg}`);
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
    const msg = err instanceof Error ? err.message : "Network error";
    onError?.(`Request failed: ${msg}`);
    return null;
  }
}
