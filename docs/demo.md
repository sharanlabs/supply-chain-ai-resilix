# RESILIX ActionOps — demo walkthrough

> Supersedes the archived predecessor script (`docs/_archive/demo_script.md`, LaunchOps‑era —
> do not use). This walkthrough describes the current ActionOps single‑briefing surface.

This is a **deterministic, $0, key‑free** demo. The whole spine runs with **no `GEMINI_API_KEY`,
no network call, no LLM call** — live AI (Gemini) is optional and only swaps in LLM‑drafted prose;
it changes nothing about the math, the evidence, or the refusal.

## Run it (no setup, ~90 seconds)

```bash
npm install
npm run dev
# open http://localhost:3000
```

`/` is the recorded **Hormuz chokepoint** briefing — a frozen capture of a real run, replayed at
$0 and labelled "Recorded signals: <date>" (it is REPLAY end‑to‑end and never claims to be live).

## What you're looking at — one human briefing

The screen reads top‑to‑bottom as a procurement lead's decision journey, not a pipeline diagram:

1. **The situation** — what disrupted, where, how fresh the signal is.
2. **Who's hit (exposure)** — your suppliers in the blast radius, each matched with a reason.
3. **How fast it bites (runway)** — inventory days / impact, every number tracing to a cell or a
   cited source.
4. **The drafted response (the "Response plan")** — supplier emails + an exec one‑pager, drafted
   but **never sent** until a human approves.
5. **Your call** — **Approve / Reject**, with an audit trail.

Plain version: *"here's the threat, here's who it hurts, here's how long you have, here's a
ready‑to‑send response, and nothing leaves without your say‑so."*

## The two behaviours that matter (both deterministic)

- **The evidence‑cited action packet** (the `/` briefing): every claim links to the spreadsheet
  cell, the formula, or the public citation it came from. Approving is the human decision; the
  gatekeeper sits underneath as quiet evidence.
- **The refusal (`NO_ACTION`)**: when the evidence is thin or single‑sourced, the system **declines
  to act** and states exactly what's missing — and the approve button is blocked with a reason
  ("No outbound action to approve — the disruption must be confirmed first"). This is the
  differentiator no incumbent markets. It's asserted deterministically in
  `evals/actionops-no-action.test.ts` (validated at a Sentinel confidence of 0.10).

See both proven, key‑free:

```bash
npm test        # the eval suite: action packets across the scenarios + the NO_ACTION control
                # + the deterministic graders (entity ids, evidence‑URL allowlist, citation/unit
                # consistency, injection quarantine)
npm run verify  # typecheck + lint + tests + build + secret scan (the merge gate)
```

## Deterministic vs. live (optional)

| | Default (this demo) | With `GEMINI_API_KEY` + `ENABLE_LIVE_AI=true` |
|---|---|---|
| Exposure / runway / impact math | deterministic | unchanged (still deterministic) |
| Evidence + citations | deterministic | unchanged |
| Refusal threshold | deterministic | unchanged |
| Email + one‑pager prose | recorded (REPLAY) | drafted live by Gemini |
| Cost | $0 | metered (cost ledger) |

The point: **the trustworthy parts never depend on the model.** The LLM only writes prose, inside a
gatekeeper that strips any claim it can't cite. (Auth is off for the local demo —
`REQUIRE_APPROVAL_TOKEN=false`; set it `true` for any shared/hosted demo.)

## Going deeper

- Thesis + positioning: [README.md](../README.md)
- Build plan + cross‑model review trail: [PLAN.md](../PLAN.md) · [PLAN-REVIEW-LOG.md](../PLAN-REVIEW-LOG.md)
- Hosting / deploy story: [deploy.md](deploy.md)
