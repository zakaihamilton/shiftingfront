import type { SimEvent, SimState } from "../types";
import { tickAi } from "./ai";
import { tickCombat } from "./combat";
import { tickEconomy } from "./economy";
import { tickFog } from "./fog";
import { applyCommands } from "./orders";
import { evaluateObjectives } from "./objectives";
import { tickProduction } from "./production";
import { tickRepair } from "./repair";
import { tickSupport } from "./support";
import { ensureMissionDirector, tickMissionDirector } from "./director";
import { tickScenario } from "./scenarios";
import { compactDestroyedEntities } from "./world";
import { tickMovement } from "./movement";
import { advanceTutorialAfterTick } from "./tutorialStage";

export type SimulationTickOptions = {
  evaluateObjectives?: boolean;
  /** Skip presentation-only event construction for headless simulation. */
  collectEvents?: boolean;
  /** Skip fog updates when no renderer consumes the state. */
  updateFog?: boolean;
};

export type SimulationTickContext = {
  state: SimState;
  events?: SimEvent[];
  collectEvents: boolean;
  options: SimulationTickOptions;
  emit: (events: SimEvent[] | undefined) => void;
};

export type SimulationSystemId =
  | "production"
  | "economy"
  | "movement"
  | "combat"
  | "tutorial"
  | "repair"
  | "support"
  | "director"
  | "ai"
  | "fog"
  | "clock"
  | "scenario"
  | "objectives"
  | "cleanup";

export type SimulationSystem = {
  id: SimulationSystemId;
  run: (context: SimulationTickContext) => void;
};

const runWithEvents = (
  context: SimulationTickContext,
  run: (state: SimState, events?: SimEvent[], collectEvents?: boolean) => SimEvent[],
) => context.emit(run(context.state, context.events, context.collectEvents));

/** The canonical order of authoritative state transitions for one simulation tick. */
export const SIMULATION_SYSTEMS: readonly SimulationSystem[] = [
  { id: "production", run: (context) => runWithEvents(context, tickProduction) },
  { id: "economy", run: (context) => runWithEvents(context, tickEconomy) },
  { id: "movement", run: ({ state }) => tickMovement(state) },
  { id: "combat", run: (context) => runWithEvents(context, tickCombat) },
  { id: "tutorial", run: ({ state }) => advanceTutorialAfterTick(state) },
  { id: "repair", run: (context) => runWithEvents(context, tickRepair) },
  { id: "support", run: (context) => runWithEvents(context, tickSupport) },
  { id: "director", run: (context) => runWithEvents(context, tickMissionDirector) },
  { id: "ai", run: ({ state }) => tickAi(state) },
  { id: "fog", run: ({ state, options }) => { if (options.updateFog !== false) tickFog(state); } },
  { id: "clock", run: ({ state }) => { state.tick += 1; } },
  { id: "scenario", run: (context) => runWithEvents(context, tickScenario) },
  {
    id: "objectives",
    run: (context) => {
      if (context.options.evaluateObjectives !== false) {
        runWithEvents(context, evaluateObjectives);
      }
    },
  },
  { id: "cleanup", run: ({ state }) => compactDestroyedEntities(state) },
];

export function createSimulationTickContext(
  state: SimState,
  events: SimEvent[] | undefined,
  options: SimulationTickOptions,
): SimulationTickContext {
  return {
    state,
    events,
    collectEvents: options.collectEvents !== false,
    options,
    emit(nextEvents) {
      if (!events || !nextEvents?.length) return;
      events.push(...nextEvents);
    },
  };
}

export function runSimulationSystems(
  context: SimulationTickContext,
  systems: readonly SimulationSystem[] = SIMULATION_SYSTEMS,
): void {
  for (const system of systems) system.run(context);
}

/** Apply queued player intent before the authoritative system pipeline. */
export function applyQueuedCommands(state: SimState, commands: Parameters<typeof applyCommands>[1] | undefined): SimEvent[] {
  return commands?.length ? applyCommands(state, commands) : [];
}

/** Ensures mission-director state exists for callers that construct custom states. */
export function ensureSimulationDirector(state: SimState): void {
  ensureMissionDirector(state);
}
