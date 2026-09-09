const fs = require('fs');
const path = require('path');

const moduleFile = path.join('..', 'backend', 'src', 'app.module.ts');
let c = fs.readFileSync(moduleFile, 'utf8');

// Add import if not present
if (!c.includes('AdminDbController')) {
  c = c.replace(
    "import { PrismaService } from './prisma/prisma.service';",
    "import { PrismaService } from './prisma/prisma.service';\nimport { AdminDbController } from './admin-db.controller';"
  );
  console.log('Import added');
} else {
  console.log('Import already present');
}

// Add to controllers array
if (!c.includes('AdminDbController') || !c.includes('controllers: [AppController')) {
  c = c.replace(
    'controllers: [AppController],',
    'controllers: [AppController, AdminDbController],'
  );
  console.log('Controller registered');
} else if (c.includes('controllers: [AppController, AdminDbController]')) {
  console.log('Controller already registered');
} else {
  c = c.replace(
    'controllers: [AppController]',
    'controllers: [AppController, AdminDbController]'
  );
  console.log('Controller registered (no trailing comma)');
}

fs.writeFileSync(moduleFile, c, 'utf8');
console.log('Done! app.module.ts updated.');

// Verify
const check = fs.readFileSync(moduleFile, 'utf8');
console.log('AdminDbController in file:', check.includes('AdminDbController'));
