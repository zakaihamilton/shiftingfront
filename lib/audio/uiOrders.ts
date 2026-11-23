import type { Command } from "../types";
import type { BeepKind } from "./synth";

/** Maps issued orders onto a UI beep. Empty lists stay silent. Harvest wins over move. */
export function beepForCommands(commands: Command[]): BeepKind | undefined {
  if (commands.length === 0) return undefined;
  if (commands.some((command) => command.type === "harvest")) return "ackHarvest";
  if (commands.some((command) => command.type === "attack" || command.type === "attackMove"))
    return "ackAttack";
  return "ack";
}
