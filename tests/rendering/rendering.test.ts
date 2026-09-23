import { describe, expect, it, vi } from "vitest";
import { addBuilding, addUnit, makeFixture, setHeight, setTile } from "../../lib/sim/fixtures";
import { entityColor, minimapRegionForCell, renderMinimap, terrainColors } from "../../lib/render/minimap";
import { SURFACE_CONCRETE, SURFACE_ROAD, TILE_BLOCKED, TILE_CLEAR, TILE_RESOURCE, TILE_WATER } from "../../lib/types";
import type { BiomeName } from "../../lib/types";
import {
  ARID_SCATTER,
  LUSH_SCATTER,
  blockerPropKind,
  drawBlockerProp,
  drawOreCrystals,
  drawTerrainScatter,
  rgbMix,
  scatterForTile,
  smoothFogGain,
  withAlpha,
  WATER_COVER,
} from "../../lib/render/terrainPaint";
import { hash } from "../../lib/gen/tilePalette";
import { generateMap, terrainFeatureAt } from "../../lib/gen/map";
import { tileSprite, tileSpriteId } from "../../lib/gen/assets";
import { TERRAIN_ART } from "../../lib/gen/visualAssets";
import { generateCampaignVisualProfile } from "../../lib/gen/visualProfile";
import { TILE_H, TILE_W, expandIsoDiamond, isoAtlasTransform, createCamera } from "../../lib/iso";
import {
  ATLAS_CELL,
  atlasPixelAtTile,
  atlasRectForTile,
  bakeTerrainAtlasData,
  fogTerrainGain,
  getTerrainAtlas,
  invalidateTerrainAtlas,
  oreCrystalCluster,
  oreVeinAt,
  oreVeinPeak,
  ORE_CRYSTAL_MIN_AMOUNT,
  ORE_GLINT_RIDGE,
  ORE_VEIN_PROBES,
  resourceSignature,
  terrainLayoutSignature,
  sampleTerrainMaterial,
  terrainAtlasKey,
  biomeMaterials,
  tintGroundPatches,
  applyBiomeGroundPattern,
  type TerrainAtlasData,
} from "../../lib/render/terrainAtlas";
import {
  oreGlint,
  oreSparkle,
  paintWaterFx,
  waterCaustic,
  weatherKindForBiome,
  weatherParticleAt,
  visibleFxTileCoords,
  waterFxNeedsClip,
} from "../../lib/render/terrainWeather";
import {
  drawCactus,
  drawCinder,
  drawCrystalChip,
  drawDesertShrub,
  drawDesertTree,
  desertFloraPalette,
  drawIceChip,
  drawLandmark,
  drawPebble,
  drawRockSlab,
  drawMineralFragment,
} from "../../lib/render/terrainPaint/scatter";
import { spriteCacheKey, terrainContentKey } from "../../lib/render/renderer";
import { minimapCacheKeys, minimapEntityVisible, MINIMAP_OVERLAY_TICK_SHIFT } from "../../lib/render/minimap";
import { hash2, propMaterialsFor, terrainVisualTuningFor } from "../../lib/render/terrainMaterials";
import { hashNoise, valueNoise } from "../../lib/gen/map/noise";
import { isoDiamondPath, roundedIsoDiamondPath } from "../../lib/render/isoDiamond";
import { paintShroudMaskTile, shroudCornerRadii } from "../../lib/render/terrainPaint/tile";
import { rgbOf } from "../../lib/render/terrainPaint/style";
import { SHROUD_COVER, SHROUD_CORE_COVER, SHROUD_CORNER_RADIUS_FRAC, SHROUD_FILL, SHROUD_RGB } from "../../lib/render/terrainPaint/constants";
import { fogIndex, makeFog } from "../../lib/sim/fog";

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

