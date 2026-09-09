/**
 * diagnose-missing-attendance.js
 *
 * WHY THIS EXISTS
 * ----------------
 * The Attendance grid (frontend/app/attendance/page.tsx) only shows rows
 * from ONE "Final" import session per month (see getMonthGrid in
 * attendance.service.ts) — if a sheet's been marked Final for a month, every
 * other import for the same month is hidden, even if it genuinely has real
 * imported rows in the database. Employees are matched during import by
 * their machine biometricId, not by name — if an employee's biometricId is
 * missing/wrong, their rows from the machine report never even become
 * AttendanceRecord rows (silently skipped as "unmatched"), which looks
 * identical from the UI to "the final sheet just doesn't have them."
 *
 * This script tells you which of the two is actually going on for a given
 * employee + month:
 *   1. Their biometricId isn't set, or never matched any import (rows never
 *      existed at all) — fix: set the correct biometricId on their Employee
 *      record, then re-run the import.
 *   2. Their rows DO exist in the database, just under a DIFFERENT import
 *      session than whichever one is currently marked Final — fix: either
 *      mark the correct session Final, or manually re-import/merge.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/diagnose-missing-attendance.js RP23 2026-07
 */

if (!process.env.DATABASE_URL) {
  const fs = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      let value = trimmed.slice(idx + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const employeeCode = process.argv[2];
  const monthArg = process.argv[3]; // "2026-07"
  if (!employeeCode || !monthArg) {
    console.error('Usage: node scripts/diagnose-missing-attendance.js <employeeCode> <YYYY-MM>');
    process.exitCode = 1;
    return;
  }
  const [y, m] = monthArg.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 1);

  const employee = await prisma.employee.findFirst({ where: { employeeCode } });
  if (!employee) {
    console.error(`No employee with code ${employeeCode}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Employee: ${employee.fullName} (${employee.employeeCode})`);
  console.log(`  biometricId: ${employee.biometricId ?? '(NOT SET — this alone would explain missing rows)'}`);

  const sessions = await prisma.attendanceImportSession.findMany({
    where: { periodStart: { lt: monthEnd }, periodEnd: { gte: monthStart } },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`\nImport sessions overlapping ${monthArg}: ${sessions.length}`);
  for (const s of sessions) {
    const unmatched = s.unmatchedIds ? JSON.parse(s.unmatchedIds) : [];
    const wasUnmatched = employee.biometricId && unmatched.some((u) => u.id === employee.biometricId);
    console.log(`  session ${s.id}`);
    console.log(`    file: ${s.fileName}, period ${s.periodStart.toISOString().slice(0,10)}..${s.periodEnd.toISOString().slice(0,10)}`);
    console.log(`    isFinal: ${s.isFinal}  rowsImported: ${s.rowsImported}  rowsSkipped: ${s.rowsSkipped}`);
    if (wasUnmatched) console.log(`    *** this employee's biometricId appeared in this session's UNMATCHED list — their rows were skipped on import ***`);
  }

  const records = await prisma.attendanceRecord.findMany({
    where: { employeeId: employee.id, date: { gte: monthStart, lt: monthEnd } },
    orderBy: { date: 'asc' },
  });
  console.log(`\nAttendanceRecord rows that actually exist for this employee in ${monthArg}: ${records.length}`);
  const bySession = new Map();
  for (const r of records) {
    const key = r.importSessionId ?? `(no session — source=${r.source})`;
    bySession.set(key, (bySession.get(key) ?? 0) + 1);
  }
  for (const [key, count] of bySession) console.log(`  ${key}: ${count} day(s)`);

  const finalSession = sessions.find((s) => s.isFinal);
  console.log(`\nSession currently marked Final for ${monthArg}: ${finalSession ? finalSession.id : '(none)'}`);
  if (finalSession) {
    const finalCount = records.filter((r) => r.importSessionId === finalSession.id || r.source === 'MANUAL' || r.source === 'EDITED').length;
    console.log(`Rows the grid will actually show (Final session's rows + any manual edits): ${finalCount}`);
    if (finalCount === 0 && records.length > 0) {
      console.log('*** DIAGNOSIS: rows exist, but under a different (non-Final) session. Either mark the session above Final, or re-import. ***');
    } else if (records.length === 0) {
      console.log('*** DIAGNOSIS: no rows exist at all for this employee this month — check biometricId match above. ***');
    }
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
