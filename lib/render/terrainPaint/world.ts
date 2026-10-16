import { MAP_SKIRT, isMountainScenery, outsideDist, skirtAlpha } from "../../gen/map";
import type { SimState } from "../../types";
import { SURFACE_CONCRETE, TILE_BLOCKED, TILE_RESOURCE, TILE_WATER } from "../../types";
import { HEIGHT_STEP, TILE_H, TILE_W, expandIsoDiamond, screenToTile, tileToScreen, type Camera } from "../../iso";
import { fogAt } from "../../sim/fog";
import { biomeMaterials, fogTerrainGain, getTerrainAtlas, tileVariant, type AtlasWorld, type TerrainAtlas } from "../terrainAtlas";
import { SceneryMemo } from "../sceneryMemo";
import { drawConcreteSlab } from "../terrainPlates";
import { isoDiamondPath, isoDiamondVertices, roundedIsoDiamondPath, type IsoDiamondCornerRadii } from "../isoDiamond";
import { paintShroudOverlay, paintShroudMaskTile, drawAtlasDiamond } from "./tile";
import { smoothFogGain, drawBlockerProp, drawOreCrystals } from "./details";
import { drawTerrainScatter } from "./scatter";
import { SHROUD_FILL, SHROUD_RGB, TERRAIN_COVER } from "./constants";
import { artSalt, hash2 } from "../terrainMaterials";
import { shorelineWarp } from "../terrainAtlasSurfaces";

const sceneryMemo = new SceneryMemo();
const SKIRT_COVER = 1.14;
const SKIRT_CORNER_RADIUS_MIN = 0.08;
const SKIRT_CORNER_RADIUS_RANGE = 0.08;
const SKIRT_CORNER_SALT = 0x4b1d;
const SKIRT_BLUR_PX = 5;
const COASTLINE_EDGE_SEGMENTS = 16;

let skirtCanvas: HTMLCanvasElement | null = null;
let surfaceCaches = new WeakMap<HTMLCanvasElement, { key: string; canvas: HTMLCanvasElement }>();

export function clearTerrainPaintCache(): void {
  sceneryMemo.clear();
  skirtCanvas = null;
  surfaceCaches = new WeakMap();
}

function memoScenery(state: AtlasWorld & { tick?: number }, x: number, y: number) {
  return sceneryMemo.sample(state, x, y);
}

function skirtCornerRadii(
  state: AtlasWorld,
  x: number,
  y: number,
  tw: number,
  th: number,
): IsoDiamondCornerRadii {
  const scale = Math.min(tw, th);
  const radiusAt = (cornerX: number, cornerY: number): number => (
    scale * (SKIRT_CORNER_RADIUS_MIN + hash2(cornerX, cornerY, state.seed + SKIRT_CORNER_SALT) * SKIRT_CORNER_RADIUS_RANGE)
  );
  return [
    radiusAt(x, y),
    radiusAt(x + 1, y),
    radiusAt(x + 1, y + 1),
    radiusAt(x, y + 1),
  ];
}

function skirtRenderTarget(ctx: CanvasRenderingContext2D): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined" || !(ctx.canvas instanceof HTMLCanvasElement)) {
    return null;
  }
  if (!skirtCanvas) skirtCanvas = document.createElement("canvas");
  if (skirtCanvas.width !== ctx.canvas.width || skirtCanvas.height !== ctx.canvas.height) {
    skirtCanvas.width = ctx.canvas.width;
    skirtCanvas.height = ctx.canvas.height;
  }
  const target = skirtCanvas.getContext("2d");
  if (!target) return null;
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalAlpha = 1;
  target.filter = "none";
  target.clearRect(0, 0, skirtCanvas.width, skirtCanvas.height);
  return { canvas: skirtCanvas, ctx: target };
}

type ScreenPoint = { x: number; y: number };

