import type { Command, SimState } from "../types";
import { tick, type TickOptions } from "./api";

export type ScenarioTickResult = ReturnType<typeof tick>;

export type ScenarioRunOptions = {
  /** Maximum number of simulation ticks to execute, with no wall-clock pacing. */
  maxTicks: number;
  commandsForTick?: (state: SimState) => Command[] | undefined;
  /** Runs immediately before each tick; useful for deadlines and cancellation. */
  beforeTick?: (state: SimState) => void;
  onCommands?: (state: SimState, commands: Command[] | undefined) => void;
  onTick?: (state: SimState, result: ScenarioTickResult) => void;
};

export type ScenarioRunResult = {
  state: SimState;
  ticksRun: number;
  stopReason: "terminal" | "tickLimit";
};

export type ScenarioRunner = {
  readonly state: SimState;
  step: (commands?: Command[]) => ScenarioTickResult;
  run: (options: ScenarioRunOptions) => ScenarioRunResult;
};

/**
 * Runs one deterministic simulation state either a tick at a time or in an
 * unpaced headless loop. Frame timing remains the caller's responsibility.
 */
export function createScenarioRunner(initialState: SimState, tickOptions: TickOptions = {}): ScenarioRunner {
  let state = initialState;

  const step = (commands?: Command[]): ScenarioTickResult => {
    const result = tick(state, commands, tickOptions);
    state = result.state;
    return result;
  };

  const run = (options: ScenarioRunOptions): ScenarioRunResult => {
    const maxTicks = Math.max(0, Math.floor(options.maxTicks));
    let ticksRun = 0;
    while (ticksRun < maxTicks && state.result === "playing") {
      options.beforeTick?.(state);
      const commands = options.commandsForTick?.(state);
      options.onCommands?.(state, commands);
      const result = step(commands);
      ticksRun += 1;
      options.onTick?.(state, result);
    }
    return {
      state,
      ticksRun,
      stopReason: state.result === "playing" ? "tickLimit" : "terminal",
    };
  };

  return {
    get state() {
      return state;
    },
    step,
    run,
  };
}
