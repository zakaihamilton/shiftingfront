import type { MissionObjective } from "@/lib/gen/story";
import type { DoctrineHint } from "@/lib/ui/doctrine";
import type { ObjectiveCardModel } from "@/lib/ui/missionPresentation";
import { FieldDoctrine } from "./FieldDoctrine";
import styles from "./Battlefield.module.css";

export function MissionDirectiveContent({
  objective,
  convoyDeparture,
  briefingObjectives,
  objectiveCards,
  doctrineHints,
  onObjectivePanelToggle,
}: {
  objective: string;
  convoyDeparture?: string;
  briefingObjectives?: MissionObjective[];
  objectiveCards: ObjectiveCardModel[];
  doctrineHints?: DoctrineHint[];
  onObjectivePanelToggle?: () => void;
}) {
  const requiredCards = objectiveCards.filter((card) => !card.primary && card.priority === "primary");
  const optionalCards = objectiveCards.filter((card) => !card.primary && card.priority !== "primary");
  const primaryCard = objectiveCards.find((card) => card.primary) ?? objectiveCards[0];
  const primaryObjective = briefingObjectives?.find((item) => item.id === "win")?.text
    ?? briefingObjectives?.[0]?.text
    ?? primaryCard?.label
    ?? objective;

  return (
    <>
      <div className={styles.objective} data-testid="objective" data-status={primaryCard?.status ?? "active"}>
        <span className={styles.objectivePriority}><span className={styles.priorityIcon} aria-hidden="true">!</span> Primary objective</span>
        <strong>{primaryObjective}</strong>
        {primaryCard && primaryCard.target > 0 ? (
          <span className={styles.objectiveProgress}>
            <span>{primaryCard.label}</span>
            {primaryCard.showCount !== false ? (
              <span className={styles.objectiveCount}>{Math.min(primaryCard.current, primaryCard.target)} / {primaryCard.target}</span>
            ) : null}
            <span className={styles.objectiveBar} aria-hidden="true">
              <span style={{ width: `${Math.round(Math.max(0, Math.min(1, primaryCard.current / primaryCard.target)) * 100)}%` }} />
            </span>
          </span>
        ) : null}
      </div>
      {convoyDeparture ? (
        <div className={styles.stagingWindow} data-testid="convoy-departure" data-tooltip="The convoy starts moving at 00:00. This wait is included in the mission time.">
          {convoyDeparture}
        </div>
      ) : null}
      {requiredCards.length ? (
        <ObjectiveRail
          cards={requiredCards}
          label="Primary objectives"
          ariaLabel="Primary objectives"
          testId="primary-objectives"
          completeLabel="Complete"
          activeLabel="Required"
        />
      ) : null}
      {optionalCards.length ? (
        <ObjectiveRail
          cards={optionalCards}
          label="Bonus objectives"
          ariaLabel="Optional objectives"
          testId="secondary-objectives"
          completeLabel="Complete"
          activeLabel="Active"
        />
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
      <FieldDoctrine doctrineHints={doctrineHints} />
    </>
  );
}

function ObjectiveRail({
  cards,
  label,
  ariaLabel,
  testId,
  completeLabel,
  activeLabel,
}: {
  cards: ObjectiveCardModel[];
  label: string;
  ariaLabel: string;
  testId: string;
  completeLabel: string;
  activeLabel: string;
}) {
  return (
    <section className={styles.secondaryRail} aria-label={ariaLabel} data-testid={testId}>
      <div className={styles.secondaryHeader}>{label} <span>{cards.filter((card) => card.status === "complete").length}/{cards.length}</span></div>
      <div className={styles.secondaryCards}>
        {cards.map((card) => (
          <div className={styles.secondaryCard} key={card.id} data-status={card.status}>
            <span className={styles.secondaryIcon} aria-hidden="true">
              {card.status === "complete" ? "✓" : card.status === "failed" ? "×" : card.priority === "primary" ? "!" : "○"}
            </span>
            <span>{card.label}</span>
            <span className={styles.secondaryState}>
              {card.status === "complete" ? completeLabel : card.status === "failed" ? "Failed" : activeLabel}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
