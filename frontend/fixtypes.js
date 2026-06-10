const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');

// Fix all untyped aqm = {} to aqm: Record<string,number> = {}
let count = 0;
const patterns = [
  ['const aqm = {};\r\n', 'const aqm: Record<string,number> = {};\r\n'],
  ['const aqm = {};\n',   'const aqm: Record<string,number> = {};\n'],
];

for (const [from, to] of patterns) {
  while (c.includes(from)) {
    c = c.replace(from, to);
    count++;
  }
}

console.log('Fixed', count, 'aqm declarations');
fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
