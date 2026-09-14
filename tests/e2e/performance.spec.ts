import { expect, test } from "@playwright/test";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, saveKey } from "../../lib/persist/save";
import { createMission } from "../../lib/sim/api";
import { makeBuilding, makeUnit } from "../../lib/sim/world";
import type { BuildingKind, SimState, UnitKind } from "../../lib/types";

const UNIT_KINDS: UnitKind[] = ["infantry", "antiArmor", "tank", "harvester"];
const BUILDING_KINDS: BuildingKind[] = ["power", "barracks", "refinery", "factory", "turret"];

async function waitForBattlefield(page: import("@playwright/test").Page) {
  const canvas = page.getByTestId("battlefield-canvas");
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element) => {
    const canvasElement = element as HTMLCanvasElement;
    return canvasElement.width > 0 && canvasElement.height > 0;
  })).toBe(true);
}

function denseLateGameState(): SimState {
  const state = createMission({ seed: 421, missionIndex: 5 });
  const yard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
  if (!yard) throw new Error("Dense performance fixture needs a player construction yard");

  const clamp = (value: number, max: number) => Math.max(2, Math.min(max - 3, value));
  for (let i = 0; i < 240; i++) {
    const col = i % 16;
    const row = Math.floor(i / 16);
    const unit = makeUnit(
      state,
      0,
      UNIT_KINDS[i % UNIT_KINDS.length]!,
      clamp(yard.x - 7 + col, state.width),
      clamp(yard.y - 7 + row, state.height),
    );
    unit.idle = true;
    state.entities.push(unit);
  }

  for (let i = 0; i < 32; i++) {
    const building = makeBuilding(
      state,
      0,
      BUILDING_KINDS[i % BUILDING_KINDS.length]!,
      clamp(yard.x - 7 + (i % 8) * 2, state.width),
      clamp(yard.y - 5 + Math.floor(i / 8) * 2, state.height),
    );
    state.entities.push(building);
  }
  return state;
}

function saveEnvelope(state: SimState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    contentVersion: SAVE_CONTENT_VERSION,
    savedAt: Date.now(),
    state,
  });
}

test("keeps full battlefield frames within budget with a dense late-game state", async ({ page }) => {
  const state = denseLateGameState();
  await page.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: saveKey(state.seed), raw: saveEnvelope(state) });

  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto("/play?seed=0421&mission=5&resume=1&perf=1");
  await expect(page.getByTestId("battlefield-canvas")).toBeVisible();
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await page.keyboard.press("Escape");

  const canvas = page.getByTestId("battlefield-canvas");
  await expect.poll(() => canvas.getAttribute("data-perf-frame-ms")).not.toBeNull();
  const samples = await page.evaluate(async () => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid='battlefield-canvas']");
    if (!element) throw new Error("Battlefield canvas unavailable");
    const values: number[] = [];
    for (let i = 0; i < 45; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const value = Number(element.dataset.perfFrameMs);
      if (Number.isFinite(value)) values.push(value);
    }
    return values;
  });

  expect(samples.length).toBeGreaterThan(20);
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  expect(p95, `full-frame samples: ${samples.join(", ")}`).toBeLessThan(100);
});

test("keeps initial gameplay art loading scoped to the current mission", async ({ page }) => {
  const artRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/art/")) artRequests.push(request.url());
  });

  await page.goto("/play?seed=0421&mission=0&fresh=1");
  await waitForBattlefield(page);
  await page.waitForTimeout(250);

  expect(artRequests.some((url) => url.includes("/terrain/"))).toBe(true);
  expect(artRequests.some((url) => url.includes("/portraits/"))).toBe(false);
  expect(artRequests.some((url) => url.includes("/art/menu") || url.includes("/art/results/"))).toBe(false);
  expect(artRequests.length, `initial art requests: ${artRequests.join(", ")}`).toBeLessThan(100);
});

test("keeps mobile battlefield frames within budget with a dense late-game state", async ({ page }) => {
  const state = denseLateGameState();
  await page.addInitScript(({ key, raw }) => {
    localStorage.setItem(key, raw);
  }, { key: saveKey(state.seed), raw: saveEnvelope(state) });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/play?seed=0421&mission=5&resume=1&perf=1");
  await expect(page.getByTestId("battlefield-canvas")).toBeVisible();
  await expect(page.getByTestId("mobile-command-launcher")).toBeVisible();
  await page.keyboard.press("Escape");

  const canvas = page.getByTestId("battlefield-canvas");
  await expect.poll(() => canvas.getAttribute("data-perf-frame-ms")).not.toBeNull();
  const samples = await page.evaluate(async () => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid='battlefield-canvas']");
    if (!element) throw new Error("Battlefield canvas unavailable");
    const values: number[] = [];
    for (let i = 0; i < 45; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const value = Number(element.dataset.perfFrameMs);
      if (Number.isFinite(value)) values.push(value);
    }
    return values;
  });

  expect(samples.length).toBeGreaterThan(20);
  const sorted = [...samples].sort((a, b) => a - b);
  const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
  expect(p95, `mobile full-frame samples: ${samples.join(", ")}`).toBeLessThan(100);
});
