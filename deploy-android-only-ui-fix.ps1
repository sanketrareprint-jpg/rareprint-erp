# ── Deploy: fix — UI compacting changes now apply to the Android app ONLY ──
# Run this from PowerShell on your own machine (not inside any sandbox).
# Stop and check the output at each step before moving to the next.
#
# What this fixes:
# The last deploy (deploy-mobile-ui-density-fix.ps1) accidentally made the
# slim order cards / no-bottom-nav / density pass changes apply to the LIVE
# WEBSITE too (including on phone browsers), since those changes lived in
# shared components/CSS. This script pushes the corrected version: a new
# useIsNativeApp() hook (Capacitor.isNativePlatform()) toggles an
# "is-native-app" class on <html>, and every compacting rule is now scoped
# under that class. Result: the website goes back to looking exactly like
# it did before any of this — bottom nav back, normal spacing — while the
# Android app keeps the compact UI.
#
# Files changed: lib/useIsNativeApp.ts (new), components/dashboard-shell.tsx,
# app/globals.css, app/orders/page.tsx. No backend/schema changes.

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# 1. Frontend: build check.
Set-Location "$repo\frontend"
npm install
npm run build

# 2. Commit and push — this redeploys the live website (Vercel) back to its
#    original look. The Android app is a separate local build — after this
#    push, rebuild it too: npm run build:android, then Run in Android Studio,
#    to pick up the same (correctly-scoped) code.
Set-Location $repo
git add .
git commit -m "Fix: scope mobile UI compacting (slim cards, no bottom nav, density pass) to Android app only, not the website"
git push
