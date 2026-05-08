const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// FIX 1: Add DONE to SHEET_STATUSES constant
const old1 = 'const SHEET_STATUSES = ["INCOMPLETE","SETTING","PRINTING","PROCESSING","COMPLETE"];';
const new1 = 'const SHEET_STATUSES = ["INCOMPLETE","SETTING","PRINTING","PROCESSING","COMPLETE","DONE"];';
if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Fix 1: DONE added to SHEET_STATUSES'); }
else console.log('Fix 1 FAILED');

// FIX 2: Add DONE to sheetStatusColors
const old2 = 'const sheetStatusColors: Record<string, string> = { INCOMPLETE:"bg-gray-100 text-gray-600", SETTING:"bg-yellow-100 text-yellow-700", PRINTING:"bg-blue-100 text-blue-700", PROCESSING:"bg-orange-100 text-orange-700", COMPLETE:"bg-green-100 text-green-700" };';
const new2 = 'const sheetStatusColors: Record<string, string> = { INCOMPLETE:"bg-gray-100 text-gray-600", SETTING:"bg-yellow-100 text-yellow-700", PRINTING:"bg-blue-100 text-blue-700", PROCESSING:"bg-orange-100 text-orange-700", COMPLETE:"bg-green-100 text-green-700", DONE:"bg-emerald-100 text-emerald-800" };';
if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Fix 2: DONE color added'); }
else console.log('Fix 2 FAILED');

// FIX 3: Include DONE in Processing & Complete filter
const old3 = '(s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "COMPLETE")';
const new3 = '(s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "COMPLETE" || s.status === "DONE")';
let n3 = 0;
while (c.includes(old3)) { c = c.replace(old3, new3); n3++; }
console.log('Fix 3: DONE added to processing filter (' + n3 + ' places)');

// FIX 4: Preserve expandedSheet across loadAll by NOT resetting it
// The issue is loadAll triggers re-render and expandedSheet state is fine
// BUT updateSheetStatus calls loadAll which re-renders — the sheet stays in list
// The real fix: update status optimistically without collapsing
// Replace updateSheetStatus to preserve expandedSheet
const old4 = '  async function updateSheetStatus(sheetId: string, status: string) {\r\n    await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/status`, {\r\n      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },\r\n      body: JSON.stringify({ status }),\r\n    });\r\n    await loadAll();\r\n  }';
const old4lf = '  async function updateSheetStatus(sheetId: string, status: string) {\n    await fetch(`${API_BASE_URL}/production/sheets/${sheetId}/status`, {\n      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },\n      body: JSON.stringify({ status }),\n    });\n    await loadAll();\n  }';

const new4 = `  async function updateSheetStatus(sheetId: string, status: string) {
    const prevExpanded = expandedSheet;
    await fetch(\`\${API_BASE_URL}/production/sheets/\${sheetId}/status\`, {
      method: "PATCH", headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadAll();
    setExpandedSheet(prevExpanded);
  }`;

if (c.includes(old4)) { c = c.replace(old4, new4); console.log('Fix 4: updateSheetStatus preserves expanded (CRLF)'); }
else if (c.includes(old4lf)) { c = c.replace(old4lf, new4); console.log('Fix 4: updateSheetStatus preserves expanded (LF)'); }
else {
  // Try finding it differently
  const idx = c.indexOf('async function updateSheetStatus');
  if (idx !== -1) {
    const end = c.indexOf('\n  }', idx) + 4;
    const existing = c.slice(idx-2, end);
    console.log('Fix 4: Could not match exactly. Existing:', JSON.stringify(existing.substring(0, 200)));
  } else console.log('Fix 4 FAILED: function not found');
}

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
