import { describe, expect, it } from "vitest";
import { makeFixture, addBuilding, addUnit, setTile } from "../../lib/sim/fixtures";
import { TILE_WATER } from "../../lib/types";
import {
  buildInfluenceMap,
  cellInfluence,
  findWeakestFlank,
} from "../../lib/sim/ai/influence";
import {
  isActiveScout,
  pickScoutTarget,
  shouldScoutRetreat,
  updateScouts,
} from "../../lib/sim/ai/scouting";

describe("strategic bot AI: influence maps and scouting", () => {
  it("builds spatial influence maps with friendly, threat, and tension metrics", () => {
    const state = makeFixture({ width: 32, height: 32, win: { kind: "annihilate" } });

    // Friendly bot tank at (8, 8)
    addUnit(state, 1, "tank", 8, 8);

    // Player tank at (24, 24)
    const playerTank = addUnit(state, 0, "tank", 24, 24);

    const map = buildInfluenceMap(state, [playerTank]);

    const nearFriendly = cellInfluence(map, 8, 8);
    expect(nearFriendly.friendly).toBeGreaterThan(0);
    expect(nearFriendly.threat).toBe(0);

    const nearPlayer = cellInfluence(map, 24, 24);
    expect(nearPlayer.threat).toBeGreaterThan(0);
  });

  it("identifies the weakest defensive flank around a player base", () => {
    const state = makeFixture({ width: 32, height: 32, win: { kind: "annihilate" } });
    const playerYard = addBuilding(state, 0, "constructionYard", 16, 16);

    // Heavily fortify the northern flank with player turrets
    addBuilding(state, 0, "turret", 16, 10);
    addBuilding(state, 0, "turret", 16, 12);
    addBuilding(state, 0, "turret", 18, 11);

    const map = buildInfluenceMap(state);
    const flank = findWeakestFlank(state, map, playerYard, 8);

    expect(flank).toBeDefined();
    // The flank should NOT be to the heavily fortified north (y < 16)
    expect(flank!.y).toBeGreaterThanOrEqual(16);
  });

  it("skips impassable flank points", () => {
    const state = makeFixture({ width: 32, height: 32, win: { kind: "annihilate" } });
    const playerYard = addBuilding(state, 0, "constructionYard", 16, 16);
    const candidates = [
      [24, 16], [22, 22], [16, 24], [10, 22],
      [8, 16], [10, 10], [16, 8], [22, 10],
    ];
    for (const [x, y] of candidates) {
      if (y !== 8) setTile(state, x, y, TILE_WATER);
    }

    const flank = findWeakestFlank(state, buildInfluenceMap(state), playerYard, 8);

    expect(flank).toEqual({ x: 16, y: 8 });
  });

  it("dispatches scouts to unexplored quadrants and retreats when threatened", () => {
    const state = makeFixture({ width: 32, height: 32, win: { kind: "annihilate" } });
    const scout = addUnit(state, 1, "infantry", 5, 5);
    const yard = addBuilding(state, 1, "constructionYard", 24, 24);
    const reserve = addUnit(state, 1, "infantry", 23, 23);
    scout.idle = true;
    reserve.idle = true;

    const map = buildInfluenceMap(state);
    const units = [scout, reserve];
    const assignments = updateScouts(state, units, map, false, yard);

    expect(assignments.length).toBe(1);
    expect(assignments[0]!.unit.id).toBe(scout.id);
    expect(assignments[0]!.target).toBeDefined();

    // In a peaceful zone, scout does not need to retreat
    expect(shouldScoutRetreat(scout, map)).toBe(false);

    // Add overwhelming player threat near the scout
    const t1 = addUnit(state, 0, "tank", 6, 5);
    const t2 = addUnit(state, 0, "tank", 6, 6);
    const t3 = addUnit(state, 0, "tank", 5, 6);

    // Advance tick past cache duration to rebuild fresh influence map
    state.tick += 15;
    const threatMap = buildInfluenceMap(state, [t1, t2, t3]);
    // Under heavy threat, scout should retreat
    expect(shouldScoutRetreat(scout, threatMap)).toBe(true);
    const retreat = updateScouts(state, units, threatMap, false, yard);
    expect(retreat).toHaveLength(1);
    expect(retreat[0]!.target).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) }));
  });

  it("keeps active patrols ahead of base-return orders and releases guarded scouts", () => {
    const state = makeFixture({ width: 32, height: 32, win: { kind: "annihilate" } });
    const scout = addUnit(state, 1, "infantry", 5, 5);
    const yard = addBuilding(state, 1, "constructionYard", 24, 24);
    const reserve = addUnit(state, 1, "infantry", 23, 23);
    scout.idle = true;
    reserve.idle = true;

    const first = updateScouts(state, [scout, reserve], buildInfluenceMap(state), false, yard);
    expect(first).toHaveLength(1);
    expect(isActiveScout(state, scout.id)).toBe(true);

    // Simulate the economy pass having assigned the scout a return-to-base order.
    scout.orderMode = "move";
    scout.orderDestination = { x: yard.x, y: yard.y };
    scout.path = [];
    scout.idle = false;
    state.tick += 1;

    const maintained = updateScouts(state, [scout, reserve], buildInfluenceMap(state), false, yard);
    expect(maintained).toEqual([{ unit: scout, target: first[0]!.target }]);

    scout.scenarioGuardTargetId = 999;
    expect(updateScouts(state, [scout, reserve], buildInfluenceMap(state), false, yard)).toHaveLength(0);
    expect(isActiveScout(state, scout.id)).toBe(false);
  });

  it("chooses a valid fallback when the selected and center patrol points are blocked", () => {
    const state = makeFixture({ width: 32, height: 32, win: { kind: "annihilate" } });
    setTile(state, 11, 11, TILE_WATER);
    setTile(state, 16, 16, TILE_WATER);

    const target = pickScoutTarget(state, 0);

    expect(state.tiles[target.y * state.width + target.x]).not.toBe(TILE_WATER);
    expect(target).not.toEqual({ x: 11, y: 11 });
    expect(target).not.toEqual({ x: 16, y: 16 });
  });

  it("rebuilds influence when explicit contact sets change within a tick", () => {
    const state = makeFixture({ width: 32, height: 32, win: { kind: "annihilate" } });
    const firstContact = addUnit(state, 0, "tank", 4, 4);
    const secondContact = addUnit(state, 0, "tank", 28, 28);

    buildInfluenceMap(state, [firstContact]);
    const secondMap = buildInfluenceMap(state, [secondContact]);

    expect(cellInfluence(secondMap, 4, 4).threat).toBe(0);
    expect(cellInfluence(secondMap, 28, 28).threat).toBeGreaterThan(0);
  });

  it("rotates a completed scout through successive patrol points", () => {
    const state = makeFixture({ width: 32, height: 32, win: { kind: "annihilate" } });
    const scout = addUnit(state, 1, "infantry", 5, 5);
    scout.idle = true;
    const first = updateScouts(state, [scout], buildInfluenceMap(state), true);
    expect(first).toHaveLength(1);

    scout.x = first[0]!.target.x;
    scout.y = first[0]!.target.y;
    scout.orderDestination = { ...first[0]!.target };
    scout.idle = true;
    state.tick += 1;

    const second = updateScouts(state, [scout], buildInfluenceMap(state), true);
    expect(second).toHaveLength(1);
    expect(second[0]!.target).not.toEqual(first[0]!.target);
  });
});
