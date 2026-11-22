export {
  ACTIVE_TERRAIN_RULE_INTENSITY,
  type TerrainFeatureKind,
  type TerrainFeatureSample,
  type TerrainFeatureWorld,
  terrainFeatureAt,
  terrainFeatureSamplerFor,
} from "./map/features";
export {
  type GeneratedMap,
  generateMap,
  type MapAffordances,
  mapSizeForMission,
} from "./map/generator";
export { fbm, hashNoise, mixSalt, valueNoise, warpedFbm } from "./map/noise";
export {
  describeMap,
  featureEdgeMask,
  isMountainScenery,
  MAP_SKIRT,
  MAP_SKIRT_ALPHA,
  outsideDist,
  type ScenerySample,
  type SceneryWorld,
  sceneryAt,
  skirtAlpha,
  skirtSample,
  winNeedsMarked,
} from "./map/scenery";
export {
  carveRoute,
  flattenArea,
  idx,
  inBounds,
  meanderingRoute,
  neighbors8,
  paintBase,
  pruneWaterIslands,
  reachable,
  relaxHeights,
  smoothWater,
} from "./map/terrain";
