const fs = require("fs");
const path = require("path");

const pagePath = path.join(__dirname, "..", "app", "production", "page.tsx");
const source = fs.readFileSync(pagePath, "utf8");

function fail(message) {
  console.error(`Production sheets guard failed: ${message}`);
  process.exit(1);
}

if (!source.includes("async function unassignItemFromSheets(itemId: string)")) {
  fail("missing shared unassignItemFromSheets helper");
}

if (!source.includes("production/items/${itemId}/assign-category")) {
  fail("shared helper no longer calls the assign-category API");
}

const unassignButtonCount = (source.match(/aria-label="Unassign from Sheets"/g) || []).length;
if (unassignButtonCount < 4) {
  fail("Sheets unassigned views must show unassign control in both no-sheet and selectable-sheet states");
}

const helperCallCount = (source.match(/unassignItemFromSheets\(item\.id\)/g) || []).length;
if (helperCallCount < 4) {
  fail("Sheets unassigned views must call the shared unassign action in both layouts and both sheet states");
}

console.log("Production sheets unassign guard passed.");
