// cancel-fship-order.js
//
// One-off script to cancel a single Fship shipment directly via Fship's own
// API, bypassing the ERP entirely -- there's no "cancel" button wired into
// any ERP screen yet (see backend/src/fship/fship.service.ts's cancelOrder(),
// which this mirrors: POST /api/cancelorder, per Fship's API Integration
// Guide PDF p.11-12, only valid while the shipment is still in Booked/
// Manifested state).
//
// IMPORTANT: this hits Fship's PRODUCTION API and does NOT touch the ERP's
// own database. If this waybill is tied to a real ERP order/shipment record,
// the ERP will still show it as booked/dispatched after this runs -- this
// only cancels it on Fship's side. Handle the ERP-side record separately if
// needed.
//
// SECURITY: this file has your live Fship Client Key hardcoded below so you
// don't have to pass it separately. Do NOT commit this file or leave it
// sitting in the repo -- delete it (or move it well outside the repo) once
// you're done with it.

const FSHIP_CLIENT_KEY = "dbac687c10ead5c19f693f7feefb0193b05371a281a2e4783d4deca670811333";
const FSHIP_BASE = "https://capi.fship.in"; // production; staging would be https://capi-qc.fship.in

const waybill = process.argv[2] || "27519913724453";
const reason = process.argv[3] || "";

async function main() {
  console.log(`Cancelling Fship waybill ${waybill} ...`);

  const res = await fetch(`${FSHIP_BASE}/api/cancelorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      signature: FSHIP_CLIENT_KEY,
    },
    body: JSON.stringify({ waybill, reason }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  console.log("HTTP status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (data && data.status === true) {
    console.log(`\n✔ Waybill ${waybill} cancelled successfully.`);
  } else {
    const message = data?.response ?? data?.message ?? "no error detail returned";
    console.log(`\n✘ Cancel failed or was rejected: ${message}`);
    console.log("(Common reason: the order has moved past Booked/Manifested -- e.g. already picked up -- and Fship no longer allows cancellation via this endpoint.)");
  }
}

main().catch(err => {
  console.error("Request failed:", err);
  process.exit(1);
});
