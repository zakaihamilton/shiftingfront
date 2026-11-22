import { describe, expect, it } from "vitest";
import { TILE_W } from "../../lib/iso";
import {
  CINEMA_SCROLL_PAD,
  emptyScrollLayer,
  scrollLayerBlitOffset,
  scrollLayerNeedsRebuild,
  scrollLayerPaintCamera,
  terrainScrollPad,
} from "../../lib/render/scrollLayer";

describe("scroll layer cache", () => {
  it("rebuilds when the content key changes", () => {
    const layer = { key: "a", originX: 10, originY: 20, pad: 200 };
    expect(scrollLayerNeedsRebuild(layer, "a", 10, 20)).toBe(false);
    expect(scrollLayerNeedsRebuild(layer, "b", 10, 20)).toBe(true);
    expect(scrollLayerNeedsRebuild(emptyScrollLayer(), "a", 0, 0)).toBe(true);
  });

  it("rebuilds when the camera leaves the padded origin", () => {
    const layer = { key: "view", originX: 100, originY: 50, pad: 200 };
    expect(scrollLayerNeedsRebuild(layer, "view", 199, 50)).toBe(false);
    expect(scrollLayerNeedsRebuild(layer, "view", 201, 50)).toBe(true);
    expect(scrollLayerNeedsRebuild(layer, "view", 100, -51)).toBe(true);
  });

  it("blits from the paint origin including pad", () => {
    const layer = { originX: 40, originY: 80, pad: 160 };
    expect(scrollLayerBlitOffset(layer, 40, 80)).toEqual({ x: -160, y: -160 });
    expect(scrollLayerBlitOffset(layer, 55, 70)).toEqual({ x: -145, y: -170 });
  });

  it("shifts the paint camera by the pad", () => {
    expect(scrollLayerPaintCamera({ x: 12, y: 8, zoom: 1.25 }, 96)).toEqual({
      x: 108,
      y: 104,
      zoom: 1.25,
    });
  });

  it("sizes terrain pad from zoom and keeps cinema pad covering drift", () => {
    expect(terrainScrollPad(1)).toBe(TILE_W * 4);
    expect(terrainScrollPad(0.5)).toBeGreaterThanOrEqual(96);
    expect(CINEMA_SCROLL_PAD).toBeGreaterThanOrEqual(140);
    const pipPad = Math.max(CINEMA_SCROLL_PAD, terrainScrollPad(1.5));
    expect(pipPad * 0.5).toBeGreaterThan(10);
  });
});
