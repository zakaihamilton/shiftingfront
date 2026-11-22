import { describe, expect, it } from "vitest";
import { BUILDING_STATS } from "../../lib/catalog";
import { issue } from "../../lib/sim/api";
import {
  addBuilding,
  makeFixture,
  setHeight,
  setTile,
  TILE_RESOURCE,
} from "../../lib/sim/fixtures";
import { findPath } from "../../lib/sim/pathfinding";
import {
  BUILDING_PLACEMENT_RADIUS,
  buildingAt,
  canPlaceBuilding,
  occupies,
  powerBreakdown,
  powerFor,
} from "../../lib/sim/world";

describe("building footprints", () => {
  it("occupies every tile in the footprint", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const b = addBuilding(s, 0, "factory", 4, 4);
    expect(occupies(b, 4, 4)).toBe(true);
    expect(occupies(b, 6, 5)).toBe(true);
    expect(occupies(b, 7, 4)).toBe(false);
    expect(buildingAt(s, 5, 5)?.id).toBe(b.id);
  });

  it("rejects placement that straddles a cliff", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    setHeight(s, 3, 2, 2);
    expect(canPlaceBuilding(s, "power", 2, 2)).toBe(false);
    expect(canPlaceBuilding(s, "power", 5, 5)).toBe(true);
  });

  it("leaves one walkable tile between buildings from either faction", () => {
    const s = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 1, "power", 4, 4, 50);

    expect(canPlaceBuilding(s, "turret", 6, 4, 0, false)).toBe(false);
    expect(canPlaceBuilding(s, "turret", 7, 4, 0, false)).toBe(true);
    expect(canPlaceBuilding(s, "turret", 4, 6, 0, false)).toBe(false);
    expect(canPlaceBuilding(s, "turret", 4, 7, 0, false)).toBe(true);
    expect(canPlaceBuilding(s, "turret", 6, 6, 0, false)).toBe(false);
    expect(canPlaceBuilding(s, "turret", 7, 7, 0, false)).toBe(true);

    expect(issue(s, { type: "build", building: "turret", x: 6, y: 4 })).toEqual([
      { type: "commandRejected", reason: "invalid placement" },
    ]);
  });

  it("rejects turrets and buildings on ore fields while leaving them walkable", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    s.credits[0] = 50_000;
    addBuilding(s, 0, "constructionYard", 0, 0);
    setTile(s, 6, 4, TILE_RESOURCE, 500);
    setTile(s, 7, 4, TILE_RESOURCE, 500);
    expect(canPlaceBuilding(s, "turret", 6, 4)).toBe(false);
    expect(canPlaceBuilding(s, "power", 6, 4)).toBe(false);
    expect(issue(s, { type: "build", building: "turret", x: 6, y: 4 })).toEqual([
      { type: "commandRejected", reason: "invalid placement" },
    ]);
    expect(issue(s, { type: "build", building: "power", x: 6, y: 4 })).toEqual([
      { type: "commandRejected", reason: "invalid placement" },
    ]);
    const path = findPath(s, { x: 5, y: 4 }, { x: 8, y: 4 });
    expect(path.some((p) => p.x === 6 && p.y === 4)).toBe(true);
  });

  it("requires every new building, including turrets, to join the owner building network", () => {
    const s = makeFixture({ width: 24, height: 24, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 1, "constructionYard", 16, 16);

    expect(canPlaceBuilding(s, "power", 3, 0)).toBe(true);
    expect(canPlaceBuilding(s, "turret", 8, 0)).toBe(true);
    expect(canPlaceBuilding(s, "turret", 11, 0)).toBe(false);
    expect(canPlaceBuilding(s, "turret", 16, 16)).toBe(false);
    expect(issue(s, { type: "build", building: "turret", x: 11, y: 0 })).toEqual([
      { type: "commandRejected", reason: "invalid placement" },
    ]);
    expect(BUILDING_PLACEMENT_RADIUS).toBe(8);
  });
});

describe("power grid", () => {
  it("splits generated power from drain", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(s, 0, "constructionYard", 0, 0);
    addBuilding(s, 0, "power", 3, 0);
    addBuilding(s, 0, "barracks", 6, 0);
    const grid = powerBreakdown(s, 0);
    expect(grid.produced).toBe(BUILDING_STATS.constructionYard.power + BUILDING_STATS.power.power);
    expect(grid.used).toBe(-BUILDING_STATS.barracks.power);
    expect(grid.surplus).toBe(grid.produced - grid.used);
    expect(powerFor(s, 0)).toBe(grid.surplus);
  });
});
