# 2-minute walkthrough — recording script (S2 deliverable, 2026-07-08)

**For the owner to record** (screen capture + voice; desktop browser, 1440px+). One take is fine —
the script is timed loose so natural pace lands at ~2:00. Everything shown runs $0/keyless:
`npm run dev` for the war room, `ENABLE_CUSTOMS_DESK=true npm run dev` for the desk. Have both
tabs open before recording. NOTE: record AFTER S-D lands (the design build) so the footage shows
the shipped look — this script's shot list survives the redesign (same flow, new skin).

---

## 0:00–0:15 — the claim (on the war-room landing page, packet visible)

> "This is RESILIX — a crisis-to-action war room for supply-chain teams. One disruption signal
> plus your supplier list becomes this: an evidence-cited action packet a human approves.
> The rule the whole system is built on: **the AI never owns a number**. Every operational
> figure you'll see — dollars, days, exposure — was computed by deterministic code and traces
> to a source. (The one model-authored value, the classifier's own confidence, is labeled as
> such and capped by deterministic evidence checks.)"

## 0:15–0:50 — the packet walk (scroll the landing packet, slowly)

Point at each as you say it:

> "A real captured run, replayed — labelled as replay, never faked as live. The threat card:
> a Strait-of-Hormuz closure, classified into a closed vocabulary, every source linkable.
> The exposure map: which of *my* suppliers are hit, and the exact rule that matched each one.
> The runway simulation: revenue at risk over time — deterministic arithmetic, not model output.
> Drafted supplier emails: every number in the draft carries a claims entry the gatekeeper
> cross-checks in both directions. And nothing sends — ever — until a person approves: on the
> persisted API that's an atomic, audited transition; the approve button on this replay demo is
> a labeled simulation of it."

## 0:50–1:25 — the customs desk: the refusal and the attack (switch tab, `/customs`)

Pick an **under-evidenced case** first:

> "Second surface, same spine: a customs enforcement-defense desk. Here's the state I'm
> proudest of — this case is under-evidenced, so the engine **refuses** to build the filing
> packet and names exactly which records are missing. An assistant that can't say no is a
> liability generator."

Pick an **adversarial case** (injection payload):

> "And this case carries a prompt-injection payload inside an evidence document. The document
> body never reaches the reasoning — quarantined by construction — the attack gets flagged for
> audit, and the disposition doesn't move."

## 1:25–1:45 — how it's checked (terminal, run `npm run verify` — let it scroll)

> "None of that is a demo trick. Eight-hundred-plus deterministic tests, a 34-case golden suite
> where the citation check fails closed, forty-plus end-to-end tests including accessibility —
> one command re-proves all of it. A deterministic Skeptic re-derives the customs packet
> independently, and on live runs a second AI from a different company challenges the finding
> before it counts."

## 1:45–2:00 — how it was built (README "How this was built" section on screen)

> "The build process is part of the artifact: every increment passed an independent acceptance
> gate and an adversarial cross-model review — twenty-two gate records and forty-two recorded
> lessons are committed, including the failure where a perfectly-calibrated critic still vetoed
> a real finding, and the code fix that closed it. The repo is the receipts. Links below."

---

## Shot list (for editing)
1. Landing packet (hero + threat card) · 2. exposure rows + matched-rule text · 3. runway chart ·
4. a draft email's claims chips · 5. approve button (do NOT click on camera unless you want the
approved state shown) · 6. `/customs` case picker · 7. refusal state with named gaps ·
8. adversarial case audit flag · 9. terminal `npm run verify` green tail · 10. README exhibit section.

## Don'ts
No live-AI runs on camera (keys stay off; replay is the story, honesty is the brand). Don't
call it a platform — it's one governed product with two surfaces. Don't say "100% accurate";
say "every number traces or it's blocked."
