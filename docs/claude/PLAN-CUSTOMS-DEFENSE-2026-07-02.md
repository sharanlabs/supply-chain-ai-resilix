# PLAN — RESILIX Customs Enforcement-Defense Copilot

**Status:** DRAFT v1.0 (2026-07-02) — gates pending: grill-me-codex (design) · Codex research re-test · acceptance-gate.
**Goal (owner-fixed 2026-07-02):** #1 customs enforcement-defense copilot (importer side, counsel-LEVERAGE never
counsel-replacement) + #5 IEEPA/CAPE refund-integrity as time-boxed door-opener + #4 force-majeure verification as a
module of the existing build; **#2 D&D adjudicator = named fallback.**
**Authoritative inputs:** `USE-CASE-PORTFOLIO-2026-07-02.md` (esp. §3, §9A, §11, §12) · `RESEARCH-problem-shortlist-2026-07-02.md`
· evidence appendix `RESEARCH-threads-digests-2026-07-02.md` · the built spine (see §3 mapping).
**Hard sequencing rule:** this plan defines the build; **build COMMITMENT starts only after the owner-led interview
kill-gate (§6.1)**. Nothing in this document authorizes code before that gate.
**Hard product requirement (owner, re-affirmed 2026-07-02):** **desktop web ONLY — no mobile version, no
responsive/mobile design work of any kind.** Applies to every surface, sample, and doc in this plan
([[resilix-web-desktop-only]]).

---

## 0. What this is — plain English first

The US government audits and fines importers at record pace, using AI to pick targets. A company's defense —
confessing an error early to cap the fine (a *prior disclosure*), answering a CBP information request (CF-28/29),
or fighting a duty-evasion allegation (EAPA) — is assembled by hand today: law firms collecting shipping records
and origin evidence over weeks, at consulting prices. A wrong number in that defense becomes legal ammunition
against the company; that's why nobody has trusted AI with it.

RESILIX already built and gated the exact machinery this requires: every number traced to a verifiable source,
hostile documents structurally quarantined, an adversarial AI critic that attacks the evidence before a human sees
it, a calibrated "not yet — here's what's missing" refusal, and a human-approval gate before anything leaves the
building. **The plan: point that governed spine at the customs-defense workflow.** The product makes a
trade-compliance team and their outside counsel ~10× faster on evidence — it never replaces the lawyer and never
files anything itself.

**Technical restatement:** re-instantiate the gated ActionOps pipeline (deterministic-first, authoritative-binding,
quarantine, cross-family Skeptic, refusal, human-gated outbox) on the customs-defense domain: notice/exposure intake
→ quarantined evidence verification → deterministic penalty-exposure math (ICP-052) → cited defense-packet drafting
→ gatekeeper → counsel approval → governed dispatch, with refusal ("insufficient evidence to support the origin
claim — do not disclose yet") as a first-class output.

## 1. Success criteria — the spec (declarative; each has an acceptance test in §7)

| # | Criterion | Bar |
|---|---|---|
| SC1 | **Citation traceability** | 100% of numerals/claims in any emitted packet bind to deterministic tool returns or named source documents; grader-enforced; 0 violations across the golden suite. |
| SC2 | **Refusal calibration** | On the labelled golden set (sound / under-evidenced / adversarial), false-proceed on under-evidenced origin claims = **0** (asymmetric bar, mirrors the Skeptic gate); sound-case proceed rate ≥ 80%; measured, not asserted. |
| SC3 | **Injection resistance** | 0 leaks / 0 number-laundering / 0 throws under the adaptive red-team harness extended with customs-document attack sites (supplier BOMs, production records, broker correspondence). |
| SC4 | **Time-to-packet** | Draft defense packet from intake on a demo scenario in < 5 minutes wall-clock (replay $0; live within budget guard). |
| SC5 | **Counsel gate integrity** | No outward artifact without explicit human approval; outbox/reversibility invariants hold (existing suites re-run green on the new action types). |
| SC6 | **Key-off parity** | The full customs pipeline runs deterministically with zero API keys (synthetic + public corpora); replay-first $0 demo; live-AI adds judgment seams only. |
| SC7 | **Rule-tracking liveness** | FR API + CSMS ingestion detects and surfaces the ~Sep-2026 mitigation-rule revision within 24h of publication (the live demo beat). Until then all claims worded "directed, not yet codified". |
| SC8 | **Legibility** | The standalone layman document passes a fresh-eyes behavioral test (a fresh-context reader explains the product back correctly); dual register held in every artifact. |
| SC9 | **Boundary compliance** | No auto-filing, no "customs business" (19 CFR 111), counsel-leverage positioning in every surface; verified by checklist review at the legal gate (§6.3). |

## 2. Product shape (§11 A1–A7)

**Core workflows (the defense desk), in build order of demo value:**
1. **CF-28/CF-29 response assembly** — CBP asks a question; the system assembles the evidenced answer packet.
   (Highest-frequency workflow; ICPA maintains a member Q&A database on exactly this — demand-proven; least
   legal-risk surface — it's answering the government's own questionnaire.)
2. **Prior-disclosure support** — the "confess before caught" packet: entry population scoping, loss-of-revenue
   math (deterministic), evidence sufficiency check, **the signature refusal** ("do not disclose yet — missing X").
3. **EAPA allegation defense** — evidence packet against a duty-evasion allegation (origin/transshipment proof,
   deadline clocks, public EAPA fact patterns as the calibration corpus).
4. **Focused-Assessment audit response** — the FA Pre-Assessment Survey Questionnaire as a structured intake.

**Fixed positioning (locked; every surface must comply):** counsel-LEVERAGE, never counsel-replacement (A3).
OFF classification / refund-filing / audit-detection adjacency as product core — Amazon builds that in-house,
Flexport gives it away (A4); Flexport's free audit agents are our *top-of-funnel* (every found error is a
prior-disclosure decision), not our competition. Adoption ladder: **brokers first** (EO 14411 §4(a) gives them
personal penalty exposure — a second buyer class), then sub-giant importers, giants last as showcase (A5).
Refusal is a first-class product output (A6).