function atlasEdgeAverage(
  atlas: TerrainAtlasData,
  tileX: number,
  tileY: number,
  side: "east" | "west" | "north" | "south",
): [number, number, number] {
  const rect = atlasRectForTile(tileX, tileY, atlas.mapWidth);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let offset = 2; offset < ATLAS_CELL - 2; offset++) {
    const lx = side === "east" ? ATLAS_CELL - 1 : side === "west" ? 0 : offset;
    const ly = side === "south" ? ATLAS_CELL - 1 : side === "north" ? 0 : offset;
    const i = ((rect.sy + ly) * atlas.width + rect.sx + lx) * 4;
    r += atlas.data[i] ?? 0;
    g += atlas.data[i + 1] ?? 0;
    b += atlas.data[i + 2] ?? 0;
    count += 1;
  }
  return [r / count, g / count, b / count];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
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
    expect(a.key).toContain("world-atlas-v21-no-feature-boundaries");
    expect(a.data).toEqual(b.data);
    expect(terrainAtlasKey(first)).toBe(a.key);
    expect(c.key).not.toBe(a.key);
    expect(a.data).not.toEqual(c.data);
    const generated = generateMap(832, { index: 0, win: { kind: "annihilate" }, mapSize: 48, biome: "ash plains" });
    const world = { ...generated, seed: 832, missionIndex: 0 };
    expect(sampleTerrainMaterial(world, 4, 4)).toEqual(sampleTerrainMaterial(world, 4, 4));
  });

  it("keeps derived prop materials matte without erasing biome identity", () => {
    const base = biomeMaterials("glass desert");
    const props = propMaterialsFor(base);
    const again = propMaterialsFor(base);
    const chroma = (color: { r: number; g: number; b: number }) => Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
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
    const dist = (px: [number, number, number], c: { r: number; g: number; b: number }) => (
      Math.abs(px[0] - c.r) + Math.abs(px[1] - c.g) + Math.abs(px[2] - c.b)
    );
    expect(dist(shore, mats.waterMid)).toBeLessThan(dist(shore, mats.shore));
    expect(sampleTerrainMaterial(state, 1, 1).b).toBeGreaterThan(sampleTerrainMaterial(state, 1, 1).r);
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
    const dist = (a: [number, number, number], b: [number, number, number]) => (
      Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
    );
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

  it("removes large tile-aligned color jumps from compatible ground cells", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    const atlas = bakeTerrainAtlasData(state);
    const seams = [
      { x: 3, y: 3 },
      { x: 4, y: 3 },
      { x: 5, y: 3 },
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 5, y: 4 },
    ];

    for (const { x, y } of seams) {
      expect(rgbDistance(atlasEdgeAverage(atlas, x, y, "east"), atlasEdgeAverage(atlas, x + 1, y, "west")))
        .toBeLessThan(14);
      expect(rgbDistance(atlasEdgeAverage(atlas, x, y, "south"), atlasEdgeAverage(atlas, x, y + 1, "north")))
        .toBeLessThan(14);
    }
  });

  it("bridges mixed ground at shared corners with deterministic organic patches", () => {
    const makeMixedGround = (seed: number) => {
      const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed });
      setHeight(state, 4, 4, 0);
      setHeight(state, 5, 4, 3);
      setHeight(state, 4, 5, 3);
      setHeight(state, 5, 5, 0);
      return state;
    };
    const state = makeMixedGround(832);
    const atlas = bakeTerrainAtlasData(state);
    const repeat = bakeTerrainAtlasData(makeMixedGround(832));
    const otherSeed = bakeTerrainAtlasData(makeMixedGround(3209));
    const cornerSamples = [
      atlasLocalPixel(atlas, 4, 4, ATLAS_CELL - 1, ATLAS_CELL - 1),
      atlasLocalPixel(atlas, 5, 4, 0, ATLAS_CELL - 1),
      atlasLocalPixel(atlas, 4, 5, ATLAS_CELL - 1, 0),
      atlasLocalPixel(atlas, 5, 5, 0, 0),
    ];
    const cornerLuminance = cornerSamples.map(([r, g, b]) => r + g + b);
    const cornerSpread = Math.max(...cornerLuminance) - Math.min(...cornerLuminance);
    const cornerColorSpread = Math.max(
      ...cornerSamples.flatMap((sample, index) => cornerSamples.slice(index + 1).map((other) => rgbDistance(sample, other))),
    );
    const sourceLuminance = [
      sampleTerrainMaterial(state, 4, 4),
      sampleTerrainMaterial(state, 5, 4),
      sampleTerrainMaterial(state, 4, 5),
      sampleTerrainMaterial(state, 5, 5),
    ].map(({ r, g, b }) => r + g + b);
    const bridgeLuminance = sourceLuminance.reduce((sum, value) => sum + value, 0) / sourceLuminance.length;
    const surroundingLuminance = [
      atlasPixelAtTile(atlas, 4, 4),
      atlasPixelAtTile(atlas, 5, 4),
      atlasPixelAtTile(atlas, 4, 5),
      atlasPixelAtTile(atlas, 5, 5),
    ].map(([r, g, b]) => r + g + b);

    expect(repeat.data).toEqual(atlas.data);
    expect(rgbDistance(
      atlasLocalPixel(atlas, 5, 4, 0, 3),
      atlasLocalPixel(otherSeed, 5, 4, 0, 3),
    )).toBeGreaterThan(8);
    expect(cornerColorSpread).toBeLessThan(28);
    expect(cornerSpread).toBeLessThan(28);
    for (let index = 0; index < cornerLuminance.length; index++) {
      expect(Math.abs(cornerLuminance[index]! - bridgeLuminance))
        .toBeLessThan(Math.abs(sourceLuminance[index]! - bridgeLuminance));
    }
    expect(Math.min(...cornerLuminance)).toBeGreaterThan(Math.min(...surroundingLuminance));
    expect(Math.max(...cornerLuminance)).toBeLessThan(Math.max(...surroundingLuminance));
  });

  it("breaks long mixed-ground edges with a shared seeded feather", () => {
    const makeSplitGround = (seed: number) => {
      const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed });
      for (let y = 2; y < 10; y++) {
        setHeight(state, 4, y, 0);
        setHeight(state, 5, y, 3);
      }
      return state;
    };
    const state = makeSplitGround(832);
    const atlas = bakeTerrainAtlasData(state);
    const repeat = bakeTerrainAtlasData(makeSplitGround(832));
    const otherSeed = bakeTerrainAtlasData(makeSplitGround(3209));
    const midpoint = (y: number): [number, number, number] => {
      const low = sampleTerrainMaterial(state, 4, y);
      const high = sampleTerrainMaterial(state, 5, y);
      return [
        (low.r + high.r) * 0.5,
        (low.g + high.g) * 0.5,
        (low.b + high.b) * 0.5,
      ];
    };
    const edgeDistances = [] as number[];
    const interiorDistances = [] as number[];
    for (let y = 2; y < 10; y++) {
      edgeDistances.push(rgbDistance(atlasLocalPixel(atlas, 4, y, ATLAS_CELL - 1, 4), midpoint(y)));
      interiorDistances.push(rgbDistance(atlasLocalPixel(atlas, 4, y, 3, 4), midpoint(y)));
    }

    expect(repeat.data).toEqual(atlas.data);
    expect(edgeDistances.reduce((sum, value) => sum + value, 0))
      .toBeLessThan(interiorDistances.reduce((sum, value) => sum + value, 0));
    expect(Math.max(...edgeDistances) - Math.min(...edgeDistances)).toBeGreaterThan(5);
    expect(rgbDistance(
      atlasLocalPixel(atlas, 4, 5, ATLAS_CELL - 1, 4),
      atlasLocalPixel(otherSeed, 4, 5, ATLAS_CELL - 1, 4),
    )).toBeGreaterThan(8);
  });

  it("breaks mixed land-material edges with deterministic organic transitions", () => {
    const makeMixedLand = (seed: number) => {
      const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed });
      for (let y = 2; y < 10; y++) {
        state.surfaces[y * state.width + 5] = SURFACE_ROAD;
        state.surfaces[y * state.width + 6] = SURFACE_CONCRETE;
        setTile(state, 7, y, TILE_RESOURCE, 800);
      }
      return state;
    };
    const state = makeMixedLand(832);
    const atlas = bakeTerrainAtlasData(state);
    const repeat = bakeTerrainAtlasData(makeMixedLand(832));
    const otherSeed = bakeTerrainAtlasData(makeMixedLand(3209));
    const boundaries = [
      { x: 4, y: 5 },
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ];

    expect(repeat.data).toEqual(atlas.data);
    for (const { x, y } of boundaries) {
      const leftEdge = atlasLocalPixel(atlas, x, y, ATLAS_CELL - 1, 4);
      const rightEdge = atlasLocalPixel(atlas, x + 1, y, 0, 4);
      const leftInterior = atlasLocalPixel(atlas, x, y, 2, 4);
      const rightInterior = atlasLocalPixel(atlas, x + 1, y, ATLAS_CELL - 3, 4);
      const edgeDistance = rgbDistance(leftEdge, rightEdge);
      const interiorDistance = rgbDistance(leftInterior, rightInterior);
      expect(edgeDistance).toBeLessThan(interiorDistance);
      expect(interiorDistance).toBeGreaterThan(8);
    }

    expect(rgbDistance(
      atlasLocalPixel(atlas, 4, 5, 1, 4),
      atlasLocalPixel(otherSeed, 4, 5, 1, 4),
    )).toBeGreaterThan(1);
    expect(rgbDistance(
      atlasPixelAtTile(atlas, 5, 5),
      atlasPixelAtTile(atlas, 6, 5),
    )).toBeGreaterThan(8);
  });

  it("does not bridge a ground corner through a hard material boundary", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    setHeight(state, 4, 4, 0);
    setHeight(state, 5, 4, 3);
    setHeight(state, 4, 5, 3);
    setTile(state, 5, 5, TILE_WATER);
    const atlas = bakeTerrainAtlasData(state);
    const water = atlasLocalPixel(atlas, 5, 5, 0, 0);
    const ground = atlasLocalPixel(atlas, 4, 4, ATLAS_CELL - 1, ATLAS_CELL - 1);
    expect(water[2]).toBeGreaterThan(water[0]);
    expect(rgbDistance(water, ground)).toBeGreaterThan(28);
  });

  it("bakes a dark grout seam around each concrete pad", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" }, seed: 832 });
    state.surfaces[7 * state.width + 7] = SURFACE_CONCRETE;
    state.surfaces[8 * state.width + 7] = SURFACE_CONCRETE;
    const atlas = bakeTerrainAtlasData(state);
    const rect = atlasRectForTile(7, 7, atlas.mapWidth);
    const lum = (lx: number, ly: number): number => {
      const i = ((rect.sy + ly) * atlas.width + (rect.sx + lx)) * 4;
      return (atlas.data[i] ?? 0) + (atlas.data[i + 1] ?? 0) + (atlas.data[i + 2] ?? 0);
    };
    const center = lum(ATLAS_CELL >> 1, ATLAS_CELL >> 1);
    expect(lum(0, ATLAS_CELL >> 1)).toBeLessThan(center);
    expect(lum(ATLAS_CELL - 1, ATLAS_CELL >> 1)).toBeLessThan(center);
    expect(lum(ATLAS_CELL >> 1, 0)).toBeLessThan(center);
    expect(lum(ATLAS_CELL >> 1, ATLAS_CELL - 1)).toBeLessThan(center);
    const [r, g, b] = atlasPixelAtTile(atlas, 7, 7);
    expect(Math.abs(r - 89)).toBeLessThan(22);
    expect(Math.abs(g - 104)).toBeLessThan(22);
    expect(Math.abs(b - 117)).toBeLessThan(22);
    expect(b).toBeGreaterThan(r);
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
    return { ctx: ctx as unknown as CanvasRenderingContext2D, addColorStop, scale: ctx.scale, arcTo: ctx.arcTo };
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
    expect(addColorStop).toHaveBeenNthCalledWith(2, 0.7, "rgba(0,0,0,1)");
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

describe("ore veins", () => {
  it("is deterministic, bounded, and weaker after harvest", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 3, 2, TILE_RESOURCE, 800);
    let mapX = 3.4;
    let mapY = 2.3;
    let a = oreVeinAt(state, mapX, mapY);
    for (let ly = 0; ly < 8; ly++) {
      for (let lx = 0; lx < 8; lx++) {
        const sample = oreVeinAt(state, 3 + (lx + 0.5) / 8, 2 + (ly + 0.5) / 8);
        if (sample.ridge > a.ridge) {
          a = sample;
          mapX = 3 + (lx + 0.5) / 8;
          mapY = 2 + (ly + 0.5) / 8;
        }
      }
    }
    expect(oreVeinAt(state, mapX, mapY)).toEqual(a);
    expect(a.ridge).toBeGreaterThan(0);
    expect(a.ridge).toBeLessThanOrEqual(1);
    expect(a.intensity).toBeGreaterThan(0);
    expect(a.intensity).toBeLessThanOrEqual(1);
    state.resourceAmount[2 * state.width + 3] = 120;
    const poor = oreVeinAt(state, mapX, mapY);
    expect(poor.ridge).toBe(a.ridge);
    expect(poor.intensity).toBeLessThan(a.intensity);
  });

  it("picks a deterministic peak that harvest can drop below the crystal cutoff", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 3, 2, TILE_RESOURCE, 800);
    const peak = oreVeinPeak(state, 3, 2);
    expect(oreVeinPeak(state, 3, 2)).toEqual(peak);
    let best = 0;
    for (const [fx, fy] of ORE_VEIN_PROBES) {
      const intensity = oreVeinAt(state, 3 + fx, 2 + fy).intensity;
      if (intensity > best) best = intensity;
    }
    expect(peak.intensity).toBe(best);
    expect(peak.intensity).toBeGreaterThanOrEqual(ORE_GLINT_RIDGE);
    state.resourceAmount[2 * state.width + 3] = 50;
    expect(oreVeinPeak(state, 3, 2).intensity).toBeLessThan(ORE_GLINT_RIDGE);
  });

  it("builds a deterministic faceted cluster on a rich peak", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 3, 2, TILE_RESOURCE, 800);
    const cluster = oreCrystalCluster(state, 3, 2);
    expect(cluster).not.toBeNull();
    expect(oreCrystalCluster(state, 3, 2)).toEqual(cluster);
    expect(cluster!.bursts.length).toBeGreaterThanOrEqual(2);
    expect(cluster!.bursts.length).toBeLessThanOrEqual(3);
    expect(cluster!.shards.length).toBeGreaterThanOrEqual(5);
    expect(cluster!.shards.length).toBeLessThanOrEqual(11);
    expect(Math.min(...cluster!.shards.map((s) => s.rise))).toBeGreaterThan(2);
    expect(Math.max(...cluster!.shards.map((s) => s.rise))).toBeGreaterThan(6);
    expect(Math.max(...cluster!.shards.map((s) => s.rise))).toBeLessThan(20);
    const lengths = cluster!.shards.map((s) => Math.hypot(s.lean, s.rise));
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeGreaterThan(2);
    expect(Math.min(...cluster!.shards.map((s) => s.half))).toBeGreaterThan(2);
    expect(Math.max(...cluster!.shards.map((s) => s.half))).toBeLessThan(5);
    const spanX = Math.max(...cluster!.shards.map((s) => s.dx)) - Math.min(...cluster!.shards.map((s) => s.dx));
    const spanY = Math.max(...cluster!.shards.map((s) => s.dy)) - Math.min(...cluster!.shards.map((s) => s.dy));
    expect(Math.hypot(spanX, spanY)).toBeGreaterThan(16);
    const originSpan = Math.hypot(
      Math.max(...cluster!.bursts.map((b) => b.dx)) - Math.min(...cluster!.bursts.map((b) => b.dx)),
      Math.max(...cluster!.bursts.map((b) => b.dy)) - Math.min(...cluster!.bursts.map((b) => b.dy)),
    );
    expect(originSpan).toBeGreaterThan(14);
    const grouped = cluster!.bursts.every((burst) => (
      cluster!.shards.some((shard) => Math.hypot(shard.dx - burst.dx, shard.dy - burst.dy) < 6)
    ));
    expect(grouped).toBe(true);
    state.resourceAmount[2 * state.width + 3] = 120;
    const depleted = oreCrystalCluster(state, 3, 2);
    expect(depleted).not.toBeNull();
    expect(depleted!.intensity).toBeLessThan(cluster!.intensity);
    expect(depleted!.shards.length).toBeLessThanOrEqual(cluster!.shards.length);
    state.resourceAmount[2 * state.width + 3] = ORE_CRYSTAL_MIN_AMOUNT;
    expect(oreCrystalCluster(state, 3, 2)).toBeNull();
  });

  it("varies burst layout across neighboring ore tiles", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const clusters = [];
    for (let y = 1; y < 6; y++) {
      for (let x = 1; x < 6; x++) {
        setTile(state, x, y, TILE_RESOURCE, 800);
        const cluster = oreCrystalCluster(state, x, y);
        expect(cluster).not.toBeNull();
        expect(cluster!.shards.length).toBeGreaterThanOrEqual(4);
        clusters.push(cluster!);
      }
    }
    const signatures = new Set(clusters.map((cluster) => JSON.stringify({
      bursts: cluster.bursts,
      shards: cluster.shards,
    })));
    expect(signatures.size).toBe(clusters.length);
  });
});

