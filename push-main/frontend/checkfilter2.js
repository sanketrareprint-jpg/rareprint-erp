const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Show lines 885-895
for (let i = 884; i < 895; i++) {
  console.log((i+1) + ': ' + lines[i]);
}

// Also check if SETTING appears in any exclusion
lines.forEach((line, i) => {
  if (line.includes('SETTING') && (line.includes('!') || line.includes('!=='))) {
    console.log('\nExclusion at ' + (i+1) + ': ' + line.trim());
  }
});
