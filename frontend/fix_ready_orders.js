const fs = require('fs');
let c = fs.readFileSync('app/orders/page.tsx', 'utf8');
const lines = c.split('\n');

// Find readyOrders line
lines.forEach((line, i) => {
  if (line.includes('readyOrders') && line.includes('filter')) {
    console.log(i+1, ':', line.trim().substring(0, 120));
  }
});

// Fix: replace any remaining orders.filter with agentOrders.filter for readyOrders
let changed = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('readyOrders') && lines[i].includes('orders.filter')) {
    lines[i] = lines[i].replace('orders.filter', 'agentOrders.filter');
    changed++;
    console.log('Fixed readyOrders at line', i+1);
  }
}

// Also check if readyOrders is defined elsewhere using plain orders
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('readyOrders') && (lines[i].includes('= orders') || lines[i].includes('orders.filter'))) {
    console.log('Found at line', i+1, ':', lines[i].trim().substring(0, 100));
  }
}

fs.writeFileSync('app/orders/page.tsx', lines.join('\n'), 'utf8');
console.log('Changed:', changed);