**Satellites (defined slots, not scope creep):**
- **#5 door-opener (time-boxed, self-liquidating by ~2027):** the **CAPE pre-flight validator** — simulate CBP's
  two-pass validation before filing (line-level mismatch, entry-type eligibility, multi-importer CSV silent-reject).
  Small, unshipped, same buyer + same entry data as #1. Build ONLY as a demo/door-opener artifact after the #1 core
  demo stands; kill automatically when the refund window closes.
- **#4 module:** force-majeure claim verification as an **evidence-verification module of the existing disruption
  spine** (the Skeptic already challenges disruption findings; Jus Mundi's 18k free arbitration awards = precedent
  corpus). Not a company; wired as a mode of the existing product, unchanged priority.
- **#2 fallback (named):** ocean D&D dispute adjudicator — activate only if the falsifier tripwire fires on #1
  (Caspian or another ships a real defense product). The spine mapping in §3 transfers.

## 3. Spine mapping — what exists → its customs counterpart (§11 B8–B14)

~90% of the trust spine transfers (portfolio §Efficiency). Mapping, module by module:

| Built (gated) | File(s) | Customs-defense counterpart |
|---|---|---|
| Authoritative binding (numbers from tool returns only; decisions re-derived in code) | `lib/agents/actionops/recommendation.ts`, `build-packet` path, moat suites | Penalty-exposure math, entry counts, loss-of-revenue figures, deadlines — all from deterministic calculators over entry data + ICP-052 tables; model prose never bound (B8). |
| Structural injection quarantine | `quarantine.ts` + `evals/quarantine.test.ts` static guard | Supplier BOMs, production records, broker correspondence, EAPA exhibits = untrusted third-party docs through the same quarantine shape (B9). |
| Cross-family Skeptic | `skeptic.ts`, `cross-family.ts`, calibration suite | The Skeptic attacks the *evidence chain* (origin proof sufficiency) before counsel sees the packet; recalibrated on customs golden set — labelled TPR/TNR + the real-artifact live check ([[calibration-set-vs-real-finding]]) (B10). |
| Calibrated refusal (NO_ACTION + named gaps) | `recommendation.ts`, refusal regression suite | "Insufficient evidence — do not disclose yet; missing: X, Y" — the signature output (B11). |
| Human gate + transactional outbox + audit trail | `action-executor.ts`, `action-taxonomy.ts`, outbox + reconcile | Counsel approval before ANY outward artifact; defense-packet dispatch = outward class, never auto-fired (B12). |
| Deterministic-first, LLM at judgment seams | whole waterfall + `env-flags.ts` | Math/deadlines/eligibility in code; LLM for narrative drafting + evidence characterization only (B13). |
| Ship-dark discipline | `ENABLE_AGENT_LOOP` precedent, byte-parity moat suites | New domain behind its own flag (e.g. `ENABLE_CUSTOMS_DESK`), key-off byte-parity for the existing product, staged rollout (B14). |
| Transports (Slack/Email/N8N, live-proven) | `lib/server/transports/*` | Counsel/broker notification channels; registry stays env-gated, Noop default. |
| Evals harness (graders, injection red-team, trajectory, judge) | `lib/evals/*`, `evals/*` | Extended with the customs golden set + customs attack sites; same asymmetric promotion bars. |

