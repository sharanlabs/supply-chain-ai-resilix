# Front-Screen Storytelling Arc — Decision Rule + Applied Redesign

_As-of 2026-06-23. Grounded in two live, quarantined research passes (consumer crisis-to-action
arcs; authoritative SCRM/procurement terminology) + a read of the actual primary surface
(`components/action-packet-view.tsx`, `components/actionops-dashboard.tsx`, `components/tab-nav.tsx`).
No claims from training memory; provenance labels carried from the source research._

> **For whom.** A mid-market procurement / ops / finance lead in the **first hour** of a live
> supply disruption. Non-technical about AI. Stressed, time-poor. Must go from "something broke"
> to "I acted" fast. A professional layperson should grasp the **overall idea** — not the depth.

---

## 1. The decision rule — on what basis the arc is sequenced

The arc is **not** decided by our system architecture. It is decided by the user's moment. The
repeatable rule (anyone can re-derive the same arc from it):

1. **Start from the user's moment, not the system's dataflow.** Sequence around what the reader
   needs to feel and decide — never a tour of our pipeline stages.
2. **Follow the universal consumer-crisis order** — verified across emergency alerts, Amazon
   A-to-z, bank fraud alerts, and Baymard returns research:
   **SITUATION → IMPACT-ON-US → ACTION → CONFIRM/TRUST.**
3. **Anchor to the user's *own* instance.** Open on *their* exposed suppliers, not a generic feed —
   that is how "does this even touch me?" gets answered in one read. (Amazon opens on the specific
   order; Uber on the specific trip; fraud on the specific transaction.)
4. **One flowing briefing, not a multi-tab control surface.** The single scrolling narrative is
   universal among consumer crisis surfaces; the multi-tab control board appears *only* in the
   technical-operator tool (PagerDuty) — built for the person who fixes the machine, the opposite
   of our user.
5. **Trust is earned by a confident plain outcome + a human approve gate + reversibility — not by
   displaying the AI's confidence/scoring.** The machinery stays *available* one tap down (for
   audit), never *first*. (Bank fraud: hide the model, show the outcome, ask one YES/NO.)
6. **Language = the practitioner's own words where standard, plain human English everywhere else,
   helpful AI words allowed, deep machinery banned from the glass.** "AI-drafted" aids
   comprehension and stays; `VERIFIER · effectiveMode`, dotted `sourcePath`, raw enums, `Gatekeeper`,
   `dataTier` do not.
7. **When you have more room, deepen the ACTION, not the situation.** (Emergency alerts spent their
   entire 90→360-char expansion on more *what-to-do* detail — weather.gov/wrn/wea360, fetched.)

### What this rule says about *our* current screen

The good news, confirmed by reading the code: **our briefing spine is already right.** The default
Action Packet view (`action-packet-view.tsx:264-273`) already flows
`lede → threat → who's hit → how fast → drafted response → your call`. Resequencing is the **weak**
lever. The real work is three moves, in priority order:

- **CONSOLIDATE (dominant move):** fold the 4-tab analyst layer (`Events / Exposure / Simulation /
  Packet`) into the one flowing briefing. The tabs are the PagerDuty operator tell; the briefing
  already contains their content in narrative form.
- **RELANGUAGE:** strip machinery to drill-down; keep plain, human, lightly-AI copy.
- **RESEQUENCE (minor):** the spine barely moves.

---

## 2. Terminology — keep / replace / kill (every verdict cross-verified ≥2 live sources)

**KEEP on the glass — the practitioner's own words:**
`exposure` (noun), `lead time`, `revenue at risk`, `chokepoint`, `disruption`, `playbook`,
`supplier tier` (supplier sense only).
_Sources: Resilinc glossary + Everstream (fetched 2026-06-23); ASCM/APICS (lead time, search summary)._

**REPLACE — product coinage → grounded practitioner term:**

