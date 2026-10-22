import type { Vec2 } from "../../types";
import { TILE_BLOCKED, TILE_CLEAR, TILE_WATER } from "../../types";
import type { Rng } from "../../seed/rng";
import { idx } from "./terrain";

/** Terrain buffers for one landmark stamp. Only the selected stamp runs. */
export type LandmarkField = {
  tiles: number[];
  heights: number[];
  width: number;
  height: number;
  center: Vec2;
  radius: number;
  perp: Vec2;
  dx: number;
  dy: number;
  len: number;
  rng: Rng;
  isProtectedBase: (x: number, y: number) => boolean;
};

export function stampCrater(field: LandmarkField): void {
  const { tiles, heights, width, height, center, radius, dx, dy, isProtectedBase } = field;
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
}

export function stampSpireRidge(field: LandmarkField): void {
  const { tiles, heights, width, height, center, perp, dx, dy, len, rng, isProtectedBase } = field;
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
}

export function stampCanyon(field: LandmarkField): void {
  const { tiles, heights, width, height, center, perp, dx, dy, len, isProtectedBase } = field;
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
}

export function stampDelta(field: LandmarkField): void {
  const { tiles, heights, width, height, center, radius, perp, dx, dy, len, isProtectedBase } = field;
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
}

export function stampCaldera(field: LandmarkField): void {
  const { tiles, heights, width, height, center, radius, isProtectedBase } = field;
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
}

export function stampCrevasse(field: LandmarkField): void {
  const { tiles, heights, width, height, center, perp, dx, dy, len, isProtectedBase } = field;
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
}

export function stampRuinClearing(field: LandmarkField): void {
  const { tiles, heights, width, height, center, radius, isProtectedBase } = field;
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
}

export function stampBasaltShelf(field: LandmarkField): void {
  const { tiles, heights, width, height, center, radius, dx, dy, isProtectedBase } = field;
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
}