**The genuinely NEW builds (the honest ~10%):** customs domain schemas (entry/CATAIR slice, notice types, packet
sections) · deterministic penalty-exposure calculator from ICP-052 · corpus ingestion for the machine doors (§4) ·
the edge-case matrix artifact · defense-packet UI surface (desktop-only) · the CAPE pre-flight validator (satellite).

## 4. Data strategy (§11 C15–C18)

**Four modes (C15):** (a) **free/open corpora** — CROSS rulings (221k), EAPA public case PDFs, ICP-052, FA
questionnaire, CIT/CAFC opinions (CourtListener), UFLPA list via OpenSanctions; (b) **live feeds** — Federal
Register API + CSMS-via-GovDelivery (the rule-tracking layer, SC7); (c) **hybrid** — real public fact patterns
(EAPA cases) exercised against synthetic entries; (d) **synthetic** — importer entry data generated against the
**real CATAIR Rev-106 schema** (ACE data is importer-account-only *by design*; synthetic-vs-CATAIR is the honest
demo answer, stated on the glass, never passed off as real).

**The edge-case matrix — one artifact, three jobs (C16):** a single versioned matrix (dimension × case) that IS
(1) the declared coverage document, (2) the parameterization of the synthetic-entry generator, and (3) the eval
suite's case source. Dimensions at minimum: notice type (CF-28/29, penalty, EAPA, FA) × evidence posture (complete /
partial / contradictory / adversarial-injected) × origin complexity (single-country, transshipment pattern,
multi-tier BOM) × deadline state. Coverage is DECLARED + refusal-guarded — outside the matrix the system refuses,
it never improvises (C16).

**Machine doors only (C17):** ingestion wired exclusively to the §9A machine doors (FR API, GovDelivery/CSMS,
OpenSanctions, GovInfo, CourtListener, USITC HTS REST, Census API); the 403-only pages (CBP dashboards, FOIA reading
room, EDIS) stay on the **owner browser queue** — their absence is designed around (synthetic or refusal), never
scraped around and never faked.

**Verify-over-memory (C18):** every load-bearing corpus/claim carries an as-of date; `candidate` labels (the 15%
CAPE rejection rate, the 348-audit dashboard figure) never silently harden — they either get primary verification
(browser queue) or stay labelled.

## 5. Build phases (declarative; each = success criteria + gate, not step lists)

> **Gate zero for ALL phases: the interview kill-gate (§6.1) must clear first.** Phases run teach-first,
> one piece at a time ([[teach-first-then-takeover]]); Codex batched at phase checkpoints (owner doctrine);
> `npm run verify` green at every increment; existing product's key-off byte-parity holds throughout (B14).

- **D0 — Corpus + golden dataset (evals-first, D19; NO pipeline code).**
  DONE = machine-door ingestion for the D0 corpora runs + is cached locally; the edge-case matrix v1 exists with
  the synthetic-entry generator emitting CATAIR-Rev-106-valid records; a labelled golden set (≥ ~20 cases: sound /
  under-evidenced / adversarial, drawn from real EAPA fact patterns + matrix synthetics) with hand-derived oracle
  outcomes; graders extended (citation coverage over customs packets). VERIFY = generator output validates against
  the schema; golden suite runs (all red — nothing built yet — but *runnable*).
- **D1 — Deterministic domain core.**
  DONE = penalty-exposure calculator (ICP-052 mitigation tables + EO-14411-directed floors as a *versioned policy
  table*, swap-ready for the ~Sep rule), entry-population scoper, deadline clocks — pure code, key-off, unit-tested
  against hand-derived oracles (two independent derivations, the P1 discipline). VERIFY = oracle suites green;
  SC6 partial (deterministic path stands alone).
- **D2 — Evidence intake + quarantine + verification.**
  DONE = third-party docs (supplier BOMs, production records) enter only through the quarantine shape; verifier
  checks for origin-evidence sufficiency produce the boolean/enum signals the refusal + Skeptic key off. VERIFY =
  static quarantine guard extended + green; injection red-team (customs sites) 0 leaks (SC3).