| Current (on glass) | Replace with | Source |
|---|---|---|
| `runway` ("14-day runway") | **days of cover / days of supply** | APQC/IBF/Penske "days of supply" (search 2026-06-23); "runway" explicitly called *colloquial*. _(A `Time-to-Survive` reframe surfaced from repo memory, but was NOT live-verified — not recommended until live-checked, per the no-memory rule.)_ |
| `exposure score` (bare 73) | **FLAG — likely KEEP (see note)** | "risk score" is the vendor-standard compound (Resilinc R-Score, Interos i-Score), BUT renaming collides with our own two-axis design — see note below the table. |
| `action packet` / `decision packet` | **response plan / recommended actions** (the "Respond" step of PPRR) | Absent from all glossaries scanned; NetSuite PPRR, Gartner, FEMA (2026-06-23) |
| bare `signal` / `public signal` | **early-warning signal / risk signal / public alert / news event** | "risk signal" verified (Interos, Everstream/Sphera); bare token collides with ML "signal vs noise" |

**NOTE on `exposure score` — a cross-cut the word-level research couldn't see.** Our code
(`action-packet-view.tsx:46-58`) *deliberately* keeps `exposureScore` (a 0–100 ranking) and `tier`
(CRITICAL/HIGH/…) as **two different axes**: a HIGH supplier on a long lane can outscore a CRITICAL
on a short one (stated as intended in `atlas.ts`). If we rename the score column to "Risk score"
while "risk tier" sits beside it, a user reads "Risk score 73 / HIGH" next to "Risk score 68 /
CRITICAL" — the inversion now looks like a bug. So the linguistic upgrade ("risk score") fights the
architecture. **Recommendation: KEEP "exposure score" as the glass label** (it linguistically
separates the two axes), and instead de-emphasize the raw number visually (bar + tier lead). Owner
call — flagged, not silently applied.

**FRAME (recognizable, but tighten):**
`route diversion` → prefer **rerouting**; `exposure map` → **risk heat map / risk map** (Resilinc ships
"Supply Chain Heat Map" as an exact entry); `risk tier` → must read as a **risk-severity band**, never
the data-completeness "tier" (head-on collision with SCRM Tier-1/Tier-2).

**KILL from the glass (engineering/AI-posture pages only):**
`agent`, `classifier`, `LLM judge`, `confidence gate`, `mode taxonomy`,
`replay/deterministic/live` strings, `pipeline`, and the in-code machinery:
`VERIFIER · effectiveMode`, raw `eventType` enums (`CHOKEPOINT_CLOSURE`), `Gatekeeper`, `dataTier`,
dotted `sourcePath` (`exposureResults[0].exposureScore`).
_Basis (corrected per research): NOT "no vendor uses these" — Resilinc's own glossary contains "AI
Agent," "LangGraph," "Guardrails." It's that **a procurement lead in hour zero does not speak these
words**; they belong on an engineering page, never on the surface they act from._

**THE TRAP — `war room`:** real practitioner language (KPMG), BUT **Resilinc trademarks "WarRoom"**
as a product (live-confirmed in their glossary, 2026-06-23), and the repo already has a standing
positioning decision against leading with it. Keep **"Command" / "accountable disruption-response."**

---

## 3. Applied before → after (real front-screen copy)

