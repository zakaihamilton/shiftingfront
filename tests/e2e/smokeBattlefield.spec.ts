import { expect, type Locator, type Page, test } from "@playwright/test";
import { PLACEABLE, PRODUCIBLE } from "../../components/game/hooks/gameActions";
import { footprintOf } from "../../lib/catalog";
import { TILE_H, tileToScreen } from "../../lib/iso";
import { saveKey } from "../../lib/persist/save";
import { cameraPanBounds, clampCamera } from "../../lib/render/camera";
import { createMission } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { createTutorialMission } from "../../lib/sim/tutorial";
import { findBuildSite, heightAt, spawnBuilding } from "../../lib/sim/world";
import { type Entity, isBuildingEntity, type SimState } from "../../lib/types";
import { waitForBattlefield, waitForBattlefieldReady } from "./battlefieldReady";
import {
  clickTutorialTarget,
  deployToBattlefield,
  saveEnvelope,
  waitForTutorialStage,
} from "./smokeHelpers";

async function deployWithOperationalRadar(page: Page) {
  const state = createMission({ seed: 421, missionIndex: 0 });
  const yard = state.entities.find(
    (entity) => entity.owner === 0 && entity.kind === "constructionYard",
  );
  expect(yard).toBeDefined();
  const site = findBuildSite(state, "radar", (yard?.x ?? 8) + 4, yard?.y ?? 8, 18, 0);
  expect(site).toBeDefined();
  spawnBuilding(state, 0, "radar", site!.x, site!.y, 0);
  await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
    key: saveKey(421),
    raw: saveEnvelope(state),
  });
  await page.goto("/play?seed=0421&resume=1");
  await waitForBattlefieldReady(page);
  await expect(page.getByTestId("minimap-frame")).toHaveAttribute("data-power", "on");
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

async function nextFrame(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function battlefieldEntityGeometry(page: Page, state: SimState, entity: Entity) {
  const canvas = page.getByTestId("battlefield-canvas");
  const dimensions = await canvas.evaluate((element) => ({
    width: element.parentElement!.clientWidth,
    height: element.parentElement!.clientHeight,
  }));
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Battlefield canvas has no layout bounds");

  const yard = state.entities.find(
    (candidate) => candidate.owner === 0 && candidate.kind === "constructionYard",
  );
  if (!yard) throw new Error("Mission fixture has no construction yard");
  const origin = { x: 0, y: 0, zoom: 1 };
  const yardAnchor = tileToScreen(yard.x, yard.y, origin, heightAt(state, yard.x, yard.y));
  const camera = {
    x: dimensions.width / 2 - yardAnchor.x,
    y: dimensions.height / 3 - yardAnchor.y,
    zoom: 1,
  };
  clampCamera(
    camera,
    cameraPanBounds(state.width, state.height, dimensions.width, dimensions.height),
  );

  const footprint = isBuildingEntity(entity) ? footprintOf(entity.kind) : undefined;
  const x = footprint ? entity.x + (footprint.w - 1) / 2 : entity.x;
  const y = footprint ? entity.y + (footprint.h - 1) / 2 : entity.y;
  const screen = tileToScreen(
    x,
    y,
    camera,
    heightAt(state, Math.round(entity.x), Math.round(entity.y)),
  );
  const toCss = (value: number, axis: "x" | "y") =>
    bounds[axis] +
    value *
      (bounds[axis === "x" ? "width" : "height"] / dimensions[axis === "x" ? "width" : "height"]);
  return {
    bounds,
    dimensions,
    camera,
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
  return canvas.evaluate(
    (element, args) => {
      const canvasElement = element as HTMLCanvasElement;
      const context = canvasElement.getContext("2d");
      if (!context) throw new Error("Canvas context unavailable");
      const left = Math.max(0, Math.floor(args.region.x * args.scale.x));
      const top = Math.max(0, Math.floor(args.region.y * args.scale.y));
      const right = Math.min(
        canvasElement.width,
        Math.ceil((args.region.x + args.region.width) * args.scale.x),
      );
      const bottom = Math.min(
        canvasElement.height,
        Math.ceil((args.region.y + args.region.height) * args.scale.y),
      );
      const data = context.getImageData(
        left,
        top,
        Math.max(0, right - left),
        Math.max(0, bottom - top),
      ).data;
      let ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        const red = data[i] ?? 0;
        const green = data[i + 1] ?? 0;
        const blue = data[i + 2] ?? 0;
        if (red + green + blue > 120) ink += 1;
      }
      return ink;
    },
    { region, scale },
  );
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
      if (red >= 145 && red <= 205 && green >= 130 && green <= 185 && blue >= 75 && blue <= 125)
        pixels += 1;
    }
    return pixels;
  });
}

