import type { Entity, SimState, Vec2 } from "../../types";
import { isCombatTarget, statsFor } from "../combat/grid";
import { inBounds, isStaticWalkable, livingView } from "../world";
import { enemyKnownPlayerEntities } from "./visibility";

export type InfluenceCell = {
  friendly: number;
  threat: number;
  tension: number;
};

export type InfluenceMap = {
  cols: number;
  rows: number;
  cellSize: number;
  cells: Float32Array;
  width: number;
  height: number;
};

const INFLUENCE_CELL_SIZE = 8;
const INFLUENCE_CACHE_TICKS = 12;
const influenceCache = new WeakMap<SimState, { tick: number; knownPlayersKey?: string; map: InfluenceMap }>();

function knownPlayersKey(knownPlayers: Entity[] | undefined): string | undefined {
  if (knownPlayers === undefined) return undefined;
  return knownPlayers
    .map((entity) => [
      entity.id,
      entity.owner,
      entity.class,
      entity.kind,
      entity.x,
      entity.y,
      entity.hp,
      entity.constructing,
      entity.neutral ? 1 : 0,
      entity.scenarioRole ?? "",
    ].join(":"))
    .sort()
    .join("|");
}

export function cellIndex(map: InfluenceMap, x: number, y: number): number {
  const cx = Math.max(0, Math.min(map.cols - 1, Math.floor(x / map.cellSize)));
  const cy = Math.max(0, Math.min(map.rows - 1, Math.floor(y / map.cellSize)));
  return cy * map.cols + cx;
}

export function cellInfluence(map: InfluenceMap, x: number, y: number): InfluenceCell {
  const idx = cellIndex(map, x, y) * 3;
  return {
    friendly: map.cells[idx] ?? 0,
    threat: map.cells[idx + 1] ?? 0,
    tension: map.cells[idx + 2] ?? 0,
  };
}

export function buildInfluenceMap(state: SimState, knownPlayers?: Entity[]): InfluenceMap {
  const playersKey = knownPlayersKey(knownPlayers);
  const cached = influenceCache.get(state);
  if (cached && cached.knownPlayersKey === playersKey && state.tick - cached.tick < INFLUENCE_CACHE_TICKS) {
    return cached.map;
  }

  const cols = Math.max(1, Math.ceil(state.width / INFLUENCE_CELL_SIZE));
  const rows = Math.max(1, Math.ceil(state.height / INFLUENCE_CELL_SIZE));
  const numCells = cols * rows;
  const cells = new Float32Array(numCells * 3);

  const applyPower = (x: number, y: number, power: number, offset: 0 | 1) => {
    const cx = Math.max(0, Math.min(cols - 1, Math.floor(x / INFLUENCE_CELL_SIZE)));
    const cy = Math.max(0, Math.min(rows - 1, Math.floor(y / INFLUENCE_CELL_SIZE)));
    for (let dy = -1; dy <= 1; dy++) {
      const ny = cy + dy;
      if (ny < 0 || ny >= rows) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx;
        if (nx < 0 || nx >= cols) continue;
        const d = Math.hypot(dx, dy);
        const weight = d === 0 ? 1 : 0.45;
        cells[(ny * cols + nx) * 3 + offset] += power * weight;
      }
    }
  };

  // Bot (Friendly) forces
  for (const entity of livingView(state)) {
    if (entity.owner !== 1 || entity.hp <= 0) continue;
    const stats = statsFor(entity);
    const power = stats.damage > 0 ? stats.damage * 2 + entity.hp * 0.1 : entity.hp * 0.05;
    applyPower(entity.x, entity.y, power, 0);
  }

  // Detected player (Threat) forces
  const players = knownPlayers ?? enemyKnownPlayerEntities(state);
  for (const target of players) {
    if (target.hp <= 0 || !isCombatTarget(state, target)) continue;
    const stats = statsFor(target);
    const power = stats.damage > 0 ? stats.damage * 2 + target.hp * 0.1 : target.hp * 0.05;
    applyPower(target.x, target.y, power, 1);
  }

  // Compute tension: friendly * threat
  for (let i = 0; i < numCells; i++) {
    const friendly = cells[i * 3]!;
    const threat = cells[i * 3 + 1]!;
    cells[i * 3 + 2] = friendly * threat;
  }

  const map: InfluenceMap = {
    cols,
    rows,
    cellSize: INFLUENCE_CELL_SIZE,
    cells,
    width: state.width,
    height: state.height,
  };

  influenceCache.set(state, { tick: state.tick, knownPlayersKey: playersKey, map });
  return map;
}

/**
 * Finds an assault flank approach around target that has lowest player defensive threat.
 */
export function findWeakestFlank(
  state: SimState,
  map: InfluenceMap,
  targetYard: Entity,
  flankRadius = 12,
): Vec2 | undefined {
  const angles = [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75, Math.PI, Math.PI * 1.25, Math.PI * 1.5, Math.PI * 1.75];
  let bestPoint: Vec2 | undefined;
  let lowestThreat = Infinity;

  for (const angle of angles) {
    const fx = Math.round(targetYard.x + Math.cos(angle) * flankRadius);
    const fy = Math.round(targetYard.y + Math.sin(angle) * flankRadius);
    if (!inBounds(state, fx, fy) || !isStaticWalkable(state, fx, fy)) continue;
    const inf = cellInfluence(map, fx, fy);
    if (inf.threat < lowestThreat) {
      lowestThreat = inf.threat;
      bestPoint = { x: fx, y: fy };
    }
  }

  return bestPoint;
}
