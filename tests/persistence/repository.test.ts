import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { SaveRepository } from "@/lib/persist/save/repository";
import { memoryStorage, readSave, writeSave, saveKey, listSlots, readSlot, slotKey } from "@/lib/persist/save";
import { campaignKey, freshCampaignProgress, readCampaignProgress } from "@/lib/persist/campaign";
import { makeFixture } from "@/lib/sim/fixtures";

const repositories: SaveRepository[] = [];
afterEach(() => { repositories.splice(0).forEach((repository) => repository.close()); vi.restoreAllMocks(); });
async function open(storage = memoryStorage(), factory = new IDBFactory()) {
  const repository = new SaveRepository(storage, factory);
  repositories.push(repository);
  await repository.initialize();
  expect(repository.mode).toBe("indexeddb");
  return { repository, storage, factory };
}
const state = () => makeFixture({ seed: 421, win: { kind: "annihilate" } });

describe("transactional save repository", () => {
  it("migrates idempotently, keeps originals, quarantines malformed records and recovers later legacy changes", async () => {
    const storage = memoryStorage({ [saveKey(422)]: "broken" });
    const original = state(); writeSave(storage, original);
    const first = await open(storage);
    expect(readSave(first.repository.storage, 421)?.tick).toBe(0);
    expect(first.repository.storage.getItem(saveKey(422))).toBe("broken");
    original.tick = 10; await first.repository.save(original);
    first.repository.close();
    const second = await open(storage, first.factory);
    expect(listSlots(second.repository.storage)).toHaveLength(0);
    second.repository.close();
    original.tick = 5; writeSave(storage, original);
    const third = await open(storage, first.factory);
    expect(readSave(third.repository.storage, 421)?.tick).toBe(10);
    expect(listSlots(third.repository.storage)).toHaveLength(1);
    expect(storage.getItem(saveKey(421))).not.toBeNull();
  });
  it("captures mutable states before waiting and serializes session revisions", async () => {
    const { repository } = await open(); const current = state(); const session = repository.createSession(421);
    const first = session.write(current, "implicit"); current.tick = 30;
    const second = session.write(current, "implicit"); current.tick = 90;
    expect(await first).toBe("saved"); expect(await second).toBe("saved");
    expect(readSave(repository.storage, 421)?.tick).toBe(30);
  });
  it("compares revisions inside transactions across independent repositories", async () => {
    const first = await open(); const second = await open(first.storage, first.factory);
    const a = first.repository.createSession(421); const b = second.repository.createSession(421);
    expect(await a.write(state(), "implicit")).toBe("saved");
    expect(await b.write(state(), "implicit")).toBe("conflict");
    expect(await b.write(state(), "explicit")).toBe("saved");
    expect(await a.write(state(), "implicit")).toBe("conflict");
  });
  it("commits terminal progress and autosave together", async () => {
    const { repository } = await open(); const won = state(); won.result = "won";
    expect(await repository.save(won)).toBe("saved");
    expect(readSave(repository.storage, 421)?.result).toBe("won");
    expect(readCampaignProgress(repository.storage, 421).completedMissions).toEqual([0]);
  });
  it("aborts named save, autosave and progress when the transaction fails after a slot write", async () => {
    const { repository } = await open(); const current = state(); await repository.save(current);
    const put = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (this.name === "campaigns") throw new DOMException("quota", "QuotaExceededError");
      return put.apply(this, args);
    });
    current.tick = 120;
    expect(await repository.saveSlot({ name: "Atomic", state: current, campaign: freshCampaignProgress(421) })).toEqual({ ok: false });
    expect(listSlots(repository.storage)).toHaveLength(0);
    expect(readSave(repository.storage, 421)?.tick).toBe(0);
  });
  it("restores progress and autosave atomically and preserves portable exports", async () => {
    const { repository } = await open(); const current = state(); current.tick = 40;
    const saved = await repository.saveSlot({ name: "Earlier", state: current, campaign: { ...freshCampaignProgress(421), unlockedMission: 2 } });
    expect(saved.ok).toBe(true); if (!saved.ok) return;
    const slot = readSlot(repository.storage, saved.id)!;
    current.tick = 100; await repository.save(current);
    expect(await repository.restoreSlot(slot)).toBeNull();
    expect(readSave(repository.storage, 421)?.tick).toBe(40);
    expect(readCampaignProgress(repository.storage, 421).unlockedMission).toBe(2);
    expect((await repository.importSlot(repository.storage.getItem(slotKey(saved.id))!)).ok).toBe(true);
    expect(listSlots(repository.storage)).toHaveLength(2);
  });
  it.each([false, true])("recovers journals without overwriting conflicts (conflict=%s)", async (conflict) => {
    const { repository, storage, factory } = await open(); const current = state(); await repository.save(current);
    current.tick = 60; current.result = "won"; expect(repository.writeJournal(current)).toBe(true);
    if (conflict) { current.tick = 80; await repository.save(current); }
    repository.close(); const next = await open(storage, factory);
    expect(readSave(next.repository.storage, 421)?.tick).toBe(conflict ? 80 : 60);
    expect(listSlots(next.repository.storage)).toHaveLength(conflict ? 1 : 0);
    expect(readCampaignProgress(next.repository.storage, 421).completedMissions).toEqual([0]);
    expect(storage.keys().some((key) => key.includes("journal"))).toBe(false);
  });
  it("invalidates old queued session work when a mission is adopted", async () => {
    const { repository } = await open(); const session = repository.createSession(421);
    const old = session.write(state(), "implicit"); session.adoptCurrent();
    expect(await old).toBe("conflict"); expect(readSave(repository.storage, 421)).toBeNull();
  });
  it("quarantines malformed recovery journals without changing the campaign", async () => {
    const { repository, storage, factory } = await open(); await repository.save(state());
    storage.setItem("shiftingfront:journal:0421", "malformed"); repository.close();
    const next = await open(storage, factory);
    expect(readSave(next.repository.storage, 421)?.tick).toBe(0);
    expect(next.repository.storage.getItem(slotKey("journal0421"))).toBe("malformed");
    expect(await next.repository.remove(slotKey("journal0421"))).toBe(true);
    expect(storage.getItem("shiftingfront:journal:0421")).toBeNull();
  });
  it("can resume an interrupted migration from retained originals", async () => {
    const storage = memoryStorage(); writeSave(storage, state());
    const other = state(); other.seed = 422; writeSave(storage, other);
    const factory = new IDBFactory(); const put = IDBObjectStore.prototype.put; let records = 0;
    const failed = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (this.name === "campaigns" && ++records === 2) { this.transaction.abort(); throw new Error("Interrupted migration"); }
      return put.apply(this, args);
    });
    const repository = new SaveRepository(storage, factory); repositories.push(repository); await repository.initialize();
    expect(repository.mode).toBe("legacy"); failed.mockRestore(); repository.close();
    const resumed = await open(storage, factory);
    expect(readSave(resumed.repository.storage, 421)).not.toBeNull(); expect(readSave(resumed.repository.storage, 422)).not.toBeNull();
    expect(listSlots(resumed.repository.storage)).toHaveLength(0);
  });
  it("clears both backends, journals and migration metadata", async () => {
    const storage = memoryStorage(); writeSave(storage, state()); const { repository, factory } = await open(storage);
    repository.writeJournal(state()); expect(await repository.clear()).toBe(true);
    expect(storage.keys()).toEqual([]); expect(repository.storage.keys()).toEqual([]);
    repository.close(); expect((await open(storage, factory)).repository.storage.keys()).toEqual([]);
  });
  it("reports failed legacy writes and exposes reduced reliability", async () => {
    const storage = memoryStorage(); const broken = { ...storage, setItem() { throw new Error("quota"); } };
    const repository = new SaveRepository(broken, undefined); repositories.push(repository); await repository.initialize();
    expect(repository.notice).toContain("reduced"); expect(await repository.save(state())).toBe("failed");
    expect(storage.getItem(saveKey(421))).toBeNull(); expect(storage.getItem(campaignKey(421))).toBeNull();
  });
});
