import { defineConfig, devices } from "@playwright/test";

/**
 * Acceptance tests for the six POC features (tests/poc.spec.ts).
 * Local: builds and serves the production bundle on :4173.
 * Deployed: BASE_URL=https://ryankolean.github.io/spirits-territory-map/ npx playwright test
 */
const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL ?? "http://localhost:4173/",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", grepInvert: /@perf/, use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", grepInvert: /@perf/, use: { ...devices["Pixel 7"] } },
    {
      // Frame-rate test on the real GPU (new headless mode). Default headless
      // Chrome renders WebGL in software, which says nothing about a phone.
      name: "phone-gpu",
      grep: /@perf/,
      use: {
        ...devices["Pixel 7"],
        launchOptions: { channel: "chromium", args: ["--enable-gpu", "--use-angle=metal", "--ignore-gpu-blocklist"] },
      },
    },
  ],
  webServer: BASE_URL
    ? undefined
    : {
        command: "npm run build && npx vite preview --port 4173 --strictPort",
        url: "http://localhost:4173/",
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
