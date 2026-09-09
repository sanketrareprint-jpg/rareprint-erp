const fs = require('fs');

function orderAgeHelper() {
  return `function orderAge(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return days + ' days';
}
function ageColor(dateStr) {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days <= 3) return 'bg-green-50 text-green-700';
  if (days <= 7) return 'bg-yellow-50 text-yellow-700';
  return 'bg-red-50 text-red-700';
}
`;
}

// ═══════════════════════════════════════════════════════
// PATCH 1: ORDERS PAGE
// ═══════════════════════════════════════════════════════
{
  let c = fs.readFileSync('app/orders/page.tsx', 'utf8');
  const eol = c.includes('\r\n') ? '\r\n' : '\n';
  console.log('=== ORDERS ===');

  // The header lines use CRLF - find exact index and splice
  const lines = c.split('\n');

  // Find the Date th line
  let dateHeaderIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('>Date</th>') && line.includes('style={TH}')) dateHeaderIdx = i;
  });
  console.log('Date header at line:', dateHeaderIdx + 1);

  if (dateHeaderIdx !== -1) {
    // Insert Age header after Date header
    const ageTh = lines[dateHeaderIdx].replace('>Date</th>', '>Age</th>');
    lines.splice(dateHeaderIdx + 1, 0, ageTh);
    console.log('Age header inserted in orders');
  }

  // Find the Date TD line
  let dateTdIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('new Date(o.date).toLocaleDateString') && line.includes('day: "2-digit"')) dateTdIdx = i;
  });
  console.log('Date TD at line:', dateTdIdx + 1);

  if (dateTdIdx !== -1) {
    // Find the closing </td> after date
    let closeTdIdx = dateTdIdx;
    for (let i = dateTdIdx; i < dateTdIdx + 5; i++) {
      if (lines[i] && lines[i].includes('</td>')) { closeTdIdx = i; break; }
    }
    // Insert Age TD after the closing </td>
    const indent = lines[closeTdIdx].match(/^(\s*)/)[1];
    const ageTd = indent + `<td className="px-2 py-1.5 align-top whitespace-nowrap">\r`;
    const ageTd2 = indent + `  <span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(o.date)}\`}>{orderAge(o.date)}</span>\r`;
    const ageTd3 = indent + `</td>\r`;
    lines.splice(closeTdIdx + 1, 0, ageTd, ageTd2, ageTd3);
    console.log('Age TD inserted in orders');
  }

  // Add helper function before export default
  let exportIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('export default function OrdersPage') && !line.includes('//')) exportIdx = i;
  });
  if (exportIdx !== -1 && !c.includes('function orderAge')) {
    const helperLines = orderAgeHelper().split('\n').map(l => l + '\r');
    lines.splice(exportIdx, 0, ...helperLines);
    console.log('Helper added to orders');
  }

  fs.writeFileSync('app/orders/page.tsx', lines.join('\n'), 'utf8');
  console.log('Orders done, size:', fs.statSync('app/orders/page.tsx').size);
}

// ═══════════════════════════════════════════════════════
// PATCH 2: PRODUCTION PAGE
// ═══════════════════════════════════════════════════════
{
  let c = fs.readFileSync('app/production/page.tsx', 'utf8');
  console.log('\n=== PRODUCTION ===');
  const lines = c.split('\n');

  // Find Order header in inhouse/all table (line 630 area)
  let orderThIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('>Order</th>') && i > 600 && i < 700) orderThIdx = i;
  });
  console.log('Order header at line:', orderThIdx + 1);

  if (orderThIdx !== -1) {
    const ageTh = lines[orderThIdx].replace('>Order</th>', '>Age</th>');
    lines.splice(orderThIdx + 1, 0, ageTh);
    console.log('Age header inserted in production');
  }

  // Find Order TD - the isFirstInOrder cell with orderNo
  let orderTdIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('isFirstInOrder') && line.includes('orderNo') && line.includes('font-bold text-blue-700') && i > 600) orderTdIdx = i;
  });
  console.log('Order TD at line:', orderTdIdx + 1);

  if (orderTdIdx !== -1) {
    // Find closing </td>
    let closeTdIdx = orderTdIdx;
    for (let i = orderTdIdx; i < orderTdIdx + 5; i++) {
      if (lines[i] && lines[i].includes('</td>')) { closeTdIdx = i; break; }
    }
    const indent = lines[closeTdIdx].match(/^(\s*)/)[1];
    const ageTd = indent + `<td className="px-3 py-1.5 whitespace-nowrap">{item.isFirstInOrder && <span className={\`rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(item.orderDate)}\`}>{orderAge(item.orderDate)}</span>}</td>\r`;
    lines.splice(closeTdIdx + 1, 0, ageTd);
    console.log('Age TD inserted in production');
  }

  // Add helper if not present
  let exportIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('export default function ProductionPage') && !line.includes('//')) exportIdx = i;
  });
  if (exportIdx !== -1 && !c.includes('function orderAge')) {
    const helperLines = orderAgeHelper().split('\n').map(l => l + '\r');
    lines.splice(exportIdx, 0, ...helperLines);
    console.log('Helper added to production');
  }

  fs.writeFileSync('app/production/page.tsx', lines.join('\n'), 'utf8');
  console.log('Production done, size:', fs.statSync('app/production/page.tsx').size);
}

