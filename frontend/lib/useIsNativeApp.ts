"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";

/**
 * True only when running inside the native Capacitor Android app — false
 * for every browser context, including the live website viewed on a phone
 * and the installed PWA. Use this (not a screen-width check) to scope any
 * UI change that should apply to the Android app only, not the website.
 *
 * Starts false on first render (matches server/static-export output) and
 * flips after mount once Capacitor's runtime check resolves, so there's no
 * hydration mismatch.
 */
export function useIsNativeApp() {
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
  }, []);
  return isNative;
}
