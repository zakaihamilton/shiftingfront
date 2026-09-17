import { TICKS_PER_SECOND } from "../catalog";
import { formatMissionClockFromTicks } from "../gen/pacing";
import { fogAt } from "../sim/fog";
import { objectivePriorityFor, objectiveProgress, secondaryProgress, type ObjectiveProgress, type ObjectivePriority } from "../sim/objectives";
import type { MissionRuntime, SimState } from "../types";

export type ObjectiveCardStatus = "active" | "complete" | "failed";
export type DeadlineUrgency = "normal" | "watch" | "urgent" | "critical";

export type ObjectiveCardModel = {
  id: string;
  label: string;
  current: number;
  target: number;
  status: ObjectiveCardStatus;
  priority?: ObjectivePriority;
  primary?: boolean;
};

export type { ObjectivePriority } from "../sim/objectives";

export function phaseLabel(runtime?: MissionRuntime): string | undefined {
  if (!runtime) return undefined;
  if (runtime.phase === "extraction") return "Extraction phase";
  if (runtime.phase === "complete") return "Operation complete";
  return "Operation active";
}

export function deadlineUrgency(timeRemainingTicks?: number): DeadlineUrgency {
  if (timeRemainingTicks === undefined) return "normal";
  if (timeRemainingTicks <= 10 * TICKS_PER_SECOND) return "critical";
  if (timeRemainingTicks <= 30 * TICKS_PER_SECOND) return "urgent";
  if (timeRemainingTicks <= 60 * TICKS_PER_SECOND) return "watch";
  return "normal";
}

export function formatObjectiveProgress(progress: ObjectiveProgress): string {
  if (progress.target <= 0) return progress.label;
  return `${progress.label} · ${Math.min(progress.current, progress.target)} / ${progress.target}`;
}

function objectiveCardLabel(progress: ObjectiveProgress): string {
  return progress.label.replace(/\s+\d+\s*\/\s*\d+\s*$/, "");
}

export function objectiveCardsFor(state: SimState): ObjectiveCardModel[] {
  const primary = objectiveProgress(state);
  const primaryComplete = state.result === "won" || (primary.target > 0 && primary.current >= primary.target);
  const primaryFailed = state.result === "lost";
  return [
    {
      id: "primary",
      label: objectiveCardLabel(primary),
      current: primary.current,
      target: primary.target,
      status: primaryFailed ? "failed" : primaryComplete ? "complete" : "active",
      priority: "primary",
      primary: true,
    },
    ...secondaryProgress(state).map((objective) => ({
      id: objective.id,
      label: objective.label,
      current: objective.completed ? 1 : 0,
      target: 1,
      priority: objectivePriorityFor(objective.id),
      status: objective.failed ? "failed" as const : objective.completed ? "complete" as const : "active" as const,
    })),
  ];
}

export function timeRemainingLabel(timeRemainingTicks?: number): string | undefined {
  return timeRemainingTicks === undefined
    ? undefined
    : formatMissionClockFromTicks(Math.max(0, timeRemainingTicks));
}

export function missionTimeLimitTicks(state: SimState): number | undefined {
  if (state.runtime?.deadline !== undefined) return state.runtime.deadline;
  const remaining = objectiveProgress(state).timeRemainingTicks;
  return remaining === undefined ? state.win.ticks : state.tick + remaining;
}

export function minimapPingFor(state: SimState, kind: "urgent" | "objective") {
  const runtime = state.runtime;
  const target = runtime?.targetIds
    ?.map((id) => state.entities.find((entity) => entity.id === id && entity.hp > 0))
    .find((entity): entity is SimState["entities"][number] =>
      entity !== undefined && fogAt(state, Math.round(entity.x), Math.round(entity.y)) === 2,
    );
  const point = target
    ?? runtime?.zone
    ?? state.entities.find((entity) => entity.owner === 1 && entity.kind === "constructionYard" && entity.hp > 0)
    ?? { x: state.width / 2, y: state.height / 2 };
  if (fogAt(state, Math.round(point.x), Math.round(point.y)) !== 2) return undefined;
  return {
    kind,
    x: Math.max(0, Math.min(1, point.x / Math.max(1, state.width - 1))),
    y: Math.max(0, Math.min(1, point.y / Math.max(1, state.height - 1))),
  };
}
