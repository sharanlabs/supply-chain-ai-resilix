# Gate evidence — optional hardening (product-master allowlist + strict nonce CSP)

Date: 2026-06-20. Scope: the two owner-requested "optional" polish items, built as
two independent increments + one gate-finding fix. Commits `936c6ef`, `d0eaf17`,
`149f18d` (on `48033b1`). Push HELD.

## Increment B — product-master allowlist (`936c6ef`)

Turned on the deferred product-master allowlist. `knownProductIds` was the run's own
simulation inventory (self-referential); it is now derived from a single authoritative
catalog `lib/data/product-master.ts` as `KNOWN_PRODUCT_IDS` (the exact `KNOWN_SUPPLIER_IDS`
← `ingestSeed()` pattern). Swapped the 3 real ground-truth call sites. The run-scoped
check stays enforced by `gradeSimulatorArithmetic`, so this only strengthens existence
checking. `evals/product-master.test.ts` enumerates every productId the live + golden
scenarios and the demo packet emit and asserts each ∈ master, and asserts PROD-FAKE
(the corruption id) ∉ master.

## Increment A — strict nonce-based CSP (`d0eaf17`) + 404/error coverage (`149f18d`)

Replaced the honest `script-src 'unsafe-inline'` residual with the official Next.js 16
nonce pattern: `proxy.ts` mints a per-request nonce, sets the CSP on request + response
headers; `script-src 'self' 'nonce-..' 'strict-dynamic'` (no 'unsafe-inline'; 'unsafe-eval'
dev-only). `style-src 'unsafe-inline'` kept on purpose (dynamic inline `style=` attributes a
nonce cannot cover — the one documented divergence from the guide). `/` and `/_not-found` are
dynamic and empirically smoke-tested nonced (below); the error boundary (`app/error.tsx`) is a
Client Component, dynamically rendered by the SAME mechanism, so it inherits the nonce — reasoned,
not separately smoke-tested (an error boundary is not reachable from a URL, and it fails closed if
the reasoning were wrong). `lib/schemas.ts` sets
Zod `jitless` (Zod v4's `new Function` JIT is blocked by the eval-free prod CSP — this broke
client hydration; jitless is Zod's documented strict-CSP switch).

## Gates run

- **verify:full** — GREEN (typecheck + lint + tests + build + secrets + 15 e2e).
- **Prod browser smoke** (`scripts/prod-csp-smoke.mjs`, NOT in verify — needs a prod server):
  PASS. `/` = 18 scripts nonced, 0 CSP violations, interactive (approve flips, tab hydrates).
  `/__bogus__` = 404, 17 scripts nonced, 0 script violations. This is the execution proof the
  dev e2e (dev CSP has 'unsafe-eval') and a curl header check both pass blindly — the durable
  closure of the "security control with no test" gap for the CSP.
- **acceptance-gate** (subagent) — found the static-default-404 nonce gap (now fixed in
  `149f18d`); otherwise sound. Its other BLOCK reasons were procedural (no Bash, so it saw
  claims not transcripts; the mandatory Codex leg pending) — addressed by the verify evidence
  above and the Codex handoff below.
- **security-specialist** (subagent) — verdict safe-to-proceed; empirically confirmed the 404
  fails-closed gap (now fixed). Residual: the deliberate, well-contained `style-src 'unsafe-inline'`.
  Optional polish it noted (NOT gaps for this artifact): `Cross-Origin-Opener-Policy: same-origin`,
  a CSP report endpoint.

## Codex cross-model — DISCHARGED (2026-06-20, owner's BACKUP account)

The owner released the backup-account switch ("run on backup now"). Ran `codex-guarded`
read-only over commits `936c6ef` + `d0eaf17`/`149f18d`.

- **Round 1: REVISE(4)** — all 4 weighed and accepted (primary-model-final), all fixed in
  `d1d9200`:
  1. [Med] `proxy.ts` matcher `api` → `api/`: the `api` lookahead also excluded `/apiary`,
     `/apis`, and a bare `/api` 404, leaving those documents with NO CSP (a real gap the
     local security review rated as fine — the cross-model leg earning its keep). Prod smoke
     extended to assert an `api`-prefixed bogus document path is 404 + fully nonced.
  2. [Med] `actionops-pipeline.test.ts`: the corrupted-packet gate test now asserts the
     `exposure-control` grader specifically fails (was "blocked for any reason").
  3. [Low] `product-master.test.ts`: added `loadReplayPacket` as a 4th drift-guard source.
  4. [Low] `graders.ts`: stale "run inventory" comment → "product master catalog existence".
- **Closure: REVISE(1 nit)** — a stale "three sources" test comment after fix #3 added a
  fourth; corrected in `8a44ae9`. Codex functionally verified all 4 fixes (matcher via Next's
  `unstable_doesMiddlewareMatch`, the exposure assertion, the replay-fixture load, the comment).
  The lone open item was a comment, so no further cross-model round was spent (primary-model-final).

Re-verified after the fixes: `verify:full` GREEN + the prod smoke PASS (`/`, a plain 404, and an
`api`-prefixed 404 all 404 + fully nonced, zero violations, interactive).

**Gate stack for these increments: COMPLETE** (verify:full + prod smoke + acceptance-gate +
security-specialist + Codex cross-model REVISE→fix→closure). Push still HELD (owner action).
