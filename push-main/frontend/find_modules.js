const fs = require('fs');
const path = require('path');

const backendSrc = '../backend/src';

// Find app.module.ts
function findFile(dir, name) {
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      try {
        if (fs.statSync(full).isDirectory()) {
          const found = findFile(full, name);
          if (found) return found;
        } else if (item === name) return full;
      } catch {}
    }
  } catch {}
  return null;
}

const appModule = findFile(backendSrc, 'app.module.ts');
const productionModule = findFile(backendSrc, 'production.module.ts');

console.log('app.module.ts:', appModule);
console.log('production.module.ts:', productionModule);

if (productionModule) {
  const content = fs.readFileSync(productionModule, 'utf8');
  console.log('\nproduction.module.ts content:');
  console.log(content.substring(0, 500));
}
if (appModule) {
  const content = fs.readFileSync(appModule, 'utf8');
  console.log('\napp.module.ts first 500 chars:');
  console.log(content.substring(0, 500));
}
