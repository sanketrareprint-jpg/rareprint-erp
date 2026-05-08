const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// The errors say line 95 AND line 108 both have clubSubTab
// This means there's a second block. Let's find ALL useState lines between 100-200
for (let i = 100; i < 200; i++) {
  if (lines[i] && lines[i].includes('useState')) {
    console.log(`${i+1}: ${lines[i].trim().substring(0, 100)}`);
  }
}
