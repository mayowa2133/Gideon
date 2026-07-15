import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";

const workspaceRoot = path.resolve(__dirname, "../..");
const systemChrome = process.env.GIDEON_CAPTURE_CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const launchOptions = fs.existsSync(systemChrome) ? { executablePath: systemChrome } : undefined;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: { baseURL: "http://127.0.0.1:3200", trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions } }],
  webServer: {
    command: "pnpm dev:web",
    cwd: workspaceRoot,
    url: "http://127.0.0.1:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
