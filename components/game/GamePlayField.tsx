import type { PlayFieldSurfaceModel } from "./hooks/runtime/types";
import { tutorialPrompt, tutorialTargets } from "@/lib/sim/tutorial";
import { Battlefield } from "./Battlefield";
import { CombatAlert } from "./CombatAlert";
import { MissionResult } from "./MissionResult";
import { TutorialOverlay } from "./TutorialOverlay";
import { CommandNotice } from "./CommandNotice";
import { MIN_RENDER_HEIGHT, MIN_RENDER_WIDTH } from "./hooks/useGameCamera";
import { playFieldStatus } from "./playFieldStatus";

export type GamePlayFieldProps = PlayFieldSurfaceModel;

export function GamePlayField({
  hostRef,
  canvasRef,
  panAvail,
  hotPan,
  campaign,
  state,
  tutorial,
  paused = false,
  pointer,
  resultActions,
  feedback,
  onObjectivePanelToggle,
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
      {...pointer}
    >
      {feedback.combatAlert ? <CombatAlert text={feedback.combatAlert} kind={feedback.combatAlertKind} /> : null}
      <CommandNotice notice={feedback.commandNotice ?? null} />
      <MissionResult
        state={state}
        onNextBriefing={resultActions.onNextBriefing}
        onCampaignVictory={resultActions.onCampaignVictory}
        onRetry={resultActions.onRetry}
        onMenu={resultActions.onMenu}
      />
      {tutorial && !paused ? (
        <TutorialOverlay
          prompt={tutorialPrompt(state)}
          stage={state.tutorialStage}
          targets={tutorialTargets(state)}
          onExit={resultActions.onExitTutorial}
          onBack={resultActions.onBackTutorial}
        />
      ) : null}
    </Battlefield>
  );
}
