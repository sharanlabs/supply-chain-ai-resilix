import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./lib/server/security-headers";

// Security headers come from a pure, unit-tested builder (lib/server/security-headers.ts) so
// the production-only CSP -- which the dev-server e2e never exercises -- is still covered by a
// test. The CSP is prod-scoped because `next dev` (the Playwright target) needs 'unsafe-eval'
// for HMR; a dev CSP would break HMR or be theater.
const securityHeaders = buildSecurityHeaders({ isProd: process.env.NODE_ENV === "production" });

const nextConfig: NextConfig = {
  typedRoutes: false,
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  }
};

export default nextConfig;
