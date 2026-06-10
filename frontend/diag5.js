const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find the inhouse/all table - look for PRODUCTION_STAGES.map near the table
lines.forEach((line, i) => {
  if (line.includes('PRODUCTION_STAGES.map') || line.includes('sheetAssignments') || line.includes('sa.length') || (line.includes('px-3 py-1.5') && lines[i-1] && lines[i-1].includes('</td>'))) {
    console.log(`${i+1}: ${JSON.stringify(line.trim().substring(0, 100))}`);
  }
});

// Also show lines around the Sheets th header we added
lines.forEach((line, i) => {
  if (line.includes('"Sheets"') && line.includes('th')) {
    console.log(`\nSheets header at line ${i+1}`);
    // Show 5 lines before and after
    for (let j = i-2; j <= i+15; j++) {
      if (lines[j]) console.log(`  ${j+1}: ${lines[j].trim().substring(0, 100)}`);
    }
  }
});
