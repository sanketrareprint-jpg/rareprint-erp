const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');

// Processing Sheets should include COMPLETE status too
const old1 = `sheetSubTab === "created" ? (s.status === "INCOMPLETE" || s.status === "SETTING") : (s.status === "PRINTING" || s.status === "PROCESSING")`;
const new1 = `sheetSubTab === "created" ? (s.status === "INCOMPLETE" || s.status === "SETTING") : (s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "COMPLETE")`;

// Also fix the count in the sub-tab buttons
const old2 = `: sheetsData.filter(s => s.status === "PRINTING" || s.status === "PROCESSING").length`;
const new2 = `: sheetsData.filter(s => s.status === "PRINTING" || s.status === "PROCESSING" || s.status === "COMPLETE").length`;

let changed = 0;
if (c.includes(old1)) { c = c.replace(old1, new1); changed++; console.log('✓ Fixed filter'); }
else console.log('✗ Filter not found');

if (c.includes(old2)) { c = c.replace(old2, new2); changed++; console.log('✓ Fixed count'); }
else console.log('✗ Count not found');

// Also check the tab label - rename to "Processing / Complete"  
const old3 = `{ key: "processing", label: "Processing Sheets", color: "text-orange-600" }`;
const new3 = `{ key: "processing", label: "Processing & Complete", color: "text-orange-600" }`;
if (c.includes(old3)) { c = c.replace(old3, new3); changed++; console.log('✓ Fixed label'); }

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Changed:', changed, '| Size:', fs.statSync('app/production/page.tsx').size);
