import { describe, expect, it, vi } from "vitest";
import { generateMap, MAP_SKIRT } from "../../lib/gen/map";
import { hashNoise, valueNoise } from "../../lib/gen/map/noise";
import { expandIsoDiamond, isoAtlasTransform, TILE_H, TILE_W } from "../../lib/iso";
import { isoDiamondPath, roundedIsoDiamondPath } from "../../lib/render/isoDiamond";
import { spriteCacheKey } from "../../lib/render/renderer";
import {
  ATLAS_CELL,
  atlasPixelAtTile,
  atlasRectForTile,
  bakeTerrainAtlasData,
  biomeMaterials,
  fogTerrainGain,
  getTerrainAtlas,
  invalidateTerrainAtlas,
  resourceSignature,
  sampleTerrainMaterial,
  type TerrainAtlasData,
  terrainAtlasKey,
  terrainLayoutSignature,
} from "../../lib/render/terrainAtlas";
import {
  SHORELINE_MAX_DISPLACEMENT,
  shorelineWarp,
  signedShoreDistanceFromMask,
  warpedShoreDistance,
} from "../../lib/render/terrainAtlasSurfaces";
import { hash2, propMaterialsFor } from "../../lib/render/terrainMaterials";
import { smoothFogGain } from "../../lib/render/terrainPaint";
import { addUnit, makeFixture, setTile } from "../../lib/sim/fixtures";
import { fogIndex } from "../../lib/sim/fog";
import {
  SURFACE_CONCRETE,
  SURFACE_ROAD,
  TILE_BLOCKED,
  TILE_CLEAR,
  TILE_RESOURCE,
  TILE_WATER,
} from "../../lib/types";

function atlasCellGoldScore(atlas: TerrainAtlasData, tileX: number, tileY: number): number {
  const rect = atlasRectForTile(tileX, tileY, atlas.mapWidth);
  let sum = 0;
  let count = 0;
  for (let ly = 0; ly < rect.sh; ly++) {
    for (let lx = 0; lx < rect.sw; lx++) {
      const i = ((rect.sy + ly) * atlas.width + (rect.sx + lx)) * 4;
      sum += (atlas.data[i] ?? 0) + (atlas.data[i + 1] ?? 0) - (atlas.data[i + 2] ?? 0);
      count += 1;
    }
  }
  return count === 0 ? 0 : sum / count;
}

function atlasLocalPixel(
  atlas: TerrainAtlasData,
  tileX: number,
  tileY: number,
  localX: number,
  localY: number,
): [number, number, number] {
  const rect = atlasRectForTile(tileX, tileY, atlas.mapWidth);
  const i = ((rect.sy + localY) * atlas.width + rect.sx + localX) * 4;
  return [atlas.data[i] ?? 0, atlas.data[i + 1] ?? 0, atlas.data[i + 2] ?? 0];
}

