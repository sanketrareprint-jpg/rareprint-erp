const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find every line that has both useState and one of the duplicate vars
// Also check if there's a second function body somewhere
let foundProductionPage = 0;
lines.forEach((line, i) => {
  if (line.includes('function ProductionPage') || line.includes('export default function')) {
    foundProductionPage++;
    console.log(`ProductionPage declaration #${foundProductionPage} at line ${i+1}: ${line.trim()}`);
  }
});

// Also find any line 200-300 that has clubSubTab useState
console.log('\nclubSubTab useState occurrences:');
lines.forEach((line, i) => {
  if (line.includes('clubSubTab') && line.includes('useState')) {
    console.log(`Line ${i+1}: ${line.trim().substring(0, 90)}`);
  }
});

// Check total lines
console.log('\nTotal lines:', lines.length);
