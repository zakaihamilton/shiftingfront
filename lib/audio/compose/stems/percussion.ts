import type { Rng } from "../../../seed/rng";
import type { MusicDrumEvent, MusicStyleName } from "../types";
import { drumEvent } from "../helpers";

export function placeStylePercussion(
  drums: MusicDrumEvent[],
  origin: number,
  name: MusicStyleName,
  drumGain: number,
  dropHats: boolean,
  rng?: Rng,
): void {
  if (name === "break-wire" || name === "disco-command" || name === "dune-cipher") {
    if (!dropHats) {
      for (const step of [2, 6, 10, 14]) drumEvent(drums, origin + step, "shaker", 0.28 * drumGain, false, rng);
    }
  }
  if (name === "break-wire" || name === "dune-cipher") {
    for (const step of [3, 11]) drumEvent(drums, origin + step, "rim", 0.34 * drumGain, false, rng);
  }
  if (name === "disco-command") {
    drumEvent(drums, origin + 10, "rim", 0.3 * drumGain, false, rng);
  }
}
