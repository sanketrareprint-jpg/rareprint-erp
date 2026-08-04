# RarePrint ERP — Mobile App Setup Guide

Two mobile paths already exist in the codebase. Part A takes 30 seconds and needs no build. Part B gives you a real installable Android app with native call-log tracking, but needs Android Studio on your machine.

---

## Part A — PWA (install today, no build needed)

Works for any staff member, on Android or iPhone, the moment the site is deployed.

1. Make sure the frontend is on the latest deploy (`git push` from the repo root, as usual — Railway auto-builds).
2. On the phone, open the ERP site URL in the browser.
   - **Android (Chrome):** tap the **⋮** menu → **Install app** (or **Add to Home screen**).
   - **iPhone (Safari):** tap the **Share** icon → **Add to Home Screen**.
3. An app icon appears on the home screen. Opening it launches full-screen (no browser bar), with shortcuts to Dashboard, CRM, Orders, Production, Dispatch, and Rate Calculator baked in.
4. It caches the app shell, so it stays usable on a flaky connection (not full offline — actions still need the API).

That's it — nothing to build, nothing to install from a store.

---

## Part B — Native Android app (with call-log/compliance plugin)

This produces a real `.apk` you can install like any Android app. It includes a custom native plugin (`CallManagerPlugin` + `OverlayService`) for automatic call logging, tied to the call compliance feature.

### Prerequisites (one-time, on your Windows PC)

1. **Android Studio** — download from `developer.android.com/studio` if not already installed. It bundles the JDK you need.
2. During install, let it install the default **Android SDK** components. The project targets **SDK 36** (`compileSdkVersion`/`targetSdkVersion` = 36, `minSdkVersion` = 24, i.e. Android 7.0+). If a specific platform is missing later, Android Studio will prompt you to install it.
3. **Node.js** — you already have this since the project runs locally.

### Steps

1. Open PowerShell:
   ```powershell
   cd C:\Users\ASUS\Downloads\rareprint-erp\frontend
   ```

2. (First time only, or if `node_modules` looks stale) install the frontend's dependencies — everything listed in `frontend/package.json`, including the Capacitor packages (`@capacitor/core`, `@capacitor/android`, `@capacitor/cli`, etc.) already added for this Android build:
   ```powershell
   npm install
   ```

3. Build the static export and sync it into the Android project — this is a single scripted command already in `package.json`:
   ```powershell
   npm run build:android
   ```
   (Under the hood this runs `cross-env CAPACITOR_BUILD=1 next build` then `npx cap sync android`. The script originally used raw `CAPACITOR_BUILD=1 next build`, which is bash-only syntax and fails on Windows with `'CAPACITOR_BUILD' is not recognized as an internal or external command` — it's been fixed to use `cross-env` so it works the same on Windows, Mac, and Linux. If you pulled this guide before that fix, re-run `npm install` once to pick up the new `cross-env` dev dependency before running this command again.)

4. Open the Android project in Android Studio:
   ```powershell
   npm run android:open
   ```
   Wait for Gradle sync to finish (first time can take a few minutes — it may prompt to download the SDK Platform 36 / build tools; accept those prompts).

5. Connect your Android phone via USB:
   - On the phone: **Settings → About phone → tap "Build number" 7 times** to unlock Developer Options.
   - **Settings → Developer Options → enable USB debugging.**
   - Plug in via USB, accept the "Allow USB debugging?" prompt on the phone.
   - (Alternative: use Android Studio's built-in emulator via **Device Manager** instead of a real phone.)

6. In Android Studio, pick your device from the device dropdown in the toolbar and press the green **Run ▶** button. This installs a debug build directly on the phone.

7. On first launch, the app will ask for permissions: **Phone**, **Call Log**, **Draw over other apps**, and possibly **Notifications**. Grant these — they power the call-tracking plugin. If you accidentally deny one, re-enable it manually via **Android Settings → Apps → RarePrint → Permissions**.

### Producing a standalone `.apk` file (to share without Android Studio)

In Android Studio: **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.

When it finishes, click the "locate" link in the notification, or find it at:
```
frontend\android\app\build\outputs\apk\debug\app-debug.apk
```
Send this file to any Android phone to install directly. Since it's not from the Play Store, the phone will need **"Install from unknown sources"** enabled for that install.

### For a signed release build (needed before Play Store distribution)

**Build → Generate Signed Bundle / APK**, then follow the wizard to create a keystore. Keep the keystore file and its password somewhere safe — every future update needs the *same* key.

### Rebuilding after future code changes

Whenever the ERP frontend changes and you want an updated app:
```powershell
cd C:\Users\ASUS\Downloads\rareprint-erp\frontend
npm run build:android
npm run android:open
```
Then press **Run** again (or rebuild the APK via the Build menu).

### Troubleshooting

- **Gradle sync fails on SDK version:** File → Settings → Android SDK → install SDK Platform 36 and matching build tools.
- **App installs but shows a blank white screen:** the static export didn't pick up your latest changes — rerun `npm run build:android` before opening/running again.
- **Call permissions greyed out or missing:** these are "dangerous" Android permissions — if the in-app prompt didn't appear, grant them manually via Android Settings → Apps → RarePrint → Permissions.

---

## What's not covered here

- **iOS native app:** no iOS project exists yet (Part A's PWA is the iOS path for now).
- **Customer-facing app:** everything above wraps the internal admin/staff ERP (CRM, orders, production, dispatch, rates). A customer-facing app would be separate, new work.
