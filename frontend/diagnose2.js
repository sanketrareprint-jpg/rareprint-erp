const fs = require('fs');
const filePath = 'app/production/page.tsx';
let c = fs.readFileSync(filePath, 'utf8');

console.log('Size before:', c.length);

// The duplicate block was added starting around line 95 in original
// It looks like this (the SECOND occurrence of clubSubTab etc.):
// Lines 95-120 area has the duplicate

// Count occurrences
console.log('clubSubTab count:', (c.match(/clubSubTab/g)||[]).length);
console.log('sendDialog count:', (c.match(/sendDialog/g)||[]).length);

// Find ALL lines with useState declarations for these duplicated vars
const lines = c.split('\n');
lines.forEach((line, i) => {
  if ((line.includes('clubSubTab') || line.includes('sendDialog') || line.includes('sheetSubTab') || line.includes('multipleDialog') || line.includes('multipleValue')) && line.includes('useState')) {
    console.log(`Line ${i+1}: ${line.trim().substring(0, 80)}`);
  }
});
