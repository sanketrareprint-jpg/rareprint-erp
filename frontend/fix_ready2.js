const fs = require('fs');
let c = fs.readFileSync('app/orders/page.tsx', 'utf8');

// Fix: filter readyOrders by agent after fetching
const old1 = `    setReadyOrders(rRes.ok ? await rRes.json() : []);`;
const new1 = `    const rawReady = rRes.ok ? await rRes.json() : [];
    const cu = (() => { try { const r = localStorage.getItem("rareprint_user"); return r ? JSON.parse(r) : null; } catch { return null; } })();
    setReadyOrders(cu?.role === "SALES_AGENT" ? rawReady.filter((o: any) => o.salesAgentName === cu.fullName) : rawReady);`;

if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Fix: readyOrders filtered by agent'); }
else console.log('FAILED - trying CRLF');

const old1cr = old1.replace(/\n/g, '\r\n');
if (!c.includes('rawReady') && c.includes(old1cr)) {
  c = c.replace(old1cr, new1.replace(/\n/g, '\r\n'));
  console.log('Fix (CRLF): readyOrders filtered by agent');
}

// Also fix the count in the tab
const old2 = `count: readyOrders.length }`;
const new2 = `count: readyOrders.length }`;
// The tab already uses readyOrders which is now filtered - no change needed

fs.writeFileSync('app/orders/page.tsx', c, 'utf8');
console.log('Done');
