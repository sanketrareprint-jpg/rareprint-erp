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

const noSheetsStart = source.indexOf("compatibleSheets.length === 0 ? (");
const selectableStart = source.indexOf('<option value="">Select sheet...</option>', noSheetsStart);
if (noSheetsStart === -1 || selectableStart === -1) {
  fail("could not locate Sheets unassigned table branches");
}

const noSheetsBranch = source.slice(noSheetsStart, selectableStart);
if (!noSheetsBranch.includes("unassignItemFromSheets(item.id)")) {
  fail("no-sheet state lost its unassign action");
}

const selectableBranch = source.slice(selectableStart, selectableStart + 2500);
if (!selectableBranch.includes('<Plus className="h-3 w-3" /> Assign')) {
  fail("selectable-sheet state lost its assign action");
}

if (!selectableBranch.includes("unassignItemFromSheets(item.id)")) {
  fail("selectable-sheet state lost its unassign action");
}

console.log("Production sheets unassign guard passed.");
