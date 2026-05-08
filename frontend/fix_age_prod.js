const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

console.log('Total lines:', lines.length);
console.log('\nAll Age TH lines:');
const ageTHLines = [];
lines.forEach((line, i) => {
  if (line.includes('>Age</th>')) { ageTHLines.push(i); console.log(i+1, ':', line.trim()); }
});

console.log('\nAll ageColor/orderAge call lines:');
const ageTDLines = [];
lines.forEach((line, i) => {
  if (line.includes('orderAge(') || line.includes('ageColor(')) { ageTDLines.push(i); console.log(i+1, ':', line.trim().substring(0, 100)); }
});

// STEP 1: Remove duplicate Age TH - keep only first occurrence per table
// Find groups of consecutive Age THs and remove duplicates
const toRemoveTH = new Set();
for (let idx = 0; idx < ageTHLines.length - 1; idx++) {
  const curr = ageTHLines[idx];
  const next = ageTHLines[idx + 1];
  // If two Age THs are close together (within 5 lines), they're in same table - remove second
  if (next - curr < 5) { toRemoveTH.add(next); console.log('Will remove duplicate TH at line', next+1); }
}

// STEP 2: Find duplicate Age TDs (same issue - added twice)
const toRemoveTD = new Set();
// Look for consecutive age TD lines
for (let idx = 0; idx < ageTDLines.length - 1; idx++) {
  const curr = ageTDLines[idx];
  const next = ageTDLines[idx + 1];
  if (next - curr < 3) { toRemoveTD.add(next); console.log('Will remove duplicate TD at line', next+1); }
}

// STEP 3: Fix NaN - replace empty string fallbacks with proper date handling
// Lines with orderAge(item.orderDate || '') - the || '' causes NaN
// Fix: add null check

// Remove duplicates (process in reverse order to preserve indices)
const allToRemove = [...toRemoveTH, ...toRemoveTD].sort((a, b) => b - a);
for (const idx of allToRemove) {
  lines.splice(idx, 1);
  console.log('Removed line', idx+1);
}

let content = lines.join('\n');

// Fix NaN: replace orderAge(item.orderDate || '') with safe version
content = content.replace(/orderAge\(item\.orderDate \|\| ''\)/g, "orderAge(item.orderDate ?? new Date().toISOString())");
content = content.replace(/ageColor\(item\.orderDate \|\| ''\)/g, "ageColor(item.orderDate ?? new Date().toISOString())");

// Fix clubbing orderDate - may not exist on ClubbingItem type
// The clubbing items are mapped with orderDate from o.orderDate - check if it's there
// Replace the problematic call
content = content.replace(
  /\$\{ageColor\(item\.orderDate \?\? new Date\(\)\.toISOString\(\)\)\}/g,
  '${item.orderDate ? ageColor(item.orderDate) : "bg-slate-100 text-slate-500"}'
);
content = content.replace(
  /\{orderAge\(item\.orderDate \?\? new Date\(\)\.toISOString\(\)\)\}/g,
  '{item.orderDate ? orderAge(item.orderDate) : "—"}'
);

fs.writeFileSync('app/production/page.tsx', content, 'utf8');
console.log('\nDone, size:', require('fs').statSync('app/production/page.tsx').size);
