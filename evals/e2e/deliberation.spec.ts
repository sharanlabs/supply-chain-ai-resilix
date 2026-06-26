import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Phase 6 -- the war-room deliberation UI, exercised against the REAL `/` route
// (the frozen live-captured Hormuz packet served as a $0 REPLAY). This is the
// data-driven, no-live-call surface: the deliberation trajectory, the scored
// recovery options, and the Phase-1 domain fields all source from packet fields,
// so they render offline. The homepage fixture has 6 agent runs and NO Skeptic
// (it predates the Phase-4 critic), so this also pins the GRACEFUL ABSENCE of the
// Skeptic line -- the surface must never assume the Skeptic exists.
//
// Axe coverage for the new content is carried by a11y.spec.ts: its "default state"
// scan covers the closed deliberation + the always-open recovery options + the
// survival read, and its "every disclosure expanded" scan opens the deliberation
// and re-scans it. This sibling owns the BEHAVIOURAL coverage (render-from-fixture,
// keyboard operability of the new disclosure, honest labels, graceful absence).
// ---------------------------------------------------------------------------

// Settle every running entrance/grow animation before reading geometry or visibility,
// so a mid-fade frame never trips a visibility assertion (mirrors a11y.spec.ts).
async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document.getAnimations().map((a) => a.finished.catch(() => undefined))
    );
  });
}

test.describe("Phase 6 / deliberation trajectory", () => {
  test("the agent trail is a closed disclosure by default, then opens to the ordered chain", async ({
    page
  }) => {
    await page.goto("/");
    const packet = page.getByTestId("actionops-packet");
    await expect(packet).toBeVisible();
    await settle(page);

    // The disclosure summary is on the glass; the per-step machinery is NOT (closed).
    const summary = page
      .locator("summary")
      .filter({ hasText: /How this was reasoned/i });
    await expect(summary).toBeVisible();
    const aStep = page.getByText(/supplier\(s\) matched and scored/i);
    await expect(aStep).toHaveCount(1);
    await expect(aStep).not.toBeVisible();

    // Open it -- the full ordered chain (Sentinel -> ... -> Dispatcher) becomes visible.
    await summary.click();
    await settle(page);
    for (const name of [
      "Sentinel",
      "Verifier",
      "Atlas",
      "Simulator",
      "Strategist",
      "Dispatcher"
    ]) {
      await expect(packet.getByText(name, { exact: true }).first()).toBeVisible();
    }
    await expect(aStep).toBeVisible();

    // On the REPLAY homepage every step's mode is relabeled "Recorded" (honest -- it is a
    // recording), never a raw enum on the glass.
    await expect(packet.getByText("Recorded").first()).toBeVisible();
  });

  test("the agent-trail summary is keyboard-operable (Enter toggles it)", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);
    const summary = page
      .locator("summary")
      .filter({ hasText: /How this was reasoned/i });
    await summary.focus();
    const open = () =>
      summary.evaluate((el) => (el.closest("details") as HTMLDetailsElement).open);
    expect(await open()).toBe(false);
    await page.keyboard.press("Enter");
    expect(await open()).toBe(true);
    await page.keyboard.press("Enter");
    expect(await open()).toBe(false);
  });

  test("no agent-step mode is ever rendered as the raw enum text", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() =>
      document.querySelectorAll("details").forEach((d) => d.setAttribute("open", ""))
    );
    await settle(page);
    // The humanized labels are visible; the raw enums never are (they live only in the
    // chip title attribute, which is not text content).
    const body = page.locator("body");
    await expect(body).not.toContainText("DETERMINISTIC_RULES");
    await expect(body).not.toContainText("FAILED_TO_FALLBACK");
  });
});

test.describe("Phase 6 / recovery options on the glass", () => {
  test("renders the scored options with reversibility as the governance dial", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);
    const packet = page.getByTestId("actionops-packet");

    await expect(packet.getByText("What we could do")).toBeVisible();
    // The fixture's four options + their humanized action labels.
    await expect(
      packet.getByText("Expedite inbound on the most exposed lanes")
    ).toBeVisible();
    await expect(packet.getByText("Escalate", { exact: true })).toBeVisible();
    // Reversibility (the governance signal) reads in plain words on the glass; the
    // hardest-to-undo move (the LOW-reversibility escalation) is flagged.
    await expect(packet.getByText("Hard to reverse").first()).toBeVisible();
    await expect(packet.getByText("Easily reversible").first()).toBeVisible();
    // The top-scored move is marked, and approval-gated moves say so.
    await expect(packet.getByText("Lead option")).toBeVisible();
    await expect(packet.getByText("Needs your approval").first()).toBeVisible();
  });
});

test.describe("Phase 6 / Skeptic graceful absence + Phase-1 fields", () => {
  test("renders NO Skeptic trust line when the packet has no Skeptic run", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);
    // The 6-run homepage fixture has no Skeptic -- the line must be absent, no crash.
    await expect(page.locator("body")).not.toContainText("independent reviewer");
    await expect(page.getByTestId("actionops-packet")).toBeVisible();
  });

  test("weaves in the Phase-1 fields: data-driven sourcing, TTR, survival read, margin", async ({
    page
  }) => {
    await page.goto("/");
    await settle(page);
    const packet = page.getByTestId("actionops-packet");

    // The exposure note is data-driven off singleSource (2 of 9 in the fixture), never the
    // false hardcoded "none with a qualified backup".
    await expect(
      packet.getByText(/are single-source with no qualified backup/i)
    ).toBeVisible();
    // Per-row time-to-restore (recoveryDays).
    await expect(packet.getByText(/Est\. time to restore/i).first()).toBeVisible();
    // The survival read (cover vs restore) -- TTS 25 vs worst TTR 60 -> a 35-day gap.
    await expect(packet.getByText(/Cover vs restore time/i)).toBeVisible();
    await expect(packet.getByText(/35-day gap/i)).toBeVisible();
    // Margin-at-risk beside revenue-at-risk.
    await expect(packet.getByText(/margin/i).first()).toBeVisible();
  });
});
