import { test, expect } from "@playwright/test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// S3 -- the MCP endpoint over REAL Streamable HTTP against the running app
// (webServer, keyless for LLMs; MCP_ACCESS_TOKEN set test-only in
// playwright.config.ts). This owns the HTTP/auth layer: the fail-closed 401
// challenge shape, and a genuine SDK-client round-trip of the authed path.
// The protocol/moat layer (registry pin, adversarial inputs) lives in
// evals/mcp-server.test.ts over the in-memory transport.

const ENDPOINT = "http://127.0.0.1:3010/api/mcp/mcp";
const TOKEN = "e2e-mcp-test-token-0123456789abcdef";

test.describe("S3 / MCP endpoint auth (fail-closed)", () => {
  test("no bearer → 401 with a WWW-Authenticate challenge (RFC 9728 shape)", async ({
    request
  }) => {
    const res = await request.post(ENDPOINT, {
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    expect(res.status()).toBe(401);
    expect(res.headers()["www-authenticate"] ?? "").toContain("Bearer");
  });

  test("a WRONG bearer → 401 (constant-time reject, no body leak)", async ({ request }) => {
    const res = await request.post(ENDPOINT, {
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer definitely-not-the-token-but-long-enough"
      },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" }
    });
    expect(res.status()).toBe(401);
    expect(await res.text()).not.toContain("REPLAY");
  });

  test("mutation attempts without the protocol are refused (GET is auth-gated too)", async ({
    request
  }) => {
    const res = await request.get(ENDPOINT);
    expect(res.status()).toBe(401);
  });

  // Codex F4 (LOW): disableSse:true means the legacy /sse + /message transports
  // are not mounted -- pin that so a future config drift can't silently reopen a
  // second, unexercised transport. Authed AND unauthed both: the surface is
  // exactly the one Streamable-HTTP endpoint we document. (Not 200 under any
  // path -- either the auth 401 or the not-mounted 404, never a live transport.)
  for (const path of ["/api/mcp/sse", "/api/mcp/message"]) {
    test(`the legacy transport ${path} is not a live endpoint (disableSse)`, async ({
      request
    }) => {
      const noAuth = await request.post(`http://127.0.0.1:3010${path}`, {
        headers: { "content-type": "application/json" },
        data: {}
      });
      expect([401, 404, 405]).toContain(noAuth.status());
      const authed = await request.post(`http://127.0.0.1:3010${path}`, {
        headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
        data: {}
      });
      expect([404, 405]).toContain(authed.status());
    });
  }
});

test.describe("S3 / MCP authed round-trip (real SDK client, Streamable HTTP)", () => {
  test("lists exactly the three read-only tools and round-trips a call", async () => {
    const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
      requestInit: { headers: { authorization: `Bearer ${TOKEN}` } }
    });
    const client = new Client({ name: "e2e-client", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual([
        "get_audit_trail",
        "get_decision_packet",
        "query_supplier_exposure"
      ]);

      const result = await client.callTool({
        name: "get_decision_packet",
        arguments: { source: "war-room" }
      });
      const text =
        (result.content as Array<{ type: string; text?: string }>).find((c) => c.type === "text")
          ?.text ?? "";
      // Disclosure-led, REPLAY-labeled -- the same honesty contract as the UI.
      expect(text.startsWith("Recorded REPLAY data")).toBe(true);
      expect(text).toContain('"effectiveMode": "REPLAY"');
    } finally {
      await client.close();
    }
  });
});
