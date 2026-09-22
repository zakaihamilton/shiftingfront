import { expect, test, type Locator, type Page } from "@playwright/test";
import { BUILDING_KINDS, footprintOf } from "../../lib/catalog";
import { TILE_H, tileToScreen } from "../../lib/iso";
import { cameraPanBounds, clampCamera } from "../../lib/render/camera";
import { createMission } from "../../lib/sim/api";
import { createTutorialMission } from "../../lib/sim/tutorial";
import { heightAt } from "../../lib/sim/world";
import { spawnBuilding } from "../../lib/sim/world";
import { listGeneratedAssets } from "../../lib/gen/assetCatalog";
import { PLACEABLE, PRODUCIBLE } from "../../components/game/hooks/gameActions";
import { CAMPAIGN_PROGRESS_VERSION, campaignKey, freshCampaignProgress } from "../../lib/persist/campaign";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, saveKey, SLOT_VERSION, slotKey } from "../../lib/persist/save";
import { SETTINGS_KEY, SETTINGS_VERSION } from "../../lib/persist/settings";
import { isBuildingEntity, type Entity, type SimState } from "../../lib/types";
import { PREVIEW_CYCLE_MS } from "../../components/shared/ambient/menuBackdropSim/cycle";

async function openBriefing(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "NEW GAME" }).click();
  const seed = page.getByLabel("Four digit campaign code");
  await seed.fill("0421");
  await page.getByTestId("deploy-screen").getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0/);
}

async function deployToBattlefield(page: Page) {
  await openBriefing(page);
  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0/);
}

async function canvasDigest(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    const { data } = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
    let hash = 2166136261;
    for (let i = 0; i < data.length; i += 4) {
      hash ^= data[i] ?? 0;
      hash = Math.imul(hash, 16777619);
      hash ^= data[i + 1] ?? 0;
      hash = Math.imul(hash, 16777619);
      hash ^= data[i + 2] ?? 0;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  });
}

async function canvasInk(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    const context = (element as HTMLCanvasElement).getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    const { data } = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      ink += (data[i] ?? 0) + (data[i + 1] ?? 0) + (data[i + 2] ?? 0) + (data[i + 3] ?? 0);
    }
    return ink;
  });
}

async function nextFrame(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function waitForBattlefield(page: Page) {
  const canvas = page.getByTestId("battlefield-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return canvasElement.width > 0 && canvasElement.height > 0;
})).toBe(true);
}

async function waitForTutorialStage(coach: Locator, stage: string, timeout = 5000): Promise<void> {
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
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
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
  clampCamera(camera, cameraPanBounds(camera, world.width, world.height, dimensions.width, dimensions.height));

  const targetX = Math.round(target.x);
  const targetY = Math.round(target.y);
  const screen = tileToScreen(target.x, target.y, camera, heightAt(world, targetX, targetY));
  const entityBodyOffset = target.kind === "entity" && target.entityClass === "unit" ? TILE_H / 2 - 12 : TILE_H / 2;
  const scaleX = bounds.width / dimensions.width;
  const scaleY = bounds.height / dimensions.height;
  return {
    x: bounds.x + screen.x * scaleX,
    y: bounds.y + (screen.y + entityBodyOffset) * scaleY,
  };
}

async function clickTutorialTarget(
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
    const infantry = world.entities.find((entity) => entity.owner === 0 && entity.kind === "infantry");
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

async function battlefieldEntityGeometry(page: Page, state: SimState, entity: Entity) {
  const canvas = page.getByTestId("battlefield-canvas");
  const dimensions = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Battlefield canvas has no layout bounds");

  const yard = state.entities.find((candidate) => candidate.owner === 0 && candidate.kind === "constructionYard");
  if (!yard) throw new Error("Mission fixture has no construction yard");
  const origin = { x: 0, y: 0, zoom: 1 };
  const yardAnchor = tileToScreen(yard.x, yard.y, origin, heightAt(state, yard.x, yard.y));
  const camera = {
    x: dimensions.width / 2 - yardAnchor.x,
    y: dimensions.height / 3 - yardAnchor.y,
    zoom: 1,
  };
  clampCamera(camera, cameraPanBounds(camera, state.width, state.height, dimensions.width, dimensions.height));

  const footprint = isBuildingEntity(entity) ? footprintOf(entity.kind) : undefined;
  const x = footprint ? entity.x + (footprint.w - 1) / 2 : entity.x;
  const y = footprint ? entity.y + (footprint.h - 1) / 2 : entity.y;
  const screen = tileToScreen(x, y, camera, heightAt(state, Math.round(entity.x), Math.round(entity.y)));
  const toCss = (value: number, axis: "x" | "y") => bounds[axis] + value * (bounds[axis === "x" ? "width" : "height"] / dimensions[axis === "x" ? "width" : "height"]);
  return {
    screen,
    pointer: {
      x: toCss(screen.x, "x"),
      y: toCss(screen.y + TILE_H / 2 - 12, "y"),
    },
    scaleX: bounds.width / dimensions.width,
    scaleY: bounds.height / dimensions.height,
  };
}

async function canvasInkInScreenRegion(
  canvas: Locator,
  region: { x: number; y: number; width: number; height: number },
  scale: { x: number; y: number },
): Promise<number> {
  return canvas.evaluate((element, args) => {
    const canvasElement = element as HTMLCanvasElement;
    const context = canvasElement.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    const left = Math.max(0, Math.floor(args.region.x * args.scale.x));
    const top = Math.max(0, Math.floor(args.region.y * args.scale.y));
    const right = Math.min(canvasElement.width, Math.ceil((args.region.x + args.region.width) * args.scale.x));
    const bottom = Math.min(canvasElement.height, Math.ceil((args.region.y + args.region.height) * args.scale.y));
    const data = context.getImageData(left, top, Math.max(0, right - left), Math.max(0, bottom - top)).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i] ?? 0;
      const green = data[i + 1] ?? 0;
      const blue = data[i + 2] ?? 0;
      if (red + green + blue > 120) ink += 1;
    }
    return ink;
  }, { region, scale });
}

