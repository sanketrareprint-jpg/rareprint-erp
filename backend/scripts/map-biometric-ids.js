/**
 * map-biometric-ids.js
 *
 * WHY THIS EXISTS
 * ----------------
 * The attendance importer matches machine-report rows to Employee records
 * purely by Employee.biometricId (a raw numeric ID string like "1", "10").
 * If that field is missing or wrong on an Employee, their punches are
 * silently skipped on every import (see diagnose-missing-attendance.js) —
 * this is exactly what happened to Yash/RP23.
 *
 * This script takes the ID -> first-name mapping straight from a machine
 * "Exception Statistic Report" export (hardcode it below from the file you
 * uploaded) and matches it against the real Employee table by first name,
 * so you can set biometricId correctly for everyone in one pass instead of
 * checking each employee one at a time in the HR UI.
 *
 * SAFETY: this is DRY-RUN by default. It only prints what it *would* change.
 * Nothing is written to the database unless you pass --apply.
 *
 * HOW TO RUN (from your own machine, needs real DATABASE_URL to Railway):
 *   cd backend
 *   node scripts/map-biometric-ids.js            (dry run — review the plan)
 *   node scripts/map-biometric-ids.js --apply     (actually writes biometricId)
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

// ID -> Name, read directly out of the "Exception Statistic Report"
// (Stat.Date: 2026-08-01 ~ 2026-08-31) you uploaded as FINAL_DATA.xlsx.
// If you re-run this later against a different/newer export, update this
// table from that file's ID/Name columns first.
const MACHINE_ID_TO_NAME = {
  '1': 'Prajakta',
  '2': 'Vaishali',
  '3': 'Divya',
  '4': 'Nikita',
  '5': 'Fiza',
  '6': 'Priya',
  '7': 'Sandip',
  '10': 'Yash',
  '12': 'Akansha',
  '14': 'Sonali',
  '15': 'Samita',
  '16': 'Shrawni',
  '17': 'DEepak',
  '18': 'SunitA',
  '19': 'Warsha',
};

function firstName(fullName) {
  return (fullName || '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

async function main() {
  const apply = process.argv.includes('--apply');

  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, biometricId: true, status: true },
    orderBy: { employeeCode: 'asc' },
  });

  // Build name -> [employees] index so we can flag ambiguous first names
  // instead of guessing.
  const byFirstName = new Map();
  for (const e of employees) {
    const key = firstName(e.fullName);
    if (!byFirstName.has(key)) byFirstName.set(key, []);
    byFirstName.get(key).push(e);
  }

  const updates = []; // { employee, newId }
  const conflicts = []; // ambiguous / not found / already-taken-by-someone-else
  const alreadyCorrect = [];

  for (const [machineId, name] of Object.entries(MACHINE_ID_TO_NAME)) {
    const matches = byFirstName.get(name.toLowerCase()) ?? [];
    if (matches.length === 0) {
      conflicts.push(`Machine ID ${machineId} ("${name}") — no Employee with that first name found. Check spelling / whether they're in the HR table at all.`);
      continue;
    }
    if (matches.length > 1) {
      conflicts.push(`Machine ID ${machineId} ("${name}") — AMBIGUOUS, ${matches.length} employees share that first name: ${matches.map((m) => `${m.fullName} (${m.employeeCode})`).join(', ')}. Resolve manually.`);
      continue;
    }
    const emp = matches[0];
    if (emp.biometricId === machineId) {
      alreadyCorrect.push(`${emp.fullName} (${emp.employeeCode}) — already correctly set to ${machineId}`);
      continue;
    }
    // Is this machineId currently claimed by a DIFFERENT employee? (biometricId is @unique)
    const claimedBy = employees.find((e) => e.biometricId === machineId && e.id !== emp.id);
    if (claimedBy) {
      conflicts.push(`Machine ID ${machineId} ("${name}") would go to ${emp.fullName} (${emp.employeeCode}), but that ID is currently set on ${claimedBy.fullName} (${claimedBy.employeeCode}) instead. Resolve manually — one of these is wrong.`);
      continue;
    }
    updates.push({ employee: emp, newId: machineId });
  }

  console.log(`\n=== Employees NOT in this machine report at all (${employees.length - Object.keys(MACHINE_ID_TO_NAME).length} of ${employees.length}) ===`);
  const reportedNames = new Set(Object.values(MACHINE_ID_TO_NAME).map((n) => n.toLowerCase()));
  for (const e of employees) {
    if (!reportedNames.has(firstName(e.fullName))) {
      console.log(`  ${e.fullName} (${e.employeeCode}) — current biometricId: ${e.biometricId ?? '(none)'} — status: ${e.status}`);
    }
  }

  console.log(`\n=== Already correct (${alreadyCorrect.length}) ===`);
  alreadyCorrect.forEach((l) => console.log('  ' + l));

  console.log(`\n=== Needs updating (${updates.length}) ===`);
  for (const u of updates) {
    console.log(`  ${u.employee.fullName} (${u.employee.employeeCode}): ${u.employee.biometricId ?? '(none)'} -> ${u.newId}`);
  }

  console.log(`\n=== Conflicts / needs manual review (${conflicts.length}) ===`);
  conflicts.forEach((l) => console.log('  ' + l));

  if (!apply) {
    console.log(`\nDry run only — no changes made. Re-run with --apply once the plan above looks right.`);
    return;
  }

  console.log(`\nApplying ${updates.length} update(s)...`);
  for (const u of updates) {
    try {
      await prisma.employee.update({ where: { id: u.employee.id }, data: { biometricId: u.newId } });
      console.log(`  OK: ${u.employee.fullName} (${u.employee.employeeCode}) -> biometricId ${u.newId}`);
    } catch (e) {
      console.error(`  FAILED: ${u.employee.fullName} (${u.employee.employeeCode}) -> ${u.newId}: ${e.message}`);
    }
  }
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
