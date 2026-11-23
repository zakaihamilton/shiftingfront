import { describe, expect, it, vi } from "vitest";
import { terrainFeatureAt } from "../../lib/gen/map";
import { TILE_H, TILE_W } from "../../lib/iso";
import {
  ARID_SCATTER,
  blockerPropKind,
  LUSH_SCATTER,
  scatterForTile,
  withAlpha,
} from "../../lib/render/terrainPaint";
import {
  SHROUD_CORE_COVER,
  SHROUD_CORNER_RADIUS_FRAC,
  SHROUD_COVER,
  SHROUD_FILL,
  SHROUD_RGB,
} from "../../lib/render/terrainPaint/constants";
import { paintShroudMaskTile, shroudCornerRadii } from "../../lib/render/terrainPaint/tile";
import { makeFixture, setTile } from "../../lib/sim/fixtures";
import { fogIndex, makeFog } from "../../lib/sim/fog";
import type { BiomeName } from "../../lib/types";
import {
  SURFACE_CONCRETE,
  SURFACE_ROAD,
  TILE_BLOCKED,
  TILE_RESOURCE,
  TILE_WATER,
} from "../../lib/types";

describe("shroud corner rounding", () => {
  const explored = (fog: number) => fog >= 1;

  it("rounds every corner of an isolated explored tile", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    state.fog = makeFog(8, 8, 0);
    state.fog[fogIndex(state, 4, 4)!] = 2;
    expect(shroudCornerRadii(state, 4, 4, 12, explored)).toEqual([12, 12, 12, 12]);
  });

  it("keeps interior corners sharp so adjacent stamps stay sealed", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    expect(shroudCornerRadii(state, 4, 4, 12, explored)).toEqual([0, 0, 0, 0]);
  });

  it("rounds only the outer corner of an explored block", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    state.fog = makeFog(8, 8, 0);
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        state.fog[fogIndex(state, x, y)!] = 2;
      }
    }
    expect(shroudCornerRadii(state, 2, 2, 12, explored)).toEqual([12, 0, 0, 0]);
  });

  function mockStampCtx() {
    const addColorStop = vi.fn();
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop })),
      globalAlpha: 1,
      fillStyle: "",
    };
    return {
      ctx: ctx as unknown as CanvasRenderingContext2D,
      addColorStop,
      scale: ctx.scale,
      arcTo: ctx.arcTo,
    };
  }

  it("derives the shroud fill hex from SHROUD_RGB", () => {
    expect(SHROUD_FILL).toBe("#080d11");
    expect(SHROUD_RGB).toEqual({ r: 8, g: 13, b: 17 });
  });

  it("punches a black radial feather and honors sharp interior core corners", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    const { ctx, addColorStop, arcTo } = mockStampCtx();
    paintShroudMaskTile(ctx, 100, 50, TILE_W, TILE_H, 0, 0, 0, 1, 1, 4, 4, 0, state);
    expect(addColorStop).toHaveBeenNthCalledWith(1, 0, "rgba(0,0,0,1)");
    expect(addColorStop).toHaveBeenNthCalledWith(2, 0.56, "rgba(0,0,0,1)");
    expect(addColorStop).toHaveBeenNthCalledWith(3, 1, "rgba(0,0,0,0)");
    expect(arcTo).toHaveBeenCalledTimes(4);
    expect(arcTo.mock.calls.every((call) => call[4] === 0)).toBe(true);
  });

  it("rounds the core of an isolated explored tile instead of flooring a minimum radius", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    state.fog = makeFog(8, 8, 0);
    state.fog[fogIndex(state, 4, 4)!] = 2;
    const { ctx, arcTo } = mockStampCtx();
    paintShroudMaskTile(ctx, 100, 50, TILE_W, TILE_H, 0, 0, 0, 1, 1, 4, 4, 0, state);
    const coverH = TILE_H * SHROUD_COVER;
    const expected = SHROUD_CORNER_RADIUS_FRAC * coverH * SHROUD_CORE_COVER;
    expect(arcTo.mock.calls[0]?.[4]).toBeCloseTo(expected);
    expect(arcTo.mock.calls.every((call) => (call[4] as number) > 0)).toBe(true);
  });

  it("keeps partial-fog stamps at tile cover instead of expanding into unexplored cells", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    const { ctx, scale } = mockStampCtx();
    paintShroudMaskTile(ctx, 100, 50, TILE_W, TILE_H, 0, 0, 0, 0.55, 1, 4, 4, 0, state);
    expect(scale).toHaveBeenCalledWith(TILE_W * 0.42, TILE_W * 0.42);
  });
});

