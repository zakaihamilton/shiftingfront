import { describe, expect, it } from "vitest";
import {
  animClock,
  animFrame,
  buildingAnim,
  constructionProgress,
  damageFlicker,
  selectionPulse,
  toFacing,
  unitMovementOffset,
  unitWalkCycle,
  unitWalkPeriod,
  unitAnim,
  unitPose,
  waterShimmer,
} from "../../lib/render/anim";
import { toIsometricFacing } from "../../lib/iso";
import { UNIT_STATS } from "../../lib/catalog";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

describe("animation helpers", () => {
  it("maps deltas to eight facings", () => {
    expect(toFacing(1, 0)).toBe(0);
    expect(toFacing(0, 1)).toBe(2);
    expect(toFacing(-1, 0)).toBe(4);
    expect(toFacing(0, -1)).toBe(6);
  });

  it("maps isometric tile deltas accurately to screen-isometric facings", () => {
    // East: +X, -Y in tile coords -> straight East on screen
    expect(toIsometricFacing(1, -1)).toBe(0);
    // South-East: +X in tile coords -> South-East on screen
    expect(toIsometricFacing(1, 0)).toBe(1);
    // South: +X, +Y in tile coords -> straight South on screen
    expect(toIsometricFacing(1, 1)).toBe(2);
    // South-West: +Y in tile coords -> South-West on screen
    expect(toIsometricFacing(0, 1)).toBe(3);
    // West: -X, +Y in tile coords -> straight West on screen
    expect(toIsometricFacing(-1, 1)).toBe(4);
    // North-West: -X in tile coords -> North-West on screen
    expect(toIsometricFacing(-1, 0)).toBe(5);
    // North: -X, -Y in tile coords -> straight North on screen
    expect(toIsometricFacing(-1, -1)).toBe(6);
    // North-East: -Y in tile coords -> North-East on screen
    expect(toIsometricFacing(0, -1)).toBe(7);
  });

  it("cycles four frames without leaving the range", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 400; t += 30) {
      const frame = animFrame(t, 90, 4, 3);
      expect(frame).toBeGreaterThanOrEqual(0);
      expect(frame).toBeLessThan(4);
      seen.add(frame);
    }
    expect(seen.size).toBe(4);
  });

  it("keeps human walk frames and gait phase on the same deterministic cycle", () => {
    for (const kind of ["infantry", "antiArmor", "medic"] as const) {
      const period = unitWalkPeriod(kind);
      const cycle = unitWalkCycle(kind, 0, 11);
      const next = unitWalkCycle(kind, period, 11);
      const wrapped = unitWalkCycle(kind, period * 4, 11);
      const transition = unitWalkCycle(kind, period * 0.11);

      expect(cycle.frame).toBe(3);
      expect(cycle.previousFrame).toBe(2);
      expect(cycle.frameBlend).toBe(0);
      expect(cycle.phase).toBeCloseTo((3 / 4) * Math.PI * 2, 8);
      expect(next.frame).toBe(0);
      expect(next.previousFrame).toBe(3);
      expect(next.frameBlend).toBe(0);
      expect(next.phase).toBeCloseTo(0, 8);
      expect(wrapped.frame).toBe(3);
      expect(wrapped.previousFrame).toBe(2);
      expect(wrapped.frameBlend).toBe(0);
      expect(wrapped.phase).toBeCloseTo((3 / 4) * Math.PI * 2, 8);
      expect(transition.frame).toBe(0);
      expect(transition.previousFrame).toBe(3);
      expect(transition.frameBlend).toBeGreaterThan(0);
      expect(transition.frameBlend).toBeLessThan(1);
      expect(unitMovementOffset(kind, cycle.frame, cycle.phase).strideRatio)
        .toBeCloseTo(Math.sin(cycle.phase), 8);
    }
  });

  it("picks move, work, attack, and idle poses from entity state", () => {
    const s = makeFixture({ win: { kind: "annihilate" } });
    const infantry = addUnit(s, 0, "infantry", 2, 2);
    expect(unitPose(infantry)).toBe("idle");
    infantry.path = [{ x: 3, y: 2 }];
    expect(unitPose(infantry)).toBe("move");
    expect(unitAnim(infantry, 12).frame).toBeGreaterThanOrEqual(0);

    infantry.path = [];
    infantry.attackTarget = 9;
    expect(unitPose(infantry)).toBe("attack");
    infantry.cooldown = UNIT_STATS.infantry.cooldown;
    expect(unitAnim(infantry, 12).frame).toBe(2);
    expect(unitAnim(infantry, 12).recoil).toBeGreaterThan(0);
    infantry.cooldown = 0;
    expect(unitAnim(infantry, 12).frame).toBe(0);

    const harvester = addUnit(s, 0, "harvester", 4, 4);
    harvester.gatherX = 5;
    harvester.gatherY = 5;
    harvester.carry = 10;
    expect(unitPose(harvester)).toBe("work");
    expect(unitAnim(harvester, 8).bobY).toBe(0);

    const idle = addUnit(s, 0, "tank", 6, 6);
    expect(unitAnim(idle, 12).bobY).toBe(0);
    idle.path = [{ x: 7, y: 6 }];
    infantry.path = [{ x: 3, y: 2 }];
    const infantryMove = new Set([0, 90, 180, 270].map((clock) => unitAnim(infantry, 12, clock).bobY));
    const tankMove = new Set([0, 90, 180, 270].map((clock) => unitAnim(idle, 12, clock).bobY));
    expect(infantryMove.size).toBe(1);
    expect(tankMove.size).toBe(1);
    expect(new Set([0, 90, 180, 270].map((clock) => unitAnim(idle, 12, clock).frame)).size).toBeGreaterThan(1);
  });

  it("derives building activity from construction and production", () => {
    const s = makeFixture({ win: { kind: "annihilate" } });
    const barracks = addBuilding(s, 0, "barracks", 2, 2, 80);
    expect(constructionProgress(barracks)).toBeGreaterThan(0);
    expect(constructionProgress(barracks)).toBeLessThan(1);
    const constructing = buildingAnim(barracks, 20);
    expect(constructing.constructing).toBe(true);
    expect(constructing.spark).toBeGreaterThan(0);

    barracks.constructing = 0;
    barracks.producing = { kind: "infantry", remaining: 40 };
    const producing = buildingAnim(barracks, 40);
    expect(producing.producing).toBe(true);
    expect(producing.doorOpen).toBeTypeOf("boolean");

    barracks.producing = undefined;
    barracks.hp = barracks.maxHp * 0.5;
    barracks.repairing = true;
    const repairing = buildingAnim(barracks, 20);
    expect(repairing.repairing).toBe(true);
    expect(repairing.spark).toBeGreaterThan(0);
  });

  it("keeps overlay helpers in range", () => {
    expect(animClock(12)).toBe(12 * (1000 / 12));
    expect(animClock(12, 500)).toBe(500);
    const shimmer = waterShimmer(1200, 3, 8);
    expect(shimmer.alpha).toBeGreaterThan(0);
    expect(shimmer.alpha).toBeLessThan(1);
    expect(selectionPulse(800)).toBeGreaterThan(0);
    expect(damageFlicker(400, 2, 0)).toBe(1);
    expect(damageFlicker(400, 2, 2)).toBeLessThan(1);
  });

  it("keeps native walk art grounded while exposing synchronized stride state", () => {
    const s = makeFixture({ win: { kind: "annihilate" } });
    const soldier = addUnit(s, 0, "infantry", 3, 3);
    soldier.facing = 0;
    soldier.path = [{ x: 4, y: 3 }];

    const movingAnim = unitAnim(soldier, 10, 100);
    expect(movingAnim.pose).toBe("move");
    expect(movingAnim.bobY).toBe(0);
    expect(movingAnim.strideRatio).toBeGreaterThanOrEqual(-1);
    expect(movingAnim.strideRatio).toBeLessThanOrEqual(1);
    expect(typeof movingAnim.swayX).toBe("number");
    expect(typeof movingAnim.tilt).toBe("number");

    const heavySoldier = addUnit(s, 0, "antiArmor", 5, 5);
    heavySoldier.path = [{ x: 6, y: 5 }];
    const heavyAnim = unitAnim(heavySoldier, 10, 100);
    expect(heavyAnim.bobY).toBe(0);

    soldier.path = [];
    const idleAnim = unitAnim(soldier, 10, 100);
    expect(idleAnim.bobY).toBe(0);
    expect(idleAnim.strideRatio).toBe(0);
  });
});
