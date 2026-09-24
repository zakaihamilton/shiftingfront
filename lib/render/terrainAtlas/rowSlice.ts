import { MAP_SKIRT } from "../../gen/map";
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
  WATER_SHORE_MAX,
  bilinearFromNeighborhood,
  clampShore,
  landEdgeDistFromMask,
  readShoreCell,
  tintWater,
} from "../terrainAtlasSurfaces";
import {
  CONCRETE_CELL_CLASS,
  GROUND_CELL_CLASS,
  MATERIAL_EDGE_RADIUS_MIN,
  MATERIAL_EDGE_RADIUS_RANGE,
  MATERIAL_EDGE_WARP_RANGE,
  ORE_CELL_CLASS,
  WATER_CELL_CLASS,
  type AtlasBakeContext,
} from "./constants";
import {
  isLandMaterialClass,
  organicCornerMask,
  organicEdgeBlendStrength,
  organicEdgeMask,
} from "./organicEdges";

export function bakeAtlasRowSlice(ctx: AtlasBakeContext, rowCount: number): boolean {
  const {
    state,
    cols,
    rows,
    width,
    colors,
    classes,
    features,
    sceneryGrid,
    shoreDist,
    salt,
    mats,
    pixelFractions,
    edgeFactors,
    organicCorners,
    data,
  } = ctx;
  const startRow = ctx.currentRow;
  const sliceSize = Number.isFinite(rowCount) ? Math.max(1, Math.floor(rowCount)) : 1;
  const endRow = Math.min(rows, startRow + sliceSize);

  for (let row = startRow; row < endRow; row++) {
    for (let col = 0; col < cols; col++) {
      const gx = col - MAP_SKIRT;
      const gy = row - MAP_SKIRT;
      const i = (row * cols + col) * 3;
      const baseR = colors[i]!;
      const baseG = colors[i + 1]!;
      const baseB = colors[i + 2]!;
      const same = classes[row * cols + col]!;
      const cornerNW = row * organicCorners.cols + col;
      const cornerNE = cornerNW + 1;
      const cornerSW = cornerNW + organicCorners.cols;
      const cornerSE = cornerSW + 1;
      const canBlend = same !== CONCRETE_CELL_CLASS && same !== WATER_CELL_CLASS;
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
      const blendSE = blendE
        && blendS
        && classes[(row + 1) * cols + col + 1] === same;
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
      const cellDist = clampShore(shoreDist[row * cols + col] ?? WATER_SHORE_MAX);
      const resourceAmount = same === ORE_CELL_CLASS ? resourceAt(state, gx, gy) : 0;
      const waterMask = same === WATER_CELL_CLASS ? sceneryGrid.waterNeighbors[row * cols + col] ?? 0 : 0;
      const westEdgeValid = same === GROUND_CELL_CLASS
        && col > 0
        && classes[row * cols + col - 1] === GROUND_CELL_CLASS;
      const eastEdgeValid = same === GROUND_CELL_CLASS
        && col + 1 < cols
        && classes[row * cols + col + 1] === GROUND_CELL_CLASS;
      const northEdgeValid = same === GROUND_CELL_CLASS
        && row > 0
        && classes[(row - 1) * cols + col] === GROUND_CELL_CLASS;
      const southEdgeValid = same === GROUND_CELL_CLASS
        && row + 1 < rows
        && classes[(row + 1) * cols + col] === GROUND_CELL_CLASS;
      const westI = i - 3;
      const northI = i - cols * 3;
      const westR = westEdgeValid ? colors[westI]! : baseR;
      const westG = westEdgeValid ? colors[westI + 1]! : baseG;
      const westB = westEdgeValid ? colors[westI + 2]! : baseB;
      const northR = northEdgeValid ? colors[northI]! : baseR;
      const northG = northEdgeValid ? colors[northI + 1]! : baseG;
      const northB = northEdgeValid ? colors[northI + 2]! : baseB;
      const westBlend = westEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, westR, westG, westB)
        : 0;
      const eastBlend = eastEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, eastR, eastG, eastB)
        : 0;
      const northBlend = northEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, northR, northG, northB)
        : 0;
      const southBlend = southEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, southR, southG, southB)
        : 0;
      const westRadius = westEdgeValid ? 0.24 + hash2(gx, 0, salt + 651) * 0.16 : 0;
      const eastRadius = eastEdgeValid ? 0.24 + hash2(gx + 1, 0, salt + 651) * 0.16 : 0;
      const northRadius = northEdgeValid ? 0.24 + hash2(0, gy, salt + 701) * 0.16 : 0;
      const southRadius = southEdgeValid ? 0.24 + hash2(0, gy + 1, salt + 701) * 0.16 : 0;
      const westWarp = westEdgeValid ? (hash2(gx, 0, salt + 652) - 0.5) * 0.34 : 0;
      const eastWarp = eastEdgeValid ? (hash2(gx + 1, 0, salt + 652) - 0.5) * 0.34 : 0;
      const northWarp = northEdgeValid ? (hash2(0, gy, salt + 702) - 0.5) * 0.34 : 0;
      const southWarp = southEdgeValid ? (hash2(0, gy + 1, salt + 702) - 0.5) * 0.34 : 0;
      const westPhase = westEdgeValid ? hash2(gx, 0, salt + 653) * Math.PI * 2 : 0;
      const eastPhase = eastEdgeValid ? hash2(gx + 1, 0, salt + 653) * Math.PI * 2 : 0;
      const northPhase = northEdgeValid ? hash2(0, gy, salt + 703) * Math.PI * 2 : 0;
      const southPhase = southEdgeValid ? hash2(0, gy + 1, salt + 703) * Math.PI * 2 : 0;
      const westClass = col > 0 ? classes[row * cols + col - 1] : undefined;
      const eastClass = col + 1 < cols ? classes[row * cols + col + 1] : undefined;
      const northClass = row > 0 ? classes[(row - 1) * cols + col] : undefined;
      const southClass = row + 1 < rows ? classes[(row + 1) * cols + col] : undefined;
      const westMaterialEdgeValid = isLandMaterialClass(same)
        && isLandMaterialClass(westClass)
        && westClass !== same;
      const eastMaterialEdgeValid = isLandMaterialClass(same)
        && isLandMaterialClass(eastClass)
        && eastClass !== same;
      const northMaterialEdgeValid = isLandMaterialClass(same)
        && isLandMaterialClass(northClass)
        && northClass !== same;
      const southMaterialEdgeValid = isLandMaterialClass(same)
        && isLandMaterialClass(southClass)
        && southClass !== same;
      const hasMaterialEdge = westMaterialEdgeValid
        || eastMaterialEdgeValid
        || northMaterialEdgeValid
        || southMaterialEdgeValid;
      const westMaterialR = westMaterialEdgeValid ? colors[westI]! : baseR;
      const westMaterialG = westMaterialEdgeValid ? colors[westI + 1]! : baseG;
      const westMaterialB = westMaterialEdgeValid ? colors[westI + 2]! : baseB;
      const eastMaterialR = eastMaterialEdgeValid ? colors[i + 3]! : baseR;
      const eastMaterialG = eastMaterialEdgeValid ? colors[i + 4]! : baseG;
      const eastMaterialB = eastMaterialEdgeValid ? colors[i + 5]! : baseB;
      const northMaterialR = northMaterialEdgeValid ? colors[northI]! : baseR;
      const northMaterialG = northMaterialEdgeValid ? colors[northI + 1]! : baseG;
      const northMaterialB = northMaterialEdgeValid ? colors[northI + 2]! : baseB;
      const southMaterialR = southMaterialEdgeValid ? colors[southI]! : baseR;
      const southMaterialG = southMaterialEdgeValid ? colors[southI + 1]! : baseG;
      const southMaterialB = southMaterialEdgeValid ? colors[southI + 2]! : baseB;
      const westMaterialBlend = westMaterialEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, westMaterialR, westMaterialG, westMaterialB)
        : 0;
      const eastMaterialBlend = eastMaterialEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, eastMaterialR, eastMaterialG, eastMaterialB)
        : 0;
      const northMaterialBlend = northMaterialEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, northMaterialR, northMaterialG, northMaterialB)
        : 0;
      const southMaterialBlend = southMaterialEdgeValid
        ? organicEdgeBlendStrength(baseR, baseG, baseB, southMaterialR, southMaterialG, southMaterialB)
        : 0;
      const westMaterialRadius = westMaterialEdgeValid
        ? MATERIAL_EDGE_RADIUS_MIN + hash2(gx, 0, salt + 751) * MATERIAL_EDGE_RADIUS_RANGE
        : 0;
      const eastMaterialRadius = eastMaterialEdgeValid
        ? MATERIAL_EDGE_RADIUS_MIN + hash2(gx + 1, 0, salt + 751) * MATERIAL_EDGE_RADIUS_RANGE
        : 0;
      const northMaterialRadius = northMaterialEdgeValid
        ? MATERIAL_EDGE_RADIUS_MIN + hash2(0, gy, salt + 761) * MATERIAL_EDGE_RADIUS_RANGE
        : 0;
      const southMaterialRadius = southMaterialEdgeValid
        ? MATERIAL_EDGE_RADIUS_MIN + hash2(0, gy + 1, salt + 761) * MATERIAL_EDGE_RADIUS_RANGE
        : 0;
      const westMaterialWarp = westMaterialEdgeValid
        ? (hash2(gx, 0, salt + 752) - 0.5) * MATERIAL_EDGE_WARP_RANGE
        : 0;
      const eastMaterialWarp = eastMaterialEdgeValid
        ? (hash2(gx + 1, 0, salt + 752) - 0.5) * MATERIAL_EDGE_WARP_RANGE
        : 0;
      const northMaterialWarp = northMaterialEdgeValid
        ? (hash2(0, gy, salt + 762) - 0.5) * MATERIAL_EDGE_WARP_RANGE
        : 0;
      const southMaterialWarp = southMaterialEdgeValid
        ? (hash2(0, gy + 1, salt + 762) - 0.5) * MATERIAL_EDGE_WARP_RANGE
        : 0;
      const westMaterialPhase = westMaterialEdgeValid
        ? hash2(gx, 0, salt + 753) * Math.PI * 2
        : 0;
      const eastMaterialPhase = eastMaterialEdgeValid
        ? hash2(gx + 1, 0, salt + 753) * Math.PI * 2
        : 0;
      const northMaterialPhase = northMaterialEdgeValid
        ? hash2(0, gy, salt + 763) * Math.PI * 2
        : 0;
      const southMaterialPhase = southMaterialEdgeValid
        ? hash2(0, gy + 1, salt + 763) * Math.PI * 2
        : 0;
      const feature = features[row * cols + col];
      const eastFeature = blendE ? features[row * cols + col + 1] : undefined;
      const southFeature = blendS ? features[(row + 1) * cols + col] : undefined;
      const southeastFeature = blendSE ? features[(row + 1) * cols + col + 1] : undefined;
      const featureCanBlend = same === GROUND_CELL_CLASS
        && blendSE
        && feature !== undefined
        && eastFeature?.kind === feature.kind
        && southFeature?.kind === feature.kind
        && southeastFeature?.kind === feature.kind;
      const featureIntensity = feature?.intensity ?? 0;
      const featureIntensityEastDelta = (eastFeature?.intensity ?? featureIntensity) - featureIntensity;
      const featureIntensitySouthDelta = (southFeature?.intensity ?? featureIntensity) - featureIntensity;
      const featureIntensityCornerDelta = (southeastFeature?.intensity ?? featureIntensity)
        - (southFeature?.intensity ?? featureIntensity)
        - (eastFeature?.intensity ?? featureIntensity)
        + featureIntensity;
      const featureDetail = feature?.detail ?? 0;
      const featureDetailEastDelta = (eastFeature?.detail ?? featureDetail) - featureDetail;
      const featureDetailSouthDelta = (southFeature?.detail ?? featureDetail) - featureDetail;
      const featureDetailCornerDelta = (southeastFeature?.detail ?? featureDetail)
        - (southFeature?.detail ?? featureDetail)
        - (eastFeature?.detail ?? featureDetail)
        + featureDetail;
      const n00 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col - 1, row - 1, cellDist) : 0;
      const n10 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col, row - 1, cellDist) : 0;
      const n20 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col + 1, row - 1, cellDist) : 0;
      const n01 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col - 1, row, cellDist) : 0;
      const n21 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col + 1, row, cellDist) : 0;
      const n02 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col - 1, row + 1, cellDist) : 0;
      const n12 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col, row + 1, cellDist) : 0;
      const n22 = same === WATER_CELL_CLASS ? readShoreCell(shoreDist, cols, rows, col + 1, row + 1, cellDist) : 0;
      for (let ly = 0; ly < ATLAS_CELL; ly++) {
        const fy = ly / ATLAS_CELL;
        const pixelFy = pixelFractions[ly]!;
        const mapY = gy + pixelFy;
        const py = row * ATLAS_CELL + ly;
        for (let lx = 0; lx < ATLAS_CELL; lx++) {
          const fx = lx / ATLAS_CELL;
          const pixelFx = pixelFractions[lx]!;
          const mapX = gx + pixelFx;
          let r: number;
          let g: number;
          let b: number;
          let materialEdgeStrength = 0;
          let materialEdgeR = baseR;
          let materialEdgeG = baseG;
          let materialEdgeB = baseB;
          if (same === WATER_CELL_CLASS) {
            const wet = tintWater(
              mats,
              Math.min(
                bilinearFromNeighborhood(pixelFractions[lx]!, pixelFractions[ly]!, n00, n10, n20, n01, cellDist, n21, n02, n12, n22),
                landEdgeDistFromMask(pixelFractions[lx]!, pixelFractions[ly]!, waterMask),
              ),
              mapX,
              mapY,
              salt,
            );
            r = wet.r;
            g = wet.g;
            b = wet.b;
          } else {
            if (groundBilinear) {
              r = baseR + rEastDelta * fx + rSouthDelta * fy + rCornerDelta * fx * fy;
              g = baseG + gEastDelta * fx + gSouthDelta * fy + gCornerDelta * fx * fy;
              b = baseB + bEastDelta * fx + bSouthDelta * fy + bCornerDelta * fx * fy;
            } else {
              r = baseR + (eastR - baseR) * fx * 0.28 + (southR - baseR) * fy * 0.28;
              g = baseG + (eastG - baseG) * fx * 0.28 + (southG - baseG) * fy * 0.28;
              b = baseB + (eastB - baseB) * fx * 0.28 + (southB - baseB) * fy * 0.28;
            }

            // Same-material feathering is only meaningful for ground cells.
            // Other land materials only need the more expensive organic branch
            // when they touch a different land material.
            if (same === GROUND_CELL_CLASS || hasMaterialEdge) {
              const nearWest = pixelFx < 0.5;
              const nearNorth = pixelFy < 0.5;
              const verticalDistance = nearWest ? pixelFx : 1 - pixelFx;
              const horizontalDistance = nearNorth ? pixelFy : 1 - pixelFy;
              if (same === GROUND_CELL_CLASS) {
                const verticalSameMask = nearWest
                  ? westEdgeValid
                    ? organicEdgeMask(verticalDistance, mapY, westRadius, westWarp, westPhase)
                    : 0
                  : eastEdgeValid
                    ? organicEdgeMask(verticalDistance, mapY, eastRadius, eastWarp, eastPhase)
                    : 0;
                const horizontalSameMask = nearNorth
                  ? northEdgeValid
                    ? organicEdgeMask(horizontalDistance, mapX, northRadius, northWarp, northPhase)
                    : 0
                  : southEdgeValid
                    ? organicEdgeMask(horizontalDistance, mapX, southRadius, southWarp, southPhase)
                    : 0;
                const verticalSameStrength = verticalSameMask * (nearWest ? westBlend : eastBlend);
                const horizontalSameStrength = horizontalSameMask * (nearNorth ? northBlend : southBlend);
                let edgeStrength = 0;
                let edgeR = baseR;
                let edgeG = baseG;
                let edgeB = baseB;
                if (verticalSameStrength >= horizontalSameStrength && verticalSameStrength > 0) {
                  edgeStrength = verticalSameStrength;
                  edgeR = nearWest ? westR : eastR;
                  edgeG = nearWest ? westG : eastG;
                  edgeB = nearWest ? westB : eastB;
                } else if (horizontalSameStrength > 0) {
                  edgeStrength = horizontalSameStrength;
                  edgeR = nearNorth ? northR : southR;
                  edgeG = nearNorth ? northG : southG;
                  edgeB = nearNorth ? northB : southB;
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
                const verticalMaterialMask = nearWest
                  ? westMaterialEdgeValid
                    ? organicEdgeMask(verticalDistance, mapY, westMaterialRadius, westMaterialWarp, westMaterialPhase)
                    : 0
                  : eastMaterialEdgeValid
                    ? organicEdgeMask(verticalDistance, mapY, eastMaterialRadius, eastMaterialWarp, eastMaterialPhase)
                    : 0;
                const horizontalMaterialMask = nearNorth
                  ? northMaterialEdgeValid
                    ? organicEdgeMask(horizontalDistance, mapX, northMaterialRadius, northMaterialWarp, northMaterialPhase)
                    : 0
                  : southMaterialEdgeValid
                    ? organicEdgeMask(horizontalDistance, mapX, southMaterialRadius, southMaterialWarp, southMaterialPhase)
                    : 0;
                const verticalMaterialStrength = verticalMaterialMask * (nearWest ? westMaterialBlend : eastMaterialBlend);
                const horizontalMaterialStrength = horizontalMaterialMask * (nearNorth ? northMaterialBlend : southMaterialBlend);
                if (verticalMaterialStrength >= horizontalMaterialStrength && verticalMaterialStrength > 0) {
                  materialEdgeStrength = verticalMaterialStrength;
                  materialEdgeR = nearWest ? westMaterialR : eastMaterialR;
                  materialEdgeG = nearWest ? westMaterialG : eastMaterialG;
                  materialEdgeB = nearWest ? westMaterialB : eastMaterialB;
                } else if (horizontalMaterialStrength > 0) {
                  materialEdgeStrength = horizontalMaterialStrength;
                  materialEdgeR = nearNorth ? northMaterialR : southMaterialR;
                  materialEdgeG = nearNorth ? northMaterialG : southMaterialG;
                  materialEdgeB = nearNorth ? northMaterialB : southMaterialB;
                }
              }

              const nearestCorner = (pixelFx < 0.5 ? 0 : 1) + (pixelFy < 0.5 ? 0 : 2);
              const corner = nearestCorner === 0
                ? cornerNW
                : nearestCorner === 1
                  ? cornerNE
                  : nearestCorner === 2
                    ? cornerSW
                    : cornerSE;
              if (organicCorners.valid[corner] !== 0) {
                const dx = pixelFx < 0.5 ? pixelFx : 1 - pixelFx;
                const dy = pixelFy < 0.5 ? pixelFy : 1 - pixelFy;
                const mask = organicCornerMask(
                  dx,
                  dy,
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
          }
          if (same === GROUND_CELL_CLASS) {
            const patternX = gx + (lx + 0.5) / ATLAS_CELL;
            const patternY = gy + (ly + 0.5) / ATLAS_CELL;
            // Feature shading is subtle; only vary its scalars near atlas seams
            // so it follows the continuous ground color without adding a
            // second per-pixel feature allocation or noise pass.
            const featureBoundary = featureCanBlend
              && (lx < 2 || lx >= ATLAS_CELL - 2 || ly < 2 || ly >= ATLAS_CELL - 2);
            if (featureBoundary && feature !== undefined) {
              feature.intensity = featureIntensity
                + featureIntensityEastDelta * fx
                + featureIntensitySouthDelta * fy
                + featureIntensityCornerDelta * fx * fy;
              feature.detail = featureDetail
                + featureDetailEastDelta * fx
                + featureDetailSouthDelta * fy
                + featureDetailCornerDelta * fx * fy;
            } else if (featureCanBlend && feature !== undefined && lx === 2) {
              feature.intensity = featureIntensity;
              feature.detail = featureDetail;
            }
            const pat = applyBiomeGroundPattern({ r, g, b }, state.biome, patternX, patternY, salt, mats, feature);
            r = pat.r;
            g = pat.g;
            b = pat.b;
            const edgeFactor = edgeFactors[ly * ATLAS_CELL + lx]!;
            r *= edgeFactor;
            g *= edgeFactor;
            b *= edgeFactor;
          }
          if (same === ORE_CELL_CLASS) {
            const vein = oreVeinAt(
              state,
              gx + (lx + 0.5) / ATLAS_CELL,
              gy + (ly + 0.5) / ATLAS_CELL,
              { salt, amount: resourceAmount },
            );
            const metal = mixRgb(mats.ore, mats.light, 0.28 + vein.ridge * 0.45);
            const t = Math.min(1, vein.intensity);
            r += (metal.r - r) * t;
            g += (metal.g - g) * t;
            b += (metal.b - b) * t;
          }
          if (same === CONCRETE_CELL_CLASS) {
            const edge = lx === 0 || ly === 0 || lx === ATLAS_CELL - 1 || ly === ATLAS_CELL - 1;
            if (edge) {
              const t = 0.42;
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
          const grainScale = same === CONCRETE_CELL_CLASS ? 5 : same === WATER_CELL_CLASS ? 3 : same === GROUND_CELL_CLASS ? 11 : 13;
          let grain = (hash2(px, py, salt) - 0.5) * grainScale;
          if (same === GROUND_CELL_CLASS) {
            grain += (hash2(px, py, salt + 91) - 0.5) * 4;
            grain += (hash2(Math.floor(gx * 2 + lx / 4), Math.floor(gy * 2 + ly / 4), salt + 117) - 0.5) * 5;
          }
          const o = (py * width + px) * 4;
          if (same === WATER_CELL_CLASS) {
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
      }
    }
  }

  ctx.currentRow = endRow;
  return ctx.currentRow >= rows;
}
