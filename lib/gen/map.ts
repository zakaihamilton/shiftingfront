export { type GeneratedMap, type MapAffordances, mapSizeForMission, generateMap } from "./map/generator";
export {
  MAP_SKIRT,
  MAP_SKIRT_ALPHA,
  type ScenerySample,
  type SceneryWorld,
  outsideDist,
  skirtAlpha,
  skirtSample,
  isMountainScenery,
  featureEdgeMask,
  sceneryAt,
  describeMap,
  winNeedsMarked,
} from "./map/scenery";
export { hashNoise, valueNoise, fbm, warpedFbm, mixSalt } from "./map/noise";
export {
  ACTIVE_TERRAIN_RULE_INTENSITY,
  terrainFeatureAt,
  terrainFeatureSamplerFor,
  type TerrainFeatureKind,
  type TerrainFeatureSample,
  type TerrainFeatureWorld,
} from "./map/features";
export {
  idx,
  inBounds,
  neighbors8,
  meanderingRoute,
  carveRoute,
  flattenArea,
  paintBase,
  smoothWater,
  pruneWaterIslands,
  relaxHeights,
  reachable,
} from "./map/terrain";
