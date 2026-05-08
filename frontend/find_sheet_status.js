const fs = require('fs');
const path = require('path');

// Find the file that handles sheet status updates
const backendBase = '../backend/src';

function findFiles(dir, pattern) {
  const results = [];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const full = path.join(dir, item);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) results.push(...findFiles(full, pattern));
        else if (item.match(pattern)) results.push(full);
      } catch {}
    }
  } catch {}
  return results;
}

const tsFiles = findFiles(backendBase, /\.(ts)$/);
console.log('Found', tsFiles.length, 'TS files');

// Find files that contain updateSheetStatus or sheet status logic
tsFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('updateSheetStatus') || content.includes('PrintSheet') && content.includes('status')) {
    console.log('\nFile:', f);
    // Show relevant lines
    content.split('\n').forEach((line, i) => {
      if (line.includes('updateSheetStatus') || line.includes('sheet.status') || line.includes('PrintSheet') && line.includes('update')) {
        console.log('  Line', i+1, ':', line.trim().substring(0, 100));
      }
    });
  }
});
