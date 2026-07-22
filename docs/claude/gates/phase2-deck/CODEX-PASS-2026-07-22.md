# Codex cross-model pass — Phase-2 deck build (2026-07-22)

**Run:** Codex CLI, read-only, single-threaded (first attempt died mid-run on a prior increment's
infra pattern; this run completed). Reviewed the uncommitted deck diff vs `55a219b` across 6
angles (invariant port · motion/hydration · tokens+settle · a11y-spec realignments · BLUF
cross-check · silent content drops).

**Verdict: NOT APPROVED — 1 HIGH / 4 MED / 5 LOW; token/contrast re-point APPROVED (item 3).**
All findings ACCEPTED and FIXED same-session, primary-model-final:

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| 1a | HIGH | packet.auditTrail not ported (coda claimed "Logged" while the trail was off the glass) | "Provenance log" closed disclosure: full auditTrail + local decision, ported labels, `data-testid="provenance-log"` |
| 1b | MED | post-release copy contradiction (dek "waiting"/coda "Held" after release) | decision-aware card-6 dek (PENDING/APPROVED/REJECTED/NO_ACTION); coda chip "Held by default — nothing sends without a named signature" |
| 4 | MED | expanded axe scan hollow for offscreen cards (unrevealed = opacity-0 = axe-excluded) | walk-then-open-then-scan in the expanded test (spec-side) |
| 6a | MED | supplier rationale reduced to a parsed tier | verbatim rationale caption (`s-why`) per card |
| 6c | MED | draft channel + task status/due dropped | channel in the letter header; five-column task rows with BOTH |
| 2 | LOW | runway easing quartic vs the spec's cubic | `easePow` parameterized; runway=3 |
| 5 | LOW | BLUF count cross-check containment, not equality | exact numeric equality (spec-side) |
| 6b | LOW | horizon dedup by revenue only | dedup by (revenue, margin) tuple |
| 6d | LOW | gatekeeper PASS evidence reduced to "Cleared" | cleared-checks line ported, URL clause bound to the real allowlist result |
| 6e | LOW | packet ID + compiled timestamp gone | coda fine-print identity line |

**Post-fix evidence (first-hand):** typecheck 0 · lint 0 · contrast 19/19 · unit **911** passed
(evals/deck-view.test.tsx 9/9 cold-branch suite incl. red-arm proof) · verify exit 0 · e2e
**59 passed** exit 0 · hydration-mismatch warnings: 0.
