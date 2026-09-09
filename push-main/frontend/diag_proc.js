const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find sessionStorage references
console.log('=== sessionStorage references ===');
lines.forEach((line, i) => {
  if (line.includes('sessionStorage') || line.includes('procVendors')) {
    console.log(i+1 + ': ' + line.trim().substring(0, 100));
  }
});

// Find READY_FOR_DISPATCH filter
console.log('\n=== READY_FOR_DISPATCH filter ===');
lines.forEach((line, i) => {
  if (line.includes('READY_FOR_DISPATCH') || line.includes('itemProductionStage')) {
    console.log(i+1 + ': ' + line.trim().substring(0, 100));
  }
});
