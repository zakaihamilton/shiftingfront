import { expect, type Locator, type Page } from "@playwright/test";
import { TILE_H, tileToScreen } from "../../lib/iso";
import { freshCampaignProgress } from "../../lib/persist/campaign";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, SLOT_VERSION } from "../../lib/persist/save";
import { cameraPanBounds, clampCamera } from "../../lib/render/camera";
import { createMission } from "../../lib/sim/api";
import { heightAt } from "../../lib/sim/world";
import type { SimState } from "../../lib/types";
import { waitForBattlefieldReady } from "./battlefieldReady";

export async function openBriefing(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "NEW GAME" }).click();
  const seed = page.getByLabel("Four digit campaign code");
  await seed.fill("0421");
  await page.getByTestId("deploy-screen").getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0/);
  await expect(page.getByTestId("briefing-screen")).toBeVisible();
}

export async function deployToBattlefield(page: Page) {
  await openBriefing(page);
  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0/);
  await waitForBattlefieldReady(page);
}

export function saveEnvelope(state: SimState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    savedAt: Date.now(),
    state,
  });
}

export function slotEnvelope(state: SimState, name: string): string {
  return JSON.stringify({
    version: SLOT_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    savedAt: Date.now(),
    name,
    state,
    campaign: freshCampaignProgress(state.seed),
  });
}

export function distinctiveSave(result: SimState["result"] = "playing"): SimState {
  const state = createMission({ seed: 421, missionIndex: 0 });
  state.credits[0] = 9876;
  state.tick = 120;
  state.result = result;
  return state;
}

export async function waitForTutorialStage(
  coach: Locator,
  stage: string,
  timeout = 5000,
): Promise<void> {
  await expect(coach).toHaveAttribute("data-stage", stage, { timeout });
  // Tutorial camera focus is intentionally animated so the player can follow
  // the new objective instead of losing context to an instant jump.
  await coach.page().waitForTimeout(1000);
}

type TutorialTargetSnapshot = {
  kind: "entity" | "tile";
  entityId?: number;
  entityClass?: "unit" | "building";
  label: string;
  x: number;
  y: number;
  footprint?: { w: number; h: number };
};

async function readTutorialTargets(page: Page): Promise<TutorialTargetSnapshot[]> {
  const raw = await page.getByTestId("tutorial-overlay").getAttribute("data-tutorial-targets");
  if (!raw) throw new Error("Tutorial target metadata is missing");
  return JSON.parse(raw) as TutorialTargetSnapshot[];
}

async function tutorialTargetPoint(
  page: Page,
  world: SimState,
  target: TutorialTargetSnapshot,
  focus: TutorialTargetSnapshot,
  focusYBias = focus.kind === "entity" ? 0.44 : 0.56,
): Promise<{ x: number; y: number }> {
  const canvas = page.getByTestId("battlefield-canvas");
  const dimensions = await canvas.evaluate((element) => ({
    width: element.parentElement!.clientWidth,
    height: element.parentElement!.clientHeight,
  }));
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Battlefield canvas has no layout bounds");

  const focusX = Math.round(focus.x);
  const focusY = Math.round(focus.y);
  const focusHeight = heightAt(world, focusX, focusY);
  const focusAnchor = tileToScreen(focusX, focusY, { x: 0, y: 0, zoom: 1 }, focusHeight);
  const camera = {
    x: dimensions.width / 2 - focusAnchor.x,
    y: dimensions.height * focusYBias - focusAnchor.y,
    zoom: 1,
  };
  clampCamera(
    camera,
    cameraPanBounds(world.width, world.height, dimensions.width, dimensions.height),
  );

  const targetX = Math.round(target.x);
  const targetY = Math.round(target.y);
  const screen = tileToScreen(target.x, target.y, camera, heightAt(world, targetX, targetY));
  const entityBodyOffset =
    target.kind === "entity" && target.entityClass === "unit" ? TILE_H / 2 - 12 : TILE_H / 2;
  const scaleX = bounds.width / dimensions.width;
  const scaleY = bounds.height / dimensions.height;
  return {
    x: bounds.x + screen.x * scaleX,
    y: bounds.y + (screen.y + entityBodyOffset) * scaleY,
  };
}

export async function clickTutorialTarget(
  page: Page,
  world: SimState,
  label: string,
  button: "left" | "right" = "left",
  modifiers: ("Alt" | "Control" | "Meta" | "Shift")[] = [],
): Promise<void> {
  const targets = await readTutorialTargets(page);
  const target = targets.find((candidate) => candidate.label === label);
  let focus = targets[0];
  if (!target || !focus) throw new Error(`Tutorial target ${label} is missing`);
  if (label === "Move destination") {
    const infantry = world.entities.find(
      (entity) => entity.owner === 0 && entity.kind === "infantry",
    );
    if (infantry) {
      // Selecting Infantry intentionally leaves the camera in place. Use the
      // selected unit as the camera anchor when calculating the destination.
      focus = {
        kind: "entity",
        entityId: infantry.id,
        entityClass: "unit",
        label: "Friendly Infantry",
        x: infantry.x,
        y: infantry.y,
      };
    }
  }
  let focusYBias = focus.kind === "entity" ? 0.44 : 0.56;
  const combat = targets.find((candidate) => candidate.label === "Combat Infantry");
  if (focus.label === "Drill target" && combat) {
    focus = { ...focus, x: (focus.x + combat.x) / 2, y: (focus.y + combat.y) / 2 };
    focusYBias = 0.32;
  }
  const point = await tutorialTargetPoint(page, world, target, focus, focusYBias);
  for (const modifier of modifiers) await page.keyboard.down(modifier);
  try {
    await page.mouse.click(point.x, point.y, { button });
  } finally {
    for (const modifier of [...modifiers].reverse()) await page.keyboard.up(modifier);
  }
}
