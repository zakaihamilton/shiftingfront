import { BUILDING_STATS, isAirUnit, targetDomainsFor, UNIT_STATS } from "../../catalog";
import { isBuildingEntity, isUnitEntity, type BuildingKind, type Entity, type SimState, type UnitKind, type WeaponType } from "../../types";
import { entitiesFor } from "../entities";
import { directFireRangeBonusAt, groundUnitSightAt } from "../terrainRules";

export type CombatGrid = {
  state: SimState;
  cols: number;
  rows: number;
  cells: Entity[][];
  order: Int32Array;
  byId: Array<Entity | undefined>;
  targetable: Uint8Array;
  threat: Uint8Array;
};

const CELL = 8;
const gridBuffers = new WeakMap<SimState, CombatGrid>();
type CombatStats = Readonly<{
  damage: number;
  range: number;
  cooldown: number;
  weapon: WeaponType;
  splashRadius: number;
  suppression: number;
  targetDomains: readonly import("../../types").CombatTargetDomain[];
}>;
const NON_COMBAT_BUILDING_STATS: CombatStats = Object.freeze({
  damage: 0,
  range: 0,
  cooldown: 0,
  weapon: "smallArms",
  splashRadius: 0,
  suppression: 0,
  targetDomains: Object.freeze(["ground"] as const),
});
const unitCombatStats = new Map<UnitKind, CombatStats>();
const buildingCombatStats = new Map<BuildingKind, CombatStats>();

export function isCombatTarget(state: SimState, e: Entity): boolean {
  // Once a stranded rescue unit has been contacted, it is an evacuee rather
  // than an active combatant. Letting the enemy director reacquire it makes a
  // successful contact fail to the first patrol it passes on the way home.
  if (state.runtime?.kind === "rescue" && e.scenarioRole === "stranded" && !e.neutral) return false;
  if (e.scenarioRole === "convoy" && state.runtime?.convoyStartTick !== undefined) return false;
  return !e.neutral || e.scenarioRole === "convoy";
}

export function isCombatThreat(state: SimState, e: Entity): boolean {
  if (!isCombatTarget(state, e)) return false;
  if (e.class === "building" && e.constructing > 0) return false;
  return statsFor(e).damage > 0;
}

function combatDomainOf(e: Entity): import("../../types").CombatTargetDomain {
  return e.class === "unit" && isAirUnit(e.kind) ? "air" : "ground";
}

export function canTarget(attacker: Entity, target: Entity): boolean {
  return statsFor(attacker).targetDomains.includes(combatDomainOf(target));
}

export function statsFor(e: Entity): Readonly<CombatStats> {
  if (isUnitEntity(e)) {
    const cached = unitCombatStats.get(e.kind);
    if (cached) return cached;
    const stats = UNIT_STATS[e.kind];
    const combatStats: CombatStats = Object.freeze({
      ...stats,
      targetDomains: Object.freeze([...targetDomainsFor(e.kind)]),
    });
    unitCombatStats.set(e.kind, combatStats);
    return combatStats;
  }
  if (!isBuildingEntity(e)) return NON_COMBAT_BUILDING_STATS;
  const cached = buildingCombatStats.get(e.kind);
  if (cached) return cached;
  const combat = BUILDING_STATS[e.kind].combat;
  if (combat) {
    const combatStats: CombatStats = Object.freeze({
      damage: combat.damage,
      range: combat.range,
      cooldown: combat.cooldown,
      weapon: BUILDING_STATS[e.kind].weapon ?? "cannon",
      splashRadius: combat.splashRadius,
      suppression: combat.suppression,
      targetDomains: Object.freeze([...combat.targetDomains]),
    });
    buildingCombatStats.set(e.kind, combatStats);
    return combatStats;
  }
  buildingCombatStats.set(e.kind, NON_COMBAT_BUILDING_STATS);
  return NON_COMBAT_BUILDING_STATS;
}

