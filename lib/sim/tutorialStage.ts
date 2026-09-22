import { BUILDING_STATS } from "../catalog";
import { fogIndex } from "./fog";
import {
  isBuildingEntity,
  type Command,
  type Entity,
  type SimState,
  type TutorialStage,
} from "../types";
import {
  BUILDING_CLEARANCE,
  canPlaceBuilding,
  canStep,
  findBuildSite,
  openTileNear,
  trySpawnUnit,
} from "./world";
import { entitiesFor } from "./ecs/world";

export type TutorialWorldTarget =
  | { kind: "entity"; entityId: number; label: string; x?: number; y?: number; entityClass?: Entity["class"] }
  | { kind: "tile"; x: number; y: number; label: string; footprint?: { w: number; h: number } };

const TUTORIAL_STAGES: TutorialStage[] = ["select", "move", "build", "produce", "attack", "repair", "complete"];

export function tutorialPrompt(state: SimState): string {
  switch (state.tutorialStage) {
    case "select": return "Tap or click your Infantry to select it.";
    case "move": return "Move the selected unit to the highlighted ground (right click).";
    case "build": return "Open Construction, choose Power Plant, then place it at the highlighted site.";
    case "produce": return "Open Production and queue one Infantry.";
    case "attack": return "Select a combat unit, then attack the highlighted drill target.";
    case "repair": return "Activate Repair, then click the highlighted damaged structure.";
    default: return "Training complete. Return to the command desk when ready.";
  }
}

function livingEntity(state: SimState, predicate: (entity: Entity) => boolean): Entity | undefined {
  return entitiesFor(state).find((entity) => entity.hp > 0 && predicate(entity));
}

function friendlyInfantry(state: SimState): Entity | undefined {
  return livingEntity(state, (entity) => entity.owner === 0 && entity.class === "unit" && entity.kind === "infantry" && !entity.neutral);
}

function friendlyBuilding(state: SimState, kind?: Entity["kind"]): Entity | undefined {
  return livingEntity(state, (entity) => entity.owner === 0 && entity.class === "building" && (kind === undefined || entity.kind === kind));
}

export function tutorialMoveTile(state: SimState): { x: number; y: number } | null {
  if (state.tutorialStage !== "move") return null;
  const infantry = friendlyInfantry(state);
  if (!infantry) return null;
  const ix = Math.round(infantry.x);
  const iy = Math.round(infantry.y);
  for (let radius = 1; radius <= 8; radius++) {
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const x = ix + dx;
        const y = iy + dy;
        if (canStep(state, ix, iy, x, y)) return { x, y };
      }
    }
  }
  return null;
}

export function tutorialBuildTile(state: SimState): { x: number; y: number } | null {
  const trackedBuild = state.tutorialBuildId === undefined
    ? undefined
    : entitiesFor(state).find((entity) => entity.id === state.tutorialBuildId && entity.owner === 0 && entity.kind === "power" && entity.hp > 0);
  if (trackedBuild) return { x: Math.round(trackedBuild.x), y: Math.round(trackedBuild.y) };

  const yard = friendlyBuilding(state, "constructionYard");
  if (!yard) return null;
  const preferred = findBuildSite(
    state,
    "power",
    yard.x - 1,
    yard.y - 4,
    8,
    0,
    true,
    BUILDING_CLEARANCE,
    0,
  );
  if (preferred) return preferred;
  for (let y = 1; y < state.height - 1; y++) {
    for (let x = 1; x < state.width - 1; x++) {
      if (canPlaceBuilding(state, "power", x, y, 0, true, BUILDING_CLEARANCE, 0)) return { x, y };
    }
  }
  return null;
}

function tutorialAttackTarget(state: SimState): Entity | undefined {
  const saved = state.tutorialTargetId === undefined ? undefined : entitiesFor(state).find((entity) => entity.id === state.tutorialTargetId);
  if (saved && saved.hp > 0 && saved.owner === 1) return saved;
  return livingEntity(state, (entity) => entity.owner === 1 && entity.class === "unit" && !entity.neutral);
}

