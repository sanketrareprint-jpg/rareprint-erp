const fs = require('fs');
const c = fs.readFileSync('app/production/page.tsx', 'utf8');
const lines = c.split('\n');

// Find all API calls related to sheets
lines.forEach((line, i) => {
  if (line.includes('stage-vendors') || line.includes('stageVendor') || 
      line.includes('addStageVendor') || line.includes('SHEET_STAGES') ||
      line.includes('updateSheetStatus')) {
    console.log((i+1) + ': ' + line.trim().substring(0, 120));
  }
});
