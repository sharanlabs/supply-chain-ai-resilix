# Plan Review Log: Customs Enforcement-Defense Copilot (PLAN-CUSTOMS-DEFENSE-2026-07-02.md)

Act 1 (grill) complete — 6 contestable decisions resolved interactively with the owner 2026-07-02 and applied
as plan v1.1: (Q1) D0 exempt from the interview kill-gate, D1–D7 hard-blocked, PROCEED/PIVOT/KILL template
pre-written; (Q2) prior-disclosure = flagship demo scenario, CF-28/29 = build-order #1; (Q3) SC2 measurement
precondition — ≥40-case golden set, ≥15 under-evidenced, real-EAPA-weighted; (Q4) ONE workflow-first desktop
surface for broker + importer operators; (Q5) free cross-family through D0–D5, enterprise-tier recalibration
before any real-customer pilot; (Q6) kill-gate recruitment time-box 2026-08-15.

MAX_ROUNDS=5. PLAN_FILE=docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md. Codex read-only every round via
~/claude-os/bin/codex-guarded. Round transcripts appended below. This same Codex session also carries the
recorded research re-test obligation (whitespace claim · 15-player falsifier list · EO 14411 status —
deferral ≠ pass).

## Round 1 — Codex (thread 019f24c1-0836-7571-9fd0-bbafb9c86a9c)

Applied read-only review. Method: repo + evidence-trail analysis only, no live web re-verification.

**Part 1 — Plan Defects**
1. The “~90% transfers” claim is overstated. Existing quarantine strips one `PublicSignal.summary`, not arbitrary uploaded BOMs, production records, broker emails, PDFs, or OCR text ([quarantine.ts](/Users/sharan_98/Desktop/supply-chain-ai-resilix/lib/agents/actionops/quarantine.ts:6)).
Fix: add a customs evidence-ingestion design with per-document quarantine, extraction, provenance, and prompt-boundary tests before D2.

2. The existing refusal gate is not a customs sufficiency gate. It only refuses when a disruption signal is uncorroborated, low-confidence, and has actionable exposure ([recommendation.ts](/Users/sharan_98/Desktop/supply-chain-ai-resilix/lib/agents/actionops/recommendation.ts:13)).
Fix: define separate deterministic sufficiency predicates for prior disclosure, CF-28/29, EAPA, UFLPA, and penalty response.

3. Produce-time gatekeeper does not block raw-text injection leaks. The repo explicitly says injection leak detection is outside the gatekeeper; citation/entity checks can pass while raw text leaks ([injection-redteam.ts](/Users/sharan_98/Desktop/supply-chain-ai-resilix/lib/evals/injection-redteam.ts:145)).
Fix: customs packet gate must include output-safety leak checks, not only eval-time red-team scoring.

4. Existing packet schema is disruption-war-room shaped, not legal-defense shaped: `threatCard`, `exposureResults`, `supplierMessages`, and `actionItems` ([schemas.ts](/Users/sharan_98/Desktop/supply-chain-ai-resilix/lib/schemas.ts:661)).
Fix: create an explicit `CustomsDefensePacket` contract rather than stretching `DecisionPacketV2`.

5. Existing DB projections are keyed to `disruption_events`, not notices, entries, evidence exhibits, deadlines, or defense matters ([schema.ts](/Users/sharan_98/Desktop/supply-chain-ai-resilix/db/schema.ts:265)).
Fix: add isolated customs tables or keep D0/D1 file-backed until a customs persistence design is reviewed.

6. Action taxonomy has no defense packet dispatch type; current outward types are supplier email, RFQ, ERP case ([action-taxonomy.ts](/Users/sharan_98/Desktop/supply-chain-ai-resilix/lib/server/action-taxonomy.ts:45)).
Fix: add `COUNSEL_PACKET_REVIEW`, `DEFENSE_PACKET_EXPORT`, and maybe `CBP_SUBMISSION_PREPARED`, all irreversible and gated.

7. Legal boundary is too optimistic. “Never files” is necessary but not sufficient for UPL/customs-business risk, especially when brokers are first buyers.
Fix: move a narrow trade-counsel pre-review before D2/D4, not only before real deployment.

8. Broker-first adoption is under-tested. EO §4(a) exposure may make brokers risk-averse or conflicted, not eager buyers.
Fix: interview brokers, importer compliance owners, and trade counsel separately; require one positive signal from each role or narrow the ICP.

9. ICP-052 “penalty calculator” is underspecified. Mitigation can depend on culpability, prior record, cooperation, revenue loss, and discretion; treating it as deterministic math risks false precision.
Fix: output bounded deterministic estimates plus cited assumptions, never “the” penalty outcome.

