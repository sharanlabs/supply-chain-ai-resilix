# Deploy

RESILIX runs locally with zero config (`npm install && npm run dev`). This note covers the **public / hosted** posture, since the default local demo is intentionally authless.

## Recommended public posture — REPLAY-only

The landing page serves a **frozen, live-captured REPLAY packet** ($0, no network, no LLM). That is the right thing to expose publicly:

- `ENABLE_LIVE_AI=false` (no Gemini key) — the deterministic spine renders the packet; no model spend, no key on a public host.
- No `DATABASE_URL` — in-memory store; nothing persists.
- The read-only landing REPLAY renders for everyone.

## Mandatory: the mutation surface is fail-closed in production

A hosted production server (`next start`, `NODE_ENV=production`) is **secure by default** — the mutation routes (`/api/suppliers/upload`, `/api/decision-packets/[id]/approve`, `/api/run-exception`) require a bearer `APPROVAL_TOKEN` (`secureModeRequired()` folds in production; see `lib/server/security.ts`). So:

- **REPLAY-only public demo:** set no token. Mutations return `503` (fail-closed); the landing REPLAY still works. This is the safe default — an exposed deploy can never leave mutations open.
- **Authorized mutation surface:** set `REQUIRE_APPROVAL_TOKEN=true` **and** a strong `APPROVAL_TOKEN` (≥16 chars). Callers must send `Authorization: Bearer <APPROVAL_TOKEN>`.

Never host a public instance with `ENABLE_LIVE_AI=true` and no `APPROVAL_TOKEN` — that would expose the metered Gemini budget to anonymous callers (the live-AI predicate is already folded into secure mode for exactly this reason).

## Platform

The app is a server-rendered Next.js 16 app (the strict per-request CSP nonce in `proxy.ts` requires dynamic rendering — it is **not** a static export). Any Node host or Vercel works. If deploying via a CLI/dir push, add a `.vercelignore` (or platform equivalent) to keep `db/`, `evals/`, `scripts/`, `data/`, and any local `.env` out of the upload.

## Before going public — checklist

- [ ] `npm run verify` green (typecheck, lint, test, build, secret-scan).
- [ ] No secrets in tracked files or git history (`npm run secrets:scan`; `.env` is gitignored).
- [ ] Rotate any API key that has sat in a local `.env` working tree.
- [ ] Decide the posture above (REPLAY-only vs authorized) and set env accordingly.
- [ ] `npm audit` residuals reviewed (currently low/moderate only, no high/critical; CI runs `--audit-level=high`).
