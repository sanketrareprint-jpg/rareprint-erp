// Temporary diagnostic script — reads the certificate job + template that
// produced the blank-text / bottom-cert-off-sheet PDF, so we can see the
// exact sheetSettings/columnMapping/rawRows/fields instead of guessing.
// Safe to delete after use; only does read-only SELECTs.
const fs = require('fs');
const envContent = fs.readFileSync('.env', 'utf8');
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

(async () => {
  const job = await prisma.certificateJob.findUnique({ where: { id: 'cmt4bewsd000101l5k679dvqt' } });
  if (!job) { console.log('JOB NOT FOUND'); process.exit(0); }
  console.log('--- JOB ---');
  console.log('status:', job.status);
  console.log('rowsTotal:', job.rowsTotal, 'rowsGenerated:', job.rowsGenerated, 'rowsFailed:', job.rowsFailed);
  console.log('errorMessage:', job.errorMessage);
  console.log('invalidRowMode:', job.invalidRowMode);
  console.log('columnMapping:', JSON.stringify(job.columnMapping));
  console.log('sheetSettings:', JSON.stringify(job.sheetSettings));
  const rawRows = job.rawRows;
  console.log('rawRows sample (first 2):', JSON.stringify(rawRows.slice(0, 2), null, 2));

  const template = await prisma.certificateTemplate.findUnique({ where: { id: job.templateId } });
  console.log('--- TEMPLATE ---');
  console.log('widthIn:', template.widthIn.toString(), 'heightIn:', template.heightIn.toString(), 'dpi:', template.dpi);
  console.log('fields:', JSON.stringify(template.fields, null, 2));

  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
