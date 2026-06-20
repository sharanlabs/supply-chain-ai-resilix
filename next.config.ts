import type { NextConfig } from "next";

// Security response headers (P2.7 residual: CSP/HSTS). The non-CSP headers are universally
// safe (no rendering impact) and apply in every mode. The CSP is PRODUCTION-ONLY on purpose:
// `next dev` (which the Playwright e2e runs against) needs 'unsafe-eval' + inline for HMR, so a
// dev CSP would either break HMR or be meaninglessly loose -- scoping it to prod keeps dev/e2e
// honest while still shipping a real policy for a deployed build. The prod CSP keeps
// 'unsafe-inline' for script/style (Next's bootstrap inline + Tailwind) -- nonce-based hardening
// is the documented further step (roadmap), not a blocker for the portfolio artifact.
const isProd = process.env.NODE_ENV === "production";

const PROD_CSP = [
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

const securityHeaders = [
  // HSTS is honored only over https (ignored on the http dev origin), so it is safe everywhere.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(isProd ? [{ key: "Content-Security-Policy", value: PROD_CSP }] : [])
];

const nextConfig: NextConfig = {
  typedRoutes: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
