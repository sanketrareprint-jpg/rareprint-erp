const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// ─── STEP 1: Add new state variables ───────────────────────────────────────
const stateMarker = '  const [sheetSubTab, setSheetSubTab] = useState("unassigned");';
const newState = `  const [sheetSubTab, setSheetSubTab] = useState("unassigned");
  const [processingSubTab, setProcessingSubTab] = useState<"printing"|"processing">("printing");
  const [settingDialog, setSettingDialog] = useState<{ sheetId: string; sheetNo: string } | null>(null);
  const [settingForm, setSettingForm] = useState({
    plateVendorId: "", plateDesc: "", plateRate: "", plateQty: "",
    printVendorId: "", printDesc: "", printRate: "", printQty: "",
  });
  const [savingSetting, setSavingSetting] = useState(false);
  const [processingVendorFilter, setProcessingVendorFilter] = useState("");`;

if (c.includes(stateMarker)) {
  c = c.replace(stateMarker, newState);
  console.log('Step 1: State variables added');
} else console.log('Step 1 FAILED');

// ─── STEP 2: Replace updateSheetStatus to intercept COMPLETE→SETTING ──────
const old2 = `  async function updateSheetStatus(sheetId: string, status: string) {
    const prevExpanded = expandedSheet;
    await fetch(\`\${API_BASE_URL}/production/sheets/\${sheetId}/status\`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadAll();
    setExpandedSheet(prevExpanded);
  }`;

const new2 = `  async function updateSheetStatus(sheetId: string, status: string) {
    // Intercept COMPLETE → SETTING: must fill plate + print vendor info first
    const sheet = sheetsData.find(s => s.id === sheetId);
    if (sheet && sheet.status === "COMPLETE" && status === "SETTING") {
      setSettingDialog({ sheetId, sheetNo: sheet.sheetNo });
      setSettingForm({ plateVendorId: "", plateDesc: "", plateRate: "", plateQty: "", printVendorId: "", printDesc: "", printRate: "", printQty: "" });
      return;
    }
    const prevExpanded = expandedSheet;
    await fetch(\`\${API_BASE_URL}/production/sheets/\${sheetId}/status\`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadAll();
    setExpandedSheet(prevExpanded);
  }

  async function submitSettingDialog() {
    if (!settingDialog) return;
    const { sheetId } = settingDialog;
    if (!settingForm.plateVendorId || !settingForm.plateRate || !settingForm.plateQty) { alert("Fill Plate vendor, rate and quantity"); return; }
    if (!settingForm.printVendorId || !settingForm.printRate || !settingForm.printQty) { alert("Fill Printing vendor, rate and quantity"); return; }
    setSavingSetting(true);
    try {
      const h = { ...getAuthHeaders(), "Content-Type": "application/json" };
      const plateTotal = Number(settingForm.plateRate) * Number(settingForm.plateQty);
      const printTotal = Number(settingForm.printRate) * Number(settingForm.printQty);
      await fetch(\`\${API_BASE_URL}/production/sheets/\${sheetId}/stage-vendors\`, {
        method: "POST", headers: h,
        body: JSON.stringify({ stage: "PLATE_MAKING", vendorId: settingForm.plateVendorId, cost: plateTotal, description: settingForm.plateDesc || undefined }),
      });
      await fetch(\`\${API_BASE_URL}/production/sheets/\${sheetId}/stage-vendors\`, {
        method: "POST", headers: h,
        body: JSON.stringify({ stage: "PRINTING", vendorId: settingForm.printVendorId, cost: printTotal, description: settingForm.printDesc || undefined }),
      });
      await fetch(\`\${API_BASE_URL}/production/sheets/\${sheetId}/status\`, {
        method: "PATCH", headers: h, body: JSON.stringify({ status: "SETTING" }),
      });
      setSettingDialog(null);
      await loadAll();
      setProcessingSubTab("printing");
    } finally { setSavingSetting(false); }
  }`;

