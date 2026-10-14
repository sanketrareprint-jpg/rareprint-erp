import { NextResponse } from "next/server";
import { getSignupsPool } from "../../lib/signups-db";
import { getPlans } from "../../lib/plans-data";

// Public trial-signup endpoint. It only SAVES the request — nothing is
// created on Railway or Vercel from here. Provisioning stays a deliberate,
// manual step (`node saas-ops/signups.js approve <id>`) so this public site
// never holds the Railway token, and a fake signup can't run up server bills.

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(request: Request) {
  const pool = getSignupsPool();
  if (!pool) {
    // Not configured on this deployment — the form falls back to email.
    return NextResponse.json({ error: "Signups are not available right now." }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot: a field hidden from people. Bots that fill every input get a
  // normal-looking success response and nothing is saved.
  if (cleanText(body.website, 200)) {
    return NextResponse.json({ ok: true });
  }

  const fullName = cleanText(body.fullName, 120);
  const email = cleanText(body.email, 200).toLowerCase();
  const phone = cleanText(body.phone, 20);
  const companyName = cleanText(body.companyName, 120);
  const plan = cleanText(body.plan, 40);

  const planIds = (await getPlans()).map((p) => p.id);
  const errors: string[] = [];
  if (fullName.length < 2) errors.push("Enter your name.");
  if (!EMAIL_PATTERN.test(email)) errors.push("Enter a valid email address.");
  if (phone.replace(/\D/g, "").length < 10) errors.push("Enter a valid mobile number.");
  // Provisioning builds the customer's environment name from this, so it
  // must contain at least one letter or digit.
  if (companyName.length < 2 || !/[a-z0-9]/i.test(companyName)) errors.push("Enter your business name.");
  if (!planIds.includes(plan)) errors.push("Choose a plan.");
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(" ") }, { status: 400 });
  }

  try {
    // One open request per email: a repeat submission while the first is
    // still pending is acknowledged without creating a duplicate (enforced
    // by the partial unique index created in `signups.js init`).
    await pool.query(
      `INSERT INTO saas_signup_requests (full_name, email, phone, company_name, plan)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT DO NOTHING`,
      [fullName, email, phone, companyName, plan],
    );
  } catch (err) {
    console.error("[signup] failed to save request:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not save your request. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
