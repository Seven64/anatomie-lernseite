import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-End-Tests:
 *  - „web“:     gebaute App (vite preview) in Chromium – Desktop- und Mobilgröße
 *  - „desktop“: die Electron-App aus dist/ (benötigt vorher `npm run build`)
 * Lokal: `npm run test:e2e` (web) bzw. `npm run test:desktop` (Electron, unter Linux ggf. mit xvfb-run).
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "web",
      testMatch: /web\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 768 }, baseURL: "http://127.0.0.1:4173/" },
    },
    {
      name: "web-mobile",
      testMatch: /mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"], baseURL: "http://127.0.0.1:4173/" },
    },
    {
      name: "desktop",
      testMatch: /desktop\.spec\.ts/,
    },
  ],
  webServer: process.env.E2E_NO_SERVER ? undefined : {
    command: "npx vite preview --port 4173 --strictPort --host 127.0.0.1",
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