function collectScatter(state: ReturnType<typeof makeFixture>) {
  const items = [];
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      items.push(...scatterForTile(state, x, y));
    }
  }
  return items;
}

describe("terrain scatter artifacts", () => {
  it("is deterministic for a seed and cell", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    const a = scatterForTile(state, 4, 5);
    expect(scatterForTile(state, 4, 5)).toEqual(a);
    expect(a.length).toBeLessThanOrEqual(3);
    const here = collectScatter(state);
    const other = collectScatter({ ...state, seed: 3209 });
    expect(here.length).toBeGreaterThan(0);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(here));
  });

  it("varies across neighboring cells and biomes", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    const signatures = new Set<string>();
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        signatures.add(JSON.stringify(scatterForTile(state, x, y)));
      }
    }
    expect(signatures.size).toBeGreaterThan(8);
    const jungle = { ...state, biome: "jungle wreckage" as BiomeName };
    expect(JSON.stringify(collectScatter(jungle))).not.toBe(JSON.stringify(collectScatter(state)));
  });

  it("uses the expanded motif vocabulary without changing tile limits", () => {
    const base = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" }, seed: 832 });
    const biomes: BiomeName[] = [
      "ash plains",
      "crystal flats",
      "rust canyons",
      "salt marshes",
      "glass desert",
      "tundra grid",
      "jungle wreckage",
      "volcanic shelf",
    ];
    for (const biome of biomes) {
      const state = { ...base, biome };
      const kinds = new Set(collectScatter(state).map((item) => item.kind));
      expect(kinds.size, `motif variety for ${biome}`).toBeGreaterThanOrEqual(3);
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          expect(scatterForTile(state, x, y).length).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it("adds deterministic desert flora without making other biomes arid", () => {
    const base = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" }, seed: 832 });
    const desert = { ...base, biome: "glass desert" as BiomeName };
    const jungle = { ...base, biome: "jungle wreckage" as BiomeName };
    const desertItems = collectScatter(desert);
    const jungleItems = collectScatter(jungle);
    const flora = new Set(["desertTree", "cactus", "desertShrub"]);
    const desertFlora = desertItems.filter((item) => flora.has(item.kind)).length;
    expect(desertFlora).toBeGreaterThan(0);
    expect(desertFlora / desertItems.length).toBeGreaterThan(0.12);
    expect(desertFlora / desertItems.length).toBeLessThan(0.5);
    expect(jungleItems.some((item) => flora.has(item.kind))).toBe(false);
    expect(desertItems.some((item) => item.kind === "mineralFragment")).toBe(true);
    expect(collectScatter(desert)).toEqual(desertItems);
  });

  it("skips water, concrete, ore, and blocked tiles", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 1, 1, TILE_WATER);
    setTile(state, 2, 2, TILE_RESOURCE, 800);
    setTile(state, 3, 3, TILE_BLOCKED);
    state.surfaces[4 * state.width + 4] = SURFACE_CONCRETE;
    expect(scatterForTile(state, 1, 1)).toEqual([]);
    expect(scatterForTile(state, 2, 2)).toEqual([]);
    expect(scatterForTile(state, 3, 3)).toEqual([]);
    expect(scatterForTile(state, 4, 4)).toEqual([]);
  });

  it("keeps roads sparse and prefers biome-appropriate clutter", () => {
    const ground = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" }, seed: 832 });
    const road = makeFixture({ width: 16, height: 16, win: { kind: "annihilate" }, seed: 832 });
    road.surfaces.fill(SURFACE_ROAD);
    expect(collectScatter(road).length).toBeLessThan(collectScatter(ground).length);

    const jungle = { ...ground, biome: "jungle wreckage" as BiomeName };
    const desert = { ...ground, biome: "glass desert" as BiomeName };
    const lushCount = collectScatter(jungle).filter((item) => LUSH_SCATTER.has(item.kind)).length;
    const jungleArid = collectScatter(jungle).filter((item) => ARID_SCATTER.has(item.kind)).length;
    const aridCount = collectScatter(desert).filter((item) => ARID_SCATTER.has(item.kind)).length;
    const desertLush = collectScatter(desert).filter((item) => LUSH_SCATTER.has(item.kind)).length;
    expect(lushCount).toBeGreaterThan(jungleArid);
    expect(aridCount).toBeGreaterThan(desertLush);
    expect(aridCount).toBeGreaterThan(0);
  });

  it("adds rare deterministic landmarks to feature tiles across every biome", () => {
    const base = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" }, seed: 832 });
    const biomes: BiomeName[] = [
      "ash plains",
      "crystal flats",
      "rust canyons",
      "salt marshes",
      "glass desert",
      "tundra grid",
      "jungle wreckage",
      "volcanic shelf",
    ];
    for (const biome of biomes) {
      const state = { ...base, biome };
      let landmarkTile: { x: number; y: number } | undefined;
      for (let y = 0; y < state.height && !landmarkTile; y++) {
        for (let x = 0; x < state.width; x++) {
          if (scatterForTile(state, x, y).some((item) => item.kind === "landmark")) {
            landmarkTile = { x, y };
            break;
          }
        }
      }
      expect(landmarkTile, `landmark for ${biome}`).toBeDefined();
      const items = scatterForTile(state, landmarkTile!.x, landmarkTile!.y);
      expect(items).toEqual(scatterForTile(state, landmarkTile!.x, landmarkTile!.y));
      expect(items.filter((item) => item.kind === "landmark")).toHaveLength(1);
      expect(
        terrainFeatureAt(state, landmarkTile!.x, landmarkTile!.y).intensity,
      ).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("keeps blocker props deterministic and biome-keyed", () => {
    expect(blockerPropKind("ash plains", 9)).toBe(blockerPropKind("ash plains", 9));
    const jungle = new Set(
      Array.from({ length: 40 }, (_, v) => blockerPropKind("jungle wreckage", v)),
    );
    const desert = new Set(
      Array.from({ length: 40 }, (_, v) => blockerPropKind("glass desert", v)),
    );
    const tundra = new Set(Array.from({ length: 40 }, (_, v) => blockerPropKind("tundra grid", v)));
    expect(jungle.has("tree")).toBe(true);
    expect(desert.has("sandstone") || desert.has("deadShrub")).toBe(true);
    expect(desert.has("desertTree")).toBe(true);
    expect(desert.has("cactus")).toBe(true);
    expect(tundra.has("pine") || tundra.has("snowRock")).toBe(true);
    expect(blockerPropKind("jungle wreckage", 3)).not.toBe(blockerPropKind("glass desert", 3));
  });

  it("is deterministic on skirt samples", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const skirt = scatterForTile(state, -1, 2);
    expect(scatterForTile(state, -1, 2)).toEqual(skirt);
    expect(skirt.length).toBeLessThanOrEqual(3);
  });

  it("honors an explicit tile kind so callers can reuse scenery samples", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    expect(scatterForTile(state, 0, 0, TILE_WATER)).toEqual([]);
    expect(scatterForTile(state, 0, 0, TILE_BLOCKED)).toEqual([]);
  });

  it("multiplies parent canvas alpha instead of resetting it", () => {
    const stack: number[] = [];
    let alpha = 0.4;
    const ctx = {
      get globalAlpha() {
        return alpha;
      },
      set globalAlpha(value: number) {
        alpha = value;
      },
      save() {
        stack.push(alpha);
      },
      restore() {
        alpha = stack.pop() ?? 1;
      },
    } as CanvasRenderingContext2D;
    withAlpha(ctx, 0.5, () => {
      expect(alpha).toBeCloseTo(0.2);
    });
    expect(alpha).toBe(0.4);
  });
});
