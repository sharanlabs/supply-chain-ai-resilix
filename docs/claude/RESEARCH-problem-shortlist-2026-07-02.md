# RESEARCH — Ranked problem shortlist (US supply chain / logistics) — 2026-07-02

> **Stage: research (reopened + reframed by owner 2026-07-02) — this document is the stage-exit artifact.**
> Objective set by owner: find a **real, high-value industry use case or problem** in US supply chain/logistics
> (Amazon / Apple / FedEx / Grubhub-class tier, company-agnostic) where existing solutions are absent or
> demonstrably inefficient, and where a **working governed vertical-AI prototype** could credibly be shown to the
> industry. Excludes run-of-the-mill vertical AI. Deliverable = ranked shortlist only; the owner picks a candidate,
> then the plan stage starts (fresh session). **No plan/roadmap in this doc by design.**

---

## 0. Pivot note (goal re-fix on the record)

This supersedes the June "mid-market procurement wedge" as the anchor (locked 2026-06-11, researched 06-11/06-12/06-19).

**Carries over:** the trust-spine differentiator finding (no incumbent markets citation-grounding / injection defense /
disclosed degradation — `docs/competitive-gap-2026.md`, verified 2026-06-19, re-confirmed directionally 2026-07-02 by
Gartner's 2026-06-30 top-8 trends naming "Decision Governance" + "Product Provenance"); the falsified-claims discipline;
and **the entire RESILIX build as the asset** — evidence-bound numerals (gatekeeper), prompt-injection quarantine,
disclosed degradation, calibrated refusal (NO_ACTION), cross-family Skeptic, human-gated governed execution with audit
trail + transactional outbox, and the three proven transports.

**Retires:** the mid-market procurement buyer persona as the market entry; "disruption war room" as the lead positioning
(it survives as a module — see candidate #4).

**The research question this stage answered:** *which high-value supply-chain decision loops are still stuck on humans
because unaccountable AI can't be trusted there — where a governed, evidence-bound agent is the unlock.*

## 1. Method (3 threads, 2026-07-02, Multi-Source Mandate)

- **Thread A** — publicly evidenced unsolved loops at the giant tier (10-K/earnings admissions, regulator data, forums,
  trade press): 12 evidenced problem loops.
- **Thread B** — saturated-category fence + verify-or-kill on 7 seed hypotheses + unknown-unknowns hunt: most seeds
  KILLED as crowded; 2 survivors + 1 HORIZON find (which became rank 1).
- **Thread C** — falsifier hunt on the rank-1 candidate (15 players checked by product page, dated), primary-source
  hardening, prototypability checks, July-2026 backdrop.

Evidence discipline: load-bearing claims ≥3 sources across ≥2 platform types with as-of dates; magnitudes that could not
be traced to a primary source are marked `candidate`. All fetching quarantined (Law 11).

**The cross-cutting empirical pattern (Thread A, HORIZON):** the giants automate the *enforcement* side of every loop
(Walmart SQEP, Amazon 1P/FBA policy engines, DoorDash trust-and-safety, CBP's own AI via Altana/Exiger contracts) while
the *respondent* side — suppliers, sellers, carriers, drivers, importers — disputes with humans; and each loop fails at
**evidence capture/assembly**, not at policy. That respondent-side evidence loop is exactly trust-spine-shaped.

## 2. The ranked shortlist

Ranking = value at stake × evidenced unsolvedness × underexplored-because-hard × trust-spine fit × prototypability.

| # | Candidate | Value | Unsolved? | Hardness fit | Prototypable | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Customs enforcement-defense / origin-evidence copilot** (importer side) | HIGH | **Not falsified** (15-player hunt) | 1:1 | HIGH (public corpora) | **RECOMMENDED** |
| 2 | **Ocean detention & demurrage dispute adjudicator** | MED-HIGH | No AI-native pure-play found | Strong | HIGH (synthetic + FMC records) | Strong runner-up |
| 3 | Freight cargo-claims adjudication (Carmack evidence packets) | MED | Thinly automated | Good | MED | Weak standalone — attach to a wedge |
| 4 | Supplier force-majeure / disruption-claim verification | MED | Law-firm-served, episodic | Good | HIGH (existing build) | **Module, not company** — nearest to current RESILIX |
| 5 | IEEPA/CAPE refund-claims integrity & reconciliation | HIGH but time-boxed | Broker/law-firm-served | Partial | MED | Wedge into #1's customer, not standalone |

---

### #1 — Customs enforcement-defense / origin-evidence copilot (importer side) — RECOMMENDED

**The problem in industry terms.** US customs enforcement entered a structurally harsher regime while importers' defense
workflow remained artisanal. Executive Order "Strengthening Customs Enforcement" (2026-06-03) sets a **50% floor on
penalty mitigation, a liquidated-damages floor, eliminates mitigation for repeat offenders**, and gives CBP 90 days to
implement (whitehouse.gov; MoFo 2026-06-17; Holland & Knight June 2026). Enforcement is at record pace: **$400M+ duty
evasion uncovered via EAPA across 89 reasonable-suspicion cases in 2025-01→2025-08 (CBP national media release,
cbp.gov newsroom — the one CBP-primary artifact that was directly fetchable; the EAPA statistics pages 403-block, §5.2)**; audits
and penalty recoveries sharply up (348 audits / $192.77M recovered by 2025-06-30 — Bloomberg Tax citing the CBP
dashboard, `candidate`); DOJ False Claims Act customs cases scaling (Ceratizit $54.4M origin-fraud settlement). The
respondent workflow — penalty/liquidated-damages responses, **prior disclosures** (called "the most commercially
underused tool in US customs compliance"), origin/transshipment evidence assembly, Focused-Assessment audit response —
is done today by law firms, Flexport Trade Advisory, Expeditors Tradewin, and Big-4 trade practices, **as human
consulting**.

**Who suffers.** Every US importer of record, giant tier included (Apple: ~$900M tariff cost in one quarter, CNN
2025-05-02; Walmart: "we aren't able to absorb all the pressure," CNBC 2025-05-15; FedEx: $150M de-minimis hit). The
humans in the loop: trade-compliance analysts, customs brokers, trade counsel.

**Evidence of unsolvedness (the falsifier hunt, 2026-07-02 — Thread C, all product pages checked and dated):**
Caspian (drawback/refunds/protests — ADJACENT-ONLY, nearest pivot risk), Gaia Dynamics (classification + IEEPA refund
engine — ADJACENT-ONLY), Pax AI / Zollback (drawback — ADJACENT-ONLY), Amari (broker declaration ops — ADJACENT-ONLY),
Digicust (EU declarations — NO), Sayari (UFLPA 30-day detention-rebuttal documentation — **ADJACENT-PARTIAL, closest
encroacher**, one slice only), Altana (CBP's own UFLPA platform — arms the government side), Exiger/Kharon (screening +
CBP transshipment contract — government side), Harvey/Hebbia (no trade module), Big-4 (human services; KPMG tariff-risk
tool ≠ defense), Flexport/Tradewin/C.H. Robinson (exact S1 jobs as **human** advisory). **Net: no AI product covers the
defense workflow; the closest encroacher, Sayari, ships one slice of it (UFLPA detention rebuttals).** The asymmetry is
citable: CBP's enforcement side is AI-armed (DHS AI use-case inventory; Altana + Exiger contracts) while the importer-
defense side has no shipped AI product beyond that single Sayari slice.

**Why underexplored (the specific hardness — this is why it's whitespace and not an oversight):**
1. **Liability-grade accuracy.** A prior disclosure is an admission against interest; a wrong numeral is disqualifying.
   Generic LLM hallucination risk keeps the loop human — exactly the failure class the RESILIX gatekeeper (every numeral
   sourced or blocked) was built to close.
2. **Adversarial cross-org evidence.** Origin/non-transshipment proof binds supplier production records, BOMs, and entry
   data arriving as untrusted third-party documents — a prompt-injection surface. RESILIX's structural quarantine
   (only one agent sees raw text) is the built answer.
3. **The legal-practice boundary.** Output must be counsel/broker-gated, never auto-filed — RESILIX's human-approval
   spine + audit trail + refusal ("insufficient evidence to support the origin claim — do not disclose yet") is the
   correct product shape, not a compliance afterthought.

**Fit/rework map onto the existing build.** Sentinel→Verifier→Atlas→Simulator→Strategist→Dispatcher→Gatekeeper becomes
signal/notice intake → evidence verifier (entry data, rulings, supplier docs) → exposure mapping (which entries/SKUs) →
penalty-exposure math (deterministic, from ICP-052 mitigation guidelines) → response strategy → drafted response packet
(every numeral cited) → gatekeeper → counsel approval → governed dispatch. The moat invariant (authoritative numbers
from deterministic tool returns, never LLM prose) transfers unchanged. Skeptic critiques the evidence chain.

**Prototypability: HIGH, on public data (all checked live 2026-07-02).** CROSS rulings database (221,152 rulings,
updated 2026-06-30, public); EAPA public case PDFs = real defense-side fact patterns; CBP Focused-Assessment
Pre-Assessment Survey Questionnaire (public PDF); ICP-052 penalty-mitigation guidelines (public PDF); ACE CATAIR
entry-summary schema (Rev 106, 2025-07-23, public); UFLPA entity list (public + machine-readable via OpenSanctions).
Synthetic importer entry data constructible against the CATAIR schema.

**Confidence + open questions.** Pain + regime shift: VERIFIED (≥3 sources, ≥2 platform types). Whitespace: `candidate`
by nature (absence-of-player evidence; stealth invisible). Falsifiers to re-check before commitment: Caspian expanding
from protests into defense (licensed broker = natural expander); Gaia Dynamics roadmap; Sayari widening beyond UFLPA;
any legal-tech shipping a customs module; EO 14411 enjoined or softened. CBP dashboard magnitudes are `candidate`
(cbp.gov 403-blocked to fetchers — needs a browser session).

---

### #2 — Ocean detention & demurrage dispute adjudicator — strong runner-up

**Problem.** Nine carriers collected **$15.4B in D&D from US importers/truckers Apr 2020–Mar 2025 (FMC primary data,
VERIFIED)**; per-diem $75–300+/container/day. Disputes are adversarial (the biller profits), evidence-scattered
(terminal last-free-day changes, appointment-denial records, contract free-time terms, invoice lines), individually too
small for lawyers, too fiddly for ungoverned AI. The FMC billing rule enumerates 13 required invoice fields and a
30-day billing window — making disputes **evidence-decidable**. Charge-complaint volume: 209 received, 118 under
investigation, $2.56M refunded — reported in FMC's FY2026 Congressional Budget Justification (May 2025, primary);
that document would normally carry FY2024 actuals / partial-FY2025 figures, so confirm the fiscal-year attribution
at validation item 4.

**Unsolvedness.** Tooling stops at tracking/visibility (Terminal49 LFD audit trails, BlueCargo per-diem tool, BuyCo);
no funded AI-native dispute-adjudication pure-play surfaced (Thread B). **Caution/open question:** the D.C. Circuit's
2025-09-23 set-aside in *WSC v. FMC* — threads B and C describe its scope differently (billed-party provision §541.4 vs
"properly issued invoices" provision). The exact surviving rule text must be verified against the post-vacatur Federal
Register before relying on the invoice-defect lever. The vacatur *adds* billing ambiguity → more disputes either way
(Jones Walker, Benesch, 2025-10).

**Hardness fit.** Cross-org timestamp-vs-invoice-line evidence binding, refusal when the evidence chain is incomplete,
audit-grade packets for FMC charge complaints — trust-spine-shaped. **Falsifiers:** Loop (fresh $95M, "Exception Agent"
already initiates carrier disputes — one product decision away from ocean D&D); Flexport shipping disputes for its BCO
base; BlueCargo repositioning. **Prototypability:** HIGH — synthetic invoices trivially constructible from the rule's
13 enumerated fields; FMC ALJ decisions public.

---

### #3 — Freight cargo-claims adjudication (Carmack evidence packets) — weak standalone

$725M 2025 cargo-theft losses (+60% YoY, Verisk CargoNet); claims cycles 120+ days, 30–50% recovery (`candidate`,
vendor-cited). Detection/identity is crowded (Highway, Truckstop RMIS, Overhaul, project44's new theft-prevention);
the **post-incident claims loop** is only thinly automated. Hardness fits (fraud-tainted documents = injection surface;
evidence-bound claim packets). But: fragmented low-WTP buyers, insurers own the recovery economics, subrogation overlap.
**Verdict: only viable attached to an existing wedge (e.g., #2's customer), not as the entry.**

### #4 — Supplier force-majeure / disruption-claim verification — module, not company

Live pain (wave of Gulf force-majeure declarations after the 2026 Iran conflict — GTR, Ontier 2026; opportunistic FM
claims a documented arbitration trend). Buyers must demand mitigation evidence; verification is episodic, bespoke,
law-firm-served — no proven software buyer/frequency. **This is the closest candidate to RESILIX-as-built** (the Skeptic
already adversarially challenges disruption findings): fold it into the disruption-response spine as an
evidence-verification module; do not stand it up alone.

### #5 — IEEPA/CAPE refund-claims integrity — time-boxed wedge, not standalone

Post-SCOTUS (Feb 2026) refund scramble is enormous (**$164.7B collected as of 2026-01-01, up to ~$175B refundable —
Penn Wharton 2026-02-20**; CAPE Phase 2 live 2026-06-29; >$95B queued) but government-run, broker/law-firm-served,
self-liquidating (suit windows expire from early 2027), with a claims-finance market already forming (Sidley, Apr 2026)
and Gaia already shipping a refund engine. **Value: same customer, same entry data, same evidence discipline as #1 —
a door-opener into the customs-defense buyer, not a company.**

## 3. Killed / fence (researched and excluded — do not revisit without a trigger)

Crowded or structurally blocked, each verified 2026-07-02 (Thread B): retailer OTIF/deduction chargebacks
(SupplyPike $1B recovered, Glimpse AI-native, Loop $95M); HTS classification + drawback/refund filing (Caspian, Pax,
Zollback, Gaia, Digicust, Amari — the funded 2025 cohort); gig deactivation adjudication (platform in-house gravity +
CX-agent vendors + no worker-side WTP — despite real, HRW-documented pain); recall/FSMA-204 traceability (deadline
pushed to 2028-07-20, crowded); freight-fraud *detection*/identity (Highway et al.); pharma/GPO chargebacks (Model N /
Vistex incumbents); returns fraud (detection incumbents + platform-internal; less deeply scanned — LOW-confidence kill);
IEEPA refunds standalone (see #5). Saturated categories (the fence): forecasting, visibility/control towers, supplier
risk scoring, procurement copilots, brokerage AI agents, freight audit & pay, warehouse robotics.

## 4. Backdrop as of 2026-07-02 (context the plan stage will need)

Tariff stack post-SCOTUS: §122 bridge + §232 modified 2026-06-01 + proposed §301 on 60 countries (Baker Donelson, GT
June 2026). EO 14411 in its 90-day CBP implementation window. Hormuz: contested/unstable but flowing (blockade lifted
6/18, re-declared 6/20, de facto two-way traffic). Suez ~60% below pre-crisis; most Asia–Europe still Cape routing.
ILA–USMX 6-year deal in force; no acute port-labor flashpoint surfaced (`candidate`).

## 5. What desk research cannot close (owner-validation items)

1. **Practitioner interviews** — 3–5 customs brokers / trade-compliance analysts / trade counsel: "walk me through your
   last penalty response / prior disclosure — where does the time go?" (validates #1's workflow assumptions).
2. **CBP primary stats via a browser session** — cbp.gov trade-stats + EAPA statistics pages 403-block fetchers; the
   $192.77M / 348-audit / FY-totals need first-hand confirmation.
3. **Falsifier roadmap checks** — Caspian and Gaia (demo calls or careers-page signals), Sayari beyond-UFLPA scope.
4. **The *WSC v. FMC* vacatur scope** (#2's lever) — read the post-vacatur rule text directly.
5. **Video layer** (flagged, not synthesized): CBP Trade Symposium 2026 / NCBFAA panels on EO 14411; FreightWaves-Highway
   fraud interview; FBA-reimbursement practitioner walkthrough — transcribe via `video-research` before relying.

## 6. Recommendation

**Pick #1 (customs enforcement-defense copilot), carry #5 as its optional door-opener, and keep #4 as a module of the
existing product.** #1 is the only candidate where all five ranking factors are simultaneously high *and* the June-2026
regime shift (EO 14411 + record enforcement) gives it a dated "why now" that is 29 days old. Its hardness profile is the
RESILIX trust spine, 1:1 — the prototype demonstrates a capability class (liability-grade, citation-bound, refusal-capable,
counsel-gated evidence assembly) that neither the customs-AI cohort nor the giants' internal tooling has shipped.
#2 is the fallback if the owner-validation items break #1 (e.g., Caspian ships defense).

The owner picks; the pick becomes the fixed goal for the plan stage (fresh session recommended).

---
*Threads A/B/C digests (full URL evidence trail): `docs/claude/RESEARCH-threads-digests-2026-07-02.md`. Prior
research this builds on: `docs/competitive-gap-2026.md` (2026-06-19), `docs/claude/RESEARCH-us-landscape-2026-06-12.md`,
`shared_reasoning.md` council sessions (06-11, 06-19). Acceptance-gate: SHIP 2026-07-02 (Codex leg deferred by owner
doctrine to the plan-stage checkpoint, which must adversarially re-test this doc's whitespace claim + falsifier list
from scratch, not just review the plan).*
