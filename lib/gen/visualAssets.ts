import { isHiddenObjectiveAsset, type AnimFrame, type BiomeName, type BuildingKind, type Entity, type Facing, type SimState, type SpriteCrop, type UnitKind } from "../types";
import { fogAt } from "../sim/fog";

export type RasterArtKey = "menu" | "victory" | "defeat" | BiomeName;
export type TextureArtKey = "brushed" | "worn" | "crt";

/**
 * Pre-rendered tactical sprites are deliberately kept separate from the UI and
 * scene art. They are loaded into the canvas renderer at runtime, preserving
 * the existing simulation-facing sprite dimensions and anchors.
 */
export const SPRITE_ART: Record<BuildingKind, string> = {
  constructionYard: "/art/sprites/sleek-modular/construction-yard-v2.webp",
  power: "/art/sprites/sleek-modular/power-v2.webp",
  refinery: "/art/sprites/sleek-modular/refinery-v2.webp",
  barracks: "/art/sprites/sleek-modular/barracks-v2.webp",
  factory: "/art/sprites/sleek-modular/factory-v2.webp",
  turret: "/art/sprites/sleek-modular/turret-v2.webp",
  runway: "/art/sprites/sleek-modular/air-support/runway-v1.webp",
  antiAirTurret: "/art/sprites/sleek-modular/air-support/anti-air-turret-v1.webp",
  objective: "/art/sprites/sleek-modular/objective-v2.webp",
};

export const AIR_SUPPORT_ART = {
  strikePlane: "/art/sprites/sleek-modular/air-support/strike-plane-front-right-v1.webp",
  runway: "/art/sprites/sleek-modular/air-support/runway-v1.webp",
  antiAirTurret: "/art/sprites/sleek-modular/air-support/anti-air-turret-v1.webp",
} as const;

// The generated anti-air image contains a separate upper assembly. Keep only
// its lower platform in the building sprite so the animated model can replace
// the static guns and radar head at render time.
export const ANTI_AIR_TURRET_BASE_CROP = {
  x: 0,
  y: 600,
  w: 1315,
  h: 597,
  sourceW: 1315,
  sourceH: 1197,
  refW: 1315,
  refH: 1197,
} as const;


export type UnitView =
  | "right"
  | "front-right"
  | "front"
  | "front-left"
  | "left"
  | "back-left"
  | "back"
  | "back-right";

export const STRIKE_PLANE_DIRECTION_ART: Record<UnitView, string> = {
  right: "/art/sprites/sleek-modular/air-support/strike-plane-right-v1.webp",
  "front-right": AIR_SUPPORT_ART.strikePlane,
  front: "/art/sprites/sleek-modular/air-support/strike-plane-front-v1.webp",
  "front-left": "/art/sprites/sleek-modular/air-support/strike-plane-front-left-v1.webp",
  left: "/art/sprites/sleek-modular/air-support/strike-plane-left-v1.webp",
  "back-left": "/art/sprites/sleek-modular/air-support/strike-plane-back-left-v1.webp",
  back: "/art/sprites/sleek-modular/air-support/strike-plane-back-v1.webp",
  "back-right": "/art/sprites/sleek-modular/air-support/strike-plane-back-right-v1.webp",
};

// The aircraft source canvases have intentionally generous, view-specific
// transparent margins. These are the normalized centers of the opaque
// airframe in those canvases, so each authored view shares one world pivot.
// Ground units keep the main-branch bottom alignment; this correction is only
// for the top-down plane sprites.
export const STRIKE_PLANE_IMAGE_ANCHORS: Record<UnitView, readonly [number, number]> = {
  right: [0.5049, 0.4956],
  "front-right": [0.5003, 0.4829],
  front: [0.5007, 0.4976],
  "front-left": [0.5192, 0.4927],
  left: [0.5190, 0.5049],
  "back-left": [0.5212, 0.4858],
  back: [0.5003, 0.4634],
  "back-right": [0.5055, 0.5060],
};

export type WalkerKind = "infantry" | "antiArmor" | "medic";

const WALK_CYCLE_SHEET_SIZE = 1024;
const WALK_CYCLE_FRAME_SIZE = WALK_CYCLE_SHEET_SIZE / 2;

