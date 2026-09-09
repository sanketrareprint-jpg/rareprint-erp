/**
 * map-biometric-ids.js
 *
 * Matches every Employee record to their biometric machine ID, using the
 * ID -> Name list read directly out of the "Exception Statistic Report"
 * (FINAL_DATA.xlsx, Aug 2026 export). Matching is done by name (case-
 * insensitive substring, either direction) since the report only gives
 * first names while Employee.fullName is the full name.
 *
 * SAFE BY DEFAULT: run with no arguments and it only PRINTS the proposed
 * mapping -- it makes no database changes. Every row is one of:
 *   OK       - single confident name match, ready to apply
 *   NO MATCH - a machine ID/name with no matching Employee found
 *   AMBIGUOUS- a machine ID/name matched more than one Employee
 *   CONFLICT - would collide with another employee's already-set biometricId
 * Only after reviewing that output and confirming it looks right, re-run
 * with --apply to actually write the changes.
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Machine ID -> Name, read directly from the Aug 2026 Exception Statistic
// Report (FINAL_DATA.xlsx). Update this list if you re-run against a
// different month's export with a different roster.
const MACHINE_ROSTER = {
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

const APPLY = process.argv.includes('--apply');

(async () => {
  const employees = await prisma.employee.findMany({
    select: { id: true, employeeCode: true, fullName: true, biometricId: true, status: true },
    orderBy: { employeeCode: 'asc' },
  });

  console.log(`Loaded ${employees.length} employees from the database.\n`);

  const plan = []; // { machineId, name, action, employee?, reason? }
  const usedEmployeeIds = new Set();

  for (const [machineId, name] of Object.entries(MACHINE_ROSTER)) {
    const needle = name.toLowerCase();
    const matches = employees.filter((e) => {
      const hay = e.fullName.toLowerCase();
      return hay.includes(needle) || needle.includes(hay);
    });

    if (matches.length === 0) {
      plan.push({ machineId, name, action: 'NO MATCH', reason: 'no Employee.fullName resembles this name' });
      continue;
    }
    if (matches.length > 1) {
      plan.push({
        machineId,
        name,
        action: 'AMBIGUOUS',
        reason: `matches ${matches.length} employees: ${matches.map((m) => `${m.employeeCode} ${m.fullName}`).join(', ')}`,
      });
      continue;
    }

    const emp = matches[0];
    // Does some OTHER employee already hold this exact machineId?
    const heldByOther = employees.find((e) => e.biometricId === machineId && e.id !== emp.id);
    if (heldByOther) {
      plan.push({
        machineId,
        name,
        action: 'CONFLICT',
        reason: `machine ID ${machineId} is currently set on ${heldByOther.employeeCode} ${heldByOther.fullName}, not ${emp.employeeCode} ${emp.fullName}`,
      });
      continue;
    }
    if (usedEmployeeIds.has(emp.id)) {
      plan.push({ machineId, name, action: 'AMBIGUOUS', reason: `${emp.employeeCode} ${emp.fullName} already matched to another machine ID in this same run` });
      continue;
    }
    usedEmployeeIds.add(emp.id);

    if (emp.biometricId === machineId) {
      plan.push({ machineId, name, action: 'ALREADY CORRECT', employee: emp });
    } else {
      plan.push({ machineId, name, action: emp.biometricId ? 'WOULD CHANGE' : 'WOULD SET', employee: emp });
    }
  }

  console.log('Machine ID | Name (from sheet) | Action           | Employee (code, name, current biometricId)');
  console.log('-----------|--------------------|------------------|--------------------------------------------');
  for (const row of plan) {
    const empStr = row.employee ? `${row.employee.employeeCode}  ${row.employee.fullName}  (was: ${row.employee.biometricId ?? 'null'})` : '-';
    console.log(`${row.machineId.padEnd(11)}| ${row.name.padEnd(19)}| ${row.action.padEnd(17)}| ${empStr}${row.reason ? '  -- ' + row.reason : ''}`);
  }

  const employeesNotInRoster = employees.filter((e) => !plan.some((p) => p.employee && p.employee.id === e.id));
  if (employeesNotInRoster.length) {
    console.log('\nEmployees NOT mentioned anywhere in this month\'s sheet (left untouched, not necessarily wrong):');
    for (const e of employeesNotInRoster) {
      console.log(`  ${e.employeeCode}  ${e.fullName}  status=${e.status}  current biometricId=${e.biometricId ?? 'null'}`);
    }
  }

  const toApply = plan.filter((p) => p.action === 'WOULD CHANGE' || p.action === 'WOULD SET');
  const blockers = plan.filter((p) => ['NO MATCH', 'AMBIGUOUS', 'CONFLICT'].includes(p.action));

  console.log(`\n${toApply.length} would be set/changed, ${blockers.length} need manual attention, ${plan.length - toApply.length - blockers.length} already correct.`);

  if (!APPLY) {
    console.log('\nDRY RUN ONLY -- no changes made. Review the table above.');
    console.log('If it looks right, fix any NO MATCH / AMBIGUOUS / CONFLICT rows first (or accept them as-is),');
    console.log('then re-run as:  node map-biometric-ids.js --apply');
  } else {
    if (blockers.length) {
      console.log('\nRefusing to --apply while NO MATCH / AMBIGUOUS / CONFLICT rows exist above. Resolve them first (edit MACHINE_ROSTER or fix data), then re-run.');
    } else {
      for (const row of toApply) {
        await prisma.employee.update({ where: { id: row.employee.id }, data: { biometricId: row.machineId } });
        console.log(`Set ${row.employee.employeeCode} ${row.employee.fullName} -> biometricId ${row.machineId}`);
      }
      console.log(`\nDone. ${toApply.length} employee record(s) updated.`);
    }
  }

  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
