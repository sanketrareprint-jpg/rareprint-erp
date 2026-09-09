const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

console.log('=== Lines 555-570 (table headers) ===');
for (let i = 554; i < 570; i++) {
  if (lines[i]) console.log(`${i+1}: ${lines[i].trim().substring(0, 120)}`);
}

console.log('\n=== Lines 610-640 (stage cell + sheets cell) ===');
for (let i = 609; i < 640; i++) {
  if (lines[i]) console.log(`${i+1}: ${lines[i].trim().substring(0, 120)}`);
}
