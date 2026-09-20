import type { BiomeName } from "../types";
import { mixHex } from "./tilePalette";
import type { BlockerPropKind } from "./terrainDecorKinds";
import {
  type BlockerTone,
  type PropPrim,
  boulderPrims,
  cactusPrims,
  crystalPrims,
  deadShrubPrims,
  desertTreePrims,
  deadTreePrims,
  lushBiome,
  pinePrims,
  sandstonePrims,
  spirePrims,
  treePrims,
  wreckagePrims,
} from "./blockerProps";

export function blockerPropPrims(
  kind: BlockerPropKind,
  v: number,
  tone: BlockerTone,
  biome: BiomeName,
): PropPrim[] {
  const lush = lushBiome(biome);
  const prims = (() => {
    switch (kind) {
    case "tree":
      return treePrims(v, tone, biome);
    case "pine":
      return pinePrims(v, tone, biome === "tundra grid");
    case "deadTree":
      return deadTreePrims(v, tone);
    case "crystalOutcrop":
      return crystalPrims(v, tone);
    case "wreckage":
      return wreckagePrims(v, tone);
    case "spire":
      return spirePrims(v, tone);
    case "deadShrub":
      return deadShrubPrims(v, tone);
    case "desertTree":
      return desertTreePrims(v, tone);
    case "cactus":
      return cactusPrims(v, tone);
    case "sandstone":
      return sandstonePrims(v, tone);
    case "snowRock":
      return boulderPrims(v, tone, false, true);
    case "boulder":
      return boulderPrims(v, tone, lush, false);
    }
  })();
  const shadowColor = mixHex(tone.dark, tone.blocked, 0.42);
  return prims.map((prim, index) => index === 0 && prim.k === "ell"
    ? { ...prim, fill: shadowColor, alpha: Math.min(prim.alpha ?? 1, 0.22) }
    : prim);
}

export * from "./blockerProps";
