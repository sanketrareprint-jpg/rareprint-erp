const fs = require('fs');
let c = fs.readFileSync('frontend/app/production/page.tsx', 'utf8');

// Find sheets tab start and end exactly
const sheetsStart = c.indexOf('          {/* \u2500\u2500 SHEETS TAB \u2500\u2500 */}');
const sheetsEnd = c.indexOf('\n        </div>\n      </DashboardShell>');

if (sheetsStart === -1) {
  console.log('ERROR: Cannot find SHEETS TAB comment');
  console.log('Searching for nearby text...');
  const idx = c.indexOf('SHEETS TAB');
  console.log('SHEETS TAB found at index:', idx);
  process.exit(1);
}
if (sheetsEnd === -1) {
  console.log('ERROR: Cannot find DashboardShell end');
  process.exit(1);
}

console.log('Found sheets tab at:', sheetsStart, 'to:', sheetsEnd);

const newSheetsSection = `          {/* \u2500\u2500 SHEETS TAB \u2500\u2500 */}
          {!loading && activeTab === "sheets" && (
            <div className="space-y-3">
              {/* Sheet Sub-tabs */}
              <div className="flex gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1 w-fit">
                {[
                  { key: "unassigned", label: "Unassigned", color: "text-slate-600" },
                  { key: "created",    label: "Created Sheets", color: "text-cyan-700" },
                  { key: "processing", label: "Processing Sheets", color: "text-orange-600" },
                ].map(t => {
                  const aqm = {};
                  sheetsData.forEach(s => s.items.forEach(si => {
                    aqm[si.orderItem.id] = (aqm[si.orderItem.id] || 0) + (si.quantityOnSheet || si.multiple * s.quantity);
                  }));
                  const count = t.key === "unassigned"
                    ? ordersData.reduce((sum, o) => sum + o.items.filter(i => i.productionCategory === "SHEET_PRODUCTION" && (i.quantity - (aqm[i.id] || 0)) > 0).length, 0)
                    : t.key === "created"
                    ? sheetsData.filter(s => s.status === "INCOMPLETE" || s.status === "SETTING").length
                    : sheetsData.filter(s => s.status === "PRINTING" || s.status === "PROCESSING").length;
                  return (
                    <button key={t.key} onClick={() => setSheetSubTab(t.key)}
                      className={\`inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-colors \${sheetSubTab === t.key ? "bg-white shadow-sm border border-slate-200 " + t.color : "text-slate-500 hover:text-slate-700"}\`}>
                      {t.label}
                      <span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${sheetSubTab === t.key ? "bg-cyan-100 text-cyan-700" : "bg-slate-200 text-slate-500"}\`}>{count}</span>
                    </button>
                  );
                })}
              </div>

              {/* Unassigned sub-tab */}
              {sheetSubTab === "unassigned" && (() => {
                const aqm = {};
                sheetsData.forEach(s => s.items.forEach(si => {
                  aqm[si.orderItem.id] = (aqm[si.orderItem.id] || 0) + (si.quantityOnSheet || si.multiple * s.quantity);
                }));
                const items = ordersData.flatMap(o => o.items
                  .filter(i => i.productionCategory === "SHEET_PRODUCTION" && (i.quantity - (aqm[i.id] || 0)) > 0)
                  .map(i => ({ ...i, orderNo: o.orderNo, customerName: o.customerName }))
                );
                if (items.length === 0) return React.createElement("div", { className: "rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm" }, "All sheet items are fully assigned.");
                return (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-slate-100 bg-slate-50">
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">GSM</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Order Qty</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Assigned</th>
                        <th className="px-3 py-2 text-left font-semibold text-slate-600">Balance</th>
                      </tr></thead>
                      <tbody>
                        {items.map(item => {
                          const notes = parseNotes(item.productionNotes);
                          const assigned = aqm[item.id] || 0;
                          return (
                            <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50">
                              <td className="px-3 py-2 font-bold text-blue-700">{item.orderNo}</td>
                              <td className="px-3 py-2 text-slate-700">{item.customerName}</td>
                              <td className="px-3 py-2 font-semibold text-slate-800">{item.productName}</td>
                              <td className="px-3 py-2 text-slate-500">{notes.gsm || "\u2014"}</td>
                              <td className="px-3 py-2 font-semibold text-slate-800">{item.quantity}</td>
                              <td className="px-3 py-2 text-orange-600 font-semibold">{assigned}</td>
                              <td className="px-3 py-2 text-cyan-700 font-bold">{item.quantity - assigned}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              {/* Created / Processing sub-tabs */}
              {(sheetSubTab === "created" || sheetSubTab === "processing") && (() => {
                const filtered = sheetsData.filter(s =>
                  sheetSubTab === "created" ? (s.status === "INCOMPLETE" || s.status === "SETTING") : (s.status === "PRINTING" || s.status === "PROCESSING")
                );
                if (filtered.length === 0) return React.createElement("div", { className: "rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm" }, "No sheets in this stage.");
                return (
                  <div className="space-y-2">
                    {filtered.map(sheet => {
                      const isExp = expandedSheet === sheet.id;
                      const usedPct = sheet.areaSqInches > 0 ? Math.round((sheet.usedAreaSqInches / sheet.areaSqInches) * 100) : 0;
                      const svf = stageVendorForm[sheet.id] || { stage: "", vendorId: "", cost: "", description: "", vendorInvoiceNo: "" };
                      return (
                        <div key={sheet.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                          <div className="flex items-center justify-between px-4 py-2.5 bg-cyan-50 border-b border-cyan-100 cursor-pointer"
                            onClick={() => { setExpandedSheet(isExp ? null : sheet.id); if (!isExp) loadPlaceableItems(sheet.gsm); }}>
                            <div className="flex items-center gap-3 flex-wrap">
                              <span className="font-bold text-cyan-700 text-sm">{sheet.sheetNo}</span>
                              <span className="text-slate-600 text-xs">{sheet.gsm} GSM \xb7 {sheet.quality.replace(/_/g, " ")} \xb7 {sheet.sizeInches}" \xb7 Qty {sheet.quantity}</span>
                              <span className={\`rounded-full px-2 py-0.5 text-xs font-semibold \${sheetStatusColors[sheet.status]}\`}>{sheet.status}</span>
                              <span className="text-xs text-slate-500">{usedPct}% used \xb7 {sheet.items.length} items</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <select value={sheet.status} onClick={e => e.stopPropagation()} onChange={e => updateSheetStatus(sheet.id, e.target.value)}
                                className={\`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none border-transparent \${sheetStatusColors[sheet.status]}\`}>
                                {SHEET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                              {isExp ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                            </div>
                          </div>
                          {isExp && (
                            <div className="p-4 space-y-4">
                              <div>
                                <div className="flex justify-between text-xs text-slate-500 mb-1">
                                  <span>Space: {sheet.usedAreaSqInches.toFixed(1)} / {sheet.areaSqInches} sq in</span><span>{usedPct}%</span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                  <div className={\`h-full rounded-full transition-all \${usedPct > 90 ? "bg-red-500" : usedPct > 70 ? "bg-yellow-500" : "bg-cyan-500"}\`} style={{ width: usedPct + "%" }} />
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-2">Items on sheet</p>
                                {sheet.items.length === 0 ? <p className="text-xs text-slate-400">No items placed yet.</p> : (
                                  <div className="space-y-1.5">
                                    {sheet.items.map(si => (
                                      <div key={si.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                        <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                        <span className="text-slate-500">{si.orderItem.order.orderNumber} \u2014 {si.orderItem.order.customer.businessName}</span>
                                        <span className="text-cyan-700 font-semibold">x{si.multiple} \xb7 Qty {si.quantityOnSheet}</span>
                                        <button onClick={() => removeSheetItem(si.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-2">Place items (GSM: {sheet.gsm})</p>
                                {loadingPlaceable ? <Loader2 className="h-4 w-4 animate-spin text-cyan-600" /> : placeableItems.length === 0 ? (
                                  <p className="text-xs text-slate-400">No unplaced items with {sheet.gsm} GSM.</p>
                                ) : (
                                  <div className="space-y-1.5">
                                    {placeableItems.map(pi => {
                                      const sz = (pi.openSizeInches || "0x0").replace("*","x").split("x").map(Number);
                                      const itemArea = (sz[0] && sz[1]) ? sz[0]*sz[1] : 0;
                                      const fitsByArea = itemArea > 0 ? Math.floor((sheet.areaSqInches-sheet.usedAreaSqInches)/itemArea) : 0;
                                      const alreadyAssigned = getAssignedQty(pi.id);
                                      const balanceQty = pi.quantity - alreadyAssigned;
                                      const maxMultiple = fitsByArea > 0 ? Math.min(fitsByArea, Math.ceil(balanceQty/sheet.quantity)) : 0;
                                      const canPlace = maxMultiple > 0 && balanceQty > 0;
                                      return (
                                        <div key={pi.id} className="flex items-center gap-3 rounded-lg border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs">
                                          <span className="font-semibold text-slate-800">{pi.productName}</span>
                                          <span className="text-slate-500">{pi.orderNo} \u2014 {pi.customerName}</span>
                                          <span className="text-cyan-700 font-semibold">Balance: {balanceQty} \xb7 Max: {maxMultiple}x</span>
                                          <button onClick={() => openMultipleDialog(sheet.id, pi)} disabled={!canPlace || placingItem === pi.id}
                                            className="ml-auto inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-50">
                                            {placingItem === pi.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Place
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-slate-600 mb-2">Stage Vendors</p>
                                {sheet.stageVendors.length > 0 && (
                                  <div className="space-y-1.5 mb-3">
                                    {sheet.stageVendors.map(sv => (
                                      <div key={sv.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
                                        <span className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 font-semibold">{sv.stage.replace(/_/g," ")}</span>
                                        <span className="font-semibold text-slate-800">{sv.vendor.name}</span>
                                        <span className="font-bold text-cyan-700">{fmt(sv.cost)}</span>
                                        <button onClick={() => deleteStageVendor(sv.id)} className="ml-auto text-slate-300 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <div className="rounded-lg border border-dashed border-cyan-200 bg-cyan-50/50 p-3">
                                  <p className="text-xs font-semibold text-cyan-700 mb-2">+ Assign Stage Vendor</p>
                                  <div className="grid grid-cols-3 gap-2 mb-2">
                                    <div><label className="block text-xs text-slate-500 mb-1">Stage *</label>
                                      <select value={svf.stage} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, stage: e.target.value } }))} style={IS.input}>
                                        <option value="">Select...</option>{SHEET_STAGES.map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                                      </select></div>
                                    <div><label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                                      <select value={svf.vendorId} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, vendorId: e.target.value } }))} style={IS.input}>
                                        <option value="">Select...</option>{vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                      </select></div>
                                    <div><label className="block text-xs text-slate-500 mb-1">Cost *</label>
                                      <input type="number" value={svf.cost} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, cost: e.target.value } }))} placeholder="0.00" style={IS.input} /></div>
                                    <div><label className="block text-xs text-slate-500 mb-1">Description</label>
                                      <input value={svf.description} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, description: e.target.value } }))} placeholder="Optional" style={IS.input} /></div>
                                    <div><label className="block text-xs text-slate-500 mb-1">Invoice No</label>
                                      <input value={svf.vendorInvoiceNo} onChange={e => setStageVendorForm(p => ({ ...p, [sheet.id]: { ...svf, vendorInvoiceNo: e.target.value } }))} placeholder="Optional" style={IS.input} /></div>
                                  </div>
                                  <button onClick={() => addStageVendor(sheet.id)} disabled={savingStageVendor}
                                    className="inline-flex items-center gap-1 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
                                    {savingStageVendor ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}`;

