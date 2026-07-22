# Playground — "a real product anyone can test" (owner-fixed 2026-07-22)

FRAMEWORKS USED: declarative spec (success criteria + acceptance tests), same basis as the
Phase-2 deck plan; security-pass gated because it opens a public compute door.

**Owner steer (2026-07-22, verbatim intent):** "build a real product not showpiece display
where anyone can test it." Converted + owner-fixed same day:
- **Scope: deterministic own-data loop for everyone ($0/keyless) + live AI on the OWNER'S key
  behind a HARD daily budget cap + per-IP rate limits** (owner picked "+ Your key, capped" over
  BYOK and deterministic-only).
- **Sequencing: AFTER the Phase-2 deck close** (owner picked; deck = the landing story, the
  playground = the product door).

## What DONE looks like

- SC1 **The visitor loop is real**: a public "Try it" surface where anyone (a) picks a real
  scenario, (b) optionally uploads THEIR supplier CSV through the existing hardened door
  (S-02 caps, formula-injection neutralization, row/byte caps, rate limits — now load-bearing),
  (c) the REAL deterministic pipeline runs in-request on their data ($0, keyless), and (d) their
  packet renders in the deck register with the simulated approve gate. No hardcoded output —
  their numbers, their exposure, their drafts.
- SC2 **Live mode on the owner key, capped fail-closed**: a visitor can run the live
  Investigator loop + cross-family Skeptic on the owner's key ONLY while (a) a persistent DAILY
  aggregate budget cap has headroom (value = owner decision at build; engine per-run guard
  `assertWithinBudget` already exists — this adds the cross-run daily aggregate) and (b) their
  per-IP rate-limit budget allows. Cap exhausted or limiter hit → the run degrades to the
  deterministic pipeline with an HONEST on-glass note ("today's live budget is spent — this run
  used the deterministic engine"), never an error page, never silent.
- SC3 **No visitor-data persistence surprises**: uploaded CSVs follow the existing retention
  disclosure; live-mode inputs are never stored beyond the request; no accounts, no tracking.
- SC4 **Security pass before ship**: the public live endpoint on the owner's key gets a
  dedicated security-specialist review (abuse vectors: cap-drain, prompt-injection via CSV/query,
  limiter spoofing — note the trusted-identity caveat: on Vercel the gateway IP is the limiter
  key) + the injection red-team corpus driven through the new door.
- SC5 **Suites green + gates**: verify + e2e first-hand → Codex cross-model on the increment →
  acceptance-gate → owner review → deploy folds into Phase 4.

## Deliberate boundaries (recorded)
- NOT a SaaS: no auth/tenants/billing (the personal-project right-size stands).
- The $0/keyless posture of `/` (the story) is unchanged; the playground is an additive door.
- BYOK (visitor keys) DECLINED by owner 2026-07-22 — do not build a key-input surface.

## Build order (after deck close)
1. Daily-aggregate budget store + per-IP limits on the live door (reuse rate-limit.ts + the
   pricing ledger; pg-or-memory dual store like everything else).
2. The "Try it" surface (scenario picker + upload + run + deck render of THEIR packet).
3. Live-mode toggle wired through the cap; honest degradation note.
4. Red-team + security pass → gates → owner review.
