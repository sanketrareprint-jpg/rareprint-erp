const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');

// The SheetItem type has: orderItem: { id, product, order: { orderNumber, customer } }
// order.orderDate is available but not in the type definition
// Fix: update SheetItem type to include orderDate and use it in processing orders table

// Fix 1: Update SheetItem type to include orderDate in order
const old1 = `type SheetItem = { id: string; multiple: number; quantityOnSheet: number; areaSqInches: number; orderItem: { id: string; product: { name: string; sizeInches: string; gsm: number; }; order: { orderNumber: string; customer: { businessName: string; } } } };`;
const new1 = `type SheetItem = { id: string; multiple: number; quantityOnSheet: number; areaSqInches: number; orderItem: { id: string; product: { name: string; sizeInches: string; gsm: number; }; order: { orderNumber: string; orderDate?: string; customer: { businessName: string; } } } };`;

if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Fix 1: SheetItem type updated with orderDate'); }
else console.log('Fix 1 FAILED');

// Fix 2: In processing orders table, use si.orderItem.order.orderDate for age
const old2 = `<td className="px-3 py-2 whitespace-nowrap"><span className="rounded-full px-1.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600">—</span></td>`;
const new2 = `<td className="px-3 py-2 whitespace-nowrap">{si.orderItem.order.orderDate ? <span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(si.orderItem.order.orderDate)}\`}>{orderAge(si.orderItem.order.orderDate)}</span> : <span className="text-slate-300">—</span>}</td>`;

if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Fix 2: Processing orders age updated'); }
else console.log('Fix 2 FAILED - searching...');

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
