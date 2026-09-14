import { generateCampaignVisualProfile } from "../gen/visualProfile";
import { hashNoise, valueNoise } from "../gen/map/noise";
import { mixSeed } from "../seed/rng";
import type { BiomeName, CampaignVisualProfile, SurfaceKind } from "../types";
import { SURFACE_NONE } from "../types";
import type { SceneryWorld } from "../gen/map";

// Preserve the renderer-facing name while sharing the canonical implementation
// with deterministic map generation.
export const hash2 = hashNoise;

export const ATLAS_CELL = 8;
export const TERRAIN_ATLAS_REV = "world-atlas-v18-organic-land-material-transitions";
export const CONCRETE_STEEL = { r: 89, g: 104, b: 117 };
export const CONCRETE_STEEL_LIGHT = { r: 154, g: 171, b: 186 };
export const CONCRETE_STEEL_DARK = { r: 38, g: 50, b: 61 };

export type AtlasWorld = SceneryWorld & {
  seed: number;
  missionIndex?: number;
  surfaces: SurfaceKind[];
  resourceAmount: number[];
};

export type TerrainSample = {
  r: number;
  g: number;
  b: number;
  water: boolean;
  ore: boolean;
  elev: number;
};

export type Rgb = { r: number; g: number; b: number };

export type BiomeMaterials = {
  low: Rgb;
  mid: Rgb;
  high: Rgb;
  light: Rgb;
  dark: Rgb;
  waterDeep: Rgb;
  waterMid: Rgb;
  waterHi: Rgb;
  shore: Rgb;
  road: Rgb;
  concrete: Rgb;
  ore: Rgb;
  blocked: Rgb;
  /** Regional soil / moss / sand patch mixed into open ground. */
  patchA: Rgb;
  /** Accent flecks: frost, glass, scoria, leaf litter. */
  patchB: Rgb;
};

