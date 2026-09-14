import { describe, expect, it } from "vitest";
import { reachable } from "../../lib/gen/map/terrain";
import { TILE_BLOCKED, TILE_CLEAR, TILE_WATER } from "../../lib/types";

describe("map reachability", () => {
  it("blocks diagonal cuts through water or blocked corners", () => {
    const width = 3;
    const height = 3;
    const tiles = [
      TILE_CLEAR, TILE_WATER, TILE_CLEAR,
      TILE_BLOCKED, TILE_CLEAR, TILE_CLEAR,
      TILE_CLEAR, TILE_CLEAR, TILE_CLEAR,
    ];
    const heights = new Array(width * height).fill(1);
    expect(reachable(tiles, heights, width, height, { x: 0, y: 0 }, { x: 2, y: 0 })).toBe(false);
    expect(reachable(tiles, heights, width, height, { x: 0, y: 0 }, { x: 2, y: 2 })).toBe(true);
  });
});
