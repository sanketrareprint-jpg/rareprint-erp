// Builds the Capacitor/Android static export.
//
// The `app/web-to-print` tree is the public customer storefront (cart,
// checkout, product search, account, etc.) — a fully server-rendered
// section of the site that isn't part of the internal staff ERP the
// Android app wraps. It uses features (searchParams, cookies, dynamic
// rendering) that Next.js's static export ("output: export") can't
// support, and fixing every page in it one at a time to be
// static-export-compatible isn't worth it since none of it ships in the
// Android app anyway.
//
// So: temporarily move that folder out of `app/` for the duration of the
// static export build, then always move it back — even if the build
// fails — so the live website (which uses a normal `next build`/`next
// start`, not this script) is never affected.

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const appDir = path.join(__dirname, "..", "app");
const excludeDir = path.join(appDir, "web-to-print");
const stashDir = path.join(__dirname, "..", ".web-to-print-stash");

function moveOut() {
  if (fs.existsSync(excludeDir)) {
    fs.renameSync(excludeDir, stashDir);
    console.log("[build-android] Temporarily moved app/web-to-print out of the build (not needed in the Android app).");
  }
}

function moveBack() {
  if (fs.existsSync(stashDir)) {
    fs.renameSync(stashDir, excludeDir);
    console.log("[build-android] Restored app/web-to-print.");
  }
}

// Safety net: restore even on Ctrl+C or unexpected crash.
process.on("SIGINT", () => { moveBack(); process.exit(1); });
process.on("SIGTERM", () => { moveBack(); process.exit(1); });

try {
  moveOut();
  execSync("npx cross-env CAPACITOR_BUILD=1 next build", { stdio: "inherit", cwd: path.join(__dirname, "..") });
  execSync("npx cap sync android", { stdio: "inherit", cwd: path.join(__dirname, "..") });
} finally {
  moveBack();
}