10. EO 14411 handling is directionally careful but still risky. D1 says EO-directed floors go into a policy table; if final rules diverge, prior demos may encode a non-operative rule ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:152)).
Fix: separate `operative`, `directed_pending`, and `scenario_only` policy layers with tests for divergence/rollback.

11. EAPA public PDFs are weak ground truth for “under-evidenced origin claim” labels. Final determinations do not necessarily expose the full importer evidence file.
Fix: require label provenance: adjudicated insufficiency, omitted-record synthetic, counsel-labeled, or uncertain.

12. Golden-set size is too small for the safety claim. “0 false-proceed” over ≥15 under-evidenced cases is a suite result, not calibration.
Fix: add blind holdout, mutation families, per-workflow minimums, and confidence intervals.

13. D0 mixes EAPA fact patterns, CF-28/29 first build, and prior-disclosure flagship.
Fix: choose one first workflow for D0-D3, then add others as separate matrix dimensions.

14. Data privacy is missing. Real customs evidence will include confidential supplier, entry, invoice, and potentially privileged material.
Fix: add retention, encryption, access control, redacted logging, export controls, and privilege-handling requirements before any upload surface.

15. Observability is too generic. “Existing logger” does not cover evidence-chain audits, rule-feed freshness, extraction provenance, policy version, refusal reasons, or human override reasons.
Fix: define domain telemetry and audit events as acceptance criteria.

16. “Desktop only” is owner-locked, but accessibility still matters; no mobile work does not waive keyboard, zoom, screen-reader, or narrow-window robustness.
Fix: keep `verify:full` plus explicit desktop accessibility and zoom checks.

**Part 2 — Research Re-Test**
Method for all three claims: evidence-trail analysis only, using the recorded research appendix and portfolio. A separate live re-verification is assumed to run elsewhere.

(a) Defense-side whitespace claim: the evidence supports “not falsified by the scanned product pages,” not “no shipped AI product exists.” The trail admits absence-of-player evidence is candidate by nature, and the falsifier table is product-page based ([threads](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/RESEARCH-threads-digests-2026-07-02.md:160)). Alternative explanations survive: private law-firm tools, broker managed-service tooling, custom Harvey/CoCounsel deployments, Big-4 internal accelerators, or Caspian treating protests/PSCs as the first defense surface. Falsifier missed: demo calls, careers pages, customer-only modules, partner portals, and internal deployments.

(b) 15-player falsifier list is not structurally complete. It covers obvious customs startups, government-side risk vendors, Big-4 as services, and broad legal AI, but would systematically miss legal-tech custom deployments, ABI/broker software vendors, GRC/trade-management suites, law-firm knowledge products, document-AI vendors packaged inside services, and private enterprise tools. Fix: expand falsifier classes, not just named competitors, and require evidence from product pages, careers, docs, marketplace listings, and practitioner interviews.

(c) EO 14411 status is recorded responsibly: signed 2026-06-03, rule not codified as of 2026-07-02, “directed, not yet codified” wording discipline ([portfolio](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/USE-CASE-PORTFOLIO-2026-07-02.md:84)). The plan’s versioned policy table is necessary but not sufficient if the rule diverges. The calculator must not treat the 50% floor as operative; demos must label it as pending-policy scenario; rule-watch tests must cover softened, delayed, enjoined, or materially different final rules.

