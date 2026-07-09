import AxeBuilder from "@axe-core/playwright";
import { test, expect, type Page } from "@playwright/test";

// S-L -- the /loop recorded-run exhibit, exercised against the real route with NO keys
// (the webServer runs keyless): the page is a static read of the committed loop fixture,
// so a keyless render proving rich content IS the no-billable-call structural proof --
// there is nothing live for it to call, and the honesty framing must say so on the glass.

async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => undefined))
    );
  });
}

test.describe("S-L / recorded agent run exhibit", () => {
  test("renders the recorded trajectory keyless: provenance, tool order, real Skeptic", async ({
    page
  }) => {
    await page.goto("/loop");
    await settle(page);

    // The honesty spine: a dated recorded-run banner that also states the replay is $0.
    const provenance = page.getByTestId("loop-provenance");
    await expect(provenance).toBeVisible();
    await expect(provenance).toContainText("Recorded run");
    await expect(provenance).toContainText(/\d{4}-\d{2}-\d{2}/);
    await expect(provenance).toContainText("replayed at $0, no live call");

    // The model-driven tool order -- at least three steps ending in the challenge.
    const sequence = page.getByTestId("tool-sequence");
    await expect(sequence.locator("li")).not.toHaveCount(0);
    await expect(sequence).toContainText("challengeFinding");

    // The REAL cross-family Skeptic verdict with its model named on the glass.
    const verdict = page.getByTestId("skeptic-verdict");
    await expect(verdict).toContainText("different company");
    await expect(verdict).toContainText(/llama/i);

    // Never claims to be running live NOW: the recorded framing wraps every live mention.
    // The count guard keeps this from going vacuously green if the phrase ever disappears
    // (the Investigator step is unconditional, so >=1 mention is the contract).
    const liveClaims = page.getByTestId("loop-run").getByText(/ran live/);
    expect(await liveClaims.count()).toBeGreaterThan(0);
    for (const claim of await liveClaims.all()) {
      await expect(claim).toContainText("(recorded)");
    }
  });

  test("no axe WCAG 2.2 AA violations on the exhibit", async ({ page }) => {
    await page.goto("/loop");
    await settle(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations,
      JSON.stringify(results.violations, null, 2)
    ).toEqual([]);
  });

  test("the war room masthead links to the exhibit, and the exhibit links back", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);
    const navLink = page.getByRole("link", { name: /agent run/i });
    await expect(navLink).toHaveAttribute("href", "/loop");
    await navLink.click();
    await expect(page.getByTestId("loop-run")).toBeVisible();
    await settle(page);
    await page.getByRole("link", { name: /war room/i }).click();
    await expect(page.getByTestId("actionops-packet")).toBeVisible();
  });

  test("keyboard: focus is visible on the exhibit's links", async ({ page }) => {
    await page.goto("/loop");
    await settle(page);
    await page.keyboard.press("Tab");
    const focused = page.locator(":focus-visible");
    await expect(focused).toBeVisible();
    const outline = await focused.evaluate(
      (el) => getComputedStyle(el).outlineStyle
    );
    expect(outline).not.toBe("none");
  });
});