function entityTarget(entity: Entity | undefined, label: string): TutorialWorldTarget[] {
  return entity ? [{
    kind: "entity",
    entityId: entity.id,
    label,
    x: entity.x,
    y: entity.y,
    entityClass: entity.class,
  }] : [];
}

export function tutorialTargets(state: SimState): TutorialWorldTarget[] {
  switch (state.tutorialStage) {
    case "select":
      return entityTarget(friendlyInfantry(state), "Friendly Infantry");
    case "move": {
      const tile = tutorialMoveTile(state);
      return tile ? [{ kind: "tile", ...tile, label: "Move destination" }] : [];
    }
    case "build": {
      const tile = tutorialBuildTile(state);
      return tile ? [{ kind: "tile", ...tile, label: "Power Plant site", footprint: BUILDING_STATS.power.footprint }] : [];
    }
    case "produce":
      return [];
    case "attack":
      return [
        ...entityTarget(tutorialAttackTarget(state), "Drill target"),
        ...entityTarget(friendlyInfantry(state), "Combat Infantry"),
      ];
    case "repair":
      return entityTarget(
        livingEntity(state, (entity) => entity.owner === 0 && isBuildingEntity(entity) && entity.constructing === 0 && entity.hp < entity.maxHp),
        "Damaged structure",
      );
    case "complete":
      return entityTarget(friendlyBuilding(state, "constructionYard"), "Command desk");
    default:
      return [];
  }
}

export function tutorialFocusPoint(state: SimState): { x: number; y: number } | null {
  const targets = tutorialTargets(state);
  const first = targets[0];
  if (!first) return null;
  if (state.tutorialStage === "attack") {
    const combat = targets.find((target) => target.kind === "entity" && target.label === "Combat Infantry");
    if (first.kind === "entity" && combat?.kind === "entity") {
      return { x: (first.x! + combat.x!) / 2, y: (first.y! + combat.y!) / 2 };
    }
  }
  return { x: first.x!, y: first.y! };
}

export function tutorialSelectionCompletesStage(state: SimState, ids: readonly number[]): boolean {
  if (state.tutorialStage !== "select") return false;
  return ids.some((id) => {
    const entity = entitiesFor(state).find((candidate) => candidate.id === id);
    return Boolean(entity && entity.hp > 0 && entity.owner === 0 && entity.class === "unit" && entity.kind === "infantry" && !entity.neutral);
  });
}

function sameTile(x: number, y: number, target: TutorialWorldTarget | undefined): boolean {
  return target?.kind === "tile" && Math.round(x) === target.x && Math.round(y) === target.y;
}

function sameEntityTile(state: SimState, x: number, y: number, target: TutorialWorldTarget | undefined): boolean {
  if (target?.kind !== "entity") return false;
  const entity = entitiesFor(state).find((candidate) => candidate.id === target.entityId && candidate.hp > 0);
  return Boolean(entity && Math.round(x) === Math.round(entity.x) && Math.round(y) === Math.round(entity.y));
}

function hasFriendlyUnit(state: SimState, ids: number[], predicate: (entity: Entity) => boolean): boolean {
  return ids.some((id) => {
    const entity = entitiesFor(state).find((candidate) => candidate.id === id);
    return Boolean(entity && entity.hp > 0 && entity.owner === 0 && entity.class === "unit" && !entity.neutral && predicate(entity));
  });
}

