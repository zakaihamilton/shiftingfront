import type { BiomeName, SurfaceKind } from "../../../types";
import { blockerPropKind, type BlockerPropKind } from "../../../gen/terrainDecorKinds";

export { blockerPropKind };
export type { BlockerPropKind };

export type ScatterKind =
  | "pebble"
  | "pebbleCluster"
  | "rockSlab"
  | "mineralFragment"
  | "dryBrush"
  | "mineralFlake"
  | "tuft"
  | "shrub"
  | "debris"
  | "crystalChip"
  | "reed"
  | "cinder"
  | "iceChip"
  | "desertTree"
  | "cactus"
  | "desertShrub"
  | "landmark";

export type ScatterItem = {
  kind: ScatterKind;
  ox: number;
  oy: number;
  rotation: number;
  scale: number;
  variant: number;
};

export type ScatterWorld = {
  seed: number;
  missionIndex?: number;
  biome: BiomeName;
  width: number;
  height: number;
  tiles: number[];
  heights: number[];
  surfaces: SurfaceKind[];
};

export const LUSH_SCATTER: ReadonlySet<ScatterKind> = new Set(["tuft", "shrub", "reed", "dryBrush"]);
export const ARID_SCATTER: ReadonlySet<ScatterKind> = new Set([
  "pebble",
  "pebbleCluster",
  "rockSlab",
  "mineralFragment",
  "debris",
  "cinder",
  "desertTree",
  "cactus",
  "desertShrub",
]);
