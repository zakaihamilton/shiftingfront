import type { Vec2 } from "../types";
import type { SimState } from "../types";
import { findPath, findPathDetailed, type FindPathOptions, type PathSearchResult } from "./pathfinding";

/**
 * Shared background search cap for one sim tick: movement detours, combat chase,
 * and AI repath. Foreground orders use the bounded foreground cap, while all
 * background and harvester replans spend this shared pool.
 */
export const PATH_BUDGET_PER_TICK = 6;
export const FOREGROUND_PATHS_PER_ORDER = 24;
export const FOREGROUND_PATH_MAX_NODES = 128;

let used = 0;
let defaultLimit = PATH_BUDGET_PER_TICK;

export function resetPathBudget(stateOrLimit?: SimState | number, limit = PATH_BUDGET_PER_TICK): void {
  let targetState: SimState | undefined;
  let targetLimit = limit;
  if (typeof stateOrLimit === "number") {
    targetLimit = stateOrLimit;
  } else if (stateOrLimit && typeof stateOrLimit === "object") {
    targetState = stateOrLimit;
  }
  if (targetState) {
    targetState.pathBudget = { remaining: targetLimit, used: 0 };
  }
  defaultLimit = targetLimit;
  used = 0;
}

export function backgroundPathSearches(state?: SimState): number {
  if (state?.pathBudget) return state.pathBudget.used;
  return used;
}

/**
 * Spend one slot from the per-tick pool. Returns `undefined` when the budget is
 * exhausted so callers (AI, combat, crowded detours) keep the unit's prior path.
 */
export function tryFindPath(
  state: SimState,
  from: Vec2,
  to: Vec2,
  opts?: FindPathOptions,
): Vec2[] | undefined {
  const budget = state.pathBudget ?? (state.pathBudget = { remaining: defaultLimit, used: 0 });
  if (budget.remaining <= 0) return undefined;
  budget.remaining -= 1;
  budget.used += 1;
  used = budget.used;
  return findPath(state, from, to, opts);
}

export function tryFindPathDetailed(
  state: SimState,
  from: Vec2,
  to: Vec2,
  opts?: FindPathOptions,
): PathSearchResult | undefined {
  const budget = state.pathBudget ?? (state.pathBudget = { remaining: defaultLimit, used: 0 });
  if (budget.remaining <= 0) return undefined;
  budget.remaining -= 1;
  budget.used += 1;
  used = budget.used;
  return findPathDetailed(state, from, to, opts);
}
