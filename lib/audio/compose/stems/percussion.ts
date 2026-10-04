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
      for (const step of [6, 14]) drumEvent(drums, origin + step, "shaker", 0.16 * drumGain, false, rng);
    }
  }
  if (name === "break-wire" || name === "dune-cipher") {
    drumEvent(drums, origin + 11, "rim", 0.22 * drumGain, false, rng);
  }
  if (name === "disco-command") {
    drumEvent(drums, origin + 10, "rim", 0.2 * drumGain, false, rng);
  }
}