// ═══════════════════════════════════════════════════════
// PATCH 3: ACCOUNTS PAGE
// ═══════════════════════════════════════════════════════
{
  let c = fs.readFileSync('app/accounts/page.tsx', 'utf8');
  console.log('\n=== ACCOUNTS ===');
  const lines = c.split('\n');

  // Accounts uses card layout - find where orderNo and date are shown
  // Add age badge next to the date
  let dateLineIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('new Date(o.orderDate).toLocaleDateString') && line.includes('day: "2-digit"')) {
      if (dateLineIdx === -1) dateLineIdx = i; // first occurrence
    }
  });
  console.log('Date line in accounts at:', dateLineIdx + 1);

  if (dateLineIdx !== -1) {
    // Find the closing </p> of this date line
    let closePIdx = dateLineIdx;
    for (let i = dateLineIdx; i < dateLineIdx + 5; i++) {
      if (lines[i] && lines[i].includes('</p>')) { closePIdx = i; break; }
    }
    const indent = lines[closePIdx].match(/^(\s*)/)[1];
    // Insert age badge after date p tag
    const ageBadge = indent + `<span className={\`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(o.orderDate)}\`}>{orderAge(o.orderDate)}</span>\r`;
    lines.splice(closePIdx + 1, 0, ageBadge);
    console.log('Age badge inserted in accounts (first occurrence)');

    // Also find second occurrence (there are 2 order cards - pending + approved)
    let dateLineIdx2 = -1;
    lines.forEach((line, i) => {
      if (i > dateLineIdx + 5 && line.includes('new Date(o.orderDate).toLocaleDateString') && line.includes('day: "2-digit"')) {
        if (dateLineIdx2 === -1) dateLineIdx2 = i;
      }
    });
    if (dateLineIdx2 !== -1) {
      let closePIdx2 = dateLineIdx2;
      for (let i = dateLineIdx2; i < dateLineIdx2 + 5; i++) {
        if (lines[i] && lines[i].includes('</p>')) { closePIdx2 = i; break; }
      }
      const indent2 = lines[closePIdx2].match(/^(\s*)/)[1];
      const ageBadge2 = indent2 + `<span className={\`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(o.orderDate)}\`}>{orderAge(o.orderDate)}</span>\r`;
      lines.splice(closePIdx2 + 1, 0, ageBadge2);
      console.log('Age badge inserted in accounts (second occurrence)');
    }
  }

  // Add helper
  let exportIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('export default function') && line.includes('Accounts') && !line.includes('//')) exportIdx = i;
  });
  if (exportIdx !== -1) {
    const helperLines = orderAgeHelper().split('\n').map(l => l + '\r');
    lines.splice(exportIdx, 0, ...helperLines);
    console.log('Helper added to accounts');
  }

  fs.writeFileSync('app/accounts/page.tsx', lines.join('\n'), 'utf8');
  console.log('Accounts done, size:', fs.statSync('app/accounts/page.tsx').size);
}

// ═══════════════════════════════════════════════════════
// PATCH 4: DISPATCH PAGE
// ═══════════════════════════════════════════════════════
{
  let c = fs.readFileSync('app/dispatch/page.tsx', 'utf8');
  console.log('\n=== DISPATCH ===');
  const lines = c.split('\n');

  // Dispatch uses card layout - find orderNo line and add age next to it
  let orderNoIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('{o.orderNo}') && line.includes('font-bold text-slate-900')) orderNoIdx = i;
  });
  console.log('OrderNo line in dispatch at:', orderNoIdx + 1);

  if (orderNoIdx !== -1) {
    // Find closing </p>
    let closePIdx = orderNoIdx;
    for (let i = orderNoIdx; i < orderNoIdx + 3; i++) {
      if (lines[i] && lines[i].includes('</p>')) { closePIdx = i; break; }
    }
    const indent = lines[closePIdx].match(/^(\s*)/)[1];
    const ageBadge = indent + `<span className={\`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-xs font-semibold \${ageColor(o.orderDate)}\`}>{orderAge(o.orderDate)}</span>\r`;
    lines.splice(closePIdx + 1, 0, ageBadge);
    console.log('Age badge inserted in dispatch');
  }

  // Add helper
  let exportIdx = -1;
  lines.forEach((line, i) => {
    if (line.includes('export default function') && line.includes('Dispatch') && !line.includes('//')) exportIdx = i;
  });
  if (exportIdx !== -1) {
    const helperLines = orderAgeHelper().split('\n').map(l => l + '\r');
    lines.splice(exportIdx, 0, ...helperLines);
    console.log('Helper added to dispatch');
  }

  fs.writeFileSync('app/dispatch/page.tsx', lines.join('\n'), 'utf8');
  console.log('Dispatch done, size:', fs.statSync('app/dispatch/page.tsx').size);
}

console.log('\n✓ All 4 modules patched!');