async function goldTooltipPixels(canvas: Locator): Promise<number> {
  return canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    const context = canvasElement.getContext("2d");
    if (!context) throw new Error("Canvas context unavailable");
    const data = context.getImageData(0, 0, canvasElement.width, canvasElement.height).data;
    let pixels = 0;
    for (let i = 0; i < data.length; i += 4) {
      const red = data[i] ?? 0;
      const green = data[i + 1] ?? 0;
      const blue = data[i + 2] ?? 0;
      if (red >= 145 && red <= 205 && green >= 130 && green <= 185 && blue >= 75 && blue <= 125) pixels += 1;
    }
    return pixels;
  });
}

async function loadSelectedPauseSlot(page: Page, notice: RegExp) {
  await page.getByRole("button", { name: "Load Mission" }).click();
  await expect(page.getByRole("heading", { name: "Load mission" })).toBeVisible();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Load mission?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Load mission" }).click();
  await expect(page.getByRole("status")).toContainText(notice);
}

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
  await expect(page.getByTestId("command-notice")).toContainText("order issued.", { timeout: 2000 });
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
  await expect(page.getByTestId("mission-objectives")).toContainText("10 min");

  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0/);
  await expect(page.getByTestId("seed")).toContainText("Seed 0421");
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await expect(page.getByTestId("credits")).toBeVisible();
  await expect(page.getByTestId("time-remaining")).toHaveText(/Time remaining (?:09|10):\d{2}/);
});

test("keeps battlefield entities and hover tooltips visible after water effects", async ({ page }) => {
  const seed = 5348;
  const state = createMission({ seed, missionIndex: 0 });
  const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
  const unit = state.entities.find((entity) => entity.owner === 0 && entity.class === "unit");
  expect(yard).toBeDefined();
  expect(unit).toBeDefined();

  await page.goto(`/play?seed=${seed}&mission=0&fresh=1`);
  await waitForBattlefield(page);
  const canvas = page.getByTestId("battlefield-canvas");
  const yardGeometry = await battlefieldEntityGeometry(page, state, yard!);
  const unitGeometry = await battlefieldEntityGeometry(page, state, unit!);

  // The sprite body rises above the ground anchor. This crop excludes most
  // of the terrain plate, making the assertion about the entity pixels.
  const yardRegion = {
    x: yardGeometry.screen.x - 58,
    y: yardGeometry.screen.y - 112,
    width: 116,
    height: 92,
  };
  const unitRegion = {
    x: unitGeometry.screen.x - 42,
    y: unitGeometry.screen.y - 72,
    width: 84,
    height: 68,
  };
  await expect.poll(() => canvasInkInScreenRegion(canvas, yardRegion, {
    x: yardGeometry.scaleX,
    y: yardGeometry.scaleY,
  })).toBeGreaterThan(80);
  await expect.poll(() => canvasInkInScreenRegion(canvas, unitRegion, {
    x: unitGeometry.scaleX,
    y: unitGeometry.scaleY,
  })).toBeGreaterThan(20);

  const tooltipBefore = await goldTooltipPixels(canvas);
  await page.mouse.move(yardGeometry.pointer.x, yardGeometry.pointer.y);
  await expect.poll(() => goldTooltipPixels(canvas)).toBeGreaterThan(tooltipBefore + 20);
});