export function tutorialCommandCompletesStage(
  state: SimState,
  command: Command,
  expectedTargets: TutorialWorldTarget[] = tutorialTargets(state),
): boolean {
  const firstTile = expectedTargets.find((target): target is Extract<TutorialWorldTarget, { kind: "tile" }> => target.kind === "tile");
  const firstEntity = expectedTargets.find((target): target is Extract<TutorialWorldTarget, { kind: "entity" }> => target.kind === "entity");
  switch (state.tutorialStage) {
    case "move":
      return (command.type === "move" || command.type === "attackMove") &&
        hasFriendlyUnit(state, command.unitIds, (entity) => entity.kind === "infantry") &&
        sameTile(command.x, command.y, firstTile);
    case "build":
      return command.type === "build" && command.building === "power" && sameTile(command.x, command.y, firstTile);
    case "produce":
      return command.type === "produce" && command.unit === "infantry" && Boolean(
        entitiesFor(state).find((entity) => entity.id === command.fromId && entity.owner === 0 && entity.class === "building" && entity.kind === "barracks"),
      );
    case "attack":
      return (command.type === "attack" && command.targetId === firstEntity?.entityId && hasFriendlyUnit(state, command.unitIds, (entity) => entity.kind !== "harvester")) ||
        (command.type === "attackMove" && hasFriendlyUnit(state, command.unitIds, (entity) => entity.kind !== "harvester") && sameEntityTile(state, command.x, command.y, firstEntity));
    case "repair": {
      const target = firstEntity?.entityId === undefined ? undefined : entitiesFor(state).find((entity) => entity.id === firstEntity.entityId);
      return command.type === "repair" && command.buildingId === firstEntity?.entityId && Boolean(target?.repairing);
    }
    default:
      return false;
  }
}

export function advanceTutorialAfterTick(state: SimState): void {
  if (state.tutorialStage === "build" && state.tutorialBuildId !== undefined) {
    const building = entitiesFor(state).find((entity) => entity.id === state.tutorialBuildId);
    if (building && building.hp > 0 && building.constructing === 0) enterTutorialStage(state, "produce");
    return;
  }
  if (state.tutorialStage !== "attack" || state.tutorialTargetId === undefined) return;
  const target = entitiesFor(state).find((entity) => entity.id === state.tutorialTargetId);
  if (!target || target.hp <= 0) enterTutorialStage(state, "repair");
}

export function enterTutorialStage(state: SimState, stage: TutorialStage): void {
  state.tutorialStage = stage;
  if (stage !== "build") delete state.tutorialBuildId;
  if (stage === "attack") {
    const existing = state.tutorialTargetId === undefined ? undefined : entitiesFor(state).find((entity) => entity.id === state.tutorialTargetId && entity.hp > 0);
    if (!existing) {
      const infantry = friendlyInfantry(state);
      if (infantry) {
        // Keep the drill unit well beyond the barracks and the normal infantry
        // spawn area so newly produced units do not auto-acquire it. The route
        // from the barracks is revealed after the target is created.
        const x = Math.max(1, Math.min(state.width - 2, Math.round(infantry.x) + 14));
        const y = Math.max(1, Math.min(state.height - 2, Math.round(infantry.y) + 8));
        const site = openTileNear(state, x, y);
        const target = trySpawnUnit(state, 1, "infantry", site.x, site.y);
        if (target) {
          target.stance = "hold";
          target.idle = true;
          state.tutorialTargetId = target.id;
        }
      }
    }
    const target = tutorialAttackTarget(state);
    const barracks = friendlyBuilding(state, "barracks");
    if (target && barracks) revealTutorialCorridor(state, barracks, target);
  }
  if (stage !== "repair") return;
  const buildings = entitiesFor(state).filter(
    (entity) =>
      entity.hp > 0 &&
      entity.owner === 0 &&
      entity.class === "building" &&
      entity.constructing === 0,
  );
  if (buildings.some((entity) => entity.hp < entity.maxHp)) return;
  const building = buildings[0];
  if (building) building.hp = Math.max(1, Math.floor(building.maxHp / 2));
}

function revealTutorialCorridor(state: SimState, from: Entity, to: Entity): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * 2));
  for (let step = 0; step <= steps; step++) {
    const x = Math.round(from.x + (dx * step) / steps);
    const y = Math.round(from.y + (dy * step) / steps);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const index = fogIndex(state, x + ox, y + oy);
        if (index !== null) state.fog[index] = 2;
      }
    }
  }
}

export function tutorialStageIndex(stage: TutorialStage | undefined): number {
  return Math.max(0, TUTORIAL_STAGES.indexOf(stage ?? "select"));
}

export { TUTORIAL_STAGES };