describe("terrain weather and water motion", () => {
  it("keeps water terrain and shoreline effects inside the owning cell", () => {
    expect(WATER_COVER).toBe(1);
  });

  it("is deterministic for a given clock", () => {
    const a = weatherParticleAt(832, "tundra grid", 4, 1200, 640, 360);
    const b = weatherParticleAt(832, "tundra grid", 4, 1200, 640, 360);
    expect(a).toEqual(b);
    expect(weatherParticleAt(832, "tundra grid", 4, 2400, 640, 360)).not.toEqual(a);
    expect(waterCaustic(400, 3, 5)).toEqual(waterCaustic(400, 3, 5));
    expect(waterCaustic(800, 3, 5).offset).not.toBe(waterCaustic(400, 3, 5).offset);
    expect(waterCaustic(250, 3, 5).phase).not.toBe(waterCaustic(0, 3, 5).phase);
    expect(oreGlint(900, 2, 2)).toBeGreaterThan(0);
    expect(oreSparkle(900, 2, 2, 0)).toEqual(oreSparkle(900, 2, 2, 0));
    expect(oreSparkle(1800, 2, 2, 0).sweep).not.toBe(oreSparkle(900, 2, 2, 0).sweep);
    expect(oreSparkle(900, 2, 2, 1).twinkle).toBeGreaterThanOrEqual(0);
    expect(oreSparkle(900, 2, 2, 1).twinkle).toBeLessThanOrEqual(1);
    expect(weatherKindForBiome("tundra grid")).toBe("snow");
    expect(weatherKindForBiome("volcanic shelf")).toBe("ember");
    expect(weatherParticleAt(832, "glass desert", 4, 1200, 640, 360).trail).toBeGreaterThan(1);
    expect(weatherParticleAt(832, "glass desert", 4, 1200, 640, 360).rotation).not.toBeNaN();
  });

  it("culls water and ore FX to the visible tile range", () => {
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" }, seed: 832 });
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        setTile(state, x, y, TILE_WATER);
      }
    }
    setTile(state, 2, 2, TILE_RESOURCE, 800);
    setTile(state, 46, 46, TILE_RESOURCE, 800);
    const cam = createCamera();
    cam.x = 400;
    cam.y = 80;
    cam.zoom = 1;
    const water = visibleFxTileCoords(state, cam, 800, 600, "water");
    const ore = visibleFxTileCoords(state, cam, 800, 600, "ore");
    expect(water.length).toBeGreaterThan(0);
    expect(water.length).toBeLessThan(48 * 48);
    expect(water.some((tile) => tile.x === 8 && tile.y === 8)).toBe(true);
    expect(water.some((tile) => tile.x === 46 && tile.y === 46)).toBe(false);
    expect(ore.some((tile) => tile.x === 2 && tile.y === 2)).toBe(true);
    expect(ore.some((tile) => tile.x === 46 && tile.y === 46)).toBe(false);
  });

  it("drops exhausted ore from the dynamic FX index without rescanning the map", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 2, 2, TILE_RESOURCE, 800);
    const cam = createCamera();
    expect(visibleFxTileCoords(state, cam, 800, 600, "ore")).toContainEqual({ x: 2, y: 2 });
    state.tiles[2 * state.width + 2] = TILE_CLEAR;
    state.tick += 1;
    expect(visibleFxTileCoords(state, cam, 800, 600, "ore")).not.toContainEqual({ x: 2, y: 2 });
  });

  it("skips caustic clipping on interior water tiles", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) {
        setTile(state, x, y, TILE_WATER);
      }
    }
    expect(waterFxNeedsClip(state, 3, 3)).toBe(false);
    expect(waterFxNeedsClip(state, 2, 3)).toBe(true);
  });

  it("balances the water pass and each per-tile clip", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) setTile(state, x, y, TILE_WATER);
    }
    const save = vi.fn();
    const restore = vi.fn();
    let contextDepth = 0;
    save.mockImplementation(() => { contextDepth += 1; });
    restore.mockImplementation(() => { contextDepth -= 1; });
    const ctx = new Proxy({
      canvas: { width: 800, height: 600 },
      save,
      restore,
    }, {
      get(target, property, receiver) {
        if (property in target) return Reflect.get(target, property, receiver);
        return vi.fn();
      },
    }) as unknown as CanvasRenderingContext2D;

    paintWaterFx(ctx, state, createCamera(), 0);

    expect(save).toHaveBeenCalledTimes(restore.mock.calls.length);
    expect(restore).toHaveBeenCalledTimes(save.mock.calls.length);
    expect(contextDepth).toBe(0);
  });

});