describe("seeded terrain atlas", () => {
  it("shares deterministic noise and preserves the isometric diamond path", () => {
    expect(hash2(7, -3, 41)).toBe(hashNoise(7, -3, 41));
    const noise = valueNoise(2.25, -1.5, 41);
    expect(noise).toBe(valueNoise(2.25, -1.5, 41));
    expect(noise).not.toBe(valueNoise(2.25, -1.5, 42));

    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    isoDiamondPath(ctx, 10, 20, 8, 4);

    expect(ctx.moveTo).toHaveBeenCalledWith(10, 20);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(1, 14, 22);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(2, 10, 24);
    expect(ctx.lineTo).toHaveBeenNthCalledWith(3, 6, 22);
    expect(ctx.closePath).toHaveBeenCalledOnce();
  });

  it("rounds iso diamond corners with arcTo and stays off the raw tips", () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    roundedIsoDiamondPath(ctx, 10, 20, 8, 4, 1.2);

    expect(ctx.lineTo).not.toHaveBeenCalled();
    expect(ctx.arcTo).toHaveBeenCalledTimes(4);
    expect(ctx.moveTo).not.toHaveBeenCalledWith(10, 20);
    expect(ctx.arcTo).toHaveBeenNthCalledWith(1, 10, 20, 14, 22, 1.2);
    expect(ctx.arcTo).toHaveBeenNthCalledWith(2, 14, 22, 10, 24, 1.2);
    expect(ctx.arcTo).toHaveBeenNthCalledWith(3, 10, 24, 6, 22, 1.2);
    expect(ctx.arcTo).toHaveBeenNthCalledWith(4, 6, 22, 10, 20, 1.2);
    expect(ctx.closePath).toHaveBeenCalledOnce();
  });

  it("clamps rounded-diamond radius to half of each edge", () => {
    const ctx = {
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    roundedIsoDiamondPath(ctx, 10, 20, 8, 4, 100);
    const clamped = Math.hypot(4, 2) / 2;
    expect(ctx.arcTo).toHaveBeenNthCalledWith(1, 10, 20, 14, 22, clamped);
  });

  it("scopes raster fallback cache keys to the active mission session", () => {
    const state = makeFixture({ win: { kind: "annihilate" }, seed: 832 });
    const unit = addUnit(state, 0, "infantry", 3, 3);
    const sameSession = spriteCacheKey(state, unit);
    const otherMission = spriteCacheKey({ ...state, missionIndex: 1 }, unit);
    const tutorial = spriteCacheKey({ ...state, tutorialStage: "select" }, unit);
    const otherSeed = spriteCacheKey({ ...state, seed: 3209 }, unit);

    expect(spriteCacheKey(state, unit)).toBe(sameSession);
    expect(new Set([sameSession, otherMission, tutorial, otherSeed]).size).toBe(4);
  });

  it("bakes deterministic atlases that differ by seed", () => {
    const first = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const second = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const other = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 3209 });
    other.biome = "rust canyons";
    const a = bakeTerrainAtlasData(first);
    const b = bakeTerrainAtlasData(second);
    const c = bakeTerrainAtlasData(other);
    expect(a.key).toBe(b.key);
    expect(a.key).toContain("world-atlas-v23-isometric-projection");
    expect(a.data).toEqual(b.data);
    expect(terrainAtlasKey(first)).toBe(a.key);
    expect(c.key).not.toBe(a.key);
    expect(a.data).not.toEqual(c.data);
    const generated = generateMap(832, {
      index: 0,
      win: { kind: "annihilate" },
      mapSize: 48,
      biome: "ash plains",
    });
    const world = { ...generated, seed: 832, missionIndex: 0 };
    expect(sampleTerrainMaterial(world, 4, 4)).toEqual(sampleTerrainMaterial(world, 4, 4));
  });

  it("warps the shore deterministically and continuously across water/land seams", () => {
    const salt = 832;
    const waterDistance = signedShoreDistanceFromMask(0.99, 0.5, 0xfd, true);
    const landDistance = signedShoreDistanceFromMask(0.01, 0.5, 0x08, false);
    const waterEdge = warpedShoreDistance(waterDistance, 0.99, 0.5, salt);
    const landEdge = warpedShoreDistance(landDistance, 1.01, 0.5, salt);
    const warp = shorelineWarp(1.25, -0.75, salt);

    expect(waterDistance).toBeCloseTo(0.01, 5);
    expect(landDistance).toBeCloseTo(-0.01, 5);
    expect(Math.abs(waterEdge - landEdge)).toBeLessThan(0.05);
    expect(warp).toBe(shorelineWarp(1.25, -0.75, salt));
    expect(Math.abs(warp)).toBeLessThanOrEqual(SHORELINE_MAX_DISPLACEMENT);
    expect(signedShoreDistanceFromMask(0.5, 0.5, 0xff, true)).toBe(8);
    expect(signedShoreDistanceFromMask(0.5, 0.5, 0, false)).toBe(-8);
  });

  it("keeps shoreline treatment local and leaves interior water colors unchanged", () => {
    const nearShore = makeFixture({
      width: 12,
      height: 12,
      win: { kind: "annihilate" },
      seed: 832,
    });
    const remoteShore = makeFixture({
      width: 12,
      height: 12,
      win: { kind: "annihilate" },
      seed: 832,
    });
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        setTile(nearShore, x, y, TILE_WATER);
        setTile(remoteShore, x, y, TILE_WATER);
      }
      for (let x = 7; x <= 9; x++) setTile(remoteShore, x, y + 5, TILE_WATER);
    }

    const atlas = bakeTerrainAtlasData(nearShore);
    const sameSeedAtlas = bakeTerrainAtlasData(nearShore);
    const movedShoreAtlas = bakeTerrainAtlasData(remoteShore);
    const atlasCols = atlas.width / ATLAS_CELL;
    const waterCellIndex = (3 + MAP_SKIRT) * atlasCols + (3 + MAP_SKIRT);
    const landCellIndex = (5 + MAP_SKIRT) * atlasCols + (5 + MAP_SKIRT);

    expect(atlas.data).toEqual(sameSeedAtlas.data);
    expect(atlas.waterCells[waterCellIndex]).toBe(1);
    expect(atlas.waterCells[landCellIndex]).toBe(0);
    expect(atlasPixelAtTile(atlas, 3, 3)).toEqual(atlasPixelAtTile(movedShoreAtlas, 3, 3));
    expect(atlasLocalPixel(atlas, 5, 0, 4, 4)).toEqual(
      atlasLocalPixel(movedShoreAtlas, 5, 0, 4, 4),
    );
  });

  it("keeps derived prop materials matte without erasing biome identity", () => {
    const base = biomeMaterials("glass desert");
    const props = propMaterialsFor(base);
    const again = propMaterialsFor(base);
    const chroma = (color: { r: number; g: number; b: number }) =>
      Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
    expect(again).toBe(props);
    expect(chroma(props.mid)).toBeLessThanOrEqual(chroma(base.mid));
    expect(chroma(props.ore)).toBeLessThanOrEqual(chroma(base.ore));
    expect(props.mid).not.toEqual(props.ore);
  });

  it("changes atlas pixels for water, road, ore, and elevation", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 1, 1, TILE_WATER);
    setTile(state, 2, 2, TILE_RESOURCE, 800);
    setTile(state, 3, 3, TILE_BLOCKED);
    state.heights[4 * state.width + 4] = 3;
    state.surfaces[6 * state.width + 6] = SURFACE_ROAD;
    state.surfaces[7 * state.width + 7] = SURFACE_CONCRETE;
    const atlas = bakeTerrainAtlasData(state);
    const ground = atlasPixelAtTile(atlas, 0, 0);
    const water = atlasPixelAtTile(atlas, 1, 1);
    const high = atlasPixelAtTile(atlas, 4, 4);
    const road = atlasPixelAtTile(atlas, 6, 6);
    const concrete = atlasPixelAtTile(atlas, 7, 7);
    expect(water[2]).toBeGreaterThan(water[0]);
    expect(sampleTerrainMaterial(state, 1, 1).water).toBe(true);
    expect(atlasCellGoldScore(atlas, 2, 2)).toBeGreaterThan(atlasCellGoldScore(atlas, 0, 0));
    expect(atlasCellGoldScore(atlas, 2, 2)).toBeGreaterThan(atlasCellGoldScore(atlas, 7, 7));
    expect(atlasPixelAtTile(atlas, 2, 2)).not.toEqual(ground);
    expect(high[0] + high[1] + high[2]).toBeGreaterThan(ground[0] + ground[1] + ground[2]);
    expect(road).not.toEqual(ground);
    expect(concrete).not.toEqual(ground);
    expect(sampleTerrainMaterial(state, 1.5, 1.5).water).toBe(true);
    expect(sampleTerrainMaterial(state, 2.4, 2.4).ore).toBe(true);
  });

  it("keeps shore water blue instead of mixing bank sand", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 1, 1, TILE_WATER);
    const atlas = bakeTerrainAtlasData(state);
    const shore = atlasPixelAtTile(atlas, 1, 1);
    const mats = biomeMaterials(state.biome);
    expect(shore[2]).toBeGreaterThan(shore[0]);
    const dist = (px: [number, number, number], c: { r: number; g: number; b: number }) =>
      Math.abs(px[0] - c.r) + Math.abs(px[1] - c.g) + Math.abs(px[2] - c.b);
    expect(dist(shore, mats.waterMid)).toBeLessThan(dist(shore, mats.shore));
    expect(sampleTerrainMaterial(state, 1, 1).b).toBeGreaterThan(
      sampleTerrainMaterial(state, 1, 1).r,
    );
  });

  it("bakes lake interiors darker than the rim", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" }, seed: 832 });
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) setTile(state, x, y, TILE_WATER);
    }
    const atlas = bakeTerrainAtlasData(state);
    const cellLum = (tx: number, ty: number): number => {
      const rect = atlasRectForTile(tx, ty, atlas.mapWidth);
      let sum = 0;
      for (let ly = 0; ly < rect.sh; ly++) {
        for (let lx = 0; lx < rect.sw; lx++) {
          const i = ((rect.sy + ly) * atlas.width + (rect.sx + lx)) * 4;
          sum += (atlas.data[i] ?? 0) + (atlas.data[i + 1] ?? 0) + (atlas.data[i + 2] ?? 0);
        }
      }
      return sum / (rect.sw * rect.sh);
    };
    expect(atlasPixelAtTile(atlas, 3, 3)[2]).toBeGreaterThan(atlasPixelAtTile(atlas, 3, 3)[0]);
    expect(cellLum(3, 3)).toBeLessThan(cellLum(2, 2));
    expect(cellLum(3, 3)).toBeLessThan(cellLum(2, 3));
  });

  it("keeps adjacent interior water pixels close across tile seams", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    for (let y = 1; y <= 10; y++) {
      for (let x = 1; x <= 10; x++) setTile(state, x, y, TILE_WATER);
    }
    const atlas = bakeTerrainAtlasData(state);
    const pixel = (tx: number, ty: number, lx: number, ly: number): [number, number, number] => {
      const rect = atlasRectForTile(tx, ty, atlas.mapWidth);
      const i = ((rect.sy + ly) * atlas.width + (rect.sx + lx)) * 4;
      return [atlas.data[i] ?? 0, atlas.data[i + 1] ?? 0, atlas.data[i + 2] ?? 0];
    };
    const dist = (a: [number, number, number], b: [number, number, number]) =>
      Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    const mid = ATLAS_CELL >> 1;
    const left = pixel(5, 5, ATLAS_CELL - 1, mid);
    const right = pixel(6, 5, 0, mid);
    const inlandA = pixel(5, 5, mid, mid);
    const inlandB = pixel(5, 5, mid + 1, mid);
    const seam = dist(left, right);
    const inland = dist(inlandA, inlandB);
    const seamChannel = Math.max(
      Math.abs(left[0] - right[0]),
      Math.abs(left[1] - right[1]),
      Math.abs(left[2] - right[2]),
    );
    expect(seamChannel).toBeLessThan(8);
    expect(seam).toBeLessThan(14);
    expect(seam).toBeLessThanOrEqual(inland + 6);
  });

  it("keeps unexplored terrain behind an opaque shroud", () => {
    expect(fogTerrainGain(2)).toBe(1);
    expect(fogTerrainGain(1)).toBe(0.55);
    expect(fogTerrainGain(0)).toBe(0);
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 11 });
    const visible = sampleTerrainMaterial(state, 3, 3);
    expect(visible.r + visible.g + visible.b).toBeGreaterThan(0);
    expect(fogTerrainGain(0) * visible.r).toBe(0);
  });

  it("does not re-cover a tile after it has been discovered", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" } });
    state.fog.fill(0);
    state.fog[fogIndex(state, 3, 3)!] = 2;

    expect(smoothFogGain(state, 3, 3)).toBe(1);
    expect(smoothFogGain(state, 3, 4)).toBe(0);
  });

  it("maps atlas cells onto isometric diamond vertices", () => {
    const [a, b, c, d, e, f] = isoAtlasTransform(100, 50, TILE_W, TILE_H, 8, 8);
    const map = (u: number, v: number) => ({ x: a * u + c * v + e, y: b * u + d * v + f });
    expect(map(0, 0)).toEqual({ x: 100, y: 50 });
    expect(map(8, 0)).toEqual({ x: 132, y: 66 });
    expect(map(0, 8)).toEqual({ x: 68, y: 66 });
    expect(map(8, 8)).toEqual({ x: 100, y: 82 });
  });

  it("expands an isometric diamond about its center", () => {
    const box = expandIsoDiamond(100, 50, 64, 32, 1.5);
    expect(box).toEqual({ x: 100, y: 42, w: 96, h: 48 });
  });

  it("keeps the base atlas stable during partial harvests and invalidates it when ore is exhausted", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 1, 0, TILE_RESOURCE, 800);
    invalidateTerrainAtlas();
    const atlas = getTerrainAtlas(state);
    const before = terrainAtlasKey(state);
    const layoutBefore = terrainLayoutSignature(state.tiles, state.surfaces);
    const sigBefore = resourceSignature(state.resourceAmount);
    state.resourceAmount[1] = 200;
    expect(resourceSignature(state.resourceAmount)).not.toBe(sigBefore);
    expect(terrainLayoutSignature(state.tiles, state.surfaces)).toBe(layoutBefore);
    expect(terrainAtlasKey(state)).toBe(before);
    expect(getTerrainAtlas(state)).toBe(atlas);
    state.tiles[1] = TILE_CLEAR;
    expect(terrainLayoutSignature(state.tiles, state.surfaces)).not.toBe(layoutBefore);
    expect(terrainAtlasKey(state)).not.toBe(before);
    expect(getTerrainAtlas(state)).not.toBe(atlas);
  });
});