test("keeps sidebar item portraits sharp across command tabs", async ({ page }) => {
  const state = createMission({ seed: 421, missionIndex: 0 });
  const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
  const unit = state.entities.find((entity) => entity.owner === 0 && entity.class === "unit" && entity.kind === "infantry");
  expect(yard).toBeDefined();
  expect(unit).toBeDefined();

  await deployToBattlefield(page);
  await waitForBattlefield(page);
  const sidebar = page.getByTestId("command-sidebar");

  const portraitMetrics = async () => sidebar.evaluate((element) => [...element.querySelectorAll("button[aria-label*='credits']")].map((button) => {
    const canvas = button.querySelector("canvas");
    const art = button.querySelector(".art") ?? button.firstElementChild;
    if (!(canvas instanceof HTMLCanvasElement) || !art) throw new Error("Sidebar portrait is missing");
    const cardBounds = button.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const artBounds = art.getBoundingClientRect();
    return {
      card: {
        left: cardBounds.left,
        right: cardBounds.right,
        top: cardBounds.top,
        bottom: cardBounds.bottom,
      },
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      cssWidth: canvasBounds.width,
      cssHeight: canvasBounds.height,
      artRatio: artBounds.width / artBounds.height,
      imageRendering: getComputedStyle(canvas).imageRendering,
    };
  }));
  const sidebarBounds = await sidebar.boundingBox();
  expect(sidebarBounds).not.toBeNull();
  const expectInsideSidebar = (card: { left: number; right: number; top: number; bottom: number }) => {
    expect(card.left).toBeGreaterThanOrEqual(sidebarBounds!.x);
    expect(card.right).toBeLessThanOrEqual(sidebarBounds!.x + sidebarBounds!.width);
    expect(card.top).toBeGreaterThanOrEqual(sidebarBounds!.y);
  };

  const constructionPortraits = await portraitMetrics();
  expect(constructionPortraits).toHaveLength(PLACEABLE.length);
  for (const portrait of constructionPortraits) {
    expectInsideSidebar(portrait.card);
    expect(portrait.backingWidth).toBeGreaterThanOrEqual(portrait.cssWidth);
    expect(portrait.backingHeight).toBeGreaterThanOrEqual(portrait.cssHeight);
    expect(portrait.artRatio).toBeCloseTo(80 / 56, 2);
    expect(portrait.imageRendering).toBe("auto");
  }

  await sidebar.getByRole("tab", { name: "Production" }).click();
  const productionPortraits = await portraitMetrics();
  expect(productionPortraits).toHaveLength(PRODUCIBLE.length);
  productionPortraits.forEach((portrait) => expectInsideSidebar(portrait.card));
  expect(productionPortraits.every((portrait) => portrait.backingWidth >= portrait.cssWidth && portrait.backingHeight >= portrait.cssHeight)).toBe(true);

  const geometry = await battlefieldEntityGeometry(page, state, unit!);
  await page.mouse.click(geometry.pointer.x, geometry.pointer.y);
  await sidebar.getByRole("tab", { name: "Selected" }).click();
  await expect(page.getByTestId("selected-kind")).toBeVisible();
  const selectedPortrait = sidebar.locator("[data-testid='selected-panel'] canvas");
  await expect(selectedPortrait).toBeVisible();
  const selectedMetrics = await selectedPortrait.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const bounds = canvas.getBoundingClientRect();
    return {
      backingWidth: canvas.width,
      backingHeight: canvas.height,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      left: bounds.left,
      right: bounds.right,
      top: bounds.top,
      bottom: bounds.bottom,
      imageRendering: getComputedStyle(canvas).imageRendering,
    };
  });
  expect(selectedMetrics.backingWidth).toBeGreaterThanOrEqual(selectedMetrics.cssWidth);
  expect(selectedMetrics.backingHeight).toBeGreaterThanOrEqual(selectedMetrics.cssHeight);
  expectInsideSidebar(selectedMetrics);
  expect(selectedMetrics.imageRendering).toBe("auto");
});

test("opens the operations map and launches an available mission", async ({ page }) => {
  await page.goto("/campaign?seed=0421");

  await expect(page.getByRole("heading", { name: "Operations map" })).toBeVisible();
  await expect(page.getByTestId("mission-card-0")).toContainText("Available");
  await expect(page.getByTestId("mission-card-2")).toContainText("Locked");

  await page.getByTestId("mission-card-0").click();
  await expect(page.getByTestId("mission-detail")).toContainText("Primary requirements");
  await expect(page.getByTestId("mission-detail")).toContainText("Time limit");
  await expect(page.getByTestId("mission-detail")).toContainText("10 min");
  await page.getByTestId("launch-selected-mission").click();
  await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0/);
});

