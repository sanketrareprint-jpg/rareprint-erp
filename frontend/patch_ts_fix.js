const fs = require("fs");
const path = "app/production/page.tsx";

let content = fs.readFileSync(path, "utf8");

content = content.replace(
  `const getItemVendor = (orderItemId) => processingItemVendors[orderItemId] || "";`,
  `const getItemVendor = (orderItemId: string) => processingItemVendors[orderItemId] || "";`
);

content = content.replace(
  `const saveItemVendor = (orderItemId, vendorId) => {`,
  `const saveItemVendor = (orderItemId: string, vendorId: string) => {`
);

fs.writeFileSync(path, content, "utf8");
console.log("✅ Fixed: added string types to getItemVendor and saveItemVendor parameters");
