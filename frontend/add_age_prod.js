const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Production size before:', c.length);

// Add orderAge helper before export default
const helperMarker = 'export default function ProductionPage()';
const ageHelper = `function orderAge(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1d';
  return days + 'd';
}
function ageColor(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 3) return 'bg-green-50 text-green-700';
  if (days <= 7) return 'bg-yellow-50 text-yellow-700';
  return 'bg-red-50 text-red-700';
}

`;

if (!c.includes('function orderAge') && c.includes(helperMarker)) {
  c = c.replace(helperMarker, ageHelper + helperMarker);
  console.log('Fix 1: orderAge helper added');
}

// Add Age header after Order header in inhouse/all table
const old2 = `                    <th className="px-3 py-2 font-semibold text-slate-600">Order</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Customer</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Agent</th>`;
const new2 = `                    <th className="px-3 py-2 font-semibold text-slate-600">Order</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Age</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Customer</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Agent</th>`;
if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Fix 2: Age header added'); }
else console.log('Fix 2 FAILED');

// Add Age cell in the data row - after the Order cell (which shows orderNo + date)
const old3 = `                          <td className="px-3 py-1.5 whitespace-nowrap">{item.isFirstInOrder && <div><p className="font-bold text-blue-700">{item.orderNo}</p><p className="text-slate-400">{new Date(item.orderDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</p></div>}</td>
                          <td className="px-3 py-1.5">{item.isFirstInOrder && <div><p className="font-medium text-slate-800 whitespace-nowrap">{item.customerName}</p>{item.customerPhone && <p className="text-slate-400">{item.customerPhone}</p>}</div>}</td>`;
const new3 = `                          <td className="px-3 py-1.5 whitespace-nowrap">{item.isFirstInOrder && <div><p className="font-bold text-blue-700">{item.orderNo}</p><p className="text-slate-400">{new Date(item.orderDate).toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}</p></div>}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{item.isFirstInOrder && <span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(item.orderDate)}\`}>{orderAge(item.orderDate)}</span>}</td>
                          <td className="px-3 py-1.5">{item.isFirstInOrder && <div><p className="font-medium text-slate-800 whitespace-nowrap">{item.customerName}</p>{item.customerPhone && <p className="text-slate-400">{item.customerPhone}</p>}</div>}</td>`;
if (c.includes(old3)) { c = c.replace(old3, new3); console.log('Fix 3: Age cell added to production table'); }
else console.log('Fix 3 FAILED');

// Update colSpan for file expand row (was 12, now 13)
c = c.replace(/colSpan=\{12\}/g, 'colSpan={13}');
console.log('Fix 4: colSpan updated');

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Production done, size:', fs.statSync('app/production/page.tsx').size);