const BIOME_MATERIALS: Record<BiomeName, BiomeMaterials> = {
  "ash plains": {
    low: rgb(46, 58, 52),
    mid: rgb(78, 96, 82),
    high: rgb(118, 132, 112),
    light: rgb(154, 168, 148),
    dark: rgb(28, 36, 32),
    waterDeep: rgb(18, 58, 82),
    waterMid: rgb(32, 104, 126),
    waterHi: rgb(122, 176, 178),
    shore: rgb(138, 128, 96),
    road: rgb(86, 74, 58),
    concrete: rgb(89, 104, 117),
    ore: rgb(168, 132, 52),
    blocked: rgb(42, 50, 44),
    patchA: rgb(132, 138, 124),
    patchB: rgb(38, 44, 40),
  },
  "crystal flats": {
    low: rgb(36, 64, 66),
    mid: rgb(68, 112, 108),
    high: rgb(126, 176, 168),
    light: rgb(168, 214, 204),
    dark: rgb(22, 42, 46),
    waterDeep: rgb(24, 62, 70),
    waterMid: rgb(42, 112, 118),
    waterHi: rgb(150, 214, 208),
    shore: rgb(118, 148, 142),
    road: rgb(70, 88, 86),
    concrete: rgb(89, 104, 117),
    ore: rgb(176, 196, 92),
    blocked: rgb(40, 66, 64),
    patchA: rgb(46, 96, 90),
    patchB: rgb(186, 230, 220),
  },
  "rust canyons": {
    low: rgb(72, 42, 32),
    mid: rgb(126, 78, 52),
    high: rgb(176, 118, 74),
    light: rgb(210, 160, 108),
    dark: rgb(42, 24, 20),
    waterDeep: rgb(28, 58, 64),
    waterMid: rgb(48, 90, 92),
    waterHi: rgb(132, 176, 168),
    shore: rgb(156, 118, 78),
    road: rgb(96, 62, 44),
    concrete: rgb(89, 104, 117),
    ore: rgb(196, 132, 48),
    blocked: rgb(64, 38, 30),
    patchA: rgb(168, 88, 48),
    patchB: rgb(62, 32, 24),
  },
  "salt marshes": {
    low: rgb(40, 58, 48),
    mid: rgb(72, 102, 82),
    high: rgb(118, 142, 108),
    light: rgb(156, 176, 132),
    dark: rgb(24, 38, 32),
    waterDeep: rgb(24, 52, 46),
    waterMid: rgb(42, 90, 72),
    waterHi: rgb(132, 186, 158),
    shore: rgb(122, 122, 80),
    road: rgb(74, 70, 52),
    concrete: rgb(89, 104, 117),
    ore: rgb(168, 148, 64),
    blocked: rgb(38, 54, 42),
    patchA: rgb(48, 70, 58),
    patchB: rgb(110, 148, 86),
  },
  "glass desert": {
    low: rgb(92, 74, 50),
    mid: rgb(148, 118, 78),
    high: rgb(196, 164, 112),
    light: rgb(226, 206, 154),
    dark: rgb(54, 42, 30),
    waterDeep: rgb(32, 74, 76),
    waterMid: rgb(52, 122, 118),
    waterHi: rgb(150, 214, 200),
    shore: rgb(196, 176, 124),
    road: rgb(118, 96, 68),
    concrete: rgb(89, 104, 117),
    ore: rgb(196, 160, 64),
    blocked: rgb(86, 70, 48),
    patchA: rgb(214, 190, 132),
    patchB: rgb(232, 220, 176),
  },
  "tundra grid": {
    low: rgb(52, 72, 78),
    mid: rgb(86, 116, 120),
    high: rgb(148, 176, 176),
    light: rgb(198, 220, 218),
    dark: rgb(28, 42, 48),
    waterDeep: rgb(32, 64, 78),
    waterMid: rgb(58, 112, 128),
    waterHi: rgb(176, 216, 222),
    shore: rgb(148, 160, 156),
    road: rgb(68, 88, 94),
    concrete: rgb(89, 104, 117),
    ore: rgb(176, 168, 84),
    blocked: rgb(48, 64, 70),
    patchA: rgb(210, 226, 224),
    patchB: rgb(72, 88, 92),
  },
  "jungle wreckage": {
    low: rgb(28, 50, 34),
    mid: rgb(52, 92, 58),
    high: rgb(92, 132, 78),
    light: rgb(132, 168, 102),
    dark: rgb(16, 32, 22),
    waterDeep: rgb(20, 50, 44),
    waterMid: rgb(36, 86, 68),
    waterHi: rgb(118, 186, 154),
    shore: rgb(92, 86, 52),
    road: rgb(62, 54, 38),
    concrete: rgb(89, 104, 117),
    ore: rgb(168, 148, 48),
    blocked: rgb(30, 48, 32),
    patchA: rgb(72, 86, 42),
    patchB: rgb(24, 42, 28),
  },
  "volcanic shelf": {
    low: rgb(52, 38, 38),
    mid: rgb(88, 62, 58),
    high: rgb(132, 96, 88),
    light: rgb(176, 132, 112),
    dark: rgb(28, 20, 22),
    waterDeep: rgb(22, 36, 44),
    waterMid: rgb(40, 60, 70),
    waterHi: rgb(128, 156, 158),
    shore: rgb(102, 86, 70),
    road: rgb(78, 50, 44),
    concrete: rgb(89, 104, 117),
    ore: rgb(196, 124, 48),
    blocked: rgb(48, 34, 34),
    patchA: rgb(72, 40, 38),
    patchB: rgb(36, 28, 32),
  },
};
export function rgb(r: number, g: number, b: number): Rgb {
  return { r, g, b };
}

export function clampByte(n: number): number {
  return n < 0 ? 0 : n > 255 ? 255 : n;
}

export function mixRgb(a: Rgb, b: Rgb, t: number): Rgb {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return {
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  };
}

export function scaleRgb(color: Rgb, amount: number): Rgb {
  return { r: color.r * amount, g: color.g * amount, b: color.b * amount };
}

export function fbm(x: number, y: number, salt: number): number {
  return valueNoise(x, y, salt) * 0.55 + valueNoise(x * 2, y * 2, salt + 17) * 0.3 + valueNoise(x * 4, y * 4, salt + 31) * 0.15;
}

export function artSalt(state: AtlasWorld): number {
  return mixSeed(state.seed, `terrain-art:${state.missionIndex ?? 0}`) || 1;
}

export function inMap(state: AtlasWorld, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.width && y < state.height;
}

export function surfaceAt(state: AtlasWorld, x: number, y: number): SurfaceKind {
  if (!inMap(state, x, y)) return SURFACE_NONE;
  return state.surfaces[y * state.width + x] ?? SURFACE_NONE;
}

