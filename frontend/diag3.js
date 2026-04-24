const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find the "Items on sheet" section
lines.forEach((line, i) => {
  if (line.includes('Items on sheet') || line.includes('items on sheet') || 
      line.includes('si.orderItem.product.name') || 
      line.includes('sheetAssignments') ||
      line.includes('orderItem.product.sizeInches') ||
      (line.includes('removeSheetItem') && line.includes('Trash2'))) {
    console.log(`${i+1}: ${JSON.stringify(line.trim().substring(0, 100))}`);
  }
});
