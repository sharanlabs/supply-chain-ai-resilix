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
        // Ratchet floor (measured baseline 2026-06-17: lines 73.4 / stmts 72.7 /
        // funcs 71.3 / branches 61.2). Set just under so it passes today and FAILS
        // only on a regression. Raise as the suite grows; never lower it.
        lines: 72,
        functions: 70,
        statements: 71,
        branches: 60
      }
    }
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname
    }
  }
});