describe("terrain scroll cache key", () => {
  it("ignores camera translation and changes with zoom or fog bucket", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const cam = createCamera();
    const a = terrainContentKey(state, cam, 640, 360);
    expect(a).toContain("world-atlas-v32-no-feature-boundaries");
    cam.x += 40;
    cam.y -= 18;
    expect(terrainContentKey(state, cam, 640, 360)).toBe(a);
    cam.zoom = 1.15;
    expect(terrainContentKey(state, cam, 640, 360)).not.toBe(a);
    cam.zoom = 1;
    state.tick = 16;
    expect(terrainContentKey(state, cam, 640, 360)).not.toBe(a);
  });

  it("invalidates when the terrain layout changes", () => {
    const state = makeFixture({ width: 8, height: 8, win: { kind: "annihilate" }, seed: 832 });
    const cam = createCamera();
    const ground = terrainContentKey(state, cam, 640, 360);

    setTile(state, 1, 1, TILE_WATER);
    const water = terrainContentKey(state, cam, 640, 360);
    expect(water).not.toBe(ground);

    state.surfaces[2 * state.width + 2] = SURFACE_CONCRETE;
    expect(terrainContentKey(state, cam, 640, 360)).not.toBe(water);
  });
});

describe("minimap classification", () => {
  it("renders terrain from solid tile samples instead of the atlas grid", () => {
    const state = makeFixture({ width: 4, height: 4, win: { kind: "annihilate" } });
    state.entities = [];
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const ctx = {
      canvas: { width: 32, height: 32 },
      fillRect,
      drawImage,
    } as unknown as CanvasRenderingContext2D;

    renderMinimap(ctx, state, []);

    expect(drawImage).not.toHaveBeenCalled();
    expect(fillRect).toHaveBeenCalledTimes(1 + state.width * state.height);
  });

  it("uses one faction color for all unmarked minimap entities", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" } });
    addBuilding(state, 0, "power", 1, 1);
    addBuilding(state, 0, "turret", 3, 1);
    addUnit(state, 0, "infantry", 1, 3);
    addBuilding(state, 1, "power", 8, 8);
    addBuilding(state, 1, "objective", 10, 8);
    addUnit(state, 1, "tank", 8, 10);
    const friendly = state.entities.filter((entity) => entity.owner === 0 && !entity.marked);
    const hostile = state.entities.filter((entity) => entity.owner === 1 && !entity.marked);

    expect(new Set(friendly.map((entity) => entityColor(entity, state))).size).toBe(1);
    expect(new Set(hostile.map((entity) => entityColor(entity, state))).size).toBe(1);

    const marked = friendly[0]!;
    marked.marked = true;
    expect(entityColor(marked, state)).toBe("#ffe066");
  });

  it("keeps minimap region classification and palette semantics coordinated", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" } });
    setTile(state, 1, 1, TILE_WATER);
    setTile(state, 2, 2, TILE_RESOURCE);
    setTile(state, 3, 3, TILE_BLOCKED);
    state.heights[4 * state.width + 4] = 2;
    state.heights[5 * state.width + 5] = 3;
    state.surfaces[6 * state.width + 6] = SURFACE_ROAD;
    state.surfaces[7 * state.width + 7] = SURFACE_CONCRETE;

    expect(minimapRegionForCell(state, 1, 1)).toBe("water");
    expect(minimapRegionForCell(state, 2, 2)).toBe("resource");
    expect(minimapRegionForCell(state, 3, 3)).toBe("blocked");
    expect(minimapRegionForCell(state, 4, 4)).toBe("elevation-mid");
    expect(minimapRegionForCell(state, 5, 5)).toBe("elevation-high");
    expect(minimapRegionForCell(state, 6, 6)).toBe("road");
    expect(minimapRegionForCell(state, 7, 7)).toBe("concrete");
    expect(minimapRegionForCell(state, 0, 0)).toBe("ground");
    setTile(state, 0, 0, TILE_CLEAR);

    const colors = terrainColors("tundra grid");
    expect(colors.low).not.toBe(colors.mid);
    expect(colors.mid).not.toBe(colors.high);
    expect(colors.water).not.toBe(colors.road);
  });

  it("throttles overlay cache keys to every other sim tick", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" }, seed: 832 });
    const view = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
    state.tick = 2;
    const even = minimapCacheKeys(state, view, 96, 96);
    state.tick = 3;
    const odd = minimapCacheKeys(state, view, 96, 96);
    state.tick = 4;
    const next = minimapCacheKeys(state, view, 96, 96);
    expect(MINIMAP_OVERLAY_TICK_SHIFT).toBe(1);
    expect(odd.overlayKey).toBe(even.overlayKey);
    expect(next.overlayKey).not.toBe(even.overlayKey);

    const selected = minimapCacheKeys(state, view, 96, 96, new Set([1, 3]));
    expect(selected.overlayKey).not.toBe(next.overlayKey);
  });

  it("hides stranded minimap contacts until their tile is discovered", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "rescue", targetCount: 1, ticks: 100 } });
    const stranded = addUnit(state, 0, "infantry", 8, 8);
    stranded.neutral = true;
    stranded.scenarioRole = "stranded";
    state.fog.fill(0);

    expect(minimapEntityVisible(state, stranded)).toBe(false);
    const index = fogIndex(state, stranded.x, stranded.y);
    expect(index).not.toBeNull();
    state.fog[index!] = 2;
    expect(minimapEntityVisible(state, stranded)).toBe(true);
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
      "ash plains", "crystal flats", "rust canyons", "salt marshes",
      "glass desert", "tundra grid", "jungle wreckage", "volcanic shelf",
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
      "ash plains", "crystal flats", "rust canyons", "salt marshes",
      "glass desert", "tundra grid", "jungle wreckage", "volcanic shelf",
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
      expect(terrainFeatureAt(state, landmarkTile!.x, landmarkTile!.y).intensity).toBeGreaterThanOrEqual(0.3);
    }
  });

  it("keeps blocker props deterministic and biome-keyed", () => {
    expect(blockerPropKind("ash plains", 9)).toBe(blockerPropKind("ash plains", 9));
    const jungle = new Set(Array.from({ length: 40 }, (_, v) => blockerPropKind("jungle wreckage", v)));
    const desert = new Set(Array.from({ length: 40 }, (_, v) => blockerPropKind("glass desert", v)));
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
      get globalAlpha() { return alpha; },
      set globalAlpha(value: number) { alpha = value; },
      save() { stack.push(alpha); },
      restore() { alpha = stack.pop() ?? 1; },
    } as CanvasRenderingContext2D;
    withAlpha(ctx, 0.5, () => {
      expect(alpha).toBeCloseTo(0.2);
    });
    expect(alpha).toBe(0.4);
  });
});