/**
 * Every playable unit must ship a complete directional roster. Keep this map
 * total so adding a UnitKind without matching art is a compile-time error.
 */
export const UNIT_DIRECTION_ART: Record<UnitKind, Record<UnitView, string>> = {
  harvester: {
    "front-right": "/art/sprites/sleek-modular/harvester-front-right-v1.webp",
    front: "/art/sprites/sleek-modular/harvester-front.webp",
    right: "/art/sprites/sleek-modular/harvester-right-v2.webp",
    "front-left": "/art/sprites/sleek-modular/harvester-front-left-v1.webp",
    "back-left": "/art/sprites/sleek-modular/harvester-back-left-v1.webp",
    back: "/art/sprites/sleek-modular/harvester-back.webp",
    left: "/art/sprites/sleek-modular/harvester-left-v2.webp",
    "back-right": "/art/sprites/sleek-modular/harvester-back-right-v1.webp",
  },
  infantry: {
    "front-right": "/art/sprites/sleek-modular/infantry-front-right-v1.webp",
    front: "/art/sprites/sleek-modular/infantry-front-v1.webp",
    right: "/art/sprites/sleek-modular/infantry-right-v1.webp",
    "front-left": "/art/sprites/sleek-modular/infantry-front-left-v1.webp",
    "back-left": "/art/sprites/sleek-modular/infantry-back-left-v1.webp",
    back: "/art/sprites/sleek-modular/infantry-back-v1.webp",
    left: "/art/sprites/sleek-modular/infantry-left-v1.webp",
    "back-right": "/art/sprites/sleek-modular/infantry-back-right-v1.webp",
  },
  antiArmor: {
    "front-right": "/art/sprites/sleek-modular/anti-armor-front-right-v1.webp",
    front: "/art/sprites/sleek-modular/anti-armor-front.webp",
    right: "/art/sprites/sleek-modular/anti-armor-right.webp",
    "front-left": "/art/sprites/sleek-modular/anti-armor-front-left-v1.webp",
    "back-left": "/art/sprites/sleek-modular/anti-armor-back-left-v1.webp",
    back: "/art/sprites/sleek-modular/anti-armor-back.webp",
    left: "/art/sprites/sleek-modular/anti-armor-left.webp",
    "back-right": "/art/sprites/sleek-modular/anti-armor-back-right-v1.webp",
  },
  tank: {
    "front-right": "/art/sprites/sleek-modular/tank-front-right-v1.webp",
    front: "/art/sprites/sleek-modular/tank-front.webp",
    right: "/art/sprites/sleek-modular/tank-right.webp",
    "front-left": "/art/sprites/sleek-modular/tank-front-left-v1.webp",
    "back-left": "/art/sprites/sleek-modular/tank-back-left-v1.webp",
    back: "/art/sprites/sleek-modular/tank-back.webp",
    left: "/art/sprites/sleek-modular/tank-left.webp",
    "back-right": "/art/sprites/sleek-modular/tank-back-right-v1.webp",
  },
  medic: {
    "front-right": "/art/sprites/sleek-modular/medic-front-right-v1.webp",
    front: "/art/sprites/sleek-modular/medic-front-v1.webp",
    right: "/art/sprites/sleek-modular/medic-right-v1.webp",
    "front-left": "/art/sprites/sleek-modular/medic-front-left-v1.webp",
    "back-left": "/art/sprites/sleek-modular/medic-back-left-v1.webp",
    back: "/art/sprites/sleek-modular/medic-back-v1.webp",
    "back-right": "/art/sprites/sleek-modular/medic-back-right-v1.webp",
    left: "/art/sprites/sleek-modular/medic-left-v1.webp",
  },
  repairTruck: {
    "front-right": "/art/sprites/sleek-modular/repair-truck-front-right-v1.webp",
    front: "/art/sprites/sleek-modular/repair-truck-front-v1.webp",
    right: "/art/sprites/sleek-modular/repair-truck-right-v1.webp",
    "front-left": "/art/sprites/sleek-modular/repair-truck-front-left-v1.webp",
    "back-left": "/art/sprites/sleek-modular/repair-truck-back-left-v1.webp",
    back: "/art/sprites/sleek-modular/repair-truck-back-v1.webp",
    "back-right": "/art/sprites/sleek-modular/repair-truck-back-right-v1.webp",
    left: "/art/sprites/sleek-modular/repair-truck-left-v1.webp",
  },
  convoyTruck: {
    "front-right": "/art/sprites/sleek-modular/convoy-truck-front-right-v1.webp",
    front: "/art/sprites/sleek-modular/convoy-truck-front-v1.webp",
    right: "/art/sprites/sleek-modular/convoy-truck-right-v1.webp",
    "front-left": "/art/sprites/sleek-modular/convoy-truck-front-left-v1.webp",
    "back-left": "/art/sprites/sleek-modular/convoy-truck-back-left-v1.webp",
    back: "/art/sprites/sleek-modular/convoy-truck-back-v1.webp",
    left: "/art/sprites/sleek-modular/convoy-truck-left-v1.webp",
    "back-right": "/art/sprites/sleek-modular/convoy-truck-back-right-v1.webp",
  },
  strikePlane: STRIKE_PLANE_DIRECTION_ART,
};

