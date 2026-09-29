import type { BiomeName } from "@/lib/types";

export type MissionIntroBiomeStaging = {
  label: string;
  routeBias: number;
  establishZoom: number;
  travelZoom: number;
  entryDistance: number;
  accent: string;
};

/** Each biome sets a restrained opening frame and tracking scale. */
export const MISSION_INTRO_BIOMES: Record<BiomeName, MissionIntroBiomeStaging> = {
  "ash plains": { label: "ASH PLAINS", routeBias: 0, establishZoom: 1.48, travelZoom: 1.22, entryDistance: 3.5, accent: "#b6c8c0" },
  "crystal flats": { label: "CRYSTAL FLATS", routeBias: 1, establishZoom: 1.5, travelZoom: 1.24, entryDistance: 3.4, accent: "#8ee9ee" },
  "rust canyons": { label: "RUST CANYONS", routeBias: 2, establishZoom: 1.48, travelZoom: 1.23, entryDistance: 3.6, accent: "#e6a17c" },
  "salt marshes": { label: "SALT MARSHES", routeBias: 3, establishZoom: 1.42, travelZoom: 1.18, entryDistance: 3.5, accent: "#a7dbca" },
  "glass desert": { label: "GLASS DESERT", routeBias: 4, establishZoom: 1.46, travelZoom: 1.2, entryDistance: 3.6, accent: "#f4d39b" },
  "tundra grid": { label: "FROZEN TUNDRA", routeBias: 5, establishZoom: 1.46, travelZoom: 1.21, entryDistance: 3.5, accent: "#d8f3f3" },
  "jungle wreckage": { label: "RUINED JUNGLE", routeBias: 6, establishZoom: 1.56, travelZoom: 1.3, entryDistance: 3.4, accent: "#b6db8b" },
  "volcanic shelf": { label: "VOLCANIC SHELF", routeBias: 7, establishZoom: 1.48, travelZoom: 1.25, entryDistance: 3.5, accent: "#ffad80" },
};
