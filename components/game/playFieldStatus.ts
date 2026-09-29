import { formatMissionClockFromTicks } from "@/lib/gen/pacing";
import { profileContractFor, resolveMissionProfile } from "@/lib/gen/profile";
import { objectiveProgress, secondaryProgress } from "@/lib/sim/objectives";
import { missionObjectives, type MissionObjective } from "@/lib/gen/story";
import { missionTimeLimitTicks, objectiveCardsFor, phaseLabel } from "@/lib/ui/missionPresentation";
import { doctrineHintsFor } from "@/lib/ui/doctrine";
import type { Campaign, SimState } from "@/lib/types";

const MULTIPLAYER_DIRECTIVES: MissionObjective[] = [
  { id: "win", text: "Destroy all rival Command HQs to eliminate their players." },
  { id: "yard", text: "Protect your Command HQ; its loss eliminates your forces." },
];

export function playFieldStatus(state: SimState, campaign?: Campaign) {
  const multiplayer = state.multiplayer === true;
  const objective = objectiveProgress(state);
  const timeRemaining = multiplayer || state.runtime?.deadline === undefined || objective.timeRemainingTicks === undefined
    ? undefined
    : `Time remaining ${formatMissionClockFromTicks(objective.timeRemainingTicks)}`;
  const convoyDeparture = !multiplayer && state.runtime?.kind === "escort" && state.runtime.convoyStartTick !== undefined
    ? `Convoy departs in ${formatMissionClockFromTicks(Math.max(0, state.runtime.convoyStartTick - state.tick))}`
    : undefined;
  const mission = multiplayer ? undefined : campaign?.missions[state.missionIndex];
  const profile = mission
    ? profileContractFor(resolveMissionProfile(state.seed, state.missionIndex, mission.win.kind, mission.profile))
    : undefined;
  return {
    objective: objective.label,
    secondary: secondaryProgress(state).map((item) => `${item.completed ? "✓" : "○"} ${item.label}`),
    briefingObjectives: multiplayer ? MULTIPLAYER_DIRECTIVES : mission && campaign ? missionObjectives(mission, campaign) : [],
    objectiveProgress: objective,
    objectiveCards: objectiveCardsFor(state),
    phaseLabel: multiplayer ? undefined : phaseLabel(state.runtime),
    timeRemainingTicks: objective.timeRemainingTicks,
    timeLimitTicks: missionTimeLimitTicks(state),
    timeRemaining,
    convoyDeparture,
    profileLabel: multiplayer ? undefined : profile?.label,
    doctrineHints: multiplayer ? [] : doctrineHintsFor(state),
  };
}
