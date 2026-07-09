# PLAN — Showcase expansion: "make what's big legible, then bigger — no artificial bloat" — 2026-07-06

**Status: FIXED GOAL, owner-approved 2026-07-06 (revised same day, mid-run owner directive).**
Advisor-guided (project-advisor read-only pass) + blindspot-scout unknowns pass, synthesized and
final-called by the main session (Fable). Supersedes the "only remaining = owner deploy" end-state of the
`PLAN-CUSTOMS-DEFENSE-2026-07-02` era. RESILIX (ActionOps + Customs Defense Desk) is the ASSET.

## The goal (declarative)

RESILIX as a full-spectrum applied-AI showcase — agents, multi-agent, MCP, retrieval, workflow automation,
evals, governance — that a **90-second reviewer** can actually read, where **every capability has a named
in-product consumer** (native to the product story, never a bolted-on tool demo), and all standing
invariants hold: LLM never authoritative for numbers/IDs/approvals · atomic audited in-app approval ·
injection quarantine · synthetic-data disclosure · no secrets committed · n8n never in the approval loop.

**Owner decisions locked 2026-07-06:**
1. **One flagship** — ActionOps is the product; the Customs Defense Desk presents as a module within it.
2. **The build-process trail is a NAMED exhibit** — gates/lessons/cross-model reviews surface as
   "How this was built" (evidence of agentic-workflow engineering, the target role itself).
3. **Public demo posture = REPLAY-only, $0, no keys on the public URL** (fail-closed
   `REQUIRE_APPROVAL_TOKEN=true`); live runs stay local. **Loop/Skeptic live promotion is owner-gated
   later — NOT on this ladder** (blocked on: billable smoke, the recorded Skeptic caution-wart fix,
   the frozen-fixture re-capture coupling, and the public-key cost posture).
4. **Deploy moves to the very END** (owner directive mid-run): build the entire ladder first, deploy once.
5. **The design build is IN SCOPE** (owner directive mid-run): Fable applies its own judgment against
   [[resilix-design-bar]] + the 5 `samples/2026/` directions, records WHY, builds it as a gated increment.
   The billable homepage re-capture stays owner-gated — the frozen fixture must remain honest without it.

## Why this shape (the blindspot-scout evidence, 2026-07-06)

Cross-verified 2026 hiring-side sources agree: reviewers spend ~90 seconds; the surface that gets read is
README → walkthrough → eval numbers → design-decisions doc; depth beats breadth; eval harnesses and honest
failure notes are the strongest senior signals; anti-slop screening penalizes unverifiable claims and
tool-collecting. RESILIX has the depth; the deficit is legibility. Hence: legibility first, then
capabilities in strict native-consumer order. No complete rework — the unknowns pass found packaging debt,
not build debt.

## Methodology (right-sized, per [[resilix-personal-project-rightsize]])

Per increment: short declarative spec (success criteria + acceptance tests, consumer named up front) →
build → `npm run verify` (or `verify:full` for UI/API/demo changes) → acceptance-gate → commit → push.
**Codex cross-model: ONE batched pass at the END of the ladder**, plus a dedicated pass for S3 (the MCP
surface is safety-critical). Verify-over-memory for every new dependency (MCP SDK, pg full-text, n8n
webhook shape) — installed packages + official docs, never model memory.

## The ladder (fixed order, revised 2026-07-06 mid-run)

### S2 — Legibility front door (FIRST BUILD: make the existing depth readable)
- **Consumer:** the 90-second reviewer (recruiter/hiring engineer) hitting the repo root or demo URL.
- **SC:** README rewritten reviewer-first — what it is (one flagship, two modules) → the trust spine →
  REAL verified eval numbers → 60-second run path → "How this was built" named exhibit (gates/lessons/
  cross-model trail) → honest limitations. 2-minute walkthrough script/storyboard for the owner to record.
  Root curated do-no-harm (nothing moved that breaks references). `CLAUDE.md` → `AGENTS.md` pointer.
- **AT:** every number in the README verified against the live test suites on HEAD (no grown counts);
  de-slop pass on prose; links resolve; `npm run verify` untouched-green.

### S-D — Design build (the shipped app adopts the strongest 2026 direction)
- **Consumer:** the same reviewer, plus the walkthrough/screenshots (which must reflect the final look —
  hence design lands BEFORE the MCP/RAG/n8n stories get captured).
- **SC:** ONE direction (or strongest synthesis) from `samples/2026/` built into the shipped app at the
  design bar ([[resilix-design-bar]]: white/cool grounds, ONE steel accent, no green/pink/cream/orange,
  Geist/no serif, narrative-first, anti-cliché). The pick + WHY recorded here and surfaced for owner review
  (not blocked on it). Frozen homepage fixture stays honest — re-derived deterministically if the new UI
  needs different data shape; NO billable re-capture.
- **AT:** `verify:full` green incl. WCAG 2.2 AA e2e; golden oracles byte-unchanged; fixture arithmetic
  guards green; acceptance-gate SHIP.
- **DECISION RECORDED (S-D pick):** see § Design decision below (filled at build time).

### S3 — Read-only MCP server over the war room (strongest positioning differentiator)
- **Consumer:** any MCP client (Claude Desktop/Code) asking the war room questions; tool calls logged to
  the audit trail (in-product consumer); the README "agent-ready" section.
