import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { SAVE_DATABASE_NAME, SaveRepository } from "@/lib/persist/save/repository";
import { memoryStorage, readSave, writeSave, saveKey, listSlots, readSlot, slotKey, writeSlot } from "@/lib/persist/save";
import { campaignKey, freshCampaignProgress, readCampaignProgress, writeCampaignProgress } from "@/lib/persist/campaign";
import { JOURNAL_PREFIX } from "@/lib/persist/rulesRetirement";
import { addBuilding, makeFixture } from "@/lib/sim/fixtures";

const repositories: SaveRepository[] = [];
afterEach(() => { repositories.splice(0).forEach((repository) => repository.close()); vi.restoreAllMocks(); });
async function open(storage = memoryStorage(), factory = new IDBFactory()) {
  const repository = new SaveRepository(storage, factory);
  repositories.push(repository);
  await repository.initialize();
  expect(repository.mode).toBe("indexeddb");
  return { repository, storage, factory };
}
const state = () => {
  const next = makeFixture({ seed: 421, win: { kind: "annihilate" } });
  next.gameplayRulesVersion = 2;
  return next;
};
async function replaceCampaignProgress(factory: IDBFactory, seed: number, progress: string): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const opening = factory.open(SAVE_DATABASE_NAME);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error ?? new Error("Save database unavailable"));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve();
      };
      const tx = db.transaction("campaigns", "readwrite");
      const store = tx.objectStore("campaigns");
      const get = store.get(seed);
      get.onerror = () => finish(get.error ?? new Error("Campaign missing"));
      get.onsuccess = () => {
        store.put({ ...get.result, progress });
      };
      tx.oncomplete = () => finish();
      tx.onerror = () => finish(tx.error ?? new Error("Campaign update failed"));
      tx.onabort = () => finish(tx.error ?? new Error("Campaign update aborted"));
    });
  } finally {
    db.close();
  }
}

