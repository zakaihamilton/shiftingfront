import { MAP_SKIRT } from "../../gen/map";
import {
  bilinearFromNeighborhood,
  clampShore,
  landEdgeDistFromMask,
  readShoreCell,
  tintWater,
  WATER_SHORE_MAX,
} from "../terrainAtlasSurfaces";
import {
  ATLAS_CELL,
  CONCRETE_STEEL_DARK,
  clampByte,
  hash2,
  mixRgb,
  resourceAt,
} from "../terrainMaterials";
import { oreVeinAt } from "../terrainOre";
import { applyBiomeGroundPattern } from "../terrainPatches";
import {
  type AtlasBakeContext,
  CONCRETE_CELL_CLASS,
  GROUND_CELL_CLASS,
  MATERIAL_EDGE_RADIUS_MIN,
  MATERIAL_EDGE_RADIUS_RANGE,
  MATERIAL_EDGE_WARP_RANGE,
  ORE_CELL_CLASS,
  WATER_CELL_CLASS,
} from "./constants";
import {
  isLandMaterialClass,
  organicCornerMask,
  organicEdgeBlendStrength,
  organicEdgeMask,
} from "./organicEdges";

type EdgeSetup = {
  valid: boolean;
  r: number;
  g: number;
  b: number;
  blend: number;
  radius: number;
  warp: number;
  phase: number;
};

type EdgeTuple = [EdgeSetup, EdgeSetup, EdgeSetup, EdgeSetup];

function makeEdgeSetup(): EdgeSetup {
  return { valid: false, r: 0, g: 0, b: 0, blend: 0, radius: 0, warp: 0, phase: 0 };
}

const groundEdges: EdgeTuple = [makeEdgeSetup(), makeEdgeSetup(), makeEdgeSetup(), makeEdgeSetup()];
const materialEdges: EdgeTuple = [
  makeEdgeSetup(),
  makeEdgeSetup(),
  makeEdgeSetup(),
  makeEdgeSetup(),
];
const groundInputRgb = { r: 0, g: 0, b: 0 };
const oreQueryOptions = { salt: 0, amount: 0 };

function fillEdgeSetup(
  out: EdgeSetup,
  valid: boolean,
  colors: AtlasBakeContext["colors"],
  colorIdx: number,
  baseR: number,
  baseG: number,
  baseB: number,
  hx: number,
  hy: number,
  salt: number,
  saltOffset: number,
  radiusMin: number,
  radiusRange: number,
  warpRange: number,
): void {
  out.valid = valid;
  if (!valid) {
    out.r = baseR;
    out.g = baseG;
    out.b = baseB;
    out.blend = 0;
    out.radius = 0;
    out.warp = 0;
    out.phase = 0;
    return;
  }
  const r = colors[colorIdx]!;
  const g = colors[colorIdx + 1]!;
  const b = colors[colorIdx + 2]!;
  out.r = r;
  out.g = g;
  out.b = b;
  out.blend = organicEdgeBlendStrength(baseR, baseG, baseB, r, g, b);
  out.radius = radiusMin + hash2(hx, hy, salt + saltOffset + 1) * radiusRange;
  out.warp = (hash2(hx, hy, salt + saltOffset + 2) - 0.5) * warpRange;
  out.phase = hash2(hx, hy, salt + saltOffset + 3) * Math.PI * 2;
}

