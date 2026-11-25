import { defineConfig } from "@playwright/test";

const origin = "http://127.0.0.1:3310";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../.local-cache/playwright",
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL: origin,
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3310",
    url: origin + "/login",
    reuseExistingServer: false,
  },
});