describe("transactional save repository", () => {
  it("keeps the battlefield played while a database open is still migrating", async () => {
    const first = await open();
    const early = state();
    early.tick = 10;
    expect(await first.repository.save(early)).toBe("saved");
    first.repository.close();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const proto = SaveRepository.prototype as unknown as { migrateLegacy(): Promise<void> };
    const original = proto.migrateLegacy;
    let stalled: Promise<void> | undefined;
    const spy = vi.spyOn(proto, "migrateLegacy").mockImplementation(function (this: SaveRepository) {
      stalled = gate.then(() => original.call(this));
      return stalled;
    });
    const slow = new SaveRepository(first.storage, first.factory);
    repositories.push(slow);
    await slow.initialize();
    expect(slow.mode).toBe("legacy");
    const later = state();
    later.tick = 40;
    expect(writeSave(first.storage, later)).toBe(true);
    release();
    await stalled?.catch(() => undefined);
    expect(slow.mode).toBe("legacy");
    spy.mockRestore();

    const next = await open(first.storage, first.factory);
    expect(readSave(next.repository.storage, 421)?.tick).toBe(40);
    const slots = listSlots(next.repository.storage);
    expect(slots).toHaveLength(1);
    expect(slots[0]?.name).toBe("Recovered earlier save");
    expect(slots[0]?.tick).toBe(10);
  }, 20_000);
  it("treats a reordered journal battlefield as the same save", async () => {
    const { repository, storage, factory } = await open();
    const current = state();
    addBuilding(current, 0, "power", 2, 2);
    addBuilding(current, 0, "barracks", 6, 2);
    await repository.save(current);
    expect(repository.writeJournal(current)).toBe(true);
    const key = `${JOURNAL_PREFIX}0421`;
    const journal = JSON.parse(storage.getItem(key)!) as { autosave: string };
    const autosave = JSON.parse(journal.autosave) as { state: { entities: Record<string, unknown>[] } };
    const [firstEntity, ...rest] = autosave.state.entities;
    const keys = Object.keys(firstEntity!);
    const rotated: Record<string, unknown> = {};
    for (const name of [...keys.slice(1), keys[0]!]) rotated[name] = firstEntity![name];
    autosave.state.entities = [...rest.reverse(), rotated];
    journal.autosave = JSON.stringify(autosave);
    storage.setItem(key, JSON.stringify(journal));
    repository.close();
    const next = await open(storage, factory);
    expect(readSave(next.repository.storage, 421)?.tick).toBe(0);
    expect(listSlots(next.repository.storage)).toHaveLength(0);
  });
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
  it.each(["implicit", "explicit"] as const)("keeps its own %s commit revision when another tab writes before refresh", async (mode) => {
    const first = await open(); const second = await open(first.storage, first.factory);
    const session = first.repository.createSession(421);
    const refreshable = first.repository as unknown as { refresh(): Promise<void> };
    const refresh = refreshable.refresh.bind(first.repository);
    let release!: () => void; let entered!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const refreshing = new Promise<void>((resolve) => { entered = resolve; });
    vi.spyOn(refreshable, "refresh").mockImplementationOnce(async () => {
      entered(); await gate; await refresh();
    });
    const current = state(); current.tick = 10;
    const writing = session.write(current, mode);
    await refreshing;
    try {
      const newer = state(); newer.tick = 80;
      expect(await second.repository.save(newer)).toBe("saved");
    } finally { release(); }
    expect(await writing).toBe("saved");
    expect(readSave(first.repository.storage, 421)?.tick).toBe(80);
    current.tick = 20;
    expect(await session.write(current, "implicit")).toBe("conflict");
    expect(readSave(second.repository.storage, 421)?.tick).toBe(80);
    expect(await session.write(current, "explicit")).toBe("saved");
    current.tick = 30;
    expect(await session.write(current, "implicit")).toBe("saved");
  });
  it("commits terminal progress and autosave together", async () => {
    const { repository } = await open(); const won = state(); won.result = "won";
    expect(await repository.save(won)).toBe("saved");
    expect(readSave(repository.storage, 421)?.result).toBe("won");
    expect(readCampaignProgress(repository.storage, 421).completedMissions).toEqual([0]);
  });
  it("keeps a queued victory when a deployment edge is chosen before that save commits", async () => {
    const { repository } = await open();
    const session = repository.createSession(421);
    const playing = state();
    const prior = session.write(playing, "implicit");
    const won = state();
    won.result = "won";
    const victory = session.write(won, "implicit");
    const edge = repository.setDeploymentEdge(421, "veteranSquad");
    const leave = session.write(won, "implicit");
    expect(await prior).toBe("saved");
    expect(await victory).toBe("saved");
    expect(await edge).toBe(true);
    expect(await leave).toBe("saved");
    const progress = readCampaignProgress(repository.storage, 421);
    expect(progress.completedMissions).toEqual([0]);
    expect(progress.unlockedMission).toBe(1);
    expect(progress.deploymentEdge).toBe("veteranSquad");
  });
  it("does not make the mission session conflict after a deployment edge is stored", async () => {
    const { repository } = await open();
    const session = repository.createSession(421);
    const won = state();
    won.result = "won";
    expect(await session.write(won, "implicit")).toBe("saved");
    expect(await repository.setDeploymentEdge(421, "airSortie")).toBe(true);
    won.tick = 4;
    expect(await session.write(won, "implicit")).toBe("saved");
    const progress = readCampaignProgress(repository.storage, 421);
    expect(progress.completedMissions).toEqual([0]);
    expect(progress.unlockedMission).toBe(1);
    expect(progress.deploymentEdge).toBe("airSortie");
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
  it("restores a deployment edge from a journal when the won battlefield is already saved", async () => {
    const { repository, storage, factory } = await open();
    const won = state();
    won.result = "won";
    await repository.save(won);
    const progressWithoutEdge = repository.storage.getItem(campaignKey(421));
    expect(progressWithoutEdge).toEqual(expect.any(String));
    expect(await repository.setDeploymentEdge(421, "forwardTurret")).toBe(true);
    expect(repository.writeJournal(won)).toBe(true);
    repository.close();
    await replaceCampaignProgress(factory, 421, progressWithoutEdge!);
    const next = await open(storage, factory);
    expect(readCampaignProgress(next.repository.storage, 421)).toMatchObject({
      deploymentEdge: "forwardTurret",
      completedMissions: [0],
      unlockedMission: 1,
    });
    expect(listSlots(next.repository.storage)).toHaveLength(0);
    expect(readSave(next.repository.storage, 421)?.result).toBe("won");
    expect(storage.keys().some((key) => key.includes("journal"))).toBe(false);
    const session = next.repository.createSession(421);
    won.tick = 8;
    expect(await session.write(won, "implicit")).toBe("saved");
    expect(readCampaignProgress(next.repository.storage, 421).deploymentEdge).toBe("forwardTurret");
  });
  it("keeps a newer deployment edge when an older journal has a different reward", async () => {
    let clock = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock++);
    const { repository, storage, factory } = await open();
    const won = state();
    won.result = "won";
    await repository.save(won);
    expect(await repository.setDeploymentEdge(421, "veteranSquad")).toBe(true);
    expect(repository.writeJournal(won)).toBe(true);
    expect(await repository.setDeploymentEdge(421, "airSortie")).toBe(true);
    repository.close();
    const next = await open(storage, factory);
    expect(readCampaignProgress(next.repository.storage, 421).deploymentEdge).toBe("airSortie");
    expect(listSlots(next.repository.storage)).toHaveLength(0);
    expect(readSave(next.repository.storage, 421)?.result).toBe("won");
  });
  it("keeps a failed deployment-edge clear off the next autosave", async () => {
    const { repository } = await open();
    const won = state();
    won.result = "won";
    expect(await repository.save(won)).toBe("saved");
    expect(await repository.setDeploymentEdge(421, "veteranSquad")).toBe(true);
    const put = IDBObjectStore.prototype.put;
    const failing = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (this.name === "campaigns") throw new DOMException("aborted", "AbortError");
      return put.apply(this, args);
    });
    expect(await repository.setDeploymentEdge(421, undefined)).toBe(false);
    failing.mockRestore();
    expect(readCampaignProgress(repository.storage, 421).deploymentEdge).toBeUndefined();
    const playing = state();
    playing.tick = 12;
    expect(await repository.save(playing)).toBe("saved");
    expect(readCampaignProgress(repository.storage, 421).deploymentEdge).toBeUndefined();
    expect(readCampaignProgress(repository.storage, 421).completedMissions).toEqual([0]);
  });
  it("keeps a failed deployment-edge choice on the next autosave", async () => {
    const { repository } = await open();
    const won = state();
    won.result = "won";
    expect(await repository.save(won)).toBe("saved");
    const put = IDBObjectStore.prototype.put;
    const failing = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (this.name === "campaigns") throw new DOMException("aborted", "AbortError");
      return put.apply(this, args);
    });
    expect(await repository.setDeploymentEdge(421, "airSortie")).toBe(false);
    failing.mockRestore();
    expect(readCampaignProgress(repository.storage, 421).deploymentEdge).toBe("airSortie");
    const playing = state();
    playing.tick = 12;
    expect(await repository.save(playing)).toBe("saved");
    expect(readCampaignProgress(repository.storage, 421).deploymentEdge).toBe("airSortie");
  });
  it("keeps a newer deployment edge when an older journal battlefield differs", async () => {
    let clock = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock++);
    const { repository, storage, factory } = await open();
    const won = state();
    won.result = "won";
    await repository.save(won);
    expect(await repository.setDeploymentEdge(421, "veteranSquad")).toBe(true);
    const later = state();
    later.result = "won";
    later.tick = 40;
    expect(repository.writeJournal(later)).toBe(true);
    expect(await repository.setDeploymentEdge(421, "airSortie")).toBe(true);
    repository.close();
    const next = await open(storage, factory);
    expect(readCampaignProgress(next.repository.storage, 421).deploymentEdge).toBe("airSortie");
    expect(readSave(next.repository.storage, 421)?.tick).toBe(40);
    expect(listSlots(next.repository.storage)).toHaveLength(0);
  });
  it("applies a newer journal reward when the stored battlefield differs", async () => {
    let clock = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock++);
    const { repository, storage, factory } = await open();
    const won = state();
    won.result = "won";
    await repository.save(won);
    expect(await repository.setDeploymentEdge(421, "veteranSquad")).toBe(true);
    const olderProgress = repository.storage.getItem(campaignKey(421));
    expect(olderProgress).toEqual(expect.any(String));
    expect(await repository.setDeploymentEdge(421, "airSortie")).toBe(true);
    const later = state();
    later.result = "won";
    later.tick = 40;
    expect(repository.writeJournal(later)).toBe(true);
    repository.close();
    await replaceCampaignProgress(factory, 421, olderProgress!);
    const next = await open(storage, factory);
    expect(readCampaignProgress(next.repository.storage, 421).deploymentEdge).toBe("airSortie");
    expect(readSave(next.repository.storage, 421)?.tick).toBe(40);
  });
  it("keeps a newer deployment edge when a conflicting journal has an older reward", async () => {
    let clock = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => clock++);
    const { repository, storage, factory } = await open();
    const won = state();
    won.result = "won";
    await repository.save(won);
    expect(await repository.setDeploymentEdge(421, "veteranSquad")).toBe(true);
    const later = state();
    later.result = "won";
    later.tick = 40;
    expect(repository.writeJournal(later)).toBe(true);
    expect(await repository.setDeploymentEdge(421, "airSortie")).toBe(true);
    won.tick = 80;
    expect(await repository.save(won)).toBe("saved");
    repository.close();
    const next = await open(storage, factory);
    expect(readCampaignProgress(next.repository.storage, 421).deploymentEdge).toBe("airSortie");
    expect(readSave(next.repository.storage, 421)?.tick).toBe(80);
    expect(readCampaignProgress(next.repository.storage, 421).completedMissions).toEqual([0]);
    expect(listSlots(next.repository.storage)).toHaveLength(1);
  });
  it("merges a conflicting journal win into the live campaign", async () => {
    const { repository, storage, factory } = await open();
    await repository.save(state());
    const won = state();
    won.missionIndex = 2;
    won.result = "won";
    expect(repository.writeJournal(won, 99)).toBe(true);
    repository.close();
    const next = await open(storage, factory);
    expect(readSave(next.repository.storage, 421)?.tick).toBe(0);
    expect(readCampaignProgress(next.repository.storage, 421).completedMissions).toEqual([2]);
    expect(readCampaignProgress(next.repository.storage, 421).unlockedMission).toBe(3);
    expect(listSlots(next.repository.storage)).toHaveLength(1);
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
  it("retires a rules 1 battlefield and keeps the campaign record", async () => {
    const storage = memoryStorage();
    const legacy = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    legacy.gameplayRulesVersion = 1;
    legacy.tick = 40;
    legacy.missionIndex = 2;
    writeSave(storage, legacy);
    writeCampaignProgress(storage, {
      ...freshCampaignProgress(421),
      gameplayRulesVersion: 1,
      unlockedMission: 2,
      completedMissions: [0, 1],
      medals: { "0": 2 },
      bestScores: { "0": 800 },
    });
    writeSlot(storage, {
      name: "Old front",
      state: legacy,
      campaign: {
        ...freshCampaignProgress(421),
        gameplayRulesVersion: 1,
        unlockedMission: 2,
        completedMissions: [0, 1],
        medals: { "1": 1 },
        bestScores: { "1": 100 },
      },
    });
    storage.setItem("shiftingfront:journal:0421", JSON.stringify({
      revision: 0,
      autosave: storage.getItem(saveKey(421)),
      progress: storage.getItem(campaignKey(421)),
      savedAt: 1,
    }));
    const current = state();
    current.seed = 422;
    writeSave(storage, current);
    const { repository } = await open(storage);
    expect(readSave(repository.storage, 421)).toBeNull();
    expect(listSlots(repository.storage)).toHaveLength(0);
    expect(storage.getItem(saveKey(421))).toBeNull();
    expect(storage.keys().some((key) => key.includes("journal"))).toBe(false);
    expect(readSave(repository.storage, 422)?.gameplayRulesVersion).toBe(2);
    const progress = readCampaignProgress(repository.storage, 421);
    expect(progress.gameplayRulesVersion).toBe(2);
    expect(progress.unlockedMission).toBe(2);
    expect(progress.completedMissions).toEqual([0, 1]);
    expect(progress.medals).toMatchObject({ "0": 2, "1": 1 });
    expect(progress.bestScores).toMatchObject({ "0": 800, "1": 100 });
    expect(repository.notice).toContain("rebuilt");
  });
  it("retires rules 1 battlefields when indexeddb is unavailable", async () => {
    const storage = memoryStorage();
    const legacy = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    legacy.gameplayRulesVersion = 1;
    legacy.missionIndex = 1;
    writeSave(storage, legacy);
    writeCampaignProgress(storage, { ...freshCampaignProgress(421), gameplayRulesVersion: 1, unlockedMission: 1, completedMissions: [0], medals: { "0": 3 }, bestScores: { "0": 50 } });
    const repository = new SaveRepository(storage, undefined);
    repositories.push(repository);
    await repository.initialize();
    expect(repository.mode).toBe("legacy");
    expect(readSave(storage, 421)).toBeNull();
    expect(readCampaignProgress(storage, 421)).toMatchObject({ gameplayRulesVersion: 2, unlockedMission: 1, completedMissions: [0], medals: { "0": 3 } });
    expect(repository.notice).toContain("rebuilt");
    expect(repository.notice).toContain("reduced");
  });
  it("refuses to import a rules 1 battlefield and keeps its campaign record", async () => {
    const { repository } = await open();
    const legacy = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    legacy.gameplayRulesVersion = 1;
    legacy.missionIndex = 1;
    const exported = memoryStorage();
    const written = writeSlot(exported, {
      name: "Old export",
      state: legacy,
      campaign: { ...freshCampaignProgress(421), gameplayRulesVersion: 1, unlockedMission: 1, completedMissions: [0], medals: { "0": 2 }, bestScores: { "0": 20 } },
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    const result = await repository.importSlot(exported.getItem(slotKey(written.id))!);
    expect(result).toEqual({ ok: false, reason: "legacy-rules" });
    expect(listSlots(repository.storage)).toHaveLength(0);
    expect(readSave(repository.storage, 421)).toBeNull();
    expect(readCampaignProgress(repository.storage, 421)).toMatchObject({ gameplayRulesVersion: 2, unlockedMission: 1, completedMissions: [0], medals: { "0": 2 } });
  });
  it("keeps a crash journal when legacy campaign progress is only restamped", async () => {
    const { repository, storage, factory } = await open();
    const playing = state();
    playing.tick = 10;
    expect(await repository.save(playing)).toBe("saved");
    const progress = readCampaignProgress(repository.storage, 421);
    storage.setItem(campaignKey(421), JSON.stringify({ version: 1, savedAt: Date.now() + 5_000, progress }));
    playing.tick = 40;
    expect(repository.writeJournal(playing)).toBe(true);
    repository.close();

    const next = await open(storage, factory);
    expect(readSave(next.repository.storage, 421)?.tick).toBe(40);
    expect(listSlots(next.repository.storage)).toHaveLength(0);
    expect(storage.keys().some((key) => key.includes("journal"))).toBe(false);

    const restamped = JSON.parse(storage.getItem(campaignKey(421))!) as { savedAt: number };
    restamped.savedAt += 5_000;
    storage.setItem(campaignKey(421), JSON.stringify(restamped));
    next.repository.close();
    const third = await open(storage, factory);
    expect(readSave(third.repository.storage, 421)?.tick).toBe(40);
    expect(listSlots(third.repository.storage).map((slot) => slot.name)).not.toContain("Recovered legacy progress");
  });
  it("applies a newer legacy reward clear without replacing the crash journal", async () => {
    const { repository, storage, factory } = await open();
    const won = state();
    won.result = "won";
    expect(await repository.save(won)).toBe("saved");
    expect(await repository.setDeploymentEdge(421, "airSortie")).toBe(true);
    const progress = readCampaignProgress(repository.storage, 421);
    delete progress.deploymentEdge;
    storage.setItem(campaignKey(421), JSON.stringify({ version: 1, savedAt: Date.now() + 10_000, progress }));
    const playing = state();
    playing.tick = 40;
    expect(repository.writeJournal(playing)).toBe(true);
    repository.close();

    const next = await open(storage, factory);
    expect(readCampaignProgress(next.repository.storage, 421).deploymentEdge).toBeUndefined();
    expect(readCampaignProgress(next.repository.storage, 421).completedMissions).toEqual([0]);
    expect(readSave(next.repository.storage, 421)?.tick).toBe(40);
    expect(listSlots(next.repository.storage)).toHaveLength(0);
  });
  it("keeps a stored reward when an older legacy envelope omitted it", async () => {
    const { repository, storage, factory } = await open();
    const won = state();
    won.result = "won";
    expect(await repository.save(won)).toBe("saved");
    expect(await repository.setDeploymentEdge(421, "airSortie")).toBe(true);
    const progress = readCampaignProgress(repository.storage, 421);
    delete progress.deploymentEdge;
    storage.setItem(campaignKey(421), JSON.stringify({ version: 1, savedAt: 1, progress }));
    repository.close();

    const next = await open(storage, factory);
    expect(readCampaignProgress(next.repository.storage, 421).deploymentEdge).toBe("airSortie");
    expect(listSlots(next.repository.storage)).toHaveLength(0);
    expect(readSave(next.repository.storage, 421)?.result).toBe("won");
  });
  it("still archives a battlefield when legacy campaign progress actually changed", async () => {
    const { repository, storage, factory } = await open();
    const playing = state();
    playing.tick = 10;
    expect(await repository.save(playing)).toBe("saved");
    const progress = readCampaignProgress(repository.storage, 421);
    storage.setItem(campaignKey(421), JSON.stringify({ version: 1, savedAt: Date.now(), progress }));
    repository.close();
    const seeded = await open(storage, factory);
    const changed = readCampaignProgress(seeded.repository.storage, 421);
    changed.unlockedMission = 2;
    changed.completedMissions = [0, 1];
    changed.medals = { ...changed.medals, "0": 2, "1": 1 };
    storage.setItem(campaignKey(421), JSON.stringify({ version: 1, savedAt: Date.now() + 5_000, progress: changed }));
    seeded.repository.close();

    const next = await open(storage, factory);
    expect(readSave(next.repository.storage, 421)?.tick).toBe(10);
    expect(readCampaignProgress(next.repository.storage, 421)).toMatchObject({
      unlockedMission: 2,
      completedMissions: [0, 1],
      medals: { "0": 2, "1": 1 },
    });
    expect(listSlots(next.repository.storage).map((slot) => slot.name)).toContain("Recovered legacy progress");
  });
  it("reports failed legacy writes and exposes reduced reliability", async () => {
    const storage = memoryStorage(); const broken = { ...storage, setItem() { throw new Error("quota"); } };
    const repository = new SaveRepository(broken, undefined); repositories.push(repository); await repository.initialize();
    expect(repository.notice).toContain("reduced"); expect(await repository.save(state())).toBe("failed");
    expect(storage.getItem(saveKey(421))).toBeNull(); expect(storage.getItem(campaignKey(421))).toBeNull();
  });
});
