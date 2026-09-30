import { expect, type Page } from "@playwright/test";

/** Wait until the directly playable battlefield surface is mounted. */
export async function waitForBattlefieldReady(page: Page): Promise<void> {
  const readyIndicators = [
    page.getByTestId("command-sidebar"),
    page.getByTestId("mission-result"),
    page.getByTestId("tutorial-overlay"),
  ];

  await expect.poll(async () => {
    for (const indicator of readyIndicators) {
      if (await indicator.count()) return true;
    }
    return false;
  }, { timeout: 15_000 }).toBe(true);
}

/** Wait until the battlefield canvas is mounted, sized, and ready for input. */
export async function waitForBattlefield(page: Page): Promise<void> {
  const canvas = page.getByTestId("battlefield-canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return canvasElement.width > 0 && canvasElement.height > 0;
  }), { timeout: 15_000 }).toBe(true);
  await waitForBattlefieldReady(page);
}
