import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 20_000,
    include: ["evals/**/*.test.ts", "evals/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      // Cover the deterministic business logic + API routes -- demo/seed data and
      // type decls carry no logic, and tests cover themselves.
      include: ["lib/**/*.ts", "app/api/**/*.ts"],
      exclude: ["lib/data/**", "**/*.d.ts"],
      thresholds: {
        // Ratchet floor, set just under the measured baseline so it passes today and
        // FAILS only on a regression. Raise as the suite grows; never lower it.
        //   2026-06-17 (P3.1): lines 73.4 / stmts 72.7 / funcs 71.3 / branches 61.2
        //   2026-06-17 (P3.2): lines 78.3 / stmts 77.7 / funcs 75.8 / branches 66.8
        //     (signal layer reworked -- dead network fetchers removed, DI tests added)
        lines: 77,
        functions: 74,
        statements: 76,
        branches: 65
      }
    }
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname
    }
  }
});
