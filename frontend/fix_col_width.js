const fs = require('fs');
let c = fs.readFileSync('app/orders/page.tsx', 'utf8');

// Reduce customer column max width
const old1 = 'style={{ maxWidth: "120px" }}>';
const new1 = 'style={{ maxWidth: "80px" }}>';
if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Fix 1: customer width reduced'); }
else console.log('Fix 1 FAILED');

// Also make Order No column not take extra space
const old2 = '<td className="px-2 py-1.5 font-bold text-blue-700 align-top whitespace-nowrap">\r\n                            {o.orderNo}\r\n                          </td>';
const new2 = '<td className="px-2 py-1.5 font-bold text-blue-700 align-top whitespace-nowrap" style={{ maxWidth: "70px" }}>\r\n                            {o.orderNo}\r\n                          </td>';
if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Fix 2: order no width set'); }
else {
  // Try LF version
  const old2lf = '<td className="px-2 py-1.5 font-bold text-blue-700 align-top whitespace-nowrap">\n                            {o.orderNo}\n                          </td>';
  if (c.includes(old2lf)) { c = c.replace(old2lf, new2.replace(/\r\n/g, '\n')); console.log('Fix 2 (LF): order no width set'); }
  else console.log('Fix 2 FAILED');
}

fs.writeFileSync('app/orders/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/orders/page.tsx').size);
