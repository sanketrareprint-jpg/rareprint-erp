/**
 * backfill-remittance-pickup-dates.js
 *
 * One-off fix for RemittanceRecord rows that got matched (receiver name/mobile
 * filled in) via a Delivered Orders Report BEFORE the sweep function was fixed
 * to also set pickupDate. Those rows are stuck showing "Picked up: —" forever,
 * since the sweep only runs against NEW imports/uploads — it doesn't revisit
 * rows it already touched.
 *
 * This script re-parses one or more Delivered Orders Report .xlsx files you
 * already have on hand and, for every RemittanceRecord whose awbNumber matches
 * a row in the file AND whose pickupDate is still null, sets pickupDate from
 * that row's "AWB Date" column. It does NOT touch matchStatus, receiver info,
 * or anything else — purely a pickupDate backfill. Safe to re-run; only rows
 * with a null pickupDate are touched, so running it twice with the same file
 * is a no-op the second time.
 *
 * Usage:
 *   node scripts/backfill-remittance-pickup-dates.js <file1.xlsx> [file2.xlsx ...]
 *
 * Dry-run first (shows what WOULD change, writes nothing):
 *   node scripts/backfill-remittance-pickup-dates.js <file.xlsx>
 *
 * Apply:
 *   node scripts/backfill-remittance-pickup-dates.js <file.xlsx> --apply
 */

const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch {}

const fs = require('fs');
const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const APPLY = process.argv.includes('--apply');
const files = process.argv.slice(2).filter((a) => a !== '--apply');

// ── Same parsing rules as remittance.service.ts (parseDeliveredOrdersXlsx) ──

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

function parseDeliveredOrdersXlsx(buffer) {
  const rows = sheetToObjects(buffer, [
    'AWB No.', 'Channel Order Id / Invoice Number', 'Receiver Mobile1', 'Order ID',
  ]);
  const map = new Map();
  for (const r of rows) {
    const awb = normalizeAwb(r['AWB No.']);
    if (!awb) continue;
    map.set(awb, { awbDate: parseFlexibleDate(r['AWB Date']) });
  }
  return map;
}

async function main() {
  if (files.length === 0) {
    console.error('Usage: node scripts/backfill-remittance-pickup-dates.js <file1.xlsx> [file2.xlsx ...] [--apply]');
    process.exit(1);
  }

  console.log(APPLY ? '⚡ APPLYING changes...' : '🔍 DRY RUN — pass --apply to commit');

  const deliveredMap = new Map();
  for (const f of files) {
    if (!fs.existsSync(f)) {
      console.error(`File not found: ${f}`);
      process.exit(1);
    }
    const buffer = fs.readFileSync(f);
    const map = parseDeliveredOrdersXlsx(buffer);
    console.log(`Parsed ${map.size} AWB rows from ${path.basename(f)}`);
    for (const [awb, row] of map) {
      if (!deliveredMap.has(awb)) deliveredMap.set(awb, row);
    }
  }
  console.log(`Total unique AWBs across all files: ${deliveredMap.size}`);

  const candidates = await prisma.remittanceRecord.findMany({
    where: { pickupDate: null },
    select: { id: true, awbNumber: true },
  });
  console.log(`RemittanceRecord rows with pickupDate still null: ${candidates.length}`);

  let matched = 0, noAwbDate = 0;
  for (const rec of candidates) {
    const delivered = deliveredMap.get(rec.awbNumber);
    if (!delivered || !delivered.awbDate) { noAwbDate++; continue; }
    matched++;
    if (APPLY) {
      await prisma.remittanceRecord.update({
        where: { id: rec.id },
        data: { pickupDate: delivered.awbDate },
      });
    }
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'} pickupDate on ${matched} record(s).`);
  console.log(`${candidates.length - matched} record(s) still have no pickupDate — their AWB isn't in the file(s) you provided (or the row had no AWB Date).`);
  if (!APPLY && matched > 0) {
    console.log('\nRe-run with --apply to write these changes.');
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
