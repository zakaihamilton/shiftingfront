import { useEffect, useMemo, useState } from "react";
import { formatSeed } from "@/lib/seed/rng";
import type { MissionObjective } from "@/lib/gen/story";
import { deadlineUrgency, type ObjectiveCardModel } from "@/lib/ui/missionPresentation";
import type { DoctrineHint } from "@/lib/ui/doctrine";
import { useFullscreen } from "@/lib/ui/fullscreen";
import styles from "./Battlefield.module.css";

export function isMobileDirectiveViewport(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(
    "(max-width: 1023px) and (orientation: portrait), (max-height: 600px), (max-width: 799px), (pointer: coarse) and (max-width: 1024px)",
  ).matches;
}

export function BattlefieldHud({
  seed,
  levelNumber,
  levelCount,
  missionName,
  objective,
  profileLabel,
  doctrineHints = [],
  timeRemaining,
  convoyDeparture,
  briefingObjectives,
  objectiveCards = [],
  phaseLabel,
  timeRemainingTicks,
  timeLimitTicks,
  onObjectivePanelToggle,
  defaultExpanded,
}: {
  seed: number;
  levelNumber: number;
  levelCount: number;
  missionName: string;
  objective: string;
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
  defaultExpanded?: boolean;
}) {
  const fullscreen = useFullscreen();
  const [directiveExpanded, setDirectiveExpanded] = useState(() => {
    if (defaultExpanded !== undefined) return defaultExpanded;
    return !isMobileDirectiveViewport();
  });
  const [seenDoctrine] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      return new Set(JSON.parse(window.sessionStorage.getItem("shifting-front:doctrine") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const visibleDoctrine = useMemo(
    () => doctrineHints.filter((hint) => !seenDoctrine.has(hint.id)),
    [doctrineHints, seenDoctrine],
  );
  const doctrineKey = doctrineHints.map((hint) => hint.id).join("|");
  useEffect(() => {
    if (!doctrineKey || typeof window === "undefined") return;
    let next = new Set<string>();
    try {
      next = new Set(JSON.parse(window.sessionStorage.getItem("shifting-front:doctrine") ?? "[]"));
    } catch {
      // Session storage is optional.
    }
    const hintIds = doctrineKey.split("|").filter(Boolean);
    hintIds.forEach((id) => next.add(id));
    try {
      window.sessionStorage.setItem("shifting-front:doctrine", JSON.stringify([...next]));
    } catch {
      // Session storage is optional; the hint remains presentation-only.
    }
    // Persist categories without hiding the current mission's first render.
    // A later mount in this browser session will filter them from the initial state.
  }, [doctrineKey]);
  const urgency = deadlineUrgency(timeRemainingTicks);
  const timerRatio = timeLimitTicks && timeRemainingTicks !== undefined
    ? Math.max(0, Math.min(1, timeRemainingTicks / timeLimitTicks))
    : undefined;
  const timerGlyph = urgency === "critical" ? "‼" : urgency === "urgent" ? "!" : urgency === "watch" ? "◒" : "◷";
  const timerLabel = urgency === "critical" ? "Critical deadline"
    : urgency === "urgent" ? "Urgent deadline"
      : urgency === "watch" ? "Deadline watch"
        : "Time remaining";
  const timerValue = timeRemaining?.replace(/^Time remaining\s*/, "") ?? "";
  const timerText = urgency === "normal" ? `Time remaining ${timerValue}` : `Time remaining ${timerValue} · ${timerLabel}`;
  const requiredCards = objectiveCards.filter((card) => !card.primary && card.priority === "primary");
  const optionalCards = objectiveCards.filter((card) => !card.primary && card.priority !== "primary");
  const primaryCard = objectiveCards.find((card) => card.primary) ?? objectiveCards[0];
  const primaryObjective = briefingObjectives?.find((item) => item.id === "win")?.text
    ?? briefingObjectives?.[0]?.text
    ?? primaryCard?.label
    ?? objective;
  const toggleDirective = () => {
    setDirectiveExpanded((expanded) => !expanded);
    onObjectivePanelToggle?.();
  };
  const timerReadout = timeRemaining ? (
    <div className={styles.timeRemaining} data-testid="time-remaining" data-placement={directiveExpanded ? "body" : "collapsed"} data-urgency={urgency} data-tooltip="Time left to complete the primary objective. The mission fails at 00:00.">
      <span className={styles.timerGlyph} aria-hidden="true">{timerGlyph}</span>
      <span>{timerText}</span>
      {timerRatio !== undefined ? <span className={styles.timerBar} aria-hidden="true"><span style={{ width: `${Math.round(timerRatio * 100)}%` }} /></span> : null}
    </div>
  ) : null;
  return (
    <div className={styles.status} data-testid="battlefield-status" data-urgency={urgency}>
      <div className={styles.operationBar}>
        <div className={styles.missionMeta}>
          <div className={styles.seed} data-testid="seed"><span className={styles.statusGlyph} aria-hidden="true">◆</span> Seed {formatSeed(seed)}</div>
          <div className={styles.level} data-testid="level-progress">
            <span>Operation {levelNumber} of {levelCount}</span>
            <span className={styles.operationTicks} aria-label={`Operation ${levelNumber} of ${levelCount}`}>
              {Array.from({ length: levelCount }, (_, index) => (
                <span key={index} className={index < levelNumber ? styles.operationTickActive : styles.operationTick} aria-hidden="true" />
              ))}
            </span>
          </div>
        </div>
        <div className={styles.mission}>{missionName}</div>
        <div className={styles.operationFoot}>
          {profileLabel ? <div className={styles.profile} data-testid="mission-profile">{profileLabel}</div> : null}
        </div>
      </div>
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
                onClick={fullscreen.toggle}
              >
                <span className={styles.directiveToggleIcon} aria-hidden="true">
                  {fullscreen.isFullscreen ? "🗗" : "⛶"}
                </span>
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
            <div className={styles.objective} data-testid="objective" data-status={primaryCard?.status ?? "active"}>
              <span className={styles.objectivePriority}><span className={styles.priorityIcon} aria-hidden="true">!</span> Primary objective</span>
              <strong>{primaryObjective}</strong>
              {primaryCard && primaryCard.target > 0 ? (
                <span className={styles.objectiveProgress}>
                  <span>{primaryCard.label}</span>
                  <span className={styles.objectiveCount}>{Math.min(primaryCard.current, primaryCard.target)} / {primaryCard.target}</span>
                  <span className={styles.objectiveBar} aria-hidden="true">
                    <span style={{ width: `${Math.round(Math.max(0, Math.min(1, primaryCard.current / primaryCard.target)) * 100)}%` }} />
                  </span>
                </span>
              ) : null}
            </div>
            {directiveExpanded ? timerReadout : null}
            {convoyDeparture ? (
              <div className={styles.stagingWindow} data-testid="convoy-departure" data-tooltip="The convoy starts moving at 00:00. This wait is included in the mission time.">
                {convoyDeparture}
              </div>
            ) : null}
            {requiredCards.length ? (
              <section className={styles.secondaryRail} aria-label="Primary objectives" data-testid="primary-objectives">
                <div className={styles.secondaryHeader}>Primary objectives <span>{requiredCards.filter((card) => card.status === "complete").length}/{requiredCards.length}</span></div>
                <div className={styles.secondaryCards}>
                  {requiredCards.map((card) => (
                    <div className={styles.secondaryCard} key={card.id} data-status={card.status}>
                      <span className={styles.secondaryIcon} aria-hidden="true">{card.status === "complete" ? "✓" : card.status === "failed" ? "×" : "!"}</span>
                      <span>{card.label}</span>
                      <span className={styles.secondaryState}>{card.status === "complete" ? "Complete" : card.status === "failed" ? "Failed" : "Required"}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {optionalCards.length ? (
              <section className={styles.secondaryRail} aria-label="Optional objectives" data-testid="secondary-objectives">
                <div className={styles.secondaryHeader}>Bonus objectives <span>{optionalCards.filter((card) => card.status === "complete").length}/{optionalCards.length}</span></div>
                <div className={styles.secondaryCards}>
                  {optionalCards.map((card) => (
                    <div className={styles.secondaryCard} key={card.id} data-status={card.status}>
                      <span className={styles.secondaryIcon} aria-hidden="true">{card.status === "complete" ? "✓" : card.status === "failed" ? "×" : "○"}</span>
                      <span>{card.label}</span>
                      <span className={styles.secondaryState}>{card.status === "complete" ? "Complete" : card.status === "failed" ? "Failed" : "Active"}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
            {briefingObjectives?.length ? (
              <section className={styles.briefingObjectives} aria-label="Mission objectives" data-testid="battlefield-objectives">
                <details open onToggle={onObjectivePanelToggle}>
                  <summary className={styles.briefingLabel}>Strategic directives</summary>
                  <div className={styles.briefingList}>
                    {briefingObjectives.map((item, index) => (
                      <div className={styles.briefingObjective} key={item.id}>
                        <span className={styles.briefingIndex}>{String(index + 1).padStart(2, "0")}</span>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </section>
            ) : null}
            {visibleDoctrine.length ? (
              <section className={styles.doctrine} aria-label="Field doctrine" data-testid="field-doctrine">
                <div className={styles.doctrineHeader}>Field doctrine <span>once per session</span></div>
                <div className={styles.doctrineList}>
                  {visibleDoctrine.map((hint) => (
                    <div className={styles.doctrineItem} key={hint.id}>
                      <strong>{hint.label}</strong>
                      <span>{hint.text}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
        </div>
      </div>
      <div className={styles.statusBackdrop} aria-hidden="true" />
    </div>
  );
}
