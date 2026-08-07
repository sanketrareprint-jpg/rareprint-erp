# -- Fix: Dockerfile port didn't match Railway's configured port -----------
# Run this from PowerShell on your own machine (not inside any sandbox).
#
# ROOT CAUSE of today's outage ("Application failed to respond" / 502,
# CORS errors, dashboard/login unreachable):
#
# backend/Dockerfile had:
#   ENV PORT=8080
#   EXPOSE 8080
#
# But Railway's own Variables tab has PORT=3000, and the backend service's
# Networking settings have the target port set to 3000 too. Railway reads a
# Dockerfile's EXPOSE directive (and/or its baked-in ENV PORT) to figure out
# which port to route traffic to for Dockerfile-based deploys. With EXPOSE
# saying 8080 while the platform's own Variables/Networking config says
# 3000, the app itself booted fine and sat there idle and healthy (which is
# exactly why CPU/memory looked normal and the container stayed "Active"),
# but Railway's edge proxy was pointed at the wrong port and could never
# actually reach it. That's the exact "Application failed to respond"
# signature, and why it failed identically even after rolling back to a
# previously-working deployment and restarting the container -- neither of
# those touches Docker image metadata baked in at build time.
#
# Confirmed by walking through, with the user, live in Railway: Postgres
# healthy (9/500 connections), backend Variables PORT=3000, Networking
# target port 3000, Metrics showing a normal idle app (not a crash loop,
# not OOM) -- all pointing at a routing/port mismatch rather than a code
# bug, database issue, or platform outage.
#
# FIX: Dockerfile now says ENV PORT=3000 / EXPOSE 3000, matching Railway's
# actual configuration exactly.
#
# File changed: backend/Dockerfile

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location $repo
git add backend/Dockerfile
git add deploy-fix-dockerfile-port-mismatch.ps1
git commit -m "Fix Dockerfile PORT/EXPOSE mismatch (was 8080, Railway is configured for 3000) - root cause of todays 502 outage"
git push

Write-Host ""
Write-Host "Pushed. This forces a fresh Docker build since the Dockerfile itself changed." -ForegroundColor Yellow
Write-Host "Watch the Railway deploy logs - it should get past Starting Container and actually log the app starting up this time." -ForegroundColor Yellow