test("returns from the operations map with Escape", async ({ page }) => {
  await page.goto("/campaign?seed=0421");

  await expect(page.getByRole("heading", { name: "Operations map" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(/\/$/);
});

test("keeps the unified menu and operations chrome inside the desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SHIFTING" })).toBeVisible();
  await expect(page.getByText("Shifting Front", { exact: true })).toHaveCount(0);
  await expect(page.locator("header").getByText("SHIFTING FRONT")).toHaveCount(0);
  await expect(page.getByTestId("menu-dashboard")).toBeVisible();
  await expect(page.getByTestId("menu-signal-overlay")).toBeAttached();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  await expect(page.getByTestId("menu-dashboard").getByRole("button", { name: "IMPORT SAVE" })).toHaveCount(0);

  const expandedLock = page.locator("[data-lock][data-expanded='true']");
  await expect(expandedLock).toHaveCount(1, { timeout: 10_000 });
  await expect(expandedLock).toHaveAttribute("data-render-mode", "gameplay");
  const firstScenario = await expandedLock.getAttribute("data-scenario");
  expect(firstScenario).toBeTruthy();
  await expect(expandedLock.locator("canvas")).toBeAttached();
  await expect.poll(() => canvasInk(expandedLock.locator("canvas"))).toBeGreaterThan(0);

  const nextExpandedLock = page.locator("[data-lock][data-expanded='true']");
  await expect.poll(async () => {
    const scenario = await nextExpandedLock.getAttribute("data-scenario");
    return scenario ?? firstScenario;
  }, { timeout: PREVIEW_CYCLE_MS + 10_000 }).not.toBe(firstScenario);
  await expect.poll(() => canvasInk(nextExpandedLock.locator("canvas"))).toBeGreaterThan(0);
  const lockBox = await expandedLock.boundingBox();
  const newGameBox = await page.getByRole("button", { name: "NEW GAME" }).boundingBox();
  expect(lockBox).toBeTruthy();
  expect(newGameBox).toBeTruthy();
  expect(lockBox!.x).toBeGreaterThan(newGameBox!.x + newGameBox!.width - 24);

  const collapsedLocks = page.locator("[data-lock][data-expanded='false']");
  await expect(collapsedLocks).toHaveCount(2);
  const pipCollisions = await page.evaluate(() => {
    const overlay = document.querySelector("[data-testid='menu-signal-overlay']");
    if (!(overlay instanceof HTMLElement)) throw new Error("Missing signal overlay");
    const overlayBox = overlay.getBoundingClientRect();
    const rootPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const toPx = (value: string) => {
      const token = value.trim();
      if (token.endsWith("rem")) return Number.parseFloat(token) * rootPx;
      return Number.parseFloat(token);
    };
    const intersects = (
      a: { x: number; y: number; width: number; height: number },
      b: { x: number; y: number; width: number; height: number },
    ) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    const locks = [...overlay.querySelectorAll("[data-lock]")].map((node) => {
      const el = node as HTMLElement;
      const style = getComputedStyle(el);
      const size = toPx(style.getPropertyValue("--lock-size"));
      const feedW = toPx(style.getPropertyValue("--lock-feed-w"));
      const feedH = toPx(style.getPropertyValue("--lock-feed-h"));
      const left = Number.parseFloat(style.left);
      const top = Number.parseFloat(style.top);
      const drift = 16;
      return {
        id: el.dataset.lock,
        expanded: {
          x: overlayBox.x + left + (size - feedW) / 2,
          y: overlayBox.y + top + (size - feedH) / 2,
          width: feedW,
          height: feedH,
        },
        collapsed: {
          x: overlayBox.x + left - drift,
          y: overlayBox.y + top - drift,
          width: size + drift * 2,
          height: size + drift * 2,
        },
      };
    });
    const hits: string[] = [];
    for (const source of locks) {
      for (const target of locks) {
        if (source.id === target.id) continue;
        if (intersects(source.expanded, target.collapsed)) hits.push(`${source.id}->${target.id}`);
      }
    }
    return hits;
  });
  expect(pipCollisions).toEqual([]);
  const collapsedBoxes = await collapsedLocks.all();
  for (const lock of collapsedBoxes) {
    const otherBox = await lock.boundingBox();
    expect(otherBox).toBeTruthy();
    const overlapX = lockBox!.x < otherBox!.x + otherBox!.width && lockBox!.x + lockBox!.width > otherBox!.x;
    const overlapY = lockBox!.y < otherBox!.y + otherBox!.height && lockBox!.y + lockBox!.height > otherBox!.y;
    expect(overlapX && overlapY).toBe(false);
  }

  const menuOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(menuOverflow).toBe(false);

  await page.getByRole("button", { name: "NEW GAME" }).click();
  await expect(page.getByTestId("deploy-screen")).toBeVisible();
  await expect(page.getByRole("heading", { name: "New campaign" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Operations map" })).toHaveCount(0);
  await expect(page.getByLabel("Four digit campaign code")).toHaveValue(/^\d{4}$/);
  await expect(page.getByTestId("campaign-backdrop")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy link" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "This Week" })).toBeDisabled();

  const campaignLayout = await page.getByTestId("deploy-screen").evaluate((dialog) => {
    const codePane = dialog.querySelector<HTMLElement>('[data-testid="campaign-code-pane"]');
    const infoPane = dialog.querySelector<HTMLElement>('[data-testid="campaign-info-pane"]');
    const codeButtons = codePane ? [...codePane.querySelectorAll<HTMLButtonElement>("button")] : [];
    const roll = codeButtons.find((button) => button.textContent?.trim() === "Roll");
    const thisWeek = codeButtons.find((button) => button.textContent?.trim() === "This Week");
    const copy = codePane?.querySelector<HTMLButtonElement>("[data-testid=\"copy-campaign-link\"]");
    const start = infoPane?.querySelector("button");
    if (!codePane || !infoPane || !roll || !thisWeek || !copy || !start) throw new Error("Missing campaign pane or action");
    const codeRect = codePane.getBoundingClientRect();
    const infoRect = infoPane.getBoundingClientRect();
    return {
      code: { left: codeRect.left, right: codeRect.right },
      info: { left: infoRect.left, right: infoRect.right },
      copyInCodePane: codePane.contains(copy),
      startInInfoPane: infoPane.contains(start),
      actionHeights: [roll, thisWeek, copy].map((button) => button.getBoundingClientRect().height),
    };
  });
  expect(campaignLayout.code.right).toBeLessThanOrEqual(campaignLayout.info.left + 1);
  expect(campaignLayout.copyInCodePane).toBe(true);
  expect(campaignLayout.startInInfoPane).toBe(true);
  expect(Math.max(...campaignLayout.actionHeights) - Math.min(...campaignLayout.actionHeights)).toBeLessThanOrEqual(1);

  const deployOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(deployOverflow).toBe(false);

  await page.goto("/campaign?seed=0421");
  await expect(page.getByRole("heading", { name: "Operations map" })).toBeVisible();

  const operationsOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(operationsOverflow).toBe(false);
  await expect(page.getByTestId("mission-detail")).toBeVisible();
});

test("copies a campaign link and opens a shared seed", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await expect(page.getByTestId("deploy-screen")).toBeVisible();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByRole("button", { name: "Link copied!" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\?seed=\d{4}$/);

  await page.goto("/?seed=0777");
  await expect(page.getByTestId("deploy-screen")).toBeVisible();
  await expect(page.getByLabel("Four digit campaign code")).toHaveValue("0777");
  await expect(page.getByTestId("campaign-backdrop")).toBeVisible();
  await page.getByRole("button", { name: "This Week" }).click();
  await expect(page.getByLabel("Four digit campaign code")).not.toHaveValue("0777");
  await expect(page.getByRole("button", { name: "This Week" })).toBeDisabled();
});

test("opens the campaign archive from the main menu", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "LOAD MISSION" }).click();

  await expect(page).toHaveURL(/\/load$/);
  await expect(page.getByTestId("campaign-archive")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Load mission" })).toBeVisible();
  await expect(page.getByRole("button", { name: "IMPORT SAVE" })).toHaveCount(0);
  await expect(page.getByText("No save slots.")).toBeVisible();
  const archiveScrollContainers = await page.getByTestId("campaign-archive").evaluate((element) => {
    const containers: string[] = [];
    let current: Element | null = element;
    while (current) {
      const overflowY = window.getComputedStyle(current).overflowY;
      if (overflowY === "auto" || overflowY === "scroll") containers.push(current.tagName.toLowerCase());
      current = current.parentElement;
    }
    return containers;
  });
  expect(archiveScrollContainers).toEqual(["div"]);

  await page.getByRole("button", { name: "Return to menu" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("exports and imports named save slots from the campaign archive", async ({ page }) => {
  const state = distinctiveSave();
  const slotId = "abcd1234abcd1234";
  const raw = slotEnvelope(state, "Bridgehead");
  await page.addInitScript(({ key, raw: slotRaw }) => {
    localStorage.setItem(key, slotRaw);
  }, { key: slotKey(slotId), raw });

  await page.goto("/load");
  await expect(page.getByRole("button", { name: "Export save slot Bridgehead" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export save slot Bridgehead" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shiftingfront-0421-Bridgehead.json");

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "IMPORT JSON" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "bridgehead.json", mimeType: "application/json", buffer: Buffer.from(raw) });

  await expect(page.getByRole("button", { name: "Resume Bridgehead" })).toHaveCount(2);
  const slotKeys = await page.evaluate((prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)), "shiftingfront:slot:");
  expect(slotKeys).toHaveLength(2);
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
  await expect(page.getByTestId("time-remaining")).toBeVisible();

  const statusGeometry = await page.getByTestId("battlefield-status").evaluate((element) => {
    const first = element.children[0]?.getBoundingClientRect();
    const second = element.children[1]?.getBoundingClientRect();
    return {
      bodyOverflow: document.documentElement.scrollWidth > window.innerWidth,
      stacked: Boolean(first && second && second.top >= first.bottom - 1),
    };
  });
  expect(statusGeometry.bodyOverflow).toBe(false);
  expect(statusGeometry.stacked).toBe(true);
});

test("keeps Asset Bay selection synchronized with category filters", async ({ page }) => {
  await page.goto("/assets");

  const browser = page.getByTestId("assets-browser");
  const list = browser.getByRole("listbox");
  await expect(list.getByRole("option")).toHaveCount(listGeneratedAssets().length);

  await browser.getByRole("button", { name: "Buildings" }).click();
  await expect(browser.getByRole("button", { name: "Buildings" })).toHaveAttribute("aria-pressed", "true");
  await expect(list.getByRole("option")).toHaveCount(BUILDING_KINDS.length);
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(1);
  await expect(page.getByLabel("Command HQ preview")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(list.locator('[aria-selected="true"]')).toHaveCount(1);
  await expect(page.getByLabel("Power Plant preview")).toBeVisible();
});

test("filters Portrait Lab groups without changing their accessible state", async ({ page }) => {
  await page.goto("/portraits");

  await expect(page.getByRole("heading", { name: "Commanders" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Advisors" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Enemy leaders" })).toBeVisible();

  await page.getByRole("button", { name: "Commanders" }).click();
  await expect(page.getByRole("button", { name: "Commanders" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "All roles" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Commanders" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Advisors" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Enemy leaders" })).toHaveCount(0);

  await page.getByRole("button", { name: "All roles" }).click();
  await expect(page.getByRole("heading", { name: "Advisors" })).toBeVisible();
});

test("exposes Field Medic production on the first mission", async ({ page }) => {
  const state = createMission({ seed: 421, missionIndex: 0 });
  const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
  expect(yard).toBeDefined();
  spawnBuilding(state, 0, "barracks", (yard?.x ?? 8) + 4, yard?.y ?? 8);
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: saveKey(421),
    raw: saveEnvelope(state),
  });

  await page.goto("/play?seed=0421&resume=1");
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await page.getByRole("tab", { name: "Production" }).click();
  const medic = page.getByRole("button", { name: /Field Medic, 180 credits/ });
  await expect(medic).toBeVisible();
  await expect(medic).toBeEnabled();
  await medic.click();
  await expect(page.getByTestId("cameo-progress-medic")).toBeVisible();
});

test("keeps the tactical radar readable and usable across breakpoints", async ({ page }) => {
  await deployToBattlefield(page);
  const radar = page.getByTestId("command-sidebar").getByTestId("tactical-radar");
  await expect(radar).toBeVisible();
  await expect(radar).toHaveAttribute("aria-label", /click or drag to look around/i);
  await expect(page.getByLabel("Tactical radar legend")).toHaveCount(0);

  const desktopStyles = await radar.evaluate((element) => {
    const frame = element.parentElement;
    const sweep = frame?.querySelector("span");
    return {
      touchAction: getComputedStyle(element).touchAction,
      imageRendering: getComputedStyle(element).imageRendering,
      frameOverlay: frame ? getComputedStyle(frame, "::after").backgroundImage : "none",
      sweepAnimation: sweep ? getComputedStyle(sweep).animationName : "none",
    };
  });
  expect(desktopStyles.touchAction).toBe("none");
  expect(desktopStyles.imageRendering).toBe("auto");
  expect(desktopStyles.frameOverlay).toBe("none");
  expect(desktopStyles.sweepAnimation).toMatch(/radar-scan/);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => radar.evaluate((element) => {
    const sweep = element.parentElement?.querySelector("span");
    return sweep ? getComputedStyle(sweep).animationName : "none";
  })).toBe("none");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("mobile-command-toggle").click();
  const mobileRadar = page.getByTestId("command-sidebar").getByTestId("tactical-radar");
  await expect(mobileRadar).toBeVisible();
  expect(await mobileRadar.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(0);
  await expect.poll(() => mobileRadar.evaluate((element) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext("2d");
    if (!context) return 0;
    return [...context.getImageData(0, 0, canvas.width, canvas.height).data].reduce((sum, channel) => sum + channel, 0);
  })).toBeGreaterThan(0);
});

test("keeps tactical radar clicks anchored and cleans up interrupted drags", async ({ page }) => {
  await deployToBattlefield(page);
  const radar = page.getByTestId("tactical-radar");
  await expect(radar).toBeVisible();

  const box = await radar.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width * 0.5;
  const startY = box!.y + box!.height * 0.5;

  await page.mouse.move(startX, startY);
  await nextFrame(page);
  const beforeDrag = await canvasDigest(radar);

  await page.mouse.down();
  await expect(radar).not.toHaveAttribute("data-dragging", "true");

  await page.mouse.move(startX + 2, startY + 2);
  await expect(radar).not.toHaveAttribute("data-dragging", "true");

  await page.mouse.move(startX + 48, startY + 24);
  await expect(radar).toHaveAttribute("data-dragging", "true");
  await nextFrame(page);
  expect(await canvasDigest(radar)).not.toBe(beforeDrag);

  await radar.dispatchEvent("pointercancel", { bubbles: true, pointerId: 1 });
  await expect(radar).not.toHaveAttribute("data-dragging", "true");
  await page.mouse.up();

  await page.keyboard.press("h");
  await nextFrame(page);
  const beforeClick = await canvasDigest(radar);
  await radar.click({ position: { x: 8, y: 8 } });
  await nextFrame(page);
  expect(await canvasDigest(radar)).not.toBe(beforeClick);
});

test("toggles music and sound from welcome options", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "OPTIONS" }).click();
  await expect(page.getByRole("heading", { name: "Game options" })).toBeVisible();

  await page.getByRole("button", { name: "Music: On" }).click();
  await expect(page.getByRole("button", { name: "Music: Off" })).toBeVisible();
  await page.getByRole("button", { name: "Sound effects: On" }).click();
  await expect(page.getByRole("button", { name: "Sound effects: Off" })).toBeVisible();
  const musicVolume = page.getByRole("slider", { name: "Music volume" });
  await expect(musicVolume).toHaveValue("0.5");
  await musicVolume.fill("0.3");
  await expect(musicVolume).toHaveValue("0.3");
  await expect(page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), SETTINGS_KEY)).resolves.toMatchObject({
    version: SETTINGS_VERSION,
    settings: { musicVolume: 0.3 },
  });

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: "Game options" })).toHaveCount(0);

  await page.reload();
  await page.getByRole("button", { name: "OPTIONS" }).click();
  await expect(page.getByRole("button", { name: "Music: Off" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sound effects: Off" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Music volume" })).toHaveValue("0.3");
});

