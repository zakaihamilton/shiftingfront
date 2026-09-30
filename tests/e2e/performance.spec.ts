import { expect, test, type Page } from "@playwright/test";
import { waitForBattlefield } from "./battlefieldReady";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, saveKey } from "../../lib/persist/save";
import { createMission } from "../../lib/sim/api";
import { makeBuilding, makeUnit } from "../../lib/sim/world";
import type { BuildingKind, SimState, UnitKind } from "../../lib/types";
import { summarizeTimings } from "../../lib/perf/metrics";

const UNIT_KINDS: UnitKind[] = ["infantry", "antiArmor", "tank", "harvester"];
const BUILDING_KINDS: BuildingKind[] = ["power", "barracks", "refinery", "factory", "turret"];
// Hosted runners use software Canvas rendering on two shared vCPUs. Preserve
// their 100 ms regression ceiling while local browsers enforce the 30 fps goal.
const FRAME_BUDGETS = process.env.CI
  ? { workP95: 100, intervalP50: 100.1, intervalP95: 150.1 }
  : { workP95: 1000 / 30, intervalP50: 1000 / 30 + 1, intervalP95: 50.1 };
test.setTimeout(process.env.CI ? 60_000 : 30_000);

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
    state.entities = [...state.entities, unit];
  }

  for (let i = 0; i < 32; i++) {
    const building = makeBuilding(
      state,
      0,
      BUILDING_KINDS[i % BUILDING_KINDS.length]!,
      clamp(yard.x - 7 + (i % 8) * 2, state.width),
      clamp(yard.y - 5 + Math.floor(i / 8) * 2, state.height),
    );
    state.entities = [...state.entities, building];
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

async function expectFrameBudgets(page: Page): Promise<void> {
  const canvas = page.getByTestId("battlefield-canvas");
  // Finish cold terrain preparation before the stress fixture's harvesters
  // begin changing its layout. All timing samples below run with play resumed.
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-perf-terrain-ready", "true", { timeout: process.env.CI ? 30_000 : 15_000 });
  await page.keyboard.press("Escape");
  await expect.poll(() => canvas.getAttribute("data-perf-frame-sequence")).not.toBeNull();
  const initialTick = Number(await canvas.getAttribute("data-perf-tick"));
  // Warm the renderer and simulation together; sampling a paused game hides tick costs.
  await expect.poll(async () => Number(await canvas.getAttribute("data-perf-tick"))).toBeGreaterThan(initialTick + 12);
  const samples = await page.evaluate(async () => {
    const element = document.querySelector<HTMLCanvasElement>("[data-testid='battlefield-canvas']");
    if (!element) throw new Error("Battlefield canvas unavailable");
    const work: number[] = [];
    const intervals: number[] = [];
    const slowFrames: Array<{ workMs: number; renderMs: number; tick: number }> = [];
    const firstTick = Number(element.dataset.perfTick);
    let sequence = element.dataset.perfFrameSequence;
    for (let i = 0; i < 120; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (element.dataset.perfFrameSequence === sequence) continue;
      sequence = element.dataset.perfFrameSequence;
      const workMs = Number(element.dataset.perfFrameMs);
      const intervalMs = Number(element.dataset.perfFrameIntervalMs);
      if (Number.isFinite(workMs) && Number.isFinite(intervalMs)) {
        work.push(workMs);
        intervals.push(intervalMs);
        if (workMs > 1000 / 30) slowFrames.push({ workMs, renderMs: Number(element.dataset.perfRenderMs), tick: Number(element.dataset.perfTick) });
      }
    }
    return { work, intervals, slowFrames, firstTick, lastTick: Number(element.dataset.perfTick) };
  });
  const work = summarizeTimings(samples.work);
  const intervals = summarizeTimings(samples.intervals);
  console.log(`battlefield timings ${JSON.stringify({ viewport: page.viewportSize(), work, intervals, budgets: FRAME_BUDGETS })}`);
  await test.info().attach("battlefield-frame-timings", {
    body: JSON.stringify({ work, intervals, samples }),
    contentType: "application/json",
  });
  expect(samples.work.length).toBeGreaterThanOrEqual(100);
  expect(samples.lastTick - samples.firstTick, "simulation must advance during frame sampling").toBeGreaterThan(5);
  expect(work.p95Ms, `complete loop work: ${JSON.stringify(work)}; cadence: ${JSON.stringify(intervals)}; slow frames: ${JSON.stringify(samples.slowFrames)}`).toBeLessThan(FRAME_BUDGETS.workP95);
  expect(intervals.p50Ms, `frame cadence: ${JSON.stringify(intervals)}`).toBeLessThanOrEqual(FRAME_BUDGETS.intervalP50);
  // Cadence budgets allow 0.1 ms of animation timestamp rounding.
  expect(intervals.p95Ms, `frame cadence: ${JSON.stringify(intervals)}`).toBeLessThanOrEqual(FRAME_BUDGETS.intervalP95);
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
  await expectFrameBudgets(page);
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
  await expectFrameBudgets(page);
});
