const fs = require('fs');
let s = fs.readFileSync('../components/dashboard-shell.tsx', 'utf8');

// Add Database to imports
s = s.replace(
  'Truck, DollarSign, Users, LogOut, Printer,',
  'Truck, DollarSign, Users, LogOut, Printer, Database,'
);

// Add Database nav item for ADMIN
const lines = s.split('\n');
lines.forEach((line, i) => {
  if (line.includes('href: "/users"') && line.includes('icon: Users')) {
    const indent = line.match(/^(\s*)/)[1];
    const eol = line.endsWith('\r') ? '\r' : '';
    lines.splice(i + 1, 0, indent + '{ label: "Database",   href: "/admin/database", icon: Database },' + eol);
  }
});

fs.writeFileSync('../components/dashboard-shell.tsx', lines.join('\n'), 'utf8');
console.log('Done - Database nav added');
console.log('Verify:', lines.find(l => l.includes('Database')));
