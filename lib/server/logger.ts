import pino from "pino";

// Structured (JSON) logging for the server-side pipeline + fetchers. Replaces ad-hoc
// `note`-field logging with a real, queryable log stream. Deliberately uses base pino
// writing JSON to stdout -- NO transport/worker-thread pretty-printer, which is what keeps
// it safe under the Next.js server bundler (a pino.transport worker breaks the trace and
// can crash the route runtime). A log shipper (or `pino-pretty` in a dev shell) consumes the
// JSON downstream. NOT for use in proxy.ts (the Edge middleware runtime) -- Node only.

// Pure + testable: test -> silent (vitest sets NODE_ENV=test; keeps the suite output clean),
// otherwise LOG_LEVEL or a sane default. Exported so the resolution is unit-tested without
// instantiating a logger.
export function resolveLogLevel(env: NodeJS.ProcessEnv = process.env): string {
  if (env.NODE_ENV === "test") return "silent";
  const configured = env.LOG_LEVEL?.trim();
  return configured && configured.length > 0 ? configured : "info";
}

// Redact secrets BY CONSTRUCTION so structured logging can never leak a credential, even if a
// caller logs a whole request/headers/config object. Covers the bearer/n8n/provider-key shapes
// this app actually handles (Law 11: a log line is an exfiltration surface). Exported so the
// redaction regression test exercises the REAL config, not a copy.
export const REDACT_PATHS = [
  // Bearer / approval token (security.ts APPROVAL_TOKEN_HEADER = "authorization").
  "authorization",
  "Authorization",
  "headers.authorization",
  "headers.Authorization",
  "req.headers.authorization",
  // The app's real n8n callback-secret header (security.ts N8N_CALLBACK_SECRET_HEADER), in the
  // shapes a Request / headers object would be logged under.
  '["x-resilix-callback-secret"]',
  'headers["x-resilix-callback-secret"]',
  'req.headers["x-resilix-callback-secret"]',
  // DATABASE_URL embeds a password; redact the whole value wherever it is logged.
  "DATABASE_URL",
  "*.DATABASE_URL",
  // Provider keys + generic token/secret field shapes.
  "token",
  "*.token",
  "apiKey",
  "*.apiKey",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "APPROVAL_TOKEN",
  "N8N_CALLBACK_SECRET",
  "callbackSecret",
  "*.callbackSecret",
  // The pino `err` serializer is auto-enabled for the `err` key and copies an
  // Error's enumerable own-properties -- so a thrown error carrying request
  // headers or a config snapshot must be redacted under `err.*` too (the
  // run-exception route logs `{ err }`). The `*.token/apiKey/DATABASE_URL/
  // callbackSecret` wildcards above already reach `err.token` etc.; these close
  // the remaining secret shapes (bearer header, callback header, named keys).
  "err.authorization",
  "err.Authorization",
  "err.headers.authorization",
  "err.headers.Authorization",
  'err.headers["x-resilix-callback-secret"]',
  "err.APPROVAL_TOKEN",
  "err.N8N_CALLBACK_SECRET",
  "err.GEMINI_API_KEY",
  "err.GROQ_API_KEY"
];

export const logger = pino({
  level: resolveLogLevel(),
  base: { service: "resilix-actionops" },
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" }
});
