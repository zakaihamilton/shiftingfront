import type { BiomeName, LandmarkKind, SurfaceKind, Vec2 } from "../../types";
import {
  SURFACE_CONCRETE,
  SURFACE_NONE,
  TILE_CLEAR,
  TILE_RESOURCE,
} from "../../types";
import type { Rng } from "../../seed/rng";
import { idx, inBounds } from "./terrain";
import type { LandmarkField } from "./landmarkStamps";
import {
  stampBasaltShelf,
  stampCaldera,
  stampCanyon,
  stampCrater,
  stampCrevasse,
  stampDelta,
  stampRuinClearing,
  stampSpireRidge,
} from "./landmarkStamps";
import { resourceCenterNear, resourceCenterOnOpenGround } from "./generator/resources";
import { walkDistances } from "./generator/affordances";

export function landmarkForBiome(biome: BiomeName): LandmarkKind {
  switch (biome) {
    case "ash plains":
      return "crater";
    case "crystal flats":
      return "spireRidge";
    case "rust canyons":
      return "canyon";
    case "salt marshes":
      return "delta";
    case "glass desert":
      return "caldera";
    case "tundra grid":
      return "crevasse";
    case "jungle wreckage":
      return "ruinClearing";
    case "volcanic shelf":
      return "basaltShelf";
    default:
      return "crater";
  }
}

export type LandmarkContext = {
  kind: LandmarkKind;
  center: Vec2;
  radius: number;
  axis: Vec2;
};

/**
 * Apply the biome-specific landmark monument onto the map terrain.
 * Landmarks create prominent, tactically meaningful landforms (craters, gorges,
 * ridges, plateaus) while ensuring natural passes/fords exist for ground navigation.
 */
export function applyBiomeLandmark(
  kind: LandmarkKind,
  tiles: number[],
  heights: number[],
  surfaces: number[],
  width: number,
  height: number,
  playerStart: Vec2,
  enemyStart: Vec2,
  rng: Rng,
): LandmarkContext {
  const midX = Math.round((playerStart.x + enemyStart.x) / 2 + (rng.next() * 6 - 3));
  const midY = Math.round((playerStart.y + enemyStart.y) / 2 + (rng.next() * 6 - 3));
  const center: Vec2 = {
    x: Math.max(8, Math.min(width - 9, midX)),
    y: Math.max(8, Math.min(height - 9, midY)),
  };

  const dx = enemyStart.x - playerStart.x;
  const dy = enemyStart.y - playerStart.y;
  const len = Math.hypot(dx, dy) || 1;
  const perp: Vec2 = { x: -dy / len, y: dx / len };
  const radius = Math.round(Math.min(width, height) * 0.18 + rng.int(4));

  const protectedRadius = 9;
  const isProtectedBase = (x: number, y: number) =>
    Math.hypot(x - playerStart.x, y - playerStart.y) < protectedRadius ||
    Math.hypot(x - enemyStart.x, y - enemyStart.y) < protectedRadius;

  const field: LandmarkField = {
    tiles,
    heights,
    width,
    height,
    center,
    radius,
    perp,
    dx,
    dy,
    len,
    rng,
    isProtectedBase,
  };
  switch (kind) {
    case "crater":
      stampCrater(field);
      break;
    case "spireRidge":
      stampSpireRidge(field);
      break;
    case "canyon":
      stampCanyon(field);
      break;
    case "delta":
      stampDelta(field);
      break;
    case "caldera":
      stampCaldera(field);
      break;
    case "crevasse":
      stampCrevasse(field);
      break;
    case "ruinClearing":
      stampRuinClearing(field);
      break;
    case "basaltShelf":
      stampBasaltShelf(field);
      break;
  }

  void surfaces;
  return { kind, center, radius, axis: perp };
}

/**
 * Generates resource patches evenly dispersed across the map, shaped to match
 * the geometry of the active landmark (linear veins, concentric arcs, or clustered sandbars).
 */
