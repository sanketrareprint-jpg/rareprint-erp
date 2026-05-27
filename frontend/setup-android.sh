#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# RarePrint CRM — Android / Capacitor Setup Script
#
# Run from the  frontend/  directory:
#   chmod +x setup-android.sh && ./setup-android.sh
#
# Prerequisites:
#   • Node 18+  (node -v)
#   • Java 17+  (java -version)   — Android Studio installs this
#   • Android Studio installed and SDK at default path
#   • ANDROID_HOME env var set (usually ~/Library/Android/sdk on Mac)
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         RarePrint CRM — Android / Capacitor Setup           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ── Step 1: Install Capacitor packages ───────────────────────────────────────
echo "▶  Installing Capacitor packages..."
npm install --save \
  @capacitor/core \
  @capacitor/android \
  @capacitor/splash-screen \
  @capacitor/status-bar \
  @capacitor/keyboard

npm install --save-dev \
  @capacitor/cli

echo "✓  Capacitor packages installed"

# ── Step 2: Initialise Capacitor (safe to re-run) ────────────────────────────
echo ""
echo "▶  Initialising Capacitor..."
npx cap init "RarePrint" "com.rareprint.crm" --web-dir out 2>/dev/null || true
echo "✓  Capacitor initialised"

# ── Step 3: Static Next.js build ─────────────────────────────────────────────
echo ""
echo "▶  Building Next.js (static export → out/)..."
CAPACITOR_BUILD=1 npx next build
echo "✓  Static build complete"

# ── Step 4: Add Android platform ─────────────────────────────────────────────
echo ""
echo "▶  Adding Android platform..."
npx cap add android 2>/dev/null || echo "   (android already added — skipping)"
echo "✓  Android platform ready"

# ── Step 5: Copy custom plugin files ─────────────────────────────────────────
echo ""
echo "▶  Copying CallManager native plugin..."

PLUGIN_SRC="android-plugin/src/main/java/com/rareprint/crm"
PLUGIN_DST="android/app/src/main/java/com/rareprint/crm"

cp "$PLUGIN_SRC/CallManagerPlugin.kt" "$PLUGIN_DST/"
cp "$PLUGIN_SRC/OverlayService.kt"    "$PLUGIN_DST/"
echo "✓  Plugin files copied"

# ── Step 6: Patch MainActivity.kt ────────────────────────────────────────────
echo ""
echo "▶  Patching MainActivity.kt to register plugin..."
cp android-plugin/MainActivity.patch.kt "$PLUGIN_DST/MainActivity.kt"
echo "✓  MainActivity patched"

# ── Step 7: Patch AndroidManifest.xml ────────────────────────────────────────
echo ""
echo "▶  Adding permissions to AndroidManifest.xml..."

MANIFEST="android/app/src/main/AndroidManifest.xml"

# Insert permissions before <application> tag (idempotent — checks first)
if ! grep -q "SYSTEM_ALERT_WINDOW" "$MANIFEST"; then
  python3 - <<'PYEOF'
import re, sys

manifest_path = "android/app/src/main/AndroidManifest.xml"
with open(manifest_path, "r") as f:
    content = f.read()

permissions = """
    <!-- ── RarePrint CRM — call permissions ─────────────────────── -->
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    <uses-permission android:name="android.permission.READ_CALL_LOG" />
    <uses-permission android:name="android.permission.WRITE_CALL_LOG" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />

"""

# Insert just before <application
content = content.replace("<application", permissions + "    <application", 1)

service_decl = """
        <!-- RarePrint overlay service -->
        <service
            android:name="com.rareprint.crm.OverlayService"
            android:exported="false"
            android:foregroundServiceType="phoneCall" />
"""

# Insert after <application ...> opening tag
content = re.sub(
    r'(<application[^>]*>)',
    r'\1' + service_decl,
    content,
    count=1
)

with open(manifest_path, "w") as f:
    f.write(content)

print("   AndroidManifest.xml patched successfully")
PYEOF
else
  echo "   (permissions already present — skipping)"
fi

echo "✓  AndroidManifest.xml ready"

# ── Step 8: Sync Capacitor ────────────────────────────────────────────────────
echo ""
echo "▶  Syncing Capacitor (copies web assets + plugins to Android)..."
npx cap sync android
echo "✓  Sync complete"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅  Setup complete!                                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  Next steps:                                                 ║"
echo "║                                                              ║"
echo "║  1. Open Android Studio:                                     ║"
echo "║       npm run android:open                                   ║"
echo "║                                                              ║"
echo "║  2. Connect your Android phone via USB (enable USB          ║"
echo "║     Debugging in Developer Options), then press ▶ Run       ║"
echo "║                                                              ║"
echo "║  3. First launch: the app will ask for permissions —        ║"
echo "║     • Phone calls                                            ║"
echo "║     • Call log                                               ║"
echo "║     • Display over other apps (Settings page opens)         ║"
echo "║     Grant all three for full CRM power-dialer experience.   ║"
echo "║                                                              ║"
echo "║  To rebuild after code changes:                              ║"
echo "║       npm run build:android                                  ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
