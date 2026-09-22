import type { BiomeName, LandmarkKind, SurfaceKind, Vec2 } from "../../types";
import {
  SURFACE_CONCRETE,
  SURFACE_NONE,
  TILE_BLOCKED,
  TILE_CLEAR,
  TILE_RESOURCE,
  TILE_WATER,
} from "../../types";
import type { Rng } from "../../seed/rng";
import { idx, inBounds } from "./terrain";
import { resourceCenterNear } from "./generator/resources";
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

  switch (kind) {
    case "crater": {
      // Sunken circular impact depression with a raised rim and breached natural passes.
      const rimRadius = radius;
      const innerRadius = Math.max(3, radius - 3);
      const passAngle1 = Math.atan2(dy, dx);
      const passAngle2 = passAngle1 + Math.PI;
      const passAngle3 = passAngle1 + Math.PI / 2;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isProtectedBase(x, y)) continue;
          const dist = Math.hypot(x - center.x, y - center.y);
          const i = idx(x, y, width);
          if (dist < innerRadius) {
            // Depressed floor
            heights[i] = 1;
            if (tiles[i] === TILE_BLOCKED) tiles[i] = TILE_CLEAR;
          } else if (dist >= innerRadius && dist <= rimRadius + 2) {
            // Raised rim, except where breaches cut through
            const angle = Math.atan2(y - center.y, x - center.x);
            const isBreach =
              Math.abs(Math.atan2(Math.sin(angle - passAngle1), Math.cos(angle - passAngle1))) < 0.28 ||
              Math.abs(Math.atan2(Math.sin(angle - passAngle2), Math.cos(angle - passAngle2))) < 0.28 ||
              Math.abs(Math.atan2(Math.sin(angle - passAngle3), Math.cos(angle - passAngle3))) < 0.24;

            if (isBreach) {
              heights[i] = 1;
              tiles[i] = TILE_CLEAR;
            } else {
              heights[i] = 2;
            }
          }
        }
      }
      break;
    }

    case "spireRidge": {
      // Linear crystal spine perpendicular to the frontline with 2-3 carved ramp passes.
      const spineLength = Math.min(width, height) * 0.45;
      const passOffsets = [-Math.round(spineLength * 0.3), Math.round(spineLength * 0.3)];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isProtectedBase(x, y)) continue;
          const relX = x - center.x;
          const relY = y - center.y;
          const projPerp = relX * perp.x + relY * perp.y;
          const projLine = relX * (dx / len) + relY * (dy / len);

          if (Math.abs(projPerp) < spineLength && Math.abs(projLine) < 3.2) {
            const isPass = passOffsets.some((po) => Math.abs(projPerp - po) < 2.5);
            const i = idx(x, y, width);
            if (isPass) {
              heights[i] = 1;
              tiles[i] = TILE_CLEAR;
            } else {
              heights[i] = 2;
              if (Math.abs(projLine) < 1.4 && rng.chance(0.35)) {
                tiles[i] = TILE_BLOCKED;
              }
            }
          }
        }
      }
      break;
    }

    case "canyon": {
      // Sinuous grand gorge cutting perpendicular to base line, with natural fords.
      const gorgeLength = Math.min(width, height) * 0.45;
      const fordOffsets = [-Math.round(gorgeLength * 0.25), Math.round(gorgeLength * 0.25)];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isProtectedBase(x, y)) continue;
          const relX = x - center.x;
          const relY = y - center.y;
          const projPerp = relX * perp.x + relY * perp.y;
          const projLine = relX * (dx / len) + relY * (dy / len);

          if (Math.abs(projPerp) < gorgeLength && Math.abs(projLine) < 4) {
            const isFord = fordOffsets.some((fo) => Math.abs(projPerp - fo) < 2.5);
            const i = idx(x, y, width);
            if (isFord) {
              heights[i] = 1;
              tiles[i] = TILE_CLEAR;
            } else {
              // Deep gorge channel
              heights[i] = 0;
              tiles[i] = TILE_WATER;
            }
          }
        }
      }
      break;
    }

    case "delta": {
      // Shallow lagoon expanses crossed by dry-ground causeways.
      const deltaRadius = radius + 2;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isProtectedBase(x, y)) continue;
          const dist = Math.hypot(x - center.x, y - center.y);
          if (dist < deltaRadius) {
            const i = idx(x, y, width);
            // Crossing causeways
            const relX = x - center.x;
            const relY = y - center.y;
            const projLine = Math.abs(relX * (dx / len) + relY * (dy / len));
            const projPerp = Math.abs(relX * perp.x + relY * perp.y);
            const isCauseway = projLine < 2.2 || projPerp < 2.2;
            if (isCauseway) {
              tiles[i] = TILE_CLEAR;
              heights[i] = 1;
            } else if (dist < deltaRadius - 1.5 && (x + y) % 3 !== 0) {
              tiles[i] = TILE_WATER;
              heights[i] = 0;
            }
          }
        }
      }
      break;
    }

    case "caldera": {
      // Vitrified caldera with smooth glass interior and crystal blockers ring.
      const caldRadius = radius;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isProtectedBase(x, y)) continue;
          const dist = Math.hypot(x - center.x, y - center.y);
          const i = idx(x, y, width);
          if (dist < caldRadius - 2) {
            heights[i] = 1;
            tiles[i] = TILE_CLEAR;
          } else if (dist >= caldRadius - 2 && dist <= caldRadius + 1) {
            // Ring with access openings
            const angle = Math.atan2(y - center.y, x - center.x);
            const open = Math.abs(Math.sin(angle * 2)) < 0.35;
            if (!open) {
              tiles[i] = TILE_BLOCKED;
              heights[i] = 1;
            } else {
              tiles[i] = TILE_CLEAR;
              heights[i] = 1;
            }
          }
        }
      }
      break;
    }

    case "crevasse": {
      // Jagged ice crevasse with solid ice-bridge crossings.
      const crevasseLength = Math.min(width, height) * 0.42;
      const bridgeOffsets = [-Math.round(crevasseLength * 0.3), Math.round(crevasseLength * 0.3)];

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isProtectedBase(x, y)) continue;
          const relX = x - center.x;
          const relY = y - center.y;
          const projPerp = relX * perp.x + relY * perp.y;
          const projLine = relX * (dx / len) + relY * (dy / len);

          if (Math.abs(projPerp) < crevasseLength && Math.abs(projLine) < 3.2) {
            const isBridge = bridgeOffsets.some((bo) => Math.abs(projPerp - bo) < 2.5);
            const i = idx(x, y, width);
            if (isBridge) {
              tiles[i] = TILE_CLEAR;
              heights[i] = 1;
            } else {
              tiles[i] = TILE_BLOCKED;
              heights[i] = 0;
            }
          }
        }
      }
      break;
    }

    case "ruinClearing": {
      // Overgrown canopy arena with ruins and tactical clearings.
      const arenaRadius = radius;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isProtectedBase(x, y)) continue;
          const dist = Math.hypot(x - center.x, y - center.y);
          const i = idx(x, y, width);
          if (dist < arenaRadius - 3) {
            tiles[i] = TILE_CLEAR;
            heights[i] = 1;
          } else if (dist >= arenaRadius - 3 && dist <= arenaRadius + 2) {
            // Dense canopy perimeter with breaches
            const angle = Math.atan2(y - center.y, x - center.x);
            const isOpening = Math.abs(Math.cos(angle * 2)) > 0.65;
            if (!isOpening) {
              tiles[i] = TILE_BLOCKED;
            } else {
              tiles[i] = TILE_CLEAR;
              heights[i] = 1;
            }
          }
        }
      }
      break;
    }

    case "basaltShelf": {
      // Raised stepped volcanic table plateau (height 2) with ramps.
      const shelfRadius = radius;
      const rampAngle1 = Math.atan2(dy, dx);
      const rampAngle2 = rampAngle1 + Math.PI;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (isProtectedBase(x, y)) continue;
          const dist = Math.hypot(x - center.x, y - center.y);
          const i = idx(x, y, width);
          if (dist < shelfRadius) {
            const angle = Math.atan2(y - center.y, x - center.x);
            const isRamp =
              Math.abs(Math.atan2(Math.sin(angle - rampAngle1), Math.cos(angle - rampAngle1))) < 0.35 ||
              Math.abs(Math.atan2(Math.sin(angle - rampAngle2), Math.cos(angle - rampAngle2))) < 0.35;

            if (isRamp) {
              heights[i] = 1;
              tiles[i] = TILE_CLEAR;
            } else {
              heights[i] = 2;
              tiles[i] = TILE_CLEAR;
            }
          }
        }
      }
      break;
    }
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

  const playerStarter = resourceCenterNear(tiles, surfaces, distances, width, height, playerStart, safeP);
  const enemyDistances = walkDistances(tiles, heights, width, height, enemyStart);
  const enemyStarter = resourceCenterNear(tiles, surfaces, enemyDistances, width, height, enemyStart, safeE);

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
