import { isSupportUnit, UNIT_STATS } from "../../catalog";
import { isUnitEntity, type BuildingKind, type Command, type Entity, type MissionKind, type SimState, type UnitKind } from "../../types";
import { livingView } from "../world";

export const COMMANDER_CADENCE = 24;
export const COMBAT_ORDER_REFRESH = 96;
export const BUILDING_RESERVE = 180;
export const YARD_THREAT_RADIUS = 18;
// Offensive missions need a larger response buffer so the reserve can turn
// around before an assault wave reaches weapon range. Decapitation is a
// surgical strike: chasing scouts at the larger radius is what blows the
// deadline. Timed recovery already uses the generic yard radius.
export const OFFENSIVE_RESPONSE_RADIUS = 24;
// Keep this list aligned with generated structure-quota objectives. Barracks
// and factories are single-instance buildings, so asking the commander to
// build another one would produce a rejected command forever.
export const STRUCTURE_QUOTA_KINDS: BuildingKind[] = ["power", "refinery", "turret"];
export const OFFENSIVE_KINDS = new Set<MissionKind>([
  "sabotage",
  "destroyMarked",
  "decapitate",
  "razeAll",
  "annihilate",
]);
// Timed sabotage remains on the normal HQ response radius so defensive
// detours do not consume its deadline. Keep this separate from the broader
// offensive objective set used for production and assault readiness.
export const OFFENSIVE_RESPONSE_KINDS = new Set<MissionKind>([
  "destroyMarked",
  "razeAll",
  "annihilate",
]);

type CommanderViews = {
  tick: number;
  active: Entity[];
  playerBuildings: Entity[];
  playerUnits: Entity[];
  enemyEntities: Entity[];
};

const commanderViews = new WeakMap<SimState, CommanderViews>();

function viewsFor(state: SimState): CommanderViews {
  const active = livingView(state);
  const cached = commanderViews.get(state);
  if (cached?.tick === state.tick && cached.active === active) return cached;
  const views = cached ?? {
    tick: state.tick,
    active,
    playerBuildings: [],
    playerUnits: [],
    enemyEntities: [],
  };
  views.tick = state.tick;
  views.active = active;
  views.playerBuildings.length = 0;
  views.playerUnits.length = 0;
  views.enemyEntities.length = 0;
  for (const entity of active) {
    if (entity.owner === 0 && entity.class === "building") views.playerBuildings.push(entity);
    if (entity.owner === 0 && entity.class === "unit" && !entity.neutral) views.playerUnits.push(entity);
    if (entity.owner === 1) views.enemyEntities.push(entity);
  }
  commanderViews.set(state, views);
  return views;
}

export type CommanderMetrics = {
  plans: number;
  commands: number;
  commandsByType: Partial<Record<Command["type"], number>>;
};

/** Internal cached view. Callers must not mutate the returned array. */
export function playerBuildingsView(state: SimState, kind?: BuildingKind): Entity[] {
  const buildings = viewsFor(state).playerBuildings;
  return kind === undefined ? buildings : buildings.filter((entity) => entity.kind === kind);
}

/** Public snapshot that cannot poison the commander query cache. */
export function playerBuildings(state: SimState, kind?: BuildingKind): Entity[] {
  return playerBuildingsView(state, kind).slice();
}

/** Internal cached view. Callers must not mutate the returned array. */
export function playerUnitsView(state: SimState, predicate?: (entity: Entity) => boolean): Entity[] {
  const units = viewsFor(state).playerUnits;
  return predicate ? units.filter(predicate) : units;
}

/** Public snapshot that cannot poison the commander query cache. */
export function playerUnits(state: SimState, predicate?: (entity: Entity) => boolean): Entity[] {
  return playerUnitsView(state, predicate).slice();
}

/** Internal cached view. Callers must not mutate the returned array. */
export function enemyEntitiesView(state: SimState): Entity[] {
  return viewsFor(state).enemyEntities;
}

/** Public snapshot that cannot poison the commander query cache. */
export function enemyEntities(state: SimState): Entity[] {
  return enemyEntitiesView(state).slice();
}

export function combatUnits(state: SimState): Entity[] {
  return playerUnitsView(
    state,
    (entity) => isUnitEntity(entity) && UNIT_STATS[entity.kind].damage > 0 && !isSupportUnit(entity.kind),
  );
}

export function readyProducers(state: SimState, kind: BuildingKind): Entity[] {
  return playerBuildingsView(state, kind).filter((entity) => entity.constructing === 0);
}

export function queuedUnitCount(state: SimState, kind: UnitKind): number {
  let count = 0;
  for (const producer of playerBuildingsView(state)) {
    const active = producer.producing?.kind === kind ? 1 : 0;
    let queued = 0;
    for (const item of producer.queue ?? []) if (item === kind) queued += 1;
    count += active + queued;
  }
  return count;
}

export function totalUnitCount(state: SimState, kind: UnitKind): number {
  return playerUnitsView(state, (entity) => entity.kind === kind).length;
}

export function completedOrBuilding(state: SimState, kind: BuildingKind): number {
  return playerBuildingsView(state, kind).length;
}

export function combatValue(entity: Entity): number {
  if (entity.kind === "tank") return 4;
  if (entity.kind === "antiArmor") return 3;
  if (entity.kind === "infantry") return 1;
  return 0;
}

export function isCombatEntity(entity: Entity): boolean {
  return isUnitEntity(entity) && UNIT_STATS[entity.kind].damage > 0 && !isSupportUnit(entity.kind);
}

export function objectiveKind(state: SimState): MissionKind {
  return state.win.kind;
}

export function commanderCadence(): number {
  return COMMANDER_CADENCE;
}
