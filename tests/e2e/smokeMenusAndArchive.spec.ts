import { expect, type Locator, test } from "@playwright/test";
import { PREVIEW_CYCLE_MS } from "../../components/shared/ambient/menuBackdropSim/cycle";
import { BUILDING_KINDS } from "../../lib/catalog";
import { listGeneratedAssets } from "../../lib/gen/assetCatalog";
import { slotKey } from "../../lib/persist/save";
import { SETTINGS_KEY, SETTINGS_VERSION } from "../../lib/persist/settings";
import { replaceCampaignSave, savedSlotCount } from "./saveRepositoryHelpers";
import { deployToBattlefield, distinctiveSave, saveEnvelope, slotEnvelope } from "./smokeHelpers";

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

test("opens the operations map and launches an available mission", async ({ page }) => {
  await page.goto("/campaign?seed=0421");

  await expect(page.getByRole("heading", { name: "Operations map" })).toBeVisible();
  await expect(page.getByTestId("mission-card-0")).toContainText("Available");
  await expect(page.getByTestId("mission-card-2")).toContainText("Locked");

  await page.getByTestId("mission-card-0").click();
  await expect(page.getByTestId("mission-detail")).toContainText("Primary requirements");
  await expect(page.getByTestId("mission-detail")).toContainText("Time limit");
  await expect(page.getByTestId("mission-detail")).toContainText("15 min");
  await page.getByTestId("launch-selected-mission").click();
  await expect(page).toHaveURL(/\/briefing\?seed=0421&mission=0/);
});

test("returns from the operations map with Escape", async ({ page }) => {
  await page.goto("/campaign?seed=0421");

  await expect(page.getByRole("heading", { name: "Operations map" })).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page).toHaveURL(/\/$/);
});

test("keeps the unified menu and operations chrome inside the desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "SHIFTING" })).toBeVisible();
  await expect(page.getByText("Shifting Front", { exact: true })).toHaveCount(0);
  await expect(page.locator("header").getByText("SHIFTING FRONT")).toHaveCount(0);
  await expect(page.getByTestId("menu-dashboard")).toBeVisible();
  await expect(page.getByTestId("menu-signal-overlay")).toBeAttached();
  await expect(page.getByRole("navigation", { name: "Main menu" })).toBeVisible();
  await expect(
    page.getByTestId("menu-dashboard").getByRole("button", { name: "IMPORT SAVE" }),
  ).toHaveCount(0);

  const expandedLock = page.locator("[data-lock][data-expanded='true']");
  await expect(expandedLock).toHaveCount(1, { timeout: 10_000 });
  await expect(expandedLock).toHaveAttribute("data-render-mode", "gameplay");
  const firstScenario = await expandedLock.getAttribute("data-scenario");
  expect(firstScenario).toBeTruthy();
  await expect(expandedLock.locator("canvas")).toBeAttached();
  await expect.poll(() => canvasInk(expandedLock.locator("canvas"))).toBeGreaterThan(0);

  const nextExpandedLock = page.locator("[data-lock][data-expanded='true']");
  await expect
    .poll(
      async () => {
        const scenario = await nextExpandedLock.getAttribute("data-scenario");
        return scenario ?? firstScenario;
      },
      { timeout: PREVIEW_CYCLE_MS + 10_000 },
    )
    .not.toBe(firstScenario);
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
    const overlapX =
      lockBox!.x < otherBox!.x + otherBox!.width && lockBox!.x + lockBox!.width > otherBox!.x;
    const overlapY =
      lockBox!.y < otherBox!.y + otherBox!.height && lockBox!.y + lockBox!.height > otherBox!.y;
    expect(overlapX && overlapY).toBe(false);
  }

  const menuOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
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
    const copy = codePane?.querySelector<HTMLButtonElement>('[data-testid="copy-campaign-link"]');
    const start = infoPane?.querySelector("button");
    if (!codePane || !infoPane || !roll || !thisWeek || !copy || !start)
      throw new Error("Missing campaign pane or action");
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
  expect(
    Math.max(...campaignLayout.actionHeights) - Math.min(...campaignLayout.actionHeights),
  ).toBeLessThanOrEqual(1);

  const deployOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(deployOverflow).toBe(false);

  await page.goto("/campaign?seed=0421");
  await expect(page.getByRole("heading", { name: "Operations map" })).toBeVisible();

  const operationsOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
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
      if (overflowY === "auto" || overflowY === "scroll")
        containers.push(current.tagName.toLowerCase());
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
  await page.addInitScript(
    ({ key, raw: slotRaw }) => {
      localStorage.setItem(key, slotRaw);
    },
    { key: slotKey(slotId), raw },
  );

  await page.goto("/load");
  await expect(page.getByRole("button", { name: "Export save slot Bridgehead" })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export save slot Bridgehead" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("shiftingfront-0421-Bridgehead.json");

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "IMPORT JSON" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "bridgehead.json",
    mimeType: "application/json",
    buffer: Buffer.from(raw),
  });

  await expect(page.getByRole("button", { name: "Resume Bridgehead" })).toHaveCount(2);
  expect(await savedSlotCount(page)).toBe(2);
});

test("keeps Asset Bay selection synchronized with category filters", async ({ page }) => {
  await page.goto("/assets");

  const browser = page.getByTestId("assets-browser");
  const list = browser.getByRole("listbox");
  await expect(list.getByRole("option")).toHaveCount(listGeneratedAssets().length);

  await browser.getByRole("button", { name: "Buildings" }).click();
  await expect(browser.getByRole("button", { name: "Buildings" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
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
  await expect(page.getByRole("button", { name: "Commanders" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("button", { name: "All roles" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect(page.getByRole("heading", { name: "Commanders" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Advisors" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Enemy leaders" })).toHaveCount(0);

  await page.getByRole("button", { name: "All roles" }).click();
  await expect(page.getByRole("heading", { name: "Advisors" })).toBeVisible();
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
  await expect(
    page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "{}"), SETTINGS_KEY),
  ).resolves.toMatchObject({
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

test("scrolls game options menu correctly without cutting off top at reduced vertical resolution", async ({
  page,
}) => {
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

test("does not expose soundtrack download controls from pause and mission result screens", async ({
  page,
}) => {
  await deployToBattlefield(page);
  await expect(page.getByTestId("command-sidebar")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("pause-menu")).toBeVisible();
  await expect(page.getByRole("button", { name: "Soundtrack", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Options", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume Mission" }).click();

  const state = distinctiveSave("won");
  await replaceCampaignSave(page, 421, saveEnvelope(state));
  await page.goto("/play?seed=0421&resume=1");
  await expect(page.getByTestId("mission-result")).toBeVisible();
  await expect(page.getByRole("button", { name: "Soundtrack", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Mission soundtrack" })).toHaveCount(0);
});
