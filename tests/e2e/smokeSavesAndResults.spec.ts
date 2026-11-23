import { expect, type Page, test } from "@playwright/test";
import { saveKey, slotKey } from "../../lib/persist/save";
import { waitForBattlefieldReady } from "./battlefieldReady";
import { replaceCampaignSave } from "./saveRepositoryHelpers";
import { deployToBattlefield, distinctiveSave, saveEnvelope, slotEnvelope } from "./smokeHelpers";

async function loadSelectedPauseSlot(page: Page, notice: RegExp) {
  await page.getByRole("button", { name: "Load Mission" }).click();
  await expect(page.getByRole("heading", { name: "Load mission" })).toBeVisible();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Load mission?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Load mission" }).click();
  await expect(page.getByRole("status").filter({ hasText: notice })).toContainText(notice);
}

test("resumes a seeded save from the menu", async ({ page }) => {
  const state = distinctiveSave();
  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
    },
    { key: saveKey(421), raw: saveEnvelope(state) },
  );

  await page.goto("/");
  await page.getByRole("button", { name: "LOAD MISSION" }).click();
  await page.getByRole("button", { name: /Resume .* autosave/ }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&resume=1/);
  await expect(page.getByTestId("seed")).toContainText("Seed 0421");
  await expect(page.getByTestId("credits")).toHaveText("9,876");
});

test("resumes a named save slot from the menu", async ({ page }) => {
  const state = distinctiveSave();
  const slotId = "abcd1234abcd1234";
  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
    },
    { key: slotKey(slotId), raw: slotEnvelope(state, "Bridgehead") },
  );

  await page.goto("/");
  await page.getByRole("button", { name: "LOAD MISSION" }).click();
  await page.getByRole("button", { name: "Resume Bridgehead" }).click();
  // Slot restoration promotes the snapshot to the campaign autosave and
  // normalizes the URL so a refresh resumes that restored state.
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0&resume=1/);
  await expect(page.getByTestId("credits")).toHaveText("9,876");
  await expect(
    page.evaluate((key) => localStorage.getItem(key), slotKey(slotId)),
  ).resolves.not.toBeNull();
});

test("offers to reset an unreadable save from the campaign archive", async ({ page }) => {
  await page.addInitScript(
    ({ key }) => {
      localStorage.setItem(key, "not valid json");
    },
    { key: saveKey(421) },
  );

  await page.goto("/");
  await page.getByRole("button", { name: "LOAD MISSION" }).click();
  const recovery = page.getByRole("alert").filter({ hasText: "Damaged save: 0421" });
  await expect(recovery).toContainText("Damaged save: 0421");
  await page.getByRole("button", { name: "Reset 0421" }).click();
  await expect(recovery).toHaveCount(0);
  await expect(page.evaluate((key) => localStorage.getItem(key), saveKey(421))).resolves.toBeNull();
});

test("does not open an empty pause load view for an unreadable autosave", async ({ page }) => {
  await deployToBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await replaceCampaignSave(page, 421, "not valid json");

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "Load Mission" }).click();

  await expect(page.getByRole("status").filter({ hasText: "No save slots." })).toHaveText(
    "No save slots.",
  );
  await expect(page.getByRole("heading", { name: "Load mission" })).toHaveCount(0);
});

test("loads the last save from the pause menu", async ({ page }) => {
  const state = distinctiveSave();
  await deployToBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await replaceCampaignSave(page, 421, saveEnvelope(state));

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await loadSelectedPauseSlot(page, /Loaded the autosave/);
  await page.getByRole("button", { name: "Resume Mission" }).click();
  await expect(page.getByTestId("credits")).toHaveText("9,876");
});

test("resumes the active mission after refreshing the window", async ({ page }) => {
  await deployToBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();

  const state = distinctiveSave();
  await replaceCampaignSave(page, 421, saveEnvelope(state));

  await page.keyboard.press("Escape");
  await loadSelectedPauseSlot(page, /Loaded the autosave/);
  await page.getByRole("button", { name: "Resume Mission" }).click();

  await page.reload();
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await expect(page.getByTestId("credits")).toHaveText("9,876");
});

test("starts a new same-seed mission after reloading before a fresh launch", async ({ page }) => {
  await deployToBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();

  const state = distinctiveSave();
  await replaceCampaignSave(page, 421, saveEnvelope(state));

  await page.keyboard.press("Escape");
  await loadSelectedPauseSlot(page, /Loaded the autosave/);
  await page.getByRole("button", { name: "Resume Mission" }).click();

  await page.reload();
  await expect(page.getByTestId("credits")).toHaveText("9,876");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Main Menu" }).click();
  await page
    .getByRole("dialog", { name: "Leave mission?" })
    .getByRole("button", { name: "Leave mission" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("menu-dashboard")).toBeVisible();

  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.getByLabel("Four digit campaign code").fill("0421");
  await page.getByTestId("deploy-screen").getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0/);
  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0&fresh=1/);
  await waitForBattlefieldReady(page);
  await expect(page.getByTestId("credits")).toHaveText("2,000");
});

