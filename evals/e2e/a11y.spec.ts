import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

// ---------------------------------------------------------------------------
// Accessibility CI -- layer 1 (axe) + layer 2 (keyboard) + the WCAG 2.2
// measurements that axe cannot make under OKLCH. The MANUAL screen-reader pass
// is layer 3 (a human step -- see docs/claude/A11Y-MANUAL-SR-PASS.md).
//
// Scope: the live `/` route -> the V2 ActionOps view
// (components/action-packet-view.tsx). The calm-command-center rework consolidated
// the former four-tab layer into ONE flowing briefing, so there is a single
// surface to scan (no tablist). The exposure table, runway simulation, raw signal
// feed, playbooks and tasks all live in the one briefing -- the on-demand ones
// behind <details>, which the "every disclosure expanded" scan opens so axe still
// covers them. The landing surface renders a FROZEN live-captured packet served as
// a recorded REPLAY (loadReplayPacket) -- genuine captured pipeline output (a real
// live Gemini run), not a hardcoded demo -- so this scans real, rich output in a
// real browser (it is NOT jsdom-only).
//
// Every scan/measurement first awaits settle() -- all running animations have
// finished -- so axe and the geometric reads see the FINAL frame, never a
// mid-fade (opacity-blended) layout. (Playwright's reducedMotion emulation is
// not honored by this app's matchMedia, so explicit settling is the real
// guarantee, not a media-query toggle.)
// ---------------------------------------------------------------------------

// WCAG normative A + AA, including the 2.2 additions (axe tags them wcag22aa).
const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// --- WCAG relative-luminance contrast, from ground-truth sRGB ---------------
function channelLin(c8: number): number {
  const c = c8 / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function luminance([r, g, b]: number[]): number {
  return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}
function contrastRatio(a: number[], b: number[]): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// Resolve ANY CSS color (oklch, var(--token), rgb(...)) to ground-truth sRGB
// bytes IN THE BROWSER. A 2D canvas is the color resolver: it rasterizes
// whatever the engine computes to sRGB, side-stepping the OKLCH-serialization
// gap that makes axe's color-contrast rule report `incomplete` here. This is
// why the contrast checks below -- not axe's rule -- are the real G-4 proof.
async function resolveSrgb(page: Page, cssColor: string): Promise<number[]> {
  return page.evaluate((col) => {
    const probe = document.createElement("span");
    probe.style.color = col;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const cv = document.createElement("canvas");
    cv.width = 1;
    cv.height = 1;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("no 2d canvas context");
    ctx.fillStyle = resolved;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  }, cssColor);
}

// Wait for EVERY running animation to finish before axe scans or geometry reads.
// The reveal / runway-fill transitions fade through partial opacity, and
// Playwright's reducedMotion emulation is NOT honored by this app's matchMedia
// (verified) -- so reading mid-fade would hand axe opacity-blended colors and
// produce phantom contrast "violations". Settling guarantees the final frame.
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // Await only FINITE animations: an ambient infinite loop (the deck's scroll
    // cue) has a `finished` promise that never resolves by definition, and
    // awaiting it would hang every settle-gated test to its timeout. Transient
    // entrance/transition animations are the ones that can poison a geometry or
    // axe read (lesson G); an infinite ambient loop is steady-state by design.
    await Promise.all(
      document.getAnimations().map((a) => {
        // Scroll/view-timeline animations (the deck's card-stack settle) have no
        // time-based end -- their `finished` promise resolves on scroll progress,
        // not on a clock -- so awaiting them hangs forever, exactly like an
        // infinite loop's. Await only FINITE, DOCUMENT-TIMELINE animations: those
        // are the transient entrance/transition effects that can poison a read.
        if (a.timeline !== document.timeline) return undefined;
        const timing = a.effect?.getTiming();
        if (timing && timing.iterations === Infinity) return undefined;
        return a.finished.catch(() => undefined);
      })
    );
  });
}

