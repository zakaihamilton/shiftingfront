export { clearTerrainAtmosphereCache, paintTerrainAtmosphere } from "./terrainAtmosphere";

export { resetFxTileIndex } from "./terrainWeather/core";
export { oreGlint, oreSparkle, paintOreGlints } from "./terrainWeather/ore";
export type { WaterCaustic, WeatherKind, WeatherParticle } from "./terrainWeather/types";
export {
  paintWaterFx,
  visibleFxTileCoords,
  waterCaustic,
  waterFxNeedsClip,
} from "./terrainWeather/water";
export {
  paintTerrainWeather,
  weatherKindForBiome,
  weatherParticleAt,
} from "./terrainWeather/weather";
