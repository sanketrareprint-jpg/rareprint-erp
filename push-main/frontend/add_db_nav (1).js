const fs = require('fs');
const shellPath = 'components/dashboard-shell.tsx';
let s = fs.readFileSync(shellPath, 'utf8');

// Add Database icon import
s = s.replace(
  'Truck, DollarSign, Users, LogOut, Printer,',
  'Truck, DollarSign, Users, LogOut, Printer, Database,'
);

// Add Database nav item after Users item
const lines = s.split('\n');
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('"/users"') && lines[i].includes('Users')) {
    const indent = lines[i].match(/^(\s*)/)[1];
    lines.splice(i + 1, 0, indent + '{ label: "Database", href: "/admin/database", icon: Database },');
    break;
  }
}

fs.writeFileSync(shellPath, lines.join('\n'), 'utf8');
console.log('Done!');
console.log('Check:', lines.find(l => l.includes('Database')));
