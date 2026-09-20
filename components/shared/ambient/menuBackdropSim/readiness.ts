import { listMissionRasterSources } from "@/lib/gen/visualAssets";
import {
  areRasterSourcesReady,
  preloadRasterSources,
} from "@/lib/render/sprites";
import {
  isTerrainAtlasReady,
  preloadTerrainAtlas,
} from "@/lib/render/terrainAtlas";
import type { CinemaScene } from "./scene";

export const PREVIEW_ATLAS_ROWS_PER_CHUNK = 32;

export type PreparedCinemaScene = {
  scene: CinemaScene;
  rasterSources: readonly string[];
};

export type CinemaReadinessChecks = {
  isTerrainReady?: typeof isTerrainAtlasReady;
  areRastersReady?: typeof areRasterSourcesReady;
};

export function prepareCinemaScene(scene: CinemaScene): PreparedCinemaScene {
  const rasterSources = scene.state ? listMissionRasterSources(scene.state) : [];
  preloadTerrainAtlas(scene.ground, { rowsPerChunk: PREVIEW_ATLAS_ROWS_PER_CHUNK });
  if (scene.state) {
    preloadTerrainAtlas(scene.state, { rowsPerChunk: PREVIEW_ATLAS_ROWS_PER_CHUNK });
    preloadRasterSources(rasterSources);
  }
  return { scene, rasterSources };
}

export function isCinemaSceneReady(
  prepared: PreparedCinemaScene,
  checks: CinemaReadinessChecks = {},
): boolean {
  const state = prepared.scene.state;
  if (!state) return false;
  const terrainReady = checks.isTerrainReady ?? isTerrainAtlasReady;
  const rastersReady = checks.areRastersReady ?? areRasterSourcesReady;
  return terrainReady(state) && rastersReady(prepared.rasterSources);
}