if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Step 2: updateSheetStatus updated'); }
else {
  // Try without the prevExpanded version
  const old2b = `  async function updateSheetStatus(sheetId: string, status: string) {\r\n    await fetch(\`\${API_BASE_URL}/production/sheets/\${sheetId}/status\`, {\r\n      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },\r\n      body: JSON.stringify({ status }),\r\n    });\r\n    await loadAll();\r\n  }`;
  if (c.includes(old2b)) { c = c.replace(old2b, new2); console.log('Step 2b: updateSheetStatus updated (original)'); }
  else {
    const idx = c.indexOf('async function updateSheetStatus');
    console.log('Step 2 FAILED - found at:', idx);
    if (idx !== -1) console.log('Context:', JSON.stringify(c.slice(idx, idx+200)));
  }
}

// ─── STEP 3: Replace the Processing Sheets sub-tab UI ─────────────────────
const oldProcessingSection = `              {(sheetSubTab === "created" || sheetSubTab === "processing") && (() => {
                const filtered = sheetsData.filter(s => sheetSubTab === "created" ? (s.status === "INCOMPLETE" || s.status === "COMPLETE") : (s.status === "SETTING" || s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "DONE"));`;

const newProcessingSection = `              {sheetSubTab === "created" && (() => {
                const filtered = sheetsData.filter(s => s.status === "INCOMPLETE" || s.status === "COMPLETE");`;

if (c.includes(oldProcessingSection)) {
  c = c.replace(oldProcessingSection, newProcessingSection);
  console.log('Step 3: Created sheets section updated');
} else console.log('Step 3 FAILED');

// ─── STEP 4: Add Processing sub-tabs section after the created section ─────
// Find the closing of the created sheets section and add processing section after it
// The created sheets section ends with: })()}\n\n              {/* Created / Processing
// We need to add a new processing section

// Find where sheetSubTab created section ends and add processing section
const createdEndMarker = `              })()}
`;

// Find the index after the created sheets IIFE
const processingMarker = `            </div>
          )}
`;

// We'll insert the processing section by finding the right closing bracket
// Let's find "No sheets in this stage" which is in the created section and work from there

// Actually let's just find the last })() before </div></div> and insert after it
// Find the position right before the closing of the sheets tab
const sheetsTabClose = `            </div>
          )}
`;