describe("biome ground patches", () => {
  const colorDistance = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => (
    Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b)
  );

  it("keeps patch sampling deterministic and biome-specific", () => {
    const mats = biomeMaterials("ash plains");
    const a = tintGroundPatches(mats.mid, mats, 4.2, 7.1, 41);
    expect(tintGroundPatches(mats.mid, mats, 4.2, 7.1, 41)).toEqual(a);
    expect(tintGroundPatches(mats.mid, mats, 12.5, 3.2, 41)).not.toEqual(a);

    const jungle = biomeMaterials("jungle wreckage");
    const desert = biomeMaterials("glass desert");
    const jungleTint = tintGroundPatches(jungle.mid, jungle, 5, 5, 41);
    const desertTint = tintGroundPatches(desert.mid, desert, 5, 5, 41);
    expect(jungleTint).not.toEqual(desertTint);
    expect(applyBiomeGroundPattern(jungle.mid, "jungle wreckage", 5.25, 5.25, 41, jungle))
      .toEqual(applyBiomeGroundPattern(jungle.mid, "jungle wreckage", 5.25, 5.25, 41, jungle));
    expect(applyBiomeGroundPattern(jungle.mid, "jungle wreckage", 5.25, 5.25, 41, jungle))
      .not.toEqual(applyBiomeGroundPattern(desert.mid, "glass desert", 5.25, 5.25, 41, desert));
    const jungleMarks = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const sample = applyBiomeGroundPattern(jungle.mid, "jungle wreckage", 5 + i * 0.08, 5.2, 41, jungle);
      jungleMarks.add(`${sample.r|0},${sample.g|0},${sample.b|0}`);
    }
    expect(jungleMarks.size).toBeGreaterThan(1);
  });

  it("smooths former square-cell transitions in biome patches", () => {
    const cases = [
      { biome: "ash plains" as const, x: 7.375, y: 4.5 },
      { biome: "jungle wreckage" as const, x: 7.375, y: 0 },
    ];
    for (const { biome, x, y } of cases) {
      const mats = biomeMaterials(biome);
      const left = applyBiomeGroundPattern(mats.mid, biome, x - 0.001, y, 41, mats);
      const right = applyBiomeGroundPattern(mats.mid, biome, x + 0.001, y, 41, mats);
      const above = applyBiomeGroundPattern(mats.mid, biome, x, y - 0.001, 41, mats);
      const below = applyBiomeGroundPattern(mats.mid, biome, x, y + 0.001, 41, mats);

      expect(colorDistance(left, right)).toBeLessThan(8);
      expect(colorDistance(above, below)).toBeLessThan(8);
    }
  });

  it("varies open ground across tiles and biomes while leaving water and pads alone", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    const origin = sampleTerrainMaterial(state, 2, 2);
    let differ = 0;
    for (let y = 1; y < 11; y++) {
      for (let x = 1; x < 11; x++) {
        const sample = sampleTerrainMaterial(state, x, y);
        if (sample.water || sample.ore || sample.elev !== origin.elev) continue;
        if (sample.r !== origin.r || sample.g !== origin.g || sample.b !== origin.b) differ += 1;
      }
    }
    expect(differ).toBeGreaterThan(0);

    const jungle = { ...state, biome: "jungle wreckage" as BiomeName };
    const desert = { ...state, biome: "glass desert" as BiomeName };
    expect(sampleTerrainMaterial(jungle, 4, 4)).not.toEqual(sampleTerrainMaterial(desert, 4, 4));
    expect(atlasPixelAtTile(bakeTerrainAtlasData(jungle), 4, 4))
      .not.toEqual(atlasPixelAtTile(bakeTerrainAtlasData(desert), 4, 4));

    setTile(state, 1, 1, TILE_WATER);
    state.surfaces[6 * state.width + 6] = SURFACE_ROAD;
    state.surfaces[7 * state.width + 7] = SURFACE_CONCRETE;
    const atlas = bakeTerrainAtlasData(state);
    const water = atlasPixelAtTile(atlas, 1, 1);
    expect(water[2]).toBeGreaterThan(water[0]);
    expect(sampleTerrainMaterial(state, 1, 1).water).toBe(true);
    expect(atlasPixelAtTile(atlas, 6, 6)).not.toEqual(atlasPixelAtTile(atlas, 0, 0));
    const [r, g, b] = atlasPixelAtTile(atlas, 7, 7);
    expect(Math.abs(r - 89)).toBeLessThan(22);
    expect(Math.abs(g - 104)).toBeLessThan(22);
    expect(Math.abs(b - 117)).toBeLessThan(22);
  });

  it("layers coherent terrain-region marks over the biome ground treatment", () => {
    const world = { seed: 832, missionIndex: 2, biome: "glass desert" as const, width: 72, height: 72 };
    let feature = terrainFeatureAt(world, 0, 0);
    let point = { x: 0, y: 0 };
    for (let y = 0; y < world.height; y += 2) {
      for (let x = 0; x < world.width; x += 2) {
        const candidate = terrainFeatureAt(world, x, y);
        if (candidate.intensity > feature.intensity) {
          feature = candidate;
          point = { x, y };
        }
      }
    }
    expect(feature.intensity).toBeGreaterThan(0.2);
    const mats = biomeMaterials(world.biome);
    const plain = applyBiomeGroundPattern(mats.mid, world.biome, point.x + 0.25, point.y + 0.25, 41, mats);
    const regional = applyBiomeGroundPattern(mats.mid, world.biome, point.x + 0.25, point.y + 0.25, 41, mats, feature);
    expect(regional).not.toEqual(plain);
    expect(regional).toEqual(applyBiomeGroundPattern(
      mats.mid,
      world.biome,
      point.x + 0.25,
      point.y + 0.25,
      41,
      mats,
      feature,
    ));
  });
});