const oldBlock = c.slice(sheetsStart, sheetsEnd);
c = c.slice(0, sheetsStart) + newSheetsSection + c.slice(sheetsEnd);
console.log('Sheets tab replaced successfully');

// Add multiple dialog before Assign Modal
const multipleDialogHTML = `
      {/* Multiple Dialog */}
      {multipleDialog && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"26rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-3">
              <div><h2 className="text-base font-semibold text-slate-900">Place on Sheet</h2>
                <p className="text-xs text-slate-500 mt-0.5">{multipleDialog.item.productName} \xb7 {multipleDialog.sheetNo}</p></div>
              <button onClick={() => setMultipleDialog(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            {(() => {
              const alreadyAssigned = getAssignedQty(multipleDialog.item.id);
              const balanceQty = multipleDialog.item.quantity - alreadyAssigned;
              const val = parseInt(multipleValue) || 0;
              const willPrint = Math.min(val * multipleDialog.sheetQty, balanceQty);
              const remainingAfter = balanceQty - willPrint;
              return (
                <div className="space-y-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-slate-500">Order Qty</span><span className="font-semibold">{multipleDialog.item.quantity}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Already Assigned</span><span className="font-semibold text-orange-600">{alreadyAssigned}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Balance Qty</span><span className="font-semibold text-cyan-700">{balanceQty}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Sheet Qty</span><span className="font-semibold">{multipleDialog.sheetQty}</span></div>
                    <div className="border-t border-slate-200 pt-1 flex justify-between"><span className="text-slate-500">Will Print</span><span className="font-bold text-green-700">{willPrint}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Remaining After</span><span className={\`font-bold \${remainingAfter > 0 ? "text-orange-500" : "text-green-600"}\`}>{remainingAfter}</span></div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Multiple (x) * <span className="text-slate-400 font-normal">Max: {multipleDialog.maxMultiple}x</span></label>
                    <input type="number" min={1} max={multipleDialog.maxMultiple} value={multipleValue}
                      onChange={e => { const v = parseInt(e.target.value); if (!isNaN(v)) setMultipleValue(String(Math.min(Math.max(1,v),multipleDialog.maxMultiple))); else setMultipleValue(e.target.value); }}
                      style={{ width:"100%",borderRadius:"6px",border:"1px solid #e2e8f0",padding:"8px 10px",fontSize:"14px",boxSizing:"border-box" }} />
                    <p className="text-xs text-slate-400 mt-1">Suggested: {multipleDialog.suggestedMultiple}x</p>
                  </div>
                </div>
              );
            })()}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setMultipleDialog(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={confirmPlaceWithMultiple} disabled={!!placingItem}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">
                {placingItem ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Place on Sheet
              </button>
            </div>
          </div>
        </div>
      )}

`;

const assignModalMarker = '      {/* \u2500\u2500 Assign Modal \u2500\u2500 */}';
if (c.includes(assignModalMarker)) {
  c = c.replace(assignModalMarker, multipleDialogHTML + assignModalMarker);
  console.log('Multiple dialog added');
} else {
  console.log('WARNING: Assign Modal marker not found');
}

fs.writeFileSync('frontend/app/production/page.tsx', c, 'utf8');
console.log('All done! Size:', fs.statSync('frontend/app/production/page.tsx').size);
