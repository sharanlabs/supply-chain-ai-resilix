import { expect, test } from "@playwright/test";

test("runs flagship scenario and approves decision packet", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Live signals")).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel("Live signals").uncheck();

  const runButton = page.getByTestId("run-scenario");
  await expect(runButton).toBeEnabled({ timeout: 30_000 });

  const runResponse = page.waitForResponse(
    (response) =>
      response.url().includes("/api/run-exception") &&
      response.request().method() === "POST",
    { timeout: 90_000 }
  );
  await runButton.click();
  expect((await runResponse).ok()).toBe(true);

  await expect(page.getByTestId("decision-packet")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Approval Console" }).click();
  await page.getByTestId("approve-packet").click();
  await expect(page.getByText("APPROVED").first()).toBeVisible();
});
