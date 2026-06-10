const fs = require('fs');

// ═══ FIX 1: Show full name in sidebar ═══
{
  let c = fs.readFileSync('components/dashboard-shell.tsx', 'utf8');
  // Find the avatar initial div and add name below it
  const old1 = `          <span style={{ fontSize: "8px", color: "#93c5fd", textAlign: "center", maxWidth: "64px", wordBreak: "break-word", lineHeight: 1.2 }}>
            {role.replace("_", " ")}
          </span>`;
  const new1 = `          <span style={{ fontSize: "9px", color: "#ffffff", textAlign: "center", maxWidth: "64px", wordBreak: "break-word", lineHeight: 1.2, fontWeight: 700 }}>
            {name.split(" ")[0]}
          </span>
          <span style={{ fontSize: "8px", color: "#93c5fd", textAlign: "center", maxWidth: "64px", wordBreak: "break-word", lineHeight: 1.2 }}>
            {role.replace("_", " ")}
          </span>`;

  if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Fix 1: name added to sidebar'); }
  else console.log('Fix 1 FAILED - trying CRLF');

  const old1cr = old1.replace(/\n/g, '\r\n');
  const new1cr = new1.replace(/\n/g, '\r\n');
  if (!c.includes('name.split(" ")[0]') && c.includes(old1cr)) {
    c = c.replace(old1cr, new1cr); console.log('Fix 1 (CRLF): name added');
  }

  fs.writeFileSync('components/dashboard-shell.tsx', c, 'utf8');
}

// ═══ FIX 2: Filter orders by agent for SALES_AGENT ═══
{
  let c = fs.readFileSync('app/orders/page.tsx', 'utf8');

  // Add user reading + agent filter before allOrders line
  const old2 = `  const allOrders        = orders;`;
  const new2 = `  // Get current user for agent filtering
  const currentUser = (() => {
    try { const r = localStorage.getItem("rareprint_user"); return r ? JSON.parse(r) : null; } catch { return null; }
  })();
  const agentOrders = currentUser?.role === "SALES_AGENT"
    ? orders.filter(o => o.salesAgentName === currentUser.fullName)
    : orders;
  const allOrders        = agentOrders;`;

  if (c.includes(old2)) {
    c = c.replace(old2, new2);
    console.log('Fix 2: agent filter added');
    // Also update inProgressOrders to use agentOrders
    c = c.replace(
      'const inProgressOrders = orders.filter(o => IN_PROGRESS_STATUSES.includes(o.status));',
      'const inProgressOrders = agentOrders.filter(o => IN_PROGRESS_STATUSES.includes(o.status));'
    );
    // Update readyOrders if it uses orders
    c = c.replace(
      'const readyOrders      = orders.filter(',
      'const readyOrders      = agentOrders.filter('
    );
    console.log('Fix 2b: inProgressOrders + readyOrders updated');
  } else console.log('Fix 2 FAILED');

  fs.writeFileSync('app/orders/page.tsx', c, 'utf8');
  console.log('Orders page updated');
}
