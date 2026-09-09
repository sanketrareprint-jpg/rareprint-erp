# -- Build the RarePrint Android APK with the new logo icon + splash --
# Run this from PowerShell on your own machine (needs Android Studio/SDK
# already set up, same as your previous builds - not the sandbox).
#
# What changed:
#  - App launcher icon (all densities) and splash screen now use the
#    RarePrint "R" logo instead of the default Capacitor icon.
#  - capacitor.config.ts: splash background is now white with a red
#    spinner, matching the brand (was blue/white default).
#  - No code/UI logic changed - same app as your last build.
#
# This produces a DEBUG apk (unsigned, fine for installing on your own /
# staff phones directly - same variant Android Studio's Run button installs).

$ErrorActionPreference = "Stop"
$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

# Gradle needs JAVA_HOME set. If it's not already set, use the JDK bundled
# inside Android Studio (same one Android Studio's own Run button uses) -
# no separate JDK install needed.
if (-not $env:JAVA_HOME -or -not (Test-Path "$env:JAVA_HOME\bin\java.exe")) {
    $candidates = @(
        "C:\Program Files\Android\Android Studio\jbr",
        "C:\Program Files\Android\Android Studio\jre"
    )
    $found = $candidates | Where-Object { Test-Path "$_\bin\java.exe" } | Select-Object -First 1
    if ($found) {
        $env:JAVA_HOME = $found
        Write-Host "Using JAVA_HOME: $found" -ForegroundColor Yellow
    } else {
        Write-Host "Could not find a JDK automatically. Open Android Studio, go to" -ForegroundColor Red
        Write-Host "File > Settings > Build Tools > Gradle, copy the 'Gradle JDK' path shown there," -ForegroundColor Red
        Write-Host "then run:  `$env:JAVA_HOME = '<that path>'   before re-running this script." -ForegroundColor Red
        exit 1
    }
}

# 1. Rebuild the static export + sync the new icons/splash/config into android/
Set-Location "$repo\frontend"
npm run build:android
if ($LASTEXITCODE -ne 0) { Write-Host "build:android failed - see errors above." -ForegroundColor Red; exit 1 }

# 2. Build the APK via Gradle
Set-Location "$repo\frontend\android"
.\gradlew.bat assembleDebug
Write-Host "gradlew exit code: $LASTEXITCODE" -ForegroundColor Yellow
if ($LASTEXITCODE -ne 0) { Write-Host "Gradle build failed - see errors above." -ForegroundColor Red; exit 1 }

# 3. Find the APK - search instead of assuming the exact path, in case the
#    build variant/output layout differs from what we expect.
$apk = Get-ChildItem "$repo\frontend\android\app\build\outputs\apk" -Recurse -Filter "*.apk" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $apk) {
    Write-Host "Gradle exited 0 but no .apk file was found under app\build\outputs\apk." -ForegroundColor Red
    Write-Host "Listing that folder's contents (if it exists) for diagnosis:" -ForegroundColor Red
    if (Test-Path "$repo\frontend\android\app\build\outputs") {
        Get-ChildItem "$repo\frontend\android\app\build\outputs" -Recurse | ForEach-Object { Write-Host "  $($_.FullName)" }
    } else {
        Write-Host "  (app\build\outputs doesn't exist at all - the build likely didn't actually run the assembleDebug task.)"
    }
    exit 1
}
$dest = "$repo\RarePrint.apk"
Copy-Item $apk.FullName $dest -Force
Write-Host ""
Write-Host "Found APK at: $($apk.FullName)" -ForegroundColor Green
Write-Host "Copied to: $dest" -ForegroundColor Green
Write-Host "Copy it to your phone (or send via WhatsApp/Drive) and tap it to install." -ForegroundColor Green
