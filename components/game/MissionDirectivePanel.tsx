import { useState } from "react";
import { formatMissionClockFromTicks } from "@/lib/gen/pacing";
import { useFullscreen } from "@/lib/ui/fullscreen";
import { triggerHaptic } from "@/lib/ui/haptics";
import { MissionDirectiveContent } from "./MissionDirectiveContent";
import type { MissionDirectiveProps } from "./BattlefieldHud.types";
import styles from "./Battlefield.module.css";

export function MissionDirectivePanel({
  objective,
  doctrineHints,
  timeRemaining,
  convoyDeparture,
  briefingObjectives,
  objectiveCards = [],
  phaseLabel,
  timeRemainingTicks,
  timeLimitTicks,
  onObjectivePanelToggle,
  urgency,
}: MissionDirectiveProps) {
  const fullscreen = useFullscreen();
  const [directiveExpanded, setDirectiveExpanded] = useState(false);
  const timerRatio = timeLimitTicks && timeRemainingTicks !== undefined
    ? Math.max(0, Math.min(1, timeRemainingTicks / timeLimitTicks))
    : undefined;
  const timerGlyph = urgency === "critical" ? "‼" : urgency === "urgent" ? "!" : urgency === "watch" ? "◒" : "◷";
  const timerLabel = urgency === "critical" ? "Critical deadline"
    : urgency === "urgent" ? "Urgent deadline"
      : urgency === "watch" ? "Deadline watch"
        : "Time remaining";
  const timerValue = timeRemaining?.replace(/^Time remaining\s*/, "")
    ?? (timeRemainingTicks === undefined ? "" : formatMissionClockFromTicks(Math.max(0, timeRemainingTicks)));
  const timerText = urgency === "normal" ? `Time remaining ${timerValue}` : `Time remaining ${timerValue} · ${timerLabel}`;
  const toggleDirective = () => {
    triggerHaptic("tap");
    setDirectiveExpanded((expanded) => !expanded);
    onObjectivePanelToggle?.();
  };
  // Hold objectives have ticks but no separate countdown string; surface their
  // clock only while the objective details that already contain it are hidden.
  const showTimerReadout = timeRemaining !== undefined || (!directiveExpanded && timeRemainingTicks !== undefined);
  const timerReadout = showTimerReadout ? (
    <div className={styles.timeRemaining} data-testid="time-remaining" data-placement={directiveExpanded ? "body" : "collapsed"} data-urgency={urgency} data-tooltip="Time left to complete the primary objective. The mission fails at 00:00.">
      <span className={styles.timerGlyph} aria-hidden="true">{timerGlyph}</span>
      <span>{timerText}</span>
      {timerRatio !== undefined ? <span className={styles.timerBar} aria-hidden="true"><span style={{ width: `${Math.round(timerRatio * 100)}%` }} /></span> : null}
    </div>
  ) : null;

  return (
    <div className={styles.objectiveStack} data-directive-expanded={directiveExpanded ? "true" : "false"}>
      <div className={styles.directiveHeader}>
        <span className={styles.directiveKicker}>Mission directive</span>
        {phaseLabel ? <span className={styles.phase} data-testid="mission-phase"><span className={styles.phaseDot} aria-hidden="true" />{phaseLabel}</span> : null}
        <div className={styles.directiveActions}>
          {fullscreen.isSupported ? (
            <button
              type="button"
              className={styles.directiveToggle}
              aria-label={fullscreen.isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              data-tooltip={fullscreen.isFullscreen ? `Exit fullscreen (${fullscreen.shortcut})` : `Enter fullscreen (${fullscreen.shortcut})`}
              onClick={() => {
                triggerHaptic("tap");
                fullscreen.toggle();
              }}
            >
              <span className={styles.directiveToggleIcon} aria-hidden="true">{fullscreen.isFullscreen ? "🗗" : "⛶"}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={styles.directiveToggle}
            aria-label={`${directiveExpanded ? "Collapse" : "Expand"} mission directive`}
            aria-expanded={directiveExpanded}
            aria-controls="mission-directive-body"
            data-tooltip={`${directiveExpanded ? "Collapse" : "Expand"} mission directive`}
            onClick={toggleDirective}
          >
            <span className={styles.directiveToggleIcon} aria-hidden="true">{directiveExpanded ? "−" : "+"}</span>
          </button>
        </div>
      </div>
      {!directiveExpanded ? timerReadout : null}
      <div id="mission-directive-body" className={styles.directiveBody} hidden={!directiveExpanded}>
        {directiveExpanded ? timerReadout : null}
        <MissionDirectiveContent
          objective={objective}
          convoyDeparture={convoyDeparture}
          briefingObjectives={briefingObjectives}
          objectiveCards={objectiveCards}
          doctrineHints={doctrineHints}
          onObjectivePanelToggle={onObjectivePanelToggle}
        />
      </div>
    </div>
  );
}
