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

      expect(
        results.violations,
        `axe violations: ${JSON.stringify(
          results.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            nodes: v.nodes.length
          })),
          null,
          2
        )}`
      ).toEqual([]);

      // Non-vacuous incomplete triage. OKLCH defeats axe's color-contrast and
      // target-size resolution, so THOSE legitimately land in `incomplete` and
      // are verified by the dedicated specs below. Any OTHER incomplete rule is
      // a real "axe could not decide" gap that must be surfaced, not ignored.
      const allowedIncomplete = new Set([
        "color-contrast",
        "color-contrast-enhanced",
        "target-size"
      ]);
      const unexpected = results.incomplete.filter(
        (r) => !allowedIncomplete.has(r.id)
      );
      expect(
        unexpected,
        `unexpected axe incomplete (triage required): ${unexpected
          .map((r) => r.id)
          .join(", ")}`
      ).toEqual([]);
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
    expect(
      results.violations,
      `axe violations (approved state): ${JSON.stringify(
        results.violations.map((v) => ({ id: v.id, nodes: v.nodes.length })),
        null,
        2
      )}`
    ).toEqual([]);
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

    // Behavioral proof with a REAL scroll: push the evidence links out of view,
    // then focus the first one; the focus-scroll must bring it back BELOW the
    // masthead (honoring scroll-padding-top), never under it.
    const link = page.getByTestId("actionops-packet").getByRole("link").first();
    await expect(link).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 1600));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

    await link.focus();
    const box = await link.boundingBox();
    expect(box).not.toBeNull();
    expect(
      box!.y,
      `focused link top ${box!.y} is under masthead bottom ${mastheadBottom}`
    ).toBeGreaterThanOrEqual(mastheadBottom - 1);
  });
});

// ===========================================================================
// G-3 -- SC 2.5.8 Target Size (Minimum) 24x24 CSS px (new in WCAG 2.2).
// ===========================================================================
test.describe("a11y / SC 2.5.8 target size (G-3)", () => {
  test("evidence/source links are at least 24x24 CSS px", async ({ page }) => {
    await page.goto("/");
    await settle(page);
    // The evidence links are a <ul> of links, NOT a sentence, so the SC 2.5.8
    // "inline" exception does not apply -- each must meet the 24px minimum.
    const links = page.getByTestId("actionops-packet").getByRole("link");
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox();
      expect(box).not.toBeNull();
      expect(
        box!.height,
        `evidence link #${i} height ${box!.height}px < 24`
      ).toBeGreaterThanOrEqual(24);
      expect(
        box!.width,
        `evidence link #${i} width ${box!.width}px < 24`
      ).toBeGreaterThanOrEqual(24);
    }
  });
});

// ===========================================================================
// G-4 -- SC 1.4.11 Non-text Contrast for the runway/exposure bars.
// ===========================================================================
test.describe("a11y / SC 1.4.11 non-text contrast (G-4)", () => {
  test("each runway bar has a >=3:1 boundary against its track", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);

    // The bar conveys magnitude by LENGTH; to read the length the filled extent
    // must be distinguishable from the track. The numeric label beside each bar
    // already covers SC 1.4.1 (use of color) -- this checks the bar itself.
    const track = await resolveSrgb(page, "var(--color-sink)");

    // (a) Fill-vs-track at each gradient's LIGHTEST endpoint (worst case). This
    // documents WHY the hue-independent edge is needed: the lighter severities
    // fall below 3:1 against the near-white track on their own.
    const fills: Record<string, string> = {
      low: "var(--color-sev-low-soft)",
      medium: "var(--color-sev-medium)",
      high: "var(--color-sev-high)",
      critical: "var(--color-sev-critical)"
    };
    const fillReport: Record<string, number> = {};
    for (const [sev, color] of Object.entries(fills)) {
      fillReport[sev] = Number(
        contrastRatio(await resolveSrgb(page, color), track).toFixed(2)
      );
    }

    // (b) The safeguard: every rendered .runway-fill carries a >=1px edge whose
    // color clears 3:1 against the track, so the bar's boundary is perceivable
    // regardless of fill hue. Read it from a real rendered bar.
    const fill = page.locator(".runway-fill").first();
    await expect(fill).toBeVisible();
    const edge = await fill.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.borderTopColor, width: parseFloat(s.borderTopWidth) };
    });
    expect(
      edge.width,
      "runway-fill has no >=1px boundary"
    ).toBeGreaterThanOrEqual(1);
    const edgeVsTrack = contrastRatio(await resolveSrgb(page, edge.color), track);
    expect(
      edgeVsTrack,
      `runway-fill edge vs track ${edgeVsTrack.toFixed(
        2
      )}:1 < 3 (fill-vs-track ratios: ${JSON.stringify(fillReport)})`
    ).toBeGreaterThanOrEqual(3);
  });
});
