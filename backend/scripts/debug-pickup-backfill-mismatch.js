/**
 * debug-pickup-backfill-mismatch.js
 *
 * Diagnostic for backfill-remittance-pickup-dates.js matching 0 records.
 * Prints sample AWBs from both sides (the file, and the DB) plus whether the
 * file's rows actually carry a parseable AWB Date, so we can see exactly
 * where the mismatch is (format difference vs. genuinely disjoint AWB sets
 * vs. missing AWB Date column).
 *
 * Usage: node scripts/debug-pickup-backfill-mismatch.js <file.xlsx>
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const fs = require('fs');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function normalizeAwb(raw) {
  return String(raw ?? '').trim().replace(/\.0+$/, '');
}

function parseFlexibleDate(raw) {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function sheetToObjects(buffer, headerHints) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
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
  console.log('Detected header row', headerRowIdx, '->', headers);
  const rows = [];
  for (let i = headerRowIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i] ?? [];
    const isBlank = raw.every((c) => c === null || c === undefined || String(c).trim() === '');
    if (isBlank) continue;
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = raw[idx] ?? null; });
    rows.push(obj);
  }
  return rows;
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('Usage: node scripts/debug-pickup-backfill-mismatch.js <file.xlsx>');
    process.exit(1);
  }

  const buffer = fs.readFileSync(file);
  const rows = sheetToObjects(buffer, [
    'AWB No.', 'Channel Order Id / Invoice Number', 'Receiver Mobile1', 'Order ID',
  ]);
  console.log(`\nParsed ${rows.length} rows.`);

  const fileAwbs = [];
  let withDate = 0, withoutDate = 0;
  for (const r of rows) {
    const awb = normalizeAwb(r['AWB No.']);
    if (!awb) continue;
    const d = parseFlexibleDate(r['AWB Date']);
    if (d) withDate++; else withoutDate++;
    fileAwbs.push(awb);
  }
  console.log(`Rows with a usable AWB: ${fileAwbs.length}`);
  console.log(`  ...of those, with a parseable AWB Date: ${withDate}`);
  console.log(`  ...of those, WITHOUT a parseable AWB Date: ${withoutDate}`);
  console.log('\nSample raw "AWB Date" values from first 5 rows:', rows.slice(0, 5).map((r) => r['AWB Date']));
  console.log('Sample normalized AWBs from file (first 10):', fileAwbs.slice(0, 10));

  const nullPickup = await prisma.remittanceRecord.findMany({
    where: { pickupDate: null },
    select: { awbNumber: true },
    take: 10,
  });
  console.log('\nSample awbNumber values from DB (records with null pickupDate, first 10):', nullPickup.map((r) => r.awbNumber));

  const fileAwbSet = new Set(fileAwbs);
  const allNullPickup = await prisma.remittanceRecord.findMany({
    where: { pickupDate: null },
    select: { awbNumber: true },
  });
  const overlap = allNullPickup.filter((r) => fileAwbSet.has(r.awbNumber));
  console.log(`\nDirect awbNumber overlap between file and DB (null-pickup records): ${overlap.length} / ${allNullPickup.length}`);

  const nullPickupWithDates = await prisma.remittanceRecord.findMany({
    where: { pickupDate: null },
    select: { remittanceDate: true, deliveryDate: true, receiverName: true },
  });
  const remDates = nullPickupWithDates.map((r) => r.remittanceDate).filter(Boolean).sort((a, b) => a - b);
  const delDates = nullPickupWithDates.map((r) => r.deliveryDate).filter(Boolean).sort((a, b) => a - b);
  const withReceiver = nullPickupWithDates.filter((r) => r.receiverName).length;
  console.log(`\nOf the ${nullPickupWithDates.length} null-pickup records:`);
  console.log(`  remittanceDate range: ${remDates[0]?.toISOString().slice(0,10)} to ${remDates[remDates.length-1]?.toISOString().slice(0,10)}`);
  console.log(`  deliveryDate range:   ${delDates[0]?.toISOString().slice(0,10)} to ${delDates[delDates.length-1]?.toISOString().slice(0,10)}`);
  console.log(`  already have a receiverName (matched before, just missing pickupDate): ${withReceiver}`);
  console.log(`  never matched at all (no receiverName): ${nullPickupWithDates.length - withReceiver}`);

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
