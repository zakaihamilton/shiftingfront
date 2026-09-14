import {
  SURFACE_CONCRETE,
  SURFACE_NONE,
  SURFACE_ROAD,
  TILE_BLOCKED,
  TILE_CLEAR,
  TILE_WATER,
  type SurfaceKind,
  type Vec2,
} from "../../types";
import { valueNoise } from "./noise";

export function idx(x: number, y: number, w: number): number {
  return y * w + x;
}

export function inBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export function neighbors8(x: number, y: number): Vec2[] {
  const out: Vec2[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      out.push({ x: x + dx, y: y + dy });
    }
  }
  return out;
}

export function meanderingRoute(a: Vec2, b: Vec2, width: number, height: number, salt: number): Vec2[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length;
  const py = dx / length;
  const bend = Math.min(width, height) * 0.12;
  const points: Vec2[] = [a];
  for (const t of [0.25, 0.5, 0.75]) {
    const wave = (valueNoise(t * 9, salt * 0.001, salt + Math.round(t * 100)) * 2 - 1) * bend;
    points.push({
      x: Math.max(2, Math.min(width - 3, Math.round(a.x + dx * t + px * wave))),
      y: Math.max(2, Math.min(height - 3, Math.round(a.y + dy * t + py * wave))),
    });
  }
  points.push(b);
  return points;
}

export function carveRoute(
  tiles: number[],
  heights: number[],
  surfaces: SurfaceKind[],
  w: number,
  h: number,
  points: Vec2[],
  radius = 1,
  noiseSalt = 1,
  meander = true,
): void {
  for (let p = 0; p < points.length - 1; p++) {
    const a = points[p]!;
    const b = points[p + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      const envelope = Math.sin(t * Math.PI);
      const wander = meander
        ? (valueNoise(a.x + dx * t, a.y + dy * t, noiseSalt + 77) * 2 - 1) * 3.6 * envelope
        : 0;
      const cx = Math.round(a.x + dx * t + px * wander);
      const cy = Math.round(a.y + dy * t + py * wander);
      const localRadius = radius + (valueNoise(cx * 0.35, cy * 0.35, noiseSalt + 91) > 0.62 ? 1 : 0);
      for (let oy = -localRadius; oy <= localRadius; oy++) {
        for (let ox = -localRadius; ox <= localRadius; ox++) {
          if (Math.abs(ox) + Math.abs(oy) > localRadius + 1) continue;
          const x = cx + ox;
          const y = cy + oy;
          if (!inBounds(x, y, w, h)) continue;
          const i = idx(x, y, w);
          tiles[i] = TILE_CLEAR;
          heights[i] = 1;
          if (surfaces[i] !== SURFACE_CONCRETE) surfaces[i] = SURFACE_ROAD;
        }
      }
    }
  }
}

export function flattenArea(
  tiles: number[],
  heights: number[],
  w: number,
  h: number,
  cx: number,
  cy: number,
  r: number,
  level: number,
): void {
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!inBounds(x, y, w, h)) continue;
      if (Math.hypot(x - cx, y - cy) > r) continue;
      const i = idx(x, y, w);
      if (tiles[i] === TILE_WATER) {
        tiles[i] = TILE_CLEAR;
      }
      heights[i] = level;
    }
  }
}

export function paintBase(
  tiles: number[],
  heights: number[],
  surfaces: SurfaceKind[],
  w: number,
  h: number,
  center: Vec2,
  radius: number,
): void {
  flattenArea(tiles, heights, w, h, center.x, center.y, radius, 1);
  for (let y = center.y - radius; y <= center.y + radius; y++) {
    for (let x = center.x - radius; x <= center.x + radius; x++) {
      if (!inBounds(x, y, w, h) || Math.hypot(x - center.x, y - center.y) > radius) continue;
      const i = idx(x, y, w);
      tiles[i] = TILE_CLEAR;
      surfaces[i] = Math.hypot(x - center.x, y - center.y) <= radius - 2
        ? SURFACE_CONCRETE
        : SURFACE_NONE;
    }
  }
}

