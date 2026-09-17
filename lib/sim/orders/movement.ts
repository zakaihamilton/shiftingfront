import { findPathDetailed, routePendingFor } from "../pathfinding";
import { FOREGROUND_PATH_MAX_NODES, FOREGROUND_PATHS_PER_ORDER } from "../pathBudget";
import { flowFieldFor } from "../flowField";
import { isUnitEntity, type Entity, type Formation, type SimEvent, type SimState } from "../../types";
import { byId, inBounds, isStaticWalkable } from "../world";
import { clearSupportOrder } from "../support";

export function moveUnits(state: SimState, ids: number[], x: number, y: number, formation?: Formation): SimEvent[] {
  return issueTravelOrder(state, ids, x, y, "move", formation);
}

export function attackMoveUnits(state: SimState, ids: number[], x: number, y: number, formation?: Formation): SimEvent[] {
  return issueTravelOrder(state, ids, x, y, "attackMove", formation);
}

/** Assigns a single unit the same normal move order used by player commands. */
export function assignMoveDestination(state: SimState, e: Entity, x: number, y: number): void {
  if (!isUnitEntity(e)) return;
  issueTravelOrder(state, [e.id], x, y, "move");
}

function issueTravelOrder(
  state: SimState,
  ids: number[],
  x: number,
  y: number,
  orderMode: "move" | "attackMove",
  formation?: Formation,
): SimEvent[] {
  const tx = Math.round(x);
  const ty = Math.round(y);
  const movers = collectMovers(state, ids, orderMode === "attackMove");
  const dests = destinationsForGroup(state, movers, tx, ty, formation);
  const sharedFlowGoal = movers.length > 1 ? { x: tx, y: ty } : undefined;
  movers.forEach((e, index) => {
    clearSupportOrder(e);
    e.attackTarget = undefined;
    e.orderMode = orderMode;
    const destination = dests[index] ?? { x: tx, y: ty };
    e.orderDestination = destination;
    e.gatherX = undefined;
    e.gatherY = undefined;
    e.idle = false;
    if (e.kind === "harvester") e.moveToHarvest = true;
    if (formation) e.formation = formation;
    // The shared flow goal is only an approach field. The personal order
    // destination remains the unit's actual landing cell, so the group peels
    // off into distinct cells when it reaches the destination area.
    e.flowGoal = sharedFlowGoal ? { ...sharedFlowGoal } : undefined;
    e.routePending = false;
    if (sharedFlowGoal) {
      e.path = [];
      e.routePending = true;
      return;
    }
    if (index < FOREGROUND_PATHS_PER_ORDER) {
      const result = findPathDetailed(state, e, dests[index] ?? { x: tx, y: ty }, { maxNodes: FOREGROUND_PATH_MAX_NODES });
      e.path = result.path;
      e.routePending = routePendingFor(result.status);
    } else {
      e.path = [];
      e.routePending = true;
    }
  });
  return [];
}

export function collectMovers(state: SimState, ids: number[], attackMove: boolean): Entity[] {
  const movers: Entity[] = [];
  for (const id of ids) {
    const e = byId(state, id);
    if (!e || e.class !== "unit" || e.owner !== 0 || e.neutral) continue;
    if (attackMove && e.kind === "harvester") continue;
    movers.push(e);
  }
  return movers;
}

export function formationDestination(x: number, y: number, formation: Formation, index: number, count: number): { x: number; y: number } {
  const centered = index - (count - 1) / 2;
  if (formation === "column") return { x: x + Math.round(centered), y };
  if (formation === "wedge") return { x: x + Math.round(centered), y: y + Math.abs(Math.round(centered)) };
  return { x, y: y + Math.round(centered) };
}

export function nearbyWalkableSlots(state: SimState, x: number, y: number, count: number): { x: number; y: number }[] {
  return nearbyWalkableSlotsFrom(state, x, y, count);
}

function nearbyWalkableSlotsFrom(
  state: SimState,
  x: number,
  y: number,
  count: number,
  reachable?: (x: number, y: number) => boolean,
): { x: number; y: number }[] {
  const slots: { x: number; y: number }[] = [];
  const seen = new Set<number>();
  const take = (sx: number, sy: number) => {
    if (!inBounds(state, sx, sy) || !isStaticWalkable(state, sx, sy)) return;
    if (reachable && !reachable(sx, sy)) return;
    const key = sy * state.width + sx;
    if (seen.has(key)) return;
    seen.add(key);
    slots.push({ x: sx, y: sy });
  };
  const maxRadius = Math.max(16, Math.ceil(Math.sqrt(count)) * 2 + 4);
  for (let r = 0; r <= maxRadius && slots.length < count; r++) {
    if (r === 0) {
      take(x, y);
      continue;
    }
    for (let dy = -r; dy <= r && slots.length < count; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        take(x + dx, y + dy);
        if (slots.length >= count) break;
      }
    }
  }
  return slots;
}

