import { test, expect, type Page } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";

// ---------------------------------------------------------------------------
// Customs Defense Desk (`/customs`, D5.3) -- e2e + accessibility coverage at the
// same bar as evals/e2e/a11y.spec.ts: layer 1 (axe WCAG 2.2 AA with per-node
// triage of `incomplete`), layer 2 (keyboard operability + visible focus), and
// the WCAG 2.2 measurements axe cannot make under OKLCH (SC 2.4.11 focus not
// obscured, SC 2.5.8 target size, SC 1.4.11 non-text contrast via the canvas
// ground-truth resolver).
//
// The route is FLAG-GATED (ENABLE_CUSTOMS_DESK, default OFF); playwright.config.ts
// sets the flag in the webServer env (additive -- merged over process.env), so
// this suite exercises the desk while the `/` specs see an unchanged surface.
//
// Scope -- every reachable state of the surface:
//   picker landing            /customs
//   PROCEED case              /customs?case=G01-sound-single-ample
//     (+ the counsel gate:    pending -> approved-with-export, and rejected)
//   REFUSE case               /customs?case=G16-under-partial-single
//   adversarial case          /customs?case=G19-adv-single-ample
//   invalid id (empty state)  /customs?case=NOPE-not-a-real-case
//
// Every scan/measurement first awaits settle() -- the .reveal entrance
// animations (staggered up to ~440ms) fade through partial opacity, and
// Playwright's reducedMotion emulation is not honored by this app's matchMedia,
// so explicit settling is the real guarantee of a final-frame read.
// ---------------------------------------------------------------------------

const PICKER = "/customs";
const PROCEED_CASE = "/customs?case=G01-sound-single-ample";
const REFUSE_CASE = "/customs?case=G16-under-partial-single";
const ADVERSARIAL_CASE = "/customs?case=G19-adv-single-ample";
const INVALID_CASE = "/customs?case=NOPE-not-a-real-case";

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
// bytes IN THE BROWSER via a 1x1 canvas -- the same OKLCH-serialization
// side-step a11y.spec.ts uses (axe's color-contrast rule reports `incomplete`
// on colors it cannot composite; the canvas rasterizes what the engine
// actually computes).
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
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined)));
  });
}

type AxeResult = Awaited<ReturnType<AxeBuilder["analyze"]>>;
type AxeNode = AxeResult["violations"][number]["nodes"][number];

function axeTargets(nodes: AxeNode[]): string[] {
  return nodes.map((n) => n.target.join(" ")).slice(0, 5);
}

// One clean-check used by EVERY axe scan (same discipline as a11y.spec.ts):
// `violations` must be empty, and `incomplete` is triaged per node, never
// blanket-allowed. On the customs surface there is exactly ONE background axe
// cannot composite to a single solid color: the translucent, blurred sticky
// masthead (bg-ground/80 + backdrop-blur-xl). It paints var(--color-ground) at
// 80% alpha over the page, whose background at the scanned page-top is also
// var(--color-ground), so the composite is exactly ground -- any color-contrast
// incomplete under it is MEASURED against that ground truth. Everything else
// (any other incomplete rule, or a contrast incomplete anywhere else) fails
// loud: it is a genuine uncovered gap, not a pass.
async function assertAxeClean(page: Page, results: AxeResult, label: string): Promise<void> {
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

  const ccNodes = results.incomplete.find((r) => r.id === "color-contrast")?.nodes ?? [];
  if (ccNodes.length === 0) return;

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
          onMasthead: el.closest(".backdrop-blur-xl") !== null
        };
      });
    expect(
      info.onMasthead,
      `[${label}] color-contrast incomplete "${selector}" is not under the translucent masthead (the one known uncompositable background here) -- it needs a real fix or its own dedicated coverage, not a blanket pass`
    ).toBe(true);
    // WCAG large-text threshold: >=24px, or >=18.66px bold -> 3:1, else 4.5:1.
    const large = info.fontPx >= 24 || (info.fontPx >= 18.66 && info.weight >= 700);
    const need = large ? 3 : 4.5;
    const ratio = contrastRatio(await resolveSrgb(page, info.color), mastheadBg);
    expect(
      ratio,
      `[${label}] incomplete "${selector}" (${info.fontPx}px) vs the masthead ground = ${ratio.toFixed(2)}:1 < ${need}`
    ).toBeGreaterThanOrEqual(need);
  }
}

