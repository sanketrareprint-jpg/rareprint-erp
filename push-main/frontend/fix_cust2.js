const fs = require('fs');
let c = fs.readFileSync('app/orders/page.tsx', 'utf8');
const lines = c.split('\n');

// Line 473 (index 472) has the customer TD - fix maxWidth
lines[472] = lines[472].replace('maxWidth: "100px"', 'maxWidth: "60px"');
console.log('Line 473 now:', lines[472].trim().substring(0, 80));

fs.writeFileSync('app/orders/page.tsx', lines.join('\n'), 'utf8');
console.log('Done');