export function snapUnique(
  state: SimState,
  x: number,
  y: number,
  taken: Set<number>,
  reachable?: (x: number, y: number) => boolean,
): { x: number; y: number } {
  for (let r = 0; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const sx = x + dx;
        const sy = y + dy;
        if (!inBounds(state, sx, sy) || !isStaticWalkable(state, sx, sy)) continue;
        if (reachable && !reachable(sx, sy)) continue;
        const key = sy * state.width + sx;
        if (taken.has(key)) continue;
        taken.add(key);
        return { x: sx, y: sy };
      }
    }
  }
  return { x, y };
}

export function assignNearest(units: Entity[], slots: { x: number; y: number }[]): { x: number; y: number }[] {
  const dests: { x: number; y: number }[] = units.map(() => slots[0] ?? { x: 0, y: 0 });
  const pairs: { ui: number; si: number; d: number }[] = [];
  for (let ui = 0; ui < units.length; ui++) {
    for (let si = 0; si < slots.length; si++) {
      const slot = slots[si]!;
      pairs.push({ ui, si, d: Math.hypot(units[ui]!.x - slot.x, units[ui]!.y - slot.y) });
    }
  }
  pairs.sort((a, b) => a.d - b.d || a.ui - b.ui || a.si - b.si);
  const unitTaken = new Set<number>();
  const slotTaken = new Set<number>();
  for (const pair of pairs) {
    if (unitTaken.has(pair.ui) || slotTaken.has(pair.si)) continue;
    unitTaken.add(pair.ui);
    slotTaken.add(pair.si);
    dests[pair.ui] = slots[pair.si]!;
  }
  return dests;
}

export function destinationsForGroup(
  state: SimState,
  units: Entity[],
  x: number,
  y: number,
  commandFormation?: Formation,
): { x: number; y: number }[] {
  if (units.length === 0) return [];
  if (units.length === 1) return [{ x, y }];
  const arrivalField = flowFieldFor(state, { x, y });
  const reachable = (sx: number, sy: number) => arrivalField.distance[sy * state.width + sx] !== -1;
  const shared = units.every((e) => e.formation && e.formation === units[0]!.formation)
    ? units[0]!.formation
    : undefined;
  const formation = commandFormation ?? shared;
  if (formation) {
    const taken = new Set<number>();
    const destinations = units.map((_, index) => {
      const raw = formationDestination(x, y, formation, index, units.length);
      return snapUnique(state, raw.x, raw.y, taken, reachable);
    });
    return ensureUniqueGroupDestinations(state, units, destinations, reachable);
  }
  return ensureUniqueGroupDestinations(
    state,
    units,
    assignNearest(units, nearbyWalkableSlotsFrom(state, x, y, units.length, reachable)),
    reachable,
  );
}

/** Keep the final landing cells distinct even when the local slot search is exhausted. */
function ensureUniqueGroupDestinations(
  state: SimState,
  units: Entity[],
  destinations: { x: number; y: number }[],
  reachable?: (x: number, y: number) => boolean,
): { x: number; y: number }[] {
  const taken = new Set<number>();
  return destinations.map((destination, index) => {
    const x = Math.round(destination.x);
    const y = Math.round(destination.y);
    const key = y * state.width + x;
    if (inBounds(state, x, y) && isStaticWalkable(state, x, y) && (!reachable || reachable(x, y)) && !taken.has(key)) {
      taken.add(key);
      return destination;
    }

    const unit = units[index]!;
    const fallbackX = Math.round(unit.x);
    const fallbackY = Math.round(unit.y);
    const sizeBeforeFallback = taken.size;
    const fallback = snapUnique(state, fallbackX, fallbackY, taken, reachable);
    const fallbackKey = Math.round(fallback.y) * state.width + Math.round(fallback.x);
    if (
      inBounds(state, Math.round(fallback.x), Math.round(fallback.y)) &&
      isStaticWalkable(state, Math.round(fallback.x), Math.round(fallback.y)) &&
      taken.size > sizeBeforeFallback &&
      taken.has(fallbackKey)
    ) {
      return fallback;
    }
    return destination;
  });
}
