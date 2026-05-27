# ─────────────────────────────────────────────────────────────────────────────
# RarePrint CRM — Android / Capacitor Setup (PowerShell)
# Run from the frontend\ folder in PowerShell:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\setup-android.ps1
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   RarePrint CRM — Android / Capacitor Setup" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Install Capacitor packages ───────────────────────────────────────
Write-Host "Step 1: Installing Capacitor packages..." -ForegroundColor Yellow
npm install --save @capacitor/core @capacitor/android @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard
npm install --save-dev @capacitor/cli
Write-Host "OK - Capacitor packages installed" -ForegroundColor Green

# ── Step 2: Static Next.js build ─────────────────────────────────────────────
Write-Host ""
Write-Host "Step 2: Building Next.js static export..." -ForegroundColor Yellow
$env:CAPACITOR_BUILD = "1"
npx next build
Write-Host "OK - Static build complete (output in out\)" -ForegroundColor Green

# ── Step 3: Add Android platform ─────────────────────────────────────────────
Write-Host ""
Write-Host "Step 3: Adding Android platform..." -ForegroundColor Yellow
if (-not (Test-Path "android")) {
    npx cap add android
} else {
    Write-Host "   (android\ already exists - skipping)" -ForegroundColor Gray
}
Write-Host "OK - Android platform ready" -ForegroundColor Green

# ── Step 4: Copy custom plugin files ─────────────────────────────────────────
Write-Host ""
Write-Host "Step 4: Copying CallManager native plugin..." -ForegroundColor Yellow
$dst = "android\app\src\main\java\com\rareprint\crm"
$src = "android-plugin\src\main\java\com\rareprint\crm"
Copy-Item "$src\CallManagerPlugin.kt" "$dst\" -Force
Copy-Item "$src\OverlayService.kt"    "$dst\" -Force
Write-Host "OK - Plugin files copied" -ForegroundColor Green

# ── Step 5: Patch MainActivity.kt ────────────────────────────────────────────
Write-Host ""
Write-Host "Step 5: Patching MainActivity.kt..." -ForegroundColor Yellow
Copy-Item "android-plugin\MainActivity.patch.kt" "$dst\MainActivity.kt" -Force
Write-Host "OK - MainActivity patched" -ForegroundColor Green

# ── Step 6: Patch AndroidManifest.xml ────────────────────────────────────────
Write-Host ""
Write-Host "Step 6: Adding permissions to AndroidManifest.xml..." -ForegroundColor Yellow
$manifest = "android\app\src\main\AndroidManifest.xml"
$xml = Get-Content $manifest -Raw

if ($xml -notmatch "SYSTEM_ALERT_WINDOW") {
    $permissions = @"

    <!-- RarePrint CRM call permissions -->
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    <uses-permission android:name="android.permission.READ_CALL_LOG" />
    <uses-permission android:name="android.permission.WRITE_CALL_LOG" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_PHONE_CALL" />

"@
    $service = @"

        <!-- RarePrint overlay service -->
        <service
            android:name="com.rareprint.crm.OverlayService"
            android:exported="false"
            android:foregroundServiceType="phoneCall" />
"@
    $xml = $xml -replace "<application", ($permissions + "    <application")
    $xml = $xml -replace "(<application[^>]*>)", ('$1' + $service)
    Set-Content $manifest $xml -Encoding UTF8
    Write-Host "OK - AndroidManifest.xml patched" -ForegroundColor Green
} else {
    Write-Host "   (permissions already present - skipping)" -ForegroundColor Gray
}

# ── Step 7: Sync Capacitor ────────────────────────────────────────────────────
Write-Host ""
Write-Host "Step 7: Syncing Capacitor..." -ForegroundColor Yellow
npx cap sync android
Write-Host "OK - Sync complete" -ForegroundColor Green

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  SETUP COMPLETE!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Open Android Studio:" -ForegroundColor White
Write-Host "       npx cap open android" -ForegroundColor Cyan
Write-Host ""
Write-Host "  2. Connect your Android phone via USB" -ForegroundColor White
Write-Host "     (enable USB Debugging in Developer Options)" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Press the green Play button in Android Studio" -ForegroundColor White
Write-Host ""
Write-Host "  To rebuild after code changes:" -ForegroundColor White
Write-Host "       `$env:CAPACITOR_BUILD='1'; npx next build; npx cap sync android" -ForegroundColor Cyan
Write-Host ""
