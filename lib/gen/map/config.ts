import type { BiomeName } from "../../types";

export function biomeTuning(biome: BiomeName): {
  water: number;
  blockers: number;
  mountain: number;
} {
  switch (biome) {
    case "salt marshes":
      return { water: 0.38, blockers: 0.79, mountain: 0.82 };
    case "glass desert":
      return { water: 0.19, blockers: 0.84, mountain: 0.72 };
    case "rust canyons":
      return { water: 0.22, blockers: 0.78, mountain: 0.66 };
    case "tundra grid":
      return { water: 0.3, blockers: 0.83, mountain: 0.72 };
    case "jungle wreckage":
      return { water: 0.31, blockers: 0.69, mountain: 0.77 };
    case "volcanic shelf":
      return { water: 0.25, blockers: 0.75, mountain: 0.67 };
    case "crystal flats":
      return { water: 0.24, blockers: 0.8, mountain: 0.78 };
    default:
      return { water: 0.27, blockers: 0.81, mountain: 0.73 };
  }
}