describe("grounded biome visual tuning", () => {
  const biomes: BiomeName[] = [
    "ash plains", "crystal flats", "rust canyons", "salt marshes",
    "glass desert", "tundra grid", "jungle wreckage", "volcanic shelf",
  ];

  it("provides deterministic, non-uniform relief settings for every biome", () => {
    const signatures = new Set<string>();
    for (const biome of biomes) {
      const tuning = terrainVisualTuningFor(biome);
      expect(terrainVisualTuningFor(biome)).toBe(tuning);
      expect(tuning.macroStrength).toBeGreaterThan(0);
      expect(tuning.roughness).toBeGreaterThan(0);
      expect(tuning.scatterDensity).toBeGreaterThan(0);
      expect(tuning.windX).not.toBeNaN();
      expect(tuning.windY).not.toBeNaN();
      signatures.add(`${tuning.macroScale}:${tuning.motion}:${tuning.clusterBias}`);
    }
    expect(signatures.size).toBeGreaterThanOrEqual(6);
  });

  it("keeps props matte while restoring more local contrast than the legacy default", () => {
    const base = biomeMaterials("glass desert");
    const legacy = propMaterialsFor(base);
    const grounded = propMaterialsFor(base, terrainVisualTuningFor("glass desert"));
    const chroma = (color: { r: number; g: number; b: number }) => (
      Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b)
    );
    expect(chroma(grounded.mid)).toBeGreaterThan(chroma(legacy.mid));
    expect(chroma(grounded.mid)).toBeLessThanOrEqual(chroma(base.mid));
    expect(chroma(grounded.ore)).toBeLessThanOrEqual(chroma(base.ore));
  });
});

