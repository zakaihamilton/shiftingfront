import { generateCampaignVisualProfile } from "../gen/visualProfile";
import { sceneryAt, type SceneryWorld } from "../gen/map";
import type { BiomeName, CampaignVisualProfile } from "../types";
import { mixRgb, terrainVisualTuningFor, type Rgb } from "./terrainMaterials";

export type TerrainLightRig = {
  directionX: number;
  directionY: number;
  ambient: number;
  keyStrength: number;
  occlusionStrength: number;
  keyColor: Rgb;
  atmosphereColor: Rgb;
  phase: number;
};

export type TerrainAtmosphereFrame = {
  phase: number;
  driftX: number;
  driftY: number;
  glowAlpha: number;
  hazeAlpha: number;
};

const rigCache = new Map<number, TerrainLightRig>();
const profileRigCache = new Map<string, TerrainLightRig>();
const biomeRigCache = new Map<string, TerrainLightRig>();

function hash01(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

function accentColors(accent: CampaignVisualProfile["terrainAccent"]): { key: Rgb; atmosphere: Rgb } {
  if (accent === "amber") {
    return {
      key: { r: 255, g: 211, b: 143 },
      atmosphere: { r: 225, g: 163, b: 104 },
    };
  }
  if (accent === "red") {
    return {
      key: { r: 255, g: 183, b: 161 },
      atmosphere: { r: 203, g: 113, b: 101 },
    };
  }
  return {
    key: { r: 190, g: 240, b: 235 },
    atmosphere: { r: 113, g: 187, b: 197 },
  };
}

export function terrainLightRigFor(
  seed: number,
  profile?: CampaignVisualProfile,
): TerrainLightRig {
  if (profile === undefined) {
    const cached = rigCache.get(seed);
    if (cached) return cached;
  }
  const resolvedProfile = profile ?? generateCampaignVisualProfile(seed);
  const profileKey = `${seed}:${resolvedProfile.family}:${resolvedProfile.terrainTreatment}:${resolvedProfile.terrainAccent}`;
  const cachedProfile = profileRigCache.get(profileKey);
  if (cachedProfile) {
    if (profile === undefined) rigCache.set(seed, cachedProfile);
    return cachedProfile;
  }
  const colors = accentColors(resolvedProfile.terrainAccent);
  const familyContrast = resolvedProfile.family === 1 ? 0.96 : resolvedProfile.family === 2 ? 0.99 : 1;
  const rig: TerrainLightRig = {
    // Light arrives from the upper-left of the isometric diamond. Keeping this
    // direction stable makes cliffs, props, and tile materials read as one scene.
    directionX: 0.72,
    directionY: 0.58,
    ambient: 0.88 * familyContrast,
    keyStrength: 0.13 * familyContrast,
    occlusionStrength: 0.08,
    keyColor: colors.key,
    atmosphereColor: colors.atmosphere,
    phase: hash01(seed ^ 0x6d2b79f5) * Math.PI * 2,
  };
  profileRigCache.set(profileKey, rig);
  if (profile === undefined) rigCache.set(seed, rig);
  return rig;
}

export function clearTerrainLightCache(): void {
  rigCache.clear();
  profileRigCache.clear();
  biomeRigCache.clear();
}

/**
 * Apply biome-specific contrast to the shared seeded light direction. The
 * direction and phase remain campaign-stable, while each material family gets
 * an appropriate amount of relief and contact shadow.
 */
export function terrainLightRigForBiome(
  seed: number,
  biome: BiomeName,
  profile?: CampaignVisualProfile,
): TerrainLightRig {
  const resolvedProfile = profile ?? generateCampaignVisualProfile(seed);
  const key = `${seed}:${biome}:${resolvedProfile.family}:${resolvedProfile.terrainTreatment}:${resolvedProfile.terrainAccent}`;
  const cached = biomeRigCache.get(key);
  if (cached) return cached;
  const base = terrainLightRigFor(seed, resolvedProfile);
  const tuning = terrainVisualTuningFor(biome);
  const rig: TerrainLightRig = {
    ...base,
    ambient: clamp(base.ambient - tuning.shadowDepth * 0.38, 0.78, 0.92),
    keyStrength: clamp(base.keyStrength + tuning.keyStrength * 0.38, 0.12, 0.22),
    occlusionStrength: clamp(base.occlusionStrength + tuning.shadowDepth * 0.62, 0.08, 0.17),
  };
  biomeRigCache.set(key, rig);
  return rig;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function terrainEdgeOcclusion(rig: TerrainLightRig, fx: number, fy: number): number {
  return (
    Math.max(0, fx - 0.56) * 0.55
    + Math.max(0, fy - 0.56) * 0.7
  ) * rig.occlusionStrength;
}

export function terrainEdgeDarkening(rig: TerrainLightRig, fx: number, fy: number): number {
  return clamp(1 - terrainEdgeOcclusion(rig, fx, fy), 0.94, 1);
}

/**
 * Estimate a soft surface response from the height changes toward the two
 * visible isometric faces and the pixel's position inside its tile.
 */
export function terrainLightFactor(
  rig: TerrainLightRig,
  elev: number,
  eastElev: number,
  southElev: number,
  fx: number,
  fy: number,
): number {
  const faceX = Math.sin((0.5 - fx) * Math.PI) * rig.directionX;
  const faceY = Math.sin((0.5 - fy) * Math.PI) * rig.directionY;
  const relief = (elev - eastElev) * rig.directionX * 0.08
    + (elev - southElev) * rig.directionY * 0.1;
  const faceLight = (faceX + faceY) * rig.keyStrength * 0.72;
  return clamp(rig.ambient + faceLight + relief - terrainEdgeOcclusion(rig, fx, fy), 0.76, 1.12);
}

/** Shared low-contrast light response for terrain props and scatter. */
export function terrainPropLightFactor(world: SceneryWorld, x: number, y: number): number {
  const here = sceneryAt(world, x, y);
  const east = sceneryAt(world, x + 1, y);
  const south = sceneryAt(world, x, y + 1);
  return terrainLightFactor(
    terrainLightRigForBiome(world.seed ?? 0, world.biome),
    here.elev,
    east.elev,
    south.elev,
    0.44,
    0.38,
  );
}

/** Shared low-contrast alpha response for all terrain extras. */
export function terrainPropLightGain(world: SceneryWorld, x: number, y: number): number {
  const light = terrainPropLightFactor(world, x, y);
  return clamp(0.9 + (light - 0.9) * 0.42, 0.82, 1.02);
}

export function gradeTerrainColor(color: Rgb, factor: number, rig: TerrainLightRig, tint = 0): Rgb {
  let out = {
    r: color.r * factor,
    g: color.g * factor,
    b: color.b * factor,
  };
  const keyTint = clamp(Math.max(0, factor - 0.96) * 0.3 + tint, 0, 0.12);
  if (keyTint > 0) out = mixRgb(out, rig.keyColor, keyTint);
  const shadowTint = clamp(Math.max(0, 0.96 - factor) * 0.18, 0, 0.06);
  if (shadowTint > 0) out = mixRgb(out, { r: 10, g: 16, b: 20 }, shadowTint);
  return out;
}

export function restrainTerrainColor(color: Rgb, amount = 0.08): Rgb {
  const luma = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  return mixRgb(color, { r: luma, g: luma, b: luma }, amount);
}

export function terrainAtmosphereFrame(
  seed: number,
  timeMs: number,
  reducedMotion = false,
): TerrainAtmosphereFrame {
  const rig = terrainLightRigFor(seed);
  const phase = reducedMotion ? rig.phase : rig.phase + (timeMs / 12000) * Math.PI * 2;
  const drift = reducedMotion ? 0 : Math.sin(phase) * 0.5 + Math.sin(phase * 0.37 + 1.3) * 0.2;
  return {
    phase,
    driftX: Math.cos(phase * 0.83) * 0.08 + drift * 0.06,
    driftY: Math.sin(phase * 0.61) * 0.06,
    glowAlpha: reducedMotion ? 0.022 : 0.06,
    hazeAlpha: reducedMotion ? 0.009 : 0.024,
  };
}

export function biomeAtmosphereColor(biome: BiomeName, rig: TerrainLightRig): Rgb {
  if (biome === "ash plains" || biome === "volcanic shelf") {
    return mixRgb(rig.atmosphereColor, { r: 112, g: 92, b: 79 }, 0.26);
  }
  if (biome === "tundra grid" || biome === "crystal flats") {
    return mixRgb(rig.atmosphereColor, { r: 143, g: 201, b: 212 }, 0.24);
  }
  if (biome === "jungle wreckage" || biome === "salt marshes") {
    return mixRgb(rig.atmosphereColor, { r: 92, g: 151, b: 111 }, 0.22);
  }
  return rig.atmosphereColor;
}
