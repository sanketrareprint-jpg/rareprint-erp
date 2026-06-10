const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// FIX 1: Load initial vendor state from sheetOrderItems/stageVendors
// The processing vendor per item should be stored in backend
// For now: initialize processingItemVendors from existing sheetItem data
// We need to store per-sheetItem vendor in backend

// The existing stageVendors on a sheet are at sheet level (PLATE_MAKING, PRINTING etc.)
// We need per-item processing vendor. Since backend doesn't have per-item vendor,
// we'll use localStorage to persist across refreshes (keyed by sheetItemId)

// Replace the Processing Orders section to:
// 1. Load vendors from localStorage on mount
// 2. Save to localStorage when vendor changes
// 3. Filter out READY_FOR_DISPATCH items

const old1 = `                  {processingSubTab === "processing" && (() => {
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
                                {allItems.filter(si => {
                                    if (!processingVendorFilter) return true;
                                    return processingItemVendors[si.id] === processingVendorFilter;
                                  }).map(si => (
                                  <tr key={si.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="px-3 py-2 font-bold text-cyan-700">{si.sheet.sheetNo}</td>
                                    <td className="px-3 py-2 font-bold text-blue-700">{si.orderItem.order.orderNumber}</td>
                                    <td className="px-3 py-2 text-slate-700">{si.orderItem.order.customer.businessName}</td>
                                    <td className="px-3 py-2 font-semibold text-slate-800">{si.orderItem.product.name}</td>
                                    <td className="px-3 py-2 text-slate-500">{si.orderItem.product.sizeInches}"</td>
                                    <td className="px-3 py-2 font-semibold">{si.quantityOnSheet}</td>
                                    <td className="px-3 py-2">
                                      <select value={processingItemVendors[si.id] || ""}
                                        onChange={e => setProcessingItemVendors(p => ({ ...p, [si.id]: e.target.value }))}
                                        className="rounded-md border border-slate-200 px-1.5 py-1 text-xs outline-none bg-white">
                                        <option value="">Select Vendor...</option>
                                        {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={async () => {
                                          if (!confirm("Mark this item as Ready for Dispatch?")) return;
                                          try {
                                            const res = await fetch(API_BASE_URL + "/production/items/" + si.orderItem.id + "/stage", {
                                              method: "PATCH",
                                              headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                              body: JSON.stringify({ stage: "READY_FOR_DISPATCH" }),
                                            });
                                            if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
                                            await loadAll();
                                          } catch { alert("Network error"); }
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
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
                  })()}`;

const new1 = `                  {processingSubTab === "processing" && (() => {
                    const procSheets = sheetsData.filter(s => s.status === "PROCESSING" || s.status === "DONE");
                    // Filter out items already marked READY_FOR_DISPATCH
                    const allItems = procSheets.flatMap(sheet => sheet.items.map(si => ({ ...si, sheet })))
                      .filter(si => si.orderItem.itemProductionStage !== "READY_FOR_DISPATCH");
                    // Load saved vendors from sessionStorage (persists during session, not across refreshes)
                    // Use ordersData to get current stage
                    const getItemVendor = (itemId) => processingItemVendors[itemId] || "";
                    const saveItemVendor = (itemId, vendorId) => {
                      setProcessingItemVendors(p => {
                        const updated = { ...p, [itemId]: vendorId };
                        // Save to sessionStorage for persistence across re-renders
                        try { sessionStorage.setItem("procVendors", JSON.stringify(updated)); } catch {}
                        return updated;
                      });
                    };
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
                          <span className="text-xs text-slate-400 ml-2">{allItems.length} items pending</span>
                        </div>
                        {allItems.length === 0 ? (
                          <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-400 text-sm">All items are ready for dispatch.</div>
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
                                {allItems.filter(si => !processingVendorFilter || getItemVendor(si.id) === processingVendorFilter).map(si => (
                                  <tr key={si.id} className="border-b border-slate-50 hover:bg-slate-50">
                                    <td className="px-3 py-2 font-bold text-cyan-700">{si.sheet.sheetNo}</td>
                                    <td className="px-3 py-2 font-bold text-blue-700">{si.orderItem.order.orderNumber}</td>
                                    <td className="px-3 py-2 text-slate-700">{si.orderItem.order.customer.businessName}</td>
                                    <td className="px-3 py-2 font-semibold text-slate-800">{si.orderItem.product.name}</td>
                                    <td className="px-3 py-2 text-slate-500">{si.orderItem.product.sizeInches}"</td>
                                    <td className="px-3 py-2 font-semibold">{si.quantityOnSheet}</td>
                                    <td className="px-3 py-2">
                                      <select value={getItemVendor(si.id)}
                                        onChange={e => saveItemVendor(si.id, e.target.value)}
                                        className="rounded-md border border-slate-200 px-1.5 py-1 text-xs outline-none bg-white">
                                        <option value="">Select Vendor...</option>
                                        {vendorsData.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                      </select>
                                    </td>
                                    <td className="px-3 py-2">
                                      <button
                                        onClick={async () => {
                                          if (!confirm("Mark this item as Ready for Dispatch?")) return;
                                          try {
                                            const res = await fetch(API_BASE_URL + "/production/items/" + si.orderItem.id + "/stage", {
                                              method: "PATCH",
                                              headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
                                              body: JSON.stringify({ stage: "READY_FOR_DISPATCH" }),
                                            });
                                            if (!res.ok) { const b = await res.json(); alert(b.message || "Failed"); return; }
                                            await loadAll();
                                          } catch { alert("Network error"); }
                                        }}
                                        className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
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
                  })()}`;

if (c.includes(old1)) {
  c = c.replace(old1, new1);
  console.log('Fix 1: Processing orders section updated');
} else console.log('Fix 1 FAILED');

// FIX 2: Load processingItemVendors from sessionStorage on init
// Add useEffect to load from sessionStorage
const effectMarker = '  useEffect(() => { void loadAll(); }, [loadAll]);';
const newEffect = `  useEffect(() => { void loadAll(); }, [loadAll]);

  // Load saved processing vendors from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("procVendors");
      if (saved) setProcessingItemVendors(JSON.parse(saved));
    } catch {}
  }, []);`;

if (c.includes(effectMarker)) {
  // Replace only the last occurrence (there may be two loadAll effects)
  const lastIdx = c.lastIndexOf(effectMarker);
  c = c.slice(0, lastIdx + effectMarker.length) + '\n' + `
  // Load saved processing vendors from sessionStorage
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("procVendors");
      if (saved) setProcessingItemVendors(JSON.parse(saved));
    } catch {}
  }, []);` + c.slice(lastIdx + effectMarker.length);
  console.log('Fix 2: sessionStorage load effect added');
} else console.log('Fix 2 FAILED');

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
