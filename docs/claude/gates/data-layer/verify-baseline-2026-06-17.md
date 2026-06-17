# Gate evidence — data layer (component B) — verify baseline (RE-GATE: verify-correctness leg)

| Field | Value |
|---|---|
| Component | B — data layer (Phase 2) |
| Gate leg | verify-correctness (proof, not memory — control C3) |
| Command | `npm run verify` = `typecheck && lint && test && build && secrets:scan` |
| Commit | `f0f67b7` |
| Date | 2026-06-17 |
| **Result** | **PASS (exit 0)** |
| Tests | **171 passed / 8 skipped** (17 test files passed / 4 skipped) — vitest, 2.81s |
| Build | `next build` — ✓ compiled successfully (2.3s); 7/7 static pages generated |
| Lint | `eslint . --max-warnings=0` — clean |
| Typecheck | `tsc --noEmit` (+ `next typegen`) — clean |
| Secret scan | `node scripts/secret-scan.mjs` — "No high-confidence secret patterns found" |
| Error count in log | 0 |
| Raw log | `/tmp/resilix-verify-baseline.txt` (session-scratch; this committed file is the evidence of record) |

**Verdict for component B.** The build/test/health leg of the RE-GATE is **VERIFIED green** — the salvage data layer compiles, passes its 171 tests, lints clean, and carries no secrets. Provisional **SALVAGE** holds on health. The remaining B legs — canon spot-check vs *current* Postgres/Drizzle transactional + CSV-injection best practice, and the cross-instance-idempotency expansion note — defer to Stage-1 research (blocked on the account usage reset; see HANDOFF).
