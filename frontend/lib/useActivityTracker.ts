"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { getAuthHeaders } from "@/lib/auth";

const PING_INTERVAL_MS = 30_000; // 30 seconds
const IDLE_THRESHOLD_MS = 30_000; // consider idle if no mouse move in 30s

/**
 * Tracks active time in the ERP.
 * Sends a ping every 30s ONLY when the cursor has moved within the last 30s
 * (i.e. screen is active, not idle/stable).
 */
export function useActivityTracker() {
  const pathname = usePathname();
  const lastMoveRef = useRef<number>(0);
  const pathnameRef = useRef<string>(pathname);

  // Keep pathnameRef in sync
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleMouseMove = () => {
      lastMoveRef.current = Date.now();
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    const timer = setInterval(() => {
      const now = Date.now();
      const timeSinceLastMove = now - lastMoveRef.current;

      // Only ping if cursor moved within the idle threshold
      if (lastMoveRef.current > 0 && timeSinceLastMove < IDLE_THRESHOLD_MS) {
        const page = pathnameRef.current || "/";
        fetch(`${API_BASE_URL}/activity/ping`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ page }),
        }).catch(() => {/* silent — don't disrupt UX */});
      }
    }, PING_INTERVAL_MS);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      clearInterval(timer);
    };
  }, []);
}
