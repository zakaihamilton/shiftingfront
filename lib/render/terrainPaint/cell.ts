import { cliffFaces } from "../../gen/assets";
import { isMountainScenery, outsideDist, skirtAlpha } from "../../gen/map";
import { generateCampaignVisualProfile } from "../../gen/visualProfile";
import {
  type Camera,
  expandIsoDiamond,
  HEIGHT_STEP,
  TILE_H,
  TILE_W,
  tileToScreen,
} from "../../iso";
import { fogAt } from "../../sim/fog";
import type { SimState } from "../../types";
import { SURFACE_CONCRETE, TILE_BLOCKED, TILE_RESOURCE, TILE_WATER } from "../../types";
import {
  type IsoDiamondCornerRadii,
  isoDiamondPath,
  isoDiamondVertices,
  roundedIsoDiamondPath,
} from "../isoDiamond";
import { type AtlasWorld, biomeMaterials, type TerrainAtlas, tileVariant } from "../terrainAtlas";
import { terrainLightRigForBiome } from "../terrainLighting";
import { artSalt, hash2, terrainVisualTuningFor } from "../terrainMaterials";
import { drawConcreteSlab } from "../terrainPlates";
import {
  drawElevationFaces,
  fillElevationPoly,
  fillElevationRamp,
  softElevationRampStops,
} from "./cliffs";
import { TERRAIN_COVER } from "./constants";
import { memoScenery } from "./culling";
import { drawBlockerProp, drawOreCrystals, smoothFogGain } from "./details";
import { drawTerrainScatter } from "./scatter";
import { drawShorelineFoam, shorelineEdgePoints } from "./shoreline";
import { drawAtlasDiamond } from "./tile";

const SKIRT_COVER = 1.14;
const SKIRT_CORNER_RADIUS_MIN = 0.08;
const SKIRT_CORNER_RADIUS_RANGE = 0.08;
const SKIRT_CORNER_SALT = 0x4b1d;

// Water must stay within its own diamond. Unlike land, it should not expand
// across shared cell edges where the neighboring tile may be dry ground.
export const WATER_COVER = 1;

function skirtCornerRadii(
  state: AtlasWorld,
  x: number,
  y: number,
  tw: number,
  th: number,
): IsoDiamondCornerRadii {
  const scale = Math.min(tw, th);
  const radiusAt = (cornerX: number, cornerY: number): number =>
    scale *
    (SKIRT_CORNER_RADIUS_MIN +
      hash2(cornerX, cornerY, state.seed + SKIRT_CORNER_SALT) * SKIRT_CORNER_RADIUS_RANGE);
  return [radiusAt(x, y), radiusAt(x + 1, y), radiusAt(x + 1, y + 1), radiusAt(x, y + 1)];
}

function wetBankColors(
  base: ReturnType<typeof cliffFaces>,
  mats: ReturnType<typeof biomeMaterials>,
  waterE: boolean,
  waterS: boolean,
): ReturnType<typeof cliffFaces> {
  const wet = `rgb(${Math.max(0, mats.waterDeep.r - 6)},${Math.max(0, mats.waterDeep.g - 4)},${Math.min(255, mats.waterDeep.b + 4)})`;
  return {
    south: waterS ? wet : base.south,
    east: waterE ? wet : base.east,
    southInk: base.southInk,
    eastInk: base.eastInk,
  };
}

function paintElevationGapBridges(
  ctx: CanvasRenderingContext2D,
  s: { x: number; y: number },
  eastS: { x: number; y: number },
  southS: { x: number; y: number },
  tw: number,
  th: number,
  dropE: number,
  dropS: number,
  colors: ReturnType<typeof cliffFaces>,
): void {
  // Atlas cells meet at their top elevation. When the neighbor is lower,
  // that neighbor's diamond is translated down by the height step, leaving
  // a thin uncovered parallelogram beside the inset cliff face. Paint only
  // that gap; the face and the atlas remain responsible for the visible art.
  if (dropE > 0) {
    const points = [
      s.x + tw / 2,
      s.y + th / 2,
      s.x,
      s.y + th,
      eastS.x - tw / 2,
      eastS.y + th / 2,
      eastS.x,
      eastS.y,
    ];
    if (dropE === 1) {
      const [fromColor, toColor] = softElevationRampStops(colors.east);
      fillElevationRamp(ctx, points, s, eastS, fromColor, toColor);
    } else {
      fillElevationPoly(ctx, 0, 0, points, colors.east);
    }
  }
  if (dropS > 0) {
    const points = [
      s.x - tw / 2,
      s.y + th / 2,
      s.x,
      s.y + th,
      southS.x + tw / 2,
      southS.y + th / 2,
      southS.x,
      southS.y,
    ];
    if (dropS === 1) {
      const [fromColor, toColor] = softElevationRampStops(colors.south);
      fillElevationRamp(ctx, points, s, southS, fromColor, toColor);
    } else {
      fillElevationPoly(ctx, 0, 0, points, colors.south);
    }
  }
}