test.describe("Retina battlefield", () => {
  test.use({ deviceScaleFactor: 2, viewport: { width: 1280, height: 800 } });

  for (const { count, before, after } of [
    { count: 80, before: 2, after: 1.5 },
    { count: 200, before: 1.5, after: 1 },
  ]) {
    test(`keeps rendering and picking aligned across repeated ${count}-entity density changes`, async ({
      page,
    }) => {
      // Placing/canceling a foundation crosses the army threshold without
      // reloading the mission, replacing the canvas, or using a debug API.
      const state = makeFixture({ seed: 421, width: 64, height: 64, win: { kind: "annihilate" } });
      state.heights.fill(0);
      state.credits[1] = 0;
      addBuilding(state, 0, "constructionYard", 30, 30);
      addBuilding(state, 1, "constructionYard", 56, 56);
      const infantry = addUnit(state, 0, "infantry", 29, 33);
      while (state.entities.length < count) {
        const i = state.entities.length;
        addUnit(state, 0, "infantry", 3 + (i % 14), 3 + Math.floor(i / 14)).idle = true;
      }
      await page.addInitScript(({ key, raw }) => localStorage.setItem(key, raw), {
        key: saveKey(state.seed),
        raw: saveEnvelope(state),
      });
      await page.setViewportSize({ width: 1100, height: 700 });
      await page.goto("/play?seed=0421&mission=0&resume=1");
      await waitForBattlefield(page);
      const canvas = page.getByTestId("battlefield-canvas");
      await canvas.evaluate((element) => element.setAttribute("data-density-test", "same-canvas"));
      const { bounds, dimensions, camera } = await battlefieldEntityGeometry(page, state, infantry);
      const cssPoint = (x: number, y: number, offsetY = 0) => {
        const p = tileToScreen(x, y, camera, 0);
        return {
          x: bounds.x + (p.x * bounds.width) / dimensions.width,
          y: bounds.y + ((p.y + offsetY) * bounds.height) / dimensions.height,
        };
      };
      const soldier = cssPoint(infantry.x, infantry.y, TILE_H / 2 - 12);
      const site = cssPoint(33, 33, TILE_H / 2);
      const empty = cssPoint(27, 34, TILE_H / 2);
      const ground = tileToScreen(27, 34, camera, 0);
      const terrainColor = () =>
        canvas.evaluate((element, point) => {
          const source = element as HTMLCanvasElement;
          const sample = document.createElement("canvas");
          sample.width = sample.height = 1;
          const context = sample.getContext("2d")!;
          const sx = source.width / source.clientWidth;
          const sy = source.height / source.clientHeight;
          context.drawImage(source, point.x * sx, point.y * sy, 16 * sx, 16 * sy, 0, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
        }, ground);
      const expectDensity = async (density: number) => {
        await expect
          .poll(() =>
            canvas.evaluate((element) => {
              const target = element as HTMLCanvasElement;
              return {
                x: target.width / target.clientWidth,
                y: target.height / target.clientHeight,
              };
            }),
          )
          .toEqual({ x: density, y: density });
        await expect(canvas).toHaveAttribute("data-density-test", "same-canvas");
      };
      const expectPicking = async () => {
        await page.mouse.click(empty.x, empty.y);
        await expect(page.getByTestId("selected-kind")).toHaveCount(0);
        await page.mouse.click(soldier.x, soldier.y);
        await expect(page.getByTestId("selected-kind")).toHaveText("Infantry");
      };

      await expectDensity(before);
      await expectPicking();
      const baseline = await terrainColor();
      expect(Math.max(...baseline), "terrain must contain painted ground").toBeGreaterThan(25);
      const expectTerrain = async () => {
        const color = await terrainColor();
        for (let channel = 0; channel < 3; channel++) {
          expect(
            Math.abs(color[channel]! - baseline[channel]!),
            "terrain survives cache resizing",
          ).toBeLessThan(20);
        }
      };
      for (let cycle = 0; cycle < 3; cycle++) {
        await page.getByRole("tab", { name: "Construction", exact: true }).click();
        await page.getByRole("button", { name: /^Power Plant,/ }).click();
        await page.mouse.click(site.x, site.y);
        await expectDensity(after);
        await expectPicking();
        await expectTerrain();
        await page.getByRole("tab", { name: "Construction", exact: true }).click();
        await page.getByTestId("cameo-cancel-power").click();
        await expectDensity(before);
        await expectPicking();
        await expectTerrain();
      }
    });
  }

  test("keeps dense rendering, infantry picking, and movement aligned", async ({ page }) => {
    const world = createTutorialMission();
    await page.goto("/tutorial");
    await waitForBattlefield(page);
    const canvas = page.getByTestId("battlefield-canvas");
    await expect
      .poll(() =>
        canvas.evaluate((element) => {
          const target = element as HTMLCanvasElement;
          return target.width / target.getBoundingClientRect().width;
        }),
      )
      .toBeCloseTo(2, 1);
    await page.waitForTimeout(1000);
    await clickTutorialTarget(page, world, "Friendly Infantry");
    const coach = page.getByTestId("tutorial-overlay");
    await waitForTutorialStage(coach, "move");
    await expect(page.getByTestId("selected-kind")).toHaveText("Infantry");
    await clickTutorialTarget(page, world, "Move destination", "right");
    await waitForTutorialStage(coach, "build");
  });
});

test("keeps battlefield entities and hover tooltips visible after water effects", async ({
  page,
}) => {
  const seed = 5348;
  const state = createMission({ seed, missionIndex: 0 });
  const yard = state.entities.find(
    (entity) => entity.owner === 0 && entity.kind === "constructionYard",
  );
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
  await expect
    .poll(() =>
      canvasInkInScreenRegion(canvas, yardRegion, {
        x: yardGeometry.scaleX,
        y: yardGeometry.scaleY,
      }),
    )
    .toBeGreaterThan(80);
  await expect
    .poll(() =>
      canvasInkInScreenRegion(canvas, unitRegion, {
        x: unitGeometry.scaleX,
        y: unitGeometry.scaleY,
      }),
    )
    .toBeGreaterThan(20);

  const tooltipBefore = await goldTooltipPixels(canvas);
  await page.mouse.move(yardGeometry.pointer.x, yardGeometry.pointer.y);
  await expect.poll(() => goldTooltipPixels(canvas)).toBeGreaterThan(tooltipBefore + 20);
});

test("keeps sidebar item portraits sharp across command tabs", async ({ page }) => {
  const state = createMission({ seed: 421, missionIndex: 0 });
  const yard = state.entities.find(
    (entity) => entity.owner === 0 && entity.kind === "constructionYard",
  );
  expect(yard).toBeDefined();

  await deployToBattlefield(page);
  await waitForBattlefield(page);
  const sidebar = page.getByTestId("command-sidebar");

  const portraitMetrics = async () =>
    sidebar.evaluate((element) =>
      [...element.querySelectorAll("button[aria-label*='credits']")].map((button) => {
        const canvas = button.querySelector("canvas");
        const art = button.querySelector(".art") ?? button.firstElementChild;
        if (!(canvas instanceof HTMLCanvasElement) || !art)
          throw new Error("Sidebar portrait is missing");
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
      }),
    );
  const sidebarBounds = await sidebar.boundingBox();
  expect(sidebarBounds).not.toBeNull();
  const expectInsideSidebar = (card: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }) => {
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
  productionPortraits.forEach((portrait) => {
    expectInsideSidebar(portrait.card);
  });
  expect(
    productionPortraits.every(
      (portrait) =>
        portrait.backingWidth >= portrait.cssWidth && portrait.backingHeight >= portrait.cssHeight,
    ),
  ).toBe(true);

  await page.keyboard.press("h");
  const geometry = await battlefieldEntityGeometry(page, state, yard!);
  await page.mouse.click(geometry.pointer.x, geometry.pointer.y);
  await sidebar.getByRole("tab", { name: "Selected" }).click();
  await expect(page.getByTestId("selected-kind")).toHaveText("Command HQ");
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

test("exposes Field Medic production on the first mission", async ({ page }) => {
  const state = createMission({ seed: 421, missionIndex: 0 });
  const yard = state.entities.find(
    (entity) => entity.owner === 0 && entity.kind === "constructionYard",
  );
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

test("keeps the minimap dark until a radar is standing", async ({ page }) => {
  await deployToBattlefield(page);
  const frame = page.getByTestId("minimap-frame");
  await expect(frame).toHaveAttribute("data-power", "off");
  await expect(frame.getByText("Radar offline")).toBeVisible();
  const radar = frame.getByTestId("tactical-radar");
  await expect(radar).toHaveAttribute("aria-disabled", "true");
  await expect(radar).toHaveAttribute("aria-label", /build a radar/i);
});

test("keeps the tactical radar readable and usable across breakpoints", async ({ page }) => {
  await deployWithOperationalRadar(page);
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
  await expect
    .poll(async () =>
      radar.evaluate((element) => {
        const sweep = element.parentElement?.querySelector("span");
        return sweep ? getComputedStyle(sweep).animationName : "none";
      }),
    )
    .toBe("none");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId("mobile-command-toggle").click();
  const mobileRadar = page.getByTestId("command-sidebar").getByTestId("tactical-radar");
  await expect(mobileRadar).toBeVisible();
  expect(
    await mobileRadar.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(0);
  await expect
    .poll(() =>
      mobileRadar.evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        const context = canvas.getContext("2d");
        if (!context) return 0;
        return [...context.getImageData(0, 0, canvas.width, canvas.height).data].reduce(
          (sum, channel) => sum + channel,
          0,
        );
      }),
    )
    .toBeGreaterThan(0);
});

test("keeps tactical radar clicks anchored and cleans up interrupted drags", async ({ page }) => {
  await deployWithOperationalRadar(page);
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
  await expect.poll(() => canvasDigest(radar)).not.toBe(beforeDrag);

  await radar.dispatchEvent("pointercancel", { bubbles: true, pointerId: 1 });
  await expect(radar).not.toHaveAttribute("data-dragging", "true");
  await page.mouse.up();

  await page.keyboard.press("h");
  await nextFrame(page);
  const beforeClick = await canvasDigest(radar);
  await radar.click({ position: { x: 8, y: 8 } });
  await expect.poll(() => canvasDigest(radar)).not.toBe(beforeClick);
});
