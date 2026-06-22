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
- **Closure 1: REVISE(1 nit)** — a stale "three sources" test comment after fix #3 added a
  fourth; corrected in `8a44ae9`. Codex functionally verified all 4 substantive fixes (matcher via
  Next's `unstable_doesMiddlewareMatch`, the exposure assertion, the replay-fixture load, the comment).
- **Closure 2: APPROVE** (clean, no findings) — confirmed the comment fix and that nothing across
  `936c6ef..8a44ae9` is outstanding. The gate ends on a clean cross-model APPROVE.

Re-verified after the fixes: `verify:full` GREEN + the prod smoke PASS (`/`, a plain 404, and an
`api`-prefixed 404 all 404 + fully nonced, zero violations, interactive).

**Gate stack for these increments: COMPLETE** (verify:full + prod smoke + acceptance-gate +
security-specialist + Codex cross-model REVISE→fix→closure). Push still HELD (owner action).

## Follow-on security pass (2026-06-20, `84963e7`)

Applied the security review's flagged items, scoped by judgment:
- **COOP + CORP (both `same-origin`)** added to `buildSecurityHeaders` — XS-Leak / cross-window
  hardening, safe here (nothing cross-origin is embedded or hot-linked). COEP omitted (no isolation
  requirement). Unit test asserts both; the prod smoke asserts they ship on the live response AND
  the page still renders under CORP. verify:full GREEN + prod smoke PASS.
- **CSP report endpoint — DEFERRED WITH REASON** (not silently dropped). A `report-to` collector on
  a single-instance, push-held, unmonitored portfolio artifact logs into the void and adds an
  unauthenticated POST surface to a fail-closed app — the inverse of this project's "no control
  without a consumer" ethos. The ACTIVE drift detector already exists: `scripts/prod-csp-smoke.mjs`
  (deterministic, fails loud, caught the Zod regression). Add the endpoint only if real prod
  monitoring lands.
- **Codex cross-model: BANKED for this increment** (not run, 2026-06-20). Two pre-vetted static headers (one is
  the security-specialist's own recommendation) sit below the cross-model threshold; auto-running the
  backup account on them would be standing-authorization creep. Banked per the established pattern;
  the owner can call it. (The nonce-CSP rewrite, where cross-model genuinely paid off, WAS gated.)

## Codex cross-model — DISCHARGED (2026-06-22, the banked leg, owner released: "complete it")

The owner released the banked leg during the doctrine alignment pass. Ran `~/claude-os/bin/codex-guarded
exec -s read-only` (resilix-namespaced verdict file) over commits `84963e7..cac2150` — the COOP/CORP
`buildSecurityHeaders` delta.

- **Verdict: APPROVE (clean).** No findings. Codex confirmed: (1) the header names/values are correct and
  wired through `next.config.ts` `headers()` on `/:path*` (verified against installed Next types + official
  docs); (2) no legitimate flow breaks — repo search found no `window.open`/opener/iframe/cross-origin embed;
  external links use `rel="noreferrer noopener"`; CORP `same-origin` does not block same-origin `/_next`
  subresources, and `next/font/google` self-hosts from the deploy origin; (3) the COEP omission is sound
  (no `crossOriginIsolated`/`SharedArrayBuffer` usage → COEP would add subresource opt-in for no requirement);
  (4) test + prod-smoke coverage adequate for the delta.
- **Non-blocking note (tracked, NOT a finding):** the prod smoke asserts the headers on the document response
  but does not directly fetch an API route or a concrete `/_next/static` asset to assert them there — it relies
  on the uniform `/:path*` wiring (which the unit test pins). Left as-is: the smoke is not in `verify` (needs a
  prod server), the config applies to all paths uniformly, and Codex rated coverage adequate. Add the per-asset
  assertion only if a path-scoped header regression ever becomes plausible.
- **Verdict weighed primary-model-final:** APPROVE accepted (matches the read — two static same-origin headers on
  a single-origin app). Codex's own `vitest`/`typecheck` attempts were blocked by its read-only sandbox (EPERM
  on the Vitest temp dir / `next-env.d.ts`); the harness-side `verify:full` is GREEN (this session) as the
  execution evidence. **Gate-2 residual for this delta: CLOSED.**

## Re-run trigger for the prod CSP smoke (maintenance)

`scripts/prod-csp-smoke.mjs` is the ONLY check that proves the strict CSP still lets scripts
execute in prod — and it is NOT in `verify` (it needs a prod server). This episode is the proof
it matters: the Zod `new Function`/`jitless` regression passed both `verify:full` AND the dev
e2e and would have white-screened prod. So **re-run `npm run build && npx next start -p 3011 &
&& node scripts/prod-csp-smoke.mjs` after any of:** a dependency bump (especially anything in the
client bundle — Zod, React, Next), a change to `lib/schemas.ts` (the `jitless` config), or any
edit to `proxy.ts` / the CSP. A green dev e2e is NOT a substitute (dev CSP keeps `'unsafe-eval'`).
