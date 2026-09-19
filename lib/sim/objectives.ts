import { isAirUnit, labelFor, TICKS_PER_SECOND } from "../catalog";
import type { Entity, InspectReport, MissionRuntime, SimEvent, SimState } from "../types";
import { formatSeed } from "../seed/rng";
import { formatMissionClock, formatMissionClockFromTicks } from "../gen/pacing";
import { livingView } from "./world";
import { DEADLINE_SCENARIO_KINDS, scenarioDefinitionFor } from "./scenarios";

export function formatHoldClock(seconds: number): string {
  return formatMissionClock(seconds);
}

export type ObjectiveProgress = {
  current: number;
  target: number;
  label: string;
  timeRemainingTicks?: number;
  phase?: MissionRuntime["phase"];
};

export type SecondaryProgress = {
  id: string;
  label: string;
  completed: boolean;
  failed: boolean;
};

export type ObjectivePriority = "primary" | "optional";

/** Presentation classification for legacy secondary-objective records. */
export function objectivePriorityFor(id: string): ObjectivePriority {
  return id === "yard" || id === "time" || id === "target" || id === "scenario-target" ? "primary" : "optional";
}

function timeRemainingTicks(state: SimState): number | undefined {
  if (state.runtime) {
    if (state.runtime.deadline !== undefined) return Math.max(0, state.runtime.deadline - state.tick);
    const deadline = scenarioDefinitionFor(state.runtime.kind).deadline(state);
    if (deadline !== undefined) return Math.max(0, deadline - state.tick);
  }
  if (["escort", "sabotage", "rescue", "extraction"].includes(state.win.kind) && state.win.ticks !== undefined) {
    return Math.max(0, state.win.ticks - state.tick);
  }
  if (state.win.kind === "holdTheLine" && state.win.ticks !== undefined) return Math.max(0, state.win.ticks - state.tick);
  return undefined;
}

const DEADLINE_WARNING_SECONDS = [60, 30, 10] as const;

function isOperationalEnemy(entity: Entity): boolean {
  return !(
    entity.class === "unit"
    && isAirUnit(entity.kind)
    && entity.flightState === "airborne"
    && (entity.ammo ?? 0) <= 0
    && entity.assignedRunwayId === undefined
  );
}

function deadlineWarningEvent(state: SimState): SimEvent | undefined {
  if (!state.runtime || !DEADLINE_SCENARIO_KINDS.includes(state.runtime.kind)) return undefined;
  const remaining = timeRemainingTicks(state);
  if (remaining === undefined) return undefined;
  if (!DEADLINE_WARNING_SECONDS.some((seconds) => remaining === seconds * TICKS_PER_SECOND)) return undefined;
  return { type: "deadlineWarning", remainingTicks: remaining };
}

export function secondaryProgress(state: SimState): SecondaryProgress[] {
  return (state.runtime?.secondary ?? []).map((objective) => {
    // A time secondary is tracked as "on pace" in the runtime while a mission
    // is active, but it is only a completed result when the primary operation
    // also wins. Otherwise a failed mission could report that it completed its
    // operation within the limit simply because the player lost early.
    const completed = objective.completed === true && (
      objective.kind !== "completeBefore" || state.result === "won"
    );
    return {
      id: objective.id,
      label: objective.label,
      completed,
      failed: !completed && (
        state.result === "lost"
        || (objective.kind === "completeBefore" && objective.target !== undefined && state.tick >= objective.target)
      ),
    };
  });
}

export function objectiveProgress(state: SimState): ObjectiveProgress {
  const w = state.win;
  const scenarioProgress = scenarioDefinitionFor(w.kind).progress(state);
  if (scenarioProgress) {
    return { ...scenarioProgress, timeRemainingTicks: timeRemainingTicks(state), phase: state.runtime?.phase };
  }
  let progress: { current: number; target: number; label: string };
  switch (w.kind) {
    case "harvestQuota":
      progress = {
        current: state.creditsEarned[0],
        target: w.target ?? 0,
        label: `Extracted ${state.creditsEarned[0]} / ${w.target}`,
      };
      break;
    case "forceQuota": {
      const current = w.role ? (state.unitsProducedByRole[w.role] ?? 0) : state.unitsProduced[0];
      progress = {
        current,
        target: w.target ?? 0,
        label: w.role
          ? `${labelFor(w.role)} ${current} / ${w.target}`
          : `Units built ${current} / ${w.target}`,
      };
      break;
    }
    case "structureQuota": {
      const current = w.building
        ? (state.buildingsCompletedByKind[w.building] ?? 0)
        : state.buildingsCompleted[0];
      progress = {
        current,
        target: w.target ?? 0,
        label: w.building
          ? `${labelFor(w.building)} ${current} / ${w.target}`
          : `Buildings ${current} / ${w.target}`,
      };
      break;
    }
    case "razeAll": {
  const left = livingView(state).filter((e) => e.owner === 1 && e.class === "building").length;
      progress = { current: left === 0 ? 1 : 0, target: 1, label: left === 0 ? "All structures down" : `Enemy buildings left ${left}` };
      break;
    }
    case "decapitate": {
      const cy = livingView(state).some((e) => e.owner === 1 && e.kind === "constructionYard");
      progress = { current: cy ? 0 : 1, target: 1, label: cy ? `Destroy the enemy ${labelFor("constructionYard")}` : `${labelFor("constructionYard")} destroyed` };
      break;
    }
    case "annihilate": {
      const left = livingView(state).filter((e) => e.owner === 1 && isOperationalEnemy(e)).length;
      progress = { current: left === 0 ? 1 : 0, target: 1, label: left === 0 ? "Campaign clear" : `Hostiles left ${left}` };
      break;
    }
    case "holdTheLine": {
      if (w.ticks === undefined) {
        progress = { current: 0, target: 0, label: "Training range — no time limit" };
        break;
      }
      const t = w.ticks;
      const left = Math.max(0, t - state.tick);
      progress = {
        current: Math.min(state.tick, t),
        target: t,
        label: left <= 0 ? "Held" : `Hold ${formatMissionClockFromTicks(left)} remaining`,
      };
      break;
    }
    default:
      progress = { current: 0, target: 1, label: "Unknown" };
  }
  return { ...progress, timeRemainingTicks: timeRemainingTicks(state), phase: state.runtime?.phase };
}

