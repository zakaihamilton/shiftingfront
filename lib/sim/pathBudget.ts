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

export function resetPathBudget(state: SimState, limit = PATH_BUDGET_PER_TICK): void {
  state.pathBudget = { remaining: limit, used: 0 };
}

export function backgroundPathSearches(state?: SimState): number {
  return state?.pathBudget?.used ?? 0;
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
  const budget = state.pathBudget ?? (state.pathBudget = { remaining: PATH_BUDGET_PER_TICK, used: 0 });
  if (budget.remaining <= 0) return undefined;
  budget.remaining -= 1;
  budget.used += 1;
  return findPath(state, from, to, opts);
}

export function tryFindPathDetailed(
  state: SimState,
  from: Vec2,
  to: Vec2,
  opts?: FindPathOptions,
): PathSearchResult | undefined {
  const budget = state.pathBudget ?? (state.pathBudget = { remaining: PATH_BUDGET_PER_TICK, used: 0 });
  if (budget.remaining <= 0) return undefined;
  budget.remaining -= 1;
  budget.used += 1;
  return findPathDetailed(state, from, to, opts);
}