function setupCardinalEdges(
  edges: EdgeTuple,
  westValid: boolean,
  eastValid: boolean,
  northValid: boolean,
  southValid: boolean,
  colors: AtlasBakeContext["colors"],
  i: number,
  cols: number,
  baseR: number,
  baseG: number,
  baseB: number,
  gx: number,
  gy: number,
  salt: number,
  horizSaltOffset: number,
  vertSaltOffset: number,
  radiusMin: number,
  radiusRange: number,
  warpRange: number,
): void {
  fillEdgeSetup(
    edges[0],
    westValid,
    colors,
    i - 3,
    baseR,
    baseG,
    baseB,
    gx,
    0,
    salt,
    horizSaltOffset,
    radiusMin,
    radiusRange,
    warpRange,
  );
  fillEdgeSetup(
    edges[1],
    eastValid,
    colors,
    i + 3,
    baseR,
    baseG,
    baseB,
    gx + 1,
    0,
    salt,
    horizSaltOffset,
    radiusMin,
    radiusRange,
    warpRange,
  );
  fillEdgeSetup(
    edges[2],
    northValid,
    colors,
    i - cols * 3,
    baseR,
    baseG,
    baseB,
    0,
    gy,
    salt,
    vertSaltOffset,
    radiusMin,
    radiusRange,
    warpRange,
  );
  fillEdgeSetup(
    edges[3],
    southValid,
    colors,
    i + cols * 3,
    baseR,
    baseG,
    baseB,
    0,
    gy + 1,
    salt,
    vertSaltOffset,
    radiusMin,
    radiusRange,
    warpRange,
  );
}

function writeCellPixel(
  data: Uint8ClampedArray,
  width: number,
  px: number,
  py: number,
  r: number,
  g: number,
  b: number,
  grain: number,
  isWater: boolean,
): void {
  const o = (py * width + px) * 4;
  if (isWater) {
    data[o] = clampByte(r + grain * 0.35);
    data[o + 1] = clampByte(g + grain * 0.7);
    data[o + 2] = clampByte(b + grain);
  } else {
    data[o] = clampByte(r + grain);
    data[o + 1] = clampByte(g + grain * 0.82);
    data[o + 2] = clampByte(b + grain * 0.7);
  }
  data[o + 3] = 255;
}

function bakeWaterCell(
  ctx: AtlasBakeContext,
  row: number,
  col: number,
  gx: number,
  gy: number,
): void {
  const { cols, rows, width, sceneryGrid, shoreDist, salt, mats, pixelFractions, data } = ctx;
  const cellDist = clampShore(shoreDist[row * cols + col] ?? WATER_SHORE_MAX);
  const waterMask = sceneryGrid.waterNeighbors[row * cols + col] ?? 0;
  const n00 = readShoreCell(shoreDist, cols, rows, col - 1, row - 1, cellDist);
  const n10 = readShoreCell(shoreDist, cols, rows, col, row - 1, cellDist);
  const n20 = readShoreCell(shoreDist, cols, rows, col + 1, row - 1, cellDist);
  const n01 = readShoreCell(shoreDist, cols, rows, col - 1, row, cellDist);
  const n21 = readShoreCell(shoreDist, cols, rows, col + 1, row, cellDist);
  const n02 = readShoreCell(shoreDist, cols, rows, col - 1, row + 1, cellDist);
  const n12 = readShoreCell(shoreDist, cols, rows, col, row + 1, cellDist);
  const n22 = readShoreCell(shoreDist, cols, rows, col + 1, row + 1, cellDist);

  for (let ly = 0; ly < ATLAS_CELL; ly++) {
    const pixelFy = pixelFractions[ly]!;
    const mapY = gy + pixelFy;
    const py = row * ATLAS_CELL + ly;
    for (let lx = 0; lx < ATLAS_CELL; lx++) {
      const pixelFx = pixelFractions[lx]!;
      const mapX = gx + pixelFx;
      const wet = tintWater(
        mats,
        Math.min(
          bilinearFromNeighborhood(
            pixelFx,
            pixelFy,
            n00,
            n10,
            n20,
            n01,
            cellDist,
            n21,
            n02,
            n12,
            n22,
          ),
          landEdgeDistFromMask(pixelFx, pixelFy, waterMask),
        ),
        mapX,
        mapY,
        salt,
      );
      const px = col * ATLAS_CELL + lx;
      const grain = (hash2(px, py, salt) - 0.5) * 3;
      writeCellPixel(data, width, px, py, wet.r, wet.g, wet.b, grain, true);
    }
  }
}

