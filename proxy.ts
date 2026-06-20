import { NextResponse, type NextRequest } from "next/server";
import { buildCspWithNonce } from "@/lib/server/security-headers";

// Per-request nonce-based Content-Security-Policy (Next 16 `proxy.ts`, the renamed
// `middleware.ts`). The flow follows the official Next.js CSP guide verbatim:
//   1. mint a fresh, unguessable nonce per request;
//   2. set the CSP on the REQUEST headers + an `x-nonce` header -- Next reads the
//      nonce from the request CSP during SSR and stamps it onto its own framework
//      and bundle <script> tags (and any next/script with the nonce prop);
//   3. set the CSP on the RESPONSE headers so the browser actually enforces it.
// The strict CSP (script-src nonce + 'strict-dynamic', no 'unsafe-inline') REQUIRES
// dynamic rendering so the nonce can be injected per request -- the `/` route opts in
// via `await connection()` (a build-time-static page would ship scripts with no nonce
// and 'strict-dynamic' would then block them).
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  const csp = buildCspWithNonce(nonce, { isDev });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // The request-side CSP is how Next discovers the nonce to apply during render.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  // The response-side CSP is what the browser enforces.
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on document requests only: skip API routes (no script context; they carry the
  // static security headers from next.config), the _next static/image assets, and the
  // favicon, and ignore next/link prefetches (which do not render a nonceable document).
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" }
      ]
    }
  ]
};
