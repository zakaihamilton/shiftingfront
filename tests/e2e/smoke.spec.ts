import { expect, test } from "@playwright/test";
import {
  CAMPAIGN_PROGRESS_VERSION,
  campaignKey,
  freshCampaignProgress,
} from "../../lib/persist/campaign";
import { createTutorialMission } from "../../lib/sim/tutorial";
import { waitForBattlefield, waitForBattlefieldReady } from "./battlefieldReady";
import {
  clickTutorialTarget,
  deployToBattlefield,
  openBriefing,
  waitForTutorialStage,
} from "./smokeHelpers";

test("welcome tutorial opens the seed 0000 training range", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "TUTORIAL" }).click();
  await expect(page).toHaveURL(/\/tutorial/);
  const coach = page.getByTestId("tutorial-overlay");
  await expect(coach).toBeVisible();
  await expect(coach).toHaveAttribute("data-stage", "select");
  await expect(coach).toHaveAttribute("data-target-count", "1");
  await expect(coach).toContainText("Focus: Friendly Infantry");
  await expect(coach).toContainText("Waiting for your action");
  await expect(coach.getByRole("button", { name: "Continue" })).toHaveCount(0);
  await expect(page.getByTestId("seed")).toContainText("Seed 0000");
  await expect(page.getByTestId("objective")).toContainText("Training range — no time limit");
  await expect(page.getByTestId("time-remaining")).toHaveCount(0);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip training" })).toHaveCount(0);
  await page.getByRole("button", { name: "Exit Training" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("guides a player through the live tutorial flow", async ({ page }) => {
  test.setTimeout(60000);
  const world = createTutorialMission();
  await page.goto("/tutorial");
  await waitForBattlefield(page);
  const coach = page.getByTestId("tutorial-overlay");
  await page.waitForTimeout(1000);

  await clickTutorialTarget(page, world, "Friendly Infantry");
  await waitForTutorialStage(coach, "move");

  await clickTutorialTarget(page, world, "Move destination", "right");
  await waitForTutorialStage(coach, "build");
  await expect(page.locator('[data-tutorial-focus="construction-tab"]')).toBeVisible();

  await page.getByRole("tab", { name: "Construction" }).click();
  await page.getByRole("button", { name: /Power Plant/ }).click();
  await clickTutorialTarget(page, world, "Power Plant site");
  await waitForTutorialStage(coach, "produce", 15000);
  await expect(page.locator('[data-tutorial-focus="production-tab"]')).toBeVisible();

  await page.getByRole("tab", { name: "Production" }).click();
  await page.getByRole("button", { name: /Infantry/ }).click();
  await waitForTutorialStage(coach, "attack");
  await expect(coach).toContainText("Drill target");
  await expect(coach).toHaveAttribute("data-target-count", "2");

  await clickTutorialTarget(page, world, "Combat Infantry");
  await page.getByRole("tab", { name: "Selected" }).click();
  await expect(page.getByTestId("selected-kind")).toHaveText("Infantry");
  await clickTutorialTarget(page, world, "Drill target", "right", ["Control"]);
  await expect(page.getByTestId("command-notice")).toContainText("order issued.", {
    timeout: 2000,
  });
  // The drill is intentionally well away from the barracks. Allow the unit
  // to walk the route and finish the passive target before Repair can begin.
  await waitForTutorialStage(coach, "repair", 40000);
  await expect(page.locator('[data-tutorial-focus="repair-control"]')).toBeVisible();

  await page.getByTestId("repair-mode").click();
  await clickTutorialTarget(page, world, "Damaged structure");
  await waitForTutorialStage(coach, "complete");
  await expect(page.getByRole("button", { name: "Return to Command Desk" })).toBeVisible();

  await page.getByRole("button", { name: "Return to Command Desk" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("new game launch goes to briefing without training", async ({ page }) => {
  await openBriefing(page);
  await expect(page.getByTestId("mission-objectives")).toBeVisible();

  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0&fresh=1/);
  await expect(page.getByRole("dialog", { name: "Leave mission?" })).toHaveCount(0);
});

test("fresh battlefield cold opens straight into the playable mission", async ({ page }) => {
  await page.goto("/play?seed=0421&mission=0&fresh=1");
  await expect(page.getByTestId("battlefield-canvas")).toBeVisible();
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await expect(page.getByRole("button", { name: "Expand mission directive" })).toBeVisible();
  await expect(
    page.getByTestId("battlefield-status").locator("[data-directive-expanded]"),
  ).toHaveAttribute("data-directive-expanded", "false");
  await expect(page.locator("#mission-directive-body")).toBeHidden();
});

test("Escape returns a New Campaign briefing to its launcher", async ({ page }) => {
  await openBriefing(page);

  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(/\/\?seed=0421/);
  await expect(page.getByRole("dialog", { name: "New campaign" })).toBeVisible();
});

test("launches a seeded campaign from menu to battlefield", async ({ page }) => {
  await openBriefing(page);
  await expect(page.getByTestId("mission-objectives")).toBeVisible();
  await expect(page.getByTestId("mission-objectives")).toContainText(/command hq/i);
  await expect(page.getByTestId("mission-objectives")).toContainText("15 min");

  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0/);
  await waitForBattlefieldReady(page);
  await expect(page.getByTestId("seed")).toContainText("Seed 0421");
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await expect(page.getByTestId("credits")).toBeVisible();
  await expect(page.getByTestId("time-remaining")).toHaveText(/Time remaining (?:14|15):\d{2}/);
});

test("keeps briefing dialogue and battlefield status readable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/briefing?seed=0421&mission=0");
  await expect(page.getByTestId("briefing-dialogue")).toBeVisible();

  const briefingGeometry = await page.getByTestId("briefing-dialogue").evaluate((element) => ({
    bodyOverflow: document.documentElement.scrollWidth > window.innerWidth,
    storyOverflow: element.scrollWidth > element.clientWidth,
  }));
  expect(briefingGeometry.bodyOverflow).toBe(false);
  expect(briefingGeometry.storyOverflow).toBe(false);

  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: campaignKey(421),
    raw: JSON.stringify({
      version: CAMPAIGN_PROGRESS_VERSION,
      savedAt: Date.now(),
      progress: { ...freshCampaignProgress(421), tutorialComplete: true },
    }),
  });
  await page.goto("/play?seed=0421&mission=0&fresh=1");
  await waitForBattlefieldReady(page);
  await expect(page.getByTestId("time-remaining")).toBeVisible();

  const statusGeometry = await page.getByTestId("battlefield-status").evaluate((element) => {
    const first = element.children[0]?.getBoundingClientRect();
    const second = element.children[1]?.getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth > window.innerWidth,
      sideBySide: Boolean(
        first && second && Math.abs(first.top - second.top) <= 1 && second.left >= first.right - 1,
      ),
    };
  });
  expect(statusGeometry.bodyOverflow).toBe(false);
  expect(statusGeometry.sideBySide).toBe(true);
});