/** Generated four-frame walk cycles for units with visible legs and feet. */
export const UNIT_WALK_CYCLE_ART: Record<WalkerKind, Record<UnitView, string>> = {
  infantry: {
    front: "/art/sprites/sleek-modular/walk-cycle/infantry-front-walk-v1.webp",
    "front-right": "/art/sprites/sleek-modular/walk-cycle/infantry-front-right-walk-v1.webp",
    right: "/art/sprites/sleek-modular/walk-cycle/infantry-right-walk-v1.webp",
    "front-left": "/art/sprites/sleek-modular/walk-cycle/infantry-front-left-walk-v1.webp",
    left: "/art/sprites/sleek-modular/walk-cycle/infantry-left-walk-v1.webp",
    "back-left": "/art/sprites/sleek-modular/walk-cycle/infantry-back-left-walk-v1.webp",
    back: "/art/sprites/sleek-modular/walk-cycle/infantry-back-walk-v1.webp",
    "back-right": "/art/sprites/sleek-modular/walk-cycle/infantry-back-right-walk-v1.webp",
  },
  antiArmor: {
    front: "/art/sprites/sleek-modular/walk-cycle/anti-armor-front-walk-v1.webp",
    "front-right": "/art/sprites/sleek-modular/walk-cycle/anti-armor-front-right-walk-v1.webp",
    right: "/art/sprites/sleek-modular/walk-cycle/anti-armor-right-walk-v1.webp",
    "front-left": "/art/sprites/sleek-modular/walk-cycle/anti-armor-front-left-walk-v1.webp",
    left: "/art/sprites/sleek-modular/walk-cycle/anti-armor-left-walk-v1.webp",
    "back-left": "/art/sprites/sleek-modular/walk-cycle/anti-armor-back-left-walk-v1.webp",
    back: "/art/sprites/sleek-modular/walk-cycle/anti-armor-back-walk-v1.webp",
    "back-right": "/art/sprites/sleek-modular/walk-cycle/anti-armor-back-right-walk-v1.webp",
  },
  medic: {
    front: "/art/sprites/sleek-modular/walk-cycle/medic-front-walk-v1.webp",
    "front-right": "/art/sprites/sleek-modular/walk-cycle/medic-front-right-walk-v1.webp",
    right: "/art/sprites/sleek-modular/walk-cycle/medic-right-walk-v1.webp",
    "front-left": "/art/sprites/sleek-modular/walk-cycle/medic-front-left-walk-v1.webp",
    left: "/art/sprites/sleek-modular/walk-cycle/medic-left-walk-v1.webp",
    "back-left": "/art/sprites/sleek-modular/walk-cycle/medic-back-left-walk-v1.webp",
    back: "/art/sprites/sleek-modular/walk-cycle/medic-back-walk-v1.webp",
    "back-right": "/art/sprites/sleek-modular/walk-cycle/medic-back-right-walk-v1.webp",
  },
};

