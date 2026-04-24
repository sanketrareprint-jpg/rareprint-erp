const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find sheetSubTab === "created" section
lines.forEach((line, i) => {
  if (line.includes('sheetSubTab === "created"') && line.includes('&&')) {
    console.log('Created section at line:', i+1);
    // Show lines i to i+5
    for (let j = i; j <= i+3; j++) console.log((j+1) + ': ' + JSON.stringify(lines[j]));
  }
});

// Find where created section ends - look for })() pattern
console.log('\nLooking for })() closing near sheets tab...');
lines.forEach((line, i) => {
  if (line.trim() === '})()}' && i > 750 && i < 1050) {
    console.log('})() at line', i+1);
    console.log('Next lines:');
    for (let j = i+1; j <= i+5; j++) console.log((j+1) + ': ' + JSON.stringify(lines[j]));
  }
});

// Also find Multiple Dialog marker
lines.forEach((line, i) => {
  if (line.includes('Multiple Dialog')) console.log('Multiple Dialog at line:', i+1, JSON.stringify(line.trim()));
});
