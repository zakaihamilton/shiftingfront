import type { Camera } from "@/lib/iso";
import type { ScrollLayer } from "@/lib/render/scrollLayer";

export type CinemaTerrainCache = ScrollLayer & {
  canvas: HTMLCanvasElement | null;
};

export type RenderCinemaOptions = {
  camera?: Camera;
  paintAmbient?: boolean;
  useTerrainCache?: boolean;
};

export const CINEMA_TERRAIN_CACHE_LIMIT = 4;
export const CINEMA_REFERENCE_FRAME_MS = 1000 / 60;
export const CINEMA_SHOT_LIFETIME_MS = 18 * CINEMA_REFERENCE_FRAME_MS;