type AxeResult = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type AxeNode = AxeResult["violations"][number]["nodes"][number];

function axeTargets(nodes: AxeNode[]): string[] {
  return nodes.map((n) => n.target.join(" ")).slice(0, 5);
}

// One clean-check used by EVERY axe scan. It asserts `violations` is empty and
// triages `incomplete` per node -- NOT by a blind rule-id allow-list (which
// would let a real, uncovered node pass). `incomplete` means "axe could not
// DECIDE": here the only legitimate causes are text over a background axe cannot
// composite to a single solid color, or text geometrically OCCLUDED by another
// element. There are THREE such cases on this surface, so a color-contrast
// incomplete is forgiven ONLY on one of them, and only after its REAL WCAG ratio
// is measured by ground truth:
//   (1) the approve-rail CSS gradient (text inside .bg-gradient-to-b) -- measured
//       against the gradient's darkest effective stop (accent-soft/60 over surface);
//   (2) the translucent, blurred sticky masthead (text under .backdrop-blur-xl) --
//       it paints var(--color-ground) at 80% alpha and the page behind it (at the
//       scanned page-top -- none of the layer-1 scans scroll) is also
//       var(--color-ground), so the composite is exactly ground; measured against it.
//   (3) a deck card's text (inside .dk-card): the pin-and-stack layout lets a
//       LATER sticky card overlap the settled one, so axe reports the overlap as
//       "partially obscured" -- but the text's OWN background is its nearest
//       actually-painted ancestor background (usually the card's solid surface),
//       so its true ratio is measurable against that solid; the day-scale wash
//       (the one in-card gradient) measures against its darkest stop.
//   (+) a node whose content is ONLY non-text glyphs (the decorative arrows) has
//       no text to rate under SC 1.4.3 -- exempt ONLY if aria-hidden (asserted).
// So:
//   - any incomplete rule OTHER than color-contrast is a genuine undecided gap
//     -> fail loud;
//   - a color-contrast incomplete on NEITHER known background -- or that fails its
//     ratio -- fails loud (never a blanket pass). This runs INSIDE every scan, so
//     no state's incomplete is left unmeasured, and the background is verified per
//     node, never assumed.
// Contrast axe CAN resolve lands in `violations` and is asserted above.
async function assertAxeClean(
  page: Page,
  results: AxeResult,
  label: string
): Promise<void> {
  expect(
    results.violations,
    `[${label}] axe violations: ${JSON.stringify(
      results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        targets: axeTargets(v.nodes)
      })),
      null,
      2
    )}`
  ).toEqual([]);

  const undecided = results.incomplete.filter((r) => r.id !== "color-contrast");
  expect(
    undecided,
    `[${label}] axe UNDECIDED (non-contrast incomplete -- needs a real fix or dedicated coverage): ${JSON.stringify(
      undecided.map((r) => ({ id: r.id, targets: axeTargets(r.nodes) })),
      null,
      2
    )}`
  ).toEqual([]);

  const ccNodes =
    results.incomplete.find((r) => r.id === "color-contrast")?.nodes ?? [];
  if (ccNodes.length === 0) return;

  // Resolve each known uncompositable background to a ground-truth solid we can
  // measure against. (1) The rail gradient's darkest effective bg = accent-soft at
  // 60% over surface. (2) The masthead paints var(--color-ground) at 80% over the
  // page, whose background is also var(--color-ground) at the scanned page-top, so
  // the composite is exactly ground (ground is also the darker of {ground, surface},
  // so this is the conservative case if a lighter surface ever sat behind the band).
  const accentSoft = await resolveSrgb(page, "var(--color-accent-soft)");
  const surface = await resolveSrgb(page, "var(--color-surface)");
  const railBg = accentSoft.map((c, i) => Math.round(0.6 * c + 0.4 * surface[i]));
  const mastheadBg = await resolveSrgb(page, "var(--color-ground)");

  for (const node of ccNodes) {
    const selector = node.target[node.target.length - 1] as string;
    // A node axe rated incomplete because its content is ONLY non-text glyphs
    // (the deck's decorative arrows) has no text to rate under SC 1.4.3 -- but
    // ONLY when it is genuinely decorative: it must sit inside aria-hidden, or
    // the glyph is conveying meaning without a contrast guarantee -> fail loud.
    const checkMessages = [
      ...(node.any ?? []),
      ...(node.all ?? []),
      ...(node.none ?? [])
    ].map((c) => c.message ?? "");
    const nonTextOnly =
      checkMessages.length > 0 &&
      checkMessages.every((m) => /only non-text characters/i.test(m));

    const info = await page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          color: s.color,
          fontPx: parseFloat(s.fontSize),
          weight: parseInt(s.fontWeight, 10) || 400,
          ariaHidden: el.closest('[aria-hidden="true"]') !== null,
          onRailGradient: el.closest(".bg-gradient-to-b") !== null,
          onMasthead: el.closest(".backdrop-blur-xl") !== null,
          onScaleZone: el.closest(".dk-scale") !== null,
          onDeckCard: el.closest(".dk-card") !== null,
          // Sharpened (gate route-back): the node's TRUE painted background is
          // the nearest non-transparent ancestor background at or below the
          // card, not blindly the card surface -- a tinted chip/pill between
          // the text and the card would otherwise be measured against the
          // wrong solid. Walk up to the card and report what actually paints.
          nearestOpaqueBg: (() => {
            let cur: Element | null = el;
            while (cur) {
              const bg = getComputedStyle(cur).backgroundColor;
              if (bg && !/^rgba\(\s*\d+,\s*\d+,\s*\d+,\s*0\)$/.test(bg) && bg !== "transparent") {
                return bg;
              }
              if (cur.classList.contains("dk-card")) break;
              cur = cur.parentElement;
            }
            return null;
          })()
        };
      });
    // Decorative-glyph exemption: no text, no 1.4.3 ratio to measure -- but the
    // aria-hidden requirement is asserted, never assumed.
    if (nonTextOnly) {
      expect(
        info.ariaHidden,
        `[${label}] "${selector}" contains only non-text glyphs but is NOT aria-hidden -- either hide it from AT or give the glyph a contrast guarantee`
      ).toBe(true);
      continue;
    }

    // Every incomplete node MUST sit on one of the known cases; anything else is
    // a genuine uncovered gap -> fail loud. The day-scale wash (the ONE in-card
    // gradient) measures against its darkest stop (danger-soft), conservative;
    // other card nodes measure against the node's NEAREST actually-painted
    // background inside the card (falling back to the card surface only when
    // everything between is transparent).
    const knownBg = info.onRailGradient
      ? railBg
      : info.onMasthead
        ? mastheadBg
        : info.onScaleZone
          ? await resolveSrgb(page, "var(--color-danger-soft)")
          : info.onDeckCard
            ? info.nearestOpaqueBg
              ? await resolveSrgb(page, info.nearestOpaqueBg)
              : surface
            : null;
    expect(
      knownBg,
      `[${label}] color-contrast incomplete "${selector}" is on none of the known cases (approve-rail gradient, translucent masthead, day-scale wash, sticky-overlapped deck card) -- it needs a real fix or its own dedicated coverage, not a blanket pass`
    ).not.toBeNull();
    // WCAG large-text threshold: >=24px, or >=18.66px bold -> 3:1, else 4.5:1.
    const large =
      info.fontPx >= 24 || (info.fontPx >= 18.66 && info.weight >= 700);
    const need = large ? 3 : 4.5;
    const ratio = contrastRatio(
      await resolveSrgb(page, info.color),
      knownBg as number[]
    );
    expect(
      ratio,
      `[${label}] incomplete "${selector}" (${info.fontPx}px) vs its known background = ${ratio.toFixed(2)}:1 < ${need}`
    ).toBeGreaterThanOrEqual(need);
  }
}

