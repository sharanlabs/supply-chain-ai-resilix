import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Pin NODE_ENV=test for the whole suite so it is deterministic regardless of
    // the ambient shell. Without this, `NODE_ENV=production npm test` would flip
    // secureModeRequired() (prod = secure-by-default) true and break every test
    // that assumes the authless in-memory demo baseline.
    env: { NODE_ENV: "test" },
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
        //   2026-06-17 (F):    lines 81.6 / stmts 81.3 / funcs 79.3 / branches 71.2
        //     (deterministic eval graders added -- lib/evals/* at 98-100%)
        lines: 80,
        functions: 78,
        statements: 80,
        branches: 69
      }
    }
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname
    }
  }
});
