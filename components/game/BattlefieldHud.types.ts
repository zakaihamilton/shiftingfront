import type { MissionObjective } from "@/lib/gen/story";
import type { DoctrineHint } from "@/lib/ui/doctrine";
import type { DeadlineUrgency, ObjectiveCardModel } from "@/lib/ui/missionPresentation";

export type BattlefieldHudProps = {
  seed: number;
  levelNumber: number;
  levelCount: number;
  missionName: string;
  objective: string;
  survivalObjective?: boolean;
  profileLabel?: string;
  doctrineHints?: DoctrineHint[];
  timeRemaining?: string;
  convoyDeparture?: string;
  briefingObjectives?: MissionObjective[];
  objectiveCards?: ObjectiveCardModel[];
  phaseLabel?: string;
  timeRemainingTicks?: number;
  timeLimitTicks?: number;
  onObjectivePanelToggle?: () => void;
  multiplayerPingMs?: number | null;
  multiplayerHost?: boolean;
};

export type BattlefieldOperationBarProps = Pick<
  BattlefieldHudProps,
  "seed" | "levelNumber" | "levelCount" | "missionName" | "profileLabel" | "multiplayerPingMs" | "multiplayerHost"
>;

export type MissionDirectiveProps = Pick<
  BattlefieldHudProps,
  | "objective"
  | "survivalObjective"
  | "doctrineHints"
  | "timeRemaining"
  | "convoyDeparture"
  | "briefingObjectives"
  | "objectiveCards"
  | "phaseLabel"
  | "timeRemainingTicks"
  | "timeLimitTicks"
  | "onObjectivePanelToggle"
> & { urgency: DeadlineUrgency };