describe("tile sprite blockers", () => {
  function blockedSprite(biome: BiomeName, kind: ReturnType<typeof blockerPropKind>) {
    for (let variant = 0; variant < 64; variant++) {
      const hashed = hash((variant & 0xff) + 17);
      if (blockerPropKind(biome, hashed) === kind) {
        return tileSprite("blocked", 1, { biome, variant });
      }
    }
    throw new Error(`no ${kind} sprite for ${biome}`);
  }

  it("paints biome-specific blocker silhouettes", () => {
    const jungle = blockedSprite("jungle wreckage", "tree");
    const desert = blockedSprite("glass desert", "sandstone");
    const tundra = blockedSprite("tundra grid", "pine");
    expect(jungle.shapes).not.toEqual(desert.shapes);
    expect(tundra.shapes).not.toEqual(jungle.shapes);
    expect(jungle.shapes.filter((shape) => shape.type === "ellipse").length).toBeGreaterThanOrEqual(5);
    expect(tundra.shapes.filter((shape) => shape.type === "poly" && (shape.points?.length ?? 0) === 6).length).toBeGreaterThanOrEqual(5);
    expect(desert.shapes.filter((shape) => shape.type === "poly").length).toBeGreaterThanOrEqual(4);
    expect(tileSprite("blocked", 1, { biome: "jungle wreckage", variant: 3 }).shapes).toEqual(
      tileSprite("blocked", 1, { biome: "jungle wreckage", variant: 3 }).shapes,
    );
    expect(tileSpriteId("blocked", 1, { biome: "jungle wreckage", variant: 3 }))
      .toContain("tactical-surface-v17-rounded-minerals");
  });
});

describe("standalone tile sprite assets", () => {
  it("keeps campaign terrain plates on land sprites but not water", () => {
    const modular = { ...generateCampaignVisualProfile(0), family: 0 as const, terrainTreatment: "modular" as const };
    const armored = { ...modular, terrainTreatment: "armored" as const };
    const land = tileSprite("clear", 1, { biome: "ash plains", variant: 3, campaignProfile: modular });
    const water = tileSprite("water", 0, { biome: "ash plains", variant: 3, campaignProfile: modular });
    const plated = tileSprite("clear", 1, { biome: "ash plains", variant: 3, campaignProfile: armored });
    expect(land.imageTextureSrc).toBe(TERRAIN_ART.modular);
    expect(land.imageTextureOpacity).toBe(0.3);
    expect(water.imageTextureSrc).toBeUndefined();
    expect(plated.imageTextureSrc).toBe(TERRAIN_ART.armored);
    expect(plated.imageTextureSrc).not.toBe(land.imageTextureSrc);
  });
});

function createPaintMock() {
  const ops: string[] = [];
  const geometry: string[] = [];
  const stack: number[] = [];
  let alpha = 1;
  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    get globalAlpha() { return alpha; },
    set globalAlpha(value: number) { alpha = value; },
    save() { stack.push(alpha); },
    restore() { alpha = stack.pop() ?? 1; },
    translate() {},
    rotate() {},
    beginPath() { geometry.push("begin"); },
    moveTo(x: number, y: number) { geometry.push(`m:${x.toFixed(2)},${y.toFixed(2)}`); },
    lineTo(x: number, y: number) { geometry.push(`l:${x.toFixed(2)},${y.toFixed(2)}`); },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      geometry.push(`q:${cx.toFixed(2)},${cy.toFixed(2)},${x.toFixed(2)},${y.toFixed(2)}`);
    },
    closePath() { geometry.push("close"); },
    fill() { ops.push(`fill:${ctx.fillStyle}`); },
    stroke() { ops.push(`stroke:${ctx.strokeStyle}`); },
    ellipse(x: number, y: number, rx: number, ry: number, rotation: number) {
      geometry.push(`e:${x.toFixed(2)},${y.toFixed(2)},${rx.toFixed(2)},${ry.toFixed(2)},${rotation.toFixed(2)}`);
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops, geometry };
}

