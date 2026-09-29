import { DossierSection, MetricCluster, StatusBadge } from "@/components/ui/Dossier";
import type { ForceDebrief, MissionDebrief } from "@/lib/sim/debrief";
import styles from "./MissionResult.module.css";

type ObjectiveResult = MissionDebrief["secondary"][number];

function secondaryOutcomeLabel(objective: ObjectiveResult): string {
  if (objective.id === "yard") return objective.completed ? "Command HQ intact" : "Command HQ destroyed";
  if (objective.id === "survivors") return objective.completed ? "Combat unit retained" : "No combat unit survived";
  if (objective.id === "time") {
    const within = objective.label.match(/within (.+?)(?: total)?$/i)?.[1];
    if (within) return objective.completed ? `Operation finished within ${within}` : `Operation not finished within ${within}`;
    return objective.completed ? "Operation finished before the final push" : "Operation not finished before the final push";
  }
  return objective.label;
}

function objectiveState(objective: ObjectiveResult): { label: string; icon: string } {
  if (objective.completed) return { label: "Complete", icon: "✓" };
  if (objective.failed) return { label: "Failed", icon: "×" };
  return { label: "Required", icon: "!" };
}

function ObjectiveRow({ objective, optional = false }: { objective: ObjectiveResult; optional?: boolean }) {
  const state = objectiveState(objective);
  return (
    <div className={styles.objectiveRow} data-status={objective.completed ? "complete" : objective.failed ? "failed" : "active"}>
      <span className={styles.objectiveStatusIcon} aria-hidden="true">{optional && state.label === "Required" ? "○" : state.icon}</span>
      <span className={styles.objectiveRowLabel}>{secondaryOutcomeLabel(objective)}</span>
      <span className={styles.objectiveRowState}>{optional && state.label === "Required" ? "Bonus" : state.label}</span>
    </div>
  );
}

export function MissionOutcome({ debrief, draw = false }: { debrief: MissionDebrief; draw?: boolean }) {
  const primaryObjective = debrief.objective;
  const primaryState = draw ? "draw" : debrief.status === "won" ? "complete" : "failed";
  const primaryIcon = primaryState === "complete" ? "✓" : primaryState === "draw" ? "=" : "!";
  const objectiveHeadline = draw ? "No command HQ survived" : primaryObjective.headline;
  const objectiveProgress = draw ? "All remaining forces were eliminated before a victor could be confirmed." : primaryObjective.progress;
  const statusTone = primaryState === "complete" ? "success" : primaryState === "draw" ? "muted" : "alert";

  return (
    <section className={styles.outcome} aria-label="Outcome assessment" data-status={primaryState}>
      <div className={styles.resultCard} data-testid="primary-result-card" data-status={primaryState}>
        <div className={styles.resultCardHeader}>
          <p className={styles.objectiveLabel}>Primary objective</p>
          <StatusBadge className={styles.cardStatus} tone={statusTone}>
            <span aria-hidden="true">{primaryIcon}</span>{primaryState === "complete" ? "Complete" : primaryState === "draw" ? "Draw" : "Failed"}
          </StatusBadge>
        </div>
        <p className={styles.objectiveHeadline}>{objectiveHeadline}</p>
        <p className={styles.objectiveProgress}>{objectiveProgress}</p>
      </div>

      {debrief.primaryObjectives.length ? (
        <div className={styles.objectiveList} aria-label="Primary objectives" data-testid="required-objectives">
          <div className={styles.listHeader}>
            <span>Primary objectives</span>
            <span>{debrief.primaryObjectives.filter((objective) => objective.completed).length}/{debrief.primaryObjectives.length}</span>
          </div>
          {debrief.primaryObjectives.map((objective) => <ObjectiveRow key={objective.id} objective={objective} />)}
        </div>
      ) : null}

      {debrief.optionalObjectives.length ? (
        <div className={styles.objectiveList} aria-label="Optional objectives" data-testid="optional-objectives">
          <div className={styles.listHeader}>
            <span>Bonus objectives</span>
            <span>{debrief.optionalObjectives.filter((objective) => objective.completed).length}/{debrief.optionalObjectives.length}</span>
          </div>
          {debrief.optionalObjectives.map((objective) => <ObjectiveRow key={objective.id} objective={objective} optional />)}
        </div>
      ) : null}

      {debrief.retryGuidance ? (
        <details className={styles.disclosure} data-testid="retry-guidance" open>
          <summary>
            <span>Retry guidance</span>
            <span className={styles.disclosureValue}>How to improve</span>
          </summary>
          <div className={styles.disclosureBody}><p>{debrief.retryGuidance}</p></div>
        </details>
      ) : null}
    </section>
  );
}

export function MissionBattleRecord({ debrief, multiplayer = false }: { debrief: MissionDebrief; multiplayer?: boolean }) {
  const items = multiplayer
    ? [
      { label: "Time", value: debrief.battle.duration },
      { label: "Credits earned", value: debrief.battle.creditsGathered },
      { label: "Units trained", value: debrief.battle.unitsTrained },
      { label: "Units lost", value: debrief.forces.friendly.unitsLost, tone: "alert" as const },
      { label: "Structures lost", value: debrief.forces.friendly.buildingsLost, tone: "alert" as const },
    ]
    : [
      { label: "Time", value: debrief.battle.duration },
      { label: "Credits", value: debrief.battle.creditsGathered },
      { label: "Trained", value: debrief.battle.unitsTrained },
      { label: "Built", value: debrief.battle.structuresCompleted },
      { label: "Score", value: debrief.battle.score },
      { label: "Medals", value: `${debrief.battle.medals} / 3`, tone: "gold" as const },
    ];

  return (
    <DossierSection className={styles.section} label={multiplayer ? "Match record" : "Battle record"} aria-label={multiplayer ? "Match record" : "Battle record"} data-testid="battle-record" tabIndex={0}>
      <MetricCluster className={styles.metrics} items={items} />
    </DossierSection>
  );
}

export function MissionForceCard({ label, force }: { label: string; force: ForceDebrief }) {
  return (
    <div className={styles.forceCard} data-force={label.toLowerCase()}>
      <h3><span className={styles.forceMark} aria-hidden="true" />{label}</h3>
      <dl>
        <div><dt>Units</dt><dd>{force.unitsRemaining} <small>left</small></dd></div>
        <div><dt>Structures</dt><dd>{force.buildingsRemaining} <small>left</small></dd></div>
        <div><dt>Losses</dt><dd>{force.unitsLost}u · {force.buildingsLost}s</dd></div>
      </dl>
    </div>
  );
}

export function MissionForceDisposition({ debrief, multiplayer = false }: { debrief: MissionDebrief; multiplayer?: boolean }) {
  return (
    <DossierSection className={styles.section} label="Forces" aria-label="Force disposition" data-testid="force-disposition" tabIndex={0}>
      <div className={styles.forceGrid}>
        <MissionForceCard label={multiplayer ? "Your forces" : "Friendly"} force={debrief.forces.friendly} />
        <MissionForceCard label={multiplayer ? "Rival forces" : "Enemy"} force={debrief.forces.enemy} />
      </div>
    </DossierSection>
  );
}
