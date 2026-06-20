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

## Remaining gate — Codex cross-model (owner-gated)

The mandatory cross-model leg has NOT run on these 3 commits (every prior Codex stamp is
≤ `48033b1`). Account-constrained: the existing ChatGPT Codex seat is capped to ~Jun 24; the
backup account is owner-called. Banked command (run when an account is available):

```
bash ~/claude-os/bin/codex-guarded exec -s read-only --json -o /tmp/codex-optional-resilix.txt \
  "Cross-model devil's advocate on commits 936c6ef (product-master allowlist) + d0eaf17/149f18d \
   (strict nonce CSP). For A: probe un-nonced/static routes, the style-src residual, the Zod jitless \
   trade-off. For B: does the allowlist swap weaken any grader; do the membership/corruption tests \
   have real teeth. Refute correctness or APPROVE." < /dev/null
```

Primary-model-final on the output.
