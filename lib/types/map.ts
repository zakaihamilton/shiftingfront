export type TileKind = 0 | 1 | 2 | 3;

export const TILE_CLEAR = 0 as const;
export const TILE_WATER = 1 as const;
export const TILE_RESOURCE = 2 as const;
export const TILE_BLOCKED = 3 as const;

export type SurfaceKind = 0 | 1 | 2;
export const SURFACE_NONE = 0 as const;
export const SURFACE_ROAD = 1 as const;
export const SURFACE_CONCRETE = 2 as const;

export type BiomeName =
  | "ash plains"
  | "crystal flats"
  | "rust canyons"
  | "salt marshes"
  | "glass desert"
  | "tundra grid"
  | "jungle wreckage"
  | "volcanic shelf";

export type Facing = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type Vec2 = { x: number; y: number };

export type WorldSetting = {
  name: string;
  tone: string;
  conflict: string;
  era: string;
  biome: BiomeName;
};

export type MapSpawnTopology =
  | "corner-nw-se"
  | "corner-se-nw"
  | "corner-sw-ne"
  | "corner-ne-sw"
  | "edge-w-e"
  | "edge-e-w"
  | "edge-n-s"
  | "edge-s-n"
  | "center-player"
  | "center-enemy";

export type LandmarkKind =
  | "crater"
  | "canyon"
  | "spireRidge"
  | "delta"
  | "caldera"
  | "crevasse"
  | "ruinClearing"
  | "basaltShelf";
