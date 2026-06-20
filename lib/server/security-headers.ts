// Security response headers, extracted from next.config.ts as a PURE, dependency-free
// builder so the policy is UNIT-TESTABLE. Why this matters: the CSP is production-only
// (the Playwright e2e runs against `next dev`, which needs 'unsafe-eval' for HMR), so the
// header that actually ships in prod is never exercised by the dev-server e2e -- a security
// control with no test is one trusted on faith. The unit test over this function is that
// missing coverage (guidelines-monitor 2026-06-20).

// The production Content-Security-Policy. HONEST RESIDUAL: script-src keeps 'unsafe-inline'
// because Next.js injects inline bootstrap scripts and we do not yet emit a per-request
// nonce; a nonce-based CSP (middleware-set nonce + 'strict-dynamic', dropping 'unsafe-inline'
// from script-src) is the documented next step. style-src 'unsafe-inline' is the tolerable
// residual for Tailwind. The non-script directives below already do real work (frame-ancestors,
// object-src, base-uri, form-action), so the policy is meaningful today, just not yet strict.
export const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join("; ");

// Build the security headers for a given environment. The non-CSP headers are universally
// safe (no rendering impact, HSTS is ignored over http) and ship in every mode; the CSP is
// added ONLY in production (see PROD_CSP). Pure + parameterized so a test can assert both
// the prod (CSP present) and dev (CSP absent) branches without a running server.
export function buildSecurityHeaders(opts: { isProd: boolean }): { key: string; value: string }[] {
  const headers = [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
  ];
  if (opts.isProd) {
    headers.push({ key: "Content-Security-Policy", value: PROD_CSP });
  }
  return headers;
}