- **SC:** MCP endpoint exposes packet-retrieval / exposure-query / audit-trail tools — **read-only,
  token-authed, NO authority tools ever** (no approve/execute/set-score; the moat extends to the MCP
  surface); auth/consent/audit story documented explicitly (the 2026 MCP-security bar).
- **AT:** MCP client integration test round-trips each tool; adaptive injection red-team EXTENDED to MCP
  tool inputs/outputs → 0 leaks; structural test proves no tool can mutate state; mutation attempts 401/405;
  **dedicated Codex pass** (safety-critical surface).
- **FIRST TASK (flagged assumption):** verify the Next.js-compatible MCP transport against real installed
  packages + the official MCP TypeScript SDK docs — no MCP dependency exists in the repo today.

### S4 — Customs RAG, lexical-first (evidence-first retrieval)
- **Consumer:** the customs desk evidence spine (+ one MCP tool — two stories, one build).
- **SC:** cited-chunk retrieval over the customs corpus; every retrieved citation passes the existing
  fail-closed produce-time citation check (**the hard bar**; if it can't be met, STOP and record why —
  skip-with-reason is an owner-accepted outcome).
- **AT:** retrieval golden suite (recall@k on hand-labeled Q→chunk pairs) green BEFORE any consumer;
  citation check green on RAG-fed packets; existing customs golden 34/34 untouched.
- **Lowest-rung-first:** lexical (pg full-text / BM25-style) before any embedding pipeline; embeddings only
  if the golden suite proves the simpler rung insufficient. Corpus is small + already page-cited.

### S6 — n8n outbound channel (LAST — lowest capability-per-effort, right-sized)
- **Consumer:** the approved-action dispatch path (`ERP_CASE`), demonstrating governed workflow automation.
- **SC:** `ERP_CASE` webhook fires only POST-approval through the existing typed seam
  (`lib/server/action-transport.ts`); `reconcileStrandedDispatches` wired to the transport startup hook
  (the recorded forward-guardrail obligation, todo 2026-06-27); committed n8n workflow-export JSON as the
  demo artifact. A running n8n instance = optional owner infra, NOT a repo deliverable.
- **AT:** outbox tests prove no dispatch without APPROVED; HMAC signature verified; crash-recovery test
  drives a stranded REVERSIBLE row and never an outward one; structural test that n8n is absent from any
  approval path.

### Final gate — ONE batched Codex cross-model pass over the whole ladder → push → owner queue.

### S1 — Deploy (VERY LAST, owner action, ~10 min)
- **SC:** public URL serves the replay-first demo $0/keyless; `ENABLE_CUSTOMS_DESK=true`;
  `REQUIRE_APPROVAL_TOKEN=true` (fail-closed); synthetic disclosure visible on every surface.
- **AT (post-deploy smoke):** homepage + `/customs` render; mutation routes 401 without token; no live-LLM
  call fires keyless; secret scan clean.
- Owner commands: `npx vercel` → `npx vercel env add ENABLE_CUSTOMS_DESK production` (value `true`) →
  `npx vercel env add REQUIRE_APPROVAL_TOKEN production` (value `true`) → `npx vercel --prod`.

## Design decision (S-D) — RECORDED 2026-07-08 (sample delivered; app build deferred to Fable)

**Pick: Direction 05 "Runway Timeline" as the spine, refined into one build-ready sample —
`samples/2026/00-recommended-runway-warroom.html`.** (This session delivered the *design sample* only,
per owner directive 2026-07-08 — "just give the design sample; the other rungs get built with Fable once
limits reset." So this is the reference Fable builds S-D *into the shipped app* from; app integration +
`verify:full`/WCAG-AA-into-app remain the S-D build step, NOT done here.)

