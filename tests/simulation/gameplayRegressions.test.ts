import { describe, expect, it } from "vitest";
import { UNIT_STATS } from "../../lib/catalog";
import { createSkirmish, issue, tick } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture, setHeight, setTile, TILE_BLOCKED, TILE_RESOURCE } from "../../lib/sim/fixtures";
import { bestResource, nearestResource, tickEconomy } from "../../lib/sim/economy";
import { tickMovement } from "../../lib/sim/movement";
import { resetPathBudget } from "../../lib/sim/pathBudget";
import { tickProduction } from "../../lib/sim/production";
import { tickRepair } from "../../lib/sim/repair";
import { tickSupport } from "../../lib/sim/support";
import { invalidateNavigation } from "../../lib/sim/world";
import { tickCombat } from "../../lib/sim/combat";
import { decodeSavedState } from "../../lib/persist/save/serialize";
import { isEntity } from "../../lib/persist/save/validation";
import { CompetentCommander } from "../../lib/sim/commander";

describe("multiplayer production rally determinism", () => {
  it("routes every owner's reinforcements identically on all four clients", () => {
    const clients = ([0, 1, 2, 3] as const).map((viewer) => {
      const { state } = createSkirmish(421, viewer, [0, 1, 2, 3]);
      for (const owner of [0, 1, 2, 3] as const) {
        const barracks = state.entities.find((e) => e.owner === owner && e.kind === "barracks")!;
        expect(issue(state, { type: "rally", owner, buildingId: barracks.id, x: 40, y: 40 })).toEqual([]);
        expect(issue(state, { type: "produce", owner, fromId: barracks.id, unit: "infantry" })).toEqual([]);
        state.productionQueues![owner]!.barracks!.producing!.remaining = 1;
      }
      const firstProducedId = state.nextId;
      tickProduction(state);
      const units = state.entities.filter((e) => e.id >= firstProducedId);
      expect(units).toHaveLength(4);
      for (const unit of units) {
        expect(unit.orderDestination).toEqual({ x: 40, y: 40 });
        expect(unit.path.length > 0 || unit.routePending).toBeTruthy();
      }
      return state;
    });
    for (let step = 0; step < 36; step++) {
      for (const state of clients) tick(state);
      for (const state of clients.slice(1)) {
        expect(state.entities).toEqual(clients[0].entities);
        expect(state.credits).toEqual(clients[0].credits);
        expect(state.rngState).toBe(clients[0].rngState);
      }
    }
  });

  it("uses a runway aircraft's owner for its rally order", () => {
    const state = makeFixture({ width: 30, height: 30, win: { kind: "holdTheLine" } });
    state.viewOwner = 0;
    addBuilding(state, 1, "power", 1, 1);
    const runway = addBuilding(state, 1, "runway", 5, 5);
    runway.rallyPoint = { x: 20, y: 20 };
    runway.producing = { kind: "strikePlane", remaining: 1 };
    tickProduction(state);
    const plane = state.entities.find((e) => e.kind === "strikePlane")!;
    expect(plane.owner).toBe(1);
    expect(plane.orderDestination).toEqual(runway.rallyPoint);
    expect(plane.flightState).toBe("airborne");
  });
});

describe("commander siege after repair corrections", () => {
  it("focuses fire on production structures with units in weapon range while the rest approach", () => {
    const state = makeFixture({ width: 40, height: 40, win: { kind: "annihilate", ticks: 1000 } });
    state.tick = 720;
    addBuilding(state, 0, "constructionYard", 2, 2);
    const target = addBuilding(state, 1, "barracks", 30, 30);
    target.hp -= 100;
    target.repairing = true;
    const tank = addUnit(state, 0, "tank", 27, 30);
    const infantry = addUnit(state, 0, "infantry", 32, 31);
    const reinforcements = addUnit(state, 0, "tank", 15, 15);
    const orders = new CompetentCommander().plan(state);
    expect(orders).toContainEqual({ type: "attack", unitIds: [tank.id, infantry.id], targetId: target.id });
    expect(orders).toContainEqual({ type: "attackMove", unitIds: [reinforcements.id], x: target.x, y: target.y, formation: "wedge" });
  });
});

