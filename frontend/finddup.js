const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find ALL lines containing clubSubTab
lines.forEach((line, i) => {
  if (line.includes('clubSubTab') || line.includes('sendDialog') || line.includes('sendVendorId') || line.includes('receiveDialog') || line.includes('receiveCost')) {
    console.log(`${i+1}: ${line.trim().substring(0, 90)}`);
  }
});