VERDICT: REVISE
### Claude's response (round 1 → plan v1.2, primary-model-final)
ACCEPTED 13/16 as written *(tally corrected 2026-07-02 at the acceptance-gate's route-back — the original read
"14/16 + PARTIAL 2/16", which didn't add up and omitted #13 from the enumeration)*, applied to the plan: #1 evidence-ingestion design named a NEW build (D2 + §3 row 2 honesty
fix + "~90%" claim retired); #2 per-workflow sufficiency predicates (D2); #3 produce-time output-safety leak checks in
the packet gate (D3); #4 explicit `CustomsDefensePacket` contract (D3); #5 file-backed D0/D1 + persistence design
review at D2; #6 named action types `COUNSEL_PACKET_REVIEW`/`DEFENSE_PACKET_EXPORT` (D4) — the "maybe"
`CBP_SUBMISSION_PREPARED` deferred until a real submission-prep workflow exists; #9 bounded estimates + cited
assumptions (D1); #10 three-layer policy table + divergence/rollback tests (D1, §6.5); #11 label-provenance taxonomy
(D0); #13 single-workflow discipline — D0–D3 target the prior-disclosure flagship only, CF-28/29 builds its intake
in parallel but claims no success-criteria coverage until its own matrix dimension + minimums exist (D3);
#14 data-protection precondition at the legal gate (§6.6 new item; prototype structurally excludes real data);
#15 domain telemetry as acceptance criterion (§7); #16 desktop a11y explicit (D5); plus Part 2 (a)/(b) wording
discipline + falsifier-class expansion (§6.4) and (c) folded into #10.
PARTIAL 3/16 with reasons: #7 — full counsel pre-review before D2 rejected as premature spend before the kill-gate;
adopted the narrow form: the kill-gate's counsel interviewee IS the UPL/positioning pre-check, full legal gate stays
pre-deployment (prototype = public+synthetic only, zero exposure). #8 — "positive signal from each role" relaxed to
"≥2 of 3 roles" (a single conflicted role shouldn't hold absolute veto over a 3–5-person qualitative gate); the
three-role structure adopted in full. #12 — holdout/mutation-families/per-workflow minimums adopted; confidence
intervals NOT adopted (n≈40 CIs imply a generalization the claim deliberately avoids — wording stays "0 on this
suite", never a population property).
Round 1's research re-test (Part 2) + the parallel LIVE leg (this session: Caspian surface re-fetch, EO 14411
re-confirmation via FR PDF 2026-11595 + firm alerts, Trava #16 ADJACENT-ONLY, Amari salience raise) are recorded in
portfolio §12. Whitespace claim HOLDS under both legs, with wording tightened per (a).

## Round 2 — Codex (same thread)

Re-reviewed v1.2 read-only against the prior 16 findings and Part 2 items. I did not perform live web verification; I treated the recorded parallel live re-check in portfolio §12 as an input.

**Disposition**
The material defects from round 1 are addressed well enough to implement behind the stated gates.

Resolved:
- Overstated spine reuse is corrected: v1.2 now distinguishes transferable disciplines from disruption-shaped implementations and expands the “new builds” list ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:91)).
- Quarantine, refusal, packet schema, persistence, action types, produce-time leak checks, telemetry, and data protection now have named plan slots instead of vague reuse claims ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:97), [PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:106), [PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:178)).
- Penalty math is now bounded and assumption-cited, with EO 14411 separated into `operative` / `directed_pending` / `scenario_only` layers and rollback/divergence tests ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:161)).
- EAPA label weakness is addressed with label provenance tags ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:151)).
- SC2 now has blind holdout, mutation families, and per-workflow minimums; skipping confidence intervals is acceptable because the claim remains suite-scoped ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:271)).
- The workflow split is fixed for D0-D3: prior-disclosure is the success-criteria path; CF-28/29 cannot claim coverage until it has its own matrix/minimums ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:183)).
- The legal/buyer concerns are narrowed rather than over-solved: three-role interviews, ≥2-role positive signal, and counsel as an early UPL/positioning pre-check are a reasonable gate for a public+synthetic prototype ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:218)).
- Part 2 is materially addressed: whitespace is now “not falsified on scanned surfaces,” falsifier classes are expanded, interviews probe private tooling, Trava is added, Amari salience is raised, and EO status is recorded as directed-not-codified ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:247), [portfolio §12](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/USE-CASE-PORTFOLIO-2026-07-02.md:607)).

**Non-Blocking Nits**
- §9 is stale: the header and §6.4 say the live research re-test is done, but the gate log still marks “Codex research re-test” pending ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:326)). Fix the log before final acceptance-gate paperwork.
- The owner browser queue still names Caspian careers but not the newly expanded falsifier classes / Amari / Trava follow-ups ([PLAN](/Users/sharan_98/Desktop/supply-chain-ai-resilix/docs/claude/PLAN-CUSTOMS-DEFENSE-2026-07-02.md:338)). Add them for continuity.
- The §8 traceability row for D21 still says “existing logger,” while §7 now correctly adds domain telemetry. Align the row to avoid future drift.

These are documentation consistency issues, not material plan blockers.

VERDICT: APPROVED
### Claude's response (round 2 → plan v1.3, CONVERGED)
APPROVED. The 3 non-blocking doc-consistency nits were fixed and self-verified in v1.3 (no third seat run — the
right-size-the-Codex-loop lesson): §9 gate log updated with the actual verdicts; §10 browser queue extended with
Amari/Trava/falsifier-class follow-ups; §8 D21 row aligned to the §7 domain-telemetry criterion. Gate 1 (grill-me-
codex, both acts) and Gate 2 (research re-test, both legs) are CLOSED. Next: acceptance-gate.
