import { expect, test, type Page } from "@playwright/test";
import { MIN_RENDER_HEIGHT, MIN_RENDER_WIDTH } from "../../components/game/hooks/useGameCamera";
import { footprintOf, TICKS_PER_SECOND } from "../../lib/catalog";
import { TILE_H, tileToScreen } from "../../lib/iso";
import { cameraPanBounds, clampCamera } from "../../lib/render/camera";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, saveKey } from "../../lib/persist/save";
import { createMission } from "../../lib/sim/api";
import { heightAt } from "../../lib/sim/world";
import { isBuildingEntity, type Entity, type SimState } from "../../lib/types";

const TEST_SEED = 421;
const TEST_MISSION = 0;
const AUTOSAVE_INTERVAL_TICKS = 30 * TICKS_PER_SECOND;
function saveEnvelope(state: SimState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    savedAt: Date.now(),
    state,
  });
}

function preparedMission(): { state: SimState; building: Entity } {
  const state = createMission({ seed: TEST_SEED, missionIndex: TEST_MISSION });
  const building = state.entities.find((entity) => entity.owner === 0 && entity.kind === "power");
  if (!building) throw new Error("Playthrough fixture needs a player power plant");

  building.hp = building.maxHp - 120;
  building.repairing = false;
  state.credits[0] = 5_000;
  state.unitsProduced[0] = 0;
  state.unitsProducedByRole.infantry = 0;
  state.win = { kind: "forceQuota", target: 1 };
  state.missionKind = "forceQuota";
  state.runtime = undefined;
  state.tick = AUTOSAVE_INTERVAL_TICKS - 1;
  state.result = "playing";
  delete state.lossReason;

  // Keep the short browser fixture focused on the player actions. Enemy
  // buildings remain present so the loaded state still has a normal battlefield.
  state.entities = state.entities.filter((entity) => entity.owner === 0 || entity.class === "building");
  return { state, building };
}

async function waitForBattlefield(page: Page) {
  const canvas = page.getByTestId("battlefield-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(async () => canvas.evaluate((element, mins) => {
    const canvasEl = element as HTMLCanvasElement;
    const host = canvasEl.parentElement;
    if (!host) return false;
    const width = Math.max(mins.width, Math.floor(host.clientWidth));
    const height = Math.max(mins.height, Math.floor(host.clientHeight));
    return canvasEl.width === width && canvasEl.height === height;
  }, { width: MIN_RENDER_WIDTH, height: MIN_RENDER_HEIGHT })).toBe(true);
}

async function loadAutosaveFromPause(page: Page) {
  await page.getByRole("button", { name: "Load Mission" }).click();
  await expect(page.getByRole("heading", { name: "Load mission" })).toBeVisible();
  await page.getByRole("button", { name: "Load", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "Load mission?" });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Load mission" }).click();
  await expect(page.getByRole("status")).toContainText("Loaded the autosave");
}

async function pageCamera(page: Page, state: SimState) {
  const canvas = page.getByTestId("battlefield-canvas");
  const dimensions = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Battlefield canvas has no layout bounds");
  const constructionYard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
  if (!constructionYard) throw new Error("Playthrough fixture needs a construction yard");

  const origin = { x: 0, y: 0, zoom: 1 };
  const anchor = tileToScreen(
    constructionYard.x,
    constructionYard.y,
    origin,
    heightAt(state, constructionYard.x, constructionYard.y),
  );
  const camera = {
    x: dimensions.width / 2 - anchor.x,
    y: dimensions.height / 3 - anchor.y,
    zoom: 1,
  };
  clampCamera(camera, cameraPanBounds(camera, state.width, state.height, dimensions.width, dimensions.height));
  return { dimensions, bounds, camera };
}

function canvasCssPoint(
  point: { x: number; y: number },
  bounds: { x: number; y: number; width: number; height: number },
  dimensions: { width: number; height: number },
) {
  return {
    x: bounds.x + point.x * (bounds.width / dimensions.width),
    y: bounds.y + point.y * (bounds.height / dimensions.height),
  };
}

