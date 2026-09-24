import type { SimState } from "../../types";
import { findPathDetailed } from "../pathfinding";
import { convoyDestination } from "./escort";
import { entitiesFor } from "../entities";

export type ScenarioAffordances = {
  /** First-target aliases retained for existing callers and reports. */
  targetDepth: number;
  routeLength: number;
  targetReachable: boolean;
  /** Per-target depth and route measurements for the complete objective. */
  targetDepths: number[];
  targetRouteLengths: number[];
  maxTargetDepth: number;
  allTargetsReachable: boolean;
  /** Reachable scenarios also need bounded detours, not only a path. */
  materiallyFair: boolean;
  /** Effective route lengths after scenario-specific movement is considered. */
  effectiveRouteLengths: number[];
  effectiveRouteLength: number;
  rescueReturnRouteLength: number;
};

/** Measures the generated scenario without adding metadata to persisted state. */
export function scenarioAffordances(state: SimState): ScenarioAffordances {
  const playerYard = entitiesFor(state).find(
    (entity) => entity.owner === 0 && entity.class === "building" && entity.kind === "constructionYard" && entity.hp > 0,
  );
  const enemyYard = entitiesFor(state).find(
    (entity) => entity.owner === 1 && entity.class === "building" && entity.kind === "constructionYard" && entity.hp > 0,
  );
  const targetIds = state.runtime?.targetIds ?? [];
  const targets = targetIds.length
    ? targetIds.map((id) => entitiesFor(state).find((entity) => entity.id === id))
    : state.win.kind === "razeAll"
      ? entitiesFor(state).filter((entity) => entity.owner === 1 && entity.class === "building" && entity.hp > 0)
      : state.win.kind === "annihilate"
        ? entitiesFor(state).filter((entity) => entity.owner === 1 && entity.hp > 0)
        : [enemyYard];
  if (!playerYard || targets.length === 0 || targets.some((target) => !target)) {
    return {
      targetDepth: 0,
      routeLength: 0,
      targetReachable: false,
      targetDepths: [],
      targetRouteLengths: [],
      maxTargetDepth: 0,
      allTargetsReachable: false,
      materiallyFair: false,
      effectiveRouteLengths: [],
      effectiveRouteLength: 0,
      rescueReturnRouteLength: 0,
    };
  }

  const baseDistance = enemyYard ? Math.max(1, Math.hypot(enemyYard.x - playerYard.x, enemyYard.y - playerYard.y)) : 1;
  const resolvedTargets = targets as NonNullable<(typeof targets)[number]>[];
  const targetDepths = resolvedTargets.map((target) => Math.min(1, Math.hypot(target.x - playerYard.x, target.y - playerYard.y) / baseDistance));
  const targetRoutes = resolvedTargets.map((target) => findPathDetailed(state, playerYard, target));
  const baseRoute = enemyYard ? findPathDetailed(state, playerYard, enemyYard) : undefined;
  const baseRouteLength = baseRoute?.status === "complete" ? baseRoute.path.length : 0;
  const targetRouteLengths = targetRoutes.map((route) => route.status === "complete" ? route.path.length : 0);
  const effectiveRoutes = resolvedTargets.map((target, index) => {
    if (state.runtime?.kind === "escort" && state.runtime.zone) {
      return findPathDetailed(state, target, convoyDestination(state, state.runtime.zone, index));
    }
    return targetRoutes[index]!;
  });
  const effectiveRouteLengths = effectiveRoutes.map((route) => route.status === "complete" ? route.path.length : 0);
  const rescueReturnRoutes = state.runtime?.kind === "rescue"
    ? resolvedTargets.map((target) => findPathDetailed(state, target, playerYard))
    : [];
  const rescueReturnRouteLengths = rescueReturnRoutes.map((route) => route.status === "complete" ? route.path.length : 0);
  const allTargetsReachable = targetRoutes.every((route) => route.status === "complete") &&
    effectiveRoutes.every((route) => route.status === "complete") &&
    rescueReturnRoutes.every((route) => route.status === "complete");
  const maxMapDiagonal = Math.hypot(state.width, state.height);
  const effectiveBaseline = Math.max(baseRouteLength, maxMapDiagonal * 0.5);
  const routeBudget = baseRouteLength > 0 ? effectiveBaseline * 1.65 + 12 : Infinity;
  const materiallyFair = allTargetsReachable &&
    targetRouteLengths.every((length) => length <= routeBudget) &&
    effectiveRouteLengths.every((length) => length <= routeBudget) &&
    rescueReturnRouteLengths.every((length) => length <= routeBudget);
  const firstTargetRoute = targetRouteLengths[0] ?? 0;
  return {
    targetDepth: targetDepths[0] ?? 0,
    routeLength: firstTargetRoute,
    targetReachable: allTargetsReachable,
    targetDepths,
    targetRouteLengths,
    maxTargetDepth: Math.max(0, ...targetDepths),
    allTargetsReachable,
    materiallyFair,
    effectiveRouteLengths,
    effectiveRouteLength: Math.max(0, ...effectiveRouteLengths),
    rescueReturnRouteLength: Math.max(0, ...rescueReturnRouteLengths),
  };
}
