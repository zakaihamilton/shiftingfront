import { expect, test } from "@playwright/test";
import { createMission } from "../../lib/sim/api";
import { memoryStorage, writeSave, saveKey } from "../../lib/persist/save";
import { readCampaignRecord, savedSlotCount } from "./saveRepositoryHelpers";
import { waitForBattlefield } from "./battlefieldReady";

async function seedCampaign(page: import("@playwright/test").Page) {
  const state = createMission({ seed: 421, missionIndex: 0 }); state.tick = 120; state.credits[0] = 9876;
  const storage = memoryStorage(); writeSave(storage, state);
  await page.addInitScript(({ key, raw }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, raw); }, { key: saveKey(421), raw: storage.getItem(saveKey(421))! });
}
async function nameSave(page: import("@playwright/test").Page, name: string) {
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: "Save Mission" }).click();
  await page.getByLabel("Save slot name").fill(name); await page.getByRole("button", { name: "Save", exact: true }).click();
}

test("migrates legacy campaign and commits a named slot with its autosave", async ({ page }) => {
  await seedCampaign(page); await page.goto("/play?seed=0421&mission=0&resume=1"); await waitForBattlefield(page);
  expect((await readCampaignRecord(page, 421))?.revision).toBeGreaterThan(0);
  await nameSave(page, "Transactional"); await expect(page.getByRole("status")).toContainText("Saved “Transactional”");
  expect(await savedSlotCount(page)).toBe(1);
  const record = await readCampaignRecord(page, 421); expect(JSON.parse(record!.autosave!).state.credits[0]).toBe(9876);
  await page.reload(); await waitForBattlefield(page); await expect(page.getByTestId("credits")).toHaveText("9,876");
  expect(await page.evaluate(() => localStorage.getItem("shiftingfront:save:0421"))).not.toBeNull();
});

test("an aborted named-save transaction leaves slot and autosave unchanged", async ({ page }) => {
  await seedCampaign(page); await page.goto("/play?seed=0421&mission=0&resume=1"); await waitForBattlefield(page);
  const before = await readCampaignRecord(page, 421);
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
      if (this.name === "campaigns") { this.transaction.abort(); IDBObjectStore.prototype.put = original; throw new DOMException("Injected quota failure", "QuotaExceededError"); }
      return original.apply(this, args);
    };
  });
  await nameSave(page, "Aborted"); await expect(page.getByRole("status")).toContainText("Couldn't save");
  expect(await savedSlotCount(page)).toBe(0); expect(await readCampaignRecord(page, 421)).toEqual(before);
});

test("unavailable IndexedDB exposes fallback and still loads legacy saves", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "indexedDB", { value: undefined }));
  await seedCampaign(page); await page.goto("/play?seed=0421&mission=0&resume=1"); await waitForBattlefield(page);
  await expect(page.getByText(/Using legacy browser saves/)).toBeVisible(); await expect(page.getByTestId("credits")).toHaveText("9,876");
});

test("terrain worker loading failure keeps the battlefield playable with sliced fallback", async ({ page }) => {
  await seedCampaign(page);
  await page.addInitScript(() => {
    const OriginalWorker = Worker;
    window.Worker = class extends OriginalWorker {
      constructor(url: string | URL, options?: WorkerOptions) { super(url, options); window.setTimeout(() => this.dispatchEvent(new Event("error")), 0); }
    };
  });
  await page.goto("/play?seed=0421&mission=0&resume=1&perf=1"); await waitForBattlefield(page);
  await expect(page.getByTestId("battlefield-canvas")).toHaveAttribute("data-perf-terrain-ready", "true", { timeout: 15_000 });
});
