const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');

console.log('Size before:', c.length);

// ─────────────────────────────────────────────────────────────────
// CORRECTION 1: Add Size column + Assign Sheet dropdown to Unassigned tab
// ─────────────────────────────────────────────────────────────────

// Replace the unassigned sub-tab table section
const oldUnassignedTable = `              {sheetSubTab === "unassigned" && (() => {
                const aqm: Record<string,number> = {};
                sheetsData.forEach(s => s.items.forEach(si => { aqm[si.orderItem.id] = (aqm[si.orderItem.id] || 0) + (si.quantityOnSheet || si.multiple * s.quantity); }));
                const items = ordersData.flatMap(o => o.items.filter(i => i.productionCategory === "SHEET_PRODUCTION" && (i.quantity - (aqm[i.id] || 0)) > 0).map(i => ({ ...i, orderNo: o.orderNo, customerName: o.customerName })));
                if (items.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">All sheet items are fully assigned.</div>;
                return (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th><th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th><th className="px-3 py-2 text-left font-semibold text-slate-600">GSM</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order Qty</th><th className="px-3 py-2 text-left font-semibold text-slate-600">Assigned</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Balance</th>
                      </tr></thead>
                      <tbody>{items.map(item => { const notes = parseNotes(item.productionNotes); const assigned = aqm[item.id] || 0; return (
                        <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="px-3 py-2 font-bold text-blue-700">{item.orderNo}</td><td className="px-3 py-2 text-slate-700">{item.customerName}</td>
                          <td className="px-3 py-2 font-semibold text-slate-800">{item.productName}</td><td className="px-3 py-2 text-slate-500">{notes.gsm || "\u2014"}</td>
                          <td className="px-3 py-2 font-semibold">{item.quantity}</td><td className="px-3 py-2 text-orange-600 font-semibold">{assigned}</td>
                          <td className="px-3 py-2 text-cyan-700 font-bold">{item.quantity - assigned}</td>
                        </tr>); })}</tbody>
                    </table>
                  </div>
                );
              })()}`;

const newUnassignedTable = `              {sheetSubTab === "unassigned" && (() => {
                const aqm: Record<string,number> = {};
                sheetsData.forEach(s => s.items.forEach(si => { aqm[si.orderItem.id] = (aqm[si.orderItem.id] || 0) + (si.quantityOnSheet || si.multiple * s.quantity); }));
                const items = ordersData.flatMap(o => o.items.filter(i => i.productionCategory === "SHEET_PRODUCTION" && (i.quantity - (aqm[i.id] || 0)) > 0).map(i => ({ ...i, orderNo: o.orderNo, customerName: o.customerName })));
                if (items.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">All sheet items are fully assigned.</div>;
                return (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Size</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">GSM</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order Qty</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Assigned</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Balance</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Assign Sheet</th>
                      </tr></thead>
                      <tbody>{items.map(item => {
                        const notes = parseNotes(item.productionNotes);
                        const assigned = aqm[item.id] || 0;
                        const balance = item.quantity - assigned;
                        // Find compatible sheets (same GSM, has space)
                        const itemGsm = notes.gsm ? parseInt(notes.gsm) : 0;
                        const compatibleSheets = sheetsData.filter(s =>
                          (s.status === "INCOMPLETE" || s.status === "SETTING") && s.gsm === itemGsm
                        );
                        return (
                          <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                            <td className="px-3 py-2 font-bold text-blue-700">{item.orderNo}</td>
                            <td className="px-3 py-2 text-slate-700">{item.customerName}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">{item.productName}</td>
                            <td className="px-3 py-2 text-slate-500">{notes.size || "\u2014"}</td>
                            <td className="px-3 py-2 text-slate-500">{notes.gsm || "\u2014"}</td>
                            <td className="px-3 py-2 font-semibold">{item.quantity}</td>
                            <td className="px-3 py-2 text-orange-600 font-semibold">{assigned}</td>
                            <td className="px-3 py-2 text-cyan-700 font-bold">{balance}</td>
                            <td className="px-3 py-2">
                              {compatibleSheets.length === 0 ? (
                                <span className="text-slate-400 text-xs">No sheets</span>
                              ) : (
                                <div className="flex items-center gap-1">
                                  <select id={\`sel-\${item.id}\`} defaultValue="" className="rounded-md border border-slate-200 px-1.5 py-1 text-xs outline-none bg-white">
                                    <option value="">Select sheet...</option>
                                    {compatibleSheets.map(s => {
                                      const used = Math.round((s.usedAreaSqInches / s.areaSqInches) * 100);
                                      return <option key={s.id} value={s.id}>{s.sheetNo} ({used}% used)</option>;
                                    })}
                                  </select>
                                  <button onClick={() => {
                                    const sel = document.getElementById(\`sel-\${item.id}\`) as HTMLSelectElement;
                                    if (!sel?.value) { alert("Select a sheet first"); return; }
                                    const pi: PlaceableItem = { id: item.id, productName: item.productName, sku: item.sku || "", gsm: itemGsm, openSizeInches: notes.size || "0x0", quantity: item.quantity, orderNo: item.orderNo, customerName: item.customerName };
                                    openMultipleDialog(sel.value, pi);
                                  }} className="inline-flex items-center gap-0.5 rounded-lg bg-cyan-600 px-2 py-1 text-xs font-semibold text-white hover:bg-cyan-700">
                                    <Plus className="h-3 w-3" /> Assign
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                );
              })()}`;

