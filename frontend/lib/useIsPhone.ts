"use client";

import { useEffect, useState } from "react";

/**
 * True when the screen is phone-width (below Tailwind's `md`, 768px) — in
 * the phone browser, the PWA and the Android app alike. Use this for layout
 * that must switch on phones everywhere; use useIsNativeApp for changes
 * that apply to the Android app only.
 *
 * Starts false on first render (matches server output) and updates after
 * mount and on resize/rotation, so there's no hydration mismatch.
 */
export function useIsPhone() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const update = () => setIsPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return isPhone;
}
