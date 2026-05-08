const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// FIX 1: Reorder SHEET_STATUSES - COMPLETE on position 2
const old1 = 'const SHEET_STATUSES = ["INCOMPLETE","SETTING","PRINTING","PROCESSING","COMPLETE","DONE"];';
const new1 = 'const SHEET_STATUSES = ["INCOMPLETE","COMPLETE","SETTING","PRINTING","PROCESSING","DONE"];';
if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Fix 1: SHEET_STATUSES reordered'); }
else {
  // Try without DONE
  const old1b = 'const SHEET_STATUSES = ["INCOMPLETE","SETTING","PRINTING","PROCESSING","COMPLETE"];';
  if (c.includes(old1b)) { c = c.replace(old1b, 'const SHEET_STATUSES = ["INCOMPLETE","COMPLETE","SETTING","PRINTING","PROCESSING","DONE"];'); console.log('Fix 1b: SHEET_STATUSES reordered (no DONE before)'); }
  else console.log('Fix 1 FAILED');
}

// FIX 2: Created Sheets = INCOMPLETE + COMPLETE only
// Processing = SETTING + PRINTING + PROCESSING + DONE
// Update the filter in the sheets tab
const old2 = 'sheetSubTab === "created" ? (s.status === "INCOMPLETE" || s.status === "SETTING") : (s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "COMPLETE" || s.status === "DONE")';
const new2 = 'sheetSubTab === "created" ? (s.status === "INCOMPLETE" || s.status === "COMPLETE") : (s.status === "SETTING" || s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "DONE")';
if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Fix 2: sheet filter updated'); }
else {
  // Try older version without DONE
  const old2b = 'sheetSubTab === "created" ? (s.status === "INCOMPLETE" || s.status === "SETTING") : (s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "COMPLETE")';
  if (c.includes(old2b)) { c = c.replace(old2b, new2); console.log('Fix 2b: sheet filter updated'); }
  else console.log('Fix 2 FAILED - checking what exists...');
  const idx = c.indexOf('sheetSubTab === "created"');
  if (idx !== -1) console.log('Context:', JSON.stringify(c.slice(idx, idx+200)));
}

// FIX 3: Update the COUNT in sub-tab buttons to match new groupings
// Created count = INCOMPLETE + COMPLETE
const old3a = ': t.key === "created"\n                    ? sheetsData.filter(s => s.status === "INCOMPLETE" || s.status === "SETTING").length';
const new3a = ': t.key === "created"\n                    ? sheetsData.filter(s => s.status === "INCOMPLETE" || s.status === "COMPLETE").length';
if (c.includes(old3a)) { c = c.replace(old3a, new3a); console.log('Fix 3a: created count updated (LF)'); }
else {
  const old3acr = old3a.replace(/\n/g, '\r\n');
  if (c.includes(old3acr)) { c = c.replace(old3acr, new3a.replace(/\n/g, '\r\n')); console.log('Fix 3a: created count updated (CRLF)'); }
  else console.log('Fix 3a FAILED');
}

// Processing count = SETTING + PRINTING + PROCESSING + DONE
const old3b = ': sheetsData.filter(s => s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "COMPLETE" || s.status === "DONE").length';
const new3b = ': sheetsData.filter(s => s.status === "SETTING" || s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "DONE").length';
if (c.includes(old3b)) { c = c.replace(old3b, new3b); console.log('Fix 3b: processing count updated'); }
else {
  const old3bb = ': sheetsData.filter(s => s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "COMPLETE").length';
  if (c.includes(old3bb)) { c = c.replace(old3bb, new3b); console.log('Fix 3b alt: processing count updated'); }
  else console.log('Fix 3b FAILED');
}

// FIX 4: Update compatible sheets filter for assignment dropdown
// SETTING sheets should be assignable (they are being prepared)
const old4 = '(s.status === "INCOMPLETE" || s.status === "SETTING") &&\n                          s.gsm === itemGsm &&\n                          s.quantity <= balance';
const new4 = '(s.status === "INCOMPLETE" || s.status === "COMPLETE" || s.status === "SETTING") &&\n                          s.gsm === itemGsm &&\n                          s.quantity <= balance';
if (c.includes(old4)) { c = c.replace(old4, new4); console.log('Fix 4: assignment dropdown updated'); }
else {
  const old4cr = old4.replace(/\n/g, '\r\n');
  if (c.includes(old4cr)) { c = c.replace(old4cr, new4.replace(/\n/g, '\r\n')); console.log('Fix 4 (CRLF): assignment dropdown updated'); }
  else console.log('Fix 4 FAILED');
}

// FIX 5: Update tab labels
const old5 = '{ key: "created",    label: "Created Sheets", color: "text-cyan-700" }';
const new5 = '{ key: "created",    label: "Created Sheets", color: "text-cyan-700" }';
// Keep same label but update processing label
const old6 = '{ key: "processing", label: "Processing & Complete", color: "text-orange-600" }';
const new6 = '{ key: "processing", label: "Processing Sheets", color: "text-orange-600" }';
if (c.includes(old6)) { c = c.replace(old6, new6); console.log('Fix 5: tab label updated'); }
else {
  const old6b = '{ key: "processing", label: "Processing Sheets", color: "text-orange-600" }';
  console.log('Fix 5: processing label already correct or different');
}

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
