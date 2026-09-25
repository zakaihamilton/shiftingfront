import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitForBattlefieldCanvas(page: Page): Promise<Locator> {
  const canvas = page.getByTestId("battlefield-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => {
    return canvas.evaluate((element) => {
      const canvasElement = element as HTMLCanvasElement;
      if (canvasElement.width <= 0 || canvasElement.height <= 0) return 0;
      const context = canvasElement.getContext("2d");
      if (!context) return 0;
      const { data } = context.getImageData(0, 0, Math.min(100, canvasElement.width), Math.min(100, canvasElement.height));
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        ink += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
      }
      return ink;
    });
  }).toBeGreaterThan(0);
  return canvas;
}

test.describe("visual regression", () => {
  test("matches new game deployment modal snapshot", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "NEW GAME" }).click();
    const seed = page.getByLabel("Four digit campaign code");
    await seed.fill("0421");
    const deployCard = page.getByTestId("deploy-screen");
    await expect(deployCard).toBeVisible();
    await expect(deployCard).toHaveScreenshot("new-game-deploy-modal.png", {
      maxDiffPixelRatio: 0.05,
    });
  });

  test("matches campaign mission briefing snapshot", async ({ page }) => {
    await page.goto("/briefing?seed=0421&mission=0");
    const briefingScreen = page.getByTestId("briefing-screen");
    await expect(briefingScreen).toBeVisible();
    await expect(page.getByTestId("mission-objectives")).toBeVisible();
    await expect(page.getByTestId("briefing-dialogue")).toBeVisible();
    await expect(page.getByTestId("field-guide-first-encounter")).toHaveCount(0);
    await page.getByRole("button", { name: "Skip transmission" }).click();
    const dialogue = page.getByTestId("briefing-dialogue");
    await expect(dialogue).toHaveAttribute("data-complete", "true");
    await dialogue.evaluate((element) => { element.scrollTop = 0; });

    await expect(briefingScreen).toHaveScreenshot("briefing-seed-0421-m0.png", {
      maxDiffPixelRatio: 0.05,
    });
  });

  test("matches tactical battlefield canvas snapshot on initial deployment", async ({ page }) => {
    await page.goto("/play?seed=0421&mission=0");
    const canvas = await waitForBattlefieldCanvas(page);

    // Pause the simulation to ensure rendering is completely frozen for snapshotting.
    await page.keyboard.press("Escape");
    const pauseMenu = page.getByTestId("pause-menu");
    await expect(pauseMenu).toBeVisible();
    // Keep the game paused and hide only the overlay so the battlefield stays still.
    await pauseMenu.evaluate((element) => {
      (element as HTMLElement).style.visibility = "hidden";
    });
    await expect(pauseMenu).toBeHidden();

    await expect(canvas).toHaveScreenshot("battlefield-seed-0421-m0.png", {
      maxDiffPixelRatio: 0.05,
    });
  });

  test("matches tutorial coaching interface snapshot", async ({ page }) => {
    await page.goto("/tutorial");
    const overlay = page.getByTestId("tutorial-overlay");
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute("data-stage", "select");

    await expect(overlay).toHaveScreenshot("tutorial-stage-select.png", {
      maxDiffPixelRatio: 0.05,
    });
  });
});