test("scrolls game options menu correctly without cutting off top at reduced vertical resolution", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 });
  await page.goto("/");
  await page.getByRole("button", { name: "OPTIONS" }).click();

  const heading = page.getByRole("heading", { name: "Game options" });
  await expect(heading).toBeVisible();

  const headingBox = await heading.boundingBox();
  expect(headingBox).not.toBeNull();
  expect(headingBox!.y).toBeGreaterThanOrEqual(10);
  expect(headingBox!.y).toBeLessThan(480);

  const backButton = page.getByRole("button", { name: "Back" });
  await backButton.scrollIntoViewIfNeeded();
  await expect(backButton).toBeVisible();
  await backButton.click();
  await expect(heading).toHaveCount(0);

  // Also verify in-game pause options at reduced vertical resolution
  await page.goto("/tutorial");
  await page.waitForSelector("canvas");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "Options" }).click();

  const pauseHeading = page.getByRole("heading", { name: "Game options" });
  await expect(pauseHeading).toBeVisible();
  const pauseHeadingBox = await pauseHeading.boundingBox();
  expect(pauseHeadingBox).not.toBeNull();
  expect(pauseHeadingBox!.y).toBeGreaterThanOrEqual(5);

  const pauseBackButton = page.getByRole("button", { name: "Back" });
  await pauseBackButton.scrollIntoViewIfNeeded();
  await expect(pauseBackButton).toBeVisible();
  await pauseBackButton.click();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toHaveCount(0);
});