export function buildGrid(state: SimState): CombatGrid {
  const cols = Math.max(1, Math.ceil(state.width / CELL));
  const rows = Math.max(1, Math.ceil(state.height / CELL));
  const size = cols * rows;
  const cached = gridBuffers.get(state);
  const cells = cached && cached.cols === cols && cached.rows === rows
    ? cached.cells
    : Array.from({ length: size }, () => [] as Entity[]);
  if (cached && cached.cols === cols && cached.rows === rows) {
    for (const cell of cells) cell.length = 0;
  }
  const order = cached && cached.cols === cols && cached.rows === rows && cached.order.length >= state.nextId
    ? cached.order
    : new Int32Array(Math.max(state.nextId, 1));
  const byId = cached && cached.cols === cols && cached.rows === rows && cached.byId.length >= state.nextId
    ? cached.byId
    : new Array<Entity | undefined>(Math.max(state.nextId, 1));
  const targetable = cached && cached.cols === cols && cached.rows === rows && cached.targetable.length >= state.nextId
    ? cached.targetable
    : new Uint8Array(Math.max(state.nextId, 1));
  const threat = cached && cached.cols === cols && cached.rows === rows && cached.threat.length >= state.nextId
    ? cached.threat
    : new Uint8Array(Math.max(state.nextId, 1));
  let orderCount = 0;
  // Rebuild from the current entity array. The buffers are intentionally
  // reused because combat runs once per tick and entity positions change.
  for (const e of entitiesFor(state)) {
    if (e.hp <= 0) continue;
    order[e.id] = orderCount++;
    byId[e.id] = e;
    targetable[e.id] = isCombatTarget(state, e) ? 1 : 0;
    threat[e.id] = targetable[e.id] === 1 && !(e.class === "building" && e.constructing > 0) && statsFor(e).damage > 0 ? 1 : 0;
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(e.x / CELL)));
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(e.y / CELL)));
    cells[cy * cols + cx]!.push(e);
  }
  const grid = { state, cols, rows, cells, order, byId, targetable, threat };
  gridBuffers.set(state, grid);
  return grid;
}

export function closestEnemy(
  grid: CombatGrid,
  e: Entity,
  maxDist: number,
  threatsOnly: boolean,
  includeHeightRange = false,
): Entity | undefined {
  const reach = maxDist + (includeHeightRange ? 1 : 0) + 3;
  const x0 = Math.max(0, Math.floor((e.x - reach) / CELL));
  const y0 = Math.max(0, Math.floor((e.y - reach) / CELL));
  const x1 = Math.min(grid.cols - 1, Math.floor((e.x + reach) / CELL));
  const y1 = Math.min(grid.rows - 1, Math.floor((e.y + reach) / CELL));
  const sourceHeight = grid.state.heights[Math.round(e.y) * grid.state.width + Math.round(e.x)] ?? 1;
  let best: Entity | undefined;
  let bestD2 = Infinity;
  let bestOrder = Infinity;
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const bucket = grid.cells[cy * grid.cols + cx];
      if (!bucket) continue;
      for (const o of bucket) {
        if (o.hp <= 0) continue;
        if (grid.targetable[o.id] !== 1) continue;
        if (o.owner === e.owner) continue;
        if (!canTarget(e, o)) continue;
        if (threatsOnly && grid.threat[o.id] !== 1) continue;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const d2 = dx * dx + dy * dy;
        const targetHeight = grid.state.heights[Math.round(o.y) * grid.state.width + Math.round(o.x)] ?? 1;
        const targetMaxDist = maxDist + (includeHeightRange && sourceHeight > targetHeight ? 1 : 0);
        if (d2 > targetMaxDist * targetMaxDist) continue;
        const rank = grid.order[o.id] ?? Infinity;
        if (d2 < bestD2 || (d2 === bestD2 && rank < bestOrder)) {
          bestD2 = d2;
          bestOrder = rank;
          best = o;
        }
      }
    }
  }
  return best;
}

export function acquire(grid: CombatGrid, e: Entity, threatsOnly = false): Entity | undefined {
  const stats = statsFor(e);
  const range = stats.range + (stats.weapon === "airStrike" ? 0 : directFireRangeBonusAt(grid.state, e));
  const sight = isUnitEntity(e)
    ? groundUnitSightAt(grid.state, e, UNIT_STATS[e.kind].sight)
    : isBuildingEntity(e) ? BUILDING_STATS[e.kind].sight : 0;
  return closestEnemy(grid, e, Math.max(range + 4, sight), threatsOnly);
}

export function acquirePreferred(grid: CombatGrid, e: Entity): Entity | undefined {
  return acquire(grid, e, true) ?? acquire(grid, e, false);
}

export function candidatesInSplash(grid: CombatGrid, x: number, y: number, radius: number): Entity[] {
  const reach = radius + 1;
  const x0 = Math.max(0, Math.floor((x - reach) / CELL));
  const y0 = Math.max(0, Math.floor((y - reach) / CELL));
  const x1 = Math.min(grid.cols - 1, Math.floor((x + reach) / CELL));
  const y1 = Math.min(grid.rows - 1, Math.floor((y + reach) / CELL));
  const result: Entity[] = [];
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const bucket = grid.cells[cy * grid.cols + cx];
      if (bucket) {
        for (const candidate of bucket) {
          result.push(candidate);
        }
      }
    }
  }
  return result;
}
