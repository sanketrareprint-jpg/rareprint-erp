const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// FIX: Replace the Ready button with working implementation
const old1 = `                                    <td className="px-3 py-2">
                                      <button className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">
                                        Ready
                                      </button>
                                    </td>`;

const new1 = `                                    <td className="px-3 py-2">
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
                                    </td>`;

if (c.includes(old1)) {
  c = c.replace(old1, new1);
  console.log('Fix: Ready button now calls READY_FOR_DISPATCH');
} else {
  console.log('FAILED - searching for button...');
  const idx = c.indexOf('Ready\n                                      </button>');
  console.log('Found at:', idx);
}

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
