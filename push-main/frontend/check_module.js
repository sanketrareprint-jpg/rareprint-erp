const fs = require('fs');
const path = require('path');

const appModulePath = path.join('..', 'backend', 'src', 'app.module.ts');
let c = fs.readFileSync(appModulePath, 'utf8');
console.log('app.module.ts content:');
console.log(c);
