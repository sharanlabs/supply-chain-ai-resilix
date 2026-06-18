import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

// ---------------------------------------------------------------------------
// Accessibility CI -- layer 1 (axe) + layer 2 (keyboard) + the WCAG 2.2
// measurements that axe cannot make under OKLCH. The MANUAL screen-reader pass
// is layer 3 (a human step -- see docs/claude/A11Y-MANUAL-SR-PASS.md).
//
// Scope: the live `/` route. Its DEFAULT tab is "packet" -> the V2 ActionOps
// view (components/action-packet-view.tsx), wired into the dashboard by Phase 8
// -- so the V2 surface renders in a REAL browser here (it is NOT jsdom-only).
// The other three tabs (Recorded Events / Exposure / Simulation) are scanned
// too. OUT of scope: the V1 live panel (V1LivePanel) -- it only mounts after
// "Run live pipeline", so a default-/ scan never reaches it, and the V1 salvage
// path is not part of component G.
//
// Every scan/measurement first awaits settle() -- all running animations have
// finished -- so axe and the geometric reads see the FINAL frame, never a
// mid-fade (opacity-blended) layout. (Playwright's reducedMotion emulation is
// not honored by this app's matchMedia, so explicit settling is the real
// guarantee, not a media-query toggle.)
// ---------------------------------------------------------------------------

// WCAG normative A + AA, including the 2.2 additions (axe tags them wcag22aa).
const WCAG_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

// The four ActionOps tabs in DOM order. The events tab reads "Recorded Events"
// (no live signal in the seeded demo), so match on the stable word.
const TABS = [
  { key: "events", name: /Events/ },
  { key: "exposure", name: /Exposure/ },
  { key: "simulation", name: /Simulation/ },
  { key: "packet", name: /Action Packet/ }
] as const;

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
// DECIDE": here the only legitimate cause is text over a CSS gradient (the
// approve-rail glow), which axe cannot composite to a single bg color. So:
//   - any incomplete rule OTHER than color-contrast is a genuine undecided gap
//     -> fail loud (with id + target);
//   - the residual color-contrast incompletes are exactly that gradient text,
//     and are GROUND-TRUTH covered by the dedicated "rail gradient text clears
//     AA" spec below (the design's gradients only ever run accent-soft ->
//     transparent over the white panel, both of which the ink tokens clear).
// Contrast axe CAN resolve lands in `violations` and is asserted above.
function assertAxeClean(results: AxeResult, label: string): void {
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
    `[${label}] axe UNDECIDED (non-contrast incomplete -- needs a real fix or a dedicated assertion): ${JSON.stringify(
      undecided.map((r) => ({ id: r.id, targets: axeTargets(r.nodes) })),
      null,
      2
    )}`
  ).toEqual([]);
}

// ===========================================================================
// Layer 1 -- axe-core WCAG 2.2 AA over every tab.
// ===========================================================================
test.describe("a11y / layer 1 -- axe WCAG 2.2 AA", () => {
  for (const tab of TABS) {
    test(`no axe violations on the ${tab.key} tab`, async ({ page }) => {
      await page.goto("/");
      await page.getByRole("tab", { name: tab.name }).click();
      await expect(page.getByRole("tabpanel")).toBeVisible();
      await settle(page);

      const results = await new AxeBuilder({ page })
        .withTags([...WCAG_AA_TAGS])
        .analyze();
      assertAxeClean(results, `${tab.key} tab`);
    });
  }

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
    assertAxeClean(results, "approved state");
  });
});

