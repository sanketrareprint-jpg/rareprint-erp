const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');
// Show lines 90-135
for (let i = 89; i < 135; i++) {
  console.log(`${i+1}: ${lines[i]}`);
}