describe("repair requires an enemy firing position", () => {
  it("pauses repairs between opportunistic shots without changing travel orders, including after loading", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "holdTheLine" } });
    const building = addBuilding(state, 0, "power", 6, 6);
    const attacker = addUnit(state, 1, "tank", 3, 6);
    building.hp -= 100;
    building.repairing = true;
    issue(state, { type: "attackMove", owner: 1, unitIds: [attacker.id], x: 2, y: 2 });
    const destination = { ...attacker.orderDestination! };
    for (let i = 0; i < 4; i++) {
      tickCombat(state);
      const hp = building.hp;
      tickRepair(state);
      expect(building.hp).toBe(hp);
      expect(attacker.attackTarget).toBeUndefined();
      expect(attacker.orderDestination).toEqual(destination);
      state.tick += 1;
    }
    const loaded = decodeSavedState(JSON.parse(JSON.stringify(state)));
    const loadedBuilding = loaded.entities.find((e) => e.id === building.id)!;
    expect(loaded.entities.find((e) => e.id === attacker.id)!.lastFiredTargetId).toBe(building.id);
    const hp = loadedBuilding.hp;
    tickRepair(loaded);
    expect(loadedBuilding.hp).toBe(hp);
    attacker.x = 0;
    tickRepair(state);
    expect(building.hp).toBeGreaterThan(hp);
    expect(isEntity({ ...attacker, lastFiredTargetId: -1 })).toBe(false);
  });

  it("allows repairs while an attacker is still crossing the skirmish map", () => {
    const { state } = createSkirmish(421, 0);
    const yard = state.entities.find((e) => e.owner === 0 && e.kind === "constructionYard")!;
    const attacker = state.entities.find((e) => e.owner === 1 && e.kind === "infantry")!;
    yard.hp -= 100;
    issue(state, { type: "attack", owner: 1, unitIds: [attacker.id], targetId: yard.id });
    issue(state, { type: "repair", buildingId: yard.id });
    for (let i = 0; i < 60; i++) tick(state);
    expect(yard.hp).toBe(yard.maxHp);
  });

  it("allows repairs behind a ridge but pauses once the enemy has line of sight", () => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "holdTheLine" } });
    const building = addBuilding(state, 0, "power", 6, 6);
    const attacker = addUnit(state, 1, "tank", 3, 6);
    building.hp -= 100;
    building.repairing = true;
    attacker.attackTarget = building.id;
    setHeight(state, 4, 6, 4);
    const hp = building.hp;
    tickRepair(state);
    expect(building.hp).toBeGreaterThan(hp);
    setHeight(state, 4, 6, 1);
    const repairedHp = building.hp;
    tickRepair(state);
    expect(building.hp).toBe(repairedHp);
  });

  it.each(["empty", "servicing", "landing", "wrongDomain"] as const)("does not block repair with a %s aircraft or weapon", (condition) => {
    const state = makeFixture({ win: { kind: "holdTheLine" } });
    const building = addBuilding(state, 0, "power", 5, 5);
    const attacker = condition === "wrongDomain"
      ? addBuilding(state, 1, "antiAirTurret", 5, 8)
      : addUnit(state, 1, "strikePlane", 5, 8);
    building.hp -= 100;
    building.repairing = true;
    attacker.attackTarget = building.id;
    if (condition === "empty") attacker.ammo = 0;
    if (condition === "servicing") attacker.flightState = "servicing";
    if (condition === "landing") attacker.landingRunwayId = 999;
    const hp = building.hp;
    tickRepair(state);
    expect(building.hp).toBeGreaterThan(hp);
  });
});