function shorelineEdgePoints(
  start: ScreenPoint,
  end: ScreenPoint,
  startMap: ScreenPoint,
  endMap: ScreenPoint,
  center: ScreenPoint,
  zoom: number,
  salt: number,
  waterCell: boolean,
): ScreenPoint[] {
  const points: ScreenPoint[] = [];
  const midX = (start.x + end.x) * 0.5;
  const midY = (start.y + end.y) * 0.5;
  const normalX = center.x - midX;
  const normalY = center.y - midY;
  const normalLength = Math.hypot(normalX, normalY) || 1;
  const inwardX = normalX / normalLength;
  const inwardY = normalY / normalLength;
  const waterSign = waterCell ? -1 : 1;

  for (let step = 0; step <= COASTLINE_EDGE_SEGMENTS; step++) {
    const t = step / COASTLINE_EDGE_SEGMENTS;
    const x = start.x + (end.x - start.x) * t;
    const y = start.y + (end.y - start.y) * t;
    const mapX = startMap.x + (endMap.x - startMap.x) * t;
    const mapY = startMap.y + (endMap.y - startMap.y) * t;
    // Fade the scallop to zero with a flat tangent so the matching edge on
    // the neighboring land or water cell meets at the shared tile corner.
    const edgeFade = Math.sin(Math.PI * t) ** 2;
    const offset = shorelineWarp(mapX, mapY, salt)
      * Math.min(TILE_W, TILE_H) * zoom * edgeFade * waterSign;
    points.push({ x: x + inwardX * offset, y: y + inwardY * offset });
  }
  return points;
}

function drawShorelineFoam(
  ctx: CanvasRenderingContext2D,
  edges: readonly (readonly ScreenPoint[] | null)[],
  mats: ReturnType<typeof biomeMaterials>,
  zoom: number,
): void {
  if (!edges.some(Boolean)) return;
  ctx.save();
  ctx.globalAlpha *= 0.6;
  ctx.strokeStyle = `rgb(${mats.waterHi.r},${mats.waterHi.g},${mats.waterHi.b})`;
  ctx.lineWidth = Math.max(1.25, Math.min(TILE_H * zoom * 0.075, 3 * zoom));
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  for (const edge of edges) {
    if (!edge || edge.length < 2) continue;
    ctx.moveTo(edge[0]!.x, edge[0]!.y);
    for (let i = 1; i < edge.length; i++) ctx.lineTo(edge[i]!.x, edge[i]!.y);
  }
  ctx.stroke();
  ctx.restore();
}

