import type { ReadonlyMissionDef } from "../../types";
import type { GeneratedMap } from "./generator/index";
import {
  carveRoutes,
  createMapBuild,
  finishGeneratedMap,
  injectLandmark,
  paintBaseFootprints,
  paintTerrainNoise,
  placeResources,
} from "./generatePhases";

export function generateMap(
  seed: number,
  mission: Pick<ReadonlyMissionDef, "index" | "win" | "mapSize" | "biome" | "profile">,
): GeneratedMap {
  const build = createMapBuild(seed, mission);
  paintTerrainNoise(build);
  injectLandmark(build);
  paintBaseFootprints(build);
  carveRoutes(build);
  placeResources(build);
  return finishGeneratedMap(build);
}

export * from "./generator/index";
