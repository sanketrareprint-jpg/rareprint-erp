const fs = require('fs');
const file = 'backend/src/admin-db.controller.ts';
let content = fs.readFileSync(file, 'utf8');
console.log('File loaded, length:', content.length);
console.log('Contains isNaN:', content.includes('isNaN'));

const regex = /\} else if \(typeof v === 'string' && v !== '' && !isNaN\(Number\(v\)\) && v\.trim\(\) !== ''\) \{\s*\n\s*cleaned\[k\] = Number\(v\);/g;

const newCode = "} else if (typeof v === 'string' && v !== '' && /^[\\d\\s\\+\\-\\*\\/\\.]+$/.test(v.trim())) {\n        try { cleaned[k] = Function('\"use strict\"; return (' + v.trim() + ')')(); }\n        catch { cleaned[k] = v; }";

content = content.replace(regex, newCode);
fs.writeFileSync(file, content, 'utf8');
console.log('Fix applied successfully!');