// ===========================================================================
// Provenance guard -- the scans below claim to cover the REAL captured packet.
// app/page.tsx catches a loadReplayPacket failure and renders makeDemoPacket()
// (id DP-DEMO-HORMUZ). Assert the surface under test is the genuine captured packet
// (id DP-<uuid>) so a silently fallen-back demo can never pass the suite while the
// suite claims to scan real output.
// ===========================================================================
test("the `/` surface renders the real captured packet, not the demo fallback", async ({
  page
}) => {
  await page.goto("/");
  const packetView = page.getByTestId("actionops-packet");
  await expect(packetView).toBeVisible();
  await expect(packetView).not.toContainText("DP-DEMO-HORMUZ");
});

// ===========================================================================
// Replay-mode honesty (Success_Criteria "Replay mode rendering"): the landing
// surface serves a FROZEN live-captured packet relabeled REPLAY -- it must show
// the REPLAY mode + a dated capture, and must NEVER claim live.
// ===========================================================================
test("the `/` surface renders REPLAY with a dated capture, never labeled live", async ({
  page
}) => {
  await page.goto("/");

  // The masthead provenance pill (unique by title) states recorded-not-live and carries
  // the dated capture (YYYY-MM-DD) -- a viewer is never shown replay as a live fetch.
  const provenance = page.locator('[title*="recorded fixtures"]');
  await expect(provenance).toBeVisible();
  await expect(provenance).toContainText(/\d{4}-\d{2}-\d{2}/);

  // The deck's mode chips read as the human label "Recorded" (the relabeled
  // effectiveMode -- the raw REPLAY enum is humanized on the calm glass, kept for
  // an auditor in the chip's title, which the deck writes as "Recorded replay
  // (REPLAY)": readable AND carrying the exact enum). The audit trail still
  // records the exact "REPLAY_SERVED" provenance entry -- the honest compliance
  // log, not the briefing spine, so REPLAY legitimately appears there.
  const packetView = page.getByTestId("actionops-packet");
  // Specific, not generic: at least one mode chip is genuinely REPLAY (the enum
  // in its title) AND humanized to "Recorded" in its text -- so this can't pass
  // from unrelated "Recorded" copy, and proves the raw enum was relabeled.
  const modeChip = packetView.locator('[title*="(REPLAY)"]').first();
  await expect(modeChip).toHaveCount(1);
  await expect(modeChip).toContainText(/Recorded/);

  // Never labeled live: the surface must never claim a live AI call, and the raw
  // run-mode enum must not be the visible label.
  await expect(packetView).not.toContainText("LIVE_AI");
  await expect(page.locator("body")).not.toContainText("LIVE_AI");
});

