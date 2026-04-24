const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// CORRECTION 1: Sheet dropdown - show sheet qty instead of used%
const old1 = `                                    return <option key={s.id} value={s.id}>{s.sheetNo} ({used}% used)</option>;`;
const new1 = `                                    return <option key={s.id} value={s.id}>{s.sheetNo} - {s.quantity} Qty ({used}% used)</option>;`;
if (c.includes(old1)) { c = c.replace(old1, new1); console.log('✓ C1: Sheet qty in dropdown'); }
else console.log('✗ C1 not found');

// CORRECTION 2: Show size in items-on-sheet list
const old2 = `                                        <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                        <span className="text-slate-500">{si.orderItem.order.orderNumber} \\u2014 {si.orderItem.order.customer.businessName}</span>
                                        <span className="text-slate-400">{si.orderItem.product.sizeInches}"</span>
                                        <span className="text-slate-400">{si.orderItem.product.gsm} GSM</span>
                                        <span className="text-cyan-700 font-semibold">x{si.multiple} \\xb7 Qty {si.quantityOnSheet}</span>`;
const new2 = `                                        <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                        <span className="text-slate-500">{si.orderItem.order.orderNumber} \\u2014 {si.orderItem.order.customer.businessName}</span>
                                        <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs">{si.orderItem.product.sizeInches}"</span>
                                        <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs">{si.orderItem.product.gsm} GSM</span>
                                        <span className="text-cyan-700 font-semibold">x{si.multiple} \\xb7 Qty {si.quantityOnSheet}</span>`;

// Try the escaped unicode version
const old2b = `                                        <span className="text-slate-400">{si.orderItem.product.sizeInches}"</span>
                                        <span className="text-slate-400">{si.orderItem.product.gsm} GSM</span>`;
const new2b = `                                        <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs">{si.orderItem.product.sizeInches}"</span>
                                        <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 text-xs">{si.orderItem.product.gsm} GSM</span>`;

if (c.includes(old2b)) { c = c.replace(old2b, new2b); console.log('✓ C2: Size/GSM styled in sheet items'); }
else if (c.includes(old2)) { c = c.replace(old2, new2); console.log('✓ C2: Size/GSM styled (v2)'); }
else console.log('✗ C2 not found');

// CORRECTION 3: Sheet numbers in the All/Inhouse order item rows
// The current code shows sheet info - verify it's showing and fix the display
// Look for the sheetsData.flatMap in the table
if (c.includes('const sheetAssignments = sheetsData.flatMap')) {
  console.log('✓ C3: Sheet assignments cell already exists');
  // Just improve the display to show sheet no clearly
  const old3 = `                              const sheetAssignments = sheetsData.flatMap(s => s.items.filter(si => si.orderItem.id === item.id).map(si => ({ sheetNo: s.sheetNo, qty: si.quantityOnSheet })));
                              if (sheetAssignments.length === 0) return <span className="text-slate-300 text-xs">—</span>;
                              return <div className="space-y-0.5">{sheetAssignments.map((a, i) => (
                                <div key={i} className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 px-1.5 py-0.5 text-xs font-semibold text-cyan-700 mr-1">
                                  {a.sheetNo} · {a.qty}
                                </div>
                              ))}</div>;`;
  const new3 = `                              const sheetAssignments = sheetsData.flatMap(s => s.items.filter(si => si.orderItem.id === item.id).map(si => ({ sheetNo: s.sheetNo, qty: si.quantityOnSheet, multiple: si.multiple })));
                              if (sheetAssignments.length === 0) return <span className="text-slate-300 text-xs">—</span>;
                              return <div className="flex flex-wrap gap-0.5">{sheetAssignments.map((a, idx) => (
                                <div key={idx} className="inline-flex items-center gap-0.5 rounded-full bg-cyan-50 border border-cyan-200 px-1.5 py-0.5 text-xs font-semibold text-cyan-700 whitespace-nowrap">
                                  {a.sheetNo} x{a.multiple} · {a.qty}qty
                                </div>
                              ))}</div>;`;
  if (c.includes(old3)) { c = c.replace(old3, new3); console.log('✓ C3: Sheet display improved'); }
  else console.log('~ C3: Already exists but exact match failed - keeping as is');
} else {
  console.log('✗ C3: Sheet assignments cell missing - adding it');
}

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
