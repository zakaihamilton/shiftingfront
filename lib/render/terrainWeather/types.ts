export type WeatherKind = "snow" | "ash" | "dust" | "ember" | "pollen" | "mist";

export type WeatherParticle = {
  x: number;
  y: number;
  size: number;
  alpha: number;
  color: string;
  rotation: number;
  trail: number;
};

export type WaterCaustic = {
  offset: number;
  alpha: number;
  phase: number;
};

export type FxTileIndex = {
  water: number[];
  ore: number[];
  oreValidatedTick: number;
  width: number;
  height: number;
};