async function pointForEntity(page: Page, state: SimState, entity: Entity) {
  const { dimensions, bounds, camera } = await pageCamera(page, state);
  const footprint = isBuildingEntity(entity) ? footprintOf(entity.kind) : undefined;
  const x = footprint ? entity.x + (footprint.w - 1) / 2 : entity.x;
  const y = footprint ? entity.y + (footprint.h - 1) / 2 : entity.y;
  const point = tileToScreen(
    x,
    y,
    camera,
    heightAt(state, Math.round(entity.x), Math.round(entity.y)),
  );
  return canvasCssPoint({
    x: point.x,
    y: point.y + (TILE_H / 2) * camera.zoom - 12 * camera.zoom,
  }, bounds, dimensions);
}

async function pointForTile(page: Page, state: SimState, x: number, y: number) {
  const { dimensions, bounds, camera } = await pageCamera(page, state);
  const point = tileToScreen(x, y, camera, heightAt(state, x, y));
  return canvasCssPoint({
    x: point.x,
    y: point.y + (TILE_H / 2) * camera.zoom - 1,
  }, bounds, dimensions);
}

async function savedState(page: Page, persist = false): Promise<SimState | null> {
  return page.evaluate(({ key, persist: shouldPersist }) => {
    if (shouldPersist) window.dispatchEvent(new Event("pagehide"));
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: SimState };
    return parsed.state ?? null;
  }, { key: saveKey(TEST_SEED), persist });
}

async function savedEntity(page: Page, entityId: number, persist = false) {
  const state = await savedState(page, persist);
  return state?.entities.find((entity) => entity.id === entityId) ?? null;
}

