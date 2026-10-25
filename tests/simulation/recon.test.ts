import { describe, expect, it } from "vitest";
import { BUILDING_STATS, UNIT_STATS, buildingLimitReached, producerFor } from "../../lib/catalog";
import { strike } from "../../lib/sim/combat/damage";
import { statsFor } from "../../lib/sim/combat/grid";
import { domainDamageScale } from "../../lib/sim/combat/targeting";
import { combatUnits } from "../../lib/sim/commander/queries";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { minimapRadarOnline } from "../../lib/sim/radar";
import { createRng } from "../../lib/seed/rng";

describe("radar minimap power", () => {
  it("stays offline until a finished radar belonging to the viewer is standing", () => {
    const state = makeFixture({ width: 16, height: 12, win: { kind: "annihilate" } });
    expect(minimapRadarOnline(state)).toBe(false);

    const constructing = addBuilding(state, 0, "radar", 2, 2, BUILDING_STATS.radar.buildTicks);
    expect(minimapRadarOnline(state)).toBe(false);

    constructing.constructing = 0;
    expect(minimapRadarOnline(state)).toBe(true);

    constructing.hp = 0;
    expect(minimapRadarOnline(state)).toBe(false);

    constructing.hp = constructing.maxHp;
    state.viewOwner = 1;
    expect(minimapRadarOnline(state)).toBe(false);
    addBuilding(state, 1, "radar", 8, 2, 0);
    expect(minimapRadarOnline(state)).toBe(true);
    expect(buildingLimitReached(state.entities, 1, "radar")).toBe(true);
  });
});

describe("scout vehicle", () => {
  it("is a fast factory recon unit that punishes infantry and not vehicles", () => {
    expect(producerFor("scout")).toBe("factory");
    expect(UNIT_STATS.scout.sight).toBeGreaterThan(UNIT_STATS.tank.sight);
    expect(UNIT_STATS.scout.speed).toBeGreaterThan(UNIT_STATS.infantry.speed);

    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const scout = addUnit(state, 0, "scout", 2, 2);
    const infantry = addUnit(state, 1, "infantry", 6, 2);
    const tank = addUnit(state, 1, "tank", 6, 6);
    const harvester = addUnit(state, 1, "harvester", 6, 10);
    expect(domainDamageScale(scout, infantry)).toBeGreaterThan(domainDamageScale(scout, tank) * 5);
    expect(domainDamageScale(scout, infantry)).toBeGreaterThan(domainDamageScale(scout, harvester) * 4);

    const infantryHp = infantry.hp;
    strike(state, scout, infantry, statsFor(scout), createRng(3), []);
    const infantryLoss = infantryHp - infantry.hp;
    const tankHp = tank.hp;
    const second = addUnit(state, 0, "scout", 2, 8);
    strike(state, second, tank, statsFor(second), createRng(3), []);
    const tankLoss = tankHp - tank.hp;
    expect(infantryLoss).toBeGreaterThan(tankLoss * 8);
    expect(tank.hp).toBeGreaterThan(tank.maxHp * 0.9);

    addUnit(state, 0, "infantry", 3, 3);
    expect(combatUnits(state).map((unit) => unit.kind)).toEqual(["infantry"]);
  });
});