const EMPTY_EVENTS: SimEvent[] = [];

function objectiveEvents(eventSink: SimEvent[] | undefined, events: SimEvent[], collectEvents: boolean): SimEvent[] {
  if (!collectEvents) return EMPTY_EVENTS;
  if (eventSink) {
    eventSink.push(...events);
    return EMPTY_EVENTS;
  }
  return events;
}

export function evaluateObjectives(state: SimState, eventSink?: SimEvent[], collectEvents = true): SimEvent[] {
  if (state.result !== "playing") return EMPTY_EVENTS;
  const playerCy = livingView(state).some((e) => e.owner === 0 && e.kind === "constructionYard");
  if (!playerCy) {
    state.result = "lost";
    state.lossReason = "yardDestroyed";
    if (state.runtime) state.runtime.phase = "complete";
    return objectiveEvents(eventSink, [{ type: "lost" }], collectEvents);
  }

  const w = state.win;
  const scenarioComplete = scenarioDefinitionFor(w.kind).isComplete(state);
  let won = scenarioComplete ?? false;
  if (scenarioComplete === undefined) switch (w.kind) {
    case "harvestQuota":
      won = state.creditsEarned[0] >= (w.target ?? Infinity);
      break;
    case "forceQuota": {
      const current = w.role ? (state.unitsProducedByRole[w.role] ?? 0) : state.unitsProduced[0];
      won = current >= (w.target ?? Infinity);
      break;
    }
    case "structureQuota": {
      const current = w.building
        ? (state.buildingsCompletedByKind[w.building] ?? 0)
        : state.buildingsCompleted[0];
      won = current >= (w.target ?? Infinity);
      break;
    }
    case "razeAll":
      won = !livingView(state).some((e) => e.owner === 1 && e.class === "building");
      break;
    case "decapitate":
      won = !livingView(state).some((e) => e.owner === 1 && e.kind === "constructionYard");
      break;
    case "annihilate":
      won = !livingView(state).some((e) => e.owner === 1 && isOperationalEnemy(e));
      break;
    case "holdTheLine":
      if (state.tick >= (w.ticks ?? Infinity) && playerCy) won = true;
      break;
    default:
      break;
  }

  if (won) {
    state.result = "won";
    if (state.runtime) state.runtime.phase = "complete";
    return objectiveEvents(eventSink, [{ type: "won" }], collectEvents);
  }

  if (state.runtime && DEADLINE_SCENARIO_KINDS.includes(state.runtime.kind)) {
    if (scenarioDefinitionFor(state.runtime.kind).targetLost(state)) {
      state.result = "lost";
      state.lossReason = "objectiveTargetLost";
      state.runtime.phase = "complete";
      return objectiveEvents(eventSink, [{ type: "lost" }], collectEvents);
    }
    const deadline = scenarioDefinitionFor(state.runtime.kind).deadline(state) ?? w.ticks;
    if (deadline !== undefined && state.tick >= deadline) {
      state.result = "lost";
      state.lossReason = "deadline";
      state.runtime.phase = "complete";
      return objectiveEvents(eventSink, [{ type: "objectiveExpired", kind: state.runtime.kind }, { type: "lost" }], collectEvents);
    }
  }
  const warning = deadlineWarningEvent(state);
  return warning ? objectiveEvents(eventSink, [warning], collectEvents) : EMPTY_EVENTS;
}

export function inspect(state: SimState): InspectReport {
  const obj = objectiveProgress(state);
  const units = livingView(state).filter((e) => e.class === "unit");
  const buildings = livingView(state).filter((e) => e.class === "building");
  return {
    seed: formatSeed(state.seed),
    missionIndex: state.missionIndex,
    tick: state.tick,
    credits: state.credits[0],
    creditsEarned: state.creditsEarned[0],
    units: {
      player: units.filter((e) => e.owner === 0).length,
      enemy: units.filter((e) => e.owner === 1).length,
    },
    buildings: {
      player: buildings.filter((e) => e.owner === 0).length,
      enemy: buildings.filter((e) => e.owner === 1).length,
    },
    objective: {
      kind: state.win.kind,
      label: obj.label,
      current: obj.current,
      target: obj.target,
    },
    result: state.result,
  };
}
