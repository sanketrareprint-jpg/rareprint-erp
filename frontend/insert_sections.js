const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// INSERT 1: Processing section after line 1010 (index 1009)
// Line 1010 is })() - line 1011 is </div> - line 1012 is )}
// We insert between line 1010 and 1011

const processingSection = `
              {sheetSubTab === "processing" && (
                <div className="space-y-3">
                  <div className="flex gap-1 bg-slate-100 rounded-lg p-1 w-fit">
                    <button onClick={() => setProcessingSubTab("printing")}
                      className={\`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors \${processingSubTab === "printing" ? "bg-white shadow-sm text-blue-700 border border-slate-200" : "text-slate-500 hover:text-slate-700"}\`}>
                      Printing Sheets
                      <span className={\`ml-1.5 rounded-full px-1.5 py-0.5 text-xs \${processingSubTab === "printing" ? "bg-blue-100 text-blue-700" : "bg-slate-200 text-slate-500"}\`}>
                        {sheetsData.filter(s => s.status === "SETTING" || s.status === "PRINTING").length}
                      </span>
                    </button>
                    <button onClick={() => setProcessingSubTab("processing")}
                      className={\`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors \${processingSubTab === "processing" ? "bg-white shadow-sm text-orange-700 border border-slate-200" : "text-slate-500 hover:text-slate-700"}\`}>
                      Processing Orders
                      <span className={\`ml-1.5 rounded-full px-1.5 py-0.5 text-xs \${processingSubTab === "processing" ? "bg-orange-100 text-orange-700" : "bg-slate-200 text-slate-500"}\`}>
                        {sheetsData.filter(s => s.status === "PROCESSING" || s.status === "DONE").flatMap(s => s.items).length}
                      </span>
                    </button>
                  </div>

                  {processingSubTab === "printing" && (() => {
                    const printSheets = sheetsData.filter(s => s.status === "SETTING" || s.status === "PRINTING");
                    if (printSheets.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No sheets in printing stage.</div>;
                    return (
                      <div className="space-y-2">
                        {printSheets.map(sheet => {
                          const isExp = expandedSheet === sheet.id;
                          return (
                            <div key={sheet.id} className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                              <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-100 cursor-pointer"
                                onClick={() => setExpandedSheet(isExp ? null : sheet.id)}>
                                <div className="flex items-center gap-3 flex-wrap">
                                  <span className="font-bold text-blue-700 text-sm">{sheet.sheetNo}</span>
                                  <span className="text-slate-600 text-xs">{sheet.gsm} GSM · {sheet.quality.replace(/_/g," ")} · {sheet.sizeInches}" · Qty {sheet.quantity}</span>
                                  <span className={\`rounded-full px-2 py-0.5 text-xs font-semibold \${sheetStatusColors[sheet.status] || "bg-gray-100 text-gray-600"}\`}>{sheet.status}</span>
                                  <span className="text-xs text-slate-500">{sheet.items.length} items</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <select value={sheet.status} onClick={e => e.stopPropagation()} onChange={e => updateSheetStatus(sheet.id, e.target.value)}
                                    className={\`rounded-md border px-1.5 py-0.5 text-xs font-semibold outline-none border-transparent \${sheetStatusColors[sheet.status] || "bg-gray-100"}\`}>
                                    {SHEET_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                  {isExp ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                                </div>
                              </div>
                              {isExp && (
                                <div className="p-4 space-y-3">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-600 mb-2">Items on sheet</p>
                                    <div className="space-y-1.5">{sheet.items.map(si => (
                                      <div key={si.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                        <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                        <span className="text-slate-500">{si.orderItem.order.orderNumber} — {si.orderItem.order.customer.businessName}</span>
                                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5">{si.orderItem.product.sizeInches}"</span>
                                        <span className="text-cyan-700 font-semibold">x{si.multiple} · Qty {si.quantityOnSheet}</span>
                                      </div>
                                    ))}</div>
                                  </div>
                                  {sheet.stageVendors.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-slate-600 mb-2">Stage Vendors</p>
                                      <div className="space-y-1">{sheet.stageVendors.map(sv => (
                                        <div key={sv.id} className="flex items-center gap-3 text-xs rounded-lg border border-slate-200 bg-white px-3 py-2">
                                          <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 font-semibold">{sv.stage.replace(/_/g," ")}</span>
                                          <span className="font-semibold">{sv.vendor.name}</span>
                                          {sv.description && <span className="text-slate-400">{sv.description}</span>}
                                          <span className="ml-auto font-bold text-cyan-700">{fmt(sv.cost)}</span>
                                        </div>
                                      ))}</div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}

                  {processingSubTab === "processing" && (() => {
                    const procSheets = sheetsData.filter(s => s.status === "PROCESSING" || s.status === "DONE");
                    const allItems = procSheets.flatMap(sheet => sheet.items.map(si => ({ ...si, sheet })));
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-600">Filter by Vendor:</label>
                          <select value={processingVendorFilter} onChange={e => setProcessingVendorFilter(e.target.value)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none bg-white">
                            <option value="">All Vendors</option>
                            {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                          {processingVendorFilter && <button onClick={() => setProcessingVendorFilter("")} className="text-xs text-slate-400 hover:text-slate-600">x Clear</button>}
                        </div>
                        {allItems.length === 0 ? (
                          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No items in processing stage.</div>
                        ) : (
                          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                            <table className="w-full text-xs">
                              <thead><tr className="border-b border-slate-100 bg-slate-50">
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Sheet No</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Customer</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Product</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Size</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Qty</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Processing Vendor</th>
                                <th className="px-3 py-2 text-left font-semibold text-slate-600">Action</th>
                              </tr></thead>
                              <tbody>
                                {allItems.filter(si => !processingVendorFilter || (si.sheet.stageVendors.some(sv => sv.vendorId === processingVendorFilter))).map(si => (
                                  <tr key={si.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="px-3 py-2 font-bold text-cyan-700">{si.sheet.sheetNo}</td>
                                    <td className="px-3 py-2 font-bold text-blue-700">{si.orderItem.order.orderNumber}</td>
                                    <td className="px-3 py-2 text-slate-700">{si.orderItem.order.customer.businessName}</td>
                                    <td className="px-3 py-2 font-semibold text-slate-800">{si.orderItem.product.name}</td>
                                    <td className="px-3 py-2 text-slate-500">{si.orderItem.product.sizeInches}"</td>
                                    <td className="px-3 py-2 font-semibold">{si.quantityOnSheet}</td>
                                    <td className="px-3 py-2">
                                      <select className="rounded-md border border-slate-200 px-1.5 py-1 text-xs outline-none bg-white">
                                        <option value="">Select Vendor...</option>
                                        {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2">
                                      <button className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
                                        Ready
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}`;

