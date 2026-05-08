const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');
console.log('Size before:', c.length);

// FIX 1: Unassigned dropdown - only show sheets where sheet.quantity <= balanceQty
const old1 = '                        // Find compatible sheets (same GSM, has space)\n                        const itemGsm = notes.gsm ? parseInt(notes.gsm) : 0;\n                        const compatibleSheets = sheetsData.filter(s =>\n                          (s.status === "INCOMPLETE" || s.status === "SETTING") && s.gsm === itemGsm\n                        );';
const new1 = '                        // Find compatible sheets (same GSM, has space, sheetQty <= balanceQty)\n                        const itemGsm = notes.gsm ? parseInt(notes.gsm) : 0;\n                        const compatibleSheets = sheetsData.filter(s =>\n                          (s.status === "INCOMPLETE" || s.status === "SETTING") &&\n                          s.gsm === itemGsm &&\n                          s.quantity <= balance\n                        );';

if (c.includes(old1)) { c = c.replace(old1, new1); console.log('Fix 1 done: dropdown filter'); }
else { console.log('Fix 1 not found - checking CRLF version');
  const old1cr = old1.replace(/\n/g, '\r\n');
  if (c.includes(old1cr)) { c = c.replace(old1cr, new1.replace(/\n/g, '\r\n')); console.log('Fix 1 done (CRLF)'); }
  else console.log('Fix 1 FAILED'); }

// FIX 2: openMultipleDialog - block if sheetQty > balanceQty
const old2 = 'if (balanceQty <= 0) { alert("This item is already fully assigned"); return; }\n    const effectiveMax';
const new2 = 'if (balanceQty <= 0) { alert("This item is already fully assigned"); return; }\n    if (sheet.quantity > balanceQty) {\n      alert("Cannot assign: Sheet quantity (" + sheet.quantity + ") exceeds remaining balance (" + balanceQty + "). This would waste " + (sheet.quantity - balanceQty) + " extra prints.");\n      return;\n    }\n    const effectiveMax';

if (c.includes(old2)) { c = c.replace(old2, new2); console.log('Fix 2 done: openMultipleDialog guard'); }
else {
  const old2cr = old2.replace(/\n/g, '\r\n');
  if (c.includes(old2cr)) { c = c.replace(old2cr, new2.replace(/\n/g, '\r\n')); console.log('Fix 2 done (CRLF)'); }
  else console.log('Fix 2 FAILED');
}

// FIX 3: canPlace - also check sheet.quantity <= balanceQty
const old3 = 'const canPlace = maxMultiple > 0 && balanceQty > 0;';
const new3 = 'const canPlace = maxMultiple > 0 && balanceQty > 0 && sheet.quantity <= balanceQty;';
let n3 = 0;
while (c.includes(old3)) { c = c.replace(old3, new3); n3++; }
console.log('Fix 3 done: canPlace updated ' + n3 + ' times');

// FIX 4: Show warning when sheet.quantity > balanceQty in place items
const old4 = '                                          <span className="text-cyan-700 font-semibold">Balance: {balanceQty} \xb7 Max: {maxMultiple}x</span>';
const new4 = '                                          {sheet.quantity > balanceQty ? (\n                                            <span className="text-red-500 font-semibold text-xs">Sheet {sheet.quantity} &gt; Balance {balanceQty} \u2014 skip</span>\n                                          ) : (\n                                            <span className="text-cyan-700 font-semibold">Balance: {balanceQty} \xb7 Max: {maxMultiple}x</span>\n                                          )}';

if (c.includes(old4)) { c = c.replace(old4, new4); console.log('Fix 4 done: warning label'); }
else {
  const old4cr = old4.replace(/\n/g, '\r\n');
  if (c.includes(old4cr)) { c = c.replace(old4cr, new4.replace(/\n/g, '\r\n')); console.log('Fix 4 done (CRLF)'); }
  else console.log('Fix 4 FAILED');
}

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
