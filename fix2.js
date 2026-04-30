const fs = require('fs');
const file = 'backend/src/admin-db.controller.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replaceAll(
  	ry { cleaned[k] = Function('"use strict"; return (' + v.trim() + ')')(); },
  	ry { cleaned[k] = eval(v.trim()); }
);

fs.writeFileSync(file, content, 'utf8');
console.log('Done:', (content.match(/eval/g) || []).length, 'replacements');