export function paintCell(
  ctx: CanvasRenderingContext2D,
  state: AtlasWorld,
  cam: Camera,
  atlas: TerrainAtlas,
  x: number,
  y: number,
  waterPass: boolean,
  gainAt?: (x: number, y: number) => number,
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
  const neighbors = [northSc, eastSc, southSc, westSc];
  const coastEdges = neighbors.map((neighbor) => water !== (neighbor.kind === TILE_WATER));
  const shorelineEnabled = !skirt || outsideDist(x, y, state.width, state.height) <= 8;
  const coastalCell = shorelineEnabled && coastEdges.some(Boolean);
  const cover = expandIsoDiamond(
    s.x,
    s.y,
    tw,
    th,
    skirt && !coastalCell
      ? SKIRT_COVER
      : concrete
        ? 1
        : water || coastalCell
          ? WATER_COVER
          : TERRAIN_COVER,
  );
  const cornerRadii = skirt && !coastalCell ? skirtCornerRadii(state, x, y, tw, th) : null;
  const vertices = isoDiamondVertices(cover.x, cover.y, cover.w, cover.h);
  const center = { x: cover.x, y: cover.y + cover.h / 2 };
  const mapEdgeEnds = [
    [
      { x: x - 0.5, y: y - 0.5 },
      { x: x + 0.5, y: y - 0.5 },
    ],
    [
      { x: x + 0.5, y: y - 0.5 },
      { x: x + 0.5, y: y + 0.5 },
    ],
    [
      { x: x + 0.5, y: y + 0.5 },
      { x: x - 0.5, y: y + 0.5 },
    ],
    [
      { x: x - 0.5, y: y + 0.5 },
      { x: x - 0.5, y: y - 0.5 },
    ],
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
      artSalt(state),
      water,
    );
  });
  const paintSurfacePath = () => {
    if (cornerRadii) {
      roundedIsoDiamondPath(ctx, cover.x, cover.y, cover.w, cover.h, cornerRadii);
    } else {
      if (!shorelineEdges.some(Boolean)) {
        isoDiamondPath(ctx, cover.x, cover.y, cover.w, cover.h);
        return;
      }
      ctx.beginPath();
      ctx.moveTo(
        shorelineEdges[0]?.[0]?.x ?? vertices[0]?.x,
        shorelineEdges[0]?.[0]?.y ?? vertices[0]?.y,
      );
      for (let edge = 0; edge < vertices.length; edge++) {
        const points = shorelineEdges[edge] ?? [
          vertices[edge]!,
          vertices[(edge + 1) % vertices.length]!,
        ];
        for (let point = 1; point < points.length; point++) {
          ctx.lineTo(points[point]!.x, points[point]!.y);
        }
      }
      ctx.closePath();
    }
  };
  const eastS = tileToScreen(x + 1, y, cam, eastSc.elev);
  const southS = tileToScreen(x, y + 1, cam, southSc.elev);
  const dropE = water ? 0 : Math.max(0, elev - eastSc.elev);
  const dropS = water ? 0 : Math.max(0, elev - southSc.elev);
  const gain = gainAt?.(x, y) ?? 1;
  const faceColors = wetBankColors(
    cliffFaces(state.biome, elev, generateCampaignVisualProfile(state.seed)),
    biomeMaterials(state.biome),
    eastSc.kind === TILE_WATER,
    southSc.kind === TILE_WATER,
  );
  const tuning = terrainVisualTuningFor(state.biome);

  if (!water && (elev >= 2 || dropE > 0 || dropS > 0)) {
    ctx.save();
    ctx.globalAlpha =
      Math.min(0.25, 0.05 + tuning.shadowDepth * 0.32 + elev * 0.025 + (dropE + dropS) * 0.03) *
      gain;
    ctx.fillStyle = "#071014";
    ctx.beginPath();
    ctx.ellipse(
      s.x,
      s.y + th * 0.58 + HEIGHT_STEP * z * 0.1,
      tw * 0.44,
      th * 0.16,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
  if (dropE > 0 || dropS > 0) {
    ctx.save();
    paintElevationGapBridges(ctx, s, eastS, southS, tw, th, dropE, dropS, faceColors);
    drawElevationFaces(
      ctx,
      s.x,
      s.y,
      tw,
      th,
      HEIGHT_STEP * z,
      dropE,
      dropS,
      tileVariant(state.seed, x, y),
      faceColors,
      x,
      y,
      terrainLightRigForBiome(state.seed, state.biome),
    );
    ctx.restore();
  }

  ctx.save();
  paintSurfacePath();
  ctx.clip();
  const mats = biomeMaterials(state.biome);
  const base = water ? mats.waterMid : concrete ? mats.concrete : mats.mid;
  ctx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
  paintSurfacePath();
  ctx.fill();
  if (atlas.canvas) {
    drawAtlasDiamond(
      ctx,
      atlas,
      x,
      y,
      skirt ? cover.x : s.x,
      skirt ? cover.y : s.y,
      skirt ? cover.w : tw,
      skirt ? cover.h : th,
    );
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

export function paintCellScatter(
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

export function paintCellProps(
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
