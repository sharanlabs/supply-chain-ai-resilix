# RESILIX — Use-Case Portfolio: US Supply Chain & Logistics

> **Status: LIVING DOCUMENT — v1.0 (2026-07-02). All three gap-fill sweeps MERGED:** data-source inventory
> (~35 live checks — §9A) · competitor/workflow gap-fill (deltas flagged inline with ⚠) · **insider-demand
> evidence (jobs / filings / practitioner / conference / buy-vs-build — it independently reproduced the
> shortlist ranking: #1 strongest across all five evidence classes; #4 absent in every class).** Grounded in
> the research shipped 2026-07-02 (`RESEARCH-problem-shortlist-2026-07-02.md`, acceptance-gate SHIP; full URL
> trail in `RESEARCH-threads-digests-2026-07-02.md`).
>
> **Purpose:** each use case here is documented to be *buildable in the near future* — any one of them can be
> promoted to the fixed goal. This is a portfolio, not a single-winner record. The current recommendation is #1;
> the owner's pick is the pending gate.

---

## 0. How to read this document

Every use case is written in **two registers, side by side**: plain English first (anyone can read it), the
industry's own terms second (professionals will recognize their world). Terms of art are *italicized* on first
use and defined in the **Glossary** (§10). Numbers carry as-of dates; anything that could not be traced to a
primary source is marked `candidate`. Nothing here is asserted from model memory — load-bearing claims were
fetched live and dated, per the project's verification discipline.

## 1. The selection lens — how an insider chooses

We evaluate every candidate the way a professional *inside* a giant-tier company (an Amazon/Apple/FedEx/
Walmart/Grubhub-class importer, shipper, or platform — company-agnostic) would when proposing an AI solution
internally. They do not choose from research aesthetics; they choose where they can defend a budget request.
Four questions decide it:

| # | The insider's question | What it means for us |
|---|---|---|
| L1 | **Which cost line do I own that this attacks?** | The use case must map to a quantified, recurring P&L line (penalties paid, *D&D* spend, unrecovered claims) — not a diffuse "risk". |
| L2 | **What gives me executive air cover *now*?** | A dated regulation, court decision, or loss event — the "why now" a VP will recognize. |
| L3 | **Is the data already inside my company?** | The AI must run on data the insider already controls (their own entries, invoices, contracts) plus public corpora — no new data-procurement project. |
| L4 | **Will legal/risk sign off?** | Output must be human-gated, citation-bound, and refusal-capable — or the proposal dies in review. This is where governed AI *is* the unlock. |

Each use case below carries an **Insider's business case** section answering L1–L4, backed by the
insider-demand sweep (2026-07-02: job postings, SEC-filing signals, practitioner infrastructure, 2026
conference agendas, buy-vs-build checks). **The sweep independently reproduced the shortlist ranking** —
#1 populated all five evidence classes; #4 was absent in every class (absence recorded as a finding).
Known evidence gaps: EDGAR full-text search and Reddit were fetcher-blocked — direct 10-K pulls and forum
threads need a browser session; secondary sources carried those slots, marked inline.

## 2. The cross-cutting pattern (why these five, and not the crowded stuff)

Across US supply chain, the **enforcement side of every high-stakes loop is already AI-armed** — customs runs
AI targeting (Altana, Exiger under CBP contract), carriers run automated billing engines, platforms run policy
engines, retailers run compliance-chargeback systems. The **respondent side** — importers, shippers, suppliers,
claimants — still answers with humans assembling documents by hand. Every loop fails at the same place:
**evidence capture and assembly**, not policy knowledge.

That is precisely the shape of the asset we already built and gated: a governed evidence-assembly spine —
every numeral bound to a deterministic source (never model prose), hostile documents quarantined against
*prompt injection*, an adversarial cross-family *Skeptic* that challenges findings, calibrated refusal
(*NO_ACTION*) when evidence is insufficient, and human-approved, audited execution. The portfolio question is
never "what do we build" — it is **which evidence battlefield we enter first with the weapon we have.**

---

## 3. Use case #1 — Customs enforcement defense (importer side) — **RECOMMENDED**

### Plain English
The US government audits and fines companies that import goods, at record pace, using AI to pick its targets.
When a company gets a penalty notice — or wants to confess an error before it's caught (which caps the fine) —
its defense is assembled by hand: law firms and consultants collecting shipping records, supplier documents,
and origin evidence over weeks, at consulting prices. A wrong number in that defense can itself become legal
ammunition against the company. That is why no one has trusted AI with it — and why a governed AI that shows a
receipt for every number, and says "not yet" when the evidence is weak, changes the economics of the entire
workflow.

### The problem in industry terms
- **Regime shift (the L2 trigger) — ✅ PRIMARY-VERIFIED against the official Federal Register text
  (doc 2026-11595, signed 2026-06-03, published 2026-06-10; fetched via the FR API 2026-07-02):**
  EO 14411 §4(c) verbatim: *"establishing a minimum penalty floor of not less than 50 percent of the assessed
  penalty, absent exceptional circumstances that materially impact national security"* + *"establishing a
  minimum liquidated damages floor"* (no percentage specified — refine claims accordingly) + *"eliminating
  mitigation for repeat offenders."* The 90-day deadline applies to the mitigation-standards revision (§4(c));
  other provisions run 45/90/180 days. §4(b) directs **prioritized EAPA enforcement**. ⚑ NEW from the primary
  text: **§4(a) imposes maximum penalties on customs BROKERS "who fail to conduct due diligence, repeatedly
  represent noncompliant clients"** — brokers now carry personal enforcement exposure, making them a second
  buyer/champion for evidence-diligence tooling (and reinforcing that our product must never itself act as a
  broker). (Secondary confirmations: MoFo 2026-06-17; Holland & Knight, June 2026.)
- **Implementation status at the RULE level — checked live 2026-07-02:** the Federal Register contains **zero
  agency documents citing EO 14411 beyond the EO itself** (two API queries: term + agency-scoped), and no CSMS
  implementing guidance on the mitigation provisions surfaced. **The 90-day mitigation-standards revision
  window runs to ~2026-09-01 and CBP has not yet published the revised rules.** The current operative baseline
  is CBP's existing ICP "Mitigation Guidelines: Fines, Penalties, Forfeitures and Liquidated Damages."
  *Two consequences:* (1) honest-claims discipline — the 50% floor is **directed policy, not yet codified
  regulation**; say "signed and directed, codification due by ~September 2026," never "in force." (2) Timing
  is *better* than recorded: the rule wave lands during our build window, and the product's guidance-ingestion
  layer (FR API + CSMS side-door, §9A) is exactly the machinery that tracks the revision the day it publishes —
  a live demo beat, not a risk.
- **Enforcement volume:** $400M+ duty evasion uncovered via *EAPA* across 89 reasonable-suspicion cases
  2025-01→2025-08 (CBP national media release); 348 audits / $192.77M recovered by 2025-06-30 (Bloomberg Tax
  citing the CBP dashboard, `candidate` — CBP stats pages block automated fetching; first-hand browser
  verification is an open validation item); DOJ False Claims Act customs cases scaling (Ceratizit $54.4M
  origin-fraud settlement).
- **Cost lines at the giant tier (L1):** Apple ~$900M tariff cost in one quarter (CNN 2025-05-02); Walmart "we
  aren't able to absorb all the pressure" (CNBC 2025-05-15); FedEx $150M *de minimis* hit.

### How it's handled today — and where it bleeds
*Prior disclosures* (called "the most commercially underused tool in US customs compliance"), penalty and
liquidated-damages responses, origin/*transshipment* evidence assembly, and *Focused Assessment* audit
responses are performed as **human consulting**: trade counsel, Flexport Trade Advisory, Expeditors Tradewin,
Big-4 trade practices. Weeks of elapsed time, consulting price points, and quality bounded by whoever is
staffed — while the deadline clock (e.g., EAPA response windows) runs.

### Competitor landscape (as of 2026-07-02 — 15 players checked by product page, dated)
No AI product covers the defense workflow. Nearest encroacher: **Sayari** — one slice only (*UFLPA* 30-day
detention-rebuttal documentation). Adjacent-only: Caspian (drawback/refunds/protests — the most natural
expander, watch it), Gaia Dynamics (classification + IEEPA refund engine), Pax AI, Zollback, Amari, Digicust
(EU). Government-side (arming the enforcer, not the respondent): Altana (CBP's UFLPA platform), Exiger, Kharon.
No trade module in Harvey/Hebbia (legal AI). Big-4 + forwarder advisory = human services. **The asymmetry is
citable: CBP's enforcement side is AI-armed; the importer-defense side has no shipped AI product beyond the
single Sayari slice.**

### The AI solution (governed vertical agent — maps 1:1 onto the built spine)
Signal/notice intake → evidence verification (entry data, rulings, supplier documents — quarantined) →
exposure mapping (which entries/SKUs) → **deterministic penalty-exposure math** from CBP's own published
mitigation guidelines (ICP-052) → response strategy → **drafted response packet with every numeral cited** →
gatekeeper → **counsel approval** → governed dispatch. The signature output class: *"insufficient evidence to
support the origin claim — do not disclose yet; here is exactly what's missing."* The Skeptic critiques the
evidence chain before any human sees the packet.

### Why it's whitespace and not an oversight (the hardness IS the moat)
1. **Liability-grade accuracy** — a prior disclosure is an *admission against interest*; hallucination is
   disqualifying. (Our gatekeeper: every numeral sourced or blocked.)
2. **Adversarial cross-org evidence** — supplier production records, BOMs, entry data arrive as untrusted
   third-party documents = injection surface. (Our structural quarantine.)
3. **The legal-practice boundary** — output must be counsel/broker-gated, never auto-filed. (Our human-approval
   spine + audit trail + refusal.)

### Insider's business case (L1–L4)
- **L1:** trade-compliance owns penalties/duties paid — a named, board-visible line since the 2025 tariff stack.
- **L2:** EO 14411's 90-day implementation window is running *now*; repeat-offender mitigation elimination makes
  every prior case a compounding risk.
- **L3:** the importer's own ACE entry data + supplier docs + public corpora — nothing to procure.
- **L4:** counsel-gated, citation-bound, refusal-capable is the *only* form legal would ever approve — and no
  incumbent offers it.

**Insider-demand evidence (sweep 2026-07-02 — the strongest of all five use cases; every class populated):**
- *Jobs:* 3,000+ open US trade-compliance roles (early 2026), base salaries +12–20% over 2024, a named
  "pronounced shortage" of qualified professionals, and data/technology proficiency "moved from a
  differentiator to a near-requirement" (Gateway Recruiting 2026-03-27, cross-checked against listing volume).
  Amazon Global Trade Services hiring live 2026-07-02 ("rollout of controls and audits," "main point of
  contact for regulators").
- *Filings:* Greenbrier (NYSE: GBX) is in a live adverse EAPA determination (CBP case 8183, determined
  2026-05-18) and publicly quantified the supply-chain cost risk (2026-05-21, verified ≥2). Macro: 300+
  S&P 500 companies mentioned "tariff" in Q1-2025 MD&A vs 86 a year earlier (Calcbench via Bloomberg Tax).
  DOJ–DHS **Trade Fraud Task Force** stood up 2025-08-29 — "tariff problems are increasingly treated as
  potential fraud."
- *Practitioner infrastructure:* ICPA maintains a standing member Q&A database for **CF-28/CF-29 responses**
  (answering CBP inquiries) — insiders already trade notes on exactly this workflow; also a potential
  design-partner channel.
- *Conferences (3 independent 2026 agendas):* AAEI ("Customs Executive Order — EAPA investigations"),
  ATCC ("whether to voluntarily self-disclose to DOJ and/or commence a prior disclosure before CBP"),
  ICPA ("Anatomy of an EAPA Investigation").
- ⚠ *Buy-vs-build, said loudly:* giants build the **adjacent** layer in-house (Amazon's internal "trade
  intelligence systems" for classification/duty logic — job-req evidence), and Flexport ships **free** AI
  customs-audit agents ("2026 = the Year of the Audit," 2026-02-26). Any product adjacency into
  classification/refunds hits both build gravity and price-zero competition. **No evidence anyone — giant or
  vendor — has built the defense workflow itself** (penalty responses, prior disclosures, EAPA defense,
  audit response); it still flows to law firms. That is the whitespace holding.
- **Positioning consequence (decisive nuance):** no job req names prior-disclosure/penalty work — the insider
  champion is a trade-compliance director **currently paying outside counsel**. The product must sell as
  **counsel-leverage** (make the trade-compliance team + their lawyers 10× faster on evidence), never
  counsel-replacement — which is exactly what the human-gated, citation-bound architecture is.

### Data sources (quantitative + qualitative — all public/free, checked live 2026-07-02)
CROSS rulings database (221,152 rulings, updated 2026-06-30) · EAPA public case PDFs (real defense-side fact
patterns) · CBP Focused-Assessment Pre-Assessment Survey Questionnaire · ICP-052 penalty-mitigation guidelines ·
ACE CATAIR entry-summary schema (Rev 106, 2025-07-23) — the basis for **synthetic importer entry data** ·
UFLPA entity list (via OpenSanctions: 304 entities, machine-readable JSON/CSV, processed 2026-07-02 — the
dhs.gov original 403-blocks fetchers).

**Extended inventory (sweep-verified 2026-07-02):** CIT slip opinions (current to 2026-07-01, free) + CAFC
opinions via the free CourtListener mirror · USITC DataWeb (free API with registration) + HTS REST API (no
auth — returned valid JSON on a live test today) · Census international-trade API (free key) · Federal
Register API (no auth; the HTML pages block fetchers, **the API fetches clean**) · **CSMS bulletins via
GovDelivery — the CBP side-door:** cbp.gov 403-blocks bots, but individual CSMS guidance bulletins fetch
cleanly (verified today) · USITC EDIS (AD/CVD + evasion-adjacent dockets — origin-evidence feed; free with
registration) · CBP FOIA reading room (browser-only). **Honest gaps (design around, don't paper over):**
prior-disclosure/penalty statistics are unpublished (FOIA/browser territory); ACE entry + liquidation data is
importer-account-only *by design* → **synthetic entries against the CATAIR Rev-106 schema is the correct demo
answer**, not a workaround.

### Build readiness + open validation
Prototypable HIGH on public data + synthetic entries. Open items: practitioner interviews (owner);
CBP dashboard/EAPA stats via browser session (pages 403-block fetchers); Caspian/Gaia roadmap falsifier checks;
plan-stage Codex gate must re-test the whitespace claim from scratch (recorded obligation).

### Legal posture (assessment, not legal advice — a trade-counsel review is a plan-stage gate)
Building this attracts no adversarial government attention **by design of what it is**: compliance/defense
tooling is a legitimate, openly-advertised industry (law firms, Big-4, brokers do this work publicly, at
conferences CBP officials attend). CBP's own doctrine is *informed compliance* — the agency publishes the very
guides (ICP series) this system builds on, precisely so importers comply; and the *prior disclosure* mechanism
exists in statute (19 U.S.C. §1592(c)(4)) **to encourage self-reporting** — a tool that helps companies use it
correctly serves the government's own stated goal. The system's architecture is itself the legal safeguard: it
assembles *truthful* evidence, refuses weak claims, never auto-files, and leaves an audit trail — engineered
against the one thing that genuinely attracts enforcement (false statements to the government).
**Boundaries to hold (the plan-stage legal-review checklist):**
1. **No unauthorized practice of law** — sell as a professional's tool (counsel-leverage positioning, already
   locked); disclaimers + ToS reviewed by counsel before any customer use.
2. **No "customs business" (19 CFR Part 111)** — filing/transacting with CBP on another's behalf requires a
   broker license; the system prepares evidence for licensed humans, it never files. EO 14411 §4(a)'s new
   broker penalties make this boundary sharper (and make brokers customers, not competitors).
3. **Never assist concealment/evasion** — the refusal design + explicit terms of use; the tool declines to
   construct origin narratives unsupported by evidence (this is also the product's selling point).
4. **Data access through official machine doors within their terms** (FR API, GovInfo, CourtListener, etc. —
   §9A); no scraping around blocks.
Prototype phase = public + synthetic data only → zero external exposure. Before first real deployment: one
trade-counsel opinion (UPL, ToS, the Part-111 boundary). That is the professional floor, not paranoia.

⚠ **Falsifier salience RAISED (2026-07-02 competitor sweep):** Caspian now markets itself as an "AI-Native
Trade Compliance & Duty Recovery Platform" and ships **"Caspian Refund Advance"** (pays recovery upfront,
collects from CBP — productized claims finance). It is expanding aggressively along the recovery axis and is
a licensed-broker one step from protests/defense work. This does NOT falsify #1 today (recovery ≠ enforcement
defense; no defense product shipped), but it is the named falsifier moving — check its roadmap/careers signals
before the goal is fixed, and re-check at the plan-stage Codex gate.

---

## 4. Use case #2 — Ocean detention & demurrage (D&D) dispute adjudicator — strong runner-up / designated fallback

### Plain English
When shipping containers sit too long at a port, ocean carriers charge late fees — $75–300+ per container per
day — and the party writing the bill is the one profiting from it. US importers and truckers paid **$15.4B**
in five years. Many charges are disputable (the port was closed; no pickup appointment existed), but the
evidence is scattered across terminal records, appointment systems, and contracts — and each bill is too small
to hire a lawyer over. So companies eat them.

### Industry terms + numbers
$15.4B collected by nine carriers Apr 2020–Mar 2025 (**FMC primary data, VERIFIED**). The FMC billing rule
enumerates **13 required invoice fields** and a 30-day billing window — disputes are *evidence-decidable*.
Charge-complaint flow: 209 received / 118 under investigation / $2.56M refunded (FMC FY2026 Congressional
Budget Justification, May 2025 — fiscal-year attribution to be confirmed, validation item).

✅ **Legal question RESOLVED (2026-07-02 sweep, ≥3 sources: Benesch · Holland & Knight 2025-10 · FMC's own
statement + the D.C. Cir. slip opinion):** the *WSC v. FMC* vacatur struck **only §541.4** (the billed-party
provision — the two prior thread descriptions referred to the same section). The **13 required invoice fields
(§541.6), the 30-day billing deadline, and the non-payment lever for defective/late invoices remain fully in
force** — synthetic invoices can be built confidently against them. The vacatur re-opens *who can lawfully be
billed* (contract privity), now decided per-invoice — and enforcement is live: ⚠ **Maersk paid the FMC $1.9M
plus refunds/waivers (May 2026, verified ≥2)** for billing detention to parties not bound by its contracts.

### Today's workflow + competitors (sweep-verified 2026-07-02)
**How it's done today:** manual, spreadsheet-and-email — reconcile free time vs carrier tariffs, email
disputes through each carrier's channel inside the 30-day window; carrier answers in 30 days. First-person
practitioner pain (drayage): $16,780 per-diem billed six weeks after on-time return, disputed twice, denied,
paid anyway under threat of pickup shut-out at 30+ terminals. Documented-dispute win rate ~40%
(`candidate`, blog-tier).

⚠ **Whitespace is NARROWER than the shortlist recorded.** Three products shipped since the prior scan:
**BlueCargo** repositioned to full freight-audit-&-pay selling "evidence-backed disputes" (claims a 95%
dispute success rate — vendor-claimed `candidate`) — the closest incumbent; **Windward** launched
"D&D Automation" (2025-02, Gen-AI tariff/contract ingestion + instant invoice verification — audit layer, no
dispute filing); **Flexport** shipped "Demurrage & Detention Defender" (Fall 2025 — prevention/visibility for
its own customers; note Flexport is *also a D&D biller* — it faces an FMC complaint over its own charges).
Terminal49 = evidence-capture only; Loop = adjacent-expanding. **No AI-native dispute-adjudication pure-play
exists** — the un-owned slice is specifically **adjudication-grade evidence packets + FMC-complaint
escalation + the fresh privity lever** ("can this party even be billed?" — the post-§541.4 vacuum the Maersk
settlement just priced at $1.9M), which no visibility vendor touches.

### The AI solution
Evidence-binding dispute adjudicator: ingest invoice lines + terminal records + appointment logs + contract
free-time terms → bind every contested line to timestamped evidence → draft an FMC-grade dispute packet →
refuse on incomplete chains. Same spine, different docket.

### Insider's business case
L1: D&D spend is a named logistics-finance line (importers/truckers). L2: post-vacatur billing ambiguity + the
FMC complaint channel. L3: the shipper's own invoices + booking records. L4: dispute packets are
outbound-but-low-liability (vs #1) — an easier first legal sign-off.

**Insider-demand evidence (sweep 2026-07-02 — second-strongest):** "demurrage analyst" is an established job
category (4,000+ LinkedIn US results, 232 new; avg $75,883/yr) and **"dispute" appears verbatim in live job
duties on both sides of the table** — carrier side (OOCL: "review and assist customer detention and demurrage
invoice enquiries and disputes") and even AI-ops firms staff it with humans (Expedock hiring for "disputing
incorrect carrier detention invoices"). TPM26's shipper agenda names "driving down detention and demurrage
costs"; FMC removed the vacated §541.4 from the CFR on 2025-12-29 (the surviving levers re-confirmed by a
second independent source). *Weaknesses, honestly:* no giant-tier shipper req dedicated to D&D disputes was
isolated; no direct 10-K language retrievable (EDGAR fetcher-blocked); and platform encroachment is one
product-decision away (project44's "AI Ocean Exceptions Agent," 2026-03, ~1M automated carrier
communications/yr — visibility/exception layer, adjudication still human).

### Data sources (sweep-verified 2026-07-02)
FMC D&D data page ($15.4B figure verified live; chart only — **no raw download**; time series needs FOIA or
transcription) · FMC Reading Room: proceedings + ALJ initial decisions, searchable, free · 46 CFR 541 via
GovInfo bulkdata XML (eCFR HTML blocks fetchers) — §541.6's 13 fields = the **synthetic invoice schema** ·
regulations.gov docket FMC-2022-0066 via free API — industry comments plausibly contain redacted real invoice
exemplars (`candidate`) · FMC requires marine-terminal free-time/demurrage schedules to be **publicly
available** — a lawful basis for free-time terms even where port sites block bots. **Honest gaps:** port
last-free-day/appointment-denial event data is not public anywhere (commercial: Terminal49/BlueCargo) — this
core evidence element must be **synthetic or customer-supplied**; no public D&D invoice corpus exists.

---

## 5. Use case #3 — Freight cargo-claims adjudication (Carmack) — attach-only, not an entry

### Plain English
Cargo theft hit **$725M in 2025** (+60% YoY). After a loss, getting paid back takes 120+ days and often
recovers less than half — a paperwork war of *bills of lading*, delivery records, and valuation evidence.

### Verdict (unchanged by lens, honesty over optimism)
The *detection* market is crowded (Highway, Truckstop RMIS, Overhaul, project44); the post-incident **claims
loop** was recorded as thinly automated — but buyers are fragmented with low willingness to pay, and
**insurers own the recovery economics** (*subrogation*). An insider at a giant shipper feels this pain diluted
through their insurer. **Attach to #2's customer as a module; never lead with it.**

⚠ **Sweep update (2026-07-02) — the standalone case eroded FURTHER:** a direct AI-native entrant now exists
(**CorePiper**, Apr 2026: agents detect exceptions, assemble documentation, file with carriers, track
payouts), FreightClaims.com ships AI-OCR claim intake, MyEZClaim is the legacy incumbent — and the **insurer
side is already AI-adjudicating** (Loadsure deployed Five Sigma's "Clive" multi-agent claims platform,
Feb 2026: a claim settled in under a minute). One listicle claim of a CTSI "auto-adjudication engine" was
checked against CTSI's own site and **refuted**. Interesting horizon (`candidate`): "fewer than 50% of
claim-eligible exceptions are ever filed" — the value may be in detecting-and-assembling *never-filed* claims,
not faster disputes. **Insider evidence (2026-07-02): weakest of the staffed categories** — the roles exist but
are clerical-tier ($18–37/hr adjusters, mostly 3PL/carrier/insurer-side), and no filings language, practitioner
threads, 2026 conference sessions, or build signals surfaced at all. **Data sources:** FMCSA SAFER + free QCMobile API (carrier data) · 49 CFR 370 via GovInfo ·
CourtListener/RECAP free API + Caselaw Access Project bulk = a free Carmack case-law corpus · CargoNet trend
releases free ($725M / 3,594 events / avg $273,990) but incident-level data paid · **NMFC classification is
paid-only since 2025-07** (free lookup retired) → synthetic class codes or HTS-side for any demo.

## 6. Use case #4 — Supplier force-majeure claim verification — module of the existing build

### Plain English
After the 2026 Gulf conflict, suppliers worldwide declared *force majeure* ("can't deliver, not our fault") —
some legitimately, some opportunistically. Buyers must demand and verify mitigation evidence; today that's
episodic law-firm work.

### Verdict
The closest candidate to RESILIX-as-built (the Skeptic already adversarially challenges disruption findings) —
but **episodic, with no repeatable buyer/frequency**: exactly the trap the insider lens exposes (no standing
cost line → no budget line). **Fold into the disruption-response spine as an evidence-verification module; do
not stand a company on it.**

**Insider evidence (2026-07-02): ABSENCE ACROSS ALL FIVE CLASSES — that is the finding.** No job postings, no
filings language, no conference sessions, no build signals; the only research signal is academic (FM
declarations used "as a pretext or strategic tool," 2025). No standing insider owns this pain — it is
episodic and counsel-routed, which is precisely why it cannot carry a company.

✅ **Sweep confirmation (2026-07-02) — the whitespace is real, and still not a company.** Zero product hits on
FM-claim/supplier-declaration *verification*: Sirion and Icertis do clause identification/risk-grading only
(Icertis markets directly into the Hormuz crisis — still clause-side); Resilinc's own blog frames the answer
as "check/revise your clause"; Everstream/Interos detect disruptions, never test declarations. The incumbents
are law firms (dated anchors: QatarEnergy — ~1/5 of global LNG — declared FM 2026-03-04; a documented
attorney playbook of manual evidence preservation; quantified opportunism math: a seller diverting contracted
barrels to spot ≈ $27M/mo windfall). Note: contract-AI vendors are **one feature away** — they already find
the clause; they don't test the claim. **Data-source upgrade found:** **Jus Mundi** — 18k+ published
commercial arbitration awards free (ICC 2019+ / IBA / ICDR partnerships) = a real, free force-majeure
precedent corpus; plus EDGAR full-text search API (FM declarations in filings — needs a declared User-Agent
header), Drewry's free weekly Cancelled Sailings Tracker as a disruption feed, CourtListener for
supplier-distress dockets. (GDELT: the sandbox fetcher was refused today; it's proven working from the app
runtime — re-test there, not from a research sandbox.)

## 7. Use case #5 — IEEPA/CAPE tariff-refund claims integrity — time-boxed door-opener

### Plain English
After the Supreme Court struck down certain tariffs (Feb 2026), up to **~$175B** became refundable (Penn
Wharton 2026-02-20) — a gold-rush of refund claims with legal deadlines expiring from early 2027.

### Verdict
Broker/law-firm-served, government-run, self-liquidating; Gaia already ships a refund engine; a claims-finance
market is forming (Sidley, Apr 2026). **Same buyer, same entry data, same evidence discipline as #1 — use it
as the conversation-opener into the customs-defense customer, not as a company.**

**Sweep update (2026-07-02) — the "integrity" pain is now evidenced, and the space got more contested:**
- **Rejections are real:** ~15% (1-in-6) of CAPE Declarations rejected since the 4/20 launch (`candidate` —
  attributed to CBP but untraced to a primary; corroborated directionally by accounting-firm alerts that
  "denials show refunds are not automatic"). Documented failure modes: line-level mismatches vs the original
  entry summary, ineligible entry types, missing ACH enrollment (+30–45 days), duplicates, and **silent
  rejections** on multi-importer CSVs (validator processes the first importer, ignores the rest — `candidate`).
- **Timeline hardened:** Phase 2 live 2026-06-29 (reconciliation-flagged, unliquidated or liquidated <80
  days); Phase 3 on track end-July 2026 — but the government's position is finally-liquidated refunds **only
  for importers who filed CIT suits** (appeal live at the Federal Circuit). Refunds pay 60–90 days
  post-acceptance. Example magnitude: an $88M single-importer claim (`candidate`, single source).
- ⚠ **Caspian escalated:** "AI-Native Trade Compliance & Duty Recovery Platform" + **Refund Advance**
  (productized claims finance — the Sidley prediction is now product-real). Gaia's homepage has meanwhile
  de-emphasized refunds in favor of classification. A services gold-rush (lead-gen "CAPE error analysis"
  sites, consultancies) already monetizes the failure pool.
- **Insider evidence (2026-07-02): maximal CFO attention, commoditizing champion.** The strongest single
  filings evidence anywhere in the sweep: **John Deere recorded a $272M recovery** for accepted refund claims
  (8-K, May 2026); **VF Corp booked a $149.7M receivable**; Flowers Foods and e.l.f. recognized nothing —
  divergent GAAP treatments (≥2 independent secondaries; direct filings need the browser session). ~70% of
  eligible duty refunds go unclaimed (`candidate`, practitioner estimate). ⚠ **But the falsifier is loud:**
  Flexport ships a **free** "Audit Your Customs Broker" AI agent (2026-02-26) that reviews past filings and
  prepares refunds — the champion here is a controller with a broker and now free tooling. Door-opener
  verdict reinforced, standalone killed twice over. A refund-rights **secondary market** is forming (claims
  finance buyers) — a non-obvious second customer for evidence-integrity packets.
- **Unshipped wedge spotted (horizon):** a **pre-flight validator** that simulates CBP's two-pass CAPE
  validation *before* filing — obvious, small, and nobody ships it. Fits the door-opener role perfectly.
- **Data sources:** CAPE guidance via CSMS/GovDelivery bulletins (fetch clean — the side-door; cbp.gov CAPE
  pages 403-block) · Penn Wharton figures verified live · CIT slip opinions free + RECAP mirror for refund-suit
  dockets (PACER itself paid, fee-waiver <$30/qtr) · Federal Register API for the tariff-action timeline ·
  ACE liquidation data importer-only → synthetic-vs-CATAIR.

---

## 8. PARKED — the "Adversarial Twin" (independent proposal, owner-parked 2026-07-02)

*Kept aside by owner instruction; recorded so it is not lost. Not the lead.*

**The stance:** don't (only) respond to the enforcer — **run the enforcer's playbook against your own evidence
first, continuously.** CBP scores importers with AI all the time; importers defend episodically. The Twin is a
standing self-audit: the system attacks the importer's own entries the way CBP's AI would (the Skeptic as the
attacker), assembles the origin-evidence file for what's defensible, and refuses on what isn't ("you're
exposed here — do not disclose yet"). When a real notice arrives, the defense file already exists.

**Why it was proposed:** converts the episodic buyer into a recurring one; enters at diagnostic (internal)
rather than filing-grade (government-facing) liability; the demo is self-running on synthetic CATAIR entries +
real EAPA fact patterns as the attack library; mock audits are an existing Big-4 paid service, so the category
is buyer-validated. **Open verification if revived:** does anyone ship continuous AI importer self-audit
(today's falsifier hunt aimed at response tools, not this stance); practitioner interview question: "would you
run a standing mock investigation if it were software-priced?"

## 9. The fence — researched and killed (do not revisit without a trigger)

Verified crowded or structurally blocked (2026-07-02): retailer OTIF/deduction chargebacks (SupplyPike, Glimpse,
Loop) · HTS classification + drawback/refund filing (the funded 2025 cohort: Caspian, Pax, Zollback, Gaia,
Digicust, Amari) · gig-worker deactivation appeals (platform in-house gravity, no worker-side WTP) ·
recall/FSMA-204 traceability (deadline pushed to 2028, crowded) · freight-fraud *detection* (Highway et al.) ·
pharma/GPO chargebacks (Model N/Vistex) · returns fraud (LOW-confidence kill — the one revisit candidate).
Saturated categories: forecasting, visibility/control towers, supplier risk scoring, procurement copilots,
brokerage AI agents, freight audit & pay, warehouse robotics.

## 9A. Data access — the machine-door pattern, cross-cutting sources, and honest gaps

**The pattern that emerged from ~35 live checks (2026-07-02):** the .gov HTML front doors
(cbp.gov, dhs.gov, eCFR, regulations.gov UI, Federal Register HTML) **block automated fetchers** — but each
has a **machine door that fetches clean**: the Federal Register API · CSMS bulletins via GovDelivery ·
OpenSanctions (UFLPA) · GovInfo API + bulkdata (CFR/FR as XML, court opinions in bulk) · regulations.gov API
v4 · CourtListener/RECAP API · USITC HTS REST API · Census trade API · FMCSA QCMobile API. **Build rule: wire
ingestion to the machine doors; reserve a human browser session for the 403-only pages** (CBP dashboards,
FOIA reading room, port tariffs, EDIS, ImportYeti).

**Cross-cutting free sources for demo/synthetic data (all 5 use cases):** Census international-trade API ·
USITC DataWeb + HTS API · EDGAR full-text search (declared User-Agent required) · CourtListener/RECAP ·
Federal Register API · GovInfo bulkdata · Caselaw Access Project bulk.

**Master gap list — no free source exists (design refusal/synthetic around these, never fake them):**
NMFC freight classification (paid-only since 2025-07) · port last-free-day/appointment-denial event data
(not public anywhere) · a public D&D invoice corpus (construct synthetic from §541.6's 13 fields) ·
CargoNet incident-level theft data (paid; trend aggregates free) · prior-disclosure/penalty statistics
(unpublished; FOIA territory) · ACE entry/liquidation data (importer-account-only **by design** — true for
all five use cases; synthetic-vs-CATAIR is the honest demo answer) · Lloyd's List + insurer claim-level loss
data (paid; free layer = TT Club/BSI whitepapers).

**Horizon finds worth keeping (from both sweeps):**
- **The privity lever (#2):** post-§541.4-vacatur, "can this party even be billed?" is decided per-invoice —
  the Maersk $1.9M settlement priced it; no visibility vendor touches it.
- **Machine-vs-machine evidence packets:** insurers (Five Sigma "Clive") and CBP (CAPE's CSV validators)
  already adjudicate algorithmically — evidence packets *formatted for algorithmic adjudicators* is an
  unclaimed design target that fits the trust spine exactly.
- **The unfiled-claims pool (#3):** <50% of claim-eligible exceptions ever filed (`candidate`) — detection→
  assembly of never-filed claims may be where the value is.
- **CAPE pre-flight validator (#5):** simulate CBP's validation before filing; obvious, small, unshipped.
- **Jus Mundi (#4):** 18k+ free published arbitration awards — a real FM-precedent corpus nobody had listed.
- **Two-sided forwarders (#2):** the same company disputes carrier D&D *and* issues D&D (Peloton v. Flexport)
  — a dispute product could also sell to billers wanting defensible invoices.
- **"Year of the Audit" as free top-of-funnel (#1):** Flexport's free customs-audit agents teach the market to
  find errors in past filings — and **every found error is a prior-disclosure decision**. Others are building
  the defense copilot's demand funnel for free.
- **ICPA CF-28/CF-29 answer database (#1):** a living corpus of the exact insider Q&A workflow — demand proof
  and a potential design-partner channel.
- **Refund-rights secondary market (#5/#1):** claims-finance buyers need evidence-integrity packets — a
  non-obvious second customer for the same output.

**Remaining browser-only verification queue (one session closes all):** CBP dashboards/EAPA stats · EDGAR
full-text (10-K risk language for D&D + customs penalties; John Deere/VF filings first-hand) · CBP FOIA
reading room · port tariffs · EDIS · ImportYeti · Reddit practitioner layer · the 15% CAPE rejection primary.

## 10. Glossary (plain-English definitions of the terms of art used above)

| Term | Meaning |
|---|---|
| **CBP** | US Customs and Border Protection — the agency that collects duties and enforces import law. |
| **EO 14411** | Executive Order (2026-06-03) that sharply reduced penalty forgiveness for import violations. |
| **Prior disclosure** | Voluntarily confessing an import error to CBP before being caught — caps the penalty, but a wrong number in it becomes evidence against you (an *admission against interest*). |
| **EAPA** | Enforce and Protect Act — CBP's process for investigating duty evasion (e.g., lying about a product's origin). |
| **Transshipment** | Routing goods through a third country to disguise their true origin and dodge tariffs. |
| **UFLPA** | Uyghur Forced Labor Prevention Act — blocks imports linked to forced labor; importers must rebut detentions with evidence. |
| **Focused Assessment** | CBP's formal audit of an importer's compliance program. |
| **Liquidated damages** | Pre-set contractual penalties CBP claims when import bonds are breached. |
| **De minimis** | The duty-free threshold for low-value shipments (its removal cost parcel carriers heavily). |
| **CATAIR / ACE** | The government's electronic schema/system for filing import entries — the data format every importer's records already live in. |
| **CROSS** | CBP's public database of ~221k binding classification/origin rulings. |
| **ICP-052** | CBP's published penalty-mitigation guidelines — the deterministic math of what a penalty can shrink to. |
| **D&D (detention & demurrage)** | Late fees for containers sitting at (demurrage) or kept outside (detention) a port. |
| **FMC** | Federal Maritime Commission — regulates ocean carriers, runs the billing-dispute channel. |
| **Last free day (LFD)** | The last day a container can sit at the terminal before late fees start. |
| **Carmack (Amendment)** | The federal law governing loss/damage claims against freight carriers. |
| **Bill of lading (BOL)** | The contract + receipt for a freight shipment — the core evidence document in claims. |
| **Subrogation** | The insurer, after paying a claim, pursuing recovery in the claimant's shoes. |
| **Force majeure (FM)** | A contract clause excusing non-delivery on extraordinary events — verifiable with mitigation evidence. |
| **IEEPA / CAPE** | The tariff authority struck down by the Supreme Court (Feb 2026) / CBP's portal for the resulting refund claims. |
| **Prompt injection** | Hostile instructions hidden inside documents an AI reads — the reason untrusted evidence must be quarantined. |
| **NO_ACTION / refusal** | The system's designed answer when evidence is insufficient: name the gaps, do not act. |
| **Skeptic** | RESILIX's independent adversarial reviewer (a different model family) that attacks findings before a human sees them. |
| **Governed / human-gated** | Every outward action requires explicit human approval and leaves an audit trail. |

---

## 11. Standing requirements register — the complete inheritance checklist (nothing rides on memory)

*Every requirement, principle, and logic settled in the 2026-07-02 sessions, in one place. The plan stage MUST
walk this register and map each item to a plan element (or record an owner-approved exception). Sources:
owner directives (this date), project memory, and the research above.*

**A. Business logic & positioning**
1. Fixed frame: real, high-value US supply-chain problem, giant-tier, company-agnostic; the RESILIX build is
   the asset; no run-of-the-mill vertical AI.
2. Recommended entry: #1 customs enforcement defense; #5 door-opener; #4 module; #2 named fallback.
3. **Counsel-leverage, never counsel-replacement** (the champion pays outside counsel today).
4. **Stay off adjacent surfaces** (classification/refunds/audit-detection: Amazon in-house + Flexport free).
5. Adoption ladder realism: service providers (brokers — newly exposed under EO 14411 §4(a)) → sub-giant
   importers → giants last, via their counsel. Giants = the showcase, not the first invoice.
6. The refusal is a first-class product output, not an error state.
7. Portfolio stays alive as the hedge; Adversarial Twin stays PARKED (§8), owner's call to revive.

**B. Core principles (non-negotiable invariants, all already built + gated in the engine)**
8. Authoritative binding: every numeral from deterministic tool returns — never model prose.
9. Structural injection quarantine on all third-party documents.
10. Cross-family adversarial Skeptic on findings.
11. Calibrated refusal (NO_ACTION) with named gaps when evidence is insufficient.
12. Human/counsel gate before ANY outward action; full audit trail; transactional outbox.
13. Deterministic-first: LLM only at judgment seams; math/decisions/deadlines in code.
14. Ship-dark discipline: flags, byte-identical off-paths, staged rollout, kill-switches.

**C. Data strategy**
15. Four modes: free/open + live + hybrid + synthetic — synthetic built against the real CATAIR Rev-106 schema.
16. **Edge-case matrix as one artifact with three jobs:** documented coverage matrix = synthetic-data
    generator = eval suite. Coverage is DECLARED + refusal-guarded, never claimed-total.
17. Ingestion via machine doors only (§9A); browser session for 403-only pages; honest gaps designed around
    (synthetic or refusal), never faked.
18. Verify-over-memory: no load-bearing claim from training knowledge; live-verify with as-of dates;
    `candidate` labels never silently harden.

**D. Technical & build methodology (the professional bar)**
19. Evals-first: golden dataset + edge-case matrix written BEFORE the pipeline; every increment passes it.
20. Success criteria as the spec (declarative plan): citation-traceability 100% enforced; refusal calibration
    measured; injection leaks zero under red-team; time-to-packet targeted.
21. Budget guards in code; observability; reproducible runs; costs tracked (Gemini = the only paid meter).
22. Free/free-tier stack throughout (paid/enterprise path documented alongside, per standing doctrine).
23. Desktop/web only — no mobile (owner-locked).
24. Standalone repo; firewall vs sibling projects.
25. Cross-model adversarial gate batched at checkpoints; plan-stage gate MUST re-test the whitespace claim +
    falsifier list from scratch (recorded obligation).

**E. Process & governance**
26. Interview kill-gate BEFORE build commitment (3–5 brokers/trade-compliance practitioners; brokers first).
27. Legal-review gate before first real deployment: UPL boundary, 19 CFR Part 111 (no "customs business"),
    no-evasion terms, counsel-reviewed ToS/disclaimers (§3 Legal posture).
28. Caspian tripwire: re-check roadmap/careers before goal-fix and at every major gate.
29. Rule-tracking: the ~Sep-2026 mitigation-rule revision must be ingested when it lands (FR API/CSMS);
    claims worded "directed, not yet codified" until then.
30. Teach-first-then-takeover for new build work; one piece at a time.
31. Stage narration: every substantive turn states stage + goal/roadmap/plan, plain English paired with
    technical; owner gates surfaced explicitly, never assumed.
32. Efficiency + sustainability in all perspectives (section below).
33. Lossless multi-session continuity: any Claude session resumes from HANDOFF → this document → memory;
    plan/objective/roadmap docs update in the same stroke as any implementation change — never drift.
34. Cognitive partner, not mirror: independent, defended positions with flip conditions, always.

**F. Documentation & communication (floor, not ceiling)**
35. Dual register everywhere: plain-language explanation of problem → use case → solution beside the
    technical, at every stage.
36. A standalone layman document that a first-time reader can fully understand.
37. Real terms of art used undiluted, backed by the glossary (§10).
38. Professional documentation quality: visuals + text, clarity, language flow, tone, emotional resonance;
    fundamentals/methodologies/frameworks named explicitly.

**G. Honest open items (not yet done — deliberately, in order)**
- Owner pick (THE gate) → then the plan itself (success criteria + task breakdown) in a fresh session.
- Practitioner interviews (owner-led, kill-gate).
- Browser verification queue (§9A end) + flagged video transcriptions.
- Commit decision for the research/portfolio docs (owner's call — currently uncommitted).

## Efficiency & sustainability (standing owner requirement, 2026-07-02)
**Efficiency:** build = reuse of the gated RESILIX spine (the *disciplines* transfer near-wholesale; the
*implementations* transfer partially — the "~90% shared" shorthand was retired at the plan gate, Codex R1 #1;
honest new-build accounting: plan §3) + free/free-tier
stack, Gemini the only paid meter (past live runs cost cents: $0.002–$0.05 per calibration set); runtime =
deterministic-first (LLM only where judgment is needed; math/decisions in code; replay-first $0 demos; budget
guards in code); data = free machine-door APIs (§9A), no scraping overhead; process = batched cross-model
gates + interview kill-gate BEFORE build commitment. **Sustainability:** #1 is structurally durable — customs
enforcement is permanent and recurring (unlike #5, which self-liquidates by 2027); the product *tracks rule
changes by design* (FR API + CSMS ingestion — the ~Sep-2026 mitigation-rule revision becomes a demo beat);
standing costs near zero; the moat (liability-grade governance) does not commoditize with better base models;
the portfolio itself is the hedge — four adjacent dockets share the same spine if the entry needs to move.

## 12. Goal-fix record + tripwire log (living — update at every major gate)

**GOAL FIXED (owner, 2026-07-02, plan-mode session):** #1 customs enforcement-defense copilot (importer side,
counsel-LEVERAGE never counsel-replacement) + #5 IEEPA/CAPE refund-integrity as time-boxed door-opener + #4
force-majeure verification as a module of the existing build. **#2 D&D adjudicator = the named fallback.**
Plan artifact: `PLAN-CUSTOMS-DEFENSE-2026-07-02.md`. Build commitment remains behind the interview kill-gate
(§11 item 26).

**⚠ Caspian tripwire log (§11 item 28 — re-check at every major gate):**
- **2026-07-02 (pre-goal-fix, live check of meetcaspian.com + press):** whitespace HOLDS; salience RAISED.
  New since the sweep record: product surface now lists **Protests** ("challenges CBP determinations") and
  **PSCs (Post-Summary Corrections)** alongside Duty Drawback / Trade Audit / Trade Compliance /
  Classifications / Refund Advance; **Trade-IQ acquired June 2026** ("expanding from duty recovery into
  full-lifecycle trade advisory"; Shannon Bryant joins as VP of Trade Advisory). Still ZERO on the surface:
  prior disclosure, penalty mitigation/response, EAPA/AD-CVD defense, CBP Form 28/29 response, UFLPA
  detention response — the enforcement-defense core stays un-owned. Read: they are circling from the
  recovery side (Protests is one procedural door away); the why-now window is real but not infinite.
  Careers-page deep check remains on the browser-only owner queue (§9A end).
- **2026-07-02 (plan-gate live re-test — the recorded deferral-≠-pass obligation, live leg):** whitespace
  **HOLDS after from-scratch re-search.** (1) meetcaspian.com re-fetched: surface = drawback/refunds, Trade
  Audit, Trade Compliance, PSCs, Protests, Classifications, Refund Advance, ACE integration, tariff-policy
  monitoring — still ZERO defense-core items (prior disclosure, penalty response, EAPA/AD-CVD defense,
  CF-28/29, UFLPA response). (2) **EO 14411 re-confirmed** (Wiley/MoFo/Hogan Lovells/EY alerts + FR PDF
  2026-11595): signed 2026-06-03; §4(c) ≥50% mitigation floor directed; broker max-penalty exposure;
  implementing rules NOT yet published — 90-day measures expected ~early Sep 2026; "directed, not yet
  codified" wording stands. (3) **Falsifier-list delta:** ⚠ **Amari salience RAISED** — press now describes
  it "generating protest filings when duties are assessed" (agentic actions one door from defense, AND it
  sells to brokers = our first buyer rung; was listed as "broker declaration ops ADJACENT-ONLY"); **Trava
  ADDED as player #16** (usetrava.com, YC '25, Pushkar Lanka): entry-audit + classification + duty recovery
  for importers, explicitly "not a broker… we don't file… we audit filings and provide defensible evidence
  your broker can act on" — **ADJACENT-ONLY**, and further top-of-funnel evidence (another find-the-error
  tool generating prior-disclosure decisions no product serves). Net read: the adjacent cohort keeps
  GROWING while the defense core stays un-owned — the whitespace claim is strengthened, and the
  encroachment clock (Caspian, now Amari) keeps ticking.

## Provenance & maintenance
Distilled from `RESEARCH-problem-shortlist-2026-07-02.md` (acceptance-gate SHIP) + evidence appendix
`RESEARCH-threads-digests-2026-07-02.md`; three gap-fill sweeps of 2026-07-02 land in the `⏳ SWEEP PENDING`
slots. Evidence discipline: load-bearing claims ≥3 sources across ≥2 platform types, dated; `candidate` =
untraced to primary. **Maintenance rule (owner directive):** once an objective/plan is fixed, implementation
changes update this document in the same stroke — it never drifts silently. Continuity: any Claude session
resumes from `docs/claude/HANDOFF.md` → this document.
