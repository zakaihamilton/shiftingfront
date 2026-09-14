import { expect, test } from "@playwright/test";
import { MIN_RENDER_HEIGHT, MIN_RENDER_WIDTH } from "../../components/game/hooks/useGameCamera";
import { cameraPanBounds, clampCamera } from "../../lib/render/camera";
import { TILE_H, tileToScreen } from "../../lib/iso";
import { SAVE_CONTENT_VERSION, SAVE_VERSION, SLOT_VERSION, saveKey, slotKey } from "../../lib/persist/save";
import { freshCampaignProgress } from "../../lib/persist/campaign";
import { createMission } from "../../lib/sim/api";
import { addUnit, setHeight } from "../../lib/sim/fixtures";
import { heightAt } from "../../lib/sim/world";
import type { Entity, SimState } from "../../lib/types";

const TEST_SEED = 421;

async function openBriefingSkippingTutorial(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "NEW GAME" }).click();
  await page.getByLabel("Four digit campaign code").fill("0421");
  await page.getByTestId("deploy-screen").getByRole("button", { name: "Start" }).click();
  await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0/);
}

function playerUnits(state: SimState): Entity[] {
  return state.entities.filter(
    (entity) => entity.owner === 0 && entity.class === "unit" && entity.hp > 0 && !entity.neutral,
  );
}

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
  }));

  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  return dimensions;
}

async function expectWelcomePreviewsBelowMenu(
  page: import("@playwright/test").Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  await expect(page.getByTestId("menu-dashboard")).toBeVisible();

  const layout = await page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>("[data-testid='menu-dashboard']");
    const overlay = document.querySelector<HTMLElement>("[data-testid='menu-signal-overlay']");
    const effects = overlay?.querySelector<HTMLElement>("[class*='viewportEffects']");
    const screen = document.querySelector<HTMLElement>("[class*='screen']");
    if (!menu || !overlay || !effects || !screen) throw new Error("Missing welcome layout elements");

    const menuRect = menu.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    return {
      menuBottom: menuRect.bottom,
      overlay: {
        top: overlayRect.top,
        bottom: overlayRect.bottom,
        width: overlayRect.width,
        position: getComputedStyle(overlay).position,
      },
      effectsPosition: getComputedStyle(effects).position,
      screen: {
        clientHeight: screen.clientHeight,
        scrollHeight: screen.scrollHeight,
      },
    };
  });

  expect(layout.overlay.position).toBe("relative");
  expect(layout.overlay.top).toBeGreaterThanOrEqual(layout.menuBottom - 1);
  expect(layout.overlay.width).toBeLessThanOrEqual(viewport.width);
  expect(layout.effectsPosition).toBe("fixed");

  for (const lock of await page.locator("[data-testid='menu-signal-overlay'] [data-lock]").all()) {
    const bounds = await lock.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
  }

  return layout;
}

