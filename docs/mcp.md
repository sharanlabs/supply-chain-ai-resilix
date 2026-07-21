# The MCP surface — auth, consent, audit (S3, 2026-07-09)

RESILIX exposes a **read-only** [Model Context Protocol](https://modelcontextprotocol.io) server
so any MCP client (Claude Desktop / Claude Code / anything speaking Streamable HTTP) can ask the
war room questions. The moat's authority boundary extends to this surface: **an agent can read,
it can never act.**

## Endpoint & stack (verified from installed packages, 2026-07-09)

- **Endpoint:** `POST /api/mcp/mcp` — Streamable HTTP (the current MCP remote transport; the older
  HTTP+SSE transport is deprecated).
- **Stack:** `mcp-handler` **1.1.0** (Vercel's Next.js adapter) + `@modelcontextprotocol/sdk`
  **1.26.0** — the handler's exact peer pin, at the `>=1.26.0` security floor (earlier SDK
  versions carry a known vulnerability). Both are **exact-pinned in `package.json`** (no caret) —
  these are safety-critical deps and the surface is tested against these exact versions. Spec
  revision targeted: **2025-11-25**, the current stable revision as of this writing (2026-07-09).
  An **announced upcoming** stateless spec revision (dated 2026-07-28) + SDK v2 beta exist; they
  are deliberately not adopted pre-finalization (official guidance: stable SDK for critical
  workloads). The migration is a contained swap inside `app/api/mcp/[transport]/route.ts` when it
  lands, and the finalized spec should be re-checked after that date.

```jsonc
// Claude Desktop / any Streamable-HTTP client
{
  "resilix": {
    "url": "https://<host>/api/mcp/mcp",
    "headers": { "Authorization": "Bearer <MCP_ACCESS_TOKEN>" }
  }
}
```

## The tools — read-only, by construction

| Tool | What it returns | What it can NEVER do |
|---|---|---|
| `get_decision_packet` | the recorded war-room REPLAY packet or the recorded agent-loop capture | approve, execute, dispatch, or mutate anything |
| `query_supplier_exposure` | exposure rows filtered by score / an exact packet-known supplier id | fuzzy-match or echo unknown input back |
| `get_audit_trail` | the packet's append-only audit trail | append to it |
| `query_customs_policy` | top-cited chunks from the committed customs policy corpus (BM25, page-cited) | fetch anything live or uncited |

The first three tools are pure reads of the recorded replay fixtures; `query_customs_policy` reads
the committed, page-cited policy corpus (still $0/keyless/deterministic — a different committed
source, disclosed per response). There are no authority tools. A structural test pins the registry to exactly these four names and
asserts no tool name carries an authority verb (`evals/mcp-server.test.ts`); mutation-shaped calls
are protocol errors; plain GET/POST without a valid bearer is 401.

**Data posture:** every tool is a pure read of the committed replay fixtures — the same recorded,
disclosed, synthetic-demo data the public surfaces render. $0, keyless, deterministic. Every
response leads with the disclosure line so a consuming agent cannot mistake recorded data for
live truth.

## Auth — a stated deviation from the full OAuth 2.1 flow

The MCP authorization spec (2025-06-18 onward) casts servers as OAuth 2.1 resource servers with
RFC 9728 protected-resource metadata discovery. This showcase server implements a **deliberate,
documented subset**:

- **Validates, never issues.** A single pre-shared bearer (`MCP_ACCESS_TOKEN`) is verified with a
  length-oblivious constant-time compare (`lib/server/security.ts`). There is no authorization
  server, no token issuance, no refresh — capabilities this demo does not need.
- **Fail-closed, no demo pass-through.** Unlike the UI's in-memory demo mode, the MCP endpoint is
  **closed unless a strong token (≥ 16 chars) is configured** — a remote agent protocol surface is
  never authless. Unset, weak, missing, or wrong bearers all yield **401 + a `WWW-Authenticate`
  challenge** (the spec-shaped refusal, via `mcp-handler`'s `withMcpAuth`).
- **Scope:** the validated principal carries `read` only.
- **Operator requirement for a public deploy.** Set `MCP_PUBLIC_ORIGIN` (e.g.
  `https://resilix.example`) so the 401 challenge's origin is a trusted configured value, never
  derived from request headers a proxy might not sanitize. This is **enforced fail-closed in
  production**: if the MCP surface is live (`MCP_ACCESS_TOKEN` set) under `NODE_ENV=production` but
  `MCP_PUBLIC_ORIGIN` is unset, the endpoint returns **503** (`mcp_misconfigured`) until the origin
  is pinned — a request-derived challenge origin is never used on a live prod surface. Local dev,
  the test runner, and a token-less replay-only deploy are unaffected (the surface there simply
  401s every call).
- **Known-inert pointer:** the 401 challenge emitted by `mcp-handler` includes a
  `resource_metadata` URL (`/.well-known/oauth-protected-resource`) that this server deliberately
  does not mount — an RFC 9728 discovery client following it gets a 404. That is consistent with
  the pre-shared-bearer model (the client already holds the token out-of-band; there is nothing to
  discover) and is recorded here so the deviation is stated, not silent.

Consent: the token IS the consent boundary — whoever holds it was explicitly granted read access
by the operator. There is no user-delegated flow because there is no per-user data.

## Audit

Every tool call emits a structured audit line in the packet audit-trail entry shape
(`actor: "mcp-client", action: "MCP_TOOL_CALL"`) to the server log — an append-only observability
write; no packet state is touched. The recorded packets' own audit trails are served, never
extended, by the read tools.

## Red-team posture

Tool inputs are untrusted (Law 11 / OWASP LLM01): enums + bounded numbers + exact-allowlist
supplier ids at the schema boundary; unknown ids yield an explicit no-match and the raw input is
**never echoed** into output. Adversarial-input tests ride in `evals/mcp-server.test.ts`; the
HTTP-layer 401/challenge tests in `evals/e2e/mcp.spec.ts`. Outputs are committed fixture JSON —
sanitized at ingest, disclosure-led at serve time, and framed with an explicit
instruction-vs-data boundary for the consuming agent (the payload embeds LLM-drafted prose —
email bodies, rationales — which a downstream agent must treat as content, never instructions).
**Recorded residual:** that framing is producer-side help, not a guarantee — the real containment
is that the served content is project-authored, sanitize-at-ingest committed fixtures. If this
surface ever serves non-fixture data, re-run the injection red-team against it first.
