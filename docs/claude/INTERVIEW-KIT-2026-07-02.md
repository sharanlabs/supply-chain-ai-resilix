# INTERVIEW KIT — the §6.1 kill-gate, ready to run (2026-07-02)

**What this is (plain English):** before we commit to building the customs-defense copilot, the plan
requires talking to 3–5 real practitioners to confirm the pain is real and that lawyers would accept
machine-assembled evidence packets. This document is everything you need to run that gate: who to find,
how to reach them, what to ask, and how to score the answers. The decision rule was written down BEFORE
any build output exists, so enthusiasm for what we've built can't soften the gate.

**Source of truth:** `PLAN-CUSTOMS-DEFENSE-2026-07-02.md` §6.1 (gate spec, decision template, time-box).
This kit operationalizes it — if the two ever disagree, the plan wins.

**Time-box:** if fewer than 3 interviews are COMPLETED by **2026-08-15**, the stall itself convenes an
owner decision (recruit harder via ICPA / proceed-at-risk with explicit sanction / pivot to #2 / park).
A "completed interview" = ≥20 minutes with a person who actually does this work, with notes captured in §5 below.

---

## 1. Who to recruit (three roles — a positive signal needed from ≥2)

| Role | Who qualifies | Why they're in the gate | Where to find them |
|---|---|---|---|
| **R1 — Customs broker** | Licensed customhouse broker (LCB) or broker-firm compliance lead; files entries for importers | EO 14411 §4(a) gives brokers PERSONAL penalty exposure for due-diligence failures — closest early buyer (FedEx-as-broker profile). Also the risk: that same exposure may make them risk-averse about AI, not eager (Codex R1 #8) — the interview tests which | NCBFAA membership/events · LinkedIn "licensed customs broker" / "LCB" · local broker associations at major ports (LA/LB, NY/NJ, Chicago) · your own freight-forwarder contacts |
| **R2 — Importer trade-compliance owner** | Director/manager of trade compliance or customs compliance at an importer (sub-giant tier preferred — the actual first customer rung) | They own the CF-28/29 responses and the prior-disclosure decision; they pay outside counsel today | ICPA (International Compliance Professionals Association — the named channel; they run a member Q&A database on exactly CF-28 work) · LinkedIn "trade compliance manager/director" · trade-compliance conferences/webinars |
| **R3 — Trade counsel** | Attorney practicing customs/trade law (prior disclosures, EAPA defense, penalty mitigation) | Doubles as the narrow UPL/positioning pre-check (R1 #7) — the counsel-leverage boundary gets lawyer eyes BEFORE D2, not only at the §6.3 legal gate | CIT bar / customs-law boutiques · AILA-equivalent for trade: CBLA, ABA International Trade committee · authors of recent prior-disclosure client alerts (they publish constantly — warm angle) |

Target 3–5 total. One per role minimum is the floor; a second R2 is the best use of a 4th/5th slot.

## 2. Outreach templates (short, honest, no product pitch)

**LinkedIn / email — R1 broker:**
> Subject: 20 min on CF-28s and the new penalty rules?
>
> Hi [name] — I'm researching how customs brokers and their importer clients handle CBP information
> requests (CF-28/29) and prior disclosures, especially with the new executive-order penalty floors
> coming. I'm evaluating whether purpose-built software would genuinely help or just get in the way —
> not selling anything; there's no product to sell. Would you give me 20 minutes? Happy to share what
> I learn across the interviews.

**R2 importer compliance:** same skeleton; swap the hook →
> …researching how trade-compliance teams assemble CF-28/29 responses and prior-disclosure packages
> today — who does the work, how long it takes, and what it costs when outside counsel is involved.

**R3 trade counsel:** same skeleton; swap the hook →
> …researching whether counsel would ever accept a machine-assembled *evidence* packet (documents
> gathered, numbers traced, gaps flagged) that the attorney reviews and owns — strictly
> counsel-leverage, never counsel-replacement. I'd value 20 minutes of your skepticism.

Rules: never claim a product exists · never promise anything files itself · "researching" is the honest
frame (it is) · offer the cross-interview synthesis as the reciprocity.

## 3. Interview script (~25 min, all roles; role-specific probes marked)

**Open (2 min):** what I'm doing (researching customs-defense workflows before deciding whether to build);
no product, no pitch; ask permission to take notes.

**Core kill/confirm questions (from the plan — ask ALL of these, every interview):**
1. **The pain premise:** "Who assembles your CF-28 responses today? What does it cost and how long does
   it take, end to end?" *(Listen for: hours/weeks, outside-counsel invoices, who actually gathers documents.)*
2. **The whitespace blind spot:** "What software or tools do you — or your counsel — already use for this
   work?" *(THE question our web research cannot answer: private law-firm tools, Big-4 accelerators, custom
   Harvey/CoCounsel deployments are invisible to product-page scans. Name-drop nothing; let them name tools.)*
3. **The counsel-acceptance premise:** "If software assembled the evidence packet — every number traced to
   a source document, gaps explicitly flagged — would your counsel review and use it, or redo it from scratch?"
4. **The veto question:** "What would make you never touch a tool like this?" *(Liability? data? privilege? audit trail?)*
5. **The Twin probe (informs the parked §8 proposal — do not sell it):** "Would you run a standing mock
   CBP investigation against yourselves if it were software-priced instead of consulting-priced?"

**Role-specific probes:**
- **R1 broker:** "Does EO 14411's broker due-diligence exposure change what you'd pay for? Or does it make
  you MORE reluctant to let software near the file?" *(tests Codex R1 #8 directly)* · "When a client gets a
  CF-28, what part lands on your desk?"
- **R2 importer:** "Walk me through your last prior-disclosure decision — what triggered it, who was in the
  room, what did the evidence-gathering look like?" · "What's the annual outside-counsel spend on
  customs-defense work, roughly?"
- **R3 counsel:** "Where exactly is the unauthorized-practice-of-law line for a tool like this — what may it
  produce, and what must remain attorney work?" *(the UPL pre-check — capture verbatim)* · "Would a
  machine-assembled packet create privilege or work-product complications?"

**Close (2 min):** "Who else should I talk to?" (referral chain) · permission to follow up · thank + log.

## 4. Scoring sheet (fill one per interview, same day)

```
Interview #__   Date: ____-__-__   Role: R1 / R2 / R3   Name/org (or anonymized tag): ________
Duration: ___ min   Completed (≥20 min, real practitioner): YES / NO

SIGNALS (mark each: CONFIRM / NEUTRAL / REFUTE + one-line evidence)
S1 Pain: today's CF-28/prior-disclosure work is costly+slow (hours/$ quoted): ______
S2 Whitespace: no existing tool already covers this (tools they named): ______
S3 Counsel-acceptance: counsel would review+use a machine-assembled packet: ______
S4 Buyer energy: this person would champion/pay (or names a budget line): ______
S5 UPL/boundary (R3 only): counsel-leverage framing survives lawyer scrutiny: ______

ROLE VERDICT: POSITIVE / NEGATIVE   (positive = S1 AND S3 lean CONFIRM, no disqualifying S2/S5 find)
Tools named (verbatim, for the falsifier register): ______
Quotes worth keeping: ______
Referrals: ______
```

## 5. The decision (pre-written — do not re-negotiate after D0 exists)

From the plan's recorded template (grill Q1 sunk-cost guard):
- **PROCEED** = ≥3 completed interviews · ≥2 independently confirm today's cost/turnaround pain (S1) ·
  AND a counsel-acceptance signal exists (S3 from any role, R3's weighs most) · AND positive verdicts
  from **≥2 of the 3 roles**.
- **PIVOT to #2 (D&D adjudicator)** = the defense whitespace closes (S2 refuted — interviews surface a
  real incumbent tool; or the Caspian tripwire E28 fires) OR interviews refute the pain.
- **KILL** = BOTH the pain premise (S1) and the counsel-acceptance premise (S3) fail.
- **Stall** (<3 completed by 2026-08-15) = owner decision convened: recruit harder (ICPA) /
  proceed-at-risk with explicit sanction / pivot / park.

The decision + its evidence land in the plan's §9 gate-evidence log. Interview notes live beside this
kit as `INTERVIEW-NOTES-<n>-<date>.md` (anonymize if the person asks).

---
*Kit prepared 2026-07-02 from plan §6.1. Interviews are OWNER-led; this session can draft follow-ups,
synthesize notes, and update the falsifier register as results land.*