function paintCell(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  atlas: TerrainAtlas,
  x: number,
  y: number,
  waterPass: boolean,
): void {
  const scenery = memoScenery(state, x, y);
  const water = scenery.kind === TILE_WATER;
  if (water !== waterPass) return;
  const elev = scenery.elev;
  const s = tileToScreen(x, y, cam, elev);
  const z = cam.zoom;
  const tw = TILE_W * z;
  const th = TILE_H * z;
  const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
  const skirt = !inMap;
  ctx.save();
  ctx.globalAlpha *= skirtAlpha(x, y, state.width, state.height);
  const concrete = inMap && state.surfaces[y * state.width + x] === SURFACE_CONCRETE;
  const northSc = memoScenery(state, x, y - 1);
  const eastSc = memoScenery(state, x + 1, y);
  const southSc = memoScenery(state, x, y + 1);
  const westSc = memoScenery(state, x - 1, y);
  const shorelineSalt = artSalt(state);
  const neighbors = [northSc, eastSc, southSc, westSc];
  const coastEdges = neighbors.map((neighbor) => water !== (neighbor.kind === TILE_WATER));
  const shorelineEnabled = !skirt || outsideDist(x, y, state.width, state.height) <= 8;
  const coastalCell = shorelineEnabled && coastEdges.some(Boolean);
  const cover = expandIsoDiamond(
    s.x,
    s.y,
    tw,
    th,
    skirt && !coastalCell ? SKIRT_COVER : concrete ? 1 : water || coastalCell ? WATER_COVER : TERRAIN_COVER,
  );
  const cornerRadii = skirt && !coastalCell ? skirtCornerRadii(state, x, y, tw, th) : null;
  const vertices = isoDiamondVertices(cover.x, cover.y, cover.w, cover.h);
  const center = { x: cover.x, y: cover.y + cover.h / 2 };
  const mapEdgeEnds = [
    [{ x: x - 0.5, y: y - 0.5 }, { x: x + 0.5, y: y - 0.5 }],
    [{ x: x + 0.5, y: y - 0.5 }, { x: x + 0.5, y: y + 0.5 }],
    [{ x: x + 0.5, y: y + 0.5 }, { x: x - 0.5, y: y + 0.5 }],
    [{ x: x - 0.5, y: y + 0.5 }, { x: x - 0.5, y: y - 0.5 }],
  ] as const;
  const shorelineEdges = coastEdges.map((isCoast, edge) => {
    if (!isCoast || !shorelineEnabled) return null;
    const [startMap, endMap] = mapEdgeEnds[edge]!;
    return shorelineEdgePoints(
      vertices[edge]!,
      vertices[(edge + 1) % vertices.length]!,
      startMap,
      endMap,
      center,
      z,
      shorelineSalt,
      water,
    );
  });
  const paintSurfacePath = () => {
    if (cornerRadii) {
      roundedIsoDiamondPath(ctx, cover.x, cover.y, cover.w, cover.h, cornerRadii);
      return;
    }
    if (!shorelineEdges.some(Boolean)) {
      isoDiamondPath(ctx, cover.x, cover.y, cover.w, cover.h);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(shorelineEdges[0]?.[0]?.x ?? vertices[0]!.x, shorelineEdges[0]?.[0]?.y ?? vertices[0]!.y);
    for (let edge = 0; edge < vertices.length; edge++) {
      const points = shorelineEdges[edge]
        ?? [vertices[edge]!, vertices[(edge + 1) % vertices.length]!];
      for (let point = 1; point < points.length; point++) {
        ctx.lineTo(points[point]!.x, points[point]!.y);
      }
    }
    ctx.closePath();
  };
  ctx.save();
  paintSurfacePath();
  ctx.clip();
  const mats = biomeMaterials(state.biome);
  const base = water ? mats.waterMid : concrete ? mats.concrete : mats.mid;
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  paintSurfacePath();
  ctx.fill();
  if (atlas.canvas) {
    drawAtlasDiamond(ctx, atlas, x, y, skirt ? cover.x : s.x, skirt ? cover.y : s.y, skirt ? cover.w : tw, skirt ? cover.h : th);
  } else if (concrete) {
    // Keep the specialized slab as a no-atlas fallback; the normal browser
    // path uses the atlas so concrete participates in organic land edges.
    drawConcreteSlab(ctx, s.x, s.y, tw, th, z, tileVariant(state.seed, x, y), 1);
  } else {
    ctx.fillStyle = `rgb(${mats.mid.r},${mats.mid.g},${mats.mid.b})`;
    paintSurfacePath();
    ctx.fill();
  }
  ctx.restore();
  if (!water && coastalCell) drawShorelineFoam(ctx, shorelineEdges, biomeMaterials(state.biome), z);
  ctx.restore();
}

function paintCellScatter(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  x: number,
  y: number,
): void {
  const scenery = memoScenery(state, x, y);
  if (scenery.kind === TILE_WATER) return;
  const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
  const surface = inMap ? state.surfaces[y * state.width + x] : 0;
  const s = tileToScreen(x, y, cam, scenery.elev);
  ctx.save();
  ctx.globalAlpha *= skirtAlpha(x, y, state.width, state.height);
  drawTerrainScatter(ctx, state, x, y, s.x, s.y, cam.zoom, scenery.kind, surface);
  ctx.restore();
}

function paintCellProps(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
  x: number,
  y: number,
): void {
  if (fogAt(state, x, y) === 0) return;
  const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
  const scenery = memoScenery(state, x, y);
  const elev = scenery.elev;
  const s = tileToScreen(x, y, cam, elev);
  const z = cam.zoom;
  const gain = smoothFogGain(state, x, y);
  ctx.save();
  ctx.globalAlpha = gain;
  if (scenery.kind === TILE_BLOCKED && !isMountainScenery(scenery)) {
    drawBlockerProp(ctx, state, x, y, s.x, s.y, z);
  }
  if (inMap && state.tiles[y * state.width + x] === TILE_RESOURCE) {
    drawOreCrystals(ctx, state, cam, x, y, elev, z);
  }
  ctx.restore();
}

export function visibleTileRange(
  cam: Camera,
  screenW: number,
  screenH: number,
  mapWidth: number,
  mapHeight: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const marginX = TILE_W * cam.zoom * 2;
  const marginY = TILE_H * cam.zoom * 2;
  const samples = [
    screenToTile(-marginX, -marginY, cam),
    screenToTile(screenW + marginX, -marginY, cam),
    screenToTile(screenW + marginX, screenH + marginY, cam),
    screenToTile(-marginX, screenH + marginY, cam),
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of samples) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const pad = 6;
  const x0 = Math.max(-MAP_SKIRT, Math.floor(minX) - pad);
  const y0 = Math.max(-MAP_SKIRT, Math.floor(minY) - pad);
  const x1 = Math.min(mapWidth + MAP_SKIRT, Math.ceil(maxX) + pad + 1);
  const y1 = Math.min(mapHeight + MAP_SKIRT, Math.ceil(maxY) + pad + 1);
  return { x0, y0, x1, y1 };
}

function visitVisibleTiles(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  visit: (x: number, y: number) => void,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const margin = TILE_W * cam.zoom * 2;
  const range = visibleTileRange(cam, w, h, state.width, state.height);
  const x0 = range.x0;
  const y0 = range.y0;
  const x1 = range.x1;
  const y1 = range.y1;
  if (x0 >= x1 || y0 >= y1) return;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const elev = memoScenery(state, x, y).elev;
      const s = tileToScreen(x, y, cam, elev);
      if (s.x < -margin || s.y < -margin || s.x > w + margin || s.y > h + margin) continue;
      visit(x, y);
    }
  }
}

