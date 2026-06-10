import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
    },
    {
      name: "desktop-chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
