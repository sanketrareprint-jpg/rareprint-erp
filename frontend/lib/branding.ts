"use client";
// App name + logo for this deployment, in one place.
//
// Precedence, most specific first:
//   1. What an admin set in Settings > App Branding (GET /branding).
//   2./3. The build-time default from lib/brand-defaults.ts (the customer's
//      name from approve time, else "RarePrint").
// Logo: the Settings logo; else RarePrint's icon on RarePrint's own
// deployment; else null, and <BrandLogo> draws an initials badge.
import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";
import { DEFAULT_BRAND_LOGO, DEFAULT_BRAND_NAME } from "@/lib/brand-defaults";

export const BRANDING_UPDATED_EVENT = "app:branding-updated";
const CACHE_KEY = "app_branding_cache";

export type Branding = { name: string; logoUrl: string | null };
type ServerBranding = { appName: string | null; logoUrl: string | null };

const DEFAULT_BRANDING: Branding = { name: DEFAULT_BRAND_NAME, logoUrl: DEFAULT_BRAND_LOGO };

function resolve(server: ServerBranding | null): Branding {
  return {
    name: server?.appName?.trim() || DEFAULT_BRAND_NAME,
    logoUrl: server?.logoUrl || DEFAULT_BRAND_LOGO,
  };
}

function readCache(): ServerBranding | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as ServerBranding) : null;
  } catch {
    return null;
  }
}

/** Settings > App Branding calls this after saving so every open screen updates. */
export function publishBranding(server: ServerBranding) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(server));
  } catch {
    // Cache is a convenience only.
  }
  window.dispatchEvent(new Event(BRANDING_UPDATED_EVENT));
}

/**
 * Starts from the build-time default on both server and client (no hydration
 * mismatch), then applies the cached Settings value and refreshes it from
 * the backend after mount.
 */
export function useBranding(): Branding {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;
    const applyCache = () => {
      const cached = readCache();
      if (cached) setBranding(resolve(cached));
    };
    applyCache();
    fetch(`${API_BASE_URL}/branding`)
      .then((r) => (r.ok ? r.json() : null))
      .then((server: ServerBranding | null) => {
        if (cancelled || !server) return;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(server));
        } catch {
          // Cache is a convenience only.
        }
        setBranding(resolve(server));
      })
      .catch(() => {
        // Offline or older backend without /branding: keep the default.
      });
    window.addEventListener(BRANDING_UPDATED_EVENT, applyCache);
    return () => {
      cancelled = true;
      window.removeEventListener(BRANDING_UPDATED_EVENT, applyCache);
    };
  }, []);

  return branding;
}

export function brandInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}