// ===========================================================================
// Wiring guard -- the desk renders REAL frozen-engine data, and the honesty
// chip ("Synthetic data -- demonstration") is on the glass in EVERY state.
// ===========================================================================
test("the desk is wired to the frozen engine and every state carries the synthetic-data chip", async ({
  page
}) => {
  // Picker: the counts are computed from the engine's own data modules.
  await page.goto(PICKER);
  await expect(page.getByText("24 replay cases · 40 matrix cells")).toBeVisible();

  // PROCEED case: the figure-provenance ledger binds to real tool-return refs.
  await page.goto(PROCEED_CASE);
  await expect(page.getByText("entry-scoper#entryCount")).toBeVisible();

  // The masthead chip persists across every reachable state.
  for (const path of [PICKER, PROCEED_CASE, REFUSE_CASE, ADVERSARIAL_CASE, INVALID_CASE]) {
    await page.goto(path);
    // Scope to the MASTHEAD (the first <header>): the picker landing and case
    // header are <header> elements too, and the disclaimer line inside them
    // repeats the wording -- the invariant under test is the sticky chip.
    const masthead = page.locator("header").first();
    const chip = masthead.getByText("Synthetic data", { exact: true });
    await expect(chip, `synthetic chip missing on ${path}`).toBeVisible();
    await expect(
      masthead.getByText("— demonstration"),
      `"demonstration" qualifier missing on ${path}`
    ).toBeVisible();
  }
});

