const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find the actual table thead
lines.forEach((line, i) => {
  if (line.includes('<th') && (line.includes('Stage') || line.includes('Files') || line.includes('Upload'))) {
    console.log(`${i+1}: ${line.trim().substring(0, 120)}`);
  }
});