describe("reachable harvesting", () => {
  function dividedField() {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "harvestQuota", target: 99999 } });
    for (let y = 0; y < state.height; y++) setTile(state, 10, y, TILE_BLOCKED);
    setTile(state, 12, 5, TILE_RESOURCE, 1000);
    setTile(state, 2, 16, TILE_RESOURCE, 1000);
    const harvester = addUnit(state, 0, "harvester", 8, 5);
    return { state, harvester };
  }

  it("chooses reachable ore and recovers from an explicit unreachable assignment", () => {
    const { state, harvester } = dividedField();
    expect(nearestResource(state, harvester)).toEqual({ x: 2, y: 16 });
    expect(bestResource(state, harvester, new Map())).toEqual({ x: 2, y: 16 });
    issue(state, { type: "harvest", unitIds: [harvester.id], x: 12, y: 5 });
    for (let i = 0; i < 300; i++) {
      resetPathBudget(state);
      tickEconomy(state);
      tickMovement(state);
      state.tick += 1;
    }
    expect(harvester.carry).toBeGreaterThan(0);
    expect(state.resourceAmount[5 * state.width + 12]).toBe(1000);
    expect(state.resourceAmount[16 * state.width + 2]).toBeLessThan(1000);
  });

  it("reselects ore after navigation changes block its original field", () => {
    const { state, harvester } = dividedField();
    setTile(state, 10, 5, 0);
    tickEconomy(state);
    expect(harvester.gatherX).toBe(12);
    setTile(state, 10, 5, TILE_BLOCKED);
    invalidateNavigation(state);
    tickEconomy(state);
    expect([harvester.gatherX, harvester.gatherY]).toEqual([2, 16]);
  });

  it("unloads partial cargo when only unreachable ore remains", () => {
    const { state, harvester } = dividedField();
    setTile(state, 2, 16, 0);
    addBuilding(state, 0, "refinery", 2, 2);
    harvester.carry = 20;
    for (let i = 0; i < 200 && harvester.carry > 0; i++) {
      resetPathBudget(state);
      tickEconomy(state);
      tickMovement(state);
      state.tick += 1;
    }
    expect(harvester.carry).toBe(0);
    expect(state.creditsEarned[0]).toBe(20);
  });

  it("can harvest ore from a reachable adjacent cell even when its tile is covered", () => {
    const state = makeFixture({ win: { kind: "harvestQuota", target: 99999 } });
    setTile(state, 5, 5, TILE_RESOURCE, 1000);
    addBuilding(state, 0, "power", 5, 5);
    const harvester = addUnit(state, 0, "harvester", 2, 5);
    expect(bestResource(state, harvester, new Map())).toEqual({ x: 5, y: 5 });
  });

  it("waits when all ore is unreachable and resumes when a route opens", () => {
    const { state, harvester } = dividedField();
    setTile(state, 2, 16, 0);
    tickEconomy(state);
    expect(harvester.gatherX).toBeUndefined();
    expect(harvester.orderDestination).toBeUndefined();
    expect(harvester.idle).toBe(true);
    setTile(state, 10, 5, 0);
    invalidateNavigation(state);
    tickEconomy(state);
    expect([harvester.gatherX, harvester.gatherY]).toEqual([12, 5]);
  });
});

describe("manual travel takes priority over automation", () => {
  it.each([false, true])("keeps a loaded harvester's %s group travel until arrival, then unloads", (group) => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "harvestQuota", target: 99999 } });
    addBuilding(state, 0, "refinery", 2, 2);
    const harvester = addUnit(state, 0, "harvester", 8, 8);
    harvester.carry = UNIT_STATS.harvester.carryMax;
    const escort = addUnit(state, 0, "infantry", 8, 9);
    issue(state, { type: "move", unitIds: group ? [harvester.id, escort.id] : [harvester.id], x: 14, y: 14 });
    const destination = { ...harvester.orderDestination! };
    const flowGoal = harvester.flowGoal;
    tickEconomy(state);
    expect(harvester.orderDestination).toEqual(destination);
    expect(harvester.flowGoal).toEqual(flowGoal);
    for (let i = 0; i < 300 && harvester.moveToHarvest; i++) {
      resetPathBudget(state);
      tickMovement(state);
      tickEconomy(state);
      state.tick += 1;
    }
    expect(harvester.moveToHarvest).toBeUndefined();
    expect(Math.hypot(harvester.x - destination.x, harvester.y - destination.y)).toBeLessThanOrEqual(0.1);
    expect(harvester.orderDestination).not.toEqual(destination);
    for (let i = 0; i < 350 && harvester.carry > 0; i++) {
      resetPathBudget(state);
      tickEconomy(state);
      tickMovement(state);
      state.tick += 1;
    }
    expect(state.creditsEarned[0]).toBe(UNIT_STATS.harvester.carryMax);
  });

  it.each(["medic", "repairTruck"] as const)("keeps a %s's group retreat and resumes support after arrival", (kind) => {
    const state = makeFixture({ width: 20, height: 20, win: { kind: "holdTheLine" } });
    const provider = addUnit(state, 0, kind, 8, 8);
    const wounded = addUnit(state, 0, kind === "medic" ? "infantry" : "tank", 8, 9);
    const escort = addUnit(state, 0, "infantry", 9, 8);
    wounded.hp -= 40;
    issue(state, { type: "attackMove", unitIds: [provider.id, escort.id], x: 3, y: 3 });
    const destination = { ...provider.orderDestination! };
    const flowGoal = provider.flowGoal;
    expect(tickSupport(state)).toEqual([]);
    expect(provider.orderDestination).toEqual(destination);
    expect(provider.flowGoal).toEqual(flowGoal);
    let reached = false;
    for (let i = 0; i < 250; i++) {
      resetPathBudget(state);
      tickMovement(state);
      reached ||= Math.hypot(provider.x - destination.x, provider.y - destination.y) <= 0.1;
      tickSupport(state);
      state.tick += 1;
      if (provider.supportTargetId !== undefined) break;
    }
    expect(reached).toBe(true);
    expect(provider.supportTargetId).toBe(wounded.id);
  });
});
