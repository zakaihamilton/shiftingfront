// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { campaignKey, readCampaignProgress } from "../../lib/persist/campaign";
import { cachedLocalStorage, listSlots, readSave } from "../../lib/persist/save";
import { installSaveRepository, SaveRepository } from "../../lib/persist/save/repository";
import { POWER_RESERVE_BONUS } from "../../lib/sim/fieldIdentity";
import { makeFixture } from "../../lib/sim/fixtures";
import { prepareInitialMission } from "../../components/game/hooks/useGameSession";

const repositories: SaveRepository[] = [];

afterEach(() => {
  repositories.splice(0).forEach((repository) => repository.close());
  installSaveRepository(null);
  window.localStorage.clear();
  vi.restoreAllMocks();
});

async function openRepository() {
  const storage = cachedLocalStorage();
  const factory = new IDBFactory();
  const repository = new SaveRepository(storage, factory);
  repositories.push(repository);
  await repository.initialize();
  expect(repository.mode).toBe("indexeddb");
  installSaveRepository(repository);
  return { repository, storage, factory };
}

describe("fresh mission launch persistence", () => {
  it("clears a deployment reward in IndexedDB without rewriting legacy campaign progress", async () => {
    const { repository } = await openRepository();
    const won = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    won.gameplayRulesVersion = 2;
    won.result = "won";
    expect(await repository.save(won)).toBe("saved");
    expect(await repository.setDeploymentEdge(421, "powerReserve")).toBe(true);
    expect(window.localStorage.getItem(campaignKey(421))).toBeNull();

    const mission = await prepareInitialMission({ seed: 421, mission: 1, resume: false, fresh: true });

    expect(mission.powerReserve).toBe(POWER_RESERVE_BONUS);
    expect(readCampaignProgress(repository.storage, 421).deploymentEdge).toBeUndefined();
    expect(window.localStorage.getItem(campaignKey(421))).toBeNull();
  });

  it("records a failed reward clear for the next open without archiving the battlefield", async () => {
    const { repository, storage, factory } = await openRepository();
    const won = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    won.gameplayRulesVersion = 2;
    won.result = "won";
    expect(await repository.save(won)).toBe("saved");
    expect(await repository.setDeploymentEdge(421, "powerReserve")).toBe(true);
    const put = IDBObjectStore.prototype.put;
    const failing = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (this: IDBObjectStore, ...args: Parameters<typeof put>) {
      if (this.name === "campaigns") throw new DOMException("aborted", "AbortError");
      return put.apply(this, args);
    });

    const mission = await prepareInitialMission({ seed: 421, mission: 1, resume: false, fresh: true });

    failing.mockRestore();
    expect(mission.powerReserve).toBe(POWER_RESERVE_BONUS);
    expect(readCampaignProgress(storage, 421).deploymentEdge).toBeUndefined();
    repository.close();
    installSaveRepository(null);

    const next = new SaveRepository(storage, factory);
    repositories.push(next);
    await next.initialize();
    expect(readCampaignProgress(next.storage, 421).deploymentEdge).toBeUndefined();
    expect(readSave(next.storage, 421)?.result).toBe("won");
    expect(listSlots(next.storage)).toHaveLength(0);
  });
});
