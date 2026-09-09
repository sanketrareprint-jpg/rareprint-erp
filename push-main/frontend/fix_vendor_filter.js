const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// FIX 1: Add processingItemVendors state to track per-row vendor selection
const stateMarker = '  const [processingVendorFilter, setProcessingVendorFilter] = useState("");';
const newState = `  const [processingVendorFilter, setProcessingVendorFilter] = useState("");
  const [processingItemVendors, setProcessingItemVendors] = useState<Record<string, string>>({});`;

if (c.includes(stateMarker)) {
  c = c.replace(stateMarker, newState);
  console.log('Fix 1: processingItemVendors state added');
} else console.log('Fix 1 FAILED');

// FIX 2: Replace the Processing Orders table to use processingItemVendors for filter + vendor select
const old2 = `                        {allItems.filter(si => !processingVendorFilter || (si.sheet.stageVendors.some(sv => sv.vendorId === processingVendorFilter))).map(si => (
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
                                ))}`;

const new2 = `                        {allItems.filter(si => {
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
                                      <button className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
                                        Ready
                                      </button>
                                    </td>
                                  </tr>
                                ))}`;

if (c.includes(old2)) {
  c = c.replace(old2, new2);
  console.log('Fix 2: Vendor filter + per-row state fixed');
} else console.log('Fix 2 FAILED');

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
