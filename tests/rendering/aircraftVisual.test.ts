import { describe, expect, it } from "vitest";
import { depthOf, renderDepthOf } from "../../lib/render/renderEntities";
import { AIR_UNIT_RENDER_ELEVATION, entityElev } from "../../lib/render/renderPicking";
import { groundHeight } from "../../lib/sim/world";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";

describe("aircraft world rendering", () => {
  it("renders airborne planes above terrain but parked planes on the runway surface", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const plane = addUnit(state, 0, "strikePlane", 4, 4);
    const terrainElevation = groundHeight(state, plane.x, plane.y);

    expect(entityElev(state, plane)).toBe(terrainElevation + AIR_UNIT_RENDER_ELEVATION);

    plane.flightState = "servicing";
    expect(entityElev(state, plane)).toBe(terrainElevation);
  });

  it("draws a parked plane above its runway", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 3.5, 2.5);
    plane.flightState = "servicing";

    expect(renderDepthOf(plane, plane)).toBeGreaterThan(depthOf(runway));
  });

  it("keeps a plane above the runway throughout takeoff", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const runway = addBuilding(state, 0, "runway", 2, 2);
    const plane = addUnit(state, 0, "strikePlane", 3.5, 2.5);
    plane.flightState = "airborne";

    expect(renderDepthOf(plane, { x: plane.x, y: plane.y, airborneMix: 0.5 }))
      .toBeGreaterThan(depthOf(runway));
    expect(renderDepthOf(plane, { x: plane.x, y: plane.y, airborneMix: 1 }))
      .toBe(plane.x + plane.y);
  });
});
