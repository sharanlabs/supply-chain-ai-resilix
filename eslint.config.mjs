import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
// eslint-config-prettier (flat) turns OFF any ESLint rules that would conflict
// with Prettier's formatting. It only DISABLES rules (adds none), so lint stays
// green; it MUST be last so it wins over the configs above.
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "playwright-report/**",
    "test-results/**",
    // Agent-tooling scratch (the `remember` session buffer). Git-ignored via its own nested
    // .gitignore, but ESLint does not read those -- so its stray .ts scratch files were linted
    // as project source and tripped `--max-warnings=0`, turning `npm run verify` RED on any
    // machine where that tooling runs (observed 2026-07-27). Not project source; never lint it.
    ".remember/**"
  ]),
  prettier
]);
