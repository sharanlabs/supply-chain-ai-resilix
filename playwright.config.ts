import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./evals/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://127.0.0.1:3010",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run dev -- --port 3010",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
