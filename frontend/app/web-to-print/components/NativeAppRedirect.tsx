"use client";
// The Android staff app loads the live site (capacitor.config.ts server.url),
// so opening it hits "/" → "/web-to-print" (the public storefront) like a
// customer would. The storefront isn't part of the staff app — send the app
// to the ERP dashboard. Website visitors are unaffected (isNativePlatform is
// false in every browser, including the PWA).
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export function NativeAppRedirect() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) window.location.replace("/dashboard");
  }, []);
  return null;
}
