import { describe, expect, it } from "vitest";
import { turretTargetInRange, turretTargetPoint } from "../../lib/render/renderStructures/turret";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

describe("turret target rendering", () => {
  it("rejects a stale target outside the turret weapon range", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const turret = addBuilding(state, 0, "turret", 2, 2);
    const target = addUnit(state, 1, "infantry", 8, 2);

    expect(turretTargetInRange(turret, target)).toBe(false);
  });

  it("accepts nearby enemies and aims at the closest cell of a building", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const turret = addBuilding(state, 0, "turret", 4, 4);
    const target = addBuilding(state, 1, "power", 7, 4);

    expect(turretTargetInRange(turret, target)).toBe(true);
    expect(turretTargetPoint(turret, target)).toEqual({ x: 7, y: 4 });
  });
});