test("allows game options menu to expand wider when space is available", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: "OPTIONS" }).click();

  const optionsDialog = page.getByRole("dialog", { name: "Game options" });
  await expect(optionsDialog).toBeVisible();
  const box = await optionsDialog.boundingBox();
  expect(box).not.toBeNull();
  // Expands wider than former 24rem (384px) constraint, reaching up to 38rem (608px)
  expect(box!.width).toBeGreaterThan(500);
  expect(box!.width).toBeLessThanOrEqual(615);

  // Conforms smoothly on narrower viewports without horizontal overflow
  await page.setViewportSize({ width: 400, height: 800 });
  const narrowBox = await optionsDialog.boundingBox();
  expect(narrowBox).not.toBeNull();
  expect(narrowBox!.width).toBeLessThan(400);
  expect(narrowBox!.x).toBeGreaterThanOrEqual(0);
});

test("shows briefing portraits before launch", async ({ page }) => {
  await openBriefing(page);
  await expect(page.getByTestId("briefing-portrait").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay" })).toBeVisible();
});

test("does not expose soundtrack download controls from pause and mission result screens", async ({ page }) => {
  await deployToBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await expect(page.getByRole("button", { name: "Soundtrack", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Options", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume Mission" }).click();

  const state = distinctiveSave("won");
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), {
    key: saveKey(421),
    raw: saveEnvelope(state),
  });
  await page.goto("/play?seed=0421&resume=1");
  await expect(page.getByTestId("mission-result")).toBeVisible();
  await expect(page.getByRole("button", { name: "Soundtrack", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Mission soundtrack" })).toHaveCount(0);
});

test("replays the incoming transmission from the start", async ({ page }) => {
  await openBriefing(page);
  await page.keyboard.press(" ");
  const lastLine = page.getByTestId("briefing-line").nth(2);
  await expect(lastLine).toBeVisible();
  const lastText = (await lastLine.innerText()).trim();
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
  await page.getByRole("button", { name: "Open Shifting Front pause menu. F1 for controls" }).click();

  await expect(page.getByRole("dialog", { name: "Game paused" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Game options" })).toHaveCount(0);
});

function saveEnvelope(state: SimState): string {
  return JSON.stringify({ version: SAVE_VERSION, contentVersion: SAVE_CONTENT_VERSION, savedAt: Date.now(), state });
}

function slotEnvelope(state: SimState, name: string): string {
  return JSON.stringify({
    version: SLOT_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    savedAt: Date.now(),
    name,
    state,
    campaign: freshCampaignProgress(state.seed),
  });
}

function distinctiveSave(result: SimState["result"] = "playing"): SimState {
  const state = createMission({ seed: 421, missionIndex: 0 });
  state.credits[0] = 9876;
  state.tick = 120;
  state.result = result;
  return state;
}

test("resumes a seeded save from the menu", async ({ page }) => {
  const state = distinctiveSave();
  await page.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: saveKey(421), raw: saveEnvelope(state) });

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
  await page.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: slotKey(slotId), raw: slotEnvelope(state, "Bridgehead") });

  await page.goto("/");
  await page.getByRole("button", { name: "LOAD MISSION" }).click();
  await page.getByRole("button", { name: "Resume Bridgehead" }).click();
  // Slot restoration promotes the snapshot to the campaign autosave and
  // normalizes the URL so a refresh resumes that restored state.
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0&resume=1/);
  await expect(page.getByTestId("credits")).toHaveText("9,876");
  await expect(page.evaluate((key) => localStorage.getItem(key), slotKey(slotId))).resolves.not.toBeNull();
});

test("offers to reset an unreadable save from the campaign archive", async ({ page }) => {
  await page.addInitScript(({ key }) => {
    localStorage.setItem(key, "not valid json");
  }, { key: saveKey(421) });

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
  await page.evaluate(({ key }) => {
    localStorage.setItem(key, "not valid json");
  }, { key: saveKey(421) });

  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await page.getByRole("button", { name: "Load Mission" }).click();

  await expect(page.getByRole("status")).toHaveText("No save slots.");
  await expect(page.getByRole("heading", { name: "Load mission" })).toHaveCount(0);
});

test("loads the last save from the pause menu", async ({ page }) => {
  const state = distinctiveSave();
  await deployToBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await page.evaluate(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: saveKey(421), raw: saveEnvelope(state) });

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
  await page.evaluate(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: saveKey(421), raw: saveEnvelope(state) });

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
  await page.evaluate(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: saveKey(421), raw: saveEnvelope(state) });

  await page.keyboard.press("Escape");
  await loadSelectedPauseSlot(page, /Loaded the autosave/);
  await page.getByRole("button", { name: "Resume Mission" }).click();

  await page.reload();
  await expect(page.getByTestId("credits")).toHaveText("9,876");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Main Menu" }).click();
  await page.getByRole("dialog", { name: "Leave mission?" }).getByRole("button", { name: "Leave mission" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("menu-dashboard")).toBeVisible();

  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.getByLabel("Four digit campaign code").fill("0421");
  await page.getByTestId("deploy-screen").getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0/);
  await page.getByRole("button", { name: "Launch" }).click();
  await expect(page).toHaveURL(/\/play\?seed=0421&mission=0&fresh=1/);
  await expect(page.getByTestId("credits")).toHaveText("2,000");
});

