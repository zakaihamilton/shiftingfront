import { createRng } from "../seed/rng";
import type { WorldSetting } from "../types";
import { genBiome, genConflict, genEra, genPlace, genTone } from "./names";

export function generateWorld(seed: number): WorldSetting {
  const masterRng = createRng(seed, "world");
  masterRng.int(12);
  masterRng.int(12);
  masterRng.int(8);
  masterRng.int(8);
  masterRng.int(6);
  const biome = genBiome(masterRng);

  const rng = createRng(seed, "world");
  return {
    name: genPlace(rng, biome),
    tone: genTone(rng),
    conflict: genConflict(rng),
    era: genEra(rng),
    biome,
  };
}
