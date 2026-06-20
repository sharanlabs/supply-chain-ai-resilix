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
    "test-results/**"
  ]),
  prettier
]);