async function expectOperationsMapFit(
  page: import("@playwright/test").Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto("/campaign?seed=0421");
  await expect(page.getByRole("heading", { name: "Operations map" })).toBeVisible();

  const dimensions = await expectNoHorizontalOverflow(page);
  expect(dimensions.documentHeight).toBeLessThanOrEqual(viewport.height);

  const panel = page.getByTestId("operations-panel");
  const launch = page.getByTestId("launch-selected-mission");
  const returnToMenu = page.getByRole("button", { name: "Return to menu" });
  const layout = await panel.evaluate((element) => {
    const panelRect = element.getBoundingClientRect();
    return {
      panel: { top: panelRect.top, bottom: panelRect.bottom },
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });

  expect(layout.panel.top).toBeGreaterThanOrEqual(0);
  expect(layout.panel.bottom).toBeLessThanOrEqual(viewport.height);
  expect(layout.scrollHeight).toBeLessThanOrEqual(layout.clientHeight + 1);

  for (const control of [launch, returnToMenu]) {
    const bounds = await control.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
  }
}

async function waitForBattlefield(page: import("@playwright/test").Page) {
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
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function waitForStableSelection(page: import("@playwright/test").Page) {
  await page.waitForTimeout(100);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

async function persistedUnitOrder(page: import("@playwright/test").Page, unitId: number) {
  return page.evaluate(({ key, unitId: id }) => {
    window.dispatchEvent(new Event("pagehide"));
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: {
        entities?: Array<{
          id: number;
          orderMode?: string;
          orderDestination?: { x: number; y: number };
        }>;
      };
    };
    const unit = parsed.state?.entities?.find((entity) => entity.id === id);
    return unit ? { orderMode: unit.orderMode ?? null, orderDestination: unit.orderDestination ?? null } : null;
  }, { key: saveKey(TEST_SEED), unitId });
}

async function pageCamera(page: import("@playwright/test").Page, state: SimState) {
  const canvas = page.getByTestId("battlefield-canvas");
  const dimensions = await canvas.evaluate((element) => ({
    width: (element as HTMLCanvasElement).width,
    height: (element as HTMLCanvasElement).height,
  }));
  const bounds = await canvas.boundingBox();
  if (!bounds) throw new Error("Battlefield canvas has no layout bounds");
  const constructionYard = state.entities.find((entity) => entity.owner === 0 && entity.kind === "constructionYard");
  if (!constructionYard) throw new Error("Mission has no construction yard");
  const origin = { x: 0, y: 0, zoom: 1 };
  const anchor = tileToScreen(constructionYard.x, constructionYard.y, origin, heightAt(state, constructionYard.x, constructionYard.y));
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

async function pointForTile(page: import("@playwright/test").Page, x: number, y: number) {
  const state = createMission({ seed: TEST_SEED, missionIndex: 0 });
  const { dimensions, bounds, camera } = await pageCamera(page, state);
  return canvasCssPoint(tileToScreen(x, y, camera, heightAt(state, x, y)), bounds, dimensions);
}

async function pointForEntity(page: import("@playwright/test").Page, entity: Entity) {
  const state = createMission({ seed: TEST_SEED, missionIndex: 0 });
  const { dimensions, bounds, camera } = await pageCamera(page, state);
  const point = tileToScreen(entity.x, entity.y, camera, heightAt(state, Math.round(entity.x), Math.round(entity.y)));
  const zoom = camera.zoom;
  return canvasCssPoint({
    x: point.x,
    y: point.y + (TILE_H / 2) * zoom - 12 * zoom,
  }, bounds, dimensions);
}

async function dispatchTouch(
  page: import("@playwright/test").Page,
  type: "pointerdown" | "pointermove" | "pointerup",
  point: { x: number; y: number },
  pointerId = 1,
) {
  await page.getByTestId("battlefield-canvas").evaluate((element, event) => {
    element.dispatchEvent(new PointerEvent(event.type, {
      bubbles: true,
      cancelable: true,
      pointerId: event.pointerId,
      pointerType: "touch",
      isPrimary: true,
      button: event.type === "pointerup" ? 0 : 0,
      buttons: event.type === "pointerup" ? 0 : 1,
      clientX: event.x,
      clientY: event.y,
    }));
  }, { type, pointerId, x: point.x, y: point.y });
}

test.describe("operations map responsive layout", () => {
  test("fits the full command console inside desktop windows", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 600 },
      { width: 1280, height: 720 },
      { width: 1600, height: 900 },
      { width: 1024, height: 768 },
    ]) {
      await expectOperationsMapFit(page, viewport);
    }
  });

  test("reflows to a scrollable page on narrow viewports", async ({ page }) => {
    for (const viewport of [
      { width: 700, height: 400 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/campaign?seed=0421");
      await expect(page.getByRole("heading", { name: "Operations map" })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const launch = page.getByTestId("launch-selected-mission");
      await launch.scrollIntoViewIfNeeded();
      await expect(launch).toBeVisible();
      const launchBounds = await launch.boundingBox();
      expect(launchBounds).not.toBeNull();
      expect(launchBounds!.y).toBeGreaterThanOrEqual(0);
      expect(launchBounds!.y + launchBounds!.height).toBeLessThanOrEqual(viewport.height);
    }
  });
});

test.describe("campaign complete responsive layout", () => {
  test("keeps the final controls reachable after scrolling the campaign record", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/campaign-complete?seed=0421");
      await expect(page.getByRole("heading", { name: "Campaign record" })).toBeVisible();

      const panel = page.getByTestId("campaign-complete-panel");
      const layout = await panel.evaluate((element) => {
        const panel = element as HTMLElement;
        panel.scrollTop = panel.scrollHeight;
        return {
          clientHeight: panel.clientHeight,
          scrollHeight: panel.scrollHeight,
        };
      });
      expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);

      const returnToMenu = page.getByRole("button", { name: "Return to menu" });
      const bounds = await returnToMenu.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    }
  });
});

