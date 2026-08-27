# Events Module — one-time setup (outside the codebase)

The Events module (Admin nav → **Events**) is fully built and will deploy
with the rest of the app, but two things live outside this repo and won't
work until you set them up:

## 1. Create the AiSensy WhatsApp template

AiSensy only sends pre-approved WhatsApp templates (Meta requires this) — it
can't send an arbitrary image + freeform text. One template is reused for
every occasion (birthdays, anniversaries, and every festival), per your
choice, so you only need to get **one** template approved.

In your AiSensy dashboard, create a new template (Marketing or Utility
category — Utility is usually faster to approve for this kind of use):

- **Header**: Image
- **Body** (exact variable count matters — 3 variables, in this order):
  ```
  🎉 Happy {{2}}, {{1}}! {{3}} — Team RarePrint wishes you all the best.
  ```
  where `{{1}}` = the person's name, `{{2}}` = the occasion ("Birthday",
  "Anniversary", or "Festival"), `{{3}}` = a short extra line (e.g. "25
  years" for an anniversary, or just repeats the occasion if unknown). Feel
  free to reword the surrounding copy — just keep the three `{{n}}`
  placeholders in that order, since `WhatsAppService.sendEventWish`
  (`backend/src/whatsapp/whatsapp.service.ts`) sends them in that order.
- Submit for approval.

Once approved, note the exact **campaign name** you saved it under in
AiSensy, and set it in Railway:

- Backend service → Variables → `AISENSY_EVENTS_CAMPAIGN` = that name
  (if you don't set this, it defaults to `events_wish_erp` — only useful if
  you happen to name your template exactly that).

## 2. Set BACKEND_PUBLIC_URL

AiSensy fetches the generated flyer image itself, from a URL — the image is
never uploaded to AiSensy directly. That URL has to be one AiSensy's servers
can actually reach, i.e. your backend's real public Railway URL.

- Backend service → Variables → `BACKEND_PUBLIC_URL` = your backend's public
  URL, e.g. `https://rareprint-erp-backend-production.up.railway.app` (no
  trailing slash needed either way).

This is the same pattern already used by `BillingService.shareInvoiceViaWhatsapp`
for the invoice-PDF WhatsApp link, if you've already set it for that feature
you're done with this step.

## Until both are set

Every automatic/test send will fail gracefully — logged as a `FAILED` row
in Events → History with a clear reason ("BACKEND_PUBLIC_URL is not set…" or
an AiSensy "unknown campaign" style error), never a crash. Safe to deploy the
module and use the People / Templates / Festivals tabs immediately; wire up
AiSensy whenever the template is approved.

## After both are set

Use Events → People → the "Bday" / "Anniv" buttons next to anyone with a
DOB/anniversary on file to send a real test message immediately, before
trusting the daily 8am IST automatic job.

## 3. Client Wish Cards (added 2026-08-28) — a SEPARATE AiSensy template

The "Client Businesses" tab is a different feature from the People/Templates/
Festivals flow above — see
[`Events_Module_Client_Wish_Cards_Build_Prompt.md`](./Events_Module_Client_Wish_Cards_Build_Prompt.md)
for the full spec. It sends a fundamentally different message ("here's your
ready-to-share wish card" to a B2B client, not a personal "Happy Birthday" to
an individual), so **reusing the template from step 1 above will not work
correctly** — it needs its own template submitted for approval.

In your AiSensy dashboard, create a second template:

- **Header**: Image
- **Body** (2 variables, in this order):
  ```
  Hi {{1}}, here's your ready-to-share {{2}} wish card — download and share it with your customers!
  ```
  where `{{1}}` = the client business's name, `{{2}}` = the festival name.
  Reword the surrounding copy freely — just keep the two `{{n}}` placeholders
  in order, since `WhatsAppService.sendClientWishReady`
  (`backend/src/whatsapp/whatsapp.service.ts`) sends them in that order.
- Submit for approval.

Once approved, set the campaign name in Railway:

- Backend service → Variables → `AISENSY_CLIENT_WISH_CAMPAIGN` = that name
  (if you don't set this, it defaults to `client_wish_card_erp` — only
  useful if you happen to name your template exactly that; every send will
  fail gracefully until this is set correctly, same as step 1).

Once set, use Events → Client Businesses → the "Test" button next to any
business (with a festival selected in the dropdown above the list, and that
festival's Client Wish Card template assigned on the Festivals tab) to send
a real test message immediately.
