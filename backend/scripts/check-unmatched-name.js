/**
 * check-unmatched-name.js
 *
 * Follow-up to diagnose-missing-attendance.js — prints the NAME the machine
 * report itself attached to a given biometric ID, for the most recent
 * import session. Tells us whether that ID genuinely belongs to the
 * employee we think it does, or belongs to someone else in the report.
 *
 * HOW TO RUN:
 *   cd backend
 *   node scripts/check-unmatched-name.js 9
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
  const biometricId = process.argv[2];
  if (!biometricId) {
    console.error('Usage: node scripts/check-unmatched-name.js <biometricId>');
    process.exitCode = 1;
    return;
  }

  const sessions = await prisma.attendanceImportSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: 8,
  });

  for (const s of sessions) {
    const unmatched = s.unmatchedIds ? JSON.parse(s.unmatchedIds) : [];
    const hit = unmatched.find((u) => u.id === biometricId);
    console.log(`session ${s.id} (${s.fileName}, ${s.createdAt.toISOString()}) — id "${biometricId}" → ${hit ? `"${hit.name}"` : '(not in unmatched list for this session)'}`);
  }

  console.log('\nEmployees currently registered with this biometricId:');
  const emps = await prisma.employee.findMany({ where: { biometricId: String(biometricId) } });
  for (const e of emps) console.log(`  ${e.fullName} (${e.employeeCode})`);
  if (emps.length === 0) console.log('  (none)');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
