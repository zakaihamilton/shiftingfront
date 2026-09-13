import { profileContractFor, resolveMissionProfile } from "../gen/profile";
import type { SimState } from "../types";

export type DoctrineHint = {
  id: "power" | "counters" | "support" | "routes" | "secondary";
  label: string;
  text: string;
};

/** Short, non-blocking doctrine prompts for the first live minutes of a mission. */
export function doctrineHintsFor(state: SimState): DoctrineHint[] {
  const resolvedProfile = resolveMissionProfile(state.seed, state.missionIndex, state.win.kind);
  const profile = profileContractFor(resolvedProfile);
  const hints: DoctrineHint[] = [
    {
      id: "power",
      label: "Power",
      text: "Keep the grid positive before queueing production; a shortage pauses the whole plan.",
    },
  ];
  if (state.missionIndex >= 1) {
    hints.push({
      id: "counters",
      label: "Counters",
      text: "Infantry handles light targets, anti-armor answers vehicles, and tanks pressure structures.",
    });
  }
  const profileVariant = resolvedProfile.variant;
  if (state.missionIndex >= 2 || ["siege", "concentratedWaves"].includes(profileVariant)) {
    hints.push({
      id: "support",
      label: "Support",
      text: "Medics restore human units and Repair Trucks restore vehicles; assign them before replacing a damaged force.",
    });
  }
  if (["escort", "rescue", "extraction", "sabotage"].includes(state.win.kind) || profile.routeHint) {
    hints.push({ id: "routes", label: "Routes", text: profile.routeHint });
  }
  if ((state.runtime?.secondary.length ?? 0) > 0) {
    hints.push({
      id: "secondary",
      label: "Secondary",
      text: "Bonus orders reward preservation and timing; they are valuable, but never block the primary objective.",
    });
  }
  return hints;
}
