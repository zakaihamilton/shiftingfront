import { describe, expect, it } from "vitest";
import { tileSprite, tileSpriteId } from "../../lib/gen/assets";
import { terrainFeatureAt } from "../../lib/gen/map";
import { hash } from "../../lib/gen/tilePalette";
import { TERRAIN_ART } from "../../lib/gen/visualAssets";
import { generateCampaignVisualProfile } from "../../lib/gen/visualProfile";
import { createCamera } from "../../lib/iso";
import {
  applyBiomeGroundPattern,
  atlasPixelAtTile,
  bakeTerrainAtlasData,
  biomeMaterials,
  sampleTerrainMaterial,
  tintGroundPatches,
} from "../../lib/render/terrainAtlas";
import { propMaterialsFor, terrainVisualTuningFor } from "../../lib/render/terrainMaterials";
import {
  blockerPropKind,
  drawBlockerProp,
  drawOreCrystals,
  drawTerrainScatter,
  rgbMix,
  scatterForTile,
} from "../../lib/render/terrainPaint";
import { rgbOf } from "../../lib/render/terrainPaint/style";
import { makeFixture, setTile } from "../../lib/sim/fixtures";
import type { BiomeName } from "../../lib/types";
import { SURFACE_CONCRETE, SURFACE_ROAD, TILE_RESOURCE, TILE_WATER } from "../../lib/types";

describe("biome ground patches", () => {
  const colorDistance = (
    a: { r: number; g: number; b: number },
    b: { r: number; g: number; b: number },
  ) => Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b);

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
    expect(applyBiomeGroundPattern(jungle.mid, "jungle wreckage", 5.25, 5.25, 41, jungle)).toEqual(
      applyBiomeGroundPattern(jungle.mid, "jungle wreckage", 5.25, 5.25, 41, jungle),
    );
    expect(
      applyBiomeGroundPattern(jungle.mid, "jungle wreckage", 5.25, 5.25, 41, jungle),
    ).not.toEqual(applyBiomeGroundPattern(desert.mid, "glass desert", 5.25, 5.25, 41, desert));
    const jungleMarks = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const sample = applyBiomeGroundPattern(
        jungle.mid,
        "jungle wreckage",
        5 + i * 0.08,
        5.2,
        41,
        jungle,
      );
      jungleMarks.add(`${sample.r | 0},${sample.g | 0},${sample.b | 0}`);
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
    expect(atlasPixelAtTile(bakeTerrainAtlasData(jungle), 4, 4)).not.toEqual(
      atlasPixelAtTile(bakeTerrainAtlasData(desert), 4, 4),
    );

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
    const world = {
      seed: 832,
      missionIndex: 2,
      biome: "glass desert" as const,
      width: 72,
      height: 72,
    };
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
    const plain = applyBiomeGroundPattern(
      mats.mid,
      world.biome,
      point.x + 0.25,
      point.y + 0.25,
      41,
      mats,
    );
    const regional = applyBiomeGroundPattern(
      mats.mid,
      world.biome,
      point.x + 0.25,
      point.y + 0.25,
      41,
      mats,
      feature,
    );
    expect(regional).not.toEqual(plain);
    expect(regional).toEqual(
      applyBiomeGroundPattern(
        mats.mid,
        world.biome,
        point.x + 0.25,
        point.y + 0.25,
        41,
        mats,
        feature,
      ),
    );
  });
});

describe("grounded biome visual tuning", () => {
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
    const chroma = (color: { r: number; g: number; b: number }) =>
      Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
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
    expect(jungle.shapes.filter((shape) => shape.type === "ellipse").length).toBeGreaterThanOrEqual(
      5,
    );
    expect(
      tundra.shapes.filter((shape) => shape.type === "poly" && (shape.points?.length ?? 0) === 6)
        .length,
    ).toBeGreaterThanOrEqual(5);
    expect(desert.shapes.filter((shape) => shape.type === "poly").length).toBeGreaterThanOrEqual(4);
    expect(tileSprite("blocked", 1, { biome: "jungle wreckage", variant: 3 }).shapes).toEqual(
      tileSprite("blocked", 1, { biome: "jungle wreckage", variant: 3 }).shapes,
    );
    expect(tileSpriteId("blocked", 1, { biome: "jungle wreckage", variant: 3 })).toContain(
      "tactical-surface-v17-rounded-minerals",
    );
  });
});

describe("standalone tile sprite assets", () => {
  it("keeps campaign terrain plates on land sprites but not water", () => {
    const modular = {
      ...generateCampaignVisualProfile(0),
      family: 0 as const,
      terrainTreatment: "modular" as const,
    };
    const armored = { ...modular, terrainTreatment: "armored" as const };
    const land = tileSprite("clear", 1, {
      biome: "ash plains",
      variant: 3,
      campaignProfile: modular,
    });
    const water = tileSprite("water", 0, {
      biome: "ash plains",
      variant: 3,
      campaignProfile: modular,
    });
    const plated = tileSprite("clear", 1, {
      biome: "ash plains",
      variant: 3,
      campaignProfile: armored,
    });
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
    translate() {},
    rotate() {},
    beginPath() {
      geometry.push("begin");
    },
    moveTo(x: number, y: number) {
      geometry.push(`m:${x.toFixed(2)},${y.toFixed(2)}`);
    },
    lineTo(x: number, y: number) {
      geometry.push(`l:${x.toFixed(2)},${y.toFixed(2)}`);
    },
    quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
      geometry.push(`q:${cx.toFixed(2)},${cy.toFixed(2)},${x.toFixed(2)},${y.toFixed(2)}`);
    },
    bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number) {
      geometry.push(
        `b:${cp1x.toFixed(2)},${cp1y.toFixed(2)},${cp2x.toFixed(2)},${cp2y.toFixed(2)},${x.toFixed(2)},${y.toFixed(2)}`,
      );
    },
    closePath() {
      geometry.push("close");
    },
    fill() {
      ops.push(`fill:${ctx.fillStyle}`);
    },
    stroke() {
      ops.push(`stroke:${ctx.strokeStyle}`);
    },
    fillRect() {
      ops.push(`fillRect:${ctx.fillStyle}`);
    },
    clearRect() {
      ops.push("clearRect");
    },
    arc() {
      geometry.push("arc");
    },
    ellipse() {
      geometry.push("ellipse");
    },
  } as unknown as CanvasRenderingContext2D;
  return { ops, geometry, ctx };
}

describe("terrain adornment painting", () => {
  it("renders grounded extras for every biome without leaking canvas alpha", () => {
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
      if (scatterTile)
        drawTerrainScatter(painted.ctx, state, scatterTile.x, scatterTile.y, 40, 40, 1);
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