if (c.includes(oldUnassignedTable)) {
  c = c.replace(oldUnassignedTable, newUnassignedTable);
  console.log('✓ Correction 1: Unassigned table updated with Size + Assign Sheet');
} else {
  console.log('✗ Correction 1: Could not find unassigned table - checking partial match...');
  if (c.includes('sheetSubTab === "unassigned"')) console.log('  Found sheetSubTab unassigned block');
}

// ─────────────────────────────────────────────────────────────────
// CORRECTION 2: Show Size + GSM in items on sheet list, remove Stage Vendor section
// ─────────────────────────────────────────────────────────────────

const oldSheetItem = `                                      <div key={si.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                        <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                        <span className="text-slate-500">{si.orderItem.order.orderNumber} \u2014 {si.orderItem.order.customer.businessName}</span>
                                        <span className="text-cyan-700 font-semibold">x{si.multiple} \xb7 Qty {si.quantityOnSheet}</span>
                                        <button onClick={() => removeSheetItem(si.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </div>`;

const newSheetItem = `                                      <div key={si.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                        <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                        <span className="text-slate-500">{si.orderItem.order.orderNumber} \u2014 {si.orderItem.order.customer.businessName}</span>
                                        <span className="text-slate-400">{si.orderItem.product.sizeInches}"</span>
                                        <span className="text-slate-400">{si.orderItem.product.gsm} GSM</span>
                                        <span className="text-cyan-700 font-semibold">x{si.multiple} \xb7 Qty {si.quantityOnSheet}</span>
                                        <button onClick={() => removeSheetItem(si.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </div>`;

if (c.includes(oldSheetItem)) {
  c = c.replace(oldSheetItem, newSheetItem);
  console.log('✓ Correction 2a: Size + GSM added to sheet items');
} else {
  console.log('✗ Correction 2a: Sheet item not found exactly');
}

// Remove Stage Vendors section from Created/Processing sheets
// Find and remove the entire Stage Vendors div
const oldStageVendors = `                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-2">Stage Vendors</p>
                                {sheet.stageVendors.length > 0 && (<div className="space-y-1.5 mb-3">{sheet.stageVendors.map(sv => (
                                  <div key={sv.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                                    <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-semibold">{sv.stage.replace(/_/g," ")}</span>
                                    <span className="font-semibold text-slate-800">{sv.vendor.name}</span>
                                    <span className="font-bold text-cyan-700">{fmt(sv.cost)}</span>
                                    <button onClick={() => deleteStageVendor(sv.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                  </div>))}</div>)}
                                <div className="rounded-lg border border-dashed border-cyan-200 bg-cyan-50/50 p-3">
                                  <p className="text-xs font-semibold text-cyan-700 mb-2">+ Assign Stage Vendor</p>
                                  <div className="grid grid-cols-3 gap-2 mb-2">
                                    <div><label className="block text-xs text-slate-500 mb-1">Stage *</label>
                                      <select value={svf.stage} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, stage: e.target.value } }))} style={IS.input}>
                                        <option value="">Select...</option>{SHEET_STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select></div>
                                    <div><label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                                      <select value={svf.vendorId} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, vendorId: e.target.value } }))} style={IS.input}>
                                        <option value="">Select...</option>{vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
                                    <div><label className="block text-xs text-slate-500 mb-1">Cost *</label>
                                      <input type="number" value={svf.cost} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, cost: e.target.value } }))} placeholder="0.00" style={IS.input} /></div>
                                    <div><label className="block text-xs text-slate-500 mb-1">Description</label>
                                      <input value={svf.description} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, description: e.target.value } }))} placeholder="Optional" style={IS.input} /></div>
                                    <div><label className="block text-xs text-slate-500 mb-1">Invoice No</label>
                                      <input value={svf.vendorInvoiceNo} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, vendorInvoiceNo: e.target.value } }))} placeholder="Optional" style={IS.input} /></div>
                                  </div>
                                  <button onClick={() => addStageVendor(sheet.id)} disabled={savingStageVendor} className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
                                    {savingStageVendor ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                                  </button>
                                </div>
                              </div>`;