export function smoothWater(
  tiles: number[],
  w: number,
  h: number,
  protect: (x: number, y: number) => boolean,
): void {
  for (let pass = 0; pass < 2; pass++) {
    const next = tiles.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (protect(x, y)) continue;
        const i = idx(x, y, w);
        const n = countKind(tiles, x, y, w, h, TILE_WATER);
        if (tiles[i] === TILE_WATER) {
          if (n < 3) next[i] = TILE_CLEAR;
        } else if (tiles[i] === TILE_CLEAR && n >= 5) {
          next[i] = TILE_WATER;
        }
      }
    }
    for (let i = 0; i < tiles.length; i++) tiles[i] = next[i]!;
  }
}

export function pruneWaterIslands(tiles: number[], w: number, h: number, heights?: number[]): void {
  const seen = new Uint8Array(tiles.length);
  const components: number[][] = [];
  const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = idx(x, y, w);
      if (seen[start] || tiles[start] !== TILE_WATER) continue;
      const component: number[] = [];
      const queue = [start];
      seen[start] = 1;
      while (queue.length) {
        const current = queue.pop()!;
        component.push(current);
        const cx = current % w;
        const cy = Math.floor(current / w);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!inBounds(nx, ny, w, h)) continue;
          const next = idx(nx, ny, w);
          if (seen[next] || tiles[next] !== TILE_WATER) continue;
          seen[next] = 1;
          queue.push(next);
        }
      }
      components.push(component);
    }
  }

  if (components.length === 0) return;
  let largest = 0;
  for (let i = 1; i < components.length; i++) {
    if (components[i]!.length > components[largest]!.length) largest = i;
  }
  const minimumBlobSize = Math.max(4, Math.round(w * h * 0.0015));
  const keepLargest = components[largest]!.length >= minimumBlobSize;
  for (let i = 0; i < components.length; i++) {
    if ((i === largest && keepLargest) || components[i]!.length >= minimumBlobSize) continue;
    for (const cell of components[i]!) {
      tiles[cell] = TILE_CLEAR;
      if (heights) heights[cell] = 1;
    }
  }
}

export function relaxHeights(heights: number[], tiles: number[], w: number, h: number): void {
  const next = heights.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = idx(x, y, w);
      if (tiles[i] === TILE_WATER) continue;
      const here = heights[i] ?? 1;
      if (here < 2) continue;
      let similar = 0;
      for (const nb of neighbors8(x, y)) {
        if (!inBounds(nb.x, nb.y, w, h)) continue;
        const nh = heights[idx(nb.x, nb.y, w)] ?? 1;
        if (nh >= 2) similar += 1;
      }
      if (similar < 2) next[i] = here >= 3 ? 2 : 1;
    }
  }
  for (let i = 0; i < heights.length; i++) heights[i] = next[i]!;
}

export function reachable(tiles: number[], heights: number[], w: number, h: number, start: Vec2, goal: Vec2): boolean {
  const seen = new Uint8Array(w * h);
  const q: Vec2[] = [start];
  seen[idx(start.x, start.y, w)] = 1;
  while (q.length) {
    const c = q.pop()!;
    if (c.x === goal.x && c.y === goal.y) return true;
    for (const n of neighbors8(c.x, c.y)) {
      if (!inBounds(n.x, n.y, w, h)) continue;
      const i = idx(n.x, n.y, w);
      if (seen[i]) continue;
      if (tiles[i] === TILE_WATER || tiles[i] === TILE_BLOCKED) continue;
      if (Math.abs((heights[i] ?? 1) - (heights[idx(c.x, c.y, w)] ?? 1)) > 1) continue;
      if (n.x !== c.x && n.y !== c.y) {
        const sideA = idx(n.x, c.y, w);
        const sideB = idx(c.x, n.y, w);
        if (tiles[sideA] === TILE_WATER || tiles[sideA] === TILE_BLOCKED || tiles[sideB] === TILE_WATER || tiles[sideB] === TILE_BLOCKED) continue;
      }
      seen[i] = 1;
      q.push(n);
    }
  }
  return false;
}

function countKind(
  tiles: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  kind: number,
): number {
  let n = 0;
  for (const nb of neighbors8(x, y)) {
    if (!inBounds(nb.x, nb.y, w, h)) continue;
    if (tiles[idx(nb.x, nb.y, w)] === kind) n += 1;
  }
  return n;
}
