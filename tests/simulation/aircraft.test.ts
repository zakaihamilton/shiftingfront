import { describe, expect, it } from "vitest";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { issue } from "../../lib/sim/api";
import { tickAircraft } from "../../lib/sim/aircraft";
import { tickCombat } from "../../lib/sim/combat";
import { evaluateObjectives } from "../../lib/sim/objectives";
import { compactDestroyedEntities } from "../../lib/sim/world/lifecycle";

describe("air support", () => {
  it("services one assigned plane on its dedicated runway", () => {
    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 8, 8);
    plane.assignedRunwayId = runway.id;
    runway.assignedPlaneId = plane.id;
    plane.flightState = "servicing";
    plane.ammo = 0;
    plane.maxAmmo = 3;
    plane.hp = 100;

    for (let tick = 1; tick <= 17; tick += 1) {
      state.tick = tick;
      tickAircraft(state);
    }
    expect(plane.ammo).toBe(0);
    expect(plane.hp).toBe(180);

    state.tick = 18;
    tickAircraft(state);
    expect(plane.ammo).toBe(1);
    expect(plane.hp).toBe(180);
    expect(plane.x).toBeCloseTo(3.5);
    expect(plane.y).toBeCloseTo(2.5);
    expect(plane.facing).toBe(1);
  });

  it("accepts manual landing and automatically returns after a finite sortie", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 12, 8);
    plane.assignedRunwayId = runway.id;
    runway.assignedPlaneId = plane.id;
    plane.ammo = 3;

    expect(issue(state, { type: "land", unitIds: [plane.id], runwayId: runway.id })).toEqual([]);
    expect(plane.landingRunwayId).toBe(runway.id);
    for (let i = 0; i < 80 && plane.flightState !== "servicing"; i += 1) {
      state.tick += 1;
      tickAircraft(state);
    }
    expect(plane.flightState).toBe("servicing");

    plane.flightState = "airborne";
    plane.landingRunwayId = undefined;
    plane.ammo = 0;
    tickAircraft(state);
    expect(plane.flightState).toBe("servicing");
    expect(plane.landingRunwayId).toBeUndefined();
  });

  it("does not queue a second plane on a runway already producing one", () => {
    const state = makeFixture({ width: 30, height: 20, win: { kind: "annihilate" } });
    addBuilding(state, 0, "power", 20, 2);
    const runway = addBuilding(state, 0, "runway", 2, 2);

    expect(issue(state, { type: "produce", fromId: runway.id, unit: "strikePlane" })).toEqual([]);
    expect(issue(state, { type: "produce", fromId: runway.id, unit: "strikePlane" })).toEqual([
      { type: "commandRejected", reason: "runway already assigned" },
    ]);
    expect(runway.queue).toEqual([]);
  });

  it("refills ammo after eighteen service ticks rather than on a global tick boundary", () => {
    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 8, 8);
    plane.assignedRunwayId = runway.id;
    runway.assignedPlaneId = plane.id;
    plane.flightState = "servicing";
    plane.ammo = 0;
    plane.maxAmmo = 3;

    for (let tick = 19; tick <= 36; tick += 1) {
      state.tick = tick;
      tickAircraft(state);
    }
    expect(plane.ammo).toBe(1);
  });

  it("automatically relaunches toward its previous target after rearming", () => {
    const state = makeFixture({ width: 30, height: 20, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 12, 8);
    const target = addBuilding(state, 1, "power", 18, 8);
    plane.assignedRunwayId = runway.id;
    runway.assignedPlaneId = plane.id;
    plane.ammo = 0;
    plane.maxAmmo = 3;
    plane.attackTarget = target.id;

    tickAircraft(state);
    expect(plane.landingRunwayId).toBe(runway.id);

    for (let tick = 0; tick < 120 && plane.flightState !== "servicing"; tick += 1) {
      state.tick += 1;
      tickAircraft(state);
    }
    expect(plane.flightState).toBe("servicing");

    for (let tick = 0; tick < 60 && plane.flightState === "servicing"; tick += 1) {
      state.tick += 1;
      tickAircraft(state);
    }

    expect(plane.flightState).toBe("airborne");
    expect(plane.attackTarget).toBe(target.id);
    expect(plane.ammo).toBe(3);
    expect(plane.orderMode).toBe("attack");
    expect(plane.orderDestination).toEqual({ x: target.x, y: target.y });

    const runwayPosition = { x: plane.x, y: plane.y };
    state.tick += 1;
    tickAircraft(state);
    expect(Math.hypot(plane.x - runwayPosition.x, plane.y - runwayPosition.y)).toBeGreaterThan(0);
  });

  it("does not return to a destroyed runway", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 12, 8);
    runway.hp = 0;
    plane.assignedRunwayId = runway.id;
    plane.ammo = 0;
    plane.maxAmmo = 3;
    plane.flightState = "airborne";

    tickAircraft(state);

    expect(plane.assignedRunwayId).toBeUndefined();
    expect(plane.landingRunwayId).toBeUndefined();
    expect(plane.flightState).toBe("airborne");
  });

  it("rejects landing on a destroyed runway", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 12, 8);
    runway.hp = 0;
    plane.assignedRunwayId = runway.id;

    expect(issue(state, { type: "land", unitIds: [plane.id], runwayId: runway.id })).toEqual([
      { type: "commandRejected", reason: "invalid runway" },
    ]);
    expect(plane.landingRunwayId).toBeUndefined();
  });

  it("does not let a spent plane without a runway block annihilation", () => {
    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    addBuilding(state, 0, "constructionYard", 2, 2);
    const plane = addUnit(state, 1, "strikePlane", 12, 8);
    plane.flightState = "airborne";
    plane.ammo = 0;
    plane.assignedRunwayId = undefined;

    evaluateObjectives(state);

    expect(state.result).toBe("won");
  });

  it("lets anti-air fire on aircraft while ground turrets ignore them", () => {
    const antiAirState = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const plane = addUnit(antiAirState, 0, "strikePlane", 6, 6);
    plane.stance = "hold";
    const antiAir = addBuilding(antiAirState, 1, "antiAirTurret", 8, 6);
    tickCombat(antiAirState);
    expect(plane.hp).toBeLessThan(plane.maxHp);
    expect(antiAir.attackTarget).toBe(plane.id);

    const groundTurretState = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const groundPlane = addUnit(groundTurretState, 0, "strikePlane", 6, 6);
    groundPlane.stance = "hold";
    const groundTurret = addBuilding(groundTurretState, 1, "turret", 8, 6);
    tickCombat(groundTurretState);
    expect(groundPlane.hp).toBe(groundPlane.maxHp);
    expect(groundTurret.attackTarget).toBeUndefined();
  });

  it("allows unassigned planes to land on and claim an unassigned runway", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 12, 8);
    plane.assignedRunwayId = undefined;
    runway.assignedPlaneId = undefined;

    const result = issue(state, { type: "land", unitIds: [plane.id], runwayId: runway.id });
    expect(result).toEqual([]);
    expect(plane.landingRunwayId).toBe(runway.id);
    expect(plane.assignedRunwayId).toBe(runway.id);
    expect(runway.assignedPlaneId).toBe(plane.id);

    for (let i = 0; i < 80 && plane.flightState !== "servicing"; i += 1) {
      state.tick += 1;
      tickAircraft(state);
    }
    expect(plane.flightState).toBe("servicing");
  });

  it("launches servicing plane into airborne state when runway is destroyed in lifecycle cleanup", () => {
    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 3.5, 2.5);
    plane.assignedRunwayId = runway.id;
    runway.assignedPlaneId = plane.id;
    plane.flightState = "servicing";
    plane.serviceTicks = 5;

    runway.hp = 0;
    compactDestroyedEntities(state);

    expect(plane.assignedRunwayId).toBeUndefined();
    expect(plane.landingRunwayId).toBeUndefined();
    expect(plane.flightState).toBe("airborne");
    expect(plane.serviceTicks).toBeUndefined();
    expect(plane.idle).toBe(true);
  });

  it("clears orderDestination and orderMode when plane reaches destination", () => {
    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const plane = addUnit(state, 0, "strikePlane", 5, 5);
    plane.flightState = "airborne";
    plane.orderDestination = { x: 5.1, y: 5.1 };
    plane.orderMode = "move";

    tickAircraft(state);

    expect(plane.orderDestination).toBeUndefined();
    expect(plane.orderMode).toBeUndefined();
  });
});