test.describe("short-height layouts", () => {
  test("keeps the briefing actions reachable at short desktop heights", async ({ page }) => {
    for (const height of [650, 791]) {
      await page.setViewportSize({ width: 1600, height });
      await page.goto("/briefing?seed=0421&mission=0");
      await expect(page.getByTestId("mission-objectives")).toBeVisible();

      const dimensions = await expectNoHorizontalOverflow(page);
      expect(dimensions.documentHeight).toBeGreaterThanOrEqual(dimensions.viewportHeight);

      const objectives = page.getByTestId("mission-objectives");
      await objectives.scrollIntoViewIfNeeded();
      await expect(objectives).toBeVisible();

      const launch = page.getByRole("button", { name: "Launch" });
      await launch.scrollIntoViewIfNeeded();
      await expect(launch).toBeVisible();
      const launchBounds = await launch.boundingBox();
      expect(launchBounds).not.toBeNull();
      expect(launchBounds!.y + launchBounds!.height).toBeLessThanOrEqual(height);

      await launch.click();
      await expect(page).toHaveURL(/\/play\?seed=0421&mission=0/);
    }
  });

  test("keeps battlefield pause controls usable at 1280x600", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.goto("/play?seed=0421&mission=0");
    await expect(page.getByTestId("command-sidebar")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.keyboard.press("Escape");
    const pause = page.getByRole("dialog", { name: "Game paused" });
    await expect(pause).toBeVisible();
    await expect(pause.getByRole("button", { name: "Resume Mission" })).toBeVisible();
    const pauseBounds = await pause.boundingBox();
    expect(pauseBounds).not.toBeNull();
    expect(pauseBounds!.y).toBeGreaterThanOrEqual(0);
    expect(pauseBounds!.y + pauseBounds!.height).toBeLessThanOrEqual(600);
  });

  test("keeps the tutorial overlay inside a short landscape viewport", async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 400 });
    await page.goto("/tutorial");
    const tutorial = page.getByTestId("tutorial-overlay");
    await expect(tutorial).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const tutorialBounds = await tutorial.boundingBox();
    expect(tutorialBounds).not.toBeNull();
    expect(tutorialBounds!.y).toBeGreaterThanOrEqual(0);
    expect(tutorialBounds!.y + tutorialBounds!.height).toBeLessThanOrEqual(400);
    await expect(tutorial.getByText("Waiting for your action")).toBeVisible();
  });
});

