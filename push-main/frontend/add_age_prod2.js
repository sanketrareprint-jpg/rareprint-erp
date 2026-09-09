const fs = require('fs');

// ═══ FIX 1: ORDERS - increase customer width back to 100px ═══
{
  let c = fs.readFileSync('app/orders/page.tsx', 'utf8');
  const lines = c.split('\n');
  lines[472] = lines[472].replace('maxWidth: "60px"', 'maxWidth: "100px"');
  fs.writeFileSync('app/orders/page.tsx', lines.join('\n'), 'utf8');
  console.log('Orders: customer width restored to 100px');
}

// ═══ FIX 2: PRODUCTION - add age to ALL sub-tabs ═══
{
  let c = fs.readFileSync('app/production/page.tsx', 'utf8');
  const lines = c.split('\n');
  let changes = 0;

  lines.forEach((line, i) => {

    // ── Unassigned tab (card layout) - add age badge after orderNo span ──
    if (line.includes('{o.orderNo}</span>') && line.includes('font-bold text-blue-700 text-sm')) {
      // Insert age badge on next line
      const indent = line.match(/^(\s*)/)[1];
      lines.splice(i + 1, 0, indent + `<span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(o.orderDate)}\`}>{orderAge(o.orderDate)}</span>\r`);
      changes++; console.log('Added age to Unassigned card at line', i+1);
    }

    // ── Clubbing table - add Age header after Order header ──
    if (line.includes('>Order</th>') && lines[i+1] && lines[i+1].includes('>Customer</th>') && line.includes('text-left')) {
      const ageTh = line.replace('>Order</th>', '>Age</th>');
      lines.splice(i + 1, 0, ageTh);
      changes++; console.log('Added Age header to table at line', i+1);
    }

    // ── Clubbing table rows - add age TD after orderNo TD ──
    if (line.includes('{item.orderNo}</td>') && line.includes('text-blue-700 whitespace-nowrap')) {
      const indent = line.match(/^(\s*)/)[1];
      const ageTd = indent + `<td className="px-3 py-2 whitespace-nowrap"><span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(item.orderDate || '')}\`}>{orderAge(item.orderDate || '')}</span></td>\r`;
      lines.splice(i + 1, 0, ageTd);
      changes++; console.log('Added age TD to clubbing row at line', i+1);
    }

    // ── Sheets Unassigned table - add Age header after Order header ──
    if (line.includes('>Order</th>') && lines[i+1] && lines[i+1].includes('>Customer</th>') && !line.includes('text-left')) {
      const ageTh = line.replace('>Order</th>', '>Age</th>');
      lines.splice(i + 1, 0, ageTh);
      changes++; console.log('Added Age header to sheets unassigned at line', i+1);
    }

    // ── Sheets Unassigned rows - add age after orderNo TD ──
    if (line.includes('{item.orderNo}</td>') && line.includes('text-blue-700"')) {
      const indent = line.match(/^(\s*)/)[1];
      const ageTd = indent + `<td className="px-3 py-2 whitespace-nowrap"><span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(item.orderDate || '')}\`}>{orderAge(item.orderDate || '')}</span></td>\r`;
      lines.splice(i + 1, 0, ageTd);
      changes++; console.log('Added age TD to sheets unassigned row at line', i+1);
    }

    // ── Processing Orders table - add Age header ──
    if (line.includes('>Order</th>') && lines[i+2] && lines[i+2].includes('>Customer</th>')) {
      const ageTh = line.replace('>Order</th>', '>Age</th>');
      lines.splice(i + 1, 0, ageTh);
      changes++; console.log('Added Age header to processing orders at line', i+1);
    }

    // ── Processing Orders rows - add age after orderNo TD ──
    if (line.includes('{si.orderItem.order.orderNumber}</td>') && line.includes('text-blue-700')) {
      const indent = line.match(/^(\s*)/)[1];
      const ageTd = indent + `<td className="px-3 py-2 whitespace-nowrap"><span className="rounded-full px-1.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600">—</span></td>\r`;
      lines.splice(i + 1, 0, ageTd);
      changes++; console.log('Added age TD to processing orders row at line', i+1);
    }

  });

  // Also fix: item.orderDate may not exist on clubbing items - use o.orderDate
  // The clubbing allItems are mapped with orderDate from o
  // Check if orderDate is in the mapped object
  const content = lines.join('\n');
  
  // Fix clubbing map to include orderDate
  const old1 = `.map(i => ({ ...i, orderNo: o.orderNo, customerName: o.customerName, salesAgentName: o.salesAgentName, orderId: o.id }))`;
  const new1 = `.map(i => ({ ...i, orderNo: o.orderNo, customerName: o.customerName, salesAgentName: o.salesAgentName, orderId: o.id, orderDate: o.orderDate }))`;
  const fixed1 = content.includes(old1);
  const newContent = fixed1 ? content.replace(old1, new1) : content;
  if (fixed1) console.log('Fixed clubbing orderDate mapping');

  // Fix sheets unassigned map to include orderDate
  const old2 = `.map(i => ({ ...i, orderNo: o.orderNo, customerName: o.customerName }))`;
  const new2 = `.map(i => ({ ...i, orderNo: o.orderNo, customerName: o.customerName, orderDate: o.orderDate }))`;
  const finalContent = newContent.includes(old2) ? newContent.replace(old2, new2) : newContent;
  if (newContent.includes(old2)) console.log('Fixed sheets unassigned orderDate mapping');

  fs.writeFileSync('app/production/page.tsx', finalContent, 'utf8');
  console.log('Production: ' + changes + ' age additions made, size:', fs.statSync('app/production/page.tsx').size);
}