- **D3 — Packet + refusal.**
  DONE = defense-packet schema (cited sections, deterministic figures, missing-evidence register); gatekeeper
  blocks uncited numerals; NO_ACTION/"do-not-disclose-yet" refusal with named gaps wired end-to-end. VERIFY =
  SC1 (100% traceability on golden suite) + SC2 (refusal calibration, fn=0 asymmetric bar).
- **D4 — Skeptic + counsel gate + governed dispatch.**
  DONE = cross-family Skeptic recalibrated on the customs golden set (labelled TPR/TNR + live check on a REAL
  fact-pattern artifact, per [[calibration-set-vs-real-finding]]); counsel-approval gate + outbox on the new outward
  action types; transports reused. VERIFY = SC5 + Skeptic calibration recorded; live waterfall run on the flagship
  demo scenario within budget.
- **D5 — Surface + docs + demo.**
  DONE = **desktop-web-ONLY** defense-desk surface (no mobile/responsive scope — owner-locked; extends the war-room
  UI; design-bar memory applies; replay-first $0 demo); the standalone layman document; the FR/CSMS rule-tracking demo beat (SC7). VERIFY = SC4 + SC8 (behavioral
  fresh-eyes test) + e2e/a11y suites green (`verify:full`).
- **D6 (satellite, time-boxed) — CAPE pre-flight validator** as the door-opener demo; kill-switch dated to the
  refund-window close. **D7 (satellite) — #4 FM module** wired as a mode of the existing spine.

**Repo/architecture stance:** same standalone repo (D24); new domain package beside `lib/agents/actionops/`
(e.g. `lib/agents/customsdesk/`), sharing the spine libraries; behind `ENABLE_CUSTOMS_DESK` (default OFF) so the
shipped ActionOps product is byte-identical until promotion. Tech stack: current stack (Next.js/TS/Zod/Postgres,
Gemini + Groq cross-family) unchanged — free-first with the enterprise path documented per phase (D22); no new
paid dependency without an owner call (`resilix-tech-stack-alignment` binds at the model/data tiers).

## 6. Gates & governance (§11 E26–E34)

1. **Interview kill-gate (E26) — BEFORE build commitment. Owner-led.** 3–5 practitioners; **brokers first**
   (EO §4(a) exposure; FedEx-as-broker profile = closest early buyer), then trade-compliance directors.
   Kill/confirm questions (from the research): "who assembles your CF-28 responses today, at what cost/turnaround?" ·
   "would counsel accept a machine-assembled evidence packet they approve?" · "what would make you never touch this?"
   · the Twin probe ("would you run a standing mock investigation if software-priced?" — §8, informs the parked
   proposal without reviving it). **Exit = documented notes + a written PROCEED/PIVOT-to-#2/KILL owner decision.**
2. **Plan-stage cross-model gate (E25/D25) — THIS session:** grill-me-codex on this design + Codex re-tests FROM
   SCRATCH the whitespace claim, the 15-player falsifier list, and EO 14411 status (the recorded deferred-≠-pass
   obligation). Findings disposed primary-model-final; recorded in §9.
3. **Legal-review gate (E27) — before ANY real deployment/customer use.** One trade-counsel opinion covering:
   UPL boundary; 19 CFR Part 111 (the system prepares, humans file — never "customs business"); no-evasion terms
   of use (the refusal is also the compliance story); counsel-reviewed ToS/disclaimers. Prototype phase = public +
   synthetic data only → zero external exposure until this gate.