test.describe("mission briefing responsive layout", () => {
  for (const viewport of [
    { width: 390, height: 844, name: "phone portrait" },
    { width: 375, height: 667, name: "short phone portrait" },
    { width: 320, height: 568, name: "small phone portrait" },
    { width: 844, height: 390, name: "phone landscape" },
    { width: 1280, height: 720, name: "desktop" },
  ]) {
    test(`keeps allies, briefing, and enemy in desktop order at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/briefing?seed=0421&mission=0");
      const screen = page.getByTestId("briefing-screen");
      await expect(screen).toBeVisible();

      const layout = await screen.evaluate((element) => {
        const inner = element.firstElementChild;
        if (!inner) throw new Error("Briefing layout wrapper is missing");
        const [mast, allies, panel, enemy] = Array.from(inner.children);
        const rect = (node: Element | undefined) => {
          const bounds = node?.getBoundingClientRect();
          return bounds ? { x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom, width: bounds.width } : null;
        };
        const cards = Array.from(element.querySelectorAll('[data-testid="briefing-portrait"]'))
          .map((canvas) => rect(canvas.parentElement ?? undefined)?.width ?? 0);
        const allyRect = rect(allies);
        const panelRect = rect(panel);
        const enemyRect = rect(enemy);
        return {
          bodyOverflow: document.documentElement.scrollWidth > window.innerWidth,
          mast: rect(mast),
          allies: allyRect,
          panel: panelRect,
          enemy: enemyRect,
          desktopOrder: Boolean(
            allyRect && panelRect && enemyRect
              && allyRect.x < panelRect.x
              && panelRect.x < enemyRect.x
              && Math.abs(allyRect.y - panelRect.y) <= 1
              && Math.abs(panelRect.y - enemyRect.y) <= 1,
          ),
          cards,
        };
      });

      expect(layout.bodyOverflow).toBe(false);
      expect(layout.desktopOrder).toBe(true);
      expect(layout.cards).toHaveLength(3);
      expect(Math.max(...layout.cards) - Math.min(...layout.cards)).toBeLessThanOrEqual(1);
    });
  }

  test("keeps the primary briefing action docked when transmission is skipped", async ({ page }) => {
    for (const viewport of [
      { width: 1280, height: 720 },
      { width: 700, height: 400 },
      { width: 390, height: 844 },
      { width: 320, height: 568 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/briefing?seed=0421&mission=0");

      const launch = page.getByRole("button", { name: "Launch" });
      const skip = page.getByRole("button", { name: "Skip transmission" });
      await expect(skip).toBeVisible();
      const before = await launch.boundingBox();
      if (!before) throw new Error("Launch button has no layout box before skipping");

      await skip.click();
      const after = await launch.boundingBox();
      if (!after) throw new Error("Launch button has no layout box after skipping");

      expect(after.x).toBeCloseTo(before.x, 1);
      expect(after.y).toBeCloseTo(before.y, 1);
      const actions = await page.getByTestId("briefing-actions").boundingBox();
      if (!actions) throw new Error("Briefing actions have no layout box");
      expect(after.x + after.width).toBeCloseTo(actions.x + actions.width, 1);
    }
  });
});

test.describe("selected unit actions", () => {
  test("refreshes stance and formation after clicking selected actions", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/play?seed=0421&mission=0");
    await waitForBattlefield(page);

    const state = createMission({ seed: TEST_SEED, missionIndex: 0 });
    const infantryEntity = playerUnits(state).find((entity) => entity.kind === "infantry");
    if (!infantryEntity) throw new Error("Mission has no player infantry");
    const infantry = await pointForEntity(page, infantryEntity);
    await page.mouse.click(infantry.x, infantry.y);

    await waitForStableSelection(page);
    await page.getByTestId("mobile-command-toggle").click();
    const sidebar = page.getByTestId("command-sidebar");
    await sidebar.getByRole("tab", { name: "Selected" }).click();
    await expect(sidebar.getByTestId("selected-kind")).toBeVisible();

    const unitOrders = sidebar;
    const hold = unitOrders.getByTestId("selected-action-stance-hold");
    await expect(hold).toHaveAttribute("aria-pressed", "false");
    await hold.click();
    await expect(hold).toHaveAttribute("aria-pressed", "true");
    await expect(sidebar.getByText("Stance Hold", { exact: true })).toBeVisible();

    const wedge = unitOrders.getByTestId("selected-action-formation-wedge");
    await expect(wedge).toHaveAttribute("aria-pressed", "false");
    await wedge.click();
    await expect(wedge).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("desktop marquee selection", () => {
  test("keeps units selected across an edge-scrolled drag", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const state = createMission({ seed: TEST_SEED, missionIndex: 0 });
    setHeight(state, 12, 12, 0);
    setHeight(state, 24, 0, 0);
    const anchorUnit = addUnit(state, 0, "infantry", 12, 12);
    addUnit(state, 0, "tank", 24, 0);
    const save = JSON.stringify({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      savedAt: Date.now(),
      state,
    });
    await page.addInitScript(({ saveStorageKey, saveRaw }) => {
      localStorage.setItem(saveStorageKey, saveRaw);
    }, {
      saveStorageKey: saveKey(TEST_SEED),
      saveRaw: save,
    });
    await page.goto(`/play?seed=${String(TEST_SEED).padStart(4, "0")}&mission=0&resume=1`);
    await waitForBattlefield(page);

    const { dimensions, bounds, camera } = await pageCamera(page, state);
    const anchorPoint = tileToScreen(anchorUnit.x, anchorUnit.y, camera, heightAt(state, anchorUnit.x, anchorUnit.y));
    const start = canvasCssPoint({
      x: anchorPoint.x - 18,
      y: anchorPoint.y + (TILE_H / 2) * camera.zoom - 12 * camera.zoom - 24,
    }, bounds, dimensions);
    const end = {
      x: bounds.x + bounds.width - 4,
      y: start.y + 96,
    };

    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    await page.waitForTimeout(2_500);
    await page.mouse.move(end.x, end.y);
    await page.mouse.up();

    await expect(page.getByTestId("selected-panel")).toContainText("2 units selected");
  });
});

test.describe("mobile-first layouts", () => {
  for (const viewport of [
    { width: 390, height: 844, name: "phone portrait" },
    { width: 375, height: 667, name: "short phone portrait" },
    { width: 320, height: 568, name: "small phone portrait" },
    { width: 700, height: 400, name: "narrow phone landscape" },
    { width: 844, height: 390, name: "phone landscape" },
  ]) {
    test(`keeps the battlefield usable at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/play?seed=0421&mission=0");
      await expect(page.getByTestId("battlefield-canvas")).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const canvas = page.getByTestId("battlefield-canvas");
      const canvasBounds = await canvas.boundingBox();
      expect(canvasBounds).not.toBeNull();
      expect(canvasBounds!.x).toBeGreaterThanOrEqual(0);
      expect(canvasBounds!.y).toBeGreaterThanOrEqual(0);
      expect(canvasBounds!.x + canvasBounds!.width).toBeLessThanOrEqual(viewport.width);
      expect(canvasBounds!.y + canvasBounds!.height).toBeLessThanOrEqual(viewport.height);

      if (viewport.height > viewport.width) {
        const launcher = page.getByTestId("mobile-command-launcher");
        await expect(launcher).toBeVisible();
        const launcherBounds = await launcher.boundingBox();
        expect(launcherBounds).not.toBeNull();
        expect(launcherBounds!.y + launcherBounds!.height).toBeLessThanOrEqual(viewport.height);
        const sidebar = page.getByTestId("command-sidebar");
        await expect(sidebar).not.toBeVisible();
        await expect(sidebar).toHaveAttribute("aria-hidden", "true");
        await expect(sidebar).toHaveAttribute("inert", "");
      } else {
        const sidebar = page.getByTestId("command-sidebar");
        await expect(sidebar).toBeVisible();
        const sidebarBounds = await sidebar.boundingBox();
        expect(sidebarBounds).not.toBeNull();
        expect(sidebarBounds!.x + sidebarBounds!.width).toBeLessThanOrEqual(viewport.width);
      }
      await expect(page.getByTestId("mobile-touch-controls")).toHaveCount(1);
    });
  }

  test("opens and closes the command panel without reserving map space", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/play?seed=0421&mission=0");

    const launcher = page.getByTestId("mobile-command-launcher");
    const canvas = page.getByTestId("battlefield-canvas");
    const closedCanvasBounds = await canvas.boundingBox();
    expect(closedCanvasBounds).not.toBeNull();
    // WebKit can round viewport units to fractional CSS pixels.
    expect(closedCanvasBounds!.width).toBeCloseTo(390, 0);
    expect(closedCanvasBounds!.height).toBeCloseTo(844, 0);

    await launcher.getByTestId("mobile-command-toggle").click();
    const panel = page.getByTestId("command-sidebar");
    await expect(panel).toBeVisible();
    await expect(panel).not.toHaveAttribute("aria-hidden");
    await expect(panel).not.toHaveAttribute("inert");
    await expect(page.getByTestId("mobile-command-scrim")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const panelBounds = await panel.boundingBox();
    expect(panelBounds).not.toBeNull();
    expect(panelBounds!.x).toBeGreaterThanOrEqual(0);
    expect(panelBounds!.x + panelBounds!.width).toBeLessThanOrEqual(390);
    await expect(panel.getByTestId("mobile-touch-controls")).toBeVisible();
    await expect(panel.getByRole("tab", { name: "Construction" })).toBeVisible();

    await launcher.getByTestId("mobile-command-toggle").click();
    await expect(panel).not.toBeVisible();
    await launcher.getByTestId("mobile-command-toggle").click();
    await expect(panel).toBeVisible();
    await page.getByTestId("mobile-command-scrim").click({ position: { x: 12, y: 96 } });
    await expect(panel).not.toBeVisible();
  });

  test("caps the portrait command sidebar and keeps its items proportional", async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 730, height: 909 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto("/play?seed=0421&mission=0&fresh=1");

      const launcher = page.getByTestId("mobile-command-toggle");
      await expect(launcher).toBeVisible();
      await launcher.click();

      const sidebar = page.getByTestId("command-sidebar");
      await expect(sidebar).toBeVisible();
      const layout = await sidebar.evaluate((element) => {
        const bounds = (node: Element) => {
          const rect = node.getBoundingClientRect();
          return { right: rect.right, width: rect.width, height: rect.height };
        };
        const cards = Array.from(element.querySelectorAll("[data-testid='build-progress'] button[aria-label*='credits']"));
        const tabs = element.querySelector("[role='toolbar']");
        return {
          sidebar: bounds(element),
          tabs: tabs ? Array.from(tabs.children).map(bounds) : [],
          cards: cards.map((card) => ({
            card: bounds(card),
            art: card.firstElementChild ? bounds(card.firstElementChild) : null,
            canvas: (() => {
              const canvas = card.querySelector("canvas");
              if (!(canvas instanceof HTMLCanvasElement)) return null;
              const rect = canvas.getBoundingClientRect();
              return {
                backingWidth: canvas.width,
                backingHeight: canvas.height,
                cssWidth: rect.width,
                cssHeight: rect.height,
                imageRendering: getComputedStyle(canvas).imageRendering,
              };
            })(),
          })),
          documentWidth: document.documentElement.scrollWidth,
        };
      });

      expect(layout.sidebar.width).toBeLessThanOrEqual(viewport.width);
      expect(layout.sidebar.width).toBeGreaterThan(0);
      expect(layout.sidebar.right).toBeLessThanOrEqual(viewport.width);
      expect(layout.documentWidth).toBeLessThanOrEqual(viewport.width);
      expect(layout.cards).toHaveLength(5);

      const cardWidths = layout.cards.map(({ card }) => card.width);
      expect(Math.max(...cardWidths) - Math.min(...cardWidths)).toBeLessThanOrEqual(1);
      for (const { art, canvas } of layout.cards) {
        expect(art).not.toBeNull();
        expect(art!.width / art!.height).toBeCloseTo(80 / 56, 2);
        expect(canvas).not.toBeNull();
        expect(canvas!.backingWidth).toBeGreaterThanOrEqual(canvas!.cssWidth);
        expect(canvas!.backingHeight).toBeGreaterThanOrEqual(canvas!.cssHeight);
        expect(canvas!.imageRendering).toBe("auto");
      }

      const tabWidths = layout.tabs.map(({ width }) => width);
      expect(tabWidths).toHaveLength(5);
      expect(Math.max(...tabWidths) - Math.min(...tabWidths)).toBeLessThanOrEqual(1);
    }
  });

  test("keeps the compact mobile launcher focused on commands", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/play?seed=0421&mission=0");

    await expect(page.getByTestId("mobile-pause")).toHaveCount(0);
    await expect(page.getByTestId("mobile-command-launcher")).toBeVisible();
  });

  test("exposes the bottom command sheet for a selected base", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/play?seed=0421&mission=0");
    await waitForBattlefield(page);

    const yard = await pointForTile(page, 8, 7);
    await dispatchTouch(page, "pointerdown", yard);
    await dispatchTouch(page, "pointerup", yard);
    await page.getByTestId("mobile-command-toggle").click();
    await expect(page.getByTestId("command-sidebar").getByTestId("mobile-touch-controls")).toBeVisible();
  });

  test("supports touch panning and direct commands for a selected unit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/play?seed=${String(TEST_SEED).padStart(4, "0")}&mission=0`);
    await waitForBattlefield(page);

    const state = createMission({ seed: TEST_SEED, missionIndex: 0 });
    const infantryEntity = playerUnits(state).find((entity) => entity.kind === "infantry");
    if (!infantryEntity) throw new Error("Mission has no player infantry");
    const infantry = await pointForEntity(page, infantryEntity);
    await dispatchTouch(page, "pointerdown", infantry);
    await dispatchTouch(page, "pointerup", infantry);
    await page.mouse.click(infantry.x, infantry.y);
    await waitForStableSelection(page);

    const dragStart = { x: 90, y: 650 };
    await dispatchTouch(page, "pointerdown", dragStart);
    await dispatchTouch(page, "pointermove", { x: 155, y: 650 });
    await dispatchTouch(page, "pointerup", { x: 155, y: 650 });
    await waitForStableSelection(page);

    const orderPoint = { x: 300, y: 600 };
    await dispatchTouch(page, "pointerdown", orderPoint);
    await dispatchTouch(page, "pointerup", orderPoint);
    // Ground commands for combat units are attack-move orders so they keep
    // advancing while engaging threats along the route.
    await expect.poll(() => persistedUnitOrder(page, infantryEntity.id)).toMatchObject({ orderMode: "attackMove" });
  });

  test("uses two fingers for marquee selection instead of camera zoom", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/play?seed=${String(TEST_SEED).padStart(4, "0")}&mission=0&fresh=1`);
    await waitForBattlefield(page);

    const state = createMission({ seed: TEST_SEED, missionIndex: 0 });
    const infantryEntity = playerUnits(state).find((entity) => entity.kind === "infantry");
    if (!infantryEntity) throw new Error("Mission has no player infantry");
    const infantry = await pointForEntity(page, infantryEntity);
    const start = { x: infantry.x - 60, y: infantry.y - 60 };
    const end = { x: infantry.x + 60, y: infantry.y + 60 };

    await dispatchTouch(page, "pointerdown", start, 1);
    await dispatchTouch(page, "pointerdown", end, 2);
    await dispatchTouch(page, "pointermove", end, 2);
    await dispatchTouch(page, "pointerup", start, 1);
    await dispatchTouch(page, "pointerup", end, 2);
    await waitForStableSelection(page);

    await page.getByTestId("mobile-command-toggle").click();
    await page.getByTestId("tab-selected").click();
    await expect(page.getByTestId("selected-panel")).toContainText("Health");
  });

  test("keeps tutorial controls above the battlefield and reachable on small phones", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/tutorial");
    const tutorial = page.getByTestId("tutorial-overlay");
    await expect(tutorial).toBeVisible();
    await expect(page.getByTestId("mobile-command-launcher")).toBeVisible();
    await page.getByTestId("mobile-command-toggle").click();
    await expect(page.getByTestId("command-sidebar")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    const bounds = await tutorial.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(568);
    await expect(tutorial.getByText("Waiting for your action")).toBeVisible();
    await expect(tutorial.getByRole("button", { name: "Exit Training" })).toBeVisible();
  });

  test("keeps menu and briefing actions reachable on small phones", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/");
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "LOAD MISSION" }).click();
    await expect(page.getByTestId("campaign-archive")).toBeVisible();
    await expect(page.getByRole("button", { name: "IMPORT SAVE" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
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

    await page.getByRole("button", { name: "NEW GAME" }).click();
    await expectNoHorizontalOverflow(page);
    await expect(page.getByTestId("deploy-screen")).toBeVisible();
    await expect(page.getByLabel("Four digit campaign code")).toBeVisible();
    const mobileCampaignLayout = await page.getByTestId("deploy-screen").evaluate((dialog) => {
      const codePane = dialog.querySelector<HTMLElement>('[data-testid="campaign-code-pane"]');
      const infoPane = dialog.querySelector<HTMLElement>('[data-testid="campaign-info-pane"]');
      if (!codePane || !infoPane) throw new Error("Missing campaign panes");
      const codeRect = codePane.getBoundingClientRect();
      const infoRect = infoPane.getBoundingClientRect();
      return {
        code: { top: codeRect.top, bottom: codeRect.bottom, left: codeRect.left, right: codeRect.right },
        info: { top: infoRect.top, bottom: infoRect.bottom, left: infoRect.left, right: infoRect.right },
      };
    });
    expect(mobileCampaignLayout.code.bottom).toBeLessThanOrEqual(mobileCampaignLayout.info.top + 1);
    expect(mobileCampaignLayout.code.left).toBeGreaterThanOrEqual(0);
    expect(mobileCampaignLayout.code.right).toBeLessThanOrEqual(320);
    expect(mobileCampaignLayout.info.left).toBeGreaterThanOrEqual(0);
    expect(mobileCampaignLayout.info.right).toBeLessThanOrEqual(320);
    await page.getByTestId("campaign-info-pane").getByRole("button", { name: "Start" }).scrollIntoViewIfNeeded();
    await expect(page.getByTestId("campaign-info-pane").getByRole("button", { name: "Start" })).toBeVisible();

    await page.goto("/briefing?seed=0421&mission=0");
    await expect(page.getByTestId("briefing-actions")).toBeVisible();
    await page.getByRole("button", { name: "Launch" }).scrollIntoViewIfNeeded();
    const launch = page.getByRole("button", { name: "Launch" });
    const launchBounds = await launch.boundingBox();
    expect(launchBounds).not.toBeNull();
    expect(launchBounds!.x).toBeGreaterThanOrEqual(0);
    expect(launchBounds!.x + launchBounds!.width).toBeLessThanOrEqual(320);
    await expect(page.getByRole("button", { name: "Back to menu" })).toBeVisible();
  });

  test("keeps named archive portability actions inside the phone viewport", async ({ page }) => {
    const state = createMission({ seed: TEST_SEED, missionIndex: 0 });
    const raw = JSON.stringify({
      version: SLOT_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      savedAt: Date.now(),
      name: "Bridgehead",
      state,
      campaign: freshCampaignProgress(TEST_SEED),
    });
    await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
      key: slotKey("mobile001"),
      value: raw,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/load");

    const exportButton = page.getByRole("button", { name: "Export save slot Bridgehead" });
    const deleteButton = page.getByRole("button", { name: "Delete save slot Bridgehead" });
    await expect(exportButton).toBeVisible();
    await expect(deleteButton).toBeVisible();
    await expectNoHorizontalOverflow(page);
    for (const button of [exportButton, deleteButton]) {
      const bounds = await button.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    }
  });

  test("places welcome previews below the menu on phones", async ({ page }) => {
    const shortPhone = await expectWelcomePreviewsBelowMenu(page, { width: 320, height: 568 });
    expect(shortPhone.screen.scrollHeight).toBeGreaterThan(shortPhone.screen.clientHeight);

    const expandedLock = page.locator("[data-testid='menu-signal-overlay'] [data-lock][data-expanded='true']");
    await expect(expandedLock).toHaveCount(1, { timeout: 10_000 });
    const expandedBounds = await expandedLock.boundingBox();
    expect(expandedBounds).not.toBeNull();
    expect(expandedBounds!.x).toBeGreaterThanOrEqual(0);
    expect(expandedBounds!.x + expandedBounds!.width).toBeLessThanOrEqual(320);

    const scrollState = await page.locator("[class*='screen']").evaluate((element) => {
      const screen = element as HTMLElement;
      screen.scrollTo({ top: screen.scrollHeight, behavior: "instant" });
      return {
        scrollTop: screen.scrollTop,
        clientHeight: screen.clientHeight,
        scrollHeight: screen.scrollHeight,
      };
    });
    expect(scrollState.scrollTop).toBeGreaterThan(0);
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);

    await expectWelcomePreviewsBelowMenu(page, { width: 390, height: 844 });
    await expectNoHorizontalOverflow(page);
  });

  test("preserves selection through rotation and cancels the open portrait panel", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/play?seed=${String(TEST_SEED).padStart(4, "0")}&mission=0`);
    await waitForBattlefield(page);

    const state = createMission({ seed: TEST_SEED, missionIndex: 0 });
    const infantryEntity = playerUnits(state).find((entity) => entity.kind === "infantry");
    if (!infantryEntity) throw new Error("Mission has no player infantry");
    const infantry = await pointForEntity(page, infantryEntity);
    await page.mouse.click(infantry.x, infantry.y);
    await waitForStableSelection(page);

    await page.getByTestId("mobile-command-toggle").click();
    await expect(page.getByTestId("command-sidebar")).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("orientationchange")));
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByTestId("mobile-command-launcher")).not.toBeVisible();
    await expect(page.getByTestId("command-sidebar")).toBeVisible();
    const selectedTab = page.getByTestId("command-sidebar").getByTestId("tab-selected");
    await expect(selectedTab).toBeVisible();
    await selectedTab.click();
    await expect(page.getByTestId("selected-kind")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("mobile-command-launcher")).toBeVisible();
    await expect(page.getByTestId("command-sidebar")).not.toBeVisible();
  });

  test("guards browser Back in a live mission and preserves briefing Back destinations", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openBriefingSkippingTutorial(page);
    await page.getByRole("button", { name: "Launch" }).click();
    await expect(page).toHaveURL(/\/play\?seed=0421&mission=0/);
    await waitForBattlefield(page);

    await page.evaluate(() => window.history.back());
    const confirmation = page.getByRole("dialog", { name: "Leave mission?" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Cancel" }).click();
    await expect(page).toHaveURL(/\/play\?seed=0421&mission=0/);

    await page.evaluate(() => window.history.back());
    await expect(confirmation).toBeVisible();
    const leavingAt = await page.evaluate(() => Date.now());
    await confirmation.getByRole("button", { name: "Leave mission" }).click();
    await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0&from=newGame/);
    const savedAt = await page.evaluate(() => {
      const raw = localStorage.getItem("shiftingfront:save:0421");
      return raw ? JSON.parse(raw).savedAt as number : 0;
    });
    expect(savedAt).toBeGreaterThanOrEqual(leavingAt);

    await page.goto("/briefing?seed=0421&mission=0&from=campaign");
    await expect(page.getByRole("button", { name: "Back to operations" })).toBeVisible();
    await page.getByRole("button", { name: "Back to operations" }).click();
    await expect(page).toHaveURL(/\/campaign\?seed=0421/);
  });
});