let shroudMask: HTMLCanvasElement | null = null;

function paintShroudLayer(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const z = cam.zoom;
  const tw = TILE_W * z;
  const th = TILE_H * z;
  const step = HEIGHT_STEP * z;
  const paintVisibleShroud = (
    target: CanvasRenderingContext2D,
    painter: typeof paintShroudOverlay,
  ) => visitVisibleTiles(ctx, state, cam, (x, y) => {
    const scenery = memoScenery(state, x, y);
    const s = tileToScreen(x, y, cam, scenery.elev);
    const dropE = Math.max(0, scenery.elev - memoScenery(state, x + 1, y).elev);
    const dropS = Math.max(0, scenery.elev - memoScenery(state, x, y + 1).elev);
    painter(target, s.x, s.y, tw, th, dropE, dropS, step, smoothFogGain(state, x, y), z, x, y, tileVariant(state.seed, x, y), state);
  });
  if (typeof document === "undefined") {
    paintVisibleShroud(ctx, paintShroudOverlay);
    return;
  }
  if (!shroudMask) shroudMask = document.createElement("canvas");
  if (shroudMask.width !== w || shroudMask.height !== h) {
    shroudMask.width = w;
    shroudMask.height = h;
  }
  const fog = shroudMask.getContext("2d");
  if (!fog) {
    paintVisibleShroud(ctx, paintShroudOverlay);
    return;
  }
  fog.setTransform(1, 0, 0, 1, 0, 0);
  fog.globalCompositeOperation = "source-over";
  fog.globalAlpha = 1;
  fog.clearRect(0, 0, w, h);
  const overlay = 1 - fogTerrainGain(0);
  fog.fillStyle = `rgba(${SHROUD_RGB.r}, ${SHROUD_RGB.g}, ${SHROUD_RGB.b}, ${overlay})`;
  fog.fillRect(0, 0, w, h);
  fog.globalCompositeOperation = "destination-out";
  paintVisibleShroud(fog, paintShroudMaskTile);
  fog.globalCompositeOperation = "source-over";
  fog.globalAlpha = 1;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.drawImage(shroudMask, 0, 0);
  ctx.restore();
}