// ===========================================================================
// Functional coverage -- each outcome class renders its honest state.
// ===========================================================================
test.describe("customs / outcome states", () => {
  test("PROCEED case renders the packet, the skeptic verdict, and the pending counsel gate", async ({
    page
  }) => {
    await page.goto(PROCEED_CASE);
    await settle(page);

    // The packet, first-class.
    await expect(
      page.getByRole("heading", { name: "Prior-disclosure support packet" })
    ).toBeVisible();
    await expect(page.getByText("Proceed — packet")).toBeVisible();
    await expect(page.getByText("Figure provenance")).toBeVisible();

    // The Skeptic agrees (independent re-derivation).
    await expect(page.getByText("Skeptic re-check")).toBeVisible();
    await expect(page.getByText("Agrees")).toBeVisible();

    // The counsel gate shows the REAL state machine: born pending, export door
    // blocked with the actual exportPacket() throw message on the glass.
    await expect(page.getByText("Pending counsel review")).toBeVisible();
    await expect(
      page.getByText(/DEFENSE_PACKET_EXPORT blocked: approval state is PENDING_COUNSEL_REVIEW/)
    ).toBeVisible();
  });

  test("counsel gate approves on a keyboard-only path and unlocks the export", async ({ page }) => {
    await page.goto(PROCEED_CASE);
    await settle(page);

    // Pre-approval: the blocked reason is visible and no export region exists.
    await expect(page.getByText(/DEFENSE_PACKET_EXPORT blocked/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Exported defense packet text" })).toHaveCount(0);

    // Keyboard only: Tab until focus lands on the reviewer input (proves it is
    // keyboard-REACHABLE), type the name, Tab past the note to the approve
    // button, and activate with Enter.
    let onInput = false;
    for (let i = 0; i < 25 && !onInput; i++) {
      await page.keyboard.press("Tab");
      onInput = await page.evaluate(() => document.activeElement?.id === "counsel-reviewer");
    }
    expect(onInput, "reviewer input not reachable by Tab").toBe(true);

    await page.keyboard.type("T. Marchetti, trade counsel");
    await page.keyboard.press("Tab"); // -> note textarea
    await page.keyboard.press("Tab"); // -> Approve (now enabled; disabled Reject is skipped)
    const focusedLabel = await page.evaluate(() => document.activeElement?.textContent ?? "");
    expect(focusedLabel).toContain("Approve for export");
    // The focused button carries the visible 2px accent ring.
    const outlineWidth = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? parseFloat(getComputedStyle(el).outlineWidth) : 0;
    });
    expect(outlineWidth).toBeGreaterThanOrEqual(2);

    await page.keyboard.press("Enter");

    // The ACTUAL ApprovalState flips on screen and the export unlocks: the
    // rendered artifact is exportPacket()'s real output, approval line included.
    await expect(page.getByText("Approved for export", { exact: false }).first()).toBeVisible();
    // .first(): the approval line legitimately appears twice -- the on-glass
    // paragraph AND inside the exported artifact text (asserted below).
    await expect(page.getByText(/Approved for export by/).first()).toBeVisible();
    const exported = page.getByRole("region", {
      name: "Exported defense packet text"
    });
    await expect(exported).toBeVisible();
    await expect(exported).toContainText("Prior-Disclosure Support Packet — PROCEED");
    await expect(exported).toContainText(
      "-- Approved for export by T. Marchetti, trade counsel on"
    );
    await expect(page.getByRole("button", { name: "Download .txt" })).toBeVisible();
  });

  test("counsel gate rejects with a named reviewer + reason and keeps export blocked", async ({
    page
  }) => {
    await page.goto(PROCEED_CASE);
    await settle(page);

    await page.getByLabel(/Reviewer name/).fill("D. Ferreira, trade counsel");
    await page.getByLabel("Reason or note").fill("Origin file needs the tier-2 affidavit first.");
    await page.getByRole("button", { name: /Reject — record a reason/ }).click();

    await expect(page.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByText(/Rejected by/)).toBeVisible();
    await expect(
      page.getByText("Reason: Origin file needs the tier-2 affidavit first.")
    ).toBeVisible();
    await expect(page.getByText(/export stays blocked in the rejected state/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Exported defense packet text" })).toHaveCount(0);
  });

  test("REFUSE case renders the refusal with named gaps and no export path", async ({ page }) => {
    await page.goto(REFUSE_CASE);
    await settle(page);

    await expect(page.getByRole("heading", { name: "Do not disclose yet" })).toBeVisible();
    await expect(page.getByText("Refuse — held")).toBeVisible();

    // Both named gaps, humanized AND as their raw oracle codes.
    await expect(
      page.getByText("Missing load-bearing record — Production record").first()
    ).toBeVisible();
    await expect(
      page.getByText("Missing load-bearing record — Bill of materials").first()
    ).toBeVisible();
    await expect(page.getByText("MISSING:PRODUCTION_RECORD")).toBeVisible();
    await expect(page.getByText("MISSING:BILL_OF_MATERIALS")).toBeVisible();

    // The rail states plainly there is nothing to export -- no gate controls.
    await expect(page.getByText(/Nothing to export/)).toBeVisible();
    await expect(page.getByLabel(/Reviewer name/)).toHaveCount(0);
  });

  test("adversarial case surfaces the quarantine flags while the disposition holds PROCEED", async ({
    page
  }) => {
    await page.goto(ADVERSARIAL_CASE);
    await settle(page);

    // The injection is FLAGGED for audit (walk + exhibit audit) ...
    await expect(page.getByText("Instruction-override attempt").first()).toBeVisible();
    await expect(page.getByText("Figure-steering ($0) language").first()).toBeVisible();
    // ... and the disposition did not move: the packet is produced as normal.
    await expect(page.getByText("Proceed — packet")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Prior-disclosure support packet" })
    ).toBeVisible();
  });

  test("an invalid case id renders the honest empty state (200, not an error page)", async ({
    page
  }) => {
    const response = await page.goto(INVALID_CASE);
    expect(response?.status()).toBe(200);
    await settle(page);

    await expect(page.getByRole("heading", { name: "No case matches that link" })).toBeVisible();
    await expect(page.getByText("NOPE-not-a-real-case")).toBeVisible();
    const back = page.getByRole("link", { name: /Back to all cases/ });
    await expect(back).toBeVisible();
    const box = await back.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(24);
  });
});

// ===========================================================================
// Layer 1 -- axe-core WCAG 2.2 AA over every reachable state.
// ===========================================================================
test.describe("customs / axe WCAG 2.2 AA", () => {
  test("no axe violations on the picker landing", async ({ page }) => {
    await page.goto(PICKER);
    await expect(page.getByRole("heading", { name: /Pick a case/ })).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs picker");
  });

  test("no axe violations on the PROCEED case (pending gate)", async ({ page }) => {
    await page.goto(PROCEED_CASE);
    await expect(
      page.getByRole("heading", { name: "Prior-disclosure support packet" })
    ).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs proceed pending");
  });

  test("no axe violations on the PROCEED case after approval (export visible)", async ({
    page
  }) => {
    await page.goto(PROCEED_CASE);
    await page.getByLabel(/Reviewer name/).fill("T. Marchetti, trade counsel");
    await page.getByRole("button", { name: /Approve for export/ }).click();
    await expect(page.getByRole("region", { name: "Exported defense packet text" })).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs proceed approved");
  });

  // The REJECTED terminal state is a SIBLING of the approved one (same focus-handoff
  // result container, same aria wiring). Only the approved branch was scanned, so the
  // 2026-07-16 B-15 `aria-label`-on-a-roleless-div defect shipped twice and axe saw one.
  // Both terminal states get their own scan now -- fix the class, cover the class.
  test("no axe violations on the PROCEED case after rejection (export stays blocked)", async ({
    page
  }) => {
    await page.goto(PROCEED_CASE);
    await page.getByLabel(/Reviewer name/).fill("D. Ferreira, trade counsel");
    await page.getByLabel("Reason or note").fill("Origin file needs the tier-2 affidavit first.");
    await page.getByRole("button", { name: /Reject — record a reason/ }).click();
    await expect(page.getByText(/Rejected by/)).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs proceed rejected");
  });

  test("no axe violations on the REFUSE case", async ({ page }) => {
    await page.goto(REFUSE_CASE);
    await expect(page.getByRole("heading", { name: "Do not disclose yet" })).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs refuse");
  });

  test("no axe violations on the adversarial case", async ({ page }) => {
    await page.goto(ADVERSARIAL_CASE);
    await expect(
      page.getByRole("heading", { name: "Prior-disclosure support packet" })
    ).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs adversarial");
  });

  test("no axe violations on the invalid-id empty state", async ({ page }) => {
    await page.goto(INVALID_CASE);
    await expect(page.getByRole("heading", { name: "No case matches that link" })).toBeVisible();
    await settle(page);
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs empty state");
  });
});

// ===========================================================================
// Layer 2 -- keyboard operability + visible focus.
// ===========================================================================
test.describe("customs / keyboard operability", () => {
  test("keyboard focus triggers a visible :focus-visible ring on the desk", async ({ page }) => {
    await page.goto(PICKER);
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

  test("a picker case row is keyboard-reachable and Enter navigates to the case", async ({
    page
  }) => {
    await page.goto(PICKER);
    await settle(page);
    // Tab until focus lands on the G01 row link, then activate with Enter --
    // proves the deep-link navigation is fully keyboard-operable (SC 2.1.1).
    let onRow = false;
    for (let i = 0; i < 15 && !onRow; i++) {
      await page.keyboard.press("Tab");
      onRow = await page.evaluate(
        () =>
          document.activeElement instanceof HTMLAnchorElement &&
          document.activeElement.href.includes("case=G01-sound-single-ample")
      );
    }
    expect(onRow, "G01 picker row not reachable by Tab").toBe(true);
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Prior-disclosure support packet" })
    ).toBeVisible();
  });
});

// ===========================================================================
// SC 2.4.11 Focus Not Obscured -- the sticky masthead vs focus-scroll.
// ===========================================================================
test.describe("customs / SC 2.4.11 focus not obscured", () => {
  test("scroll-padding clears the sticky masthead on focus-scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(PICKER);
    await settle(page);

    const masthead = page.locator("header").first();
    const mh = await masthead.boundingBox();
    expect(mh).not.toBeNull();
    const mastheadBottom = mh!.y + mh!.height;

    const scrollPadTop = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
    );
    expect(
      scrollPadTop,
      `scroll-padding-top ${scrollPadTop} < masthead ${mastheadBottom}`
    ).toBeGreaterThanOrEqual(mastheadBottom);

    // Behavioral, non-vacuous: scroll the first case row out of view, CONFIRM it
    // is obscured (above the masthead band), then focus it and confirm the
    // corrective scroll lands it BELOW the masthead, never behind it.
    const link = page.getByRole("link", { name: /G01-sound-single-ample/ });
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
    expect(scrollAfter, "focusing the obscured link did not move the scroll position").not.toBe(
      scrollBefore
    );
    expect(
      yAfter,
      `focused link top ${yAfter} is under masthead bottom ${mastheadBottom}`
    ).toBeGreaterThanOrEqual(mastheadBottom - 1);
  });
});

// ===========================================================================
// SC 2.5.8 Target Size (Minimum) 24x24 CSS px -- every author-styled control.
// ===========================================================================
test.describe("customs / SC 2.5.8 target size", () => {
  for (const [label, path] of [
    ["picker", PICKER],
    ["proceed case", PROCEED_CASE],
    ["refuse case", REFUSE_CASE]
  ] as const) {
    test(`every interactive target on the ${label} is at least 24x24 CSS px`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
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
          const text = ((await el.textContent()) ?? "").trim().slice(0, 30);
          undersized.push(`"${text}" ${Math.round(box.width)}x${Math.round(box.height)}`);
        }
      }
      expect(
        undersized,
        `[${label}] author-styled targets under 24px: ${undersized.join(" | ")}`
      ).toEqual([]);
    });
  }
});

