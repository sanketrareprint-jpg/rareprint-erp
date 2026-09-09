const fs = require('fs');
let c = fs.readFileSync('app/orders/page.tsx', 'utf8');
console.log('Orders size before:', c.length);

// Add orderAge helper function before the component
const helperMarker = 'export default function OrdersPage()';
const ageHelper = `function orderAge(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return days + ' days';
}

function ageColor(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 3) return 'bg-green-50 text-green-700';
  if (days <= 7) return 'bg-yellow-50 text-yellow-700';
  return 'bg-red-50 text-red-700';
}

`;

if (c.includes(helperMarker) && !c.includes('function orderAge')) {
  c = c.replace(helperMarker, ageHelper + helperMarker);
  console.log('Fix 1: orderAge helper added');
} else console.log('Fix 1: already exists or marker not found');

// Add Age column header after Date header
const old2 = `                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Date</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Order No</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Customer</th>`;
const new2 = `                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Date</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 whitespace-nowrap border-b border-slate-200" style={TH}>Age</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Order No</th>
                      <th className="px-2 py-2 font-semibold text-slate-600 border-b border-slate-200" style={TH}>Customer</th>`;

if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Fix 2: Age header added'); }
else console.log('Fix 2 FAILED');

// Add Age column data cell after Date cell
const old3 = `                          <td className="px-2 py-1.5 text-slate-500 align-top whitespace-nowrap">
                            {new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </td>
                          {/* Short order number */}
                          <td className="px-2 py-1.5 font-bold text-blue-700 align-top whitespace-nowrap">
                            {o.orderNo}
                          </td>
                          <td className="px-2 py-1.5 text-slate-700 align-top" style={{ maxWidth: "100px" }}>
                            <div style={{ wordBreak: "break-word", lineHeight: "1.3" }}>{o.customerName}</div>
                          </td>`;
const new3 = `                          <td className="px-2 py-1.5 text-slate-500 align-top whitespace-nowrap">
                            {new Date(o.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "2-digit" })}
                          </td>
                          <td className="px-2 py-1.5 align-top whitespace-nowrap">
                            <span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(o.date)}\`}>{orderAge(o.date)}</span>
                          </td>
                          {/* Short order number */}
                          <td className="px-2 py-1.5 font-bold text-blue-700 align-top whitespace-nowrap">
                            {o.orderNo}
                          </td>
                          <td className="px-2 py-1.5 text-slate-700 align-top" style={{ maxWidth: "120px" }}>
                            <div style={{ wordBreak: "break-word", lineHeight: "1.3" }}>{o.customerName}</div>
                          </td>`;

if (c.includes(old3)) { c = c.replace(old3, new3); console.log('Fix 3: Age cell added + customer width adjusted'); }
else console.log('Fix 3 FAILED');

fs.writeFileSync('app/orders/page.tsx', c, 'utf8');
console.log('Orders done, size:', fs.statSync('app/orders/page.tsx').size);
