import { describe, expect, it } from "vitest";
import {
  ATLAS_CELL,
  atlasPixelAtTile,
  atlasRectForTile,
  bakeTerrainAtlasData,
  sampleTerrainMaterial,
  type TerrainAtlasData,
} from "../../lib/render/terrainAtlas";
import { makeFixture, setHeight, setTile } from "../../lib/sim/fixtures";
import { SURFACE_CONCRETE, SURFACE_ROAD, TILE_RESOURCE, TILE_WATER } from "../../lib/types";

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

describe("terrain atlas surface blending", () => {
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
      expect(
        rgbDistance(
          atlasEdgeAverage(atlas, x, y, "east"),
          atlasEdgeAverage(atlas, x + 1, y, "west"),
        ),
      ).toBeLessThan(14);
      expect(
        rgbDistance(
          atlasEdgeAverage(atlas, x, y, "south"),
          atlasEdgeAverage(atlas, x, y + 1, "north"),
        ),
      ).toBeLessThan(14);
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
      ...cornerSamples.flatMap((sample, index) =>
        cornerSamples.slice(index + 1).map((other) => rgbDistance(sample, other)),
      ),
    );
    const sourceLuminance = [
      sampleTerrainMaterial(state, 4, 4),
      sampleTerrainMaterial(state, 5, 4),
      sampleTerrainMaterial(state, 4, 5),
      sampleTerrainMaterial(state, 5, 5),
    ].map(({ r, g, b }) => r + g + b);
    const bridgeLuminance =
      sourceLuminance.reduce((sum, value) => sum + value, 0) / sourceLuminance.length;
    const surroundingLuminance = [
      atlasPixelAtTile(atlas, 4, 4),
      atlasPixelAtTile(atlas, 5, 4),
      atlasPixelAtTile(atlas, 4, 5),
      atlasPixelAtTile(atlas, 5, 5),
    ].map(([r, g, b]) => r + g + b);

    expect(repeat.data).toEqual(atlas.data);
    expect(
      rgbDistance(atlasLocalPixel(atlas, 5, 4, 0, 3), atlasLocalPixel(otherSeed, 5, 4, 0, 3)),
    ).toBeGreaterThan(8);
    expect(cornerColorSpread).toBeLessThan(28);
    expect(cornerSpread).toBeLessThan(28);
    for (let index = 0; index < cornerLuminance.length; index++) {
      expect(Math.abs(cornerLuminance[index]! - bridgeLuminance)).toBeLessThan(
        Math.abs(sourceLuminance[index]! - bridgeLuminance),
      );
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
      return [(low.r + high.r) * 0.5, (low.g + high.g) * 0.5, (low.b + high.b) * 0.5];
    };
    const edgeDistances = [] as number[];
    const interiorDistances = [] as number[];
    for (let y = 2; y < 10; y++) {
      edgeDistances.push(rgbDistance(atlasLocalPixel(atlas, 4, y, ATLAS_CELL - 1, 4), midpoint(y)));
      interiorDistances.push(rgbDistance(atlasLocalPixel(atlas, 4, y, 3, 4), midpoint(y)));
    }

    expect(repeat.data).toEqual(atlas.data);
    expect(edgeDistances.reduce((sum, value) => sum + value, 0)).toBeLessThan(
      interiorDistances.reduce((sum, value) => sum + value, 0),
    );
    expect(Math.max(...edgeDistances) - Math.min(...edgeDistances)).toBeGreaterThan(5);
    expect(
      rgbDistance(
        atlasLocalPixel(atlas, 4, 5, ATLAS_CELL - 1, 4),
        atlasLocalPixel(otherSeed, 4, 5, ATLAS_CELL - 1, 4),
      ),
    ).toBeGreaterThan(8);
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

    expect(
      rgbDistance(atlasLocalPixel(atlas, 4, 5, 1, 4), atlasLocalPixel(otherSeed, 4, 5, 1, 4)),
    ).toBeGreaterThan(1);
    expect(
      rgbDistance(atlasPixelAtTile(atlas, 5, 5), atlasPixelAtTile(atlas, 6, 5)),
    ).toBeGreaterThan(8);
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
});