// Find it after the sheetSubTab === "unassigned" section
const insertAfterCreated = `              })()}

              {sheetSubTab === "processing" && (
                <div className="space-y-3">
                  {/* Processing Sub-tabs */}
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

                  {/* Printing Sheets sub-tab */}
                  {processingSubTab === "printing" && (() => {
                    const printSheets = sheetsData.filter(s => s.status === "SETTING" || s.status === "PRINTING");
                    if (printSheets.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No sheets in printing stage.</div>;
                    return (
                      <div className="space-y-2">
                        {printSheets.map(sheet => {
                          const isExp = expandedSheet === sheet.id;
                          const usedPct = sheet.areaSqInches > 0 ? Math.round((sheet.usedAreaSqInches / sheet.areaSqInches) * 100) : 0;
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
                                <div className="p-4">
                                  <p className="text-xs font-semibold text-slate-600 mb-2">Items on sheet</p>
                                  <div className="space-y-1.5">
                                    {sheet.items.map(si => (
                                      <div key={si.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                        <span className="font-semibold text-slate-800">{si.orderItem.product.name}</span>
                                        <span className="text-slate-500">{si.orderItem.order.orderNumber} — {si.orderItem.order.customer.businessName}</span>
                                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5">{si.orderItem.product.sizeInches}"</span>
                                        <span className="text-cyan-700 font-semibold">x{si.multiple} · Qty {si.quantityOnSheet}</span>
                                      </div>
                                    ))}
                                  </div>
                                  {sheet.stageVendors.length > 0 && (
                                    <div className="mt-3">
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

                  {/* Processing Orders sub-tab */}
                  {processingSubTab === "processing" && (() => {
                    const procSheets = sheetsData.filter(s => s.status === "PROCESSING" || s.status === "DONE");
                    const allItems = procSheets.flatMap(sheet => sheet.items.map(si => ({ ...si, sheet })));
                    // Get unique vendors for filter
                    const allVendors = vendorsData;
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-600">Filter by Vendor:</label>
                          <select value={processingVendorFilter} onChange={e => setProcessingVendorFilter(e.target.value)}
                            className="rounded-md border border-slate-200 px-2 py-1 text-xs outline-none bg-white">
                            <option value="">All Vendors</option>
                            {allVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                          </select>
                          {processingVendorFilter && <button onClick={() => setProcessingVendorFilter("")} className="text-xs text-slate-400 hover:text-slate-600">✕ Clear</button>}
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
                                {allItems.map(si => {
                                  const processingVendor = si.sheet.stageVendors.find(sv => sv.stage === "EXTRA_PROCESSING" || sv.stage === "BINDING" || sv.stage === "LAMINATION");
                                  if (processingVendorFilter && processingVendor?.vendorId !== processingVendorFilter) return null;
                                  return (
                                    <tr key={si.id} className="border-b border-slate-50 hover:bg-slate-50">
                                      <td className="px-3 py-2"><span className="font-bold text-cyan-700">{si.sheet.sheetNo}</span></td>
                                      <td className="px-3 py-2 font-bold text-blue-700">{si.orderItem.order.orderNumber}</td>
                                      <td className="px-3 py-2 text-slate-700">{si.orderItem.order.customer.businessName}</td>
                                      <td className="px-3 py-2 font-semibold text-slate-800">{si.orderItem.product.name}</td>
                                      <td className="px-3 py-2 text-slate-500">{si.orderItem.product.sizeInches}"</td>
                                      <td className="px-3 py-2 font-semibold">{si.quantityOnSheet}</td>
                                      <td className="px-3 py-2">
                                        <select defaultValue={processingVendor?.vendorId || ""}
                                          className="rounded-md border border-slate-200 px-1.5 py-1 text-xs outline-none bg-white">
                                          <option value="">Select Vendor...</option>
                                          {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                        </select>
                                      </td>
                                      <td className="px-3 py-2">
                                        <button className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
                                          ✓ Ready
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}`;

// Find where to insert - after the created sheets IIFE closing
const createdClose = `                if (filtered.length === 0) return <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">No sheets in this stage.</div>;`;

// We need to find the created sheets section closing })() and insert processing after it
// The created section is: {sheetSubTab === "created" && (() => { ... })()}
// Then we add {sheetSubTab === "processing" && (...)}

// Find the end of created section by looking for the pattern
const createdSectionEnd = `              })()}

            </div>
          )}`;

const newCreatedSectionEnd = `              })()}

              {insertAfterCreated}

            </div>
          )}`.replace('{insertAfterCreated}', insertAfterCreated.trim());

// Actually let's do a simpler replacement
if (c.includes(createdSectionEnd)) {
  c = c.replace(createdSectionEnd, `              })()}

` + insertAfterCreated + `

            </div>
          )}`);
  console.log('Step 3: Processing section added');
} else {
  // Try CRLF
  const createdSectionEndCR = createdSectionEnd.replace(/\n/g, '\r\n');
  if (c.includes(createdSectionEndCR)) {
    c = c.replace(createdSectionEndCR, (`              })()}\r\n\r\n` + insertAfterCreated + `\r\n\r\n            </div>\r\n          )}`).replace(/\n/g, '\r\n'));
    console.log('Step 3 (CRLF): Processing section added');
  } else {
    console.log('Step 3 FAILED - finding close...');
    const idx = c.indexOf('})()}\n\n            </div>\n          )}');
    const idxcr = c.indexOf('})()}\r\n\r\n            </div>\r\n          )}');
    console.log('LF close at:', idx, '| CRLF close at:', idxcr);
  }
}

