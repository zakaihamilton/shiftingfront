import { describe, expect, it } from "vitest";
import { compactDestroyedEntities } from "../../lib/sim/world";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { tick } from "../../lib/sim/api";
import { deserializeState, serializeState } from "../../lib/persist/save";
import { tickProduction } from "../../lib/sim/production";

describe("destroyed entity lifecycle", () => {
  it("compacts dead entities and clears references without changing counters", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "holdTheLine", ticks: 100 } });
    addBuilding(state, 0, "constructionYard", 1, 1);
    const dead = addUnit(state, 1, "infantry", 6, 6);
    const attacker = addUnit(state, 0, "tank", 4, 4);
    const medic = addUnit(state, 0, "medic", 4, 5);
    dead.hp = 0;
    attacker.attackTarget = dead.id;
    medic.supportTargetId = dead.id;
    medic.supportMode = "assigned";
    state.losses.units = [3, 4];
    const nextId = state.nextId;

    expect(compactDestroyedEntities(state)).toBe(1);
    expect(state.entities.some((entity) => entity.id === dead.id)).toBe(false);
    expect(attacker.attackTarget).toBeUndefined();
    expect(medic.supportTargetId).toBeUndefined();
    expect(medic.supportMode).toBe("auto");
    expect(state.losses.units).toEqual([3, 4]);
    expect(state.nextId).toBe(nextId);
  });

  it("compacts after objective evaluation while preserving target IDs", () => {
    const state = makeFixture({ width: 16, height: 12, win: { kind: "destroyMarked", targetCount: 1 } });
    addBuilding(state, 0, "constructionYard", 1, 1);
    const target = addBuilding(state, 1, "objective", 10, 6, 0, true);
    state.win.targetIds = [target.id];
    state.runtime = {
      kind: "destroyMarked",
      phase: "active",
      targetIds: [target.id],
      rescued: 0,
      required: 1,
      secondary: [],
    };
    target.hp = 0;

    tick(state);

    expect(state.result).toBe("won");
    expect(state.win.targetIds).toEqual([target.id]);
    expect(state.runtime.targetIds).toEqual([target.id]);
    expect(state.entities.some((entity) => entity.id === target.id)).toBe(false);
  });

  it("removes dead entities from saved payloads while retaining objective identity", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "destroyMarked", targetCount: 1 } });
    const target = addBuilding(state, 1, "objective", 8, 8, 0, true);
    target.hp = 0;
    state.win.targetIds = [target.id];
    state.runtime = {
      kind: "destroyMarked",
      phase: "active",
      targetIds: [target.id],
      rescued: 0,
      required: 1,
      secondary: [],
    };

    const restored = deserializeState(serializeState(state));

    expect(restored.entities.some((entity) => entity.id === target.id)).toBe(false);
    expect(restored.win.targetIds).toEqual([target.id]);
    expect(restored.runtime?.targetIds).toEqual([target.id]);
  });

  it("keeps shared production when its active producer is destroyed", () => {
    const state = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    addBuilding(state, 0, "power", 0, 0);
    const barracks = addBuilding(state, 0, "barracks", 4, 4);
    const spareBarracks = addBuilding(state, 0, "barracks", 8, 4);
    state.productionQueues![0] = {
      barracks: { producing: { kind: "infantry", remaining: 1 }, queue: ["antiArmor"] },
    };
    state.activeProducerIds![0] = { barracks: barracks.id };
    const startCredits = state.credits[0];
    barracks.hp = 0;

    compactDestroyedEntities(state);

    expect(state.credits[0]).toBe(startCredits);
    expect(state.entities.some((entity) => entity.id === barracks.id)).toBe(false);
    const events = tickProduction(state);
    expect(events).toContainEqual(expect.objectContaining({
      type: "produced",
      kind: "infantry",
      sourceId: spareBarracks.id,
    }));
    expect(state.productionQueues?.[0]?.barracks?.producing?.kind).toBe("antiArmor");
    expect(state.credits[0]).toBe(startCredits);
  });

  it("preserves shared queues in a compacted save without refunding jobs", () => {
    const state = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const barracks = addBuilding(state, 0, "barracks", 4, 4);
    addBuilding(state, 0, "barracks", 8, 4);
    state.productionQueues![0] = {
      barracks: { producing: { kind: "infantry", remaining: 20 }, queue: ["antiArmor"] },
    };
    state.activeProducerIds![0] = { barracks: barracks.id };
    barracks.hp = 0;
    const startCredits = state.credits[0];

    const restored = deserializeState(serializeState(state));

    expect(state.credits[0]).toBe(startCredits);
    expect(state.entities.some((entity) => entity.id === barracks.id)).toBe(true);
    expect(restored.credits[0]).toBe(startCredits);
    expect(restored.entities.some((entity) => entity.id === barracks.id)).toBe(false);
    expect(restored.productionQueues?.[0]?.barracks).toEqual({
      producing: { kind: "infantry", remaining: 20 },
      queue: ["antiArmor"],
    });

    compactDestroyedEntities(state);

    expect(state.credits[0]).toBe(startCredits);
    expect(state.entities.some((entity) => entity.id === barracks.id)).toBe(false);
    expect(state.productionQueues?.[0]?.barracks).toEqual({
      producing: { kind: "infantry", remaining: 20 },
      queue: ["antiArmor"],
    });
  });
});
