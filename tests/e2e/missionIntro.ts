import { expect, type Page } from "@playwright/test";

export async function skipMissionIntroIfPresent(page: Page): Promise<void> {
  const intro = page.getByRole("dialog", { name: "Mission arrival feed" });
  const readyIndicators = [
    page.getByTestId("command-sidebar"),
    page.getByTestId("mission-result"),
    page.getByTestId("tutorial-overlay"),
  ];

  await expect.poll(async () => {
    if (await intro.count()) return true;
    for (const indicator of readyIndicators) {
      if (await indicator.count()) return true;
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);

  if (await intro.count()) {
    await expect(intro).toBeVisible();
    await page.getByRole("button", { name: /SKIP INTRO/ }).click();
    await expect(intro).toHaveCount(0, { timeout: 15_000 });
  }
}
