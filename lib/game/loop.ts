import type { Command, SimEvent, SimState } from "../types";

export const TICK_MS = 1000 / 12;
export const MAX_TICKS_PER_FRAME = 3;
export const MAX_CATCH_UP_TICKS_PER_FRAME = 12;
/** Prevents an inactive tab or freeze from accumulating an unbounded catch-up backlog. */
export const MAX_ACCUMULATOR_CAP_MS = TICK_MS * MAX_CATCH_UP_TICKS_PER_FRAME * 4;

export function frameTickBudget(
  acc: number,
  tickMs = TICK_MS,
  maxTicks = MAX_TICKS_PER_FRAME,
): { ticks: number; acc: number } {
  const available = Math.max(0, Math.floor(acc / tickMs));
  const frameCap = available > maxTicks ? Math.max(maxTicks, MAX_CATCH_UP_TICKS_PER_FRAME) : maxTicks;
  const ticks = Math.min(available, frameCap);
  return { ticks, acc: Math.max(0, acc - ticks * tickMs) };
}

export type LoopHandle = {
  stop: () => void;
};

export type SimulationStep = (state: SimState, commands?: Command[]) => { state: SimState; events: SimEvent[] };

export type LoopOptions = {
  getState: () => SimState;
  setState: (s: SimState) => void;
  drainCommands: () => Command[];
  step: SimulationStep;
  isPaused?: () => boolean;
  onFrame?: (now: number, state: SimState, paused: boolean, subTickAlpha: number, frameMs: number) => void;
  onTick?: (state: SimState, events: SimEvent[], now: number) => void;
  onEvents?: (events: SimEvent[]) => void;
};

export function startLoop({
  getState,
  setState,
  drainCommands,
  step,
  isPaused,
  onFrame,
  onTick,
  onEvents,
}: LoopOptions): LoopHandle {
  let acc = 0;
  let last = performance.now();
  let raf = 0;
  let stopped = false;

  // Browsers can pause or throttle animation frames while a window is not
  // focused. Do not let the resulting timestamp gap turn into simulation
  // catch-up when the player returns to the game.
  const resetClock = () => {
    acc = 0;
    last = performance.now();
  };
  const addWindowListener = typeof window !== "undefined";
  const addDocumentListener = typeof document !== "undefined";
  if (addWindowListener) {
    window.addEventListener("blur", resetClock);
    window.addEventListener("focus", resetClock);
  }
  if (addDocumentListener) document.addEventListener("visibilitychange", resetClock);

  const frame = (now: number) => {
    if (stopped) return;
    const paused = isPaused?.() ?? false;
    let state = getState();
    if (paused) {
      acc = 0;
      last = now;
      onFrame?.(now, state, true, 0, 0);
      raf = requestAnimationFrame(frame);
      return;
    }
    const frameMs = Math.max(0, now - last);
    acc = Math.min(acc + frameMs, MAX_ACCUMULATOR_CAP_MS);
    last = now;
    const budget = frameTickBudget(acc);
    acc = budget.acc;
    for (let i = 0; i < budget.ticks && state.result === "playing"; i++) {
      const cmds = drainCommands();
      const out = step(state, cmds.length ? cmds : undefined);
      state = out.state;
      setState(state);
      onTick?.(state, out.events, now);
      onEvents?.(out.events);
    }
    if (state.result !== "playing") acc = 0;
    const subTickAlpha = state.result === "playing" ? Math.max(0, Math.min(1, acc / TICK_MS)) : 1;
    onFrame?.(now, state, false, subTickAlpha, Math.min(frameMs, 100));
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      if (addWindowListener) {
        window.removeEventListener("blur", resetClock);
        window.removeEventListener("focus", resetClock);
      }
      if (addDocumentListener) document.removeEventListener("visibilitychange", resetClock);
    },
  };
}