describe("terrain adornment painting", () => {
  it("gives glass landmarks four deterministic silhouette families", () => {
    const mats = biomeMaterials("glass desert");
    const signatures = new Set<string>();
    for (let variant = 0; variant < 64; variant++) {
      const painted = createPaintMock();
      drawLandmark(painted.ctx, mats, "glass desert", 1, 1, variant);
      signatures.add(painted.geometry.join("|"));
    }
    expect(signatures.size).toBeGreaterThanOrEqual(4);
  });

  it("keeps mineral fragments and mineral landmarks low-profile", () => {
    const mats = biomeMaterials("glass desert");
    const lowestY = (geometry: string[]): number => Math.min(...geometry.flatMap((entry) => {
      const [kind, values] = entry.split(":");
      if (!values) return [];
      const numbers = values.split(",").map(Number);
      if (kind === "e") return [numbers[1]! - numbers[3]!];
      if (kind === "q") return [numbers[1]!, numbers[3]!];
      return [numbers[1]!];
    }));
    const fragment = createPaintMock();
    drawMineralFragment(fragment.ctx, mats, 1, 1, 832);
    expect(lowestY(fragment.geometry)).toBeGreaterThan(-7);
    for (const biome of ["glass desert", "crystal flats", "tundra grid"] as const) {
      const landmark = createPaintMock();
      drawLandmark(landmark.ctx, biomeMaterials(biome), biome, 1, 1, 832);
      expect(lowestY(landmark.geometry), biome).toBeGreaterThan(-9);
    }
  });

  it("adds deterministic material detail to varied scatter silhouettes", () => {
    const mats = biomeMaterials("glass desert");
    const drawCases = [
      (ctx: CanvasRenderingContext2D, variant: number) => drawPebble(ctx, mats, 1, 1, variant),
      (ctx: CanvasRenderingContext2D, variant: number) => drawRockSlab(ctx, mats, 1, 1, variant),
      (ctx: CanvasRenderingContext2D, variant: number) => drawMineralFragment(ctx, mats, 1, 1, variant),
      (ctx: CanvasRenderingContext2D, variant: number) => drawDesertTree(ctx, mats, 1, 1, variant),
      (ctx: CanvasRenderingContext2D, variant: number) => drawCactus(ctx, mats, 1, 1, variant),
      (ctx: CanvasRenderingContext2D, variant: number) => drawDesertShrub(ctx, mats, 1, 1, variant),
      (ctx: CanvasRenderingContext2D, variant: number) => drawCrystalChip(ctx, mats, 1, 1, variant),
      (ctx: CanvasRenderingContext2D, variant: number) => drawIceChip(ctx, mats, 1, 1, variant),
      (ctx: CanvasRenderingContext2D, variant: number) => drawCinder(ctx, mats, 1, 1, variant),
    ];
    for (const draw of drawCases) {
      const signatures = new Set<string>();
      for (let variant = 0; variant < 32; variant++) {
        const painted = createPaintMock();
        draw(painted.ctx, variant);
        signatures.add(`${painted.geometry.join("|")}::${painted.ops.join("|")}`);
        expect(painted.ctx.globalAlpha).toBe(1);
      }
      expect(signatures.size).toBeGreaterThanOrEqual(16);
    }

    const first = createPaintMock();
    const second = createPaintMock();
    drawMineralFragment(first.ctx, mats, 1, 1, 832);
    drawMineralFragment(second.ctx, mats, 1, 1, 832);
    expect(first.geometry).toEqual(second.geometry);
    expect(first.ops).toEqual(second.ops);
    expect(first.ops.filter((op) => op.startsWith("stroke:")).length).toBeGreaterThan(1);
  });

  it("keeps desert flora colors varied but deterministic", () => {
    const mats = biomeMaterials("glass desert");
    const signatures = new Set<string>();
    for (let variant = 0; variant < 32; variant++) {
      const palette = desertFloraPalette(mats, variant);
      expect(desertFloraPalette(mats, variant)).toEqual(palette);
      signatures.add(JSON.stringify(palette));
    }
    expect(signatures.size).toBeGreaterThanOrEqual(3);
  });

  it("keeps scatter geometry proportional to camera zoom", () => {
    const mats = biomeMaterials("glass desert");
    const drawCases = [drawPebble, drawRockSlab, drawMineralFragment];

    for (const draw of drawCases) {
      const base = createPaintMock();
      const scaled = createPaintMock();
      draw(base.ctx, mats, 1, 1, 832);
      draw(scaled.ctx, mats, 2, 1, 832);

      expect(scaled.geometry).toHaveLength(base.geometry.length);
      for (let i = 0; i < base.geometry.length; i++) {
        const baseParts = base.geometry[i]?.split(":");
        const scaledParts = scaled.geometry[i]?.split(":");
        expect(scaledParts?.[0]).toBe(baseParts?.[0]);
        if (!baseParts?.[1] || !scaledParts?.[1]) continue;

        const baseValues = baseParts[1].split(",").map(Number);
        const scaledValues = scaledParts[1].split(",").map(Number);
        const coordinateCount = baseParts[0] === "e" ? 4 : baseValues.length;
        for (let valueIndex = 0; valueIndex < coordinateCount; valueIndex++) {
          expect(scaledValues[valueIndex]).toBeCloseTo((baseValues[valueIndex] ?? 0) * 2, 1);
        }
        if (baseParts[0] === "e") {
          expect(scaledValues[4]).toBeCloseTo(baseValues[4] ?? 0, 2);
        }
      }
    }
  });

  it("paints layered scatter and blocker props deterministically", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    let scatterTile = { x: 0, y: 0 };
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        if (scatterForTile(state, x, y).length > 0) {
          scatterTile = { x, y };
          break;
        }
      }
    }
    const scatterA = createPaintMock();
    drawTerrainScatter(scatterA.ctx, state, scatterTile.x, scatterTile.y, 40, 40, 1);
    const scatterB = createPaintMock();
    drawTerrainScatter(scatterB.ctx, state, scatterTile.x, scatterTile.y, 40, 40, 1);
    expect(scatterA.ops.length).toBeGreaterThan(4);
    expect(scatterB.ops).toEqual(scatterA.ops);

    const jungle = { ...state, biome: "jungle wreckage" as BiomeName };
    const desert = { ...state, biome: "glass desert" as BiomeName };
    const tundra = { ...state, biome: "tundra grid" as BiomeName };
    const junglePaint = createPaintMock();
    const desertPaint = createPaintMock();
    const tundraPaint = createPaintMock();
    drawBlockerProp(junglePaint.ctx, jungle, 4, 4, 40, 40, 1);
    drawBlockerProp(desertPaint.ctx, desert, 4, 4, 40, 40, 1);
    drawBlockerProp(tundraPaint.ctx, tundra, 4, 4, 40, 40, 1);
    expect(junglePaint.ops.length).toBeGreaterThan(6);
    expect(desertPaint.ops.length).toBeGreaterThan(6);
    expect(tundraPaint.ops.length).toBeGreaterThan(6);
    expect(junglePaint.ops).not.toEqual(desertPaint.ops);
    const jungleAgain = createPaintMock();
    drawBlockerProp(jungleAgain.ctx, jungle, 4, 4, 40, 40, 1);
    expect(jungleAgain.ops).toEqual(junglePaint.ops);
  });

  it("renders grounded extras for every biome without leaking canvas alpha", () => {
    const biomes: BiomeName[] = [
      "ash plains", "crystal flats", "rust canyons", "salt marshes",
      "glass desert", "tundra grid", "jungle wreckage", "volcanic shelf",
    ];
    for (const biome of biomes) {
      const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
      state.biome = biome;
      setTile(state, 3, 2, TILE_RESOURCE, 800);
      let scatterTile: { x: number; y: number } | undefined;
      for (let y = 0; y < state.height && !scatterTile; y++) {
        for (let x = 0; x < state.width; x++) {
          if (scatterForTile(state, x, y).length > 0) {
            scatterTile = { x, y };
            break;
          }
        }
      }
      const painted = createPaintMock();
      painted.ctx.globalAlpha = 0.6;
      if (scatterTile) drawTerrainScatter(painted.ctx, state, scatterTile.x, scatterTile.y, 40, 40, 1);
      drawBlockerProp(painted.ctx, state, 4, 4, 40, 40, 1);
      drawOreCrystals(painted.ctx, state, createCamera(), 3, 2, 1, 1);
      expect(painted.ctx.globalAlpha).toBeCloseTo(0.6);
      expect(painted.ops.length).toBeGreaterThan(4);
    }
  });

  it("uses the grounded prop material response for ore crystals", () => {
    const state = makeFixture({ width: 12, height: 12, win: { kind: "annihilate" }, seed: 832 });
    setTile(state, 3, 2, TILE_RESOURCE, 800);
    const painted = createPaintMock();
    drawOreCrystals(painted.ctx, state, createCamera(), 3, 2, 1, 1);
    const mats = propMaterialsFor(biomeMaterials(state.biome), terrainVisualTuningFor(state.biome));
    const expectedHi = rgbMix(mats.light, { r: 255, g: 246, b: 210 }, 0.42);
    expect(painted.ops).toContain(`fill:${expectedHi}`);
    expect(painted.ops).toContain(`stroke:${expectedHi}`);
    expect(painted.ops).toContain(`fill:${rgbOf(mats.dark)}`);
  });
});
