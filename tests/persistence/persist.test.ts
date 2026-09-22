import { describe, expect, it, vi } from "vitest";
import { deserializeState, listSaves, listUnreadableSaves, memoryStorage, readSave, removeSave, saveKey, SAVE_CONTENT_VERSION, SAVE_VERSION, serializeState, writeSave } from "../../lib/persist/save";
import { rngFromState } from "../../lib/seed/rng";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { createMission, tick } from "../../lib/sim/api";

describe("persist", () => {
  it("round-trips a save through memory storage", () => {
    const s = makeFixture({ seed: 421, win: { kind: "harvestQuota", target: 9000 } });
    addBuilding(s, 0, "constructionYard", 1, 1);
    tick(s);
    tick(s);
    s.losses.units = [1, 2];
    s.losses.buildings = [3, 4];
    const storage = memoryStorage();
    writeSave(storage, s);
    const loaded = readSave(storage, 421);
    expect(loaded).not.toBeNull();
    expect(loaded!.tick).toBe(s.tick);
    expect(loaded!.credits[0]).toBe(s.credits[0]);
    expect(loaded!.losses).toEqual({ units: [1, 2], buildings: [3, 4] });
    expect(loaded!.win.kind).toBe("harvestQuota");
    const listed = listSaves(storage);
    expect(listed).toHaveLength(1);
    expect(listed[0]!.seed).toBe("0421");
    expect(listed[0]!.campaignName).toBeTruthy();
  });

  it("round-trips rally points and control groups and backfills legacy groups", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const barracks = addBuilding(state, 0, "barracks", 2, 2);
    const infantry = addUnit(state, 0, "infantry", 4, 4);
    barracks.rallyPoint = { x: 7, y: 8 };
    state.controlGroups = { 1: [infantry.id] };

    const loaded = deserializeState(serializeState(state));
    expect(loaded.entities.find((entity) => entity.id === barracks.id)?.rallyPoint).toEqual({ x: 7, y: 8 });
    expect(loaded.controlGroups).toEqual({ 1: [infantry.id] });

    const legacy = JSON.parse(serializeState(state)) as { controlGroups?: unknown };
    delete legacy.controlGroups;
    expect(deserializeState(JSON.stringify(legacy)).controlGroups).toEqual({});

    legacy.controlGroups = { 1: [infantry.id, infantry.id] };
    expect(() => deserializeState(JSON.stringify(legacy))).toThrow("Invalid save state");
  });

  it("round-trips the signed RNG state produced after a mission tick", () => {
    const state = createMission({ seed: 8212, missionIndex: 0 });
    tick(state);

    expect(state.rngState).toBeLessThan(0);
    expect(deserializeState(serializeState(state)).rngState).toBe(state.rngState);
  });

  it("preserves a zero RNG state when restoring", () => {
    const first = rngFromState(0);
    const second = rngFromState(0);

    expect(first.state).toBe(0);
    expect(first.next()).toBe(second.next());
    expect(first.state).toBe(second.state);
  });

  it("writes a versioned envelope and rejects malformed or mismatched saves", () => {
    const storage = memoryStorage();
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    writeSave(storage, state);

    const envelope = JSON.parse(storage.getItem(saveKey(421))!);
    expect(envelope.version).toBe(SAVE_VERSION);
    expect(envelope.contentVersion).toBe(SAVE_CONTENT_VERSION);
    expect(envelope.state.seed).toBe(421);
    expect(readSave(storage, 421)?.seed).toBe(421);

    storage.setItem(saveKey(421), JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 1, state }));
    expect(readSave(storage, 421)).toBeNull();

    storage.setItem(saveKey(421), JSON.stringify({ version: SAVE_VERSION, contentVersion: SAVE_CONTENT_VERSION + 1, savedAt: 1, state }));
    expect(readSave(storage, 421)).toBeNull();

    storage.setItem(saveKey(421), JSON.stringify({ version: 1, savedAt: 1, state }));
    expect(readSave(storage, 421)?.seed).toBe(421);

    storage.setItem(saveKey(421), JSON.stringify({ ...state, savedAt: 1 }));
    expect(readSave(storage, 421)?.seed).toBe(421);

    storage.setItem(saveKey(421), JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: { ...state, seed: 9 } }));
    expect(readSave(storage, 421)).toBeNull();
    expect(() => deserializeState(JSON.stringify({ nope: true }))).toThrow("Invalid save state");
  });

  it("lists campaigns by last saved time", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const storage = memoryStorage();
      writeSave(storage, makeFixture({ seed: 9, win: { kind: "annihilate" } }));
      vi.setSystemTime(new Date("2026-01-01T00:00:01Z"));
      writeSave(storage, makeFixture({ seed: 1, win: { kind: "annihilate" } }));
      expect(listSaves(storage).map((s) => s.seed)).toEqual(["0001", "0009"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes only the requested campaign save", () => {
    const storage = memoryStorage();
    writeSave(storage, makeFixture({ seed: 9, win: { kind: "annihilate" } }));
    writeSave(storage, makeFixture({ seed: 10, win: { kind: "annihilate" } }));

    removeSave(storage, 9);

    expect(readSave(storage, 9)).toBeNull();
    expect(readSave(storage, 10)).not.toBeNull();
  });

  it("returns false instead of throwing when storage rejects a write", () => {
    const state = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };

    expect(writeSave(storage, state)).toBe(false);
  });

  it("treats unavailable storage reads, listing, and deletes as safe no-ops", () => {
    const storage = memoryStorage();
    storage.getItem = () => {
      throw new Error("storage unavailable");
    };
    storage.keys = () => {
      throw new Error("storage unavailable");
    };
    storage.removeItem = () => {
      throw new Error("storage unavailable");
    };

    expect(readSave(storage, 421)).toBeNull();
    expect(listSaves(storage)).toEqual([]);
    expect(listUnreadableSaves(storage)).toEqual([]);
    expect(() => removeSave(storage, 421)).not.toThrow();
  });

  it("reports unreadable saves so the menu can offer a safe reset", () => {
    const storage = memoryStorage();
    storage.setItem(saveKey(421), "not json");
    storage.setItem(saveKey(9), JSON.stringify({ version: SAVE_VERSION + 1, savedAt: 1, state: {} }));
    const mismatched = makeFixture({ seed: 10, win: { kind: "annihilate" } });
    storage.setItem(saveKey(77), JSON.stringify({ version: SAVE_VERSION, savedAt: 1, state: mismatched }));
    writeSave(storage, makeFixture({ seed: 10, win: { kind: "annihilate" } }));

    expect(listUnreadableSaves(storage)).toEqual(["0009", "0077", "0421"]);
  });

  it("backfills biome and surface metadata in legacy saves", () => {
    const legacy = makeFixture({ seed: 77, win: { kind: "annihilate" } }) as Partial<ReturnType<typeof makeFixture>>;
    delete legacy.biome;
    delete legacy.surfaces;
    const loaded = deserializeState(JSON.stringify(legacy));
    expect(loaded.biome).toBeTruthy();
    expect(loaded.surfaces).toHaveLength(loaded.width * loaded.height);
    expect(new Set(loaded.surfaces)).toEqual(new Set([0]));
  });

  it("normalizes navigation revisions for saves written before flow routing", () => {
    const raw = JSON.parse(serializeState(makeFixture({ seed: 77, win: { kind: "annihilate" } }))) as { navigationRevision?: number };
    delete raw.navigationRevision;
    expect(deserializeState(JSON.stringify(raw)).navigationRevision).toBe(0);
  });

  it("backfills zeroed loss counters in legacy saves", () => {
    const legacy = JSON.parse(serializeState(makeFixture({ seed: 77, win: { kind: "annihilate" } }))) as { losses?: unknown };
    delete legacy.losses;
    const loaded = deserializeState(JSON.stringify(legacy));
    expect(loaded.losses).toEqual({ units: [0, 0], buildings: [0, 0] });
  });

  it("backfills scenario roles for legacy scenario targets", () => {
    const cases = [
      ["escort", "convoy"],
      ["rescue", "stranded"],
      ["extraction", "cargo"],
    ] as const;

    for (const [kind, role] of cases) {
      const state = makeFixture({ seed: 77, win: { kind, targetCount: 1, ticks: 100 } });
      const target = addUnit(state, 0, kind === "escort" ? "convoyTruck" : "infantry", 6, 6);
      target.neutral = true;
      state.runtime = {
        kind,
        phase: "active",
        targetIds: [target.id],
        zone: { x: 6, y: 6 },
        deadline: 100,
        rescued: 0,
        required: 1,
        secondary: [],
      };

      const loaded = deserializeState(serializeState(state));
      expect(loaded.entities.find((entity) => entity.id === target.id)?.scenarioRole).toBe(role);
    }
  });

  it("expands legacy fog grids to cover the map skirt", () => {
    const s = makeFixture({ seed: 77, win: { kind: "annihilate" } });
    const raw = JSON.parse(serializeState(s)) as { fog: number[]; width: number; height: number };
    raw.fog = new Array(s.width * s.height).fill(1);
    const loaded = deserializeState(JSON.stringify(raw));
    expect(loaded.fog.length).toBeGreaterThan(s.width * s.height);
    expect(loaded.fog[0]).toBe(0);
  });

  it("round-trips a production queue and backfills missing queues", () => {
    const s = makeFixture({ seed: 421, win: { kind: "annihilate" } });
    const barracks = addBuilding(s, 0, "barracks", 2, 2);
    barracks.producing = { kind: "infantry", remaining: 40 };
    barracks.queue = ["infantry", "antiArmor"];
    const storage = memoryStorage();
    writeSave(storage, s);
    const loaded = readSave(storage, 421);
    expect(loaded?.entities[0]?.producing).toEqual({ kind: "infantry", remaining: 40 });
    expect(loaded?.entities[0]?.queue).toEqual(["infantry", "antiArmor"]);

    const raw = JSON.parse(serializeState(s)) as { entities: { queue?: string[] }[] };
    delete raw.entities[0]!.queue;
    const backfilled = deserializeState(JSON.stringify(raw));
    expect(backfilled.entities[0]?.queue).toEqual([]);
  });

  it("backfills facing on legacy entities", () => {
    const s = makeFixture({ seed: 9, win: { kind: "annihilate" } });
    addUnit(s, 0, "infantry", 1, 1);
    addUnit(s, 1, "tank", 3, 3);
    const raw = JSON.parse(serializeState(s)) as { entities: { facing?: number; owner: number }[] };
    delete raw.entities[0]!.facing;
    delete raw.entities[1]!.facing;
    const loaded = deserializeState(JSON.stringify(raw));
    expect(loaded.entities[0]?.facing).toBe(0);
    expect(loaded.entities[1]?.facing).toBe(4);
  });

  it("round-trips repairing and backfills it on legacy entities", () => {
    const s = makeFixture({ seed: 11, win: { kind: "annihilate" } });
    const power = addBuilding(s, 0, "power", 2, 2);
    power.hp = 200;
    power.repairing = true;
    const storage = memoryStorage();
    writeSave(storage, s);
    const loaded = readSave(storage, 11);
    expect(loaded?.entities[0]?.repairing).toBe(true);

    const raw = JSON.parse(serializeState(s)) as { entities: { repairing?: boolean }[] };
    delete raw.entities[0]!.repairing;
    const backfilled = deserializeState(JSON.stringify(raw));
    expect(backfilled.entities[0]?.repairing).toBe(false);
  });

  it("clears all shiftingfront keys from storage on factory reset", async () => {
    const { clearAllGameData } = await import("../../lib/persist/save");
    const storage = memoryStorage({
      "shiftingfront:settings": "{}",
      "shiftingfront:telemetry": "{}",
      "shiftingfront:save:0421": "{}",
      "shiftingfront:slot:slot-1": "{}",
      "unrelated-key": "important-user-data",
    });

    expect(storage.keys()).toHaveLength(5);
    const ok = clearAllGameData(storage);
    expect(ok).toBe(true);
    expect(storage.keys()).toEqual(["unrelated-key"]);
    expect(storage.getItem("unrelated-key")).toBe("important-user-data");
  });
});
