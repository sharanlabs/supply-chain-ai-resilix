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
    await Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => undefined))
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
// DECIDE": here the only legitimate cause is text over a background axe cannot
// composite to a single solid color. There are TWO such backgrounds on this
// surface, so a color-contrast incomplete is forgiven ONLY on one of them, and
// only after its REAL WCAG ratio is measured by ground truth:
//   (1) the approve-rail CSS gradient (text inside .bg-gradient-to-b) -- measured
//       against the gradient's darkest effective stop (accent-soft/60 over surface);
//   (2) the translucent, blurred sticky masthead (text under .backdrop-blur-xl) --
//       it paints var(--color-ground) at 80% alpha and the page behind it (at the
//       scanned page-top -- none of the layer-1 scans scroll) is also
//       var(--color-ground), so the composite is exactly ground; measured against it.
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
    const info = await page
      .locator(selector)
      .first()
      .evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          color: s.color,
          fontPx: parseFloat(s.fontSize),
          weight: parseInt(s.fontWeight, 10) || 400,
          onRailGradient: el.closest(".bg-gradient-to-b") !== null,
          onMasthead: el.closest(".backdrop-blur-xl") !== null
        };
      });
    // Every incomplete node MUST sit on one of the two known uncompositable
    // backgrounds; anything else is a genuine uncovered gap -> fail loud.
    const knownBg = info.onRailGradient
      ? railBg
      : info.onMasthead
        ? mastheadBg
        : null;
    expect(
      knownBg,
      `[${label}] color-contrast incomplete "${selector}" is on neither known uncompositable background (approve-rail gradient or translucent masthead) -- it needs a real fix or its own dedicated coverage, not a blanket pass`
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

  // The briefing's mode chip reads as the human label "Recorded" (the relabeled
  // effectiveMode -- the raw REPLAY enum is humanized on the calm glass, kept only
  // in the chip's title for an auditor). The audit trail still records the exact
  // "REPLAY_SERVED" provenance entry -- that is the honest compliance log, not the
  // briefing spine, so REPLAY legitimately appears there.
  const packetView = page.getByTestId("actionops-packet");
  // Specific, not generic: the mode chip is genuinely REPLAY (its title attribute)
  // AND is humanized to "Recorded" on the glass -- so this can't pass from
  // unrelated "Recorded" copy, and proves the raw enum was relabeled.
  await expect(packetView.locator('[title="REPLAY"]')).toContainText("Recorded");

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
    await settle(page);

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .analyze();
    await assertAxeClean(page, results, "briefing default");
  });

  test("no axe violations with every disclosure expanded", async ({ page }) => {
    // The consolidated briefing folds the signal feed, the per-draft bodies, the
    // role playbooks + task list, and the older audit entries behind <details>.
    // Open them all so axe scans that on-demand content too -- each was its own
    // tab/panel before the consolidation.
    await page.goto("/");
    await expect(page.getByTestId("actionops-packet")).toBeVisible();
    await page.evaluate(() =>
      document
        .querySelectorAll("details")
        .forEach((d) => d.setAttribute("open", ""))
    );
    await settle(page);

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .analyze();
    await assertAxeClean(page, results, "briefing expanded");
  });

  test("no axe violations after the packet is approved", async ({ page }) => {
    await page.goto("/");
    // Approve flips the status pill to its positive state and writes an audit
    // line -- scan THAT reached state too, not just the default PENDING one.
    const approve = page.getByTestId("approve-action");
    await expect(approve).toBeEnabled();
    await approve.click();
    await expect(page.getByTestId("approve-action")).toHaveText(/Approved/);
    await settle(page);

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
      expect(String(e)).toContain("neither known uncompositable background");
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
    // lands BELOW the masthead, never behind it.
    const link = page.getByTestId("actionops-packet").getByRole("link").first();
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
// G-4 -- SC 1.4.11 Non-text Contrast for the runway/exposure bars.
// ===========================================================================
test.describe("a11y / SC 1.4.11 non-text contrast (G-4)", () => {
  test("every runway bar on the briefing clears >=3:1 against its own track", async ({
    page
  }) => {
    // The bar conveys magnitude by LENGTH; to read the length the filled extent
    // must stay distinguishable from the track. The numeric label beside each bar
    // already covers SC 1.4.1 (use of color) -- this checks the graphical object.
    const sink = await resolveSrgb(page, "var(--color-sink)");

    // Document WHY the hue-independent edge is needed: the lighter severity fills
    // fall below 3:1 against the near-white track on their own.
    await page.goto("/");
    await settle(page);
    const fillReport: Record<string, number> = {};
    for (const [sev, color] of Object.entries({
      low: "var(--color-sev-low-soft)",
      medium: "var(--color-sev-medium)",
      high: "var(--color-sev-high)",
      critical: "var(--color-sev-critical)"
    })) {
      fillReport[sev] = Number(
        contrastRatio(await resolveSrgb(page, color), sink).toFixed(2)
      );
    }

    // Check EVERY rendered bar in the consolidated briefing -- the WHO-IS-HIT
    // exposure bars AND the runway horizon bars both draw .runway-fill. Each must
    // carry a >=1px edge clearing 3:1 against ITS OWN track background (read
    // per-element, not assumed). The page is already at "/" and settled above.
    const fills = page.locator(".runway-fill");
    const n = await fills.count();
    expect(n, "no exposure/runway bars on the briefing").toBeGreaterThan(0);
    let totalBars = 0;
    for (let i = 0; i < n; i++) {
      const data = await fills.nth(i).evaluate((el) => {
        const s = getComputedStyle(el);
        const track = el.closest(".runway-track");
        return {
          edgeColor: s.borderTopColor,
          edgeWidth: parseFloat(s.borderTopWidth),
          trackBg: track ? getComputedStyle(track).backgroundColor : ""
        };
      });
      expect(
        data.edgeWidth,
        `bar #${i} has no >=1px boundary`
      ).toBeGreaterThanOrEqual(1);
      const trackRgb = data.trackBg
        ? await resolveSrgb(page, data.trackBg)
        : sink;
      const ratio = contrastRatio(
        await resolveSrgb(page, data.edgeColor),
        trackRgb
      );
      expect(
        ratio,
        `bar #${i} edge vs its track = ${ratio.toFixed(2)}:1 < 3 (fills vs sink: ${JSON.stringify(fillReport)})`
      ).toBeGreaterThanOrEqual(3);
      totalBars++;
    }
    // Sanity: this exercised many bars (exposure + runway), not a single one.
    expect(totalBars).toBeGreaterThanOrEqual(5);
  });
});