test("shows briefing portraits before launch", async ({ page }) => {
  await openBriefing(page);
  await expect(page.getByTestId("briefing-portrait").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible();
});

test("replays the incoming transmission from the start", async ({ page }) => {
  await openBriefing(page);
  await page.getByRole("button", { name: "Skip transmission" }).click();
  await expect(page.getByTestId("briefing-dialogue")).toHaveAttribute("data-complete", "true");
  const lastLine = page.getByTestId("briefing-line").nth(2);
  await expect(lastLine).toBeVisible();
  const lastText = (await lastLine.textContent())?.trim() ?? "";
  expect(lastText.length).toBeGreaterThan(12);
  await page.getByRole("button", { name: "Replay" }).click();
  await expect(page.getByTestId("briefing-dialogue")).not.toContainText(lastText.slice(-24));
});

test("pauses and resumes from the battlefield", async ({ page }) => {
  await deployToBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "Options" }).click();
  await expect(page.getByRole("button", { name: "Music: On" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sound effects: On" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Resume Mission" }).click();
  await expect(page.getByTestId("pause-menu")).toHaveCount(0);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
});

test("opens the main pause menu from the command header", async ({ page }) => {
  await deployToBattlefield(page);
  await page
    .getByRole("button", { name: "Open Shifting Front pause menu. F1 for controls" })
    .click();

  await expect(page.getByRole("dialog", { name: "Game paused" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Game options" })).toHaveCount(0);
});
