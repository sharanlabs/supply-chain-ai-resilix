# Cross-model DESIGN grill — NO_ACTION refusal + rate limiter (2026-06-20)

`grill-me-codex` Act 2 (the cross-model adversarial design grill) on the two load-bearing design decisions shipped this session. Act 1 (interview-to-lock-intent) was moot — the designs were already built + documented. Run on the owner's backup Codex account. 2 rounds. Codex read-only.

## Round 1 — REVISE (design debt surfaced)

**Decision 1 — the NO_ACTION confidence-gate.** Codex argued: confidence is model-authored (only clamped, not calibrated) so the live leg leans on an uncalibrated number; 0.45 is anchored to UI wording, not measured false-act/false-refuse rates; "two distinct source labels" is weak corroboration (two outlets can repeat one rumor); `sector !== OTHER_UNMAPPED` is a crude actionability test; off-taxonomy is narrated as "held for review" but the gate returns ACT and can draft; source-authority was rejected too broadly (model it at the evidence-ITEM level, not by source name).

**Decision 2 — the rate limiter.** Codex argued: raw bearer token stored as a map key (should be hashed); x-forwarded-for is spoofable off a trusted proxy; a shared APPROVAL_TOKEN as identity lets one caller starve all + a leaked token gets the whole budget; post-auth-only limiting lets an invalid-token flood hammer auth; uniform 30/60s ignores per-route risk (run-exception spends money); the soft expired-sweep isn't a hard memory bound under within-window key rotation; single-instance is a local brake, not a prod control.

## Disposition (primary-model-final)

**Applied now (the one must-fix-now):** Decision-2 raw-token-as-key → **FIXED**: the limiter SHA-256-fingerprints the bearer before it becomes a map key (`lib/server/rate-limit.ts`; pinned by `evals/rate-limit.test.ts` — stable per token, distinct per token, raw secret absent).

**Tracked as v2 / prod-path design debt (real, but NOT shipped-MVP bugs — the behavior is intentional, disclosed, and scenario-gated):**
- *Refusal v2:* split classification-confidence from a deterministic evidence-confidence + calibrate the threshold against a labelled ACT/REFUSE set; a richer disposition enum (ACT / VERIFY_ONLY / NEEDS_CORROBORATION / NEEDS_TAXONOMY_REVIEW / NO_DIRECT_EXPOSURE); evidence-ITEM-level authority (a per-signal `verified`/primary flag — the documented "source-authority" future option); semantic same-event corroboration (not just distinct labels); force off-taxonomy → no outbound drafts.
- *Limiter prod-path:* bearer-key only after validated auth; trust XFF only behind a known proxy; per-operator tokens; a cheap pre-auth coarse limiter; per-route limits (tighter on run-exception); a hard key ceiling vs the soft sweep; Redis/gateway for multi-instance.

## Round 2 — APPROVED

Codex re-reviewed the disposition: **"MUST-FIX-NOW: none."** The fingerprint fix is confirmed; the tracked items are "real design debt, but not shipped-MVP correctness bugs under the stated contract" (the confidence/corroboration rule + the no-source-authority limit are disclosed in the README + design-validation doc; hurricane/bankruptcy ACT and thin-evidence REFUSE are scenario-pinned; the limiter items are V2/prod-path under the single-instance boundary, secure routes reject before the limiter). VERDICT: APPROVED.

**Outcome:** the design grill is discharged — one real hardening applied, the growth edges documented as a roadmap, the shipped MVP confirmed sound for a single-instance portfolio artifact with disclosed limits.
