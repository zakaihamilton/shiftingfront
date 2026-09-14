import { ConsoleButton } from "@/components/ui/ConsoleButton";
import { tutorialStageIndex, TUTORIAL_STAGES, type TutorialWorldTarget } from "@/lib/sim/tutorial";
import type { TutorialStage } from "@/lib/types";
import styles from "./TutorialOverlay.module.css";

const STAGE_TITLES: Record<TutorialStage, string> = {
  select: "Acquire a unit",
  move: "Test movement",
  build: "Expand the grid",
  produce: "Reinforce the line",
  attack: "Engage the contact",
  repair: "Restore the structure",
  complete: "Range certified",
};

const HINTS: Record<TutorialStage, string> = {
  select: "Selection works with a click or a drag box. The highlighted Infantry is the lesson target.",
  move: "Right-click ground to move. Use attack-move when advancing under fire.",
  build: "Power keeps the command center online and unlocks production. The highlighted site is a valid placement.",
  produce: "Queue Infantry from the Production tab. The command panel accepts keyboard shortcuts too.",
  attack: "The drill target is passive. Attack it directly or use attack-move on its highlighted tile.",
  repair: "Repair mode is safe to cancel with Escape or the visible cancel action.",
  complete: "You can leave the range now, or stay on the battlefield to experiment before returning to the command desk.",
};

function targetSummary(targets: TutorialWorldTarget[], stage: TutorialStage): string {
  if (!targets.length) {
    if (stage === "produce") return "Production tab + Infantry cameo";
    return "Awaiting target";
  }
  return targets.map((target) => target.label).join(" + ");
}

export function TutorialOverlay({
  prompt,
  stage = "select",
  targets = [],
  onExit,
  onBack,
}: {
  prompt: string;
  stage?: TutorialStage;
  targets?: TutorialWorldTarget[];
  onExit: () => void;
  onBack: () => void;
}) {
  const complete = stage === "complete";
  const stageIndex = tutorialStageIndex(stage);
  const step = Math.min(TUTORIAL_STAGES.length, stageIndex + 1);
  return (
    <section
      className={styles.card}
      role="status"
      aria-live="polite"
      aria-label="Training instruction"
      data-testid="tutorial-overlay"
      data-stage={stage}
      data-target-count={targets.length}
      data-tutorial-targets={JSON.stringify(targets)}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.kicker}>Live training coach</p>
          <h2 className={styles.title}>{STAGE_TITLES[stage]}</h2>
        </div>
        <span className={styles.progressLabel}>Step {step} / {TUTORIAL_STAGES.length}</span>
      </div>
      <div className={styles.progress} aria-label={`Training progress: step ${step} of ${TUTORIAL_STAGES.length}`}>
        {TUTORIAL_STAGES.map((item, index) => <span key={item} className={index <= stageIndex ? styles.progressActive : styles.progressPending} aria-hidden="true" />)}
      </div>
      <div className={styles.objective}>
        <p className={styles.target}><span aria-hidden="true">◉</span> Focus: <strong>{targetSummary(targets, stage)}</strong></p>
        <p className={styles.prompt}>{prompt}</p>
      </div>
      <p className={styles.status} data-status={complete ? "complete" : "waiting"}>
        <span className={styles.statusDot} aria-hidden="true" />
        {complete ? "Lesson complete — command desk unlocked" : "Waiting for your action"}
      </p>
      <details className={styles.hint}>
        <summary>Need a hint?</summary>
        <p>{HINTS[stage]}</p>
      </details>
      <div className={styles.actions}>
        <ConsoleButton muted={!complete} onClick={complete ? onExit : onBack}>
          {complete ? "Return to Command Desk" : "Exit Training"}
        </ConsoleButton>
      </div>
    </section>
  );
}
