const fs = require('fs');
let c = fs.readFileSync('app/production/page.tsx', 'utf8');

const before = (c.match(/multipleDialog/g) || []).length;
console.log('multipleDialog occurrences before:', before);

// Remove the duplicate TypeScript-typed useState declaration
// It appears as the FIRST declaration (from patch1) - find and remove it
const marker = '  // Multiple dialog state for sheet placement';
const idx = c.indexOf(marker);
if (idx !== -1) {
  // Find end of this block (next blank line after the useState lines)
  const endIdx = c.indexOf('\n\n', idx);
  if (endIdx !== -1) {
    c = c.slice(0, idx) + c.slice(endIdx + 1);
    console.log('Removed duplicate block');
  }
} else {
  console.log('Marker not found - checking for React.useState version');
  // patch1 used React.useState
  const marker2 = '  // Sheet sub-tabs\r\n  const [sheetSubTab, setSheetSubTab] = React.useState("unassigned");\r\n  const [multipleDialog, setMultipleDialog] = React.useState(null);\r\n  const [multipleValue, setMultipleValue] = React.useState("1");';
  if (c.includes(marker2)) {
    c = c.replace(marker2, '  // Sheet sub-tabs\r\n  const [sheetSubTab, setSheetSubTab] = React.useState("unassigned");');
    console.log('Removed duplicate React.useState block');
  } else {
    console.log('Could not find duplicate - listing all multipleDialog lines:');
    c.split('\n').forEach((line, i) => {
      if (line.includes('multipleDialog')) console.log(i+1, ':', line.trim());
    });
  }
}

const after = (c.match(/multipleDialog/g) || []).length;
console.log('multipleDialog occurrences after:', after);

fs.writeFileSync('app/production/page.tsx', c, 'utf8');
console.log('Done, size:', fs.statSync('app/production/page.tsx').size);