test("completes a prepared mission through repair, production, and autosave", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const { state, building } = preparedMission();
  const initialHp = building.hp;
  await page.addInitScript(({ key, raw }) => {
    if (!window.localStorage.getItem(key)) window.localStorage.setItem(key, raw);
  }, { key: saveKey(TEST_SEED), raw: saveEnvelope(state) });
  await page.goto(`/play?seed=0421&mission=${TEST_MISSION}&resume=1`);
  await waitForBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();

  await expect.poll(async () => (await savedState(page))?.tick ?? -1).toBeGreaterThanOrEqual(AUTOSAVE_INTERVAL_TICKS);

  const repair = page.getByTestId("repair-mode");
  await repair.click();
  await expect(repair).toHaveAttribute("aria-pressed", "true");
  const buildingPoint = await pointForEntity(page, state, building);
  await page.mouse.click(buildingPoint.x, buildingPoint.y);

  await expect.poll(() => savedEntity(page, building.id, true)).toMatchObject({ repairing: true });
  const repaired = await savedEntity(page, building.id, true);
  expect(repaired?.hp).toBeGreaterThan(initialHp);

  await repair.click();
  await page.getByRole("tab", { name: "Production" }).click();
  const infantry = page.getByRole("button", { name: /Infantry, 75 credits/ });
  await expect(infantry).toBeEnabled();
  await infantry.click();
  await expect(page.getByTestId("cameo-progress-infantry")).toBeVisible();

  await expect(page.getByTestId("mission-result")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("mission-result")).toHaveAttribute("data-result", "won");
  await expect(page.getByRole("button", { name: "Next briefing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay mission" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Campaign map" })).toHaveCount(0);

  const terminal = await savedState(page);
  expect(terminal?.result).toBe("won");
  expect(terminal?.unitsProducedByRole.infantry).toBeGreaterThanOrEqual(1);
  expect(terminal?.unitsProduced[0]).toBeGreaterThanOrEqual(1);
  expect(terminal?.entities.find((entity) => entity.id === building.id)?.hp).toBeGreaterThan(initialHp);

  await page.reload();
  await expect(page.getByTestId("mission-result")).toBeVisible();
  await expect(page.getByTestId("mission-result")).toHaveAttribute("data-result", "won");
  expect((await savedState(page))?.result).toBe("won");
  expect(errors).toEqual([]);
});

test("persists production rally points and control groups through save/load", async ({ page }) => {
  const state = createMission({ seed: TEST_SEED, missionIndex: TEST_MISSION });
  const barracks = state.entities.find((entity) => entity.owner === 0 && entity.kind === "barracks");
  const infantry = state.entities.find((entity) => entity.owner === 0 && entity.class === "unit" && entity.kind === "infantry");
  expect(barracks).toBeDefined();
  expect(infantry).toBeDefined();
  state.credits[0] = 5_000;
  state.tick = AUTOSAVE_INTERVAL_TICKS - 1;
  state.win = { kind: "forceQuota", target: 1 };
  state.missionKind = "forceQuota";
  state.runtime = undefined;

  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: saveKey(TEST_SEED),
    raw: saveEnvelope(state),
  });
  await page.goto(`/play?seed=0421&mission=${TEST_MISSION}&resume=1`);
  await waitForBattlefield(page);

  await page.getByRole("tab", { name: "Selected" }).click();
  const barracksPoint = await pointForEntity(page, state, barracks!);
  const rally = { x: Math.round(barracks!.x) + 8, y: Math.round(barracks!.y) + 5 };
  const rallyPoint = await pointForTile(page, state, rally.x, rally.y);
  await page.mouse.click(barracksPoint.x, barracksPoint.y);
  await expect(page.getByTestId("rally-status")).toHaveText("Rally point not set");
  await page.mouse.click(rallyPoint.x, rallyPoint.y, { button: "right" });
  await expect(page.getByTestId("command-notice")).toContainText("Rally point set.");
  await expect(page.getByTestId("rally-status")).toHaveText(`Rally point ${rally.x}, ${rally.y}`);

  const infantryPoint = await pointForEntity(page, state, infantry!);
  await page.mouse.click(infantryPoint.x, infantryPoint.y);
  await page.keyboard.press("Control+1");
  await expect(page.getByTestId("command-notice")).toContainText("Control group 1 assigned");
  await page.mouse.click(barracksPoint.x, barracksPoint.y);
  await page.keyboard.press("1");
  await expect(page.getByTestId("selected-kind")).toHaveText("Infantry");

  const saved = await savedState(page, true);
  expect(saved?.entities.find((entity) => entity.id === barracks!.id)?.rallyPoint).toEqual(rally);
  expect(saved?.controlGroups).toEqual({ 1: [infantry!.id] });
  await page.reload();
  await waitForBattlefield(page);
  await page.evaluate(({ key, state: savedStateValue, version, contentVersion }) => {
    localStorage.setItem(key, JSON.stringify({
      version,
      contentVersion,
      savedAt: Date.now(),
      state: savedStateValue,
    }));
  }, { key: saveKey(TEST_SEED), version: SAVE_VERSION, contentVersion: SAVE_CONTENT_VERSION, state: saved });
  await page.keyboard.press("Escape");
  await loadAutosaveFromPause(page);
  await page.getByRole("button", { name: "Resume Mission" }).click();
  const restored = await savedState(page);
  expect(restored?.entities.find((entity) => entity.id === barracks!.id)?.rallyPoint).toEqual(rally);
  expect(restored?.controlGroups).toEqual({ 1: [infantry!.id] });

  await page.getByRole("tab", { name: "Production" }).click();
  const infantryCameo = page.getByRole("button", { name: /Infantry, 75 credits/ });
  await expect(infantryCameo).toBeEnabled();
  await page.keyboard.press("Alt+1");
  await expect(page.getByTestId("cameo-progress-infantry")).toBeVisible();
  await expect(page.getByTestId("mission-result")).toHaveAttribute("data-result", "won", { timeout: 10_000 });
  const producedSave = await savedState(page);
  expect(producedSave?.entities.some((entity) => entity.class === "unit" && entity.orderDestination?.x === rally.x && entity.orderDestination?.y === rally.y)).toBe(true);
});