if (c.includes(oldStageVendors)) {
  c = c.replace(oldStageVendors, '');
  console.log('✓ Correction 2b: Stage Vendors section removed from sheets');
} else {
  console.log('✗ Correction 2b: Stage Vendors section not found exactly');
}

// ─────────────────────────────────────────────────────────────────
// CORRECTION 3: Show sheet assignments in the All/Inhouse tab order item rows
// We need to add a sheet info column to the flatItems table
// Find the table header in the inhouse/all tab and add a "Sheets" column
// ─────────────────────────────────────────────────────────────────

// Add Sheets column header after Stage column
const oldTableHeader = `                    <th className="px-3 py-2 font-semibold text-slate-600">Stage</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Files</th>`;

const newTableHeader = `                    <th className="px-3 py-2 font-semibold text-slate-600">Stage</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Sheets</th>
                    <th className="px-3 py-2 font-semibold text-slate-600">Files</th>`;

if (c.includes(oldTableHeader)) {
  c = c.replace(oldTableHeader, newTableHeader);
  console.log('✓ Correction 3a: Sheets column header added');
} else {
  console.log('✗ Correction 3a: Table header not found');
}

// Add Sheets column data cell — insert after the Stage select td
const oldStageCell = `                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              {isUpdating && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                              <select value={item.itemProductionStage} disabled={isUpdating} onChange={e => updateItemStage(item.id, e.target.value as ProductionStage)}
                                className={\`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none disabled:opacity-60 cursor-pointer border-transparent \${stageColors[item.itemProductionStage]}\`}>
                                {PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            <button onClick={() => setExpandedFileItemId(isExpanded ? null : item.id)}`;

const newStageCell = `                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1">
                              {isUpdating && <Loader2 className="h-3 w-3 animate-spin text-blue-600" />}
                              <select value={item.itemProductionStage} disabled={isUpdating} onChange={e => updateItemStage(item.id, e.target.value as ProductionStage)}
                                className={\`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none disabled:opacity-60 cursor-pointer border-transparent \${stageColors[item.itemProductionStage]}\`}>
                                {PRODUCTION_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                              </select>
                            </div>
                          </td>
                          <td className="px-3 py-1.5">
                            {(() => {
                              const sheetAssignments = sheetsData.flatMap(s => s.items.filter(si => si.orderItem.id === item.id).map(si => ({ sheetNo: s.sheetNo, qty: si.quantityOnSheet })));
                              if (sheetAssignments.length === 0) return <span className="text-slate-300 text-xs">—</span>;
                              return <div className="space-y-0.5">{sheetAssignments.map((a, i) => (
                                <div key={i} className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 px-1.5 py-0.5 text-xs font-semibold text-cyan-700 mr-1">
                                  {a.sheetNo} · {a.qty}
                                </div>
                              ))}</div>;
                            })()}
                          </td>
                          <td className="px-3 py-1.5">
                            <button onClick={() => setExpandedFileItemId(isExpanded ? null : item.id)}`;

if (c.includes(oldStageCell)) {
  c = c.replace(oldStageCell, newStageCell);
  console.log('✓ Correction 3b: Sheet assignments cell added to order rows');
} else {
  console.log('✗ Correction 3b: Stage cell not found exactly');
  // Try to find it partially
  if (c.includes('PRODUCTION_STAGES.map(s => <option key={s.value}')) console.log('  Found PRODUCTION_STAGES map');
}

// Also update colSpan in the file expand row (was 11, now 12)
c = c.replace('colSpan={11}', 'colSpan={12}');

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('\nFinal size:', fs.statSync('app/production/page.tsx').size);