// ===========================================================================
// Ground-truth coverage for the color-contrast nodes axe leaves `incomplete`.
// axe cannot composite text over a CSS gradient, so the approve-rail glow's
// small text lands in incomplete (allowed in assertAxeClean). This proves those
// nodes actually pass AA against the gradient's DARKEST effective background.
// ===========================================================================
test.describe("a11y / rail gradient text contrast (covers axe-incomplete)", () => {
  test("each axe-incomplete contrast node clears its WCAG threshold by ground truth", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);

    // The rail gradient runs from-accent-soft/60 -> transparent over the white
    // panel; its DARKEST effective background is accent-soft at 60% composited
    // over the surface. Only text WITHOUT its own opaque background sits on it,
    // which is exactly what axe leaves `incomplete` (a control with its own bg
    // -- the Approve button, the status pill -- axe resolves, so it is not here).
    const accentSoft = await resolveSrgb(page, "var(--color-accent-soft)");
    const surface = await resolveSrgb(page, "var(--color-surface)");
    const darkestBg = accentSoft.map((c, i) =>
      Math.round(0.6 * c + 0.4 * surface[i])
    );

    const results = await new AxeBuilder({ page })
      .withTags([...WCAG_AA_TAGS])
      .analyze();
    const nodes =
      results.incomplete.find((r) => r.id === "color-contrast")?.nodes ?? [];
    expect(
      nodes.length,
      "expected the rail gradient text to be the axe-incomplete contrast set"
    ).toBeGreaterThan(0);

    for (const node of nodes) {
      const selector = node.target[node.target.length - 1] as string;
      const info = await page
        .locator(selector)
        .first()
        .evaluate((el) => {
          const s = getComputedStyle(el);
          return {
            color: s.color,
            fontPx: parseFloat(s.fontSize),
            weight: parseInt(s.fontWeight, 10) || 400
          };
        });
      // WCAG large-text threshold: >=24px, or >=18.66px bold -> 3:1, else 4.5:1.
      const large =
        info.fontPx >= 24 || (info.fontPx >= 18.66 && info.weight >= 700);
      const need = large ? 3 : 4.5;
      const ratio = contrastRatio(await resolveSrgb(page, info.color), darkestBg);
      expect(
        ratio,
        `axe-incomplete node "${selector}" (${info.fontPx}px) vs darkest stop = ${ratio.toFixed(2)}:1 < ${need}`
      ).toBeGreaterThanOrEqual(need);
    }
  });
});

// ===========================================================================
// Layer 2 -- keyboard operability (ARIA APG tablist) + visible focus.
// ===========================================================================
test.describe("a11y / layer 2 -- keyboard operability", () => {
  test("roving tabindex + arrow nav + Tab into the panel (APG)", async ({
    page
  }) => {
    await page.goto("/");
    const tablist = page.getByRole("tablist", {
      name: "Action packet sections"
    });
    await expect(tablist).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(4);

    // Default selected = "Action Packet". Roving tabindex: exactly the selected
    // tab is tabbable; the others are removed from the Tab sequence.
    const selected = page.getByRole("tab", { selected: true });
    await expect(selected).toHaveAttribute("id", "actionops-tab-packet");
    await expect(selected).toHaveAttribute("tabindex", "0");
    await expect(
      page.getByRole("tab", { name: /Exposure/ })
    ).toHaveAttribute("tabindex", "-1");

    // ArrowRight from the last tab wraps to the first, and selection follows
    // focus (automatic activation).
    await selected.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { selected: true })).toHaveAttribute(
      "id",
      "actionops-tab-events"
    );
    await expect(page.locator(":focus")).toHaveAttribute(
      "id",
      "actionops-tab-events"
    );

    // ArrowLeft wraps back to the last tab.
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { selected: true })).toHaveAttribute(
      "id",
      "actionops-tab-packet"
    );

    // Per APG, Tab from the active tab moves focus INTO the panel (tabIndex=0),
    // not to the next tab in the list.
    await page.getByRole("tab", { selected: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toHaveAttribute(
      "id",
      "actionops-tabpanel"
    );
  });

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
    // gate. The native "Live signals" checkbox (measured 13x13) is deliberately
    // excluded: it is the UA-control exception (size set by the user agent, not
    // the author). The evidence links are a list, not a sentence, so they get no
    // inline exception and were the genuine fix (16px -> padded to 24px).
    const targets = page.locator('a[href], button, [role="tab"]');
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
  test("every runway bar on every tab clears >=3:1 against its own track", async ({
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

    // Check EVERY rendered bar on EVERY tab that draws bars -- the packet view
    // (gradient fills) AND the dashboard exposure/simulation tabs (solid fills).
    // Each .runway-fill must carry a >=1px edge clearing 3:1 against ITS OWN
    // track background (read per-element, not assumed).
    const barTabs = [
      { key: "exposure", name: /Exposure/ },
      { key: "simulation", name: /Simulation/ },
      { key: "packet", name: /Action Packet/ }
    ];
    let totalBars = 0;
    for (const tab of barTabs) {
      await page.goto("/");
      await page.getByRole("tab", { name: tab.name }).click();
      await settle(page);
      const fills = page.locator(".runway-fill");
      const n = await fills.count();
      expect(n, `no runway bars on the ${tab.key} tab`).toBeGreaterThan(0);
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
          `${tab.key} bar #${i} has no >=1px boundary`
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
          `${tab.key} bar #${i} edge vs its track = ${ratio.toFixed(2)}:1 < 3 (fills vs sink: ${JSON.stringify(fillReport)})`
        ).toBeGreaterThanOrEqual(3);
        totalBars++;
      }
    }
    // Sanity: this exercised many bars across tabs, not a single representative.
    expect(totalBars).toBeGreaterThanOrEqual(5);
  });
});
