import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { registerWarRoomTools } from "@/lib/server/mcp-server";
import { verifyMcpToken } from "@/lib/server/security";

// S3 -- the MCP endpoint: /api/mcp/mcp over Streamable HTTP (mcp-handler v1.1.0,
// SDK v1.26.0 -- the handler's exact peer pin, at/above the >=1.26.0 security
// floor; verified from the installed packages 2026-07-09). The route lives under
// its own /api/mcp base so the [transport] segment can never shadow the app's
// other /api/* routes.
//
// AUTH -- a STATED deviation from the full MCP OAuth 2.1 resource-server flow
// (docs/mcp.md): this server VALIDATES a pre-shared bearer (MCP_ACCESS_TOKEN,
// constant-time, fail-closed when unset) and never issues tokens. required:true
// means a missing/invalid bearer gets 401 + a WWW-Authenticate challenge from
// the wrapper -- the spec-shaped refusal, without standing up an authorization
// server this showcase does not need. Read-only tools only (lib/server/
// mcp-server.ts); the moat's authority boundary extends to this surface.
const handler = createMcpHandler(
  (server) => registerWarRoomTools(server),
  {},
  {
    basePath: "/api/mcp",
    maxDuration: 60,
    // Security read M1 (2026-07-09): without this the handler ALSO mounts the
    // legacy /sse + /message transports -- auth-gated but undocumented, untested,
    // and 500-ing on a Redis requirement we don't run. The surface is exactly
    // the one Streamable-HTTP endpoint we document and test.
    disableSse: true
  }
);

const verifyToken = async (
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> => {
  if (!verifyMcpToken(bearerToken)) return undefined;
  return {
    token: "validated", // never echo the presented secret back into request context
    clientId: "mcp-bearer-client",
    scopes: ["read"]
  };
};

// Codex F1 (MED): without a fixed resourceUrl, mcp-handler builds the 401
// WWW-Authenticate `resource_metadata` origin from x-forwarded-host/forwarded --
// a proxy that doesn't sanitize those lets an attacker point MCP clients at
// attacker-controlled metadata. A public deploy MUST set MCP_PUBLIC_ORIGIN (e.g.
// https://resilix.example) so the challenge origin is trusted, never request-
// derived. (The pointer itself is inert -- no metadata endpoint is mounted, see
// docs/mcp.md -- so this is defense-in-depth on the stated-deviation posture.)
const publicOrigin = process.env.MCP_PUBLIC_ORIGIN?.trim();
const resourceUrl = publicOrigin
  ? new URL("/api/mcp/mcp", publicOrigin).toString()
  : undefined;

// Codex F1 round-2 residual: don't leave the fallback silent in production. When
// the MCP surface is LIVE in production (a token is configured) but no trusted
// MCP_PUBLIC_ORIGIN is set, the 401 challenge origin would be request-derived --
// so FAIL CLOSED: the endpoint returns 503 (misconfig) until the operator pins a
// trusted origin, matching the repo's "secure mode requires strong config"
// pattern (verifyApprovalToken's 503 AUTH_NOT_CONFIGURED). Dev/test/replay-only
// deploys (no token) are unaffected -- the surface there simply 401s on every call.
const mcpMisconfiguredInProd =
  process.env.NODE_ENV === "production" &&
  Boolean(process.env.MCP_ACCESS_TOKEN?.trim()) &&
  !publicOrigin;

const authedHandler = withMcpAuth(handler, verifyToken, { required: true, resourceUrl });

const misconfigHandler = () =>
  new Response(
    JSON.stringify({
      error: "mcp_misconfigured",
      message:
        "MCP is enabled in production (MCP_ACCESS_TOKEN set) but MCP_PUBLIC_ORIGIN is unset; " +
        "set a trusted public origin so the auth challenge is not request-derived."
    }),
    { status: 503, headers: { "content-type": "application/json" } }
  );

const routeHandler = mcpMisconfiguredInProd ? misconfigHandler : authedHandler;

export { routeHandler as GET, routeHandler as POST };
