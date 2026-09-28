import { describe, expect, it } from "vitest";
import { createMissionIntroPlan } from "@/lib/render/missionIntro";
import { createSkirmish } from "@/lib/sim/api";

describe("procedural mission arrival", () => {
  it("builds a deterministic vehicle route and a map-sized Mode 7 terrain palette", () => {
    const state = createSkirmish(6482, 0).state;
    const first = createMissionIntroPlan(state);
    const second = createMissionIntroPlan(state);

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(first!.route).toEqual(second!.route);
    expect(first!.route.length).toBeGreaterThan(2);
    expect(first!.routeLength).toBeGreaterThan(0);
    expect(first!.terrainRgb).toHaveLength(state.width * state.height * 3);
    expect(first!.heights).toHaveLength(state.width * state.height);
    expect(first!.route.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  });
});
