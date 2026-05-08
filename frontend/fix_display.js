const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// FIX 1: Add size + GSM to items on sheet (line 911-913 area)
const old1 = `                                      <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                      <span className="text-slate-500">{si.orderItem.order.orderNumber} \u2014 {si.orderItem.order.customer.businessName}</span>
                                      <span className="text-cyan-700 font-semibold">x{si.multiple} \xb7 Qty {si.quantityOnSheet}</span>`;

const new1 = `                                      <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                      <span className="text-slate-500">{si.orderItem.order.orderNumber} \u2014 {si.orderItem.order.customer.businessName}</span>
                                      <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-medium">{si.orderItem.product.sizeInches}"</span>
                                      <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-medium">{si.orderItem.product.gsm} GSM</span>
                                      <span className="text-cyan-700 font-semibold">x{si.multiple} \xb7 Qty {si.quantityOnSheet}</span>`;

if (c.includes(old1)) {
  c = c.replace(old1, new1);
  console.log('✓ Fix 1: Size + GSM added to sheet items');
} else {
  // Try with \r\n line endings
  const old1cr = old1.replace(/\n/g, '\r\n');
  if (c.includes(old1cr)) {
    c = c.replace(old1cr, new1.replace(/\n/g, '\r\n'));
    console.log('✓ Fix 1 (CRLF): Size + GSM added to sheet items');
  } else {
    console.log('✗ Fix 1 failed - trying line by line approach');
    // Find line 911 and replace just that section
    const marker = `{si.orderItem.product.name}</span>`;
    const idx = c.indexOf(marker);
    if (idx !== -1) {
      // Find the end of this row (the Trash2 button)
      const rowEnd = c.indexOf('</span>\n', idx + marker.length + 200);
      const rowEndCR = c.indexOf('</span>\r\n', idx + marker.length + 200);
      const actualEnd = rowEnd !== -1 ? rowEnd + 7 : rowEndCR + 8;
      const segment = c.slice(idx - 50, actualEnd + 200);
      console.log('Segment around issue:', JSON.stringify(segment.substring(0, 300)));
    }
  }
}

// FIX 2: Add sheet assignments column to the inhouse/all tab table
// Find the Stage select dropdown cell and add a Sheets cell after it
const stageSelectMarker = `{PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </div>
                          </td>`;

const stageSelectMarkerCR = `{PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>\r\n                            </div>\r\n                          </td>`;

const sheetInfoCell = `
                          <td className="px-3 py-1.5 max-w-[140px]">
                            {(() => {
                              const sa = sheetsData.flatMap(s => s.items.filter(si => si.orderItem.id === item.id).map(si => ({ no: s.sheetNo, qty: si.quantityOnSheet })));
                              if (!sa.length) return <span className="text-slate-300 text-xs">—</span>;
                              return <div className="flex flex-wrap gap-0.5">{sa.map((a, i) => (
                                <span key={i} className="inline-flex rounded-full bg-cyan-50 border border-cyan-200 px-1.5 py-0.5 text-xs font-semibold text-cyan-700 whitespace-nowrap">{a.no} · {a.qty}</span>
                              ))}</div>;
                            })()}
                          </td>`;

const afterStageCell = `
                          <td className="px-3 py-1.5">
                            <button onClick={() => setExpandedFileItemId(isExpanded ? null : item.id)}`;

if (c.includes(stageSelectMarker + afterStageCell)) {
  c = c.replace(stageSelectMarker + afterStageCell, stageSelectMarker + sheetInfoCell + afterStageCell);
  console.log('✓ Fix 2: Sheet assignments cell added to order rows');
} else if (c.includes(stageSelectMarkerCR + afterStageCell.replace(/\n/g, '\r\n'))) {
  c = c.replace(stageSelectMarkerCR + afterStageCell.replace(/\n/g, '\r\n'), stageSelectMarkerCR + sheetInfoCell.replace(/\n/g, '\r\n') + afterStageCell.replace(/\n/g, '\r\n'));
  console.log('✓ Fix 2 (CRLF): Sheet assignments cell added');
} else {
  // Find PRODUCTION_STAGES.map and work from there
  const idx = c.indexOf('PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}');
  if (idx !== -1) {
    console.log('Found PRODUCTION_STAGES at index:', idx);
    // Show context after it
    console.log('Context after:', JSON.stringify(c.slice(idx + 80, idx + 250)));
  } else {
    console.log('✗ Fix 2: PRODUCTION_STAGES.map not found');
  }
}

// FIX 3: Add Sheets column header to the table
const oldHeader = `                    <th className="px-3 py-2 font-semibold text-slate-600">Stage</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Files</th>`;
const newHeader = `                    <th className="px-3 py-2 font-semibold text-slate-600">Stage</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Sheets</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Files</th>`;

if (!c.includes('"Sheets"') && c.includes(oldHeader)) {
  c = c.replace(oldHeader, newHeader);
  console.log('✓ Fix 3: Sheets header added to table');
} else if (!c.includes('"Sheets"') && c.includes(oldHeader.replace(/\n/g, '\r\n'))) {
  c = c.replace(oldHeader.replace(/\n/g, '\r\n'), newHeader.replace(/\n/g, '\r\n'));
  console.log('✓ Fix 3 (CRLF): Sheets header added');
} else if (c.includes('"Sheets"')) {
  console.log('~ Fix 3: Sheets header already exists');
} else {
  console.log('✗ Fix 3: Stage/Files header not found');
  const idx = c.indexOf('"Stage"');
  if (idx !== -1) console.log('Stage context:', JSON.stringify(c.slice(idx-10, idx+80)));
}

// Update colSpan
if (c.includes('colSpan={11}')) {
  c = c.replace(/colSpan=\{11\}/g, 'colSpan={12}');
  console.log('✓ colSpan updated to 12');
}

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