// ===========================================================================
// Machinery-off-the-glass: the raw dotted claim source-path must live behind a
// closed disclosure, not on the default front screen a non-technical lead reads.
// ===========================================================================
test("raw claim source-paths are hidden until their disclosure is opened", async ({
  page
}) => {
  await page.goto("/");
  await settle(page);
  const packetView = page.getByTestId("actionops-packet");
  // The dotted machine path exists in the DOM (claims carry a sourcePath) ...
  const path = packetView
    .getByText(/exposureResults\[|simulation\.horizons\[/)
    .first();
  await expect(path).toHaveCount(1);
  // ... but it is inside a CLOSED <details>, so it is NOT visible by default.
  await expect(path).not.toBeVisible();

  // Opening every disclosure reveals it -- proving the hide is the closed-details
  // behavior, not a dead/empty node (non-vacuous).
  await page.evaluate(() =>
    document
      .querySelectorAll("details")
      .forEach((d) => d.setAttribute("open", ""))
  );
  await expect(
    packetView.getByText(/exposureResults\[|simulation\.horizons\[/).first()
  ).toBeVisible();
});

// ===========================================================================
// Layer 1 -- axe-core WCAG 2.2 AA over the consolidated briefing.
// ===========================================================================
test.describe("a11y / layer 1 -- axe WCAG 2.2 AA", () => {
  test("no axe violations on the briefing (default state)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("actionops-packet")).toBeVisible();
    // Wait for the hero reveal to have STARTED (`.dk-in` is added client-side)
    // plus two frames so its transitions are registered -- then settle() awaits
    // them. Without this, under parallel load axe can catch a hero node
    // mid-reveal (opacity-blended) and report a phantom incomplete (lesson G).
    await page.waitForSelector(".dk-rv.dk-in");
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        )
    );
    await settle(page);

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .analyze();
    await assertAxeClean(page, results, "briefing default");
  });

  test("no axe violations with every disclosure expanded", async ({ page }) => {
    // The deck folds the claim source traces, the raw-signal detail, and the
    // agent trail behind <details>. Open them all so axe scans that on-demand
    // content too. Wait for HYDRATION first (`.dk-in` is only ever added by the
    // client-side reveal effect): mutating `open` on the server HTML before
    // React attaches produced a hydration-mismatch warning -- test-induced
    // noise, not an app defect, and this ordering removes it.
    //
    // Then WALK the deck before scanning (Codex cross-model finding): a page-top
    // scan leaves offscreen cards' `.dk-rv` content at opacity 0, which axe
    // EXCLUDES -- so the expanded claim traces in card 6 and the trail were
    // scanned by nothing. Walking reveals every card; opening disclosures after
    // the walk puts their content on the glass at full contrast.
    await page.goto("/");
    await expect(page.getByTestId("actionops-packet")).toBeVisible();
    await page.waitForSelector(".dk-rv.dk-in");
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
    await page.evaluate(() =>
      document
        .querySelectorAll("details")
        .forEach((d) => d.setAttribute("open", ""))
    );
    await page
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll(".dk-rv:not(.dk-in)")).filter(
            (el) => !el.closest("details:not([open])")
          ).length === 0,
        undefined,
        { timeout: 5000 }
      )
      .catch(() => undefined); // asserted strictly in the approved-state test
    await settle(page);

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .analyze();
    await assertAxeClean(page, results, "briefing expanded");
  });

  test("no axe violations after the packet is approved", async ({ page }) => {
    await page.goto("/");
    // Approve flips the stamps to RELEASED and writes the audit line -- scan THAT
    // reached state too, not just the default PENDING one. The deck communicates
    // the decision via the logged line (the button keeps its label and disables),
    // so the reached-state anchor is the audit text, not the button text.
    // Wait for hydration + the hero's own reveal BEFORE walking: the reveal
    // observer only attaches client-side, and a walk that starts pre-hydration
    // scrolls away from the hero before the observer exists -- leaving the hero
    // permanently unrevealed (caught by the precondition below).
    await page.waitForSelector(".dk-rv.dk-in");
    // Walk the deck the way a reader does (stepwise, not a teleport): the reveal
    // IntersectionObserver fires per card as it enters, so by the bottom EVERY
    // .dk-rv is revealed and the released-state scan below reads the whole deck
    // at full contrast -- the recorded AT2 substitute for per-card scans.
    await page.evaluate(async () => {
      for (let y = 0; y <= document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => requestAnimationFrame(r));
      }
    });
    const approve = page.getByTestId("approve-action");
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByTestId("decision-logged")).toContainText(
      /Signed & released/
    );
    await expect(approve).toBeDisabled();
    // The released visual state actually reached the letters (AT1's letter):
    // every letter card flips to its released stamp on the one packet decision.
    expect(
      await page.locator(".dk-lcard.released").count()
    ).toBeGreaterThan(0);
    await settle(page);

    // REVEAL PRECONDITION (gate route-back): unrevealed `.dk-rv` content sits at
    // opacity 0, which axe EXCLUDES from contrast -- so a reveal regression
    // would silently hollow this scan while staying green. Pin that every
    // REVEALABLE node is revealed before axe reads the stacked deck. Nodes
    // inside a CLOSED <details> are display:none -- they can never intersect,
    // are not axe-scannable either way, and are covered by the expanded scan.
    // IntersectionObserver delivers its callbacks ASYNCHRONOUSLY after the
    // scroll walk, so this is a bounded WAIT (the race settles), not a snapshot
    // count -- a node that never reveals still fails loud after the timeout,
    // with the offenders named.
    try {
      await page.waitForFunction(
        () =>
          Array.from(document.querySelectorAll(".dk-rv:not(.dk-in)")).filter(
            (el) => !el.closest("details:not([open])")
          ).length === 0,
        undefined,
        { timeout: 5000 }
      );
    } catch {
      const offenders = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".dk-rv:not(.dk-in)"))
          .filter((el) => !el.closest("details:not([open])"))
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`)
      );
      expect(
        offenders,
        `revealable .dk-rv nodes never revealed -- the scan would skip their text: ${offenders.join(" | ")}`
      ).toEqual([]);
    }

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .analyze();
    await assertAxeClean(page, results, "approved state");
  });

  // Regression guard for the masthead color-contrast flake (E2E-A11Y-FLAKE.md).
  // Under parallel CPU load axe intermittently returns the faint masthead span
  // (the unique `.hidden`, text-ink-faint over the translucent bg-ground/80
  // backdrop-blur band) as `color-contrast incomplete`. assertAxeClean must
  // MEASURE that node against the masthead's ground-truth background and PASS it
  // (it is 5.39:1, >= 4.5:1 AA) -- not blanket-fail it. This forces the exact
  // incomplete condition DETERMINISTICALLY (no timing race), so the fix is proven
  // every run, not only under load -- and a real contrast regression is caught.
  test("a masthead color-contrast `incomplete` is measured + passes, not blanket-failed (flake guard)", async ({
    page
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("actionops-packet")).toBeVisible();
    await settle(page);

    // The exact axe verdict the flake produces: the masthead span reported as an
    // undecided color-contrast node. Must NOT throw -- it is measured vs ground.
    const mastheadIncomplete = {
      violations: [],
      incomplete: [{ id: "color-contrast", nodes: [{ target: [".hidden"] }] }]
    } as unknown as AxeResult;
    await assertAxeClean(page, mastheadIncomplete, "flake-guard masthead");

    // Negative control: an incomplete node on NEITHER known background (the main
    // briefing container -- not the rail gradient, not under the blur) must STILL
    // fail loud, proving the fix did not become a blanket pass.
    const uncoveredIncomplete = {
      violations: [],
      incomplete: [
        {
          id: "color-contrast",
          nodes: [{ target: ['[data-testid="actionops-packet"]'] }]
        }
      ]
    } as unknown as AxeResult;
    let threw = false;
    try {
      await assertAxeClean(page, uncoveredIncomplete, "flake-guard control");
    } catch (e) {
      threw = true;
      expect(String(e)).toContain("none of the known cases");
    }
    expect(
      threw,
      "an incomplete node on neither known background must fail loud (not a blanket pass)"
    ).toBe(true);
  });
});

// ===========================================================================
// Layer 2 -- keyboard operability + visible focus.
// ===========================================================================
test.describe("a11y / layer 2 -- keyboard operability", () => {
  test("keyboard focus triggers a visible :focus-visible ring", async ({
    page
  }) => {
    await page.goto("/");
    // A real Tab (not programmatic focus) must put the engine into the
    // :focus-visible state that globals.css paints a 2px accent outline for.
    await page.keyboard.press("Tab");
    const focusVisible = await page.evaluate(
      () => document.querySelector(":focus-visible") !== null
    );
    expect(focusVisible).toBe(true);
    const outlineWidth = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? parseFloat(getComputedStyle(el).outlineWidth) : 0;
    });
    expect(outlineWidth).toBeGreaterThanOrEqual(2);
  });

  // The consolidation replaced the tablist with <details> disclosures as the
  // primary in-content interactive controls (signal feed, draft bodies, the claim
  // source-detail traces, playbooks/tasks). Cover their keyboard operability +
  // focus ring -- the coverage that left with the tablist test.
  test("briefing disclosures are keyboard-operable with a visible focus ring", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);

    // Tab from the top until focus lands on a <summary> -- proves the disclosures
    // are keyboard-REACHABLE (not just clickable), and a REAL Tab (not programmatic
    // focus) is what drives the engine into :focus-visible.
    let onSummary = false;
    for (let i = 0; i < 30 && !onSummary; i++) {
      await page.keyboard.press("Tab");
      onSummary = await page.evaluate(
        () => document.activeElement?.tagName === "SUMMARY"
      );
    }
    expect(onSummary, "no <summary> reachable by Tab").toBe(true);

    // The focused summary shows the 2px accent ring (globals.css now includes
    // summary:focus-visible).
    expect(
      await page.evaluate(
        () => document.querySelector("summary:focus-visible") !== null
      )
    ).toBe(true);
    const outlineWidth = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? parseFloat(getComputedStyle(el).outlineWidth) : 0;
    });
    expect(outlineWidth).toBeGreaterThanOrEqual(2);

    // Enter toggles the focused disclosure open then closed (SC 2.1.1).
    const focusedDetailsOpen = () =>
      page.evaluate(() => {
        const d = document.activeElement?.closest("details");
        return d ? (d as HTMLDetailsElement).open : null;
      });
    expect(await focusedDetailsOpen()).toBe(false);
    await page.keyboard.press("Enter");
    expect(await focusedDetailsOpen()).toBe(true);
    await page.keyboard.press("Enter");
    expect(await focusedDetailsOpen()).toBe(false);
  });
});

// ===========================================================================
// Layer 2 -- SC 2.4.11 Focus Not Obscured (new in WCAG 2.2).
// ===========================================================================
test.describe("a11y / SC 2.4.11 focus not obscured", () => {
  test("scroll-padding clears the sticky masthead on focus-scroll", async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/");
    await settle(page);

    const masthead = page.locator("header").first();
    const mh = await masthead.boundingBox();
    expect(mh).not.toBeNull();
    const mastheadBottom = mh!.y + mh!.height;

    // The invariant G-2 added: html scroll-padding-top must clear the sticky
    // masthead, or a focus-scroll could still land a control behind it.
    const scrollPadTop = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
    );
    expect(
      scrollPadTop,
      `scroll-padding-top ${scrollPadTop} < masthead ${mastheadBottom}`
    ).toBeGreaterThanOrEqual(mastheadBottom);

    // Behavioral proof, made non-vacuous: scroll the link fully out of view,
    // CONFIRM it is obscured (above the masthead band) before focus, then focus
    // and confirm (a) the focus drove a real corrective scroll and (b) the link
    // lands BELOW the masthead, never behind it. Deck realignment: the packet
    // root's FIRST link is now the position:fixed dot rail, which never scrolls
    // and so can never be obscured -- anchor to a link INSIDE the scrolling
    // content (a card-1 feed source link) instead.
    const link = page.locator(".dk-fsrc a").first();
    await expect(link).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(0);
    const yBefore = await link.evaluate((el) => el.getBoundingClientRect().top);
    expect(
      yBefore,
      `pre-focus link top ${yBefore} should be above the masthead (${mastheadBottom}) -- i.e. obscured`
    ).toBeLessThan(mastheadBottom);

    await link.focus();
    const scrollAfter = await page.evaluate(() => window.scrollY);
    const yAfter = await link.evaluate((el) => el.getBoundingClientRect().top);
    expect(
      scrollAfter,
      "focusing the obscured link did not move the scroll position"
    ).not.toBe(scrollBefore);
    expect(
      yAfter,
      `focused link top ${yAfter} is under masthead bottom ${mastheadBottom}`
    ).toBeGreaterThanOrEqual(mastheadBottom - 1);
  });
});

// ===========================================================================
// G-3 -- SC 2.5.8 Target Size (Minimum) 24x24 CSS px (new in WCAG 2.2).
// ===========================================================================
test.describe("a11y / SC 2.5.8 target size (G-3)", () => {
  test("every author-styled interactive target is at least 24x24 CSS px", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);
    // SC 2.5.8 (AA, 24px). Scope is EVERY author-styled control on the rendered
    // surface -- not just the evidence links -- so a small target can't slip the
    // gate. The evidence links are a list, not a sentence, so they get no inline
    // exception and were the genuine fix (16px -> padded to 24px). <summary>
    // disclosures are the briefing's primary in-content controls now, so they are
    // in scope too (the "Source detail" trace was widened to clear 24px).
    const targets = page.locator("a[href], button, summary");
    const count = await targets.count();
    expect(count).toBeGreaterThan(0);
    const undersized: string[] = [];
    for (let i = 0; i < count; i++) {
      const el = targets.nth(i);
      if (!(await el.isVisible())) continue;
      const box = await el.boundingBox();
      if (!box) continue;
      if (box.height < 24 || box.width < 24) {
        const label = ((await el.textContent()) ?? "").trim().slice(0, 30);
        undersized.push(
          `"${label}" ${Math.round(box.width)}x${Math.round(box.height)}`
        );
      }
    }
    expect(
      undersized,
      `author-styled targets under 24px: ${undersized.join(" | ")}`
    ).toEqual([]);

    // Pin the specific G-3 fix target: the evidence links exist and are >=24px.
    const links = page.getByTestId("actionops-packet").getByRole("link");
    const linkCount = await links.count();
    expect(linkCount).toBeGreaterThan(0);
    for (let i = 0; i < linkCount; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(24);
      expect(box!.width).toBeGreaterThanOrEqual(24);
    }
  });
});

// ===========================================================================
// G-4 -- SC 1.4.11 Non-text Contrast for the supplier exposure bars.
// ===========================================================================
test.describe("a11y / SC 1.4.11 non-text contrast (G-4)", () => {
  test("every supplier exposure bar on the deck clears >=3:1 against its own track", async ({
    page
  }) => {
    // The bar conveys magnitude by LENGTH; to read the length the filled extent
    // must stay distinguishable from the track. The numeric score beside each bar
    // already covers SC 1.4.1 (use of color) -- this checks the graphical object.
    //
    // Deck realignment (2026-07-22): the old briefing's .runway-fill bars carried
    // a hue-independent 1px EDGE token because its lighter severity fills fell
    // below 3:1 against the near-white track. The deck's card-3 bars (.s-fill on
    // .s-track) fill with solid ink or the risk red -- both clear 3:1 against the
    // hairline track DIRECTLY, so the honest 1.4.11 read is fill-vs-track,
    // measured per element (never assumed from the token sheet). If a future
    // lighter fill drops below 3:1 this fails loud and the edge pattern returns.
    await page.goto("/");
    await settle(page);

    const fills = page.locator(".dk-sup .s-fill");
    const n = await fills.count();
    expect(n, "no supplier exposure bars on the deck").toBeGreaterThan(0);
    let totalBars = 0;
    for (let i = 0; i < n; i++) {
      const data = await fills.nth(i).evaluate((el) => {
        const s = getComputedStyle(el);
        const track = el.closest(".s-track");
        return {
          fillColor: s.backgroundColor,
          trackBg: track ? getComputedStyle(track).backgroundColor : ""
        };
      });
      expect(data.trackBg, `bar #${i} has no .s-track ancestor`).not.toBe("");
      const ratio = contrastRatio(
        await resolveSrgb(page, data.fillColor),
        await resolveSrgb(page, data.trackBg)
      );
      expect(
        ratio,
        `bar #${i} fill vs its track = ${ratio.toFixed(2)}:1 < 3`
      ).toBeGreaterThanOrEqual(3);
      totalBars++;
    }
    // Sanity: this exercised the full supplier grid, not a single bar.
    expect(totalBars).toBeGreaterThanOrEqual(5);
  });
});
