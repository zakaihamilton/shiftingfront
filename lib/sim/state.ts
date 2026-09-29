import type { SimState } from "../types";
import { emptyRoleCounts } from "./world";

export function createBaseState(
  overrides: Pick<SimState, "seed" | "missionIndex" | "width" | "height" | "tiles" | "heights" | "surfaces" | "biome" | "resourceAmount" | "fog" | "credits" | "win" | "rngState" | "factions" | "missionName">,
): SimState {
  return {
    tick: 0,
    navigationRevision: 0,
    entities: [],
    productionQueues: {},
    activeProducerIds: {},
    nextId: 1,
    creditsEarned: overrides.factions.map(() => 0),
    unitsProduced: overrides.factions.map(() => 0),
    unitsProducedByRole: emptyRoleCounts(),
    buildingsCompleted: overrides.factions.map(() => 0),
    buildingsCompletedByKind: {},
    losses: { units: overrides.factions.map(() => 0), buildings: overrides.factions.map(() => 0) },
    result: "playing",
    aiContacts: {},
    controlGroups: {},
    ...overrides,
  };
}
