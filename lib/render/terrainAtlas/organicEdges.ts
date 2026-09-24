import { MAP_SKIRT } from "../../gen/map";
import { hash2 } from "../terrainMaterials";
import {
  CONCRETE_CELL_CLASS,
  GROUND_CELL_CLASS,
  MATERIAL_CORNER_BLEND_CAP,
  MATERIAL_CORNER_SPREAD_SCALE,
  ORE_CELL_CLASS,
  ROAD_CELL_CLASS,
  type OrganicCornerBridges,
} from "./constants";

export function isLandMaterialClass(cellClass: number | undefined): boolean {
  return cellClass === ROAD_CELL_CLASS
    || cellClass === CONCRETE_CELL_CLASS
    || cellClass === ORE_CELL_CLASS
    || cellClass === GROUND_CELL_CLASS;
}

export function bakeOrganicCornerBridges(
  colors: Float32Array,
  classes: Uint8Array,
  cols: number,
  rows: number,
  salt: number,
): OrganicCornerBridges {
  const cornerCols = cols + 1;
  const cornerRows = rows + 1;
  const count = cornerCols * cornerRows;
  const valid = new Uint8Array(count);
  const r = new Float32Array(count);
  const g = new Float32Array(count);
  const b = new Float32Array(count);
  const radius = new Float32Array(count);
  const warpX = new Float32Array(count);
  const warpY = new Float32Array(count);
  const phase = new Float32Array(count);
  const blend = new Float32Array(count);

  for (let row = 1; row < rows; row++) {
    for (let col = 1; col < cols; col++) {
      const topLeft = (row - 1) * cols + col - 1;
      const topRight = topLeft + 1;
      const bottomLeft = row * cols + col - 1;
      const bottomRight = bottomLeft + 1;
      const cornerClasses = [
        classes[topLeft]!,
        classes[topRight]!,
        classes[bottomLeft]!,
        classes[bottomRight]!,
      ];
      const allLand = cornerClasses.every(isLandMaterialClass);
      const allGround = cornerClasses.every((cellClass) => cellClass === GROUND_CELL_CLASS);
      const mixedLand = allLand && new Set(cornerClasses).size > 1;
      if (
        !allGround
        && !mixedLand
      ) continue;

      const corner = row * cornerCols + col;
      const topLeftColor = topLeft * 3;
      const topRightColor = topRight * 3;
      const bottomLeftColor = bottomLeft * 3;
      const bottomRightColor = bottomRight * 3;
      const topLeftR = colors[topLeftColor]!;
      const topRightR = colors[topRightColor]!;
      const bottomLeftR = colors[bottomLeftColor]!;
      const bottomRightR = colors[bottomRightColor]!;
      const topLeftG = colors[topLeftColor + 1]!;
      const topRightG = colors[topRightColor + 1]!;
      const bottomLeftG = colors[bottomLeftColor + 1]!;
      const bottomRightG = colors[bottomRightColor + 1]!;
      const topLeftB = colors[topLeftColor + 2]!;
      const topRightB = colors[topRightColor + 2]!;
      const bottomLeftB = colors[bottomLeftColor + 2]!;
      const bottomRightB = colors[bottomRightColor + 2]!;
      r[corner] = (topLeftR + topRightR + bottomLeftR + bottomRightR) * 0.25;
      g[corner] = (topLeftG + topRightG + bottomLeftG + bottomRightG) * 0.25;
      b[corner] = (topLeftB + topRightB + bottomLeftB + bottomRightB) * 0.25;
      const colorSpread = Math.max(topLeftR, topRightR, bottomLeftR, bottomRightR)
        - Math.min(topLeftR, topRightR, bottomLeftR, bottomRightR)
        + Math.max(topLeftG, topRightG, bottomLeftG, bottomRightG)
        - Math.min(topLeftG, topRightG, bottomLeftG, bottomRightG)
        + Math.max(topLeftB, topRightB, bottomLeftB, bottomRightB)
        - Math.min(topLeftB, topRightB, bottomLeftB, bottomRightB);
      const worldX = col - MAP_SKIRT;
      const worldY = row - MAP_SKIRT;
      valid[corner] = 1;
      radius[corner] = 0.28 + hash2(worldX, worldY, salt + 601) * 0.12;
      warpX[corner] = (hash2(worldX, worldY, salt + 602) - 0.5) * 0.22;
      warpY[corner] = (hash2(worldX, worldY, salt + 603) - 0.5) * 0.22;
      phase[corner] = hash2(worldX, worldY, salt + 604) * Math.PI * 2;
      blend[corner] = mixedLand
        ? MATERIAL_CORNER_BLEND_CAP * Math.min(1, colorSpread / MATERIAL_CORNER_SPREAD_SCALE)
        : 0.6 * Math.min(1, colorSpread / 64);
    }
  }

  return { cols: cornerCols, valid, r, g, b, radius, warpX, warpY, phase, blend };
}

export function organicCornerMask(
  dx: number,
  dy: number,
  radius: number,
  warpX: number,
  warpY: number,
  phase: number,
): number {
  const warpedX = dx + Math.sin(dy * 6.2 + phase) * warpX;
  const warpedY = dy + Math.sin(dx * 5.1 - phase * 0.75) * warpY;
  const distance = Math.sqrt(warpedX * warpedX + warpedY * warpedY);
  const edge = Math.max(0, Math.min(1, (radius + 0.08 - distance) / 0.08));
  return edge * edge * (3 - edge * 2);
}

export function organicEdgeMask(
  distance: number,
  along: number,
  radius: number,
  warp: number,
  phase: number,
): number {
  const boundary = radius
    + 0.08
    + Math.sin(along * 2.35 + phase) * warp
    + Math.sin(along * 5.15 - phase * 0.7) * warp * 0.35;
  const edge = Math.max(0, Math.min(1, (boundary - distance) / 0.08));
  return edge * edge * (3 - edge * 2);
}

export function organicEdgeBlendStrength(
  baseR: number,
  baseG: number,
  baseB: number,
  neighborR: number,
  neighborG: number,
  neighborB: number,
  blendCap = 0.6,
  spreadScale = 40,
): number {
  const difference = Math.abs(baseR - neighborR)
    + Math.abs(baseG - neighborG)
    + Math.abs(baseB - neighborB);
  return blendCap * Math.min(1, difference / spreadScale);
}
