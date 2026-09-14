import { useMemo, useState } from "react";
import { labelFor } from "@/lib/catalog";
import { missionLossMessage } from "@/lib/sim/debrief";
import { fogAt } from "@/lib/sim/fog";
import { terrainAccess } from "@/lib/sim/world";
import { isPlayerSelectableEntity, isPlayerSelectableUnit, type Entity, type SimState } from "@/lib/types";
import { formationLabel, stanceLabel } from "@/lib/ui/copy";
import { FORMATION_OPTIONS, STANCE_OPTIONS } from "@/lib/ui/orders";
import { tileCoords } from "@/lib/ui/tileCoords";
import { useAnnouncement } from "@/components/ui/useAnnouncement";
import type { GameActions } from "./hooks/useGameActions";
import type { GameCamera } from "./hooks/useGameCamera";
import styles from "./TacticalRoster.module.css";

function entityStatus(entity: Entity): string {
  if (entity.constructing > 0) return "Under construction";
  if (entity.producing) return `Training ${labelFor(entity.producing.kind)}`;
  if (entity.attackTarget !== undefined) return "Attacking";
  if (entity.orderMode === "attackMove") return "Attack-moving";
  if (entity.orderMode === "attack") return "Attacking";
  if (entity.orderMode === "move") return "Moving";
  return entity.idle ? "Idle" : "Active";
}

function roleLabel(entity: Entity): string {
  if (entity.scenarioRole === "convoy") return "Convoy";
  if (entity.scenarioRole === "stranded") return "Stranded";
  if (entity.scenarioRole === "cargo") return "Cargo";
  if (entity.marked) return "Marked target";
  if (entity.kind === "objective") return "Objective";
  return "—";
}

function visibleEntity(state: SimState, entity: Entity): boolean {
  const { x, y } = tileCoords(entity);
  return fogAt(state, x, y) === 2;
}

export function rosterEntities(state: SimState): Entity[] {
  return state.entities
    .filter((entity) => entity.hp > 0)
    .filter((entity) => {
      if (entity.owner === 0 && !entity.neutral) return true;
      return visibleEntity(state, entity) && (
        entity.owner === 1 || entity.neutral === true || entity.kind === "objective" || entity.marked
      );
    })
    .sort((a, b) => a.owner - b.owner || a.class.localeCompare(b.class) || a.id - b.id);
}

