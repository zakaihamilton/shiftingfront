import type { BiomeName, MissionProfileVariant, SurfaceKind, Vec2 } from "../../../types";

export type MapAffordances = {
  routeLengths: number[];
  baselineRouteLength: number;
  alternateRouteLength: number;
  reachableResourceValue: number;
  nearestResourceDistance: number;
  laneCount: number;
  /** Reachable ore beyond the middle-ground seam, used by economy profiles. */
  forwardResourceValue: number;
  /** Maximum sampled separation between the first two approach lanes. */
  routeSeparation: number;
};

export type GeneratedMap = {
  width: number;
  height: number;
  tiles: number[];
  heights: number[];
  surfaces: SurfaceKind[];
  biome: BiomeName;
  resourceAmount: number[];
  playerStart: Vec2;
  enemyStart: Vec2;
  markedSpots: Vec2[];
  profileVariant: MissionProfileVariant;
  affordances: MapAffordances;
};

export type MapCorner = "bottomRight" | "bottomLeft" | "topRight";
