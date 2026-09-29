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
