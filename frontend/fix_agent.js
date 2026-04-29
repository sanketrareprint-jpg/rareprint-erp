const fs = require('fs');

// ═══ FIX 1: Show full name in sidebar (dashboard-shell.tsx) ═══
{
  let c = fs.readFileSync('components/dashboard-shell.tsx', 'utf8');
  const lines = c.split('\n');

  // Find the role display line and add fullName above it
  let roleLineIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('role.replace("_", " ")') && line.includes('color: "#93c5fd"')) roleLineIdx = i;
  });
  console.log('Role line at:', roleLineIdx + 1);

  if (roleLineIdx !== -1) {
    // Add name display before role
    const indent = lines[roleLineIdx].match(/^(\s*)/)[1];
    const nameLine = indent + `<span style={{ fontSize: "8px", color: "#ffffff", textAlign: "center", maxWidth: "64px", wordBreak: "break-word", lineHeight: 1.2, fontWeight: 600 }}>`;
    const nameLine2 = indent + `  {name}`;
    const nameLine3 = indent + `</span>`;
    lines.splice(roleLineIdx, 0, nameLine, nameLine2, nameLine3);
    console.log('Name display added above role');
  }

  fs.writeFileSync('components/dashboard-shell.tsx', lines.join('\n'), 'utf8');
  console.log('Shell updated');
}

// ═══ FIX 2: Filter orders by agent for SALES_AGENT role ═══
{
  let c = fs.readFileSync('app/orders/page.tsx', 'utf8');
  const lines = c.split('\n');

  // Add user state reading at the top of the component
  let useEffectIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('const [orders, setOrders]') || line.includes('const [allOrders, setAllOrders]')) useEffectIdx = i;
  });

  // Find the loadData/useEffect that fetches orders
  let fetchOrdersIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes(`fetch(\`\${API_BASE_URL}/orders\``) || line.includes("fetch(`${API_BASE_URL}/orders`")) fetchOrdersIdx = i;
  });
  console.log('Fetch orders at line:', fetchOrdersIdx + 1);

  // Find where orders are stored after fetch
  let setOrdersIdx = -1;
  lines.forEach((line, i) => {
    if (i > fetchOrdersIdx && i < fetchOrdersIdx + 20 && (line.includes('setOrders(') || line.includes('setAllOrders('))) {
      if (setOrdersIdx === -1) setOrdersIdx = i;
    }
  });
  console.log('setOrders at line:', setOrdersIdx + 1);

  // Add current user reading before the fetch
  let loadFnIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('async function load') || (line.includes('const load') && line.includes('useCallback'))) loadFnIdx = i;
  });
  console.log('Load function at line:', loadFnIdx + 1);

  // Find where filter logic is applied - the 'filtered' variable
  let filteredIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('const filtered') && line.includes('orders') && i > 200) filteredIdx = i;
  });
  console.log('Filtered orders at line:', filteredIdx + 1);

  if (filteredIdx !== -1) {
    // Show lines around it
    console.log('Context:');
    for (let i = filteredIdx - 1; i <= filteredIdx + 3; i++) {
      console.log(i+1, ':', lines[i]?.trim()?.substring(0, 100));
    }
  }

  // Add agent filter - find the search/filter section
  // Find where orders are filtered by search query
  let searchFilterIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('.filter(') && line.includes('orderNo') && line.includes('toLowerCase')) searchFilterIdx = i;
  });
  console.log('Search filter at line:', searchFilterIdx + 1);

  if (searchFilterIdx !== -1) {
    const filterLine = lines[searchFilterIdx];
    const indent = filterLine.match(/^(\s*)/)[1];
    // Insert agent filter before search filter
    const agentFilter = indent + `// Filter by agent for SALES_AGENT role`;
    const agentFilter2 = indent + `const currentUser = (() => { try { const r = localStorage.getItem("rareprint_user"); return r ? JSON.parse(r) : null; } catch { return null; } })();`;
    const agentFilter3 = indent + `const agentFiltered = currentUser?.role === "SALES_AGENT" ? orders.filter(o => o.salesAgentName === currentUser.fullName) : orders;`;
    lines.splice(searchFilterIdx, 0, agentFilter, agentFilter2, agentFilter3);
    console.log('Agent filter added before search filter');

    // Now we need to replace 'orders' with 'agentFiltered' in the search filter line
    const newSearchFilterIdx = searchFilterIdx + 3;
    lines[newSearchFilterIdx] = lines[newSearchFilterIdx].replace(/\borders\b(?=\.filter)/, 'agentFiltered');
    console.log('Search filter updated to use agentFiltered');
  }

  fs.writeFileSync('app/orders/page.tsx', lines.join('\n'), 'utf8');
  console.log('Orders page updated');
}
