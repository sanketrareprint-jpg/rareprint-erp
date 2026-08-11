/**
 * diagnose-remittance-awb-mismatch.js
 *
 * READ-ONLY diagnostic for the remittance-import "Unknown receiver / no
 * mobile" problem. The shop confirmed the Delivered Orders Report's actual
 * column headers already match exactly what remittance.service.ts expects
 * (S.No / Order Date / Order ID / Channel Order Id / Invoice Number /
 * Courier Name / AWB Date / AWB No. / Product Details / ... / Receiver
 * Mobile1 / Receiver Mobile2 / ...), so a header-detection bug is ruled out.
 * That leaves the AWB *values themselves* not lining up between the two
 * reports — leading zeros, scientific notation from Excel on a huge numeric
 * cell, stray whitespace, text vs. number cell type, etc.
 *
 * This parses a real Delivered Orders Report export with the EXACT same
 * logic remittance.service.ts uses (sheetToObjects + normalizeAwb), then
 * compares the resulting AWB set against every RemittanceRecord.awbNumber
 * currently sitting in NEEDS_REVIEW in the database (optionally scoped to
 * one import session), printing samples from both sides side-by-side so a
 * formatting mismatch is visible at a glance.
 *
 * Usage (run on a machine with real DB + internet access, e.g. locally,
 * not the sandbox — this needs `npx prisma generate` to have run):
 *   node scripts/diagnose-remittance-awb-mismatch.js --file="C:\path\to\Delivered Orders Report.xlsx"
 *   node scripts/diagnose-remittance-awb-mismatch.js --file=... --sessionId=cl123abc   (optional, defaults to ALL Needs Review rows across every import)
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const fs = require('fs');
const XLSX = require('xlsx');

// Prisma ORM v7 removed the `url` field from schema.prisma's datasource block —
// PrismaClient now needs a driver adapter passed explicitly instead of reading
// a connection string implicitly. Same pattern as prisma.service.ts /
// diagnose-stuck-dispatch-orders.js. See https://pris.ly/d/prisma7-client-config
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function arg(name) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : null;
}

// ─── Exact copies of remittance.service.ts's parsing helpers — kept in sync
//     by hand since this is a standalone diagnostic script, not a shared module. ──

function sheetToObjects(buffer, headerHints) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return { rows: [], headerRowIdx: -1, detectedHeaders: [] };
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  let headerRowIdx = 0;
  const lowerHints = headerHints.map((h) => h.toLowerCase());
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    const row = (aoa[i] ?? []).map((c) => String(c ?? '').trim().toLowerCase());
    const hits = lowerHints.filter((h) => row.includes(h)).length;
    if (hits >= Math.min(2, lowerHints.length)) {
      headerRowIdx = i;
      break;
    }
  }

  const headers = (aoa[headerRowIdx] ?? []).map((c) => String(c ?? '').trim());
  const rows = [];
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i] ?? [];
    const isBlank = raw.every((c) => c === null || c === undefined || String(c).trim() === '');
    if (isBlank) continue;
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = raw[idx] ?? null; });
    rows.push(obj);
  }
  return { rows, headerRowIdx, detectedHeaders: headers };
}

function normalizeAwb(raw) {
  return String(raw ?? '').trim().replace(/\.0+$/, '');
}

async function main() {
  const filePath = arg('file');
  const sessionId = arg('sessionId');
  if (!filePath) {
    console.error('Usage: node scripts/diagnose-remittance-awb-mismatch.js --file="C:\\path\\to\\Delivered Orders Report.xlsx" [--sessionId=...]');
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const { rows, headerRowIdx, detectedHeaders } = sheetToObjects(buffer, [
    'AWB No.', 'Channel Order Id / Invoice Number', 'Receiver Mobile1', 'Order ID',
  ]);

  console.log(`Header row detected at index ${headerRowIdx} (0 = first row in the sheet).`);
  console.log(`Detected headers: ${JSON.stringify(detectedHeaders)}`);
  console.log(`Parsed ${rows.length} data rows from the file.\n`);

  if (rows.length === 0) {
    console.log('No rows parsed at all — the header row was not correctly detected. This alone would explain every row showing "Unknown receiver / no mobile".');
  }

  const fileAwbs = new Map(); // normalized -> raw original value (with its JS type)
  for (const r of rows) {
    const raw = r['AWB No.'];
    const norm = normalizeAwb(raw);
    if (norm) fileAwbs.set(norm, raw);
  }
  console.log(`Distinct normalized AWB values found in the file: ${fileAwbs.size}`);
  console.log('Sample from file (raw value [type] -> normalized):');
  Array.from(fileAwbs.entries()).slice(0, 8).forEach(([norm, raw]) => {
    console.log(`  ${JSON.stringify(raw)} [${typeof raw}] -> "${norm}"`);
  });

  const where = { matchStatus: 'NEEDS_REVIEW' };
  if (sessionId) where.sessionId = sessionId;
  const pending = await prisma.remittanceRecord.findMany({
    where,
    select: { awbNumber: true, sessionId: true, receiverMobile: true },
  });
  console.log(`\nNEEDS_REVIEW records in the database${sessionId ? ' for that session' : ' (across ALL imports)'}: ${pending.length}`);
  console.log('Sample DB awbNumber values (as stored, from the Remittance Report side):');
  pending.slice(0, 8).forEach((p) => console.log(`  "${p.awbNumber}"  receiverMobile already stored: ${p.receiverMobile ?? '(none)'}`));

  let found = 0, notFound = 0;
  const misses = [];
  for (const p of pending) {
    if (fileAwbs.has(p.awbNumber)) found++;
    else { notFound++; if (misses.length < 15) misses.push(p.awbNumber); }
  }
  console.log(`\nMatched by exact normalized AWB string equality: ${found}`);
  console.log(`NOT found in this file: ${notFound}`);
  if (misses.length) {
    console.log('Sample DB AWBs with no match in the file — compare character-by-character against the file samples printed above (leading zeros, extra digits, spaces, etc. will show up here):');
    misses.forEach((m) => console.log(`  "${m}"`));
  }
  if (found > 0) {
    console.log('\nSince some AWBs DID match, run this file through "Fix Unmatched Rows" in the ERP now — it will pick up every one of those.');
  } else if (pending.length > 0) {
    console.log('\nZero AWBs matched — this is a real formatting mismatch between the two reports, not just a missing upload. Share this output so the matching logic can be adjusted to handle it.');
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
