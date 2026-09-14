import { describe, expect, it } from "vitest";
import {
  decodeSave,
  decodeSavedState,
  deserializeState,
  saveKey,
  serializeState,
  SAVE_PREFIX,
  SAVE_VERSION,
} from "../../lib/persist/save/serialize";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

function baseState(seed = 1000) {
  return makeFixture({ seed, win: { kind: "annihilate" } });
}

describe("serializeState / deserializeState", () => {
  it("round-trips a state through JSON", () => {
    const state = baseState();
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(restored.seed).toBe(state.seed);
    expect(restored.width).toBe(state.width);
  });

  it("round-trips AI contacts and defaults legacy saves to an empty contact map", () => {
    const state = baseState(1000);
    const scout = addUnit(state, 1, "infantry", 5, 5);
    state.aiContacts = {
      [scout.id]: {
        id: scout.id,
        class: "unit",
        kind: "infantry",
        x: scout.x,
        y: scout.y,
        lastSeenTick: 42,
      },
    };

    const restored = deserializeState(serializeState(state));
    expect(restored.aiContacts).toEqual(state.aiContacts);

    const legacy = JSON.parse(serializeState(state)) as { aiContacts?: unknown };
    delete legacy.aiContacts;
    expect(deserializeState(JSON.stringify(legacy)).aiContacts).toEqual({});
  });

  it("round-trips a pending refinery harvester", () => {
    const state = baseState();
    const refinery = addBuilding(state, 0, "refinery", 4, 4);
    refinery.refineryHarvesterPending = true;

    const restored = deserializeState(serializeState(state));

    expect(restored.entities.find((entity) => entity.id === refinery.id)?.refineryHarvesterPending).toBe(true);
  });
});

describe("saveKey", () => {
  it("formats keys with 4-digit zero padding", () => {
    expect(saveKey(42)).toBe(`${SAVE_PREFIX}0042`);
    expect(saveKey(1000)).toBe(`${SAVE_PREFIX}1000`);
  });
});

describe("decodeSave", () => {
  it("decodes a valid envelope", () => {
    const state = baseState(1000);
    const envelope = { version: SAVE_VERSION, savedAt: 500, state };
    const { state: decoded, savedAt } = decodeSave(JSON.stringify(envelope));
    expect(decoded.seed).toBe(1000);
    expect(savedAt).toBe(500);
  });

  it("decodes legacy format with savedAt at root level", () => {
    const state = baseState(1000);
    const legacy = { ...state, savedAt: 600 };
    const { state: decoded, savedAt } = decodeSave(JSON.stringify(legacy));
    expect(decoded.seed).toBe(1000);
    expect(savedAt).toBe(600);
  });

  it("throws on unsupported envelope version", () => {
    const envelope = { version: 99, savedAt: 0, state: baseState() };
    expect(() => decodeSave(JSON.stringify(envelope))).toThrow("Unsupported save version");
  });

  it("throws on invalid state shape", () => {
    const envelope = { version: SAVE_VERSION, savedAt: 0, state: { seed: 1000 } };
    expect(() => decodeSave(JSON.stringify(envelope))).toThrow("Invalid save state");
  });

  it("throws on invalid JSON", () => {
    expect(() => decodeSave("not json")).toThrow();
  });
});

