import { describe, expect, it } from "vitest";
import { canSupportTarget, isSupportUnit, isUnitAvailable, UNIT_STATS } from "../../lib/catalog";
import { tickAi } from "../../lib/sim/ai";
import { issue } from "../../lib/sim/orders";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { holdSupport, tickSupport } from "../../lib/sim/support";
import { missionDifficulty } from "../../lib/sim/difficulty";

describe("support units", () => {
  it("classifies support targets by reusable domain", () => {
    expect(canSupportTarget("medic", "infantry")).toBe(true);
    expect(canSupportTarget("medic", "antiArmor")).toBe(true);
    expect(canSupportTarget("medic", "tank")).toBe(false);
    expect(canSupportTarget("repairTruck", "tank")).toBe(true);
    expect(canSupportTarget("repairTruck", "harvester")).toBe(true);
    expect(canSupportTarget("repairTruck", "infantry")).toBe(false);
    expect(canSupportTarget("medic", "repairTruck")).toBe(false);
    expect(isSupportUnit("medic")).toBe(true);
    expect(isSupportUnit("convoyTruck")).toBe(false);
    expect(isUnitAvailable("convoyTruck", 0)).toBe(false);
    expect(UNIT_STATS.medic.supportInterval).toBe(24);
  });

  it("auto-heals a wounded human target but never crosses domains", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const medic = addUnit(state, 0, "medic", 2, 2);
    const infantry = addUnit(state, 0, "infantry", 3, 2);
    const tank = addUnit(state, 0, "tank", 3, 3);
    infantry.hp = infantry.maxHp - 20;
    tank.hp = tank.maxHp - 100;

    const events = tickSupport(state);

    expect(infantry.hp).toBe(infantry.maxHp - 8);
    expect(tank.hp).toBe(tank.maxHp - 100);
    expect(events).toEqual([
      expect.objectContaining({ type: "support", providerId: medic.id, targetId: infantry.id, amount: 12 }),
    ]);
    expect(medic.supportMode).toBe("auto");
    expect(medic.supportTargetId).toBe(infantry.id);
  });

  it("clears the completed auto-support route after healing", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const medic = addUnit(state, 0, "medic", 2, 2);
    const infantry = addUnit(state, 0, "infantry", 3, 2);
    infantry.hp -= 20;

    tickSupport(state);
    for (let i = 0; i < 24; i++) tickSupport(state);
    expect(infantry.hp).toBe(infantry.maxHp);

    tickSupport(state);
    expect(medic.supportTargetId).toBeUndefined();
    expect(medic.orderDestination).toBeUndefined();
    expect(medic.idle).toBe(true);
  });

  it("heals vehicles with a repair truck and supports an explicit assignment", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const truck = addUnit(state, 0, "repairTruck", 2, 2);
    const harvester = addUnit(state, 0, "harvester", 3, 2);
    const tank = addUnit(state, 0, "tank", 4, 2);
    harvester.hp -= 40;
    tank.hp -= 80;

    const assignment = issue(state, { type: "support", unitIds: [truck.id], targetId: tank.id });
    expect(assignment).toEqual([]);
    expect(truck.supportMode).toBe("assigned");
    expect(truck.supportTargetId).toBe(tank.id);

    const events = tickSupport(state);
    expect(events[0]).toEqual(expect.objectContaining({ targetId: tank.id, amount: 20 }));
    expect(harvester.hp).toBe(harvester.maxHp - 40);
  });

  it("turns Stop into hold mode and resumes auto support after a move", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const medic = addUnit(state, 0, "medic", 2, 2);
    const infantry = addUnit(state, 0, "infantry", 3, 2);
    infantry.hp -= 20;

    holdSupport(medic);
    expect(tickSupport(state)).toEqual([]);
    expect(infantry.hp).toBe(infantry.maxHp - 20);

    expect(issue(state, { type: "move", unitIds: [medic.id], x: 5, y: 5 })).toEqual([]);
    expect(medic.supportMode).toBe("auto");
    expect(medic.supportTargetId).toBeUndefined();
    expect(tickSupport(state)).toEqual([
      expect.objectContaining({ type: "support", targetId: infantry.id }),
    ]);
    expect(medic.supportTargetId).toBe(infantry.id);
  });

  it("allows support production from the first mission", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const barracks = addBuilding(state, 0, "barracks", 2, 2);
    addBuilding(state, 0, "power", 5, 2);

    expect(isUnitAvailable("medic", 0)).toBe(true);
    expect(isUnitAvailable("repairTruck", 0)).toBe(true);
    expect(isUnitAvailable("convoyTruck", 0)).toBe(false);
    expect(issue(state, { type: "produce", fromId: barracks.id, unit: "medic" })).toEqual([]);
    expect(barracks.producing).toEqual({ kind: "medic", remaining: UNIT_STATS.medic.buildTicks });
  });

  it("lets the AI produce a medic for a damaged human force", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    state.missionIndex = 0;
    addBuilding(state, 1, "constructionYard", 4, 4);
    addBuilding(state, 1, "power", 7, 4);
    addBuilding(state, 1, "refinery", 4, 8);
    const barracks = addBuilding(state, 1, "barracks", 7, 8);
    const infantry = addUnit(state, 1, "infantry", 9, 8);
    infantry.hp -= 20;
    state.tick = missionDifficulty(0).enemyProductionStart;

    tickAi(state);

    expect(barracks.producing?.kind).toBe("medic");
  });
});
