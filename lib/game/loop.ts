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
  extraAvailableTicks = 0,
): { ticks: number; acc: number } {
  const normalAvailable = Math.max(0, Math.floor(acc / tickMs));
  const available = normalAvailable + Math.max(0, extraAvailableTicks);
  const frameCap = available > maxTicks ? Math.max(maxTicks, MAX_CATCH_UP_TICKS_PER_FRAME) : maxTicks;
  const ticks = Math.min(available, frameCap);
  const fromAcc = Math.min(normalAvailable, ticks);
  return { ticks, acc: Math.max(0, acc - fromAcc * tickMs) };
}

export type LoopHandle = {
  stop: () => void;
};

export type SimulationStep = (state: SimState, commands?: Command[]) => { state: SimState; events: SimEvent[] };

export type FrameTiming = {
  /** Synchronous loop work, including simulation, presentation, persistence, and drawing. */
  workMs: number;
  /** Time between animation callbacks, including browser/UI work between them. */
  intervalMs: number;
};

export type LoopOptions = {
  getState: () => SimState;
  setState: (s: SimState) => void;
  drainCommands: () => Command[];
  step: SimulationStep;
  isPaused?: () => boolean;
  canStep?: (state: SimState) => boolean;
  getExtraTicks?: (state: SimState) => number;
  onFrame?: (now: number, state: SimState, paused: boolean, subTickAlpha: number, frameMs: number) => void;
  onTick?: (state: SimState, events: SimEvent[], now: number) => void;
  onEvents?: (events: SimEvent[]) => void;
  onFrameTiming?: (timing: FrameTiming) => void;
};

export function startLoop({
  getState,
  setState,
  drainCommands,
  step,
  isPaused,
  canStep,
  getExtraTicks,
  onFrame,
  onTick,
  onEvents,
  onFrameTiming,
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
    const startedAt = onFrameTiming ? performance.now() : 0;
    const frameMs = Math.max(0, now - last);
    const finishFrame = () => {
      onFrameTiming?.({ workMs: performance.now() - startedAt, intervalMs: frameMs });
      raf = requestAnimationFrame(frame);
    };
    const paused = isPaused?.() ?? false;
    let state = getState();
    if (paused) {
      acc = 0;
      last = now;
      onFrame?.(now, state, true, 0, 0);
      finishFrame();
      return;
    }
    acc = Math.min(acc + frameMs, MAX_ACCUMULATOR_CAP_MS);
    last = now;
    const extraTicks = getExtraTicks ? getExtraTicks(state) : 0;
    const preBudgetAcc = acc;
    const budget = frameTickBudget(acc, TICK_MS, MAX_TICKS_PER_FRAME, extraTicks);
    const deductedFromAcc = Math.max(0, Math.round((preBudgetAcc - budget.acc) / TICK_MS));
    acc = budget.acc;
    for (let i = 0; i < budget.ticks && state.result === "playing"; i++) {
      if (canStep && !canStep(state)) {
        const unsteppedFromAcc = Math.max(0, deductedFromAcc - i);
        acc += unsteppedFromAcc * TICK_MS;
        break;
      }
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
    finishFrame();
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
