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
    timeout: 120_000,
    // Merged ON TOP of process.env (verified in webServerPlugin), so this is
    // purely additive: the flag only mounts the /customs route (default-off in
    // deploys), letting evals/e2e/customs.spec.ts exercise the desk while the
    // existing `/` specs see an unchanged surface.
    env: { ENABLE_CUSTOMS_DESK: "true" }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
