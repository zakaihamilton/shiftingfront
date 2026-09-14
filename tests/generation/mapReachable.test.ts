import { describe, expect, it } from "vitest";
import { reachable } from "../../lib/gen/map/terrain";
import { TILE_BLOCKED, TILE_CLEAR, TILE_WATER } from "../../lib/types";

describe("map reachability", () => {
  it("blocks diagonal cuts through water or blocked corners", () => {
    const width = 2;
    const height = 2;
    const heights = new Array(width * height).fill(1);
    const cut = [
      TILE_CLEAR, TILE_WATER,
      TILE_BLOCKED, TILE_CLEAR,
    ];
    expect(reachable(cut, heights, width, height, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(false);

    const around = [
      TILE_CLEAR, TILE_WATER,
      TILE_CLEAR, TILE_CLEAR,
    ];
    expect(reachable(around, heights, width, height, { x: 0, y: 0 }, { x: 1, y: 1 })).toBe(true);
  });
});
