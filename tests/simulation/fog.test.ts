import { describe, expect, it } from "vitest";
import { MAP_SKIRT } from "../../lib/gen/map";
import { visibleBuildingAt } from "../../lib/render/renderer";
import { expandFog, fogAt, fogGridHeight, fogGridWidth, fogIndex, makeFog, tickFog } from "../../lib/sim/fog";
import { addBuilding, addUnit, makeFixture } from "../../lib/sim/fixtures";
import { deserializeState, serializeState } from "../../lib/persist/save";
import { entityVisible } from "../../lib/render/renderPicking";

describe("out of bounds shroud", () => {
  it("stores fog across the map skirt", () => {
    const s = makeFixture({ width: 10, height: 8, win: { kind: "annihilate" } });
    expect(s.fog).toHaveLength(fogGridWidth(10) * fogGridHeight(8));
    expect(fogAt(s, 0, 0)).toBe(2);
    expect(fogAt(s, -1, 3)).toBe(2);
    expect(fogAt(s, 10 + MAP_SKIRT, 0)).toBe(0);
  });

  it("keeps discovered skirt tiles revealed after vision leaves", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    s.fog = makeFog(12, 12, 0);
    addUnit(s, 0, "infantry", 1, 1);
    tickFog(s);
    expect(fogAt(s, 0, 0)).toBe(2);
    expect(fogAt(s, -2, 1)).toBe(2);
    expect(fogAt(s, -MAP_SKIRT, 1)).toBe(0);

    s.entities[0]!.x = 10;
    s.entities[0]!.y = 10;
    tickFog(s);
    expect(fogAt(s, -2, 1)).toBe(2);
    expect(fogAt(s, 10, 10)).toBe(2);
  });

  it("expands legacy in-map fog onto the skirt", () => {
    const s = makeFixture({ width: 6, height: 6, win: { kind: "annihilate" } });
    const legacy = JSON.parse(serializeState(s)) as { fog: number[]; width: number; height: number };
    legacy.fog = new Array(36).fill(1);
    legacy.fog[0] = 2;
    const loaded = deserializeState(JSON.stringify(legacy));
    expect(loaded.fog).toHaveLength(fogGridWidth(6) * fogGridHeight(6));
    expect(fogAt(loaded, 0, 0)).toBe(2);
    expect(fogAt(loaded, 1, 0)).toBe(1);
    expect(fogAt(loaded, -1, 0)).toBe(0);
    expect(expandFog(legacy.fog, 6, 6)).toHaveLength(loaded.fog.length);
  });
});

describe("hover under shroud", () => {
  it("does not reveal a building footprint on unexplored tiles", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    s.fog = makeFog(12, 12, 0);
    const yard = addBuilding(s, 1, "constructionYard", 4, 4);
    expect(visibleBuildingAt(s, 4, 4)).toBeUndefined();
    expect(visibleBuildingAt(s, 5, 5)).toBeUndefined();

    s.fog[fogIndex(s, 4, 4)!] = 2;
    s.fog[fogIndex(s, 5, 4)!] = 2;
    s.fog[fogIndex(s, 4, 5)!] = 2;
    s.fog[fogIndex(s, 5, 5)!] = 2;
    expect(visibleBuildingAt(s, 4, 4)?.id).toBe(yard.id);
    expect(visibleBuildingAt(s, 5, 5)?.id).toBe(yard.id);
  });

  it("does not reveal enemy buildings that were seen but are not in sight", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    s.fog = makeFog(12, 12, 1);
    addBuilding(s, 1, "turret", 6, 6);
    expect(visibleBuildingAt(s, 6, 6)).toBeUndefined();
  });

  it("still outlines friendly buildings in sight", () => {
    const s = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    const power = addBuilding(s, 0, "power", 3, 3);
    expect(visibleBuildingAt(s, 3, 3)?.id).toBe(power.id);
  });
});

describe("scenario shroud", () => {
  it("keeps a neutral stranded unit from revealing or rendering through unexplored fog", () => {
    const state = makeFixture({ width: 24, height: 24, win: { kind: "rescue", targetCount: 1, ticks: 100 } });
    state.fog = makeFog(state.width, state.height, 0);
    const stranded = addUnit(state, 0, "infantry", 12, 12);
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";

    tickFog(state);

    expect(fogAt(state, stranded.x, stranded.y)).toBe(0);
    expect(entityVisible(state, stranded)).toBe(false);

    stranded.neutral = false;
    tickFog(state);

    expect(fogAt(state, stranded.x, stranded.y)).toBe(2);
    expect(entityVisible(state, stranded)).toBe(true);
  });
});