4. **Caspian tripwire (E28):** re-check product surface + careers at EVERY major gate (log: portfolio §12).
   Trigger = any shipped prior-disclosure/penalty/EAPA-defense/CF-28-29 product → convene fallback decision (#2).
5. **Rule-tracking (E29):** ~Sep-2026 mitigation-rule revision ingested via FR API/CSMS the day it lands; until
   then, every claim says "directed, not yet codified"; the policy table (D1) is versioned for the swap.
6. **Process invariants (E30–E34):** teach-first builds; stage narration with headings maintained under load;
   efficiency+sustainability recorded per phase; same-stroke doc maintenance (this plan + portfolio §12 update
   together); cognitive-partner posture — positions defended with flip conditions.

## 7. Acceptance tests (how DONE is verified, per success criterion)

- **SC1:** golden-suite grader run — `citation coverage = 100%`, 0 unbound numerals (extends `lib/evals/graders.ts`).
- **SC2:** labelled refusal calibration — confusion matrix printed; **fn(false-proceed on under-evidenced) = 0**;
  documented run, spaced ×3 for stability (the Skeptic-calibration discipline).
- **SC3:** adaptive injection red-team over customs attack sites — 0 leaks/0 laundering/0 throws + paired positive
  controls (extends `lib/evals/injection-redteam.ts`).
- **SC4:** timed replay demo + one live run within budget guard; wall-clock recorded.
- **SC5:** outbox/executor suites green on new action types; manual check: no outward dispatch path without
  approval row.
- **SC6:** full pipeline run with zero keys → complete packet or calibrated refusal; byte-parity moat suite for the
  existing product with `ENABLE_CUSTOMS_DESK=false`.
- **SC7:** rule-watch integration test (fixture FR/CSMS bulletin → surfaced alert); live confirmation when the real
  rule publishes (~Sep 2026).
- **SC8:** fresh-context behavioral read-back of the layman doc (lesson: behavioral test, not existence check).
- **SC9:** legal-gate checklist walked with counsel; sign-off recorded before deployment.

## 8. §11 register traceability — 38/38

| Item | Where in this plan | | Item | Where |
|---|---|---|---|---|
| A1 fixed frame | §0, Goal header | | C18 verify-over-memory | §4 |
| A2 entry composition | Goal header, §2 | | D19 evals-first | §5 D0 |
| A3 counsel-leverage | §2 positioning, SC9 | | D20 declarative spec | §1 + §7 |
| A4 off-adjacency | §2 positioning | | D21 budget/observability | §5 (budget guards, existing logger), SC4 |
| A5 adoption ladder | §2, §6.1 | | D22 free-first + enterprise path | §5 stance |
| A6 refusal first-class | §2, SC2, D3 | | D23 desktop-only | §5 D5 |
| A7 portfolio hedge / Twin parked | §2 satellites, §6.1 (Twin probe) | | D24 standalone repo | §5 stance |
| B8 authoritative binding | §3 row 1 | | D25 batched Codex + re-test obligation | §6.2 |
| B9 quarantine | §3 row 2, D2 | | E26 interview kill-gate | §6.1 |
| B10 Skeptic | §3 row 3, D4 | | E27 legal gate | §6.3, SC9 |
| B11 refusal | §3 row 4, D3 | | E28 Caspian tripwire | §6.4, portfolio §12 log |
| B12 human gate/outbox | §3 row 5, D4, SC5 | | E29 rule-tracking | §6.5, SC7 |
| B13 deterministic-first | §3 row 6, D1 | | E30 teach-first | §5 preamble |
| B14 ship-dark | §3 row 7, §5 stance, SC6 | | E31 stage narration | §6.6 |
| C15 four data modes | §4 | | E32 efficiency/sustainability | §6.6 + portfolio §Efficiency |
| C16 edge-case matrix ×3 | §4, D0 | | E33 lossless continuity | §6.6 (same-stroke), HANDOFF discipline |
| C17 machine doors | §4, §9A | | E34 cognitive partner | §6.6 |
| — | — | | F35 dual register | §0 + every phase doc |
| — | — | | F36 layman doc | §5 D5, SC8 |
| — | — | | F37 terms of art + glossary | portfolio §10 referenced throughout |
| — | — | | F38 documentation quality | SC8 + acceptance-gate anti-slop leg |
| — | — | | G open items | §6.1, §10 owner queue |

*(Count: A 1–7, B 8–14, C 15–18, D 19–25, E 26–34, F 35–38, G = 38 items; every row maps to a section above —
no owner-approved exceptions needed.)*

## 9. Gate evidence log (filled as gates run — never pre-stamped)

- **grill-me-codex (design):** ⏳ pending this session.
- **Codex research re-test (whitespace / falsifier list / EO 14411):** ⏳ pending this session.
- **acceptance-gate on this plan:** ⏳ pending this session.
- **Interview kill-gate:** OPEN — owner-led, blocks all D-phases.
- **Legal-review gate:** OPEN — blocks deployment, not prototyping.

## 10. Owner-action queue (surfaced, not performed by the agent)

1. **Practitioner interviews** (THE kill-gate, §6.1) — brokers first; ICPA channel is a candidate recruiting pool.
2. **Browser verification queue** (portfolio §9A end): CBP dashboards/EAPA stats · EDGAR full-text (Deere/VF
   filings first-hand) · FOIA reading room · Caspian careers page · the 15% CAPE-rejection primary.
3. **Flagged videos** via `video-research` (research-stage leftovers).
4. **Push decision** (commit `7ab55f8` + the plan commit are local-only until you say push).
5. **`/autopilot` engagement** for the D-phases once the kill-gate clears (owner toggle).