export function generateLandmarkResourceVeins(
  tiles: number[],
  heights: number[],
  resourceAmount: number[],
  surfaces: SurfaceKind[],
  width: number,
  height: number,
  distances: Int32Array,
  landmark: LandmarkContext,
  playerStart: Vec2,
  enemyStart: Vec2,
  totalPatches: number,
  rng: Rng,
): void {
  const protectedDist = 7;
  const isTooCloseToBase = (x: number, y: number) =>
    Math.hypot(x - playerStart.x, y - playerStart.y) < protectedDist ||
    Math.hypot(x - enemyStart.x, y - enemyStart.y) < protectedDist;

  // 1. Safe base-adjacent starter patches for both sides
  const towardEnemy = {
    x: Math.sign(enemyStart.x - playerStart.x),
    y: Math.sign(enemyStart.y - playerStart.y),
  };
  const lateral = { x: -towardEnemy.y, y: towardEnemy.x };

  const safeP = {
    x: Math.max(3, Math.min(width - 4, playerStart.x + towardEnemy.x * 8 + lateral.x)),
    y: Math.max(3, Math.min(height - 4, playerStart.y + towardEnemy.y * 8 + lateral.y)),
  };
  const safeE = {
    x: Math.max(3, Math.min(width - 4, enemyStart.x - towardEnemy.x * 8 + lateral.x)),
    y: Math.max(3, Math.min(height - 4, enemyStart.y - towardEnemy.y * 8 + lateral.y)),
  };

  const playerStarter = starterCenter(tiles, surfaces, heights, distances, width, height, playerStart, safeP);
  const enemyDistances = walkDistances(tiles, heights, width, height, enemyStart);
  const enemyStarter = starterCenter(tiles, surfaces, heights, enemyDistances, width, height, enemyStart, safeE);

  stampResourceCluster(tiles, heights, resourceAmount, surfaces, width, height, playerStarter, 3, rng);
  stampResourceCluster(tiles, heights, resourceAmount, surfaces, width, height, enemyStarter, 3, rng);

  // 2. Dispersed landmark-geometry patches
  const remainingPatches = Math.max(2, totalPatches - 2);

  for (let p = 0; p < remainingPatches; p++) {
    for (let attempt = 0; attempt < 35; attempt++) {
      let cx = 4 + rng.int(width - 8);
      let cy = 4 + rng.int(height - 8);

      // Bias half the patches towards the landmark geometry
      if (p % 2 === 0) {
        if (landmark.kind === "spireRidge" || landmark.kind === "canyon" || landmark.kind === "crevasse") {
          // Place along a fault line offset
          const offset = (p - remainingPatches / 2) * 6;
          cx = Math.round(landmark.center.x + landmark.axis.x * offset + (rng.next() * 6 - 3));
          cy = Math.round(landmark.center.y + landmark.axis.y * offset + (rng.next() * 6 - 3));
        } else if (landmark.kind === "crater" || landmark.kind === "caldera" || landmark.kind === "basaltShelf") {
          // Place along the landmark's perimeter or basin
          const angle = (p / remainingPatches) * Math.PI * 2 + rng.next() * 0.5;
          const r = landmark.radius * 0.7;
          cx = Math.round(landmark.center.x + Math.cos(angle) * r);
          cy = Math.round(landmark.center.y + Math.sin(angle) * r);
        }
      }

      if (!inBounds(cx, cy, width, height)) continue;
      if (isTooCloseToBase(cx, cy)) continue;
      const i = idx(cx, cy, width);
      if (tiles[i] !== TILE_CLEAR || surfaces[i] === SURFACE_CONCRETE || heights[i] >= 3 || distances[i]! < 0) continue;

      if (landmark.kind === "spireRidge" || landmark.kind === "canyon") {
        stampLinearResourceVein(tiles, heights, resourceAmount, surfaces, width, height, { x: cx, y: cy }, landmark.axis, rng);
      } else {
        stampResourceCluster(tiles, heights, resourceAmount, surfaces, width, height, { x: cx, y: cy }, 2 + rng.int(2), rng);
      }
      break;
    }
  }
}

function starterCenter(
  tiles: number[],
  surfaces: SurfaceKind[],
  heights: number[],
  distances: Int32Array,
  width: number,
  height: number,
  origin: Vec2,
  preferred: Vec2,
): Vec2 {
  const starter = resourceCenterNear(tiles, surfaces, distances, width, height, origin, preferred);
  if (clusterCanStamp(tiles, surfaces, heights, width, height, starter, 3)) return starter;
  // A cliff-side preferred cell is clear on the tile grid and still rejects
  // every stamp. Fall back to open ground inside the funded ring.
  return resourceCenterOnOpenGround(tiles, surfaces, heights, distances, width, height, origin, preferred) ?? starter;
}

function clusterCanStamp(
  tiles: number[],
  surfaces: SurfaceKind[],
  heights: number[],
  width: number,
  height: number,
  center: Vec2,
  radius: number,
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.hypot(dx, dy) > radius + 0.3) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (!inBounds(x, y, width, height)) continue;
      const i = idx(x, y, width);
      if (tiles[i] !== TILE_CLEAR || surfaces[i] === SURFACE_CONCRETE || (heights[i] ?? 0) >= 3) continue;
      return true;
    }
  }
  return false;
}

function stampResourceCluster(
  tiles: number[],
  heights: number[],
  resourceAmount: number[],
  surfaces: SurfaceKind[],
  w: number,
  h: number,
  center: Vec2,
  radius: number,
  rng: Rng,
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (Math.hypot(dx, dy) > radius + 0.3) continue;
      const x = center.x + dx;
      const y = center.y + dy;
      if (!inBounds(x, y, w, h)) continue;
      const i = idx(x, y, w);
      if (tiles[i] !== TILE_CLEAR || surfaces[i] === SURFACE_CONCRETE || heights[i] >= 3) continue;
      tiles[i] = TILE_RESOURCE;
      surfaces[i] = SURFACE_NONE;
      const amt = 480 + rng.int(421);
      resourceAmount[i] = Math.max(resourceAmount[i] ?? 0, amt);
    }
  }
}

function stampLinearResourceVein(
  tiles: number[],
  heights: number[],
  resourceAmount: number[],
  surfaces: SurfaceKind[],
  w: number,
  h: number,
  origin: Vec2,
  direction: Vec2,
  rng: Rng,
): void {
  const length = 4 + rng.int(3);
  for (let s = -Math.floor(length / 2); s <= Math.floor(length / 2); s++) {
    const x = Math.round(origin.x + direction.x * s);
    const y = Math.round(origin.y + direction.y * s);
    for (let wOff = -1; wOff <= 1; wOff++) {
      const vx = x + Math.round(-direction.y * wOff);
      const vy = y + Math.round(direction.x * wOff);
      if (!inBounds(vx, vy, w, h)) continue;
      const i = idx(vx, vy, w);
      if (tiles[i] !== TILE_CLEAR || surfaces[i] === SURFACE_CONCRETE || heights[i] >= 3) continue;
      tiles[i] = TILE_RESOURCE;
      surfaces[i] = SURFACE_NONE;
      resourceAmount[i] = Math.max(resourceAmount[i] ?? 0, 480 + rng.int(421));
    }
  }
}
