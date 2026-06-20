import { describe, expect, it } from "vitest";

import { buildCspWithNonce, buildSecurityHeaders } from "@/lib/server/security-headers";

// The CSP ships at runtime via proxy.ts with a per-request nonce, so it never runs under
// the dev-server e2e -- without these unit tests the strict policy that ships in prod would
// be trusted on faith (the security-control-with-no-test inversion this file exists to close).
// The browser-execution proof (the nonce actually lets scripts run, no white screen) is the
// prod-build smoke at the gate; these tests pin the policy STRING the proxy emits.

function byKey(headers: { key: string; value: string }[]) {
  return new Map(headers.map((h) => [h.key, h.value]));
}

describe("static security headers (next.config)", () => {
  it("ships the always-on safe headers", () => {
    const h = byKey(buildSecurityHeaders());
    expect(h.get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
    expect(h.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.get("X-Frame-Options")).toBe("DENY");
    expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(h.get("Permissions-Policy")).toContain("geolocation=()");
    expect(h.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(h.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("does NOT carry the CSP -- the CSP is per-request (proxy.ts), not static", () => {
    // The CSP moved to proxy.ts because it needs a per-request nonce. Asserting its
    // ABSENCE here guards against a second, conflicting CSP source (two CSP headers =
    // the browser enforces the intersection, which would silently re-break things).
    expect(byKey(buildSecurityHeaders()).has("Content-Security-Policy")).toBe(false);
  });
});

describe("nonce-based CSP (proxy.ts)", () => {
  const NONCE = "TEST_NONCE_abc123==";

  it("binds the request nonce into script-src with strict-dynamic", () => {
    const csp = buildCspWithNonce(NONCE, { isDev: false });
    expect(csp).toContain(`script-src 'self' 'nonce-${NONCE}' 'strict-dynamic'`);
  });

  it("drops 'unsafe-inline' from script-src -- the actual XSS hardening", () => {
    // The whole point: an injected inline <script> has no valid nonce and cannot run.
    const csp = buildCspWithNonce(NONCE, { isDev: false });
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"))!;
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("'unsafe-eval' is dev-only (React dev eval), never in production", () => {
    expect(buildCspWithNonce(NONCE, { isDev: true })).toContain("'unsafe-eval'");
    expect(buildCspWithNonce(NONCE, { isDev: false })).not.toContain("'unsafe-eval'");
  });

  it("keeps style-src 'unsafe-inline' (the documented dynamic-inline-style residual)", () => {
    // Dynamic inline style= attributes (e.g. the exposure-bar widths) cannot be nonced;
    // this is the one deliberate divergence from the Next.js guide.
    const csp = buildCspWithNonce(NONCE, { isDev: false });
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  });

  it("carries the load-bearing non-script directives in both modes", () => {
    for (const isDev of [false, true]) {
      const csp = buildCspWithNonce(NONCE, { isDev });
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).toContain("form-action 'self'");
    }
  });
});
