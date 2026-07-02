# D0 GATE — corpus + golden dataset (customs-defense copilot)

**Phase:** D0 (plan §5 — evals-first, NO pipeline code; EXEMPT from the §6.1 interview kill-gate)
**Date:** 2026-07-02 · **Commits:** `1bebf58` (D0.1) · `59e14e4` (D0.2–D0.5) · `9d3deca` (Codex R1 fixes)
**Verdict: PASS** (phase checkpoint; the acceptance-gate panel runs at the D-phase→demo stage exit, not per build phase)

## Exit bar (plan §5 D0) — walked item by item

| Bar | Evidence |
|---|---|
| Machine-door ingestion runs + cached locally | 5 doors live-verified 2026-07-02: FR API (129 docs incl. EO 14411 primary, title confirmed in-cache), OpenSanctions UFLPA (304 entities, slug resolved from live index), USITC HTS (426 rows via `/reststop/search` — `exportList` 400s, discovered live), CourtListener (20 EAPA CIT/CAFC opinions), CATAIR PDF. Committed as-of manifest: `data/customs/corpus-manifest.json` |
| Edge-case matrix v1 | `lib/agents/customsdesk/edge-case-matrix.ts` — 36 flagship prior-disclosure cells (full 4-posture × 3-origin × 3-deadline cross) + 4 CF-28 spine-transfer cells (no SC claims, R1 #13 honored) |
| Generator emits CATAIR-valid records | `catair.ts` + `synthetic-entries.ts`; **Rev 108** (2025-09-09), fetched primary PDF — plan said Rev 106, which was the research-time revision; deviation logged, 108 binds. Field positions cite the layout tables; AE Table 1 check digit implemented + verified against hand-derived oracles that **Codex independently re-derived** (46→4, 71→9, 23→7) |
| Labelled golden set ≥20 with provenance on every case | 24 cases (8 sound / 10 under-evidenced / 6 adversarial), `evals/golden/customs/cases.ts`. ALL tagged `omitted-record-synthetic` (construction-derived labels). **Zero `adjudicated-insufficiency` at D0 by policy** — determination texts not yet read; real CIT dockets (Kingtom, Am. Pacific Plywood, Newtrend, Asia Wheel, ACProducts, Pitts) cited as PATTERN sources only, no outcome claims. Full-strength ≥40/≥15 real-weighted set = D3/SC2 precondition, untouched |
| Graders extended | `packet-graders.ts` — SC1 citation coverage over heading+text, fail-closed on unparseable forms, reuses `lib/evals/numerals.ts` |
| Golden suite runnable (red) | `npm run customs:golden` → **24/24 red** (NOT_IMPLEMENTED at the declared seam `pipeline-stub.ts`); structural leg green inside `npm test` (9 tests). First-hand run 2026-07-02 |
| `npm run verify` green / existing product untouched | Green first-hand ×3 this phase (typecheck+lint+unit+build+secrets, exit 0). No shared ActionOps file modified; customs code is additive under `lib/agents/customsdesk/` |

## Cross-model gate (Codex, batched at the phase checkpoint per doctrine)

- **Round 1: REVISE ×5** (4 P2, 1 P3) — **all 5 accepted** primary-model-final, all demonstrably real:
  1. transshipment cells lost the declared-vs-questioned origin tension (now explicit in `meta`),
  2. golden MISSING gaps under-specified vs generator (G16 omitted BOM too; exact-match both directions now enforced),
  3. UOM validator rejected valid alphanumeric units (`M2`),
  4. check-digit tests were self-referential (independent hand-derived fixtures added),
  5. grader ignored section headings (now scanned + regression test).
- **Round 2: APPROVED**, no blocking findings; check-digit fixtures independently re-derived by Codex.
- Codex could not execute vitest in its read-only sandbox (EPERM on temp dir) — covered by first-hand green runs here.

## Honest residuals (tracked, not silent)

- CSMS/GovDelivery + GovInfo/Census doors: later D0.1 increment (GovInfo needs a free owner key). SC7 rule-tracking builds at D1+.
- CBP dashboards / EAPA case PDFs / CROSS / FOIA: **owner browser queue** (designed around, never scraped around).
- `adjudicated-insufficiency` upgrades + full-strength golden set (≥40, ≥15 under-evidenced real-weighted, holdout+mutations): D3 work, gated.
- D1+ remain **BLOCKED behind the §6.1 interview kill-gate** (time-box 2026-08-15). D0's existence must not soften that gate — the PROCEED/PIVOT/KILL template was recorded before D0 started.
