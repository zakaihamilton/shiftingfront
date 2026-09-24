import { mixSeed } from "../../seed/rng";
import type { BiomeName } from "../../types";
import { warpedFbm } from "./noise";

/** A feature region affects gameplay once its seeded intensity reaches this. */
export const ACTIVE_TERRAIN_RULE_INTENSITY = 0.55;

/**
 * Large-scale terrain themes are deliberately visual vocabulary, not new tile
 * rules. Their small generation biases only shape the existing water, height,
 * and blocker classes; the renderer uses the same sample for ground detail.
 */
export type TerrainFeatureKind =
  | "ashDrift"
  | "cinderBasin"
  | "scoriaField"
  | "crystalVein"
  | "reflectivePan"
  | "facetRise"
  | "strataGully"
  | "mesaShelf"
  | "scrapWash"
  | "mudflat"
  | "reedBed"
  | "saltPan"
  | "duneSea"
  | "glassShards"
  | "dryWash"
  | "frostPan"
  | "iceRift"
  | "driftMoraine"
  | "canopyGrove"
  | "wreckClearing"
  | "vineRidge"
  | "basaltShelf"
  | "lavaScar"
  | "ashCone";

export type TerrainFeatureWorld = {
  seed: number;
  missionIndex?: number;
  biome: BiomeName;
  width: number;
  height: number;
};

export type TerrainFeatureSample = {
  kind: TerrainFeatureKind;
  /** Strength of the active regional feature, from 0 to 1. */
  intensity: number;
  /** Biases used only while assigning the existing terrain classes. */
  wetness: number;
  elevation: number;
  blockers: number;
  /** A stable value for fine patterns and prop placement. */
  detail: number;
};

type TerrainFeatureDefinition = {
  kind: TerrainFeatureKind;
  wetness: number;
  elevation: number;
  blockers: number;
};

const BIOME_FEATURES: Record<BiomeName, readonly TerrainFeatureDefinition[]> = {
  "ash plains": [
    { kind: "ashDrift", wetness: -0.38, elevation: -0.2, blockers: -0.1 },
    { kind: "cinderBasin", wetness: 0.46, elevation: -0.32, blockers: 0.18 },
    { kind: "scoriaField", wetness: -0.12, elevation: 0.14, blockers: 0.24 },
  ],
  "crystal flats": [
    { kind: "crystalVein", wetness: -0.1, elevation: 0.08, blockers: 0.18 },
    { kind: "reflectivePan", wetness: 0.18, elevation: -0.2, blockers: -0.16 },
    { kind: "facetRise", wetness: -0.2, elevation: 0.42, blockers: 0.04 },
  ],
  "rust canyons": [
    { kind: "strataGully", wetness: 0.26, elevation: -0.34, blockers: -0.08 },
    { kind: "mesaShelf", wetness: -0.22, elevation: 0.48, blockers: 0.12 },
    { kind: "scrapWash", wetness: 0.1, elevation: -0.08, blockers: 0.34 },
  ],
  "salt marshes": [
    { kind: "mudflat", wetness: 0.52, elevation: -0.3, blockers: -0.12 },
    { kind: "reedBed", wetness: 0.3, elevation: -0.08, blockers: 0.48 },
    { kind: "saltPan", wetness: -0.32, elevation: -0.18, blockers: -0.24 },
  ],
  "glass desert": [
    { kind: "duneSea", wetness: -0.48, elevation: 0.16, blockers: -0.2 },
    { kind: "glassShards", wetness: -0.18, elevation: 0.04, blockers: 0.12 },
    { kind: "dryWash", wetness: 0.2, elevation: -0.3, blockers: -0.14 },
  ],
  "tundra grid": [
    { kind: "frostPan", wetness: 0.04, elevation: -0.14, blockers: -0.18 },
    { kind: "iceRift", wetness: 0.34, elevation: -0.28, blockers: -0.08 },
    { kind: "driftMoraine", wetness: -0.18, elevation: 0.34, blockers: 0.16 },
  ],
  "jungle wreckage": [
    { kind: "canopyGrove", wetness: 0.16, elevation: 0.04, blockers: 0.56 },
    { kind: "wreckClearing", wetness: -0.12, elevation: -0.08, blockers: -0.42 },
    { kind: "vineRidge", wetness: 0.04, elevation: 0.34, blockers: 0.3 },
  ],
  "volcanic shelf": [
    { kind: "basaltShelf", wetness: -0.2, elevation: 0.42, blockers: 0.16 },
    { kind: "lavaScar", wetness: 0.12, elevation: -0.18, blockers: 0.08 },
    { kind: "ashCone", wetness: -0.26, elevation: 0.52, blockers: 0.22 },
  ],
};

function clamp01(value: number): number {
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function featurePair(world: TerrainFeatureWorld): {
  first: TerrainFeatureDefinition;
  second: TerrainFeatureDefinition;
  salt: number;
} {
  const options = BIOME_FEATURES[world.biome];
  const mission = world.missionIndex ?? 0;
  const salt = mixSeed(world.seed, `terrain-regions:${mission}:${world.biome}`) || 1;
  const firstIndex = salt % options.length;
  const offset = 1 + ((salt >>> 9) % (options.length - 1));
  return {
    first: options[firstIndex]!,
    second: options[(firstIndex + offset) % options.length]!,
    salt,
  };
}

/**
 * Return a coherent, map-scale feature sample. This is intentionally pure so
 * map generation, the playable edge, and the renderer all agree on it.
 */
export function terrainFeatureSamplerFor(world: TerrainFeatureWorld): (x: number, y: number) => TerrainFeatureSample {
  const { first, second, salt } = featurePair(world);
  const scale = Math.max(40, Math.max(world.width, world.height));
  return (x, y) => {
    const px = x / scale;
    const py = y / scale;
    const primaryField = warpedFbm(px * 11.5, py * 11.5, salt + 31);
    const secondaryField = warpedFbm(px * 8.25 + 17, py * 8.25 - 11, salt + 79);
    const detail = warpedFbm(px * 36 + 5, py * 36 - 3, salt + 149);
    const primary = smoothstep(0.5, 0.71, primaryField);
    const secondary = smoothstep(0.53, 0.74, secondaryField) * (0.92 - primary * 0.48);
    const usePrimary = primary >= secondary;
    const active = usePrimary ? first : second;
    const intensity = usePrimary ? primary : secondary;
    return {
      kind: active.kind,
      intensity,
      wetness: active.wetness * intensity,
      elevation: active.elevation * intensity,
      blockers: active.blockers * intensity,
      detail,
    };
  };
}

export function terrainFeatureAt(world: TerrainFeatureWorld, x: number, y: number): TerrainFeatureSample {
  return terrainFeatureSamplerFor(world)(x, y);
}
