const fs = require('fs');
let c = fs.readFileSync('app/orders/page.tsx', 'utf8');
const lines = c.split('\n');

// Find the customer TD line
lines.forEach((line, i) => {
  if (line.includes('maxWidth') && line.includes('customerName') || 
      (line.includes('wordBreak') && line.includes('break-word'))) {
    console.log(i+1 + ': ' + JSON.stringify(line.trim().substring(0, 100)));
  }
});

// Find and fix any maxWidth on customer cell
let fixed = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('customerName') && lines[i+1] && lines[i+1].includes('wordBreak')) {
    // Find the td opening line (a few lines before)
    for (let j = i-3; j <= i; j++) {
      if (lines[j] && lines[j].includes('maxWidth')) {
        console.log('Found maxWidth at line', j+1, ':', lines[j].trim());
        lines[j] = lines[j].replace(/maxWidth.*?"[^"]*"/, 'maxWidth: "80px"');
        fixed = true;
        break;
      }
    }
  }
}

if (fixed) {
  fs.writeFileSync('app/orders/page.tsx', lines.join('\n'), 'utf8');
  console.log('Fixed customer width');
} else {
  console.log('Not found - searching all maxWidth...');
  lines.forEach((line, i) => {
    if (line.includes('maxWidth')) console.log(i+1 + ': ' + line.trim());
  });
}