test("shows a mission result overlay from a finished save", async ({ page }) => {
  const state = distinctiveSave("won");
  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
    },
    { key: saveKey(421), raw: saveEnvelope(state) },
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play?seed=0421&resume=1");
  await expect(page.getByTestId("mission-result")).toBeVisible();
  await expect(page.getByTestId("mobile-command-launcher")).toHaveCount(0);
  await expect(page.getByTestId("mission-result")).toHaveAttribute("data-result", "won");
  await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next briefing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next briefing" })).toHaveAttribute(
    "data-default-action",
    "true",
  );
  await expect(page.getByRole("button", { name: "Share result" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay mission" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Campaign map" })).toHaveCount(0);
  for (const label of ["Veteran squad", "Forward turret", "Air sortie", "Power reserve"]) {
    await expect(page.getByRole("button", { name: label })).toHaveCount(0);
  }

  await page.setViewportSize({ width: 1280, height: 600 });
  await page.reload();
  await expect(page.getByTestId("mission-result")).toBeVisible();
  await page
    .getByTestId("mission-result")
    .locator("[role='dialog']")
    .evaluate(async (panel) => {
      await Promise.all(
        panel
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => undefined)),
      );
    });
  const resultLayout = await page.getByTestId("mission-result").evaluate((element) => {
    const panel = element.querySelector<HTMLElement>("[role='dialog']");
    const actions = panel?.querySelector<HTMLElement>("[class*='actions']");
    if (!panel || !actions) throw new Error("Missing mission result layout");
    const panelBounds = panel.getBoundingClientRect();
    const actionBounds = actions.getBoundingClientRect();
    return {
      panelTop: panelBounds.top,
      panelBottom: panelBounds.bottom,
      panelCenterX: panelBounds.left + panelBounds.width / 2,
      panelCenterY: panelBounds.top + panelBounds.height / 2,
      panelClientHeight: panel.clientHeight,
      panelScrollHeight: panel.scrollHeight,
      actionsBottom: actionBounds.bottom,
      animationName: getComputedStyle(panel).animationName,
      sceneArt: getComputedStyle(panel).getPropertyValue("--scene-art"),
    };
  });
  expect(resultLayout.panelTop).toBeGreaterThanOrEqual(0);
  expect(resultLayout.panelBottom).toBeLessThanOrEqual(600);
  expect(Math.abs(resultLayout.panelCenterX - 640)).toBeLessThanOrEqual(1);
  expect(Math.abs(resultLayout.panelCenterY - 300)).toBeLessThanOrEqual(1);
  expect(resultLayout.actionsBottom).toBeLessThanOrEqual(600);
  expect(resultLayout.panelScrollHeight).toBeLessThanOrEqual(resultLayout.panelClientHeight + 1);
  expect(resultLayout.animationName).not.toBe("none");
  expect(resultLayout.sceneArt).toContain("/art/biomes/");
});

test("replays a completed mission when its autosave has changed elsewhere", async ({ page }) => {
  const state = distinctiveSave("won");
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: saveKey(421),
    raw: saveEnvelope(state),
  });
  await page.goto("/play?seed=0421&mission=0&resume=1");
  await expect(page.getByTestId("mission-result")).toBeVisible();

  const newerSave = distinctiveSave();
  newerSave.tick += 120;
  await replaceCampaignSave(page, 421, saveEnvelope(newerSave));
  await page.getByRole("button", { name: "Replay mission" }).click();
  await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0&from=result&replay=1/);

  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0&fresh=1/);
  await waitForBattlefieldReady(page);
  await expect(page.getByTestId("mission-result")).toHaveCount(0);
  await expect(page.getByTestId("credits")).toHaveText("2,000");
});
test("respects reduced motion on the mission result dialog", async ({ page }) => {
  const state = distinctiveSave("lost");
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: saveKey(421),
    raw: saveEnvelope(state),
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play?seed=0421&resume=1");

  await expect(page.getByRole("heading", { name: "Mission failed" })).toBeVisible();
  const animationName = await page
    .getByTestId("mission-result")
    .locator("[role='dialog']")
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(animationName).toBe("none");
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});

test("reflows failed mission actions without a share slot", async ({ page }) => {
  const state = distinctiveSave("lost");
  await page.addInitScript(
    ({ key, raw }) => {
      localStorage.setItem(key, raw);
    },
    { key: saveKey(421), raw: saveEnvelope(state) },
  );

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/play?seed=0421&resume=1");
  await expect(page.getByTestId("mission-result")).toHaveAttribute("data-result", "lost");
  await expect(page.getByRole("button", { name: "Retry" })).toHaveAttribute(
    "data-default-action",
    "true",
  );
  await expect(page.getByRole("button", { name: "Share result" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Menu" })).toBeVisible();
  const [menuBounds, retryBounds] = await Promise.all([
    page.getByRole("button", { name: "Menu" }).boundingBox(),
    page.getByRole("button", { name: "Retry" }).boundingBox(),
  ]);
  expect(menuBounds).not.toBeNull();
  expect(retryBounds).not.toBeNull();
  expect(menuBounds!.x).toBeLessThan(retryBounds!.x);

  const bounds = await page.getByTestId("mission-result").evaluate((element) => ({
    viewportWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
    resultScrollWidth: element.scrollWidth,
  }));
  expect(bounds.bodyScrollWidth).toBeLessThanOrEqual(bounds.viewportWidth);
  expect(bounds.resultScrollWidth).toBeLessThanOrEqual(bounds.viewportWidth);
});
