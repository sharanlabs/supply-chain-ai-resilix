// Security response headers as PURE, dependency-free builders so each policy is
// UNIT-TESTABLE. The CSP in particular ships only at runtime via proxy.ts (it needs
// a per-request nonce), so it is never exercised by the dev-server e2e -- a security
// control with no test is one trusted on faith. The builders below are that test
// surface.

// Build the per-request Content-Security-Policy with a nonce. This is the strict,
// nonce-based CSP: script-src carries the request nonce + 'strict-dynamic' and
// therefore drops 'unsafe-inline' entirely -- the real XSS hardening, since an
// injected inline <script> has no valid nonce and cannot run. proxy.ts generates a
// fresh nonce per request and Next stamps it onto its own framework/bundle scripts.
//
// Two deliberate residuals, both documented:
//   - 'unsafe-eval' is added in DEV only: React's dev build uses eval to reconstruct
//     server stacks in the browser. It is not used in production by React or Next.
//   - style-src keeps 'unsafe-inline' in BOTH modes: the app sets dynamic inline
//     style= attributes (e.g. the exposure-bar widths, animation-delay custom
//     properties) which a nonce CANNOT cover -- nonces apply to <style> elements,
//     not style attributes -- and Tailwind injects inline styles. Style injection is
//     far lower risk than script injection, so this is the tolerable residual. (This
//     is the one place we diverge from the Next.js guide, which nonces style-src;
//     that assumes no inline style attributes, which this UI has.)
export function buildCspWithNonce(nonce: string, opts: { isDev: boolean }): string {
  const scriptSrc =
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'` + (opts.isDev ? " 'unsafe-eval'" : "");
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ].join("; ");
}

// The always-on, request-independent security headers. These have no rendering
// impact (HSTS is ignored over http, the rest are universally safe), so they ship in
// every mode via next.config's headers(). The CSP is NOT here -- it is per-request and
// lives in proxy.ts (see buildCspWithNonce). Pure so a test asserts the exact set.
export function buildSecurityHeaders(): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
  ];
}
