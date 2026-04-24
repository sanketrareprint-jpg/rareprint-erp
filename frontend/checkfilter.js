const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find all lines with INCOMPLETE, SETTING, PRINTING in sheet filters
lines.forEach((line, i) => {
  if ((line.includes('INCOMPLETE') || line.includes('SETTING') || line.includes('PRINTING')) && 
      (line.includes('filter') || line.includes('status'))) {
    console.log(i+1 + ': ' + line.trim().substring(0, 120));
  }
});
