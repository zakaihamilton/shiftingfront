import type { Entity, SimState } from "../../types";
import type { ScenarioProgress } from "./contract";
import { formatMissionClockFromTicks } from "../../gen/pacing";
import { entitiesFor } from "../ecs/world";

export function isEntityAlive(state: SimState, id: number): boolean {
  return entitiesFor(state).some((entity) => entity.id === id && entity.hp > 0);
}

export type EliminationOptions = {
  targetIds?: readonly number[];
  filter?: (entity: Entity) => boolean;
  label?: string;
  fallbackToCount?: boolean;
};

export type EliminationResult = {
  isComplete: boolean;
  current: number;
  target: number;
  progress?: ScenarioProgress;
};

/**
 * Evaluates elimination objectives.
 * Supports explicit target IDs (destroyMarked, sabotage) or entity filter predicates (razeAll, decapitate, annihilate).
 */
export function evaluateElimination(state: SimState, options: EliminationOptions): EliminationResult {
  if (options.targetIds !== undefined) {
    const ids = options.targetIds;
    const defeatedCount = ids.filter((id) => !isEntityAlive(state, id)).length;
    const targetCount = options.fallbackToCount
      ? ids.length || state.win.targetCount || 1
      : ids.length;
    const isComplete = ids.length > 0 && ids.every((id) => !isEntityAlive(state, id));
    const label = options.label ?? "Targets";
    return {
      isComplete,
      current: defeatedCount,
      target: targetCount,
      progress: {
        current: defeatedCount,
        target: targetCount,
        label: `${label} ${defeatedCount} / ${targetCount}`,
      },
    };
  }

  if (options.filter) {
    const living = entitiesFor(state).filter((e) => e.hp > 0 && options.filter!(e));
    const isComplete = living.length === 0;
    return {
      isComplete,
      current: isComplete ? 1 : 0,
      target: 1,
    };
  }

  return { isComplete: false, current: 0, target: 1 };
}

export type ExtractionEscortResult = {
  isComplete: boolean;
  isTargetLost: boolean;
  progress: ScenarioProgress;
};

/**
 * Unifies lifecycle evaluation (progress, victory check, target-loss check)
 * for escort, rescue, and extraction scenarios.
 */
export function evaluateExtractionEscort(state: SimState): ExtractionEscortResult {
  const runtime = state.runtime;
  const kind = state.win.kind;
  const current = runtime?.rescued ?? 0;
  const target = state.win.targetCount ?? runtime?.required ?? 1;

  let isComplete = false;
  if (kind === "rescue" && runtime?.rescuedIds !== undefined) {
    isComplete = runtime.rescuedIds.length >= (state.win.targetCount ?? runtime.required ?? Infinity);
  } else {
    isComplete = current >= (state.win.targetCount ?? runtime?.required ?? Infinity);
  }

  let isTargetLost = false;
  if (runtime) {
    if (kind === "escort") {
      isTargetLost = runtime.targetIds.some((id) => !isEntityAlive(state, id));
    } else if (kind === "extraction") {
      const extracted = new Set(runtime.extractedIds ?? []);
      isTargetLost = runtime.targetIds.some((id) => !extracted.has(id) && !isEntityAlive(state, id));
    } else if (kind === "rescue") {
      // Rescue runs track contacted and rescued IDs explicitly.
      if (runtime.contactedIds !== undefined || runtime.rescuedIds !== undefined) {
        const rescued = new Set(runtime.rescuedIds ?? []);
        isTargetLost = runtime.targetIds.some((id) => !rescued.has(id) && !isEntityAlive(state, id));
      } else {
        const required = state.win.targetCount ?? runtime.required ?? runtime.targetIds.length;
        const remaining = runtime.targetIds.filter((id) =>
          entitiesFor(state).some((entity) => entity.id === id && entity.hp > 0 && entity.neutral === true),
        ).length;
        isTargetLost = runtime.rescued + remaining < required;
      }
    }
  }

  let label = `Extracted ${current} / ${target}`;
  if (kind === "escort") {
    label = `Convoy ${current} / ${target}`;
  } else if (kind === "rescue") {
    label = runtime?.contactedIds !== undefined || runtime?.rescuedIds !== undefined
      ? `Contacted ${runtime?.contactedIds?.length ?? 0} · Returned ${current} / ${target}`
      : `Rescued ${current} / ${target}`;
  }

  return {
    isComplete,
    isTargetLost,
    progress: { current, target, label },
  };
}

export type ZoneHoldResult = {
  isComplete: boolean;
  progress: ScenarioProgress;
};

/**
 * Evaluates holdTheLine zone hold objectives.
 */
export function evaluateZoneHold(state: SimState): ZoneHoldResult {
  const t = state.win.ticks;
  const playerCy = entitiesFor(state).some((e) => e.owner === 0 && e.kind === "constructionYard" && e.hp > 0);
  if (t === undefined) {
    return {
      isComplete: false,
      progress: { current: 0, target: 0, label: "Training range — no time limit" },
    };
  }
  const isComplete = state.tick >= t && playerCy;
  const left = Math.max(0, t - state.tick);
  return {
    isComplete,
    progress: {
      current: Math.min(state.tick, t),
      target: t,
      label: left <= 0 ? "Held" : `Hold ${formatMissionClockFromTicks(left)} remaining`,
    },
  };
}

export type SabotageResult = {
  isComplete: boolean;
  isTargetLost: boolean;
  progress: ScenarioProgress;
};

/**
 * Evaluates sabotage operations.
 */
export function evaluateSabotage(state: SimState): SabotageResult {
  const ids = state.win.targetIds ?? state.runtime?.targetIds ?? [];
  const evalResult = evaluateElimination(state, {
    targetIds: ids,
    label: "Systems",
    fallbackToCount: true,
  });

  return {
    isComplete: evalResult.isComplete,
    isTargetLost: false,
    progress: evalResult.progress!,
  };
}