export function resourceAt(state: AtlasWorld, x: number, y: number): number {
  if (!inMap(state, x, y)) return 0;
  return state.resourceAmount[y * state.width + x] ?? 0;
}

function campaignTint(profile: CampaignVisualProfile): Rgb {
  if (profile.terrainAccent === "amber") return rgb(231, 174, 99);
  if (profile.terrainAccent === "red") return rgb(216, 120, 104);
  return rgb(121, 213, 223);
}

export function biomeMaterials(biome: BiomeName): BiomeMaterials {
  return BIOME_MATERIALS[biome];
}

export function fogTerrainGain(fog: number): number {
  if (fog >= 2) return 1;
  if (fog === 1) return 0.55;
  return 0;
}

export function tileVariant(seed: number, x: number, y: number): number {
  return ((seed * 83492791) ^ (x * 73856093) ^ (y * 19349663)) >>> 0;
}

const materialMemo = new Map<string, BiomeMaterials>();
const MATERIAL_MEMO_LIMIT = 32;

export function clearTerrainMaterialCache(): void {
  materialMemo.clear();
}

export function materialsFor(state: AtlasWorld): BiomeMaterials {
  const key = `${state.seed}:${state.biome}`;
  const cached = materialMemo.get(key);
  if (cached) return cached;
  const base = BIOME_MATERIALS[state.biome];
  const tint = campaignTint(generateCampaignVisualProfile(state.seed));
  const amount = 0.04;
  const mats = {
    ...base,
    light: mixRgb(base.light, tint, amount),
    mid: mixRgb(base.mid, tint, amount * 0.45),
    waterHi: mixRgb(base.waterHi, tint, amount * 0.5),
    patchA: mixRgb(base.patchA, tint, amount * 0.3),
    patchB: mixRgb(base.patchB, tint, amount * 0.2),
  };
  if (!materialMemo.has(key) && materialMemo.size >= MATERIAL_MEMO_LIMIT) {
    const oldest = materialMemo.keys().next().value;
    if (oldest !== undefined) materialMemo.delete(oldest);
  }
  materialMemo.set(key, mats);
  return mats;
}

const propMaterialMemo = new WeakMap<object, BiomeMaterials>();

/** Props inherit the biome without reading like brightly painted icons. */
export function propMaterialsFor(mats: BiomeMaterials): BiomeMaterials {
  const cached = propMaterialMemo.get(mats);
  if (cached) return cached;
  const soften = (color: Rgb, amount: number): Rgb => {
    const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    return mixRgb(color, { r: luma, g: luma, b: luma }, amount);
  };
  const muted: BiomeMaterials = {
    ...mats,
    low: soften(mats.low, 0.1),
    mid: soften(mats.mid, 0.1),
    high: soften(mats.high, 0.1),
    light: soften(mats.light, 0.08),
    dark: mixRgb(soften(mats.dark, 0.1), mats.mid, 0.08),
    waterDeep: soften(mats.waterDeep, 0.08),
    waterMid: soften(mats.waterMid, 0.08),
    waterHi: soften(mats.waterHi, 0.12),
    shore: soften(mats.shore, 0.1),
    road: soften(mats.road, 0.1),
    concrete: soften(mats.concrete, 0.08),
    ore: soften(mats.ore, 0.14),
    blocked: mixRgb(soften(mats.blocked, 0.1), mats.mid, 0.06),
    patchA: soften(mats.patchA, 0.12),
    patchB: soften(mats.patchB, 0.12),
  };
  propMaterialMemo.set(mats, muted);
  return muted;
}

export function terrainColors(biome: BiomeName): {
  low: string;
  mid: string;
  high: string;
  water: string;
  road: string;
  concrete: string;
  blocked: string;
} {
  const mats = BIOME_MATERIALS[biome];
  const hex = (c: Rgb) => `#${[c.r, c.g, c.b].map((n) => clampByte(n).toString(16).padStart(2, "0")).join("")}`;
  return {
    low: hex(mats.low),
    mid: hex(mats.mid),
    high: hex(mats.high),
    water: hex(mats.waterDeep),
    road: hex(mats.road),
    concrete: hex(mats.concrete),
    blocked: hex(mats.blocked),
  };
}