// ===========================================================================
// SC 1.4.11 Non-text Contrast -- the counsel-gate field boundaries. The fields
// are white-on-white (bg-surface inputs on a bg-surface panel), so the border
// IS the visual information identifying the component's extent; it must clear
// 3:1 against the adjacent surface. Measured by the ground-truth canvas
// resolver, same as the runway-bar edges on `/`.
// ===========================================================================
test.describe("customs / SC 1.4.11 non-text contrast", () => {
  test("counsel-gate field boundaries clear >=3:1 against their surface", async ({ page }) => {
    await page.goto(PROCEED_CASE);
    await settle(page);

    for (const selector of ["#counsel-reviewer", "#counsel-note"]) {
      const field = page.locator(selector);
      await expect(field).toBeVisible();
      const data = await field.evaluate((el) => {
        const s = getComputedStyle(el);
        return {
          borderColor: s.borderTopColor,
          borderWidth: parseFloat(s.borderTopWidth),
          ownBg: s.backgroundColor
        };
      });
      expect(data.borderWidth, `${selector} has no >=1px boundary`).toBeGreaterThanOrEqual(1);
      const ratio = contrastRatio(
        await resolveSrgb(page, data.borderColor),
        await resolveSrgb(page, data.ownBg)
      );
      expect(
        ratio,
        `${selector} boundary vs its field surface = ${ratio.toFixed(2)}:1 < 3`
      ).toBeGreaterThanOrEqual(3);
    }
  });
});

