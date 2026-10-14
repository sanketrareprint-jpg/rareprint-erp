"use client";

import { useCallback, useSyncExternalStore } from "react";

// A string kept in localStorage, read through useSyncExternalStore so the
// server / static-export HTML and the first client render both use
// `fallback` (no hydration mismatch) and the saved value applies right after
// hydration — without a setState-in-effect. Every component using the same
// key stays in sync. Storage that throws (private mode, blocked site data)
// falls back to `fallback`.
const CHANGE_EVENT = "rareprint:stored-value";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useStoredValue(key: string, fallback: string): [string, (value: string) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      try { return window.localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    () => fallback,
  );
  const setValue = useCallback((next: string) => {
    try { window.localStorage.setItem(key, next); } catch { /* not persisted */ }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, [key]);
  return [value, setValue];
}
