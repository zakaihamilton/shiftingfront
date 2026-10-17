import { expect, test, type Locator, type Page } from "@playwright/test";

async function waitForBattlefieldCanvas(page: Page): Promise<Locator> {
  const canvas = page.getByTestId("battlefield-canvas");
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("command-sidebar")).toBeVisible({ timeout: 15_000 });
  return canvas;
}

async function waitForBattlefieldInk(canvas: Locator): Promise<void> {
  await expect.poll(async () => {
    return canvas.evaluate((element) => {
      const canvasElement = element as HTMLCanvasElement;
      if (canvasElement.width <= 0 || canvasElement.height <= 0) return 0;
      const context = canvasElement.getContext("2d");
      if (!context) return 0;
      const sampleWidth = Math.min(100, canvasElement.width);
      const sampleHeight = Math.min(100, canvasElement.height);
      const { data } = context.getImageData(
        Math.floor((canvasElement.width - sampleWidth) / 2),
        Math.floor((canvasElement.height - sampleHeight) / 2),
        sampleWidth,
        sampleHeight,
      );
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        ink += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0);
      }
      return ink;
    });
  }, { timeout: 15_000 }).toBeGreaterThan(0);
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

    // Pause before the first mission tick so the initial snapshot stays at the
    // same simulation state on every runner.
    await page.keyboard.press("Escape");
    const pauseMenu = page.getByTestId("pause-menu");
    await expect(pauseMenu).toBeVisible();
    // Keep the game paused and hide only the overlay so the battlefield stays still.
    await pauseMenu.evaluate((element) => {
      (element as HTMLElement).style.visibility = "hidden";
    });
    await expect(pauseMenu).toBeHidden();

    // Redraw once at a fixed render timestamp to pin weather and unit animation
    // without changing the paused simulation state.
    await page.evaluate(() => {
      const fixedTimeMs = 10_000;
      Object.defineProperty(window.performance, "now", { configurable: true, value: () => fixedTimeMs });
      const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (callback) => nativeRequestAnimationFrame(() => callback(fixedTimeMs));
    });
    await page.evaluate(() => new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve())));
    await waitForBattlefieldInk(canvas);

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
