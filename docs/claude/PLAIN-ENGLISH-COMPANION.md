# RESILIX in plain English — the companion guide

> **What this is.** A plain-language mirror of how this project is built and governed. It uses simple *words*, not simple *thinking* — the substance is the same as the technical docs (`PROCESS-CHARTER.md`, `PLAN.md`, `Success_Criteria.md`, `ALIGNMENT-AUDIT.md`), just readable by anyone. It is kept current as the work moves.
>
> **Last updated:** 2026-06-17 (Stage 0 — setting up the process + governance).

---

## 1. What RESILIX is

A supply-chain "war room" for **mid-sized US manufacturers** (roughly 50–499 staff). When a disruption hits — a shipping chokepoint closes, a tariff deadline looms, a key supplier goes bankrupt — RESILIX takes two things: a **live news/disruption signal** and the company's **supplier list (a CSV file)**, and within five minutes produces a single, evidence-backed **action packet**: what's threatened, which of *your* suppliers are exposed, how long your inventory lasts, what to do, and **ready-to-send (but not yet sent) supplier emails** — every number traceable to a source, and **nothing leaves until a human approves it.**

The point of difference: most tools *detect* problems. RESILIX turns the problem into **approved action**, fast, at a price a mid-market team can afford.

## 2. What we're doing right now, and why

The app has already been built in parts and checked. The owner has asked for a **rebuild to "enterprise grade" — the standard a top company would ship — starting from the very beginning.**

Important: "from the beginning" does **not** mean delete everything and retype it. It means **re-think the reasoning behind every piece, re-test each piece against a high bar, and rebuild only what falls short.** Throwing away working, already-checked code would destroy value, not add it. We keep a running ledger (`ALIGNMENT-AUDIT.md`) that gives every component a verdict: *keep it*, or *rebuild it* — with the evidence for the call.

One honest, early finding: the **"brain" of the product — the AI agents that read the news and draft the plan — is still the old version from the app's previous life** (it was a launch-planning tool before). Rebuilding that brain to the new design is the heart of the work, and it needs one thing only the owner can provide: an **API key** for the AI model (Google's Gemini). Everything that doesn't need that key, we build and check in parallel.

## 3. How the work is run (the stages)

We move through fixed stages, one at a time, and **nothing advances until it's checked**:

1. **Ground** — understand exactly what's there today (done as part of this).
2. **Research** — go and read the best current material from the industry and our own knowledge base, fresh as of today, and pair every known way-things-fail with its proven fix.
3. **Plan** — write down precisely what "good" looks like and decide, per component, keep-or-rebuild.
4. **Resources** — pick the right tools and helpers for the job.
5. **Build** — rebuild each part to the bar, one at a time.
6. **Ship + look back** — make it production-ready and record the lessons.

**We verify before we build.** We never build on a guess. Before writing any code, we check the current facts — how the code works today, how the live tools actually behave, what the current industry best practice is — from real sources, dated today. (Checking the *result* after we build is "the gate"; checking the *facts* before we build is this rule. Both, always.)

## 4. The two yardsticks we measure against

Every piece is judged two ways at once: **(A) our own house rules** (safety, honesty, no waste, plain-spoken, quality-first) and **(B) the wider industry's best practice** for that kind of work (the published guidance from Anthropic, Google, OpenAI, Microsoft, Hugging Face, Databricks, and others — read fresh, not from memory). A piece only passes if it satisfies both.

## 5. How we make sure the rules are actually followed (the part that matters most)

We don't ask you to take our word for it. **Every important rule has a specific check that proves we followed it — and the check is done by someone other than the person who did the work** (often a *different* AI model, from a different company, so we can't grade our own homework). Each check leaves a **written record on disk.**

The main checkpoint: before any piece is called "done," an independent reviewer runs **five inspections, in order** —
1. Is the plan airtight, with no hand-waving?
2. Does a **rival reviewer (a different AI model)** actively try to prove it wrong?
3. Do the **tests actually pass** when we run them? (We run them and keep the raw output.)
4. Would a **senior engineer at a top company** approve it?
5. Is it **free of the tell-tale signs of careless AI work**?

Only if **all five pass** does it ship. If any fails, it goes back with the **exact reason**. There's also an **"are we going in circles?" tripwire**: if real progress stalls for two rounds, we stop and tell you, instead of spinning.

There is a full table of these checks in `PROCESS-CHARTER.md` (section 6) — one row per rule, showing the check, who runs it, and the proof it leaves behind.

## 6. Where we are now, and what's next

- **Now:** Stage 0. We've grounded the real state of the app, written the **process and governance** (`PROCESS-CHARTER.md`) and this companion, and named the external sources we'll learn from (kept fresh as of today).
- **Immediately next:** put the governance itself through the cross-check (a rival AI model reviews whether our quality controls are real or just for show), then write the **keep-or-rebuild ledger** (`ALIGNMENT-AUDIT.md`), then run the **deep research**.
- **Held for the owner:** the **AI model key** (to rebuild the product's brain) and **publishing/pushing the code** (held by your explicit instruction).

## 7. A few terms, one line each

- **Action packet** — the finished one-pager RESILIX produces: threat, exposure, runway, playbook, draft emails.
- **The gate** — the independent five-step inspection a piece must pass before it's "done."
- **Cross-model check** — having a different company's AI model try to poke holes in our work, so we don't mark our own homework.
- **Enterprise grade** — the standard a serious company would actually ship and stand behind.
- **Floor, not ceiling** — the named sources/rules are the *minimum* we draw on, never the limit.
- **Evidence on disk** — every check writes its result to a file, so the quality is provable, not claimed.

---
_This companion is updated whenever the technical docs change. If something here ever disagrees with the technical docs, the technical docs win and this gets corrected._