| # | Section (code anchor) | Before (on glass today) | After |
|---|---|---|---|
| 1 | Masthead (`actionops-dashboard.tsx:108-150`) | `RESILIX ActionOps · Command · OP · RX-2614 · Recorded signals 2026-…` | `RESILIX · Disruption response` + quiet honest `Recorded · <date>` chip. Drop the `OP · RX-2614` op-code. |
| 2 | Tab bar (`tab-nav.tsx`) | 4 tabs: `01 Events / 02 Exposure / 03 Simulation / 04 Packet` | **Removed.** One flowing briefing. (Optional: a single "Sources & detail" drill-down, not a tab board.) |
| 3 | North-star lede (`:462-492`) | "A disruption at {where} puts **$2.7M** of supply at risk." + "Here is what we know, who it hits, how fast it bites, and the response we've drafted for your sign-off." | **Keep — this is already model copy.** Plain, human, situation-first. |
| 4 | The threat — provenance line (`:586-600`) | `VERIFIER · {effectiveMode} · evidence allowlist passed` (mono) | "Every figure here traces to a named source." Sources stay clickable. `VERIFIER/mode` → drill-down. |
| 5 | The threat — raw enum (`:540-542`) | mono `{threatCard.eventType}` = `CHOKEPOINT_CLOSURE` | **Removed from glass** (the human headline already says it). |
| 6 | Who is hit (`:673-716`) | column `Exposure`, bare `exposureScore` (73); `Sector` in mono code font | **Keep `Exposure score`** (the two-axis note above); de-emphasize the raw number — bar + tier lead; `Sector` in normal text. |
| 7 | How fast it bites (`:739-805`) | `{days}-day runway`; badge `{packet.dataTier}` | **`days of cover`**; **drop the `dataTier` badge.** Header "How fast it bites" stays. |
| 8 | Drafted response — claims (`:919-944`) | human line + dotted `sourcePath` (`exposureResults[0].exposureScore`, mono) | Keep the human line ("from this supplier's exposure result"). `sourcePath` → drill-down only. |
| 9 | Your call (`:1124-1127`) | "Code calculates the exposure; the AI drafts the response…" | **Keep** — helpful AI words, plain, human. Exactly the register we want. |
| 10 | Your call — checks (`:1133-1177`) | `Gatekeeper` `PASS`; "Every numeral maps to a structured claim / evidence allowlist / known supplier IDs" | **"Automatic checks passed"**: "every number traced to a source · all links verified · suppliers matched to your list." Drop the word `Gatekeeper`. |
| 11 | Your call — trust promise (new) | _(none)_ | **Add: "RESILIX never sends anything without your approval."** (banks' "We Don't Ask That" pattern — cheap, high-trust, serves Q4.) |
| 12 | Audit trail (`:1243-1247`) | `{packet.effectiveMode}` badge | mode → drill-down; "Figures traceable to recorded signals" stays. |
| 13 | Packet noun, throughout | `Decision packet · awaiting your approval` | **`Response plan · awaiting your approval`** (glass label only; keep `packet` in code/types). |
| 14 | NO_ACTION refusal (`:208-258`) | "the evidence is too thin to act on" | **Keep — research-validated.** Plain-language uncertainty beats a confidence score (Uber's deliberate "something went wrong"). |

---

## 4. Owner decisions to confirm (not mine to make unilaterally)

1. **Consolidate the 4 tabs into one briefing?** Highest-leverage change. Tradeoff: gains
   speed-to-confident-action for a non-technical lead; loses the standalone analyst views. Research
   verdict: consolidate. Confirm before I touch structure.
2. **Rename the on-glass artifact `decision/action packet` → `response plan`?** Touches product
   vocabulary (the product name "ActionOps" is unaffected; this is the *artifact* label). Confirm.
3. **Keep `exposure score` (recommended) or rename to `risk score`?** Renaming is the vendor-standard
   word but collides with our deliberate score-vs-tier two-axis design (would read as a bug). I
   recommend KEEP + de-emphasize the raw number. Confirm.

---

## 5. Provenance & caveats (carried honestly from the research)

- **Strongest (fetched-primary):** emergency-alert copy (weather.gov), Amazon A-to-z flow, bank
  fraud flow (Centennial Bank), Baymard returns research, PagerDuty contrast, Resilinc + Everstream
  glossaries.
- **Weaker (search-summary, flagged):** DoorDash's full arc past step 5 (paywalled) and Uber's exact
  issue-category copy (JS-walled) — used only for corroboration, never asserted as fact.
- `revenue at risk` is established **vendor/practitioner usage** (Resilinc + Everstream), **not** a
  formal ASCM dictionary metric — cite accordingly.
- CSCMP / Gartner glossary pages / Investopedia were **403/blocked**; their verdicts lean on
  Resilinc + Everstream + ASCM/Gartner *article* summaries (cross-verified, but those named pages
  weren't directly reached).

---

## 6. After the rebuild — 360° all-perspectives evaluation (per owner instruction)

Independent passes before "done": end-user layperson · procurement pro · design/taste ·
language/human-resonance · accessibility (WCAG) · cross-model devil's-advocate (Codex) gate.
Logged to `shared_reasoning.md`.
