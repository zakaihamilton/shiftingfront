import { createRng, rngFromState, type Rng } from "../seed/rng";
import type { BiomeName, Faction, Palette } from "../types";
import { genFactionPair } from "./names";

// Keep faction palettes on a stable stream, regardless of adjective pool size.
// This reserves the prior biome-aware naming budget: 13 adjective-shuffle and
// 11 faction-title-shuffle draws after the two hue draws.
const PALETTE_STREAM_RESERVED_DRAWS = 24;

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h} ${s}% ${l}%)`;
}

function paletteFromHue(h: number, rng: Rng): Palette {
  const s = 48 + rng.int(30);
  return {
    primary: hsl(h, s, 42),
    secondary: hsl((h + 40) % 360, s - 10, 28),
    accent: hsl((h + 180) % 360, 70, 55),
    outline: hsl(h, 20, 10),
    light: hsl(h, s - 15, 72),
    dark: hsl(h, s, 16),
  };
}

export function generateFactions(seed: number, biome?: BiomeName): [Faction, Faction] {
  const rng = createRng(seed, "factions");
  const h1 = rng.int(360);
  let h2 = (h1 + 120 + rng.int(80)) % 360;
  if (Math.abs(h1 - h2) < 40) h2 = (h1 + 180) % 360;

  const nameRng = rngFromState(rng.state);
  const [nameA, nameB] = genFactionPair(nameRng, biome);

  const paletteRng = rngFromState(rng.state);
  for (let i = 0; i < PALETTE_STREAM_RESERVED_DRAWS; i++) paletteRng.next();
  const a = paletteRng.fork("0");
  const b = paletteRng.fork("1");
  return [
    {
      id: 0,
      name: nameA,
      adjective: a.pick(["allied", "loyal", "vanguard", "home"]),
      palette: paletteFromHue(h1, a),
    },
    {
      id: 1,
      name: nameB,
      adjective: b.pick(["hostile", "rival", "occupying", "rogue"]),
      palette: paletteFromHue(h2, b),
    },
  ];
}
