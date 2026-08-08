# -- Fix: Reject Dispatch "Internal server error" + Orders page hiding the -
# -- real "Could not fetch rates" reason ------------------------------------
# Run this from PowerShell on your own machine, from the repo root.

# BUG 1 (the "Internal server error" on Reject Dispatch):
# accounts.service.ts's rejectDispatch (and rejectSampleOrder, same bug)
# wrote a StatusLog row with changedById: 'system' -- a literal string, not
# a real user ID. StatusLog.changedById has a foreign key to the User
# table, and there's no user with id 'system', so the database rejected
# every single reject-dispatch/reject-sample attempt with a foreign key
# violation (confirmed via the Railway log: "Prisma P2003: Foreign key
# constraint violated on the constraint: StatusLog_changedById_fkey").
# This was pre-existing code, not something introduced by recent changes --
# it just hadn't been exercised/reported before now.
#
# FIX: both endpoints now record the real logged-in user's id (threaded
# through from the controller via req.user), falling back to null (the
# column allows it) if it's ever missing.
#
# BUG 2 ("Could not fetch rates" with no real explanation):
# The Orders page's "Fetch Courier Rates" button always showed the same
# generic "Could not fetch rates" alert no matter what actually went wrong
# on the backend -- it discarded the real error message. The Dispatch
# page's identical feature does this correctly (shows the backend's actual
# message). Likely culprit for what you hit: fetching rates only works
# while an order is still READY_FOR_DISPATCH or PARTIALLY_DISPATCHED -- if
# it had already been submitted (now PENDING_DISPATCH_APPROVAL, awaiting
# accounts), the backend correctly refuses with "Order must be in a
# dispatchable status to fetch rates", but you'd have only ever seen the
# generic alert. This fix doesn't change that rule -- it just makes the
# real reason visible, matching the Dispatch page. Please retry and tell me
# the exact message if it still fails; that'll tell us if it's this, or a
# genuinely different problem (e.g. a courier API issue).
#
# Files changed:
#   backend/src/accounts/accounts.controller.ts (thread req.user into reject-dispatch, reject-sample)
#   backend/src/accounts/accounts.service.ts (rejectDispatch, rejectSampleOrder: real user id instead of 'system')
#   frontend/app/orders/page.tsx (fetchRates: show the real backend error)

$repo = "C:\Users\ASUS\Downloads\rareprint-erp"

Set-Location "$repo\backend"
npm run build

Set-Location $repo
git add backend/src/accounts/accounts.controller.ts
git add backend/src/accounts/accounts.service.ts
git add frontend/app/orders/page.tsx
git add deploy-fix-reject-dispatch-and-rates-error.ps1
git commit -m "Fix reject-dispatch/reject-sample FK violation (changedById); surface real fetch-rates error on Orders page"
git push

Write-Host ""
Write-Host "Pushed. After it deploys: try Reject Dispatch again on a PENDING_DISPATCH_APPROVAL order, and try Fetch Courier Rates again. If rates still fails, send me the exact alert text this time -- it'll now show the real reason instead of a generic message." -ForegroundColor Yellow
