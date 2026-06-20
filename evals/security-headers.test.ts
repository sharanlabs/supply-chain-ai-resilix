import { describe, expect, it } from "vitest";

import { buildSecurityHeaders, PROD_CSP } from "@/lib/server/security-headers";

// Coverage for the production CSP + the always-on security headers. The prod CSP never runs
// under the dev-server e2e (it is NODE_ENV-gated), so without this unit test the only header
// that ships in prod would be trusted on faith (guidelines-monitor 2026-06-20).

function byKey(headers: { key: string; value: string }[]) {
  return new Map(headers.map((h) => [h.key, h.value]));
}

describe("security headers", () => {
  it("always ships the safe non-CSP headers (dev + prod)", () => {
    for (const isProd of [false, true]) {
      const h = byKey(buildSecurityHeaders({ isProd }));
      expect(h.get("Strict-Transport-Security")).toMatch(/max-age=\d+/);
      expect(h.get("X-Content-Type-Options")).toBe("nosniff");
      expect(h.get("X-Frame-Options")).toBe("DENY");
      expect(h.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
      expect(h.get("Permissions-Policy")).toContain("geolocation=()");
    }
  });

  it("adds the CSP ONLY in production", () => {
    expect(byKey(buildSecurityHeaders({ isProd: false })).has("Content-Security-Policy")).toBe(false);
    expect(byKey(buildSecurityHeaders({ isProd: true })).has("Content-Security-Policy")).toBe(true);
  });

  it("the prod CSP carries the load-bearing non-script directives", () => {
    // These are the directives that do real work regardless of the script-src 'unsafe-inline'
    // residual -- clickjacking, base-tag injection, plugin/object, and form-action exfil.
    expect(PROD_CSP).toContain("default-src 'self'");
    expect(PROD_CSP).toContain("frame-ancestors 'none'");
    expect(PROD_CSP).toContain("object-src 'none'");
    expect(PROD_CSP).toContain("base-uri 'self'");
    expect(PROD_CSP).toContain("form-action 'self'");
  });
});
