import type { Page } from "@playwright/test";

export async function readCampaignRecord(page: Page, seed: number) {
  return page.evaluate(async (seed) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const opening = indexedDB.open("shiftingfront-saves"); opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    try { return await new Promise<{ seed: number; revision: number; autosave: string | null; progress: string | null } | null>((resolve, reject) => {
      const request = db.transaction("campaigns").objectStore("campaigns").get(seed);
      request.onsuccess = () => resolve(request.result ?? null); request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
  }, seed);
}

/** Replace a fixture as another tab would, then wait for the subscribed UI cache. */
export async function replaceCampaignSave(page: Page, seed: number, autosave: string) {
  await page.evaluate(async ({ seed, autosave }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const opening = indexedDB.open("shiftingfront-saves"); opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("campaigns", "readwrite"); const store = tx.objectStore("campaigns"); const get = store.get(seed);
      get.onsuccess = () => store.put({ seed, revision: (get.result?.revision ?? 0) + 1, autosave, progress: get.result?.progress ?? null });
      tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    }); db.close();
    const channel = new BroadcastChannel("shiftingfront-save-revisions"); channel.postMessage({ type: "committed" }); channel.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }, { seed, autosave });
}

export async function savedSlotCount(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const opening = indexedDB.open("shiftingfront-saves"); opening.onsuccess = () => resolve(opening.result); opening.onerror = () => reject(opening.error); });
    try { return await new Promise<number>((resolve, reject) => {
      const request = db.transaction("slots").objectStore("slots").count(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    }); } finally { db.close(); }
  });
}