export function unitWalkFrameCrop(frame: AnimFrame): SpriteCrop {
  const column = frame & 1;
  const row = (frame >> 1) & 1;
  return {
    x: column * WALK_CYCLE_FRAME_SIZE,
    y: row * WALK_CYCLE_FRAME_SIZE,
    w: WALK_CYCLE_FRAME_SIZE,
    h: WALK_CYCLE_FRAME_SIZE,
    sourceW: WALK_CYCLE_SHEET_SIZE,
    sourceH: WALK_CYCLE_SHEET_SIZE,
    refW: WALK_CYCLE_FRAME_SIZE,
    refH: WALK_CYCLE_FRAME_SIZE,
  };
}

/** Generated direction sheets contain a few neighboring partial renders at the edge. */
export const UNIT_DIRECTION_CROPS: Partial<Record<UnitKind, Partial<Record<UnitView, SpriteCrop>>>> = {
  tank: {
    right: { x: 0, y: 0, w: 722, h: 473, sourceW: 722, sourceH: 473, refW: 722, refH: 502 },
    "front-right": { x: 0, y: 0, w: 704, h: 460, sourceW: 704, sourceH: 491, refW: 722, refH: 502 },
    front: { x: 0, y: 0, w: 555, h: 502, sourceW: 683, sourceH: 502, refW: 722, refH: 502 },
    "front-left": { x: 0, y: 0, w: 704, h: 460, sourceW: 704, sourceH: 491, refW: 722, refH: 502 },
    left: { x: 0, y: 0, w: 721, h: 489, sourceW: 721, sourceH: 489, refW: 722, refH: 502 },
    "back-left": { x: 0, y: 0, w: 704, h: 455, sourceW: 704, sourceH: 491, refW: 722, refH: 502 },
    back: { x: 0, y: 0, w: 565, h: 480, sourceW: 687, sourceH: 511, refW: 722, refH: 502 },
    "back-right": { x: 0, y: 0, w: 704, h: 455, sourceW: 704, sourceH: 491, refW: 722, refH: 502 },
  },
  harvester: {
    right: { x: 0, y: 0, w: 1024, h: 645, sourceW: 1024, sourceH: 683 },
    "front-right": { x: 0, y: 0, w: 704, h: 440, sourceW: 704, sourceH: 491 },
    front: { x: 0, y: 0, w: 535, h: 580, sourceW: 627, sourceH: 580, refW: 944, refH: 882 },
    "front-left": { x: 0, y: 0, w: 704, h: 440, sourceW: 704, sourceH: 491 },
    left: { x: 0, y: 0, w: 1024, h: 645, sourceW: 1024, sourceH: 683 },
    "back-left": { x: 0, y: 0, w: 704, h: 445, sourceW: 704, sourceH: 491 },
    back: { x: 0, y: 0, w: 535, h: 515, sourceW: 627, sourceH: 588, refW: 944, refH: 882 },
    "back-right": { x: 0, y: 0, w: 704, h: 445, sourceW: 704, sourceH: 491 },
  },
  repairTruck: {
    right: { x: 16, y: 0, w: 368, h: 418, sourceW: 384, sourceH: 512 },
    "front-right": { x: 16, y: 0, w: 344, h: 480, sourceW: 384, sourceH: 512 },
    front: { x: 52, y: 0, w: 280, h: 468, sourceW: 384, sourceH: 512 },
    "front-left": { x: 16, y: 0, w: 344, h: 479, sourceW: 384, sourceH: 512 },
    left: { x: 0, y: 0, w: 384, h: 438, sourceW: 384, sourceH: 512 },
    "back-left": { x: 20, y: 0, w: 300, h: 464, sourceW: 384, sourceH: 512 },
    back: { x: 52, y: 0, w: 280, h: 432, sourceW: 384, sourceH: 512 },
    "back-right": { x: 14, y: 0, w: 300, h: 461, sourceW: 384, sourceH: 512 },
  },
  convoyTruck: {
    right: { x: 0, y: 0, w: 384, h: 356, sourceW: 384, sourceH: 512 },
    "front-right": { x: 0, y: 0, w: 384, h: 438, sourceW: 384, sourceH: 512 },
    front: { x: 0, y: 0, w: 384, h: 448, sourceW: 384, sourceH: 512 },
    "front-left": { x: 0, y: 0, w: 384, h: 398, sourceW: 384, sourceH: 512 },
    left: { x: 0, y: 0, w: 384, h: 348, sourceW: 384, sourceH: 512 },
    "back-left": { x: 0, y: 0, w: 384, h: 396, sourceW: 384, sourceH: 512 },
    back: { x: 0, y: 0, w: 384, h: 442, sourceW: 384, sourceH: 512 },
    "back-right": { x: 0, y: 0, w: 384, h: 391, sourceW: 384, sourceH: 512 },
  },
};

