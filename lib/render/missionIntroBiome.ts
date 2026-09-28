import type { BiomeName } from "@/lib/types";

export type MissionIntroBiomeStaging = {
  label: string;
  routeBias: number;
  cameraZooms: readonly [number, number, number, number, number];
  entryDistance: number;
  accent: string;
};

/** Each biome sets a restrained, authored framing scale and entry length. */
export const MISSION_INTRO_BIOMES: Record<BiomeName, MissionIntroBiomeStaging> = {
  "ash plains": { label: "ASH PLAINS", routeBias: 0, cameraZooms: [1.48, 1.4, 1.22, 1.13, 1.08], entryDistance: 3.5, accent: "#b6c8c0" },
  "crystal flats": { label: "CRYSTAL FLATS", routeBias: 1, cameraZooms: [1.5, 1.42, 1.24, 1.14, 1.09], entryDistance: 3.4, accent: "#8ee9ee" },
  "rust canyons": { label: "RUST CANYONS", routeBias: 2, cameraZooms: [1.48, 1.4, 1.23, 1.12, 1.08], entryDistance: 3.6, accent: "#e6a17c" },
  "salt marshes": { label: "SALT MARSHES", routeBias: 3, cameraZooms: [1.42, 1.36, 1.18, 1.08, 1.04], entryDistance: 3.5, accent: "#a7dbca" },
  "glass desert": { label: "GLASS DESERT", routeBias: 4, cameraZooms: [1.46, 1.38, 1.2, 1.1, 1.06], entryDistance: 3.6, accent: "#f4d39b" },
  "tundra grid": { label: "FROZEN TUNDRA", routeBias: 5, cameraZooms: [1.46, 1.38, 1.21, 1.1, 1.06], entryDistance: 3.5, accent: "#d8f3f3" },
  "jungle wreckage": { label: "RUINED JUNGLE", routeBias: 6, cameraZooms: [1.56, 1.48, 1.3, 1.2, 1.13], entryDistance: 3.4, accent: "#b6db8b" },
  "volcanic shelf": { label: "VOLCANIC SHELF", routeBias: 7, cameraZooms: [1.48, 1.4, 1.25, 1.12, 1.08], entryDistance: 3.5, accent: "#ffad80" },
};
