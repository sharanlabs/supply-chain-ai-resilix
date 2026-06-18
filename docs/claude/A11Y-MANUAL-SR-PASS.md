# A11Y — Layer 3: manual screen-reader pass (OWNER ACTION)

**Status: PENDING owner run.** This is the third accessibility layer and the one
that cannot be automated. Layers 1 (axe-core) and 2 (keyboard) run in CI
(`evals/e2e/a11y.spec.ts`); axe catches roughly **57%** of WCAG issues by volume,
and *no* automated tool can confirm that a live region is actually *announced* or
that the reading order makes sense. Only a human with a screen reader can.

Run this once after the component-G a11y work, and again whenever the V2 Action
Packet view (`components/action-packet-view.tsx`) or the tab shell
(`components/launchops-dashboard.tsx`, `components/tab-nav.tsx`) changes shape.

## Setup (~10 minutes, macOS)

1. `npm run dev`, open `http://localhost:3000/` (the default tab is **Action Packet**).
2. Turn on **VoiceOver**: `Cmd+F5` (or Touch ID triple-press). `Ctrl` silences speech.
3. Navigate with `Ctrl+Option+→/←` (next/previous item), `Ctrl+Option+Cmd+H`
   (next heading), `VO+U` (rotor: headings / links / form controls / landmarks).
4. (Optional second pass) **NVDA on Windows** — the owner's platform is macOS, so
   VoiceOver is the primary; NVDA is a nice-to-have for cross-AT confidence.

## Checklist — each line is PASS / FAIL with a note

### Status messages (SC 4.1.3) — the one axe cannot verify
- [ ] With **VoiceOver running and focus left alone**, the page loads on the
      seeded demo (recorded signals). The persistent live region
      (`data-testid="mode-status"`) is **silent** on a healthy live packet.
- [ ] To exercise the announce path: the degraded copy ("Live AI unavailable …
      degraded fallback mode") must be **spoken without moving focus** when a
      packet flips to `FAILED_TO_FALLBACK`. (Reproduce by approving on a degraded
      packet, or temporarily seeding `effectiveMode: "FAILED_TO_FALLBACK"`.)
      This is the heart of layer 3 — automation only proves the node's text
      changed, not that AT voiced it.

### Headings + reading order
- [ ] Rotor → Headings reads a sensible outline: H1 (the at-risk lede) → H2s
      (Threat card, Supplier exposure, Runway, …, Approve the action packet,
      Audit trail) → H3s (Product runout, role playbooks). No skipped/empty levels.
- [ ] Linear `VO+→` reading order matches the visual briefing order; the sticky
      decision rail (approve/gatekeeper/audit) reads as a coherent group.

### Tablist (ARIA APG)
- [ ] The 4 section tabs announce as **"tab, selected, N of 4"** with the section
      name; `←/→` moves between them and the new panel content is reachable.
- [ ] `Tab` from the active tab lands **inside** the panel, not on the next tab.

### Approve control + gatekeeper
- [ ] The **Approve packet** button announces its label and, when disabled, the
      reason (`aria-describedby` → the blocked reason) is read out.
- [ ] The gatekeeper PASS state and its checklist read clearly; a person
      understands *why* approval is allowed before acting (the automation-bias
      guard — distinct from the deferred G-10 UX review).

### Tables, links, icons
- [ ] Exposure / task tables announce column headers per cell (Supplier / Origin
      / Sector / Exposure; Task / Owner / Due / Status).
- [ ] Source/evidence links announce the hostname and that they open a new tab;
      they are reachable and ≥24px targets (layer-2 verifies the size).
- [ ] Decorative icons (lucide glyphs marked `aria-hidden`) are **not** announced;
      the runway bars are understood via their numeric labels, not color.

## Recording the result
Append the outcome (date, AT + version, PASS/FAIL per section, any fix filed) to
the bottom of this file. A FAIL becomes a tracked a11y bug routed back to the E/G
UI work — it does **not** silently pass the gate.

---

### Runs
- _(pending — owner to complete the first VoiceOver pass)_