export function unitViewForFacing(facing: Facing): UnitView {
  if (facing === 0) return "right";
  if (facing === 1) return "front-right";
  if (facing === 2) return "front";
  if (facing === 3) return "front-left";
  if (facing === 4) return "left";
  if (facing === 5) return "back-left";
  if (facing === 6) return "back";
  return "back-right";
}

export const TERRAIN_ART = {
  modular: "/art/terrain/modular-v1.webp",
  armored: "/art/terrain/armored-v1.webp",
  expeditionary: "/art/terrain/expeditionary-v1.webp",
} as const;

export const RASTER_ART: Record<RasterArtKey, string> = {
  menu: "/art/menu-command-vista.webp",
  victory: "/art/results/victory.webp",
  defeat: "/art/results/defeat.webp",
  "ash plains": "/art/biomes/ash-plains.webp",
  "crystal flats": "/art/biomes/crystal-flats.webp",
  "rust canyons": "/art/biomes/rust-canyons.webp",
  "salt marshes": "/art/biomes/salt-marshes.webp",
  "glass desert": "/art/biomes/glass-desert.webp",
  "tundra grid": "/art/biomes/tundra-grid.webp",
  "jungle wreckage": "/art/biomes/jungle-wreckage.webp",
  "volcanic shelf": "/art/biomes/volcanic-shelf.webp",
};

export const TEXTURE_ART: Record<TextureArtKey, string> = {
  brushed: "/art/textures/brushed-gunmetal.webp",
  worn: "/art/textures/worn-panel.webp",
  crt: "/art/textures/crt-glass.webp",
};

export function biomeArt(biome: BiomeName): string {
  return RASTER_ART[biome];
}

export function listTacticalRasterSources(): string[] {
  const srcs = [...Object.values(SPRITE_ART)];
  for (const views of Object.values(UNIT_DIRECTION_ART)) {
    srcs.push(...Object.values(views));
  }
  for (const views of Object.values(UNIT_WALK_CYCLE_ART)) {
    srcs.push(...Object.values(views));
  }
  return srcs;
}

/**
 * Returns only the raster sources needed by living entities in a mission.
 * Asset Bay and future unit types remain lazy so opening a battlefield does
 * not download the complete art catalog.
 */
export function listMissionRasterSources(
  state: Pick<SimState, "entities" | "fog" | "width" | "height">,
): string[] {
  const sources = new Set<string>();
  for (const entity of state.entities) {
    if (entity.hp <= 0 || !isMissionRasterVisible(state, entity)) continue;
    if (entity.class === "building") {
      sources.add(SPRITE_ART[entity.kind as BuildingKind]);
      continue;
    }
    const directional = UNIT_DIRECTION_ART[entity.kind as UnitKind];
    if (!directional) continue;
    for (const source of Object.values(directional)) sources.add(source);
    if (entity.kind === "infantry" || entity.kind === "antiArmor" || entity.kind === "medic") {
      for (const source of Object.values(UNIT_WALK_CYCLE_ART[entity.kind])) sources.add(source);
    }
  }
  return [...sources];
}

function isMissionRasterVisible(
  state: Pick<SimState, "fog" | "width" | "height">,
  entity: Pick<Entity, "class" | "owner" | "neutral" | "scenarioRole" | "x" | "y">,
): boolean {
  if (entity.owner === 1) {
    const fog = fogAt(state, Math.round(entity.x), Math.round(entity.y));
    return entity.class === "unit" ? fog > 0 : fog === 2;
  }

  if (isHiddenObjectiveAsset(entity)) {
    return fogAt(state, Math.round(entity.x), Math.round(entity.y)) === 2;
  }

  return true;
}