**Why 05 over the other four (judged against the CURRENT goal — 90-second-reviewer legibility where
depth/governance is the senior signal; all five already clear the design bar, so the tie-break is *which
makes RESILIX's unique claims legible at a glance*):**
- **05 is the only direction that renders both RESILIX differentiators visually**: the runway *as the clock*
  (time pressure) and *reversibility as the governance dial* ("only the two reversible options restore
  coverage before the day-7 runout"). A reviewer gets the governance thesis from one sentence + one visual.
- **02 Intelligence Brief** — runner-up, most instantly legible; its editorial one-figure lead-in is
  **grafted on top** as the opening (the 15-second front door).
- **01 Command Console** — its multi-agent deliberation + **independent cross-family Skeptic** verdict is
  **grafted inline as a trust strip** (surfaced, not drilled) — this fixes 05's one weakness (it under-shows
  the machinery, which IS the senior signal).
- **03 Conversational** — *rejected*: the chat metaphor is the 2026 cliché; weakest at showing the
  deterministic-governance moat.
- **04 Control Tower** — kept as a depth reference; its node-graph leans decorative (the decision lives in
  the side panel), so not the spine for a legibility-first goal.

**What was synthesized (disciplined, single-spine — not a franken-merge):** editorial lead (02) → runway
governance timeline (05, the signature exhibit) → inline trust strip: 7 agents + Llama-4 cross-family Skeptic
"Accepted" (01) → drafted, **human-gated** action (atomic/audited; n8n never in the approval loop) → three
role playbooks (05) → trust-spine footer with **synthetic-data disclosure**. Built on the shared 01–05 token
system (app `globals.css`) — no new aesthetic invented; defined the one missing token (`--crit-soft`).

**Verified (sample-level, first-hand 2026-07-08):** desktop render screenshotted; anti-slop probe green —
Geist resolved (no serif leak), tabular figures on, `badHues:[]` (zero green, zero orange/amber — severity is
red hue ~26, accent steel hue ~256), no true emoji (the lone `→` is a typographic arrow, consistent with the
existing samples' arc notation). `index.html` features the pick at top. **Owner reviews after (revert is one
increment).** Full axe AA + `verify:full` + byte-unchanged oracles/fixture belong to Fable's build-into-app.

**GALLERY-WHITE EXPLORATION ROUND (2026-07-08, owner-directed):** owner asked for a 5–7 sample "gallery-white"
set built with design subagents + the claude-design plugin, grounded in live 2026 references, published as
Artifacts. Delivered SIX directions on ONE shared system (`samples/2026/gallery/`, gitignored): a brighter
barely-cool "gallery wall" ground (`oklch 0.994`, off-clinical-white but never warm — pure #fff now reads as an
AI tell, warm/cream is barred), Geist self-hosted as a base64 `@font-face` (survives the Artifact CSP), the real
seeded packet, one steel accent, red-only severity. Built by 6 parallel `frontend-specialist` subagents from a
shared kit (`samples/2026/gallery/_kit.md`) after a `research-specialist` live-references sweep (15 cited 2026
sources; the #1 AI tell = the colored left-border card; "interaction density > visual density"). Verified
per-sample (render + anti-slop probe: Geist loads, tabular figs, zero green/orange, no left-border/emoji tell —
one `✓` fixed on 06). Live Artifacts: gallery index https://claude.ai/code/artifact/65bcc14a-4233-4a16-b99a-f889af14d18e
· 01 Exhibit a539ca2c · 02 Broadsheet 887dc0de · 03 Situation Board ee3f1b8a · 04 Runway 8bd90750 · 05 Ledger
52c30836 · 06 Control Tower 84fc1bc6 (all `claude.ai/code/artifact/…`, default-private). These are exploration
options for the owner to react to; the S-D pick above (05-runway synthesis) still stands as the recommendation
unless the owner chooses a gallery direction. NOT committed (samples/ is gitignored; owner-gated push).

**FLAGSHIP CONSOLIDATION — "The Brief" (2026-07-08, owner-directed; NEW recommended S-D direction).** After the
6-way gallery round the owner directed: "simple human-understandable language flow, premium, fresh, intuitive."
Consolidated the set into ONE flagship — `samples/2026/gallery/00-flagship.html` — a calm single-column briefing
read top-to-bottom in PLAIN HUMAN language (jargon translated: "corroborated"->"two independent sources confirm
it, and a second AI from a different company checked our read and agreed"; "exposure ramp"->"being stuck starts
to cost real money"; "reversible"->"you can undo"). Flow: what's happening -> who it hits (5 no-backup suppliers)
-> how long you have (the runway clock, decide by day 6) -> what we suggest (two undo-able fixes beat the runout)
-> one action ("Approve & send" the 9 drafted notes; "nothing leaves until you approve"). Premium: generous Geist
scale, gallery-white, one steel accent, red ONLY on money/no-backup, precise rhythm, reduced-motion-safe entrance
+ approve micro-interaction. Anti-slop CLEAN (no left-border card, no glass, no emoji, no green/orange). **This is
now the strongest S-D candidate** — it foregrounds the trust spine (numbers never authored by the LLM) in language
a 90-second non-expert reviewer gets instantly. **Live Artifact:**
https://claude.ai/code/artifact/c919fced-3a83-4be8-abd2-6c5f1e887e81 . When the owner confirms, Fable builds
"The Brief" as the shipped S-D flow (runway/ledger/control-tower become deeper drill-downs off it).

**"SITUATION CONSOLE" — app-grade modern-UI ceiling (2026-07-08).** Owner then asked for the modern-UI ceiling
(layouts, cards, pixel quality) on gallery white. Built `samples/2026/gallery/00-console.html` — a product-grade
command surface: sticky app bar + breadcrumb, a decision hero + live decide-by counter, a hand-built SVG exposure
area chart (shaded runway, drawn-in line, annotated $350k->$1.15M endpoints), an exposed-supplier table with
severity stripes + mini-bars, a stat rail, a "How we know" trust module (agents + cross-family second opinion),
and a prominent action bar. 8px system, layered cool-tinted elevation (e1/e2/e3), tabular figures, micro-interactions,
prefers-reduced-motion. Keeps the plain-human microcopy from "The Brief" but at full visual craft. Anti-slop CLEAN
(solid app bar — dropped the frosted-nav backdrop-filter to stay off the glassmorphism line; row severity STRIPE
is state-encoding, not a left-border card). **Live Artifact:** https://claude.ai/code/artifact/92940791-7852-4f7c-a429-5c1864800476 .
Two live registers now on the table for the owner: "The Brief" (calm document, language-led) and "The Console"
(app-grade, information-design-led) — same system, same packet; owner picks the register Fable ships.

**"SITUATION CHART" — fresh judgment-driven direction + FORMAL EVALUATION (2026-07-08).** Owner: "fresh design,
your own judgment, use design + anti-AI subagents." My judgment: the subject is a maritime chokepoint, so render
the war room as a MODERN maritime situation chart (title-block cartouche · charted Strait with the closure as a
red hazard · supplier positions with leader callouts · runway as a clearance-profile · provenance as the "survey
record") — modern grotesk instrument, NOT antique kitsch (no parchment/serif/compass/anchor). Built by a
frontend-specialist subagent; file `samples/2026/gallery/00-chart.html`; anti-slop + anti-kitsch CLEAN.
Then owner: "did you evaluate w/ domain experts, content, story-arc, language, clarity?" — ran a real 2-lens
evaluation (a general-purpose agent as a senior SCRM/resilience-lead practitioner + a writing-specialist on
content/story/language/de-slop). **Both converged:** trust model + reading arc + prose are STRONG; but the SCENARIO
NUMBERS have a decision-critical incoherence seeded in `_kit.md` and propagated to all samples —
(1) the clock doesn't close ("decide day 6"/"runout day 7"/"restores day 5" on incompatible origins);
(2) "reversible options beat the runout" is FALSE (only expedite/day-5 beats day-7; reallocate/day-10 doesn't) —
wrong in the Brief, correct in the Chart, seeded wrong in the kit; (3) 7-day runway vs 43-60d supplier cover
unreconciled (binding line never surfaced); (4) $1.15M is small for a large-importer war room (a single Hormuz
war-risk surcharge is $3-8M). Full findings in the two agent reports (this session).
**OWNER DECISION (2026-07-08): the number/content reconciliation is DEFERRED ("this is only for design ... later");
keeper = the Situation Chart.** So this pass applied only the DESIGN-LEGIBILITY fixes (no number-model change):
de-jargoned the nautical labels (Soundings/under-keel/keel-line -> "How long the cover lasts"/"stock left"),
rewrote the opaque approval line + dropped the overstated "you can undo" on dispatch, fixed the lane-repeat +
clipped tail, standardized $350k casing + the Skeptic quote. Verified live + anti-slop CLEAN. **Live Artifact:**
https://claude.ai/code/artifact/2d9e91c0-5544-49b7-9ab1-203330ea6f21 .
**OPEN (deferred, owner-gated): reconcile the packet's timeline/money model** (one clock; 7-day runout = one named
constrained line; only expedite beats it; money reframed as that line's exposure) at the ROOT `_kit.md`, then
propagate to Chart/Brief/Console; also add a Skeptic reject-path so the trust panel isn't one-sided.

**"WAR ROOM" — modern icon-integrated register (2026-07-08).** Owner: "make it modern, icons, ui, quality in all
aspects." Note: earlier rounds deliberately avoided icons (anti-slop) — owner's explicit request overrides, so I
added a real ICON SYSTEM the tasteful way: ~18 hand-authored inline-SVG stroke icons (24px, 1.75 stroke,
`currentColor`, defined once as a `<symbol>` sprite + `<use>` — survives the Artifact CSP, no icon CDN), used
FUNCTIONALLY (nav affordance · card-header identity · supplier/agent status · buttons · route nature
zap/swap/lock), never one-per-line decoration. Modern app shell: left icon nav-rail + sticky top bar (search,
decide-in-6d pill) + hero + iconed stat cards + exposure chart + supplier status list + trust rail + iconed
routes + action bar. 8px system, layered cool-tinted elevation, tabular figures, hover/focus/active states, approve
micro-interaction, prefers-reduced-motion. Gallery-white (light only), one steel accent, red on risk only, Geist,
plain-human copy, reversibility stated CORRECTLY ("only flying it in beats the day-7 runout"). File
`samples/2026/gallery/00-warroom.html`; anti-slop CLEAN (no left-border card, no glass, no emoji — icons are SVG;
18/18 icon refs resolve). **Live Artifact:** https://claude.ai/code/artifact/3578bc13-2c61-4ee9-83df-b68d16b94472 .
Registers now live for the owner: Brief (document) · Console (dashboard) · Situation Chart (maritime instrument) ·
War Room (modern icon app) — same gallery-white system + packet; owner picks what Fable ships.

**"WAR ROOM 2026" — full-bleed ultra-modern app (2026-07-08).** Owner: "no margins, it looks too old-time
bookish; give modern UI top tech companies would do, ultra-modern premium 2026." Key insight: the generous
centered whitespace ("gallery" air) read as BOOKISH/document, not app. Pivot: killed the centered max-width and
rebuilt as a **100vw x 100vh full-bleed product app** (Linear/Vercel/Retool register) — nav rail | center
(tabbed context bar -> dense hero strip -> inline hairline-separated stat strip -> full-width exposure chart ->
dense supplier table) | **persistent right decision inspector** (drafted action + Approve + ways-to-fix + trust) |
bottom **status bar** (live, model provenance, ⌘K / ↑↓ keyboard hints). Edge-to-edge, hairline-divided panels
(no card margins), higher density, internal-scroll (no page scroll), fills the viewport exactly. Kept the icon
system, gallery-white (light only), one steel accent, red-on-risk, Geist, plain-human copy, reversibility correct.
File `samples/2026/gallery/00-app.html`; anti-slop CLEAN, 19/19 icons resolve, fills viewport (no overflow).
**Live Artifact:** https://claude.ai/code/artifact/7b04d118-c665-4f46-9c08-f77126cfb4a7 . This is the current
front-runner for the shipped register (full-bleed app > the earlier bookish-margin layouts, per owner).

**"WAR ROOM ULTRA-PREMIUM" (2026-07-08, /claude-design "give ultra modern premium UI").** Premium craft pass on
the full-bleed app — `samples/2026/gallery/00-ultra.html`: layered elevation + inner-light (--edge) so nav +
inspector lift as true white panels over an off-white canvas (premium figure-ground, NO margins); a **⌘K command
palette** signature (scrim + elevated panel + keyboard-navigable grouped commands, real JS: ⌘K/`/` open, arrows
navigate, Esc close); elevated exposure chart (refined area + endpoint glow + hover crosshair); staggered load
choreography; refined micro-typography + active-tab underline + status-bar sparkline. Held the austere bar —
FLATTENED the subtle button/pill/avatar gradients I'd added (kept only the chart's meaning-encoding SVG
gradients) so it stays strictly no-gradient; anti-slop CLEAN, fills viewport, 44 icons resolve, palette works.
**Live Artifact:** https://claude.ai/code/artifact/3cc05bfd-5ff5-4d39-aef9-70e414888d7f .
NOTE (2026-07-08): ~9 design iterations run this session on the same packet; owner has pushed "more modern/premium"
repeatedly — a convergence question was surfaced (is this the bar / push motion / bolder POV / match a named
product) to stop guessing. The number/content reconciliation remains DEFERRED + owner-gated (see above).

**"WAR ROOM LIVE" — motion + interaction (2026-07-08; owner picked "push motion & interaction").** Made the
ultra-premium full-bleed app feel like a RUNNING PRODUCT — `samples/2026/gallery/00-live.html`: (1) boot
choreography — top loading bar, staggered panel reveal, stat numbers COUNT UP, exposure bars fill, chart line
draws itself in; (2) live data — a pulsing signal, a ticking "auto-refresh in Ns" countdown, an animated
sparkline feed; (3) real state transitions — WORKING TABS (Overview/Suppliers/Evidence cross-fade, 3 real views
incl. all-9 supplier table + 7-agent evidence view), a ⌘K command palette that RUNS commands (approve, jump-to-tab;
arrow-nav + Enter), and a genuine Approve state machine (Approve -> "Sending…" progress -> "Sent" + the action
block swaps to a "9 notes sent" confirmation); (4) tactile press states + row hover quick-actions. Full
prefers-reduced-motion fallback (instant, no continuous motion). All interactions verified functionally (tabs,
palette, approve, count-up, countdown) in BOTH source and the transformed artifact. Fixed an artifact-transform
bug: JS non-ASCII ("Sending…" ellipsis) must be \u-escaped inside <script>, not HTML-entity-encoded — transform
updated to js-escape scripts. Anti-slop CLEAN, no gradients, fills viewport, 60 icons resolve.
**Live Artifact:** https://claude.ai/code/artifact/f018ef8b-7658-4b69-9998-0c4637002887 . This is the fullest
realization of the shipped-register front-runner (full-bleed + premium craft + live interaction).

**PALETTE EXPLORATION + "APPLE PREMIUM WHITE" (2026-07-08).** Owner: current white/steel bar reads "dull/generic,"
wants a fresh palette — then iterated hard (5 swatch boards / 20 palettes: cool-saturated, warm/green/pink, two
Apple-system sets, a bolder range; boards published as artifacts). None locked at swatch scale, so I (a) applied
Emerald to the full live app as a real full-scale demo, then (b) on the owner's "premium white if Apple would use
it" directive, built the **converged direction**: `samples/2026/gallery/00-apple.html` — the full live app
re-grounded in **Apple premium white** (systemGray6-tinted `oklch(0.966 0.004 286)` canvas + pure-white panels +
near-black hue-286 labels + Apple grays) with a **LIVE ACCENT SWITCHER** in the top bar (Blue/Emerald/Teal/Indigo/
Amber/Graphite, localStorage-persisted) — per the design-skill Tweaks pattern, so the OWNER picks the accent on the
real app instead of me guessing on more boards. Default accent = Apple systemBlue. Also hardened the stat count-up
with a rAF-independent fallback (preview throttles rAF when backgrounded). Verified: Apple ground + switcher +
count-up + interactions all work. **Live Artifact:** https://claude.ai/code/artifact/5cbe2b2e-395c-426f-854f-1d28f5d7ca42 .
Palette now OWNER-DRIVEN via the switcher — the accent loop is resolved. (Number/content reconciliation still DEFERRED.)
**ACCENT CHOSEN = TEAL (owner delegated "ignore Apple, choose best"; 2026-07-08).** Design-lead call: TEAL on the
Apple premium-white ground is the best accent for THIS product — fresh (clearly off the "dull steel"), calm/
trustworthy/instrument-grade (right temperament for a crisis tool vs. playful pink/violet), doesn't fight the red
severity, and — the decisive tiebreaker over the emerald runner-up — **stays distinguishable from red for
red-green color-blind users** (green accent next to red danger is confusable for ~8% of men; teal is not). Set
teal as the default (CSS + JS) in `00-apple.html`; switcher retained for override. Redeployed same URL:
https://claude.ai/code/artifact/5cbe2b2e-395c-426f-854f-1d28f5d7ca42 . COLOR IS NOW SETTLED: Apple premium-white
ground + teal accent + red severity.

**VERIFY-OVER-MEMORY UPGRADE (2026-07-08; owner: "don't use training knowledge/memory; refer live open sources").**
Ran THREE parallel research-specialist live-verification sweeps (all cited, cross-verified, licenses checked from repo
LICENSE files):
(1) **Colour/Apple** — teal-over-green CONFIRMED (WCAG 2.1's own colour-only failure example is literally red-vs-green;
Okabe–Ito; R Journal; NEI ~1-in-12 men). CAUGHT A REAL BUG memory missed: light teal on white FAILS WCAG 1.4.11 (3:1
non-text contrast, ~2.0–2.4:1) — accent must be a deeper teal/green + keep a non-colour cue (WCAG 1.4.1). Apple
systemGray6=#F2F2F7 confirmed; systemTeal/Red are version-dependent (don't claim a frozen "Apple" hex).
(2) **Icons/fonts/UI** — icons → **Lucide (ISC, 24px/2px, currentColor)**, the shadcn/ui standard (Radix MIT/15px for
tiny sizes); font → **Geist Sans+Mono (OFL 1.1) CONFIRMED** (Inter now reads as the overused default) + tabular+lining
figures (`tnum`+`lnum`) for data columns; UI → shadow-as-border, 4px scale, tight headline tracking, status-as-dots.
(3) **Layout/narrative** — full-bleed shell + fluid grid (capped measure); **master-detail (decision/inspector pane
dominates)**; slim nav rail 3–7 dests; decisive metric top-left/above-fold; glanceability (3ft/10ft); reduce+progressive
disclosure. Narrative: **BLUF** (US Army AR 25-50 + NN/g inverted pyramid + Duarte Big-Idea) — hoist a verdict header
(recommendation+runway+confidence+persistent Approve) ABOVE the signal; keep the investigative arc as the evidence body.
**APPLIED** (owner picked green → **Forest**, from a 6-green board with accessibility ranking): `00-final.html` =
Apple-white ground + **Forest green** default accent (deep enough for 3:1) + **real Lucide icon paths fetched from the
ISC repo** (20/20, replacing my hand-drawn set) + Geist `tnum+lnum` + 2px stroke + the live accent switcher. Verified:
20 Lucide symbols render, Forest default, fonts load, no overflow. **Live Artifact:**
https://claude.ai/code/artifact/c264a0ae-0d00-4674-9037-75935543fc2e . The app already satisfies most layout findings
(full-bleed + master-detail inspector + slim rail + recommendation-in-hero + persistent Approve + tabbed progressive
disclosure); the one net-new BLUF suggestion (an explicit top verdict line) is OFFERED, not yet added. Boards:
greens `aa1cfe03`; the 5 palette boards + teal/emerald live variants remain as artifacts.
**BLUF HEADER APPLIED (owner: "yes").** Restructured `00-final.html` per the layout/narrative research: added a top
**verdict bar** (ACT + one-line "Reroute now — 6 days to commit" + the 4 key metrics with count-up + a "2nd AI
agrees" indicator + a persistent Approve wired to the same send flow); demoted the threat headline to the evidence
body; removed the old stat strip (metrics moved up — no duplication). Caught + fixed a real layout bug (the BLUF row
overflowed the centre column, clipping Approve — tightened spacing/verdict to fit: side now 1030px < 1048px column).
Verified: BLUF renders, metrics count up, Approve fits + triggers the flow, no overflow. Redeployed same URL
c264a0ae. DESIGN NOW: Apple premium-white + Forest green + Lucide icons + Geist(tnum+lnum) + BLUF arc — all
research-grounded, live-cited.

**FINALIZATION SESSION (2026-07-08, `/claude-os` + plan-mode gate, owner-approved — the ladder resumes with Fable):**
1. **Register CONFIRMED by owner: `00-final.html`** (Apple premium-white + Forest green + Lucide + Geist
   tnum/lnum + full-bleed live app + BLUF verdict bar) is what S-D builds into the shipped app.
2. **Multi-agent verdict (owner asked "is the best vertical AI multi-agentic platform right for us?"):**
   RESILIX goes forward as the best governed vertical multi-agent SYSTEM, **not** a horizontal platform —
   no orchestration-framework build (commodity; tool-collecting signal); S3's read-only MCP surface is the
   right-sized "platform" move. Corrected record: `ENABLE_AGENT_LOOP` is **default-ON in code**
   (owner-promoted 2026-06-29, `lib/server/env-flags.ts`); what stays deferred is only the PUBLIC live
   posture (keys on the URL, Skeptic wart, billable smoke) — keyless runs route to the byte-identical
   waterfall, so the $0/honest public posture holds.
3. **NEW RUNG S-L (owner-approved): agent-loop replay exhibit**, between S-D and S3 — a real recorded
   Investigator-loop trajectory (tool calls → bindings → Skeptic verdict → gatekeeper) replayed in-product,
   $0/keyless. Verified first-hand: existing `evals/fixtures/live/SCN-*.json` are WATERFALL-era (no loop
   steps, no Skeptic) — first task is recording ONE loop-mode run locally (~$0.005 per the cost ledger) and
   committing it as a disclosed "recorded run" fixture. CORRECTION (S2 verify-over-memory pass, same day):
   the 2026-06-28 flagship false-veto was FIXED same-day in pure code + regression-pinned + cross-model
   closure clean — no material findings; the later (A) closure carries the literal APPROVED
   (`PHASE4-SKEPTIC-CALIBRATION.md` §2026-06-28) — the earlier "unfixed wart" note in this
   block was wrong; a fresh loop recording should ACT on Hormuz, and the S-L risk is downgraded (what stays
   owner-gated for live promotion is the billable smoke + public-key posture, not a broken Skeptic). Prior
   art to cite: LangSmith trace replay / AgentOps time-travel debugging (established pattern, live-verified).
4. **Live ceiling set (research-specialist, cited, accessed 2026-07-08; verify-over-memory per owner):**
   S3 = `@modelcontextprotocol/sdk` v1.29.0 (spec 2025-11-25) + Vercel `mcp-handler` v0.2.3 over Streamable
   HTTP (SSE transport deprecated; SDK <1.26.0 has a known vuln — hard floor); stay OFF the v2 beta (spec
   2026-07-28 finalizes in ~20 days; official "stable for critical workloads") but note the assessed v2/
   stateless migration path in the README; bearer-token auth documented as a STATED deviation from OAuth 2.1
   (validate-don't-issue, 401+WWW-Authenticate, read-only scope); assess W3C Trace Context in MCP `_meta`
   (SEP-414) for audit-trail tie-in. S4 = lexical-first CONFIRMED as the 2026 default; eval floor =
   recall@k + MRR on hand-labeled pairs; `pg_textsearch` (BM25-in-Postgres, v1.3.0 production mid-2026) is
   the named upgrade path. S2 = hiring-side credibility ranking: golden-set evals + regression gate >
   recorded trajectory replay > honest failure writeup > MCP endpoint — surface the first and third LOUD.
   Final gate: if past 2026-07-28, recheck the finalized MCP spec (open flag from the research pass).
   **Ladder now: Step-0 reconcile → S2 → S-D → S-L → S3 → S4 → S6 → final Codex → S1 owner deploy.**
   Session resume plan: `~/.claude/plans/check-the-repo-and-ancient-lighthouse.md`.

**S-D BUILD NOTES (2026-07-08, Fable).** The port is the REGISTER, not the mockup — the shipped app's
2,090-line packet view (gated, WCAG-proven, testid-pinned) is the product; the 500-line sample is a
concept on a fake packet. Two gated sub-increments:
- **S-D.1 (token-system swap, app-wide reskin):** neutral family → hue 286 (Apple systemGray6 class),
  canvas deepened 0.985→0.966; accent steel-blue→Forest green (0.5/0.4/0.95 ×0.11-0.035 chroma, hue 148);
  `positive` = accent-strong (green-as-validation is now the SAME single accent, not a second green);
  severity ramp UNTOUCHED (severity-semantic, previously measured); runway-edge de-tinted to neutral 286
  (a green-tinted boundary under amber/red fills would cross-contaminate meaning); tnum+lnum on data
  figures. **Deliberate deviations from the sample:** ink-faint keeps the app's proven L=0.51 (sample's
  0.58 measures <4.5:1 at body size — sample not copied blindly); accent-soft lightened to 0.95/0.035
  (sample's 0.94/0.05 thins the accent-on-soft chip text toward the AA line). NEW committed evidence
  tool: `scripts/contrast-check.mjs` (OKLCH→linear-sRGB→WCAG, 14 pairs, exits 1 below bar) — all 14
  PASS first-hand (tightest: faint-on-sink-deep 4.72, runway-edge 4.41 vs 3.0 bar). All steel-era
  comments truth-updated; README Design paragraph rewritten.
- **S-D.2 (structural signature, BUILT 2026-07-09):** BLUF verdict bar shipped INSIDE ActionOpsPacketView
  (reuses the existing peakRisk/earliestRunout/skepticState/canApprove derivations — nothing computed twice;
  the repo's f(x)-drift lesson applied). Anatomy: ACT/HOLD verdict chip → plain-human one-liner (all approval
  + NO_ACTION states) → metric strip ($ at risk · suppliers · first stockout · confidence, Lucide-iconed,
  tnum) → data-driven 2nd-AI chip (cleared/annotated only; gracefully ABSENT on the pre-Skeptic fixture) →
  "Review & approve" ANCHOR to #approve-h (a path to the one audited approve door, never a second control).
  Non-sticky by design (a second sticky band would re-open the SC 2.4.11 geometry). Two e2e tests added
  (deliberation.spec.ts: real-figure cross-check vs the exposure table + graceful Skeptic absence). Lucide
  was already the app's icon system (14 functional icons pre-existing; 5 added). **Deliberate deviations:**
  (a) full-bleed viewport shell NOT ported — it would discard the owner-locked storytelling-arc briefing
  (2026-06-24) for a register the sample built around a dashboard; the briefing IS the product's reading
  arc, and the app already carries the master-detail anatomy (briefing spine + sticky decision rail).
  (b) left nav rail DEFERRED to S-L: today the app has 2 destinations (war room, /customs); the rail earns
  its place when the S-L replay view makes it 3. Both revisit-able as one increment if the owner prefers
  the literal sample shell.

**S-L BUILD NOTES (2026-07-09, Fable).** Recorded ONE real loop run via a NEW gated recorder
(`evals/record-loop-trajectory.test.ts`, RUN_LIVE_LOOP_RECORD=true, metered $0.0079): SCN-HORMUZ through
the REAL Investigator loop + REAL cross-family Skeptic — NO injected verdict (the D.9 recorder's injected
ACCEPT would be a dishonest exhibit) and a NEW fixture path `evals/fixtures/loop/LOOP-HORMUZ.json` (the
frozen `fixtures/live/SCN-*` set is byte-untouched — its re-capture stays owner-gated). **The recording
itself is evidence: LIVE_AI · ACT · skepticGateOutcome ACCEPTED by meta-llama/llama-4-scout — the
2026-06-28 false-veto fix holds on the live flagship.** Surface: `/loop` (always mounted, no flag — it IS
the replay posture; `await connection()` for the CSP nonce; loader `lib/pipeline/replay-loop.ts` fails
LOUD with no fallback — a broken exhibit must break visibly, never fabricate a trace). DELIBERATE loader
difference from replay-packet.ts (recorded): the landing re-serves a packet AS the product (relabeled
REPLAY/$0); /loop is an exhibit ABOUT a recorded run — an audit-trace viewer — so recorded modes/costs/
models ARE the content, wrapped in "Recorded run" provenance framing ("ran live — {model} (recorded)"
prose, never a bare enum; e2e-pinned). Nav: masthead links (War room ⇄ Agent run ⇄ Customs-when-mounted)
chosen over the deferred rail — three links in existing chrome beats a retrofitted rail duplicating them;
the customs link renders only when the flag mounts the route (a link to a 404 is dishonest chrome).
Tests: +4 unit (loader drift guards incl. never-injected/cross-family assertions) +1 unit (the BLUF 2nd-AI
chip POSITIVE render on the loop fixture — closes the S-D.2 gate residual) +4 e2e (keyless render with
provenance/tool-order/Skeptic-on-glass, axe AA, nav round-trip, focus visibility).

**S3 BUILD NOTES (2026-07-09, Fable).** TRANSPORT REALITY corrected the research digest (verify-over-
memory caught its own research): `mcp-handler@0.2.3` does not exist on npm — live registry latest is
**1.1.0**, whose peerDependency pins `@modelcontextprotocol/sdk` to **exactly 1.26.0** (installed; at the
≥1.26.0 security floor — the handler's tested contract beats "latest SDK 1.29.0"). zod conflict class
(the n8n lesson) checked: SDK peer range `^3.25 || ^4.0` accepts the repo's zod 4.4.3 flat — the README's
"zod@^3" advice is stale. Auth wrapper verified from installed types: `withMcpAuth(handler, verifyToken,
{required:true})` → 401 + WWW-Authenticate. BUILT: endpoint `/api/mcp/mcp` (own base — the [transport]
segment can never shadow other /api routes); 3 read-only fixture-backed tools (get_decision_packet /
query_supplier_exposure / get_audit_trail — same $0/keyless/disclosed posture as the surfaces);
`verifyMcpToken` in security.ts (STRICTER than approval: no demo pass-through, unset/weak/wrong all deny,
shared constant-time compare); structural registry pin + FORBIDDEN_TOOL_VERBS export; audit line per tool
call (AuditTrailEntry shape, actor mcp-client, append-only log). Tests: 10 unit over a REAL in-memory
protocol round-trip (registry pin, mutation-shaped call → isError, disclosure-led REPLAY payloads,
adversarial id → no-match never echoed, schema rejects, token fail-closed ×3) + 4 e2e over REAL Streamable
HTTP (401+WWW-Authenticate no-bearer, 401 wrong-bearer no-leak, GET auth-gated, SDK-client authed
round-trip listing exactly 3 tools). docs/mcp.md = the auth/consent/audit story (stated OAuth 2.1
deviation; assessed 2026-07-28/v2 migration path). README "Agent-ready" section. Pending at rung exit:
security-specialist read + the DEDICATED Codex pass (safety-critical) + gate.

## Deferred / owner-gated (NOT on this ladder, tracked so nothing is lost)
- **Loop + Skeptic live promotion** (`ENABLE_AGENT_LOOP` default-on + Skeptic UI dramatization): blocked on
  billable (G) live gate ×3, the Skeptic geo-caution wart fix, the re-capture coupling, and the owner's
  public-key cost decision. The 2026-06-28 "not yet" STANDS.
- **Billable homepage re-capture** (couples moat re-verification; ONE paid step when the owner greenlights).
- **Walkthrough recording** (human step; script delivered by S2).

## Working set (advisor-selected, revised)
Skills: mcp-builder · next-best-practices · ce-frontend-design / design-taste-frontend ·
evaluation-methodology · ai-security · grill-me-codex · de-slop · documentation · humanizer ·
find-unknowns (S3 transport check).
Subagents: security-specialist (MCP posture) · evals-specialist (retrieval suite) · frontend-specialist
(S-D build support) · acceptance-gate (every increment exit).

## Top risks (with mitigations)
1. MCP as injection/exfil channel → read-only + no-authority tools, red-team extension, token auth,
   security read, dedicated Codex pass.
2. Design rebuild breaks frozen-fixture/oracle coupling → fixture re-derived deterministically, oracles
   asserted byte-unchanged, arithmetic guards stay green; NO paid re-capture in-ladder.
3. RAG dilutes the fail-closed citation bar → retrieval golden suite before consumers; hard bar; skip-with-
   reason allowed.
4. "Native consumer" erosion under showcase pressure → every spec names its consumer; one acceptance test
   per increment asserts the consumer actually renders/uses it; consumer-less capability = cut at spec time.
5. Legibility work introduces unverifiable claims → every README number re-verified on HEAD at S2 and again
   at the final gate.

## Owner queue (surfaced, not blocking)
1. **Deploy (S1, VERY LAST)** — commands above, after the final Codex pass.
2. **Review the S-D design pick** — rationale recorded in § Design decision; revert is one increment.
3. **Record the 2-minute walkthrough** — script delivered by S2.
4. **Later, if desired:** loop/Skeptic promotion decision + the ONE billable re-capture.
