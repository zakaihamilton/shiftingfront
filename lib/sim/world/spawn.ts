import { BUILDING_STATS, UNIT_STATS, footprintOf, isAirUnit } from "../../catalog";
import { isBuildingEntity, type BuildingKind, type Entity, type Owner, type SimState, type UnitKind, type Vec2 } from "../../types";
import { livingView, invalidateEntityCaches, distToEntity, powerBreakdownFor } from "./queries";
import { invalidateNavigation, isWalkable, canClimb } from "./terrain";
import { DEFAULT_BUILDING_CLEARANCE, findBuildSite, INITIAL_BUILDING_EDGE_MARGIN } from "./building";

export function closestApproach(state: SimState, from: Vec2, e: Entity): Vec2 {
  if (!isBuildingEntity(e)) return { x: e.x, y: e.y };
  const fp = footprintOf(e.kind);
  let best: Vec2 = { x: e.x, y: e.y };
  let bestD = Infinity;
  for (let oy = 0; oy < fp.h; oy++) {
    for (let ox = 0; ox < fp.w; ox++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = e.x + ox + dx;
          const ny = e.y + oy + dy;
          if (nx >= e.x && nx < e.x + fp.w && ny >= e.y && ny < e.y + fp.h) continue;
          if (!isWalkable(state, nx, ny)) continue;
          if (!canClimb(state, e.x + ox, e.y + oy, nx, ny)) continue;
          const d = Math.hypot(from.x - nx, from.y - ny);
          if (d < bestD) {
            bestD = d;
            best = { x: nx, y: ny };
          }
        }
      }
    }
  }
  return best;
}

export function nextEntityId(state: SimState): number {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}

export function makeUnit(
  state: SimState,
  owner: Owner,
  kind: UnitKind,
  x: number,
  y: number,
): Entity {
  const stats = UNIT_STATS[kind];
  const air = isAirUnit(kind);
  return {
    id: nextEntityId(state),
    owner,
    class: "unit",
    kind,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    cooldown: 0,
    path: [],
    carry: 0,
    constructing: 0,
    queue: [],
    marked: false,
    idle: true,
    facing: owner === 0 ? 0 : 4,
    stance: "aggressive",
    suppression: 0,
    armor: stats.armor,
    weapon: stats.weapon,
    supportMode: stats.supportRole ? "auto" : undefined,
    ammo: stats.ammoMax,
    maxAmmo: stats.ammoMax,
    flightState: air ? "airborne" : undefined,
  };
}

export function makeBuilding(
  state: SimState,
  owner: Owner,
  kind: BuildingKind,
  x: number,
  y: number,
  constructing = 0,
  marked = false,
): Entity {
  const stats = BUILDING_STATS[kind];
  return {
    id: nextEntityId(state),
    owner,
    class: "building",
    kind,
    x,
    y,
    hp: stats.hp,
    maxHp: stats.hp,
    cooldown: 0,
    path: [],
    carry: 0,
    constructing,
    queue: [],
    marked,
    idle: true,
    facing: owner === 0 ? 0 : 4,
    stance: "aggressive",
    suppression: 0,
    armor: stats.armor,
    weapon: stats.weapon,
  };
}

export function nearest(
  state: SimState,
  from: Vec2,
  pred: (e: Entity) => boolean,
): Entity | undefined {
  let best: Entity | undefined;
  let bestD = Infinity;
  for (const e of livingView(state)) {
    if (!pred(e)) continue;
    const d = distToEntity(from, e);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export function powerBreakdown(state: SimState, owner: Owner): { produced: number; used: number; surplus: number } {
  return { ...powerBreakdownFor(state, owner) };
}

export function powerFor(state: SimState, owner: Owner): number {
  return powerBreakdownFor(state, owner).surplus;
}

function unitSite(state: SimState, x: number, y: number, maxR = 12): Vec2 | undefined {
  const cx = Math.round(x);
  const cy = Math.round(y);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (isWalkable(state, nx, ny)) return { x: nx, y: ny };
      }
    }
  }
  return undefined;
}

export function spawnUnit(
  state: SimState,
  owner: Owner,
  kind: UnitKind,
  x: number,
  y: number,
): Entity {
  const e = trySpawnUnit(state, owner, kind, x, y);
  if (!e) throw new Error("No free square available for unit spawn");
  return e;
}

export function trySpawnUnit(
  state: SimState,
  owner: Owner,
  kind: UnitKind,
  x: number,
  y: number,
): Entity | undefined {
  const site = isAirUnit(kind)
    ? {
        x: Math.max(0, Math.min(state.width - 1, Math.round(x))),
        y: Math.max(0, Math.min(state.height - 1, Math.round(y))),
      }
    : unitSite(state, x, y);
  if (!site) return undefined;
  const e = makeUnit(state, owner, kind, x, y);
  e.x = site.x;
  e.y = site.y;
  state.entities.push(e);
  invalidateEntityCaches(state);
  return e;
}

export function spawnBuilding(
  state: SimState,
  owner: Owner,
  kind: BuildingKind,
  x: number,
  y: number,
  constructing = 0,
  marked = false,
): Entity {
  const e = makeBuilding(state, owner, kind, x, y, constructing, marked);
  state.entities.push(e);
  invalidateEntityCaches(state);
  invalidateNavigation(state);
  return e;
}

export function spawnBuildingAt(
  state: SimState,
  owner: Owner,
  kind: BuildingKind,
  x: number,
  y: number,
  constructing = 0,
  marked = false,
  siteFilter?: (x: number, y: number) => boolean,
  maxR = 14,
): Entity | undefined {
  const spot = findBuildSite(
    state,
    kind,
    x,
    y,
    maxR,
    owner,
    false,
    DEFAULT_BUILDING_CLEARANCE,
    INITIAL_BUILDING_EDGE_MARGIN,
    siteFilter,
  );
  if (!spot) return undefined;
  return spawnBuilding(state, owner, kind, spot.x, spot.y, constructing, marked);
}

export function emptyRoleCounts(): Record<UnitKind, number> {
  return { harvester: 0, infantry: 0, antiArmor: 0, tank: 0, medic: 0, repairTruck: 0, convoyTruck: 0, strikePlane: 0 };
}
