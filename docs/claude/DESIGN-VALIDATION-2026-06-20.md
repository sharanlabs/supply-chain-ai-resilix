# UI design-reference validation (2026-06-20)

Closes the Multi-Source-Mandate gap on the premium 2026 redesign: the redesign (steel/cobalt accent, Geist sans, cool-hue elevation) was originally done with taste/judgment but WITHOUT a live external design-reference sweep. This is that sweep — a deep, multi-source, live, cross-verified research pass (research-specialist, read-only/quarantined) validating the redesign against the CURRENT top-tier 2026 design language, then the real refinements applied.

## Sources (live, as-of 2026-06-20; load-bearing claims cross-verified ≥2)
Primary design surfaces: Vercel/Geist, Linear (the redesign post + design-system analyses), Stripe (tokens/type), Apple HIG + the **June-2026 Liquid Glass correction** (TechCrunch 2026-06-08 + Apple Dev), Material 3 Expressive. Anti-AI-slop / human-craft practitioner layer: impeccable.style/slop, prg.sh ("the same purple gradient website", Oct-2025), bswen ("AI-generated UI anti-patterns", Mar-2026), layoutscene, the HN purple-gradient thread. Typography + elevation: Refactoring UI, madegooddesigns, LogRocket, designsystems.surf. (Full URLs in `shared_reasoning.md` / the research digest.)

## Verdict: at the top-tier 2026 bar on 4 of 5 axes — validated, not churned
The 2026 "premium" consensus IS the redesign's spec: a cool neutral ground + ONE desaturated accent + color-as-meaning (Vercel/Linear/Stripe all converge there). Several RESILIX choices are specifically the **crafted counterpart** to named slop tells:
- **Cool near-white ground** — warm cream/beige is now the *slop* default; the cool ground deliberately avoids it.
- **Single steel/cobalt accent** — off purple/green/pink; matches the Linear/Stripe one-accent register.
- **Tinted two-layer elevation** (ambient spread + contact line + inset highlight, hue-262) — exactly Linear's + Refactoring UI's endorsed model, not the flat untuned-shadow tell.
- **Masthead-only blur** — validated by Apple's own June-2026 Liquid Glass correction (glass for nav framing, never stacked, never over content).
- **The decision-rail 2px accent cap** — solid, top edge, on a rounded panel: the confident-accent move, NOT the thick-clashing-border / left-of-hero-metric slop tell.
- Avoids every live slop tell by construction: AI-purple, gradient text, glow-orbs, bouncy easing.

## Refinements applied (real, grounded, zero-a11y-risk)
- **Heavier display weight + tighter tracking on the single largest heading** (the north-star lede h1: `font-medium` → `font-semibold tracking-[-0.01em]`) — the Linear "Inter Display for headings" move; widens the title↔body contrast a step. Screenshot-verified to elevate without disrupting the calm. No contrast/target-size change (a11y gates unaffected).

## Deliberate decisions (NOT gaps)
- **Light-only posture.** Dark mode is "expected" for long-session monitoring tools (one trend signal) but light is fully premium (Stripe/Vercel/Linear/Mercury, multi-source) and the whole token system + every measured AA ratio is light-tuned. A dark theme would re-open every contrast pair + the SC 1.4.11 runway edge — a full re-gate, not a tweak. **Kept light for the portfolio artifact; dark is a documented future-scope item, not a defect.**
- The 4 at-bar axes (palette, accent, elevation, severity/anti-slop) were deliberately **not churned** — the research recommended against change-for-change's-sake, and the doctrine agrees.

## Craft to surface (a reviewer skims past it)
The SVG fractal-noise grain + the lit-from-above dual-bloom (`globals.css body::before/::after`) and the border-AND-shadow elevation (a Linear-lineage choice, distinct from Vercel's shadow-as-border) are real craft on the crafted side of the 2026 line — worth naming in the portfolio narrative so it registers.
