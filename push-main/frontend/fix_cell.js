const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// Use exact context from diagnostic output
const oldCell = `on>)}\r\n                              </select>\r\n                            </div>\r\n                          </td>\r\n                          <td className="px-3 py-1.5"`;

const newCell = `on>)}\r\n                              </select>\r\n                            </div>\r\n                          </td>\r\n                          <td className="px-3 py-1.5 max-w-[160px]">\r\n                            {(() => {\r\n                              const sa = sheetsData.flatMap(s => s.items.filter(si => si.orderItem.id === item.id).map(si => ({ no: s.sheetNo, qty: si.quantityOnSheet })));\r\n                              if (!sa.length) return <span className="text-slate-300 text-xs">\u2014</span>;\r\n                              return <div className="flex flex-wrap gap-0.5">{sa.map((a, i) => (\r\n                                <span key={i} className="inline-flex rounded-full bg-cyan-50 border border-cyan-200 px-1.5 py-0.5 text-xs font-semibold text-cyan-700 whitespace-nowrap">{a.no} \xb7 {a.qty}</span>\r\n                              ))}</div>;\r\n                            })()} \r\n                          </td>\r\n                          <td className="px-3 py-1.5"`;

if (c.includes(oldCell)) {
  // Check it only appears once (for the stage select, not other selects)
  const count = (c.match(/on>\)\}\r\n\s+<\/select>\r\n\s+<\/div>\r\n\s+<\/td>\r\n\s+<td className="px-3 py-1\.5"/g) || []).length;
  console.log('Pattern matches:', count);
  c = c.replace(oldCell, newCell);
  console.log('✓ Sheet assignments cell added');
} else {
  console.log('✗ Exact pattern not found');
  // Show what we have
  const idx = c.indexOf('PRODUCTION_STAGES.map(s => <option key={s.value}');
  if (idx !== -1) {
    console.log('Context around PRODUCTION_STAGES:', JSON.stringify(c.slice(idx + 60, idx + 260)));
  }
}

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
