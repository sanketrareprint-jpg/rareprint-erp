const url = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3001";

async function main() {
  const target = `${url.replace(/\/$/, "")}/web-to-print`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(target, { signal: controller.signal });
    clearTimeout(timer);
    if (!response.ok) {
      console.error(`Storefront QA cannot start. ${target} returned HTTP ${response.status}.`);
      process.exit(1);
    }
    console.log(`Storefront QA target is reachable: ${target}`);
  } catch (error) {
    clearTimeout(timer);
    console.error("");
    console.error("Storefront QA cannot start because the website URL is not reachable.");
    console.error(`URL checked: ${target}`);
    console.error("");
    console.error("If testing local website, first run:");
    console.error("  npm.cmd run dev");
    console.error("");
    console.error("Then in another terminal run:");
    console.error("  npm.cmd run test:e2e");
    console.error("");
    console.error("If testing live website, set PLAYWRIGHT_BASE_URL to the working public domain.");
    console.error("Example:");
    console.error("  $env:PLAYWRIGHT_BASE_URL='https://your-working-domain.com'");
    console.error("  npm.cmd run test:e2e");
    console.error("");
    console.error(`Network error: ${error?.message || error}`);
    process.exit(1);
  }
}

main();