// ─── STEP 5: Add Setting Dialog modal ─────────────────────────────────────
const settingDialogHTML = `      {/* Setting Dialog - PLATE + PRINTING vendor info */}
      {settingDialog && (
        <div style={{ position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(15,23,42,0.6)",padding:"1rem" }}>
          <div style={{ width:"100%",maxWidth:"32rem",background:"white",borderRadius:"1rem",border:"1px solid #e2e8f0",padding:"1.5rem",boxShadow:"0 25px 50px -12px rgba(0,0,0,0.25)" }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Sheet Setting Details</h2>
                <p className="text-xs text-slate-500 mt-0.5">{settingDialog.sheetNo} — Fill plate making and printing info to proceed</p>
              </div>
              <button onClick={() => setSettingDialog(null)}><X className="h-5 w-5 text-slate-400" /></button>
            </div>

            {/* Plate Making */}
            <div className="rounded-lg border border-slate-200 p-3 mb-3">
              <p className="text-xs font-bold text-slate-700 mb-2">🔲 Plate Making</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                  <select value={settingForm.plateVendorId} onChange={e => setSettingForm(p => ({ ...p, plateVendorId: e.target.value }))} style={IS.input}>
                    <option value="">Select vendor...</option>
                    {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Description</label>
                  <input value={settingForm.plateDesc} onChange={e => setSettingForm(p => ({ ...p, plateDesc: e.target.value }))} placeholder="Optional" style={IS.input} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Rate (₹) *</label>
                  <input type="number" value={settingForm.plateRate} onChange={e => setSettingForm(p => ({ ...p, plateRate: e.target.value }))} placeholder="0.00" style={IS.input} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Quantity *</label>
                  <input type="number" value={settingForm.plateQty} onChange={e => setSettingForm(p => ({ ...p, plateQty: e.target.value }))} placeholder="0" style={IS.input} />
                </div>
                {settingForm.plateRate && settingForm.plateQty && (
                  <div className="col-span-2 text-right text-xs font-bold text-cyan-700">
                    Total: {fmt(Number(settingForm.plateRate) * Number(settingForm.plateQty))}
                  </div>
                )}
              </div>
            </div>

            {/* Printing */}
            <div className="rounded-lg border border-slate-200 p-3 mb-4">
              <p className="text-xs font-bold text-slate-700 mb-2">🖨️ Printing</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Vendor *</label>
                  <select value={settingForm.printVendorId} onChange={e => setSettingForm(p => ({ ...p, printVendorId: e.target.value }))} style={IS.input}>
                    <option value="">Select vendor...</option>
                    {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Description</label>
                  <input value={settingForm.printDesc} onChange={e => setSettingForm(p => ({ ...p, printDesc: e.target.value }))} placeholder="Optional" style={IS.input} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Rate (₹) *</label>
                  <input type="number" value={settingForm.printRate} onChange={e => setSettingForm(p => ({ ...p, printRate: e.target.value }))} placeholder="0.00" style={IS.input} />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Quantity *</label>
                  <input type="number" value={settingForm.printQty} onChange={e => setSettingForm(p => ({ ...p, printQty: e.target.value }))} placeholder="0" style={IS.input} />
                </div>
                {settingForm.printRate && settingForm.printQty && (
                  <div className="col-span-2 text-right text-xs font-bold text-cyan-700">
                    Total: {fmt(Number(settingForm.printRate) * Number(settingForm.printQty))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setSettingDialog(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
              <button onClick={submitSettingDialog} disabled={savingSetting}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
                {savingSetting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Submit & Move to Printing
              </button>
            </div>
          </div>
        </div>
      )}

      `;

const assignMarker = '{/* Multiple Dialog */}';
if (c.includes(assignMarker)) {
  c = c.replace(assignMarker, settingDialogHTML + assignMarker);
  console.log('Step 5: Setting dialog modal added');
} else console.log('Step 5 FAILED');

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
