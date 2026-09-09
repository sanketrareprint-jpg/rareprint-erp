const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// FIX 1: Fix the READY_FOR_DISPATCH filter - use ordersData to get actual stage
const old1 = `                    // Filter out items already marked READY_FOR_DISPATCH
                    const allItems = procSheets.flatMap(sheet => sheet.items.map(si => ({ ...si, sheet })))
                      .filter(si => si.orderItem.itemProductionStage !== "READY_FOR_DISPATCH");`;

const new1 = `                    // Filter out items already marked READY_FOR_DISPATCH
                    // Cross-reference with ordersData since SheetItem doesn't have stage
                    const readyItemIds = new Set(
                      ordersData.flatMap(o => o.items.filter(i => i.itemProductionStage === "READY_FOR_DISPATCH").map(i => i.id))
                    );
                    const allItems = procSheets.flatMap(sheet => sheet.items.map(si => ({ ...si, sheet })))
                      .filter(si => !readyItemIds.has(si.orderItem.id));`;

if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Fix 1: READY_FOR_DISPATCH filter fixed'); }
else console.log('Fix 1 FAILED');

// FIX 2: Fix vendor persistence - use orderItem.id as key (stable across refreshes)
// and load from sessionStorage using orderItem.id
const old2 = `                    const getItemVendor = (itemId) => processingItemVendors[itemId] || "";
                    const saveItemVendor = (itemId, vendorId) => {
                      setProcessingItemVendors(p => {
                        const updated = { ...p, [itemId]: vendorId };
                        // Save to sessionStorage for persistence across re-renders
                        try { sessionStorage.setItem("procVendors", JSON.stringify(updated)); } catch {}
                        return updated;
                      });
                    };`;

const new2 = `                    // Use orderItem.id as key (stable across loadAll refreshes)
                    const getItemVendor = (orderItemId) => processingItemVendors[orderItemId] || "";
                    const saveItemVendor = (orderItemId, vendorId) => {
                      setProcessingItemVendors(p => {
                        const updated = { ...p, [orderItemId]: vendorId };
                        try { sessionStorage.setItem("procVendors", JSON.stringify(updated)); } catch {}
                        return updated;
                      });
                    };`;

if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Fix 2: vendor key changed to orderItem.id'); }
else console.log('Fix 2 FAILED');

// FIX 3: Update the select and filter to use si.orderItem.id instead of si.id
const old3 = `                                      <select value={getItemVendor(si.id)}
                                        onChange={e => saveItemVendor(si.id, e.target.value)}`;
const new3 = `                                      <select value={getItemVendor(si.orderItem.id)}
                                        onChange={e => saveItemVendor(si.orderItem.id, e.target.value)}`;
if (c.includes(old3)) { c = c.replace(old3, new3); console.log('Fix 3: select uses orderItem.id'); }
else console.log('Fix 3 FAILED');

// FIX 4: Update filter to use orderItem.id
const old4 = `                                {allItems.filter(si => !processingVendorFilter || getItemVendor(si.id) === processingVendorFilter).map(si => (`;
const new4 = `                                {allItems.filter(si => !processingVendorFilter || getItemVendor(si.orderItem.id) === processingVendorFilter).map(si => (`;
if (c.includes(old4)) { c = c.replace(old4, new4); console.log('Fix 4: filter uses orderItem.id'); }
else console.log('Fix 4 FAILED');

// FIX 5: Also fix the initial state load - the useEffect that loads from sessionStorage
// It already loads into processingItemVendors which now uses orderItem.id as key - should work

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
