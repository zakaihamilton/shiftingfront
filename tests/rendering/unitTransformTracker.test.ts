import { beforeEach, describe, expect, it } from "vitest";
import { createMission } from "../../lib/sim/api";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import {
  computeUnitDynamicTransform,
  resetUnitTransformTracker,
  updateUnitHistory,
} from "../../lib/render/gl/unitTransformTracker";

describe("unitTransformTracker sub-tick interpolation and dynamics", () => {
  beforeEach(() => {
    resetUnitTransformTracker();
  });
  it("interpolates unit position smoothly with subTickAlpha", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected at least one unit in mission");

    updateUnitHistory(state, 1000);

    // Simulate unit stepping to next tile on new tick
    state.tick += 1;
    unit.x += 1;
    unit.y += 0;
    updateUnitHistory(state, 1083);

    // subTickAlpha at 0.5 should be exactly halfway
    const mid = computeUnitDynamicTransform(unit, state, 0.5, 1041);
    expect(mid.x).toBeCloseTo(unit.x - 0.5, 2);

    // subTickAlpha at 1.0 should be at current position
    const end = computeUnitDynamicTransform(unit, state, 1.0, 1083);
    expect(end.x).toBeCloseTo(unit.x, 2);
  });

  it("calculates terrain pitch and roll smoothly", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit in mission");

    updateUnitHistory(state, 1000);
    const dyn = computeUnitDynamicTransform(unit, state, 0, 1000);

    expect(typeof dyn.pitch).toBe("number");
    expect(typeof dyn.roll).toBe("number");
    expect(typeof dyn.yaw).toBe("number");
    expect(isNaN(dyn.pitch)).toBe(false);
    expect(isNaN(dyn.roll)).toBe(false);
  });

  it("tracks target turret yaw independently from chassis", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit");

    unit.kind = "tank";
    const target = {
      id: 9999,
      owner: (unit.owner === 0 ? 1 : 0) as 0 | 1,
      class: "unit" as const,
      kind: "tank" as const,
      x: unit.x + 5,
      y: unit.y + 5,
      hp: 100,
      maxHp: 100,
      cooldown: 0,
      path: [],
      carry: 0,
      constructing: 0,
      queue: [],
      marked: false,
      idle: true,
    };
    state.entities.push(target);
    unit.attackTarget = target.id;

    updateUnitHistory(state, 1000);
    // Allow turret rotation to converge over a few frames
    computeUnitDynamicTransform(unit, state, 0, 1050);
    computeUnitDynamicTransform(unit, state, 0, 1100);
    const dyn = computeUnitDynamicTransform(unit, state, 0, 1200);

    // Expected angle towards (unit.x + 5, unit.y + 5) is Math.atan2(5, 5) - Math.PI / 4 = 0
    expect(dyn.turretYaw).toBeCloseTo(0, 1);
  });

  it("resolves attack targets from an entity id map when provided", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit");
    unit.kind = "tank";
    const target = state.entities.find((e) => e.owner !== unit.owner && e.hp > 0);
    if (!target) throw new Error("Expected opposing entity");
    unit.attackTarget = target.id;
    const byId = new Map(state.entities.map((entity) => [entity.id, entity]));
    updateUnitHistory(state, 1000);
    computeUnitDynamicTransform(unit, state, 0, 1050, byId);
    computeUnitDynamicTransform(unit, state, 0, 1100, byId);
    const dyn = computeUnitDynamicTransform(unit, state, 0, 1400, byId);
    const expected = Math.atan2(target.y - unit.y, target.x - unit.x) - Math.PI / 4;
    expect(dyn.turretYaw).toBeCloseTo(expected, 1);
  });

  it("turns the rendered chassis toward a stationary attack target", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit");
    unit.kind = "tank";
    unit.facing = 0;
    const target = state.entities.find((e) => e.owner !== unit.owner && e.hp > 0);
    if (!target) throw new Error("Expected opposing entity");
    target.x = unit.x + 5;
    target.y = unit.y + 5;
    unit.attackTarget = target.id;
    const byId = new Map(state.entities.map((entity) => [entity.id, entity]));

    updateUnitHistory(state, 1000);
    let dyn = computeUnitDynamicTransform(unit, state, 0, 1000, byId);
    for (let t = 1050; t <= 2000; t += 50) {
      dyn = computeUnitDynamicTransform(unit, state, 0, t, byId);
    }

    expect(dyn.baseFacing).toBe(2);
    expect(dyn.rotationOffset).toBeCloseTo(0, 1);
  });

  it("animates leg angles during movement", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit");

    unit.kind = "infantry";
    unit.path = [{ x: unit.x + 10, y: unit.y }];

    updateUnitHistory(state, 1000);
    const step1 = computeUnitDynamicTransform(unit, state, 0.5, 1100);
    const step2 = computeUnitDynamicTransform(unit, state, 0.5, 1200);

    expect(step1.legLAngle).not.toBe(0);
    expect(step1.legLAngle).toBeCloseTo(-step1.legRAngle, 3);
    expect(step1.legLAngle).not.toBe(step2.legLAngle);
  });

  it("snaps interpolation after a large tile jump instead of sliding from the stale cell", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit");

    updateUnitHistory(state, 1000);
    const startX = unit.x;
    const startY = unit.y;
    state.tick += 1;
    unit.x += 8;
    unit.y += 8;
    updateUnitHistory(state, 1083);

    const mid = computeUnitDynamicTransform(unit, state, 0.5, 1041);
    expect(mid.x).toBeCloseTo(unit.x, 2);
    expect(mid.y).toBeCloseTo(unit.y, 2);
    expect(mid.x).not.toBeCloseTo((startX + unit.x) / 2, 1);
    expect(mid.y).not.toBeCloseTo((startY + unit.y) / 2, 1);
  });

  it("snaps interpolation after a multi-tick hitch", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit");

    updateUnitHistory(state, 1000);
    state.tick += 5;
    unit.x += 1;
    updateUnitHistory(state, 1415);

    const mid = computeUnitDynamicTransform(unit, state, 0.5, 1200);
    expect(mid.x).toBeCloseTo(unit.x, 2);
    expect(mid.y).toBeCloseTo(unit.y, 2);
  });

  it("smoothly tracks continuous vehicle screen angle and micro-rotation offset", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit");

    unit.kind = "tank";
    unit.facing = 0;
    // Order tank to move straight South in screen coordinates (+X, +Y in tile coords)
    unit.path = [{ x: unit.x + 5, y: unit.y + 5 }];

    updateUnitHistory(state, 1000);
    const initial = computeUnitDynamicTransform(unit, state, 0, 1000);
    expect(typeof initial.screenAngle).toBe("number");
    expect(initial.baseFacing).toBeGreaterThanOrEqual(0);
    expect(initial.baseFacing).toBeLessThanOrEqual(7);
    expect(initial.rotationOffset).toBeGreaterThanOrEqual(-Math.PI / 8);
    expect(initial.rotationOffset).toBeLessThanOrEqual(Math.PI / 8);

    // After turning towards target over time, baseFacing converges to South (Facing 2)
    let turned = initial;
    for (let t = 1050; t <= 2000; t += 50) {
      turned = computeUnitDynamicTransform(unit, state, 0, t);
    }

    expect(turned.baseFacing).toBe(2);
    expect(turned.rotationOffset).toBeCloseTo(0, 1);
  });

  it("computes dynamic bipedal gait properties for walking soldiers", () => {
    const state = createMission({ seed: 101, missionIndex: 0 });
    const unit = state.entities.find((e) => e.class === "unit");
    if (!unit) throw new Error("Expected unit");

    unit.kind = "infantry";
    unit.path = [{ x: unit.x + 5, y: unit.y }];

    updateUnitHistory(state, 1000);
    const t1 = computeUnitDynamicTransform(unit, state, 0, 1100);
    const t2 = computeUnitDynamicTransform(unit, state, 0, 1250);

    expect(t1.gaitBobY).toBe(0);
    expect(typeof t1.swayX).toBe("number");
    expect(typeof t1.gaitTilt).toBe("number");
    expect(typeof t1.scaleX).toBe("number");
    expect(typeof t1.scaleY).toBe("number");
    expect(typeof t1.isFootPlant).toBe("boolean");
    expect([-1, 1]).toContain(t1.footPlantSide);
    // Leg and foot-plant state varies across the shared walk cycle; the
    // native raster art supplies the body motion without an extra bob.
    expect(t1.strideRatio).not.toBe(t2.strideRatio);
  });

  it("animates a plane gliding from the air onto the runway", () => {
    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const plane = addUnit(state, 0, "strikePlane", 10, 8);
    plane.flightState = "airborne";
    updateUnitHistory(state, 1000);
    computeUnitDynamicTransform(plane, state, 0, 1000);

    const runwayX = 3.5;
    const runwayY = 2.5;
    state.tick += 1;
    plane.x = runwayX;
    plane.y = runwayY;
    plane.flightState = "servicing";
    updateUnitHistory(state, 1083);

    const mid = computeUnitDynamicTransform(plane, state, 0, 1083 + 360);
    expect(mid.x).toBeGreaterThan(runwayX);
    expect(mid.x).toBeLessThan(10);
    expect(mid.airborneMix).toBeGreaterThan(0);
    expect(mid.airborneMix).toBeLessThan(1);

    const end = computeUnitDynamicTransform(plane, state, 0, 1083 + 720);
    expect(end.x).toBeCloseTo(runwayX, 4);
    expect(end.y).toBeCloseTo(runwayY, 4);
    expect(end.airborneMix).toBe(0);
  });

  it("animates a plane lifting off from the runway", () => {
    const state = makeFixture({ width: 20, height: 16, win: { kind: "annihilate" } });
    const plane = addUnit(state, 0, "strikePlane", 3.5, 2.5);
    plane.flightState = "servicing";
    updateUnitHistory(state, 1000);
    computeUnitDynamicTransform(plane, state, 0, 1000);

    state.tick += 1;
    plane.flightState = "airborne";
    updateUnitHistory(state, 1083);

    const mid = computeUnitDynamicTransform(plane, state, 0, 1083 + 360);
    expect(mid.x).toBeCloseTo(plane.x, 4);
    expect(mid.y).toBeCloseTo(plane.y, 4);
    expect(mid.airborneMix).toBeGreaterThan(0);
    expect(mid.airborneMix).toBeLessThan(1);

    const end = computeUnitDynamicTransform(plane, state, 0, 1083 + 720);
    expect(end.airborneMix).toBe(1);
  });

  it("keeps a servicing plane pointed along the runway while retaining its target", () => {
    const state = makeFixture({ width: 24, height: 16, win: { kind: "annihilate" } });
    const plane = addUnit(state, 0, "strikePlane", 3.5, 2.5);
    const target = addBuilding(state, 1, "power", 12, 8);
    plane.flightState = "servicing";
    plane.facing = 1;
    plane.attackTarget = target.id;

    updateUnitHistory(state, 1000);
    let dyn = computeUnitDynamicTransform(plane, state, 0, 1000, new Map(state.entities.map((e) => [e.id, e])));
    for (let time = 1050; time <= 2000; time += 50) {
      dyn = computeUnitDynamicTransform(plane, state, 0, time, new Map(state.entities.map((e) => [e.id, e])));
    }

    expect(dyn.baseFacing).toBe(1);
  });
});