// Insert after line 1010 (index 1009)
lines.splice(1010, 0, processingSection);
console.log('Processing section inserted after line 1010');

// INSERT 2: Setting dialog before line 1149 (now shifted by lines inserted above)
// Count the lines added
const linesAdded = processingSection.split('\n').length;
const settingDialogLine = 1149 + linesAdded; // adjusted for insertion
console.log('Setting dialog insertion at adjusted line:', settingDialogLine);

const settingDialog = `      {/* Setting Dialog */}
      {settingDialog && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"32rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Sheet Setting Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">{settingDialog.sheetNo} — Fill plate and printing vendor info</p>
              </div>
              <button onClick={() => setSettingDialog(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 mb-3">
              <p className="text-xs font-bold text-slate-700 mb-2">Plate Making</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                  <select value={settingForm.plateVendorId} onChange={e => setSettingForm(p => ({ ...p, plateVendorId: e.target.value }))} style={IS.input}>
                    <option value="">Select vendor...</option>{vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select></div>
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Description</label>
                  <input value={settingForm.plateDesc} onChange={e => setSettingForm(p => ({ ...p, plateDesc: e.target.value }))} placeholder="Optional" style={IS.input} /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Rate (Rs) *</label>
                  <input type="number" value={settingForm.plateRate} onChange={e => setSettingForm(p => ({ ...p, plateRate: e.target.value }))} placeholder="0.00" style={IS.input} /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Quantity *</label>
                  <input type="number" value={settingForm.plateQty} onChange={e => setSettingForm(p => ({ ...p, plateQty: e.target.value }))} placeholder="0" style={IS.input} /></div>
                {settingForm.plateRate && settingForm.plateQty && (
                  <div className="col-span-2 text-right text-xs font-bold text-cyan-700">Total: {fmt(Number(settingForm.plateRate) * Number(settingForm.plateQty))}</div>
                )}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3 mb-4">
              <p className="text-xs font-bold text-slate-700 mb-2">Printing</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                  <select value={settingForm.printVendorId} onChange={e => setSettingForm(p => ({ ...p, printVendorId: e.target.value }))} style={IS.input}>
                    <option value="">Select vendor...</option>{vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select></div>
                <div className="col-span-2"><label className="block text-xs text-slate-500 mb-1">Description</label>
                  <input value={settingForm.printDesc} onChange={e => setSettingForm(p => ({ ...p, printDesc: e.target.value }))} placeholder="Optional" style={IS.input} /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Rate (Rs) *</label>
                  <input type="number" value={settingForm.printRate} onChange={e => setSettingForm(p => ({ ...p, printRate: e.target.value }))} placeholder="0.00" style={IS.input} /></div>
                <div><label className="block text-xs text-slate-500 mb-1">Quantity *</label>
                  <input type="number" value={settingForm.printQty} onChange={e => setSettingForm(p => ({ ...p, printQty: e.target.value }))} placeholder="0" style={IS.input} /></div>
                {settingForm.printRate && settingForm.printQty && (
                  <div className="col-span-2 text-right text-xs font-bold text-cyan-700">Total: {fmt(Number(settingForm.printRate) * Number(settingForm.printQty))}</div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSettingDialog(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitSettingDialog} disabled={savingSetting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {savingSetting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit and Move to Printing
              </button>
            </div>
          </div>
        </div>
      )}
`;

// Find Multiple Dialog line in updated lines array
let multipleDialogIdx = -1;
lines.forEach((line, i) => {
  if (line.includes('Sheet Multiple Dialog') || line.includes('Multiple Dialog')) {
    multipleDialogIdx = i;
  }
});
console.log('Multiple Dialog found at line:', multipleDialogIdx + 1);

if (multipleDialogIdx !== -1) {
  lines.splice(multipleDialogIdx, 0, settingDialog);
  console.log('Setting dialog inserted before Multiple Dialog');
}

fs.writeFileSync('app/production/page.tsx', lines.join('\n'), 'utf8');
console.log('Done, size:', require('fs').statSync('app/production/page.tsx').size);