test.describe("S4 / customs policy-corpus evidence lookup (?ask=)", () => {
  test("a query returns cited chunks, each with a primary-source citation", async ({ page }) => {
    await page.goto("/customs?ask=penalty%20for%20a%20negligent%20duty-loss%20violation");
    await settle(page);
    const results = page.getByTestId("lookup-results");
    await expect(results).toBeVisible();
    // The top result is the negligence/duty-loss disposition, cited to ICP-1592.
    await expect(results).toContainText(/negligence/i);
    await expect(results).toContainText("ICP-1592");
  });

  test("a zero-signal query returns an honest no-match, never an uncited guess", async ({ page }) => {
    await page.goto("/customs?ask=zzzzz%20quux%20blorptastic");
    await settle(page);
    await expect(page.getByTestId("lookup-no-match")).toBeVisible();
    await expect(page.getByTestId("lookup-results")).toHaveCount(0);
  });

  // EV-10: these two scans used to be ONE test that (a) claimed "landing" while actually
  // scanning the results state, and (b) asserted only `violations`, silently discarding
  // `incomplete` -- the exact vacuity class assertAxeClean exists to close (an undecided
  // contrast node on this state passed with zero coverage). Both lookup BRANCHES now go
  // through the same per-node triage as every other customs state (lessons R-3: when a
  // surface has N branches, scan all N, not the one the happy path reaches).
  test("no axe violations on the lookup RESULTS state (per-node incomplete triage)", async ({
    page
  }) => {
    await page.goto("/customs?ask=how%20much%20if%20I%20file%20a%20prior%20disclosure");
    await settle(page);
    await expect(page.getByTestId("lookup-results")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs lookup results");
  });

  test("no axe violations on the lookup NO-MATCH state (per-node incomplete triage)", async ({
    page
  }) => {
    await page.goto("/customs?ask=zzzzz%20quux%20blorptastic");
    await settle(page);
    await expect(page.getByTestId("lookup-no-match")).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags([...WCAG_AA_TAGS]).analyze();
    await assertAxeClean(page, results, "customs lookup no-match");
  });

  // EV-10 (form controls): every customs input/textarea must carry a PROGRAMMATICALLY
  // associated label -- placeholder text is not a name (it vanishes on input and is not
  // reliably announced). Asserted explicitly rather than left to axe's `label` rule alone,
  // so a refactor that swaps a <label htmlFor> for a bare placeholder fails with a named
  // control, not a generic axe dump.
  test("every customs form control has a programmatically associated label", async ({ page }) => {
    // The search input lives on the lookup landing; the counsel fields on a pending case.
    await page.goto(PROCEED_CASE);
    await settle(page);
    for (const id of ["counsel-reviewer", "counsel-note"]) {
      const control = page.locator(`#${id}`);
      await expect(control).toBeVisible();
      await expect(
        page.locator(`label[for="${id}"]`),
        `#${id} has no <label for> -- placeholder-only naming is a WCAG 4.1.2/3.3.2 failure`
      ).toHaveCount(1);
    }
    await page.goto("/customs");
    await settle(page);
    const ask = page.locator("#ask");
    await expect(ask).toBeVisible();
    await expect(
      page.locator('label[for="ask"]'),
      "#ask has no <label for> -- the sr-only label must stay bound to the control"
    ).toHaveCount(1);
  });
});