describe("normalizeState edge cases", () => {
  it("fills missing heights array", () => {
    const state = baseState(1000);
    delete (state as { heights?: unknown }).heights;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(restored.heights).toBeDefined();
    expect(restored.heights.length).toBe(restored.width * restored.height);
  });

  it("fills missing surfaces array", () => {
    const state = baseState(1000);
    delete (state as { surfaces?: unknown }).surfaces;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(restored.surfaces).toBeDefined();
    expect(restored.surfaces.length).toBe(restored.width * restored.height);
  });

  it("fills missing biome from seed", () => {
    const state = baseState(1000);
    delete (state as { biome?: unknown }).biome;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(restored.biome).toBeTruthy();
  });

  it("fills empty fog array", () => {
    const state = baseState(1000);
    (state as { fog: unknown }).fog = "not-array";
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(Array.isArray(restored.fog)).toBe(true);
  });

  it("fills missing losses", () => {
    const state = baseState(1000);
    delete (state as { losses?: unknown }).losses;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(restored.losses).toEqual({ units: [0, 0], buildings: [0, 0] });
  });

  it("fills missing unitsProducedByRole", () => {
    const state = baseState(1000);
    delete (state as { unitsProducedByRole?: unknown }).unitsProducedByRole;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(restored.unitsProducedByRole).toBeDefined();
  });

  it("normalizes legacy escort tanks into convoy trucks without changing durability", () => {
    const state = makeFixture({ seed: 1000, win: { kind: "escort", targetCount: 1, ticks: 100 } });
    const target = addUnit(state, 0, "tank", 6, 6);
    target.neutral = true;
    target.scenarioRole = "convoy";
    target.hp = 1234;
    target.maxHp = 1920;
    target.cooldown = 9;
    target.armor = "heavy";
    state.runtime = {
      kind: "escort",
      phase: "active",
      targetIds: [target.id],
      zone: { x: 8, y: 8 },
      deadline: 100,
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const restored = deserializeState(serializeState(state));
    const convoy = restored.entities.find((entity) => entity.id === target.id)!;
    expect(convoy.kind).toBe("convoyTruck");
    expect(convoy.hp).toBe(1234);
    expect(convoy.maxHp).toBe(1920);
    expect(convoy.armor).toBe("heavy");
    expect(convoy.cooldown).toBe(0);
    expect(convoy.attackTarget).toBeUndefined();
    expect(convoy.scenarioRole).toBe("convoy");
  });

  it("fills missing buildingsCompletedByKind", () => {
    const state = baseState(1000);
    delete (state as { buildingsCompletedByKind?: unknown }).buildingsCompletedByKind;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(restored.buildingsCompletedByKind).toBeDefined();
  });

  it("fills missing entities array", () => {
    const state = baseState(1000);
    delete (state as { entities?: unknown }).entities;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(Array.isArray(restored.entities)).toBe(true);
  });

  it("sets default aiState when missing", () => {
    const state = baseState(1000);
    delete (state as { aiState?: unknown }).aiState;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect(restored.aiState).toBe("economy");
  });

  it("clears invalid aiRetreatTick", () => {
    const state = baseState(1000);
    (state as { aiRetreatTick: unknown }).aiRetreatTick = 1.5;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect((restored as { aiRetreatTick?: unknown }).aiRetreatTick).toBeUndefined();
  });

  it("clears non-true aiRetreatLocked", () => {
    const state = baseState(1000);
    (state as { aiRetreatLocked: unknown }).aiRetreatLocked = false;
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect((restored as { aiRetreatLocked?: unknown }).aiRetreatLocked).toBeUndefined();
  });

  it("removes appliedUpgrades", () => {
    const state = baseState(1000);
    (state as unknown as { appliedUpgrades: unknown }).appliedUpgrades = ["test"];
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    expect((restored as { appliedUpgrades?: unknown }).appliedUpgrades).toBeUndefined();
  });

  it("normalizes entity defaults on real entities", () => {
    const state = baseState(1000);
    for (const unit of state.entities.filter((e) => e.class === "unit")) {
      delete (unit as { facing?: unknown }).facing;
      delete (unit as { stance?: unknown }).stance;
      delete (unit as { queue?: unknown }).queue;
    }
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    for (const e of restored.entities.filter((en) => en.class === "unit")) {
      expect(e.facing).toBeDefined();
      expect(e.stance).toBe("aggressive");
      expect(e.queue).toEqual([]);
    }
  });

  it("normalizes support unit supportMode", () => {
    const state = baseState(1000);
    for (const medic of state.entities.filter((e) => e.kind === "medic")) {
      (medic as { supportMode: unknown }).supportMode = "invalid";
    }
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    for (const m of restored.entities.filter((e) => e.kind === "medic")) {
      expect(m.supportMode).toBe("auto");
    }
  });

  it("deletes supportTargetId from non-support units", () => {
    const state = baseState(1000);
    for (const unit of state.entities.filter((e) => e.class === "unit" && e.kind !== "medic" && e.kind !== "repairTruck")) {
      (unit as { supportTargetId: unknown }).supportTargetId = 5;
    }
    const raw = serializeState(state);
    const restored = deserializeState(raw);
    for (const u of restored.entities.filter((e) => e.class === "unit" && e.kind !== "medic" && e.kind !== "repairTruck")) {
      expect((u as { supportTargetId?: unknown }).supportTargetId).toBeUndefined();
    }
  });

  it("normalizes widths/heights validation", () => {
    const state = baseState(1000);
    (state as { width: unknown }).width = -1;
    expect(() => deserializeState(serializeState(state))).toThrow("Invalid save state");
  });

  it("normalizes zero-height state", () => {
    const state = baseState(1000);
    (state as { height: unknown }).height = 0;
    expect(() => deserializeState(serializeState(state))).toThrow("Invalid save state");
  });
});

describe("save allocation limits", () => {
  it.each([[257, 1], [1, 257], [1e9, 1e9], [Infinity, 1]])(
    "rejects dimensions %s × %s before reading map arrays",
    (width, height) => {
      const state = { ...baseState(), width, height };
      Object.defineProperty(state, "heights", {
        get() { throw new Error("map allocation path reached"); },
      });
      expect(() => decodeSavedState(state)).toThrow("Invalid save state");
    },
  );
});
