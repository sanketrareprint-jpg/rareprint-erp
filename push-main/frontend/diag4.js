const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

console.log('=== Lines 908-920 ===');
for (let i = 907; i < 920; i++) {
  console.log(`${i+1}: ${JSON.stringify(lines[i])}`);
}

console.log('\n=== sheetAssignments search ===');
lines.forEach((line, i) => {
  if (line.includes('sheetAssignments') || line.includes('sheetsData.flatMap')) {
    console.log(`${i+1}: ${line.trim().substring(0, 100)}`);
  }
});

console.log('\n=== Stage/Files header search ===');
lines.forEach((line, i) => {
  if (line.includes('"Stage"') || (line.includes('"Files"') && line.includes('th'))) {
    console.log(`${i+1}: ${line.trim().substring(0, 100)}`);
  }
});
