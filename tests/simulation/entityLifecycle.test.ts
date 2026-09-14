import { describe, expect, it } from "vitest";
import { compactDestroyedEntities } from "../../lib/sim/world";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { tick } from "../../lib/sim/api";
import { deserializeState, serializeState } from "../../lib/persist/save";
import { UNIT_STATS } from "../../lib/catalog";

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

  it("refunds prepaid production when a player producer is destroyed", () => {
    const state = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const barracks = addBuilding(state, 0, "barracks", 4, 4);
    barracks.producing = { kind: "infantry", remaining: 20 };
    barracks.queue = ["antiArmor"];
    const startCredits = state.credits[0];
    barracks.hp = 0;

    compactDestroyedEntities(state);

    expect(state.credits[0]).toBe(startCredits + UNIT_STATS.infantry.cost + UNIT_STATS.antiArmor.cost);
    expect(state.entities.some((entity) => entity.id === barracks.id)).toBe(false);
  });

  it("credits a save snapshot without double-refunding the live world", () => {
    const state = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    const barracks = addBuilding(state, 0, "barracks", 4, 4);
    barracks.producing = { kind: "infantry", remaining: 20 };
    barracks.queue = ["antiArmor"];
    barracks.hp = 0;
    const payout = UNIT_STATS.infantry.cost + UNIT_STATS.antiArmor.cost;
    const startCredits = state.credits[0];

    const restored = deserializeState(serializeState(state));

    expect(state.credits[0]).toBe(startCredits);
    expect(state.entities.some((entity) => entity.id === barracks.id)).toBe(true);
    expect(restored.credits[0]).toBe(startCredits + payout);
    expect(restored.entities.some((entity) => entity.id === barracks.id)).toBe(false);

    compactDestroyedEntities(state);

    expect(state.credits[0]).toBe(startCredits + payout);
    expect(state.entities.some((entity) => entity.id === barracks.id)).toBe(false);
  });
});