export function TacticalRoster({
  state,
  selectedIds,
  actions,
  camera,
  announcement,
  onSelect,
  onAnnounce,
}: {
  state: SimState;
  selectedIds: number[];
  actions: GameActions;
  camera: GameCamera;
  announcement: string;
  onSelect: (ids: number[]) => void;
  onAnnounce: (message: string) => void;
}) {
  // Set/Map snapshots keep per-tick renders O(n) instead of O(n*m).
  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const entityById = useMemo(() => new Map(state.entities.map((entity) => [entity.id, entity])), [state]);
  const entities = useMemo(() => rosterEntities(state), [state]);
  const selectedEntity = entities.find((entity) => selectedIdSet.has(entity.id));
  const [x, setX] = useState(() => selectedEntity ? Math.round(selectedEntity.x) : 0);
  const [y, setY] = useState(() => selectedEntity ? Math.round(selectedEntity.y) : 0);
  const [localAnnouncement, announce] = useAnnouncement(onAnnounce);

  const selectedUnits = [...selectedIdSet].filter((id) => {
    const entity = entityById.get(id);
    return Boolean(entity && entity.owner === 0 && isPlayerSelectableUnit(entity) && !entity.neutral && entity.hp > 0);
  });
  const coordinateAccess = terrainAccess(state, x, y);
  const coordinateValid = Number.isInteger(x) && Number.isInteger(y) && coordinateAccess.traversable;
  const harvestCoordinateValid = coordinateValid && coordinateAccess.label === "Ore field";
  const resultAnnouncement = state.result === "playing"
    ? ""
    : state.result === "won" ? "Mission complete." : `Mission lost: ${missionLossMessage(state)}`;
  const liveAnnouncement = resultAnnouncement || announcement || localAnnouncement;
  const issueCoordinate = (command: "move" | "attackMove" | "harvest") => {
    if (!coordinateValid || (command === "harvest" && !harvestCoordinateValid)) {
      announce(command === "harvest" ? "Choose an ore field." : "That ground cannot be walked.");
      return;
    }
    const issued = actions.issueCoordinateCommand(command, x, y);
    const order = command === "attackMove" ? "Attack-move" : command === "harvest" ? "Harvest" : "Move";
    announce(issued ? `${order} ordered at ${x}, ${y}.` : "Select a friendly unit first.");
  };

  const selectEntity = (entity: Entity) => {
    const { x: tx, y: ty } = tileCoords(entity);
    onSelect([entity.id]);
    setX(tx);
    setY(ty);
    announce(`Selected ${labelFor(entity.kind)} at ${tx}, ${ty}.`);
  };

  return (
    <aside className={styles.roster} aria-label="Tactical roster" data-testid="tactical-roster">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Keyboard and screen reader</p>
          <h2>Tactical roster</h2>
        </div>
        <span className={styles.count}>{entities.length}</span>
      </div>
      <div className={styles.live} aria-live="polite" aria-atomic="true">{liveAnnouncement}</div>
      <div className={styles.entityList} role="list" aria-label="Visible units and buildings">
        {entities.map((entity) => {
          const isSelected = selectedIdSet.has(entity.id);
          const { x: ex, y: ey } = tileCoords(entity);
          const faction = entity.neutral ? "Neutral" : state.factions[entity.owner].name;
          const name = labelFor(entity.kind);
          const oreField = terrainAccess(state, ex, ey).label === "Ore field";
          return (
            <div
              key={entity.id}
              className={`${styles.entity} ${isSelected ? styles.selected : ""}`}
              role="listitem"
              data-selected={isSelected}
              data-owner={entity.neutral ? "neutral" : String(entity.owner)}
            >
              <div className={styles.entityInfo}>
                <strong>{name}</strong>
                <span>{faction} · Health {entity.hp}/{entity.maxHp} · {entityStatus(entity)}</span>
                <span>Position {ex}, {ey} · Role {roleLabel(entity)}</span>
              </div>
              <div className={styles.rowActions}>
                {isPlayerSelectableEntity(entity) ? (
                  <button type="button" onClick={() => selectEntity(entity)} aria-label={`Select ${name}`}>
                    {isSelected ? "Selected" : "Select"}
                  </button>
                ) : null}
                <button type="button" onClick={() => { camera.centerSelection(new Set([entity.id])); announce(`Centered camera on ${name}.`); }}>
                  Center
                </button>
                {entity.owner === 1 ? (
                  <button type="button" onClick={() => {
                    const issued = actions.issueTargetCommand("attack", entity.id);
                    announce(issued ? `Attack ordered on ${name}.` : "Select a friendly unit first.");
                  }} disabled={!selectedUnits.length}>Attack</button>
                ) : null}
                {entity.owner === 0 && entity.class === "unit" && !entity.neutral && entity.id !== selectedEntity?.id ? (
                  <button type="button" onClick={() => {
                    const issued = actions.issueTargetCommand("support", entity.id);
                    announce(issued ? `Support ordered for ${name}.` : "Select a Field Medic or Repair Truck.");
                  }} disabled={!selectedUnits.length}>Support</button>
                ) : null}
                {oreField ? (
                  <button type="button" onClick={() => {
                    const issued = actions.issueCoordinateCommand("harvest", ex, ey);
                    announce(issued ? `Harvest ordered at ${ex}, ${ey}.` : "Select a Harvester.");
                  }} disabled={!selectedUnits.length}>Harvest</button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <section className={styles.commands} aria-labelledby="roster-command-title">
        <h3 id="roster-command-title">Selected command</h3>
        <div className={styles.commandGrid}>
          <button type="button" onClick={() => { actions.issueSelectedCommand("stop"); announce("Stop ordered."); }} disabled={!selectedUnits.length}>Stop</button>
          {STANCE_OPTIONS.map((option) => (
            <button key={option.id} type="button" onClick={() => { actions.issueSelectedCommand("stance", option.id); announce(`Stance set to ${stanceLabel(option.id)}.`); }} disabled={!selectedUnits.length}>{option.label}</button>
          ))}
          {FORMATION_OPTIONS.map((option) => (
            <button key={option.id} type="button" onClick={() => { actions.issueSelectedCommand("formation", option.id); announce(`Formation set to ${formationLabel(option.id)}.`); }} disabled={!selectedUnits.length}>{option.label}</button>
          ))}
        </div>
        <div className={styles.coordinates}>
          <label>X <input type="number" min={0} max={state.width - 1} value={x} onChange={(event) => setX(Number(event.target.value))} /></label>
          <label>Y <input type="number" min={0} max={state.height - 1} value={y} onChange={(event) => setY(Number(event.target.value))} /></label>
        </div>
        <div className={styles.commandGrid}>
          <button type="button" onClick={() => issueCoordinate("move")} disabled={!selectedUnits.length || !coordinateValid}>Move</button>
          <button type="button" onClick={() => issueCoordinate("attackMove")} disabled={!selectedUnits.length || !coordinateValid}>Attack-move</button>
          <button type="button" onClick={() => issueCoordinate("harvest")} disabled={!selectedUnits.length || !harvestCoordinateValid}>Harvest here</button>
        </div>
      </section>
    </aside>
  );
}
