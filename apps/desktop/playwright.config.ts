import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: "http://127.0.0.1:1420",
    trace: "on-first-retry",
  },
  webServer: {
    command: "node node_modules/vite/bin/vite.js --host 127.0.0.1",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "chromium-dpr2-pdf",
      grep: /500-page PDF/,
      testMatch: "smoke.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 2,
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "chromium",
      grepInvert: /500-page PDF/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "chromium-dpr2",
      testMatch: /(?:responsive|stage13-bookshelf|stage13-data-safety)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 2,
        viewport: { width: 900, height: 640 },
      },
    },
    {
      name: "chromium-dpr2-txt",
      grep: /opens a seeded TXT reader/,
      testMatch: "smoke.spec.ts",
      use: {
        ...devices["Desktop Chrome"],
        deviceScaleFactor: 2,
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
