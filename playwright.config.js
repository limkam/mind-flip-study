import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser", timeout: 15_000, fullyParallel: true, workers: 4, retries: 0,
  use: { baseURL: "http://127.0.0.1:4174", trace: "retain-on-failure" },
  webServer: { command: "npm run dev -- --host 127.0.0.1 --port 4174", url: "http://127.0.0.1:4174/__phase4-test", reuseExistingServer: false, timeout: 30_000 },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
