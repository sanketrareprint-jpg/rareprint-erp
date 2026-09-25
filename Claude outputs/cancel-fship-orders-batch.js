// cancel-fship-orders-batch.js
//
// Same as cancel-fship-order.js, but takes any number of waybills at once
// and cancels them one after another, e.g.:
//
//   node cancel-fship-orders-batch.js 27519913728966 27519913728981 27519913729003
//
// Prints a per-waybill result line as it goes, then a final summary. Each
// call still hits Fship's PRODUCTION /api/cancelorder endpoint directly and
// does NOT touch the ERP's own database (see cancel-fship-order.js for the
// full background/caveats -- this file mirrors it, just looped).
//
// SECURITY: this file has your live Fship Client Key hardcoded below so you
// don't have to pass it separately. Do NOT commit this file or leave it
// sitting in the repo -- delete it (or move it well outside the repo) once
// you're done with it.

const FSHIP_CLIENT_KEY = "dbac687c10ead5c19f693f7feefb0193b05371a281a2e4783d4deca670811333";
const FSHIP_BASE = "https://capi.fship.in"; // production; staging would be https://capi-qc.fship.in

const waybills = process.argv.slice(2);

if (waybills.length === 0) {
  console.error("Usage: node cancel-fship-orders-batch.js <waybill1> <waybill2> ...");
  process.exit(1);
}

async function cancelOne(waybill) {
  const res = await fetch(`${FSHIP_BASE}/api/cancelorder`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      signature: FSHIP_CLIENT_KEY,
    },
    body: JSON.stringify({ waybill, reason: "" }),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  const ok = !!(data && data.status === true);
  return { waybill, ok, httpStatus: res.status, data };
}

async function main() {
  console.log(`Cancelling ${waybills.length} Fship waybill(s)...\n`);

  const results = [];
  for (const waybill of waybills) {
    process.stdout.write(`  ${waybill} ... `);
    try {
      const result = await cancelOne(waybill);
      results.push(result);
      console.log(result.ok ? "OK" : `FAILED (${result.data?.response ?? result.data?.message ?? "no error detail"})`);
    } catch (err) {
      results.push({ waybill, ok: false, error: err.message });
      console.log(`ERROR (${err.message})`);
    }
  }

  const succeeded = results.filter(r => r.ok);
  const failed = results.filter(r => !r.ok);

  console.log(`\n--- Summary: ${succeeded.length}/${results.length} cancelled ---`);
  if (succeeded.length) {
    console.log("Cancelled:", succeeded.map(r => r.waybill).join(", "));
  }
  if (failed.length) {
    console.log("Failed:", failed.map(r => r.waybill).join(", "));
    console.log("\nFull failure details:");
    for (const r of failed) {
      console.log(`  ${r.waybill}:`, JSON.stringify(r.data ?? r.error, null, 2));
    }
  }
}

main().catch(err => {
  console.error("Request failed:", err);
  process.exit(1);
});
