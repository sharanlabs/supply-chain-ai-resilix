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
    env: {
      ENABLE_CUSTOMS_DESK: "true",
      // S3: a TEST-ONLY bearer so the MCP e2e can round-trip the authed path;
      // the 401 tests present no/wrong tokens against the same server. Not a
      // real secret: grants read-only fixture access on the local test server.
      // This exact value is a RECORDED exception in scripts/secret-scan.mjs's
      // generic-credential rule -- any other literal in this shape trips CI.
      MCP_ACCESS_TOKEN: "e2e-mcp-test-token-0123456789abcdef"
    }
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ]
});
