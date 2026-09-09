const fs = require('fs');

// Fix the JS helper functions to have TypeScript string type
const fixes = [
  'app/accounts/page.tsx',
  'app/dispatch/page.tsx',
  'app/orders/page.tsx',
  'app/production/page.tsx',
];

fixes.forEach(file => {
  let c = fs.readFileSync(file, 'utf8');
  // Replace JS-style functions with TypeScript-typed versions
  c = c.replace('function orderAge(dateStr) {', 'function orderAge(dateStr: string): string {');
  c = c.replace('function ageColor(dateStr) {', 'function ageColor(dateStr: string): string {');
  fs.writeFileSync(file, c, 'utf8');
  console.log('Fixed:', file);
});