function bakeLandCell(
  ctx: AtlasBakeContext,
  row: number,
  col: number,
  gx: number,
  gy: number,
  same: number,
): void {
  const {
    state,
    cols,
    rows,
    width,
    colors,
    classes,
    features,
    salt,
    mats,
    pixelFractions,
    edgeFactors,
    organicCorners,
    data,
  } = ctx;
  const i = (row * cols + col) * 3;
  const baseR = colors[i]!;
  const baseG = colors[i + 1]!;
  const baseB = colors[i + 2]!;
  const cornerNW = row * organicCorners.cols + col;
  const cornerNE = cornerNW + 1;
  const cornerSW = cornerNW + organicCorners.cols;
  const cornerSE = cornerSW + 1;

  const canBlend = same !== CONCRETE_CELL_CLASS;
  const blendE = canBlend && col + 1 < cols && classes[row * cols + col + 1] === same;
  const blendS = canBlend && row + 1 < rows && classes[(row + 1) * cols + col] === same;
  const eastR = blendE ? colors[i + 3]! : baseR;
  const eastG = blendE ? colors[i + 4]! : baseG;
  const eastB = blendE ? colors[i + 5]! : baseB;
  const southI = i + cols * 3;
  const southR = blendS ? colors[southI]! : baseR;
  const southG = blendS ? colors[southI + 1]! : baseG;
  const southB = blendS ? colors[southI + 2]! : baseB;
  const southeastI = southI + 3;
  const blendSE = blendE && blendS && classes[(row + 1) * cols + col + 1] === same;
  const southeastR = blendSE ? colors[southeastI]! : baseR;
  const southeastG = blendSE ? colors[southeastI + 1]! : baseG;
  const southeastB = blendSE ? colors[southeastI + 2]! : baseB;
  const groundBilinear = same === GROUND_CELL_CLASS && blendSE;
  const rEastDelta = eastR - baseR;
  const rSouthDelta = southR - baseR;
  const rCornerDelta = southeastR - southR - eastR + baseR;
  const gEastDelta = eastG - baseG;
  const gSouthDelta = southG - baseG;
  const gCornerDelta = southeastG - southG - eastG + baseG;
  const bEastDelta = eastB - baseB;
  const bSouthDelta = southB - baseB;
  const bCornerDelta = southeastB - southB - eastB + baseB;

  const resourceAmount = same === ORE_CELL_CLASS ? resourceAt(state, gx, gy) : 0;
  oreQueryOptions.salt = salt;
  oreQueryOptions.amount = resourceAmount;

  const westClass = col > 0 ? classes[row * cols + col - 1] : undefined;
  const eastClass = col + 1 < cols ? classes[row * cols + col + 1] : undefined;
  const northClass = row > 0 ? classes[(row - 1) * cols + col] : undefined;
  const southClass = row + 1 < rows ? classes[(row + 1) * cols + col] : undefined;

  setupCardinalEdges(
    groundEdges,
    same === GROUND_CELL_CLASS && westClass === GROUND_CELL_CLASS,
    same === GROUND_CELL_CLASS && eastClass === GROUND_CELL_CLASS,
    same === GROUND_CELL_CLASS && northClass === GROUND_CELL_CLASS,
    same === GROUND_CELL_CLASS && southClass === GROUND_CELL_CLASS,
    colors,
    i,
    cols,
    baseR,
    baseG,
    baseB,
    gx,
    gy,
    salt,
    650,
    700,
    0.24,
    0.16,
    0.34,
  );

  const landClass = isLandMaterialClass(same);
  const westMatValid = landClass && isLandMaterialClass(westClass) && westClass !== same;
  const eastMatValid = landClass && isLandMaterialClass(eastClass) && eastClass !== same;
  const northMatValid = landClass && isLandMaterialClass(northClass) && northClass !== same;
  const southMatValid = landClass && isLandMaterialClass(southClass) && southClass !== same;
  const hasMaterialEdge = westMatValid || eastMatValid || northMatValid || southMatValid;

  setupCardinalEdges(
    materialEdges,
    westMatValid,
    eastMatValid,
    northMatValid,
    southMatValid,
    colors,
    i,
    cols,
    baseR,
    baseG,
    baseB,
    gx,
    gy,
    salt,
    750,
    760,
    MATERIAL_EDGE_RADIUS_MIN,
    MATERIAL_EDGE_RADIUS_RANGE,
    MATERIAL_EDGE_WARP_RANGE,
  );

  const feature = features[row * cols + col];
  const eastFeature = blendE ? features[row * cols + col + 1] : undefined;
  const southFeature = blendS ? features[(row + 1) * cols + col] : undefined;
  const southeastFeature = blendSE ? features[(row + 1) * cols + col + 1] : undefined;
  const featureCanBlend =
    same === GROUND_CELL_CLASS &&
    blendSE &&
    feature !== undefined &&
    eastFeature?.kind === feature.kind &&
    southFeature?.kind === feature.kind &&
    southeastFeature?.kind === feature.kind;
  const featureIntensity = feature?.intensity ?? 0;
  const featureIntensityEastDelta = (eastFeature?.intensity ?? featureIntensity) - featureIntensity;
  const featureIntensitySouthDelta =
    (southFeature?.intensity ?? featureIntensity) - featureIntensity;
  const featureIntensityCornerDelta =
    (southeastFeature?.intensity ?? featureIntensity) -
    (southFeature?.intensity ?? featureIntensity) -
    (eastFeature?.intensity ?? featureIntensity) +
    featureIntensity;
  const featureDetail = feature?.detail ?? 0;
  const featureDetailEastDelta = (eastFeature?.detail ?? featureDetail) - featureDetail;
  const featureDetailSouthDelta = (southFeature?.detail ?? featureDetail) - featureDetail;
  const featureDetailCornerDelta =
    (southeastFeature?.detail ?? featureDetail) -
    (southFeature?.detail ?? featureDetail) -
    (eastFeature?.detail ?? featureDetail) +
    featureDetail;

  const [groundW, groundE, groundN, groundS] = groundEdges;
  const [matW, matE, matN, matS] = materialEdges;
  const grainScale = same === CONCRETE_CELL_CLASS ? 5 : same === GROUND_CELL_CLASS ? 11 : 13;

  for (let ly = 0; ly < ATLAS_CELL; ly++) {
    const fy = ly / ATLAS_CELL;
    const pixelFy = pixelFractions[ly]!;
    const mapY = gy + pixelFy;
    const py = row * ATLAS_CELL + ly;
    const nearNorth = pixelFy < 0.5;
    const horizontalDistance = nearNorth ? pixelFy : 1 - pixelFy;
    const groundHoriz = nearNorth ? groundN : groundS;
    const matHoriz = nearNorth ? matN : matS;

    for (let lx = 0; lx < ATLAS_CELL; lx++) {
      const fx = lx / ATLAS_CELL;
      const pixelFx = pixelFractions[lx]!;
      const mapX = gx + pixelFx;
      let r: number;
      let g: number;
      let b: number;

      if (groundBilinear) {
        r = baseR + rEastDelta * fx + rSouthDelta * fy + rCornerDelta * fx * fy;
        g = baseG + gEastDelta * fx + gSouthDelta * fy + gCornerDelta * fx * fy;
        b = baseB + bEastDelta * fx + bSouthDelta * fy + bCornerDelta * fx * fy;
      } else {
        r = baseR + (eastR - baseR) * fx * 0.28 + (southR - baseR) * fy * 0.28;
        g = baseG + (eastG - baseG) * fx * 0.28 + (southG - baseG) * fy * 0.28;
        b = baseB + (eastB - baseB) * fx * 0.28 + (southB - baseB) * fy * 0.28;
      }

      let materialEdgeStrength = 0;
      let materialEdgeR = baseR;
      let materialEdgeG = baseG;
      let materialEdgeB = baseB;

      // Same-material feathering is only meaningful for ground cells.
      // Other land materials only need the more expensive organic branch
      // when they touch a different land material.
      if (same === GROUND_CELL_CLASS || hasMaterialEdge) {
        const nearWest = pixelFx < 0.5;
        const verticalDistance = nearWest ? pixelFx : 1 - pixelFx;

        if (same === GROUND_CELL_CLASS) {
          const groundVert = nearWest ? groundW : groundE;
          const verticalSameStrength = groundVert.valid
            ? organicEdgeMask(
                verticalDistance,
                mapY,
                groundVert.radius,
                groundVert.warp,
                groundVert.phase,
              ) * groundVert.blend
            : 0;
          const horizontalSameStrength = groundHoriz.valid
            ? organicEdgeMask(
                horizontalDistance,
                mapX,
                groundHoriz.radius,
                groundHoriz.warp,
                groundHoriz.phase,
              ) * groundHoriz.blend
            : 0;
          let edgeStrength = 0;
          let edgeR = baseR;
          let edgeG = baseG;
          let edgeB = baseB;
          if (verticalSameStrength >= horizontalSameStrength && verticalSameStrength > 0) {
            edgeStrength = verticalSameStrength;
            edgeR = groundVert.r;
            edgeG = groundVert.g;
            edgeB = groundVert.b;
          } else if (horizontalSameStrength > 0) {
            edgeStrength = horizontalSameStrength;
            edgeR = groundHoriz.r;
            edgeG = groundHoriz.g;
            edgeB = groundHoriz.b;
          }
          if (edgeStrength > 0) {
            const targetR = (baseR + edgeR) * 0.5;
            const targetG = (baseG + edgeG) * 0.5;
            const targetB = (baseB + edgeB) * 0.5;
            r += (targetR - r) * edgeStrength;
            g += (targetG - g) * edgeStrength;
            b += (targetB - b) * edgeStrength;
          }
        }

        if (hasMaterialEdge) {
          const matVert = nearWest ? matW : matE;
          const verticalMaterialStrength = matVert.valid
            ? organicEdgeMask(verticalDistance, mapY, matVert.radius, matVert.warp, matVert.phase) *
              matVert.blend
            : 0;
          const horizontalMaterialStrength = matHoriz.valid
            ? organicEdgeMask(
                horizontalDistance,
                mapX,
                matHoriz.radius,
                matHoriz.warp,
                matHoriz.phase,
              ) * matHoriz.blend
            : 0;
          if (
            verticalMaterialStrength >= horizontalMaterialStrength &&
            verticalMaterialStrength > 0
          ) {
            materialEdgeStrength = verticalMaterialStrength;
            materialEdgeR = matVert.r;
            materialEdgeG = matVert.g;
            materialEdgeB = matVert.b;
          } else if (horizontalMaterialStrength > 0) {
            materialEdgeStrength = horizontalMaterialStrength;
            materialEdgeR = matHoriz.r;
            materialEdgeG = matHoriz.g;
            materialEdgeB = matHoriz.b;
          }
        }

        const nearestCorner = (nearWest ? 0 : 1) + (nearNorth ? 0 : 2);
        const corner =
          nearestCorner === 0
            ? cornerNW
            : nearestCorner === 1
              ? cornerNE
              : nearestCorner === 2
                ? cornerSW
                : cornerSE;
        if (organicCorners.valid[corner] !== 0) {
          const mask = organicCornerMask(
            verticalDistance,
            horizontalDistance,
            organicCorners.radius[corner]!,
            organicCorners.warpX[corner]!,
            organicCorners.warpY[corner]!,
            organicCorners.phase[corner]!,
          );
          if (mask > 0) {
            const strength = mask * organicCorners.blend[corner]!;
            r += (organicCorners.r[corner]! - r) * strength;
            g += (organicCorners.g[corner]! - g) * strength;
            b += (organicCorners.b[corner]! - b) * strength;
          }
        }
      }

      if (same === GROUND_CELL_CLASS) {
        const patternX = gx + (lx + 0.5) / ATLAS_CELL;
        const patternY = gy + (ly + 0.5) / ATLAS_CELL;
        // Feature shading is subtle; only vary its scalars near atlas seams
        // so it follows the continuous ground color without adding a
        // second per-pixel feature allocation or noise pass.
        const featureBoundary =
          featureCanBlend && (lx < 2 || lx >= ATLAS_CELL - 2 || ly < 2 || ly >= ATLAS_CELL - 2);
        if (featureBoundary && feature !== undefined) {
          feature.intensity =
            featureIntensity +
            featureIntensityEastDelta * fx +
            featureIntensitySouthDelta * fy +
            featureIntensityCornerDelta * fx * fy;
          feature.detail =
            featureDetail +
            featureDetailEastDelta * fx +
            featureDetailSouthDelta * fy +
            featureDetailCornerDelta * fx * fy;
        } else if (featureCanBlend && feature !== undefined && lx === 2) {
          feature.intensity = featureIntensity;
          feature.detail = featureDetail;
        }
        groundInputRgb.r = r;
        groundInputRgb.g = g;
        groundInputRgb.b = b;
        const pat = applyBiomeGroundPattern(
          groundInputRgb,
          state.biome,
          patternX,
          patternY,
          salt,
          mats,
          feature,
        );
        const edgeFactor = edgeFactors[ly * ATLAS_CELL + lx]!;
        r = pat.r * edgeFactor;
        g = pat.g * edgeFactor;
        b = pat.b * edgeFactor;
      }

      if (same === ORE_CELL_CLASS) {
        const vein = oreVeinAt(
          state,
          gx + (lx + 0.5) / ATLAS_CELL,
          gy + (ly + 0.5) / ATLAS_CELL,
          oreQueryOptions,
        );
        const metal = mixRgb(mats.ore, mats.light, 0.28 + vein.ridge * 0.45);
        const t = Math.min(1, vein.intensity);
        r += (metal.r - r) * t;
        g += (metal.g - g) * t;
        b += (metal.b - b) * t;
      }

      if (same === CONCRETE_CELL_CLASS) {
        // Expansion joints belong to larger slabs, not every tactical tile.
        const edge =
          (gx % 2 === 0 && lx === 0) ||
          (gy % 2 === 0 && ly === 0) ||
          (gx % 2 !== 0 && lx === ATLAS_CELL - 1) ||
          (gy % 2 !== 0 && ly === ATLAS_CELL - 1);
        if (edge) {
          const t = 0.22;
          r += (CONCRETE_STEEL_DARK.r - r) * t;
          g += (CONCRETE_STEEL_DARK.g - g) * t;
          b += (CONCRETE_STEEL_DARK.b - b) * t;
        }
      }

      if (materialEdgeStrength > 0) {
        const targetR = (baseR + materialEdgeR) * 0.5;
        const targetG = (baseG + materialEdgeG) * 0.5;
        const targetB = (baseB + materialEdgeB) * 0.5;
        r += (targetR - r) * materialEdgeStrength;
        g += (targetG - g) * materialEdgeStrength;
        b += (targetB - b) * materialEdgeStrength;
      }

      const px = col * ATLAS_CELL + lx;
      let grain = (hash2(px, py, salt) - 0.5) * grainScale;
      if (same === GROUND_CELL_CLASS) {
        grain += (hash2(px, py, salt + 91) - 0.5) * 4;
        grain +=
          (hash2(Math.floor(gx * 2 + lx / 4), Math.floor(gy * 2 + ly / 4), salt + 117) - 0.5) * 5;
      }
      writeCellPixel(data, width, px, py, r, g, b, grain, false);
    }
  }
}

export function bakeAtlasRowSlice(ctx: AtlasBakeContext, rowCount: number): boolean {
  const { cols, rows, classes } = ctx;
  const startRow = ctx.currentRow;
  const sliceSize = Number.isFinite(rowCount) ? Math.max(1, Math.floor(rowCount)) : 1;
  const endRow = Math.min(rows, startRow + sliceSize);

  for (let row = startRow; row < endRow; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = col - MAP_SKIRT;
      const gy = row - MAP_SKIRT;
      const same = classes[row * cols + col]!;
      if (same === WATER_CELL_CLASS) {
        bakeWaterCell(ctx, row, col, gx, gy);
      } else {
        bakeLandCell(ctx, row, col, gx, gy, same);
      }
    }
  }

  ctx.currentRow = endRow;
  return ctx.currentRow >= rows;
}
