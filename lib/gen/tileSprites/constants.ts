import { type BiomeName, type TileContour } from "../../types";
import { irregularIso as irregularIsoPrimitive } from "../shapePrimitives";
export { ell, line, poly } from "../shapePrimitives";

export const TW = 64;
export const TH = 32;
export const TILE_SPRITE_PAD_X = 4;
export const TILE_SPRITE_PAD_Y = 4;
export const SPRITE_W = TW + TILE_SPRITE_PAD_X * 2;
export const SPRITE_H = TH + TILE_SPRITE_PAD_Y * 2;
export const INK = "#202a32";
export const ART_PIXEL_SCALE = 1;
export const TERRAIN_ART_REV = "tactical-surface-v17-rounded-minerals";

export function tileCx(): number {
  return TILE_SPRITE_PAD_X + TW / 2;
}

export function tileCy(): number {
  return TILE_SPRITE_PAD_Y + TH / 2;
}

/** Preserve the tile-sprite API: the seed argument is accepted for compatibility and ignored. */
export function irregularIso(cx: number, cy: number, w: number, h: number, _seed: number, out = 1): number[] {
  return irregularIsoPrimitive(cx, cy, w, h, out);
}

export function defaultContour(kind: "clear" | "water" | "resource" | "blocked", elev: number): TileContour {
  if (kind === "water") return "bank";
  if (kind === "blocked" && elev >= 2) return "ridge";
  if (elev >= 3) return "ridge";
  return "none";
}

export function arid(biome: BiomeName): boolean {
  return biome === "glass desert" || biome === "rust canyons" || biome === "volcanic shelf";
}

export function lush(biome: BiomeName): boolean {
  return biome === "jungle wreckage" || biome === "salt marshes";
}
