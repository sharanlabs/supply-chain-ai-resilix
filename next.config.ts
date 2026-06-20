import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./lib/server/security-headers";

// The always-on, request-independent security headers come from a pure, unit-tested
// builder. The Content-Security-Policy is NOT set here: it needs a per-request nonce
// and is set in proxy.ts (buildCspWithNonce), so the strict nonce-based CSP can drop
// 'unsafe-inline' from script-src.
const securityHeaders = buildSecurityHeaders();

const nextConfig: NextConfig = {
  typedRoutes: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