test("shows a mission result overlay from a finished save", async ({ page }) => {
  const state = distinctiveSave("won");
  await page.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: saveKey(421), raw: saveEnvelope(state) });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play?seed=0421&resume=1");
  await expect(page.getByTestId("mission-result")).toBeVisible();
  await expect(page.getByTestId("mobile-command-launcher")).toHaveCount(0);
  await expect(page.getByTestId("mission-result")).toHaveAttribute("data-result", "won");
  await expect(page.getByRole("heading", { name: "Mission complete" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next briefing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next briefing" })).toHaveAttribute("data-default-action", "true");
  await expect(page.getByRole("button", { name: "Share result" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay mission" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Campaign map" })).toHaveCount(0);

  await page.setViewportSize({ width: 1280, height: 600 });
  await page.reload();
  await expect(page.getByTestId("mission-result")).toBeVisible();
  const resultLayout = await page.getByTestId("mission-result").evaluate((element) => {
    const panel = element.querySelector<HTMLElement>("[role='dialog']");
    const actions = panel?.querySelector<HTMLElement>("[class*='actions']");
    if (!panel || !actions) throw new Error("Missing mission result layout");
    const panelBounds = panel.getBoundingClientRect();
    const actionBounds = actions.getBoundingClientRect();
    return {
      panelTop: panelBounds.top,
      panelBottom: panelBounds.bottom,
      panelClientHeight: panel.clientHeight,
      panelScrollHeight: panel.scrollHeight,
      actionsBottom: actionBounds.bottom,
    };
  });
  expect(resultLayout.panelTop).toBeGreaterThanOrEqual(0);
  expect(resultLayout.panelBottom).toBeLessThanOrEqual(600);
  expect(resultLayout.actionsBottom).toBeLessThanOrEqual(600);
  expect(resultLayout.panelScrollHeight).toBeLessThanOrEqual(resultLayout.panelClientHeight + 1);
});

test("reflows failed mission actions without a share slot", async ({ page }) => {
  const state = distinctiveSave("lost");
  await page.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: saveKey(421), raw: saveEnvelope(state) });

  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/play?seed=0421&resume=1");
  await expect(page.getByTestId("mission-result")).toHaveAttribute("data-result", "lost");
  await expect(page.getByRole("button", { name: "Retry" })).toHaveAttribute("data-default-action", "true");
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
