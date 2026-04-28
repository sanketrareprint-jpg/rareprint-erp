const fs = require('fs');
let c = fs.readFileSync('app/orders/page.tsx', 'utf8');
const lines = c.split('\n');
console.log('Size before:', c.length);

// STEP 1: Add orderJourneys state and toggleJourney function
// Find existing state declarations
let expandedPaymentsLine = -1;
lines.forEach((line, i) => {
  if (line.includes('expandedPayments') && line.includes('useState')) expandedPaymentsLine = i;
});
console.log('expandedPayments state at line:', expandedPaymentsLine + 1);

if (expandedPaymentsLine !== -1) {
  const indent = lines[expandedPaymentsLine].match(/^(\s*)/)[1];
  const newState = [
    indent + `const [expandedJourney, setExpandedJourney] = useState<string | null>(null);\r`,
    indent + `const [orderJourneys, setOrderJourneys] = useState<Record<string, any[]>>({});\r`,
  ];
  lines.splice(expandedPaymentsLine + 1, 0, ...newState);
  console.log('Journey state added');
}

// STEP 2: Add toggleJourney function near togglePayments
let togglePaymentsLine = -1;
lines.forEach((line, i) => {
  if (line.includes('async function togglePayments') || line.includes('function togglePayments')) togglePaymentsLine = i;
});
console.log('togglePayments at line:', togglePaymentsLine + 1);

if (togglePaymentsLine !== -1) {
  // Find end of togglePayments function
  let endLine = togglePaymentsLine;
  let braces = 0;
  for (let i = togglePaymentsLine; i < togglePaymentsLine + 20; i++) {
    if (!lines[i]) continue;
    braces += (lines[i].match(/{/g)||[]).length;
    braces -= (lines[i].match(/}/g)||[]).length;
    if (braces === 0 && i > togglePaymentsLine) { endLine = i; break; }
  }
  const indent = lines[togglePaymentsLine].match(/^(\s*)/)[1];
  const journeyFn = [
    ``,
    indent + `async function toggleJourney(orderId: string) {\r`,
    indent + `  if (expandedJourney === orderId) { setExpandedJourney(null); return; }\r`,
    indent + `  setExpandedJourney(orderId);\r`,
    indent + `  if (orderJourneys[orderId]) return;\r`,
    indent + `  const res = await fetch(\`\${API_BASE_URL}/orders/\${orderId}/status-logs\`, { headers: getAuthHeaders() });\r`,
    indent + `  const data = res.ok ? await res.json() : [];\r`,
    indent + `  setOrderJourneys(p => ({ ...p, [orderId]: data }));\r`,
    indent + `}\r`,
  ];
  lines.splice(endLine + 1, 0, ...journeyFn);
  console.log('toggleJourney function added after line:', endLine + 1);
}

// STEP 3: Add Journey button next to Hist button
let histBtnLine = -1;
lines.forEach((line, i) => {
  if (line.includes('togglePayments(o.id)') && line.includes('onClick')) histBtnLine = i;
});
console.log('Hist button at line:', histBtnLine + 1);

if (histBtnLine !== -1) {
  // Find the closing </button> of Hist button
  let closeLine = histBtnLine;
  for (let i = histBtnLine; i < histBtnLine + 8; i++) {
    if (lines[i] && lines[i].includes('</button>') && lines[i].includes('Hist')) { closeLine = i; break; }
    if (lines[i] && lines[i].includes('Hist')) { closeLine = i; break; }
  }
  // Find closing </button> tag
  for (let i = closeLine; i < closeLine + 5; i++) {
    if (lines[i] && lines[i].includes('</button>')) { closeLine = i; break; }
  }
  const indent = lines[closeLine].match(/^(\s*)/)[1];
  const journeyBtn = [
    indent + `{/* Journey */}\r`,
    indent + `<button onClick={() => toggleJourney(o.id)}\r`,
    indent + `  className="inline-flex items-center gap-0.5 rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100">\r`,
    indent + `  {expandedJourney === o.id ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}\r`,
    indent + `  Journey\r`,
    indent + `</button>\r`,
  ];
  lines.splice(closeLine + 1, 0, ...journeyBtn);
  console.log('Journey button added after Hist button');
}

// STEP 4: Add Journey row after payment history row
// Find the closing of payment history row
let payHistEndLine = -1;
lines.forEach((line, i) => {
  if (line.includes('expandedPayments === o.id') && line.includes('&&')) payHistEndLine = i;
});
console.log('Payment history section at line:', payHistEndLine + 1);

if (payHistEndLine !== -1) {
  // Find the closing </tr></React.Fragment> after payment history
  let fragEndLine = payHistEndLine;
  for (let i = payHistEndLine; i < payHistEndLine + 60; i++) {
    if (lines[i] && lines[i].includes('</React.Fragment>')) { fragEndLine = i; break; }
  }
  const indent = '                        ';
  const statusColors = {
    PENDING_APPROVAL: 'bg-yellow-100 text-yellow-700',
    APPROVED: 'bg-green-100 text-green-700',
    IN_PRODUCTION: 'bg-blue-100 text-blue-700',
    PENDING_DISPATCH_APPROVAL: 'bg-orange-100 text-orange-700',
    DISPATCHED: 'bg-emerald-100 text-emerald-700',
    CANCELLED: 'bg-red-100 text-red-700',
  };

  const journeyRow = [
    ``,
    indent + `{/* Order Journey row */}\r`,
    indent + `{expandedJourney === o.id && (\r`,
    indent + `  <tr>\r`,
    indent + `    <td colSpan={13} className="bg-blue-50 px-6 py-3 border-t border-blue-100">\r`,
    indent + `      <p className="text-xs font-semibold text-blue-800 mb-2">Order Journey</p>\r`,
    indent + `      {!orderJourneys[o.id] ? <Loader2 className="h-4 w-4 animate-spin text-blue-500" />\r`,
    indent + `        : orderJourneys[o.id].length === 0 ? <p className="text-xs text-slate-400">No status changes recorded.</p>\r`,
    indent + `        : (\r`,
    indent + `          <div className="flex flex-col gap-1">\r`,
    indent + `            {orderJourneys[o.id].map((log: any, idx: number) => (\r`,
    indent + `              <div key={log.id} className="flex items-center gap-2 text-xs">\r`,
    indent + `                <span className="text-slate-400 whitespace-nowrap">{new Date(log.changedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>\r`,
    indent + `                <span className="rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5 font-medium">{log.fromStatus?.replace(/_/g,' ') ?? '—'}</span>\r`,
    indent + `                <span className="text-slate-400">→</span>\r`,
    indent + `                <span className="rounded-full bg-blue-100 text-blue-700 px-1.5 py-0.5 font-semibold">{log.toStatus?.replace(/_/g,' ')}</span>\r`,
    indent + `                <span className="text-slate-500">by <strong>{log.changedBy}</strong></span>\r`,
    indent + `                {log.reason && <span className="text-slate-400 italic truncate max-w-xs">{log.reason}</span>}\r`,
    indent + `              </div>\r`,
    indent + `            ))}\r`,
    indent + `          </div>\r`,
    indent + `        )}\r`,
    indent + `    </td>\r`,
    indent + `  </tr>\r`,
    indent + `)}\r`,
  ];
  lines.splice(fragEndLine, 0, ...journeyRow);
  console.log('Journey row added before React.Fragment close');
}

fs.writeFileSync('app/orders/page.tsx', lines.join('\n'), 'utf8');
console.log('Done, size:', fs.statSync('app/orders/page.tsx').size);