// Water stays within its square cell. Unlike land, it does not expand across
// shared cell edges where the neighboring tile may be dry ground.
export const WATER_COVER = 1;

export function paintTerrainSurface(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
): void {
  const atlas = getTerrainAtlas(state);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const skirtTarget = skirtRenderTarget(ctx);
  const paintSkirt = (target: CanvasRenderingContext2D) => {
    // The decorative skirt sits behind the playable map. In particular,
    // low-elevation skirt water must not paint over the lower edge of
    // a higher playable tile just because water is rendered in its own pass.
    visitVisibleTiles(target, state, cam, (x, y) => {
      const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
      if (inMap || memoScenery(state, x, y).kind !== TILE_WATER) return;
      paintCell(target, state, cam, atlas, x, y, true);
    });
    visitVisibleTiles(target, state, cam, (x, y) => {
      const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
      if (inMap) return;
      paintCell(target, state, cam, atlas, x, y, false);
    });
  };

  if (skirtTarget) {
    paintSkirt(skirtTarget.ctx);
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.filter = `blur(${SKIRT_BLUR_PX}px)`;
    ctx.drawImage(skirtTarget.canvas, 0, 0);
    ctx.restore();
  } else {
    paintSkirt(ctx);
  }

  // Paint water before land so shoreline land coverage consistently sits over
  // the water edge, independent of the tile's elevation.
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
    if (!inMap) return;
    paintCell(ctx, state, cam, atlas, x, y, true);
  });
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    const inMap = x >= 0 && y >= 0 && x < state.width && y < state.height;
    if (!inMap) return;
    paintCell(ctx, state, cam, atlas, x, y, false);
  });
  // Low scatter sits with the atlas so the shroud darkens unexplored clutter.
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    paintCellScatter(ctx, state, cam, x, y);
  });
}

export function paintTerrainBlockers(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  gainAt?: (x: number, y: number) => number,
): void {
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    const scenery = memoScenery(state, x, y);
    if (scenery.kind !== TILE_BLOCKED || isMountainScenery(scenery)) return;
    const s = tileToScreen(x, y, cam, scenery.elev);
    const gain = gainAt?.(x, y) ?? 1;
    ctx.save();
    ctx.globalAlpha = gain;
    drawBlockerProp(ctx, state, x, y, s.x, s.y, cam.zoom);
    ctx.restore();
  });
}

export function paintTerrainWorld(
  ctx: CanvasRenderingContext2D,
  state: SimState,
  cam: Camera,
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = SHROUD_FILL;
  ctx.fillRect(0, 0, w, h);

  paintCachedTerrainSurface(ctx, state, cam);
  // Tall blockers and ore stay after the shroud and remain vision-gated.
  paintShroudLayer(ctx, state, cam);
  visitVisibleTiles(ctx, state, cam, (x, y) => {
    paintCellProps(ctx, state, cam, x, y);
  });
}

function paintCachedTerrainSurface(ctx: CanvasRenderingContext2D, state: SimState, cam: Camera): void {
  if (typeof document === "undefined") {
    paintTerrainSurface(ctx, state, cam);
    return;
  }
  const atlas = getTerrainAtlas(state);
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const key = `${atlas.key}:${atlas.canvas ? "ready" : "pending"}:${cam.x}:${cam.y}:${cam.zoom}:${w}x${h}`;
  let cached = surfaceCaches.get(ctx.canvas);
  if (!cached || cached.key !== key) {
    const canvas = cached?.canvas ?? document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const surface = canvas.getContext("2d");
    if (!surface) {
      paintTerrainSurface(ctx, state, cam);
      return;
    }
    // The shroud below supplies visibility shading. Geometry, textures, and
    // the blurred skirt can survive fog refreshes without being repainted.
    paintTerrainSurface(surface, state, cam);
    cached = { key, canvas };
    surfaceCaches.set(ctx.canvas, cached);
  }
  ctx.drawImage(cached.canvas, 0, 0);
}
