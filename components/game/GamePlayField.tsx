import type { PointerEventHandler, Ref } from "react";
import type { PanAvailability, PanDir } from "@/lib/render/camera";
import { tutorialPrompt } from "@/lib/sim/tutorial";
import type { Campaign, SimState } from "@/lib/types";
import { Battlefield } from "./Battlefield";
import { CombatAlert } from "./CombatAlert";
import { MissionResult } from "./MissionResult";
import { TutorialOverlay } from "./TutorialOverlay";
import { CommandNotice } from "./CommandNotice";
import type { CommandNoticeState } from "./hooks/useGameChrome";
import { MIN_RENDER_HEIGHT, MIN_RENDER_WIDTH } from "./hooks/useGameCamera";
import { playFieldStatus } from "./playFieldStatus";

export type GamePlayFieldProps = {
  hostRef: Ref<HTMLDivElement>;
  canvasRef: Ref<HTMLCanvasElement>;
  panAvail: PanAvailability;
  hotPan: PanDir | null;
  campaign: Campaign;
  state: SimState;
  tutorial: boolean;
  paused?: boolean;
  onPointerDown: PointerEventHandler<HTMLCanvasElement>;
  onPointerMove: PointerEventHandler<HTMLCanvasElement>;
  onPointerEnter: PointerEventHandler<HTMLCanvasElement>;
  onPointerLeave: PointerEventHandler<HTMLCanvasElement>;
  onPointerUp: PointerEventHandler<HTMLCanvasElement>;
  onPointerCancel: PointerEventHandler<HTMLCanvasElement>;
  onAdvanceTutorial: () => void;
  onExitTutorial: () => void;
  onBackTutorial: () => void;
  onNextBriefing: () => void;
  onCampaignVictory: () => void;
  onRetry: () => void;
  onMenu: () => void;
  onObjectivePanelToggle?: () => void;
  combatAlert?: string | null;
  combatAlertKind?: import("./hooks/useCombatAlert").CombatAlertKind;
  commandNotice?: CommandNoticeState;
};

export function GamePlayField({
  hostRef,
  canvasRef,
  panAvail,
  hotPan,
  campaign,
  state,
  tutorial,
  paused = false,
  onPointerDown,
  onPointerMove,
  onPointerEnter,
  onPointerLeave,
  onPointerUp,
  onPointerCancel,
  onAdvanceTutorial,
  onExitTutorial,
  onBackTutorial,
  onNextBriefing,
  onCampaignVictory,
  onRetry,
  onMenu,
  onObjectivePanelToggle,
  combatAlert,
  combatAlertKind,
  commandNotice,
}: GamePlayFieldProps) {
  const status = playFieldStatus(state, campaign);
  return (
    <Battlefield
      hostRef={hostRef}
      canvasRef={canvasRef}
      width={MIN_RENDER_WIDTH}
      height={MIN_RENDER_HEIGHT}
      panAvail={panAvail}
      hotPan={hotPan}
      seed={state.seed}
      levelNumber={state.missionIndex + 1}
      levelCount={campaign.missions.length}
      missionName={state.missionName}
      objective={status.objective}
      profileLabel={tutorial ? undefined : status.profileLabel}
      doctrineHints={tutorial ? undefined : status.doctrineHints}
      timeRemaining={tutorial ? undefined : status.timeRemaining}
      convoyDeparture={status.convoyDeparture}
      briefingObjectives={tutorial ? undefined : status.briefingObjectives}
      objectiveCards={tutorial ? undefined : status.objectiveCards}
      phaseLabel={tutorial ? undefined : status.phaseLabel}
      timeRemainingTicks={tutorial ? undefined : status.timeRemainingTicks}
      timeLimitTicks={tutorial ? undefined : status.timeLimitTicks}
      onObjectivePanelToggle={onObjectivePanelToggle}
      showHud={state.result === "playing"}
      biome={state.biome}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {combatAlert ? <CombatAlert text={combatAlert} kind={combatAlertKind} /> : null}
      <CommandNotice notice={commandNotice ?? null} />
      <MissionResult
        state={state}
        onNextBriefing={onNextBriefing}
        onCampaignVictory={onCampaignVictory}
        onRetry={onRetry}
        onMenu={onMenu}
      />
      {tutorial && !paused ? (
        <TutorialOverlay
          prompt={tutorialPrompt(state)}
          complete={state.tutorialStage === "complete"}
          stage={state.tutorialStage}
          onAdvance={state.tutorialStage === "complete" ? onExitTutorial : onAdvanceTutorial}
          onBack={onBackTutorial}
        />
      ) : null}
    </Battlefield>
  );
}
