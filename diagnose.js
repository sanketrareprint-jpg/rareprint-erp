const fs = require('fs');
const c = fs.readFileSync('frontend/app/production/page.tsx', 'utf8');

const sheetsStart = c.indexOf('SHEETS TAB');
console.log('SHEETS TAB at index:', sheetsStart);
console.log('Text around it:');
console.log(JSON.stringify(c.slice(sheetsStart - 10, sheetsStart + 50)));

const dashEnd = c.indexOf('</DashboardShell>');
console.log('\nDashboardShell end at index:', dashEnd);
console.log('Text before it (100 chars):');
console.log(JSON.stringify(c.slice(dashEnd - 150, dashEnd + 20)));

console.log('\nAssign Modal search:');
const assignIdx = c.indexOf('Assign Modal');
console.log('Assign Modal at index:', assignIdx);
console.log(JSON.stringify(c.slice(assignIdx - 10, assignIdx + 30)));
