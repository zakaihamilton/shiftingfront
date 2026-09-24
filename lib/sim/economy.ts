import { HARVEST_PER_TICK, UNIT_STATS } from "../catalog";
import { toIsometricFacing } from "../iso";
import { TILE_RESOURCE } from "../types";
import type { Entity, SimEvent, SimState } from "../types";
import { tryFindPathDetailed } from "./pathBudget";
import { routePendingFor } from "./pathfinding";
import { at, closestApproach, dist, distToEntity, inBounds, livingView, nearest, tileAt } from "./world";
import { entitiesFor } from "./entities";

export const HARVEST_RANGE = 1.5;

const resourceIndex = new WeakMap<SimState, number[]>();
const economyClaims = new WeakMap<SimState, Map<number, number>>();

export function resourceTiles(state: SimState): number[] {
  let list = resourceIndex.get(state);
  if (!list) {
    list = [];
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const i = at(state, x, y);
        if (tileAt(state, x, y) === TILE_RESOURCE && state.resourceAmount[i]! > 0) list.push(i);
      }
    }
    resourceIndex.set(state, list);
  }
  return list;
}

function dropResourceTile(state: SimState, index: number): void {
  const list = resourceIndex.get(state);
  if (!list) return;
  const atIndex = list.indexOf(index);
  if (atIndex >= 0) list.splice(atIndex, 1);
}

export function resourceTileAt(state: SimState, x: number, y: number): boolean {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (!inBounds(state, rx, ry)) return false;
  const i = ry * state.width + rx;
  return tileAt(state, rx, ry) === TILE_RESOURCE && (state.resourceAmount[i] ?? 0) > 0;
}

export function nearestResourceNear(
  state: SimState,
  center: { x: number; y: number },
  maxDistance = 3,
): { x: number; y: number } | undefined {
  const list = resourceTiles(state);
  let best: { x: number; y: number } | undefined;
  let bestD2 = Infinity;
  const maxDistance2 = maxDistance * maxDistance;
  for (const i of list) {
    if (state.resourceAmount[i]! <= 0) continue;
    const x = i % state.width;
    const y = (i - x) / state.width;
    const dx = center.x - x;
    const dy = center.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= maxDistance2 && d2 < bestD2) {
      bestD2 = d2;
      best = { x, y };
    }
  }
  return best;
}

export function nearestResource(state: SimState, from: Entity): { x: number; y: number } | undefined {
  const list = resourceTiles(state);
  let best: { x: number; y: number } | undefined;
  let bestD2 = Infinity;
  for (const i of list) {
    if (state.resourceAmount[i]! <= 0) continue;
    const x = i % state.width;
    const y = (i - x) / state.width;
    const dx = from.x - x;
    const dy = from.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = { x, y };
    }
  }
  return best;
}

export function bestResource(
  state: SimState,
  from: Entity,
  claims: Map<number, number>,
  preferredCenter?: { x: number; y: number },
): { x: number; y: number } | undefined {
  const list = resourceTiles(state);
  let best: { x: number; y: number } | undefined;
  let bestScore = Infinity;
  const center = preferredCenter ?? from;

  for (const i of list) {
    if (state.resourceAmount[i]! <= 0) continue;
    const x = i % state.width;
    const y = (i - x) / state.width;
    const dCenter = Math.hypot(center.x - x, center.y - y);
    const dFrom = Math.hypot(from.x - x, from.y - y);
    const claimCount = claims.get(i) ?? 0;
    const score = claimCount * 8 + dCenter * 0.5 + dFrom * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }
  return best;
}

const EMPTY_EVENTS: SimEvent[] = [];

export function tickEconomy(state: SimState, eventSink?: SimEvent[], collectEvents = true): SimEvent[] {
  const events = eventSink ?? (collectEvents ? [] : undefined);
  const claims = economyClaims.get(state) ?? new Map<number, number>();
  claims.clear();
  economyClaims.set(state, claims);

  for (const e of livingView(state)) {
    if (e.kind !== "harvester" || e.hp <= 0) continue;
    if (e.gatherX !== undefined && e.gatherY !== undefined) {
      const key = at(state, e.gatherX, e.gatherY);
      claims.set(key, (claims.get(key) ?? 0) + 1);
    }
  }

  for (const e of livingView(state)) {
    if (e.kind !== "harvester" || e.hp <= 0) continue;
    // Harvesters use their economy assignment rather than a player group
    // flow field once the economy loop takes control of their route.
    e.flowGoal = undefined;
    const carryMax = UNIT_STATS.harvester.carryMax;
    const shouldReturnToRefinery = e.carry >= carryMax || (e.carry > 0 && !nearestResource(state, e));
    if (shouldReturnToRefinery) {
      const ref = nearest(
        state,
        e,
        (b) =>
          b.class === "building" &&
          b.kind === "refinery" &&
          b.owner === e.owner &&
          b.constructing === 0,
      );
      if (!ref) continue;
      const destination = closestApproach(state, e, ref);
      if (!e.orderDestination || e.orderDestination.x !== destination.x || e.orderDestination.y !== destination.y) {
        e.routePending = undefined;
      }
      e.orderDestination = destination;
      if (distToEntity(e, ref) <= 1.6) {
        const amount = e.carry;
        e.carry = 0;
        state.credits[e.owner] += amount;
        state.creditsEarned[e.owner] += amount;
        events?.push({ type: "credits", owner: e.owner, amount });
        e.path = [];
        e.routePending = false;
      } else if (!e.path.length && e.routePending !== false) {
        const result = tryFindPathDetailed(state, e, destination);
        if (result) {
          e.path = result.path;
          e.routePending = routePendingFor(result.status);
        }
      }
      continue;
    }

    // If the harvester is executing a player-issued move command, let it travel
    // to its destination first before the economy loop starts looking for ore.
    if (e.moveToHarvest && e.orderDestination) {
      const arrived =
        (e.path.length === 0 && !e.routePending) ||
        dist(e, e.orderDestination) <= HARVEST_RANGE;
      if (!arrived) {
        // Still en route — don't touch its path or destination.
        continue;
      }
      // Arrived at destination. Clear the move-first flag and let economy take over.
      e.moveToHarvest = undefined;
    }

    let gx = e.gatherX;
    let gy = e.gatherY;

    const currentTileX = Math.round(e.x);
    const currentTileY = Math.round(e.y);
    const lateEconomicScenario = state.missionIndex >= 4 && (state.win.kind === "harvestQuota" || state.win.kind === "extraction");
    const refineryPreference = lateEconomicScenario
      ? entitiesFor(state).find(
        (entity) => entity.owner === e.owner && entity.class === "building" && entity.kind === "refinery" && entity.constructing === 0,
      )
      : undefined;
    // Keep an explicit harvest assignment while the harvester is leaving the
    // current field. Without this guard, clicking a new field while already
    // harvesting immediately gets overwritten by the resource underfoot.
    const assignedResource = gx !== undefined && gy !== undefined && resourceTileAt(state, gx, gy);
    if (!assignedResource && resourceTileAt(state, currentTileX, currentTileY)) {
      gx = currentTileX;
      gy = currentTileY;
      e.gatherX = gx;
      e.gatherY = gy;
    } else if (
      gx === undefined ||
      gy === undefined ||
      !resourceTileAt(state, gx, gy) ||
      ((e.blockedTicks ?? 0) >= 6 && Math.hypot(e.x - gx, e.y - gy) > HARVEST_RANGE)
    ) {
      const preferred =
        gx !== undefined && gy !== undefined && inBounds(state, gx, gy)
          ? { x: gx, y: gy }
          : e.orderDestination ?? refineryPreference ?? { x: currentTileX, y: currentTileY };
      const n = bestResource(state, e, claims, preferred);
      if (!n) continue;
      gx = n.x;
      gy = n.y;
      e.gatherX = gx;
      e.gatherY = gy;
      e.routePending = undefined;
      e.blockedTicks = 0;
      const key = at(state, gx, gy);
      claims.set(key, (claims.get(key) ?? 0) + 1);
    }

    if (!e.orderDestination || e.orderDestination.x !== gx || e.orderDestination.y !== gy) {
      e.routePending = undefined;
    }
    e.orderDestination = { x: gx, y: gy };

    if (Math.hypot(e.x - gx, e.y - gy) <= HARVEST_RANGE) {
      const i = at(state, gx, gy);
      const take = Math.min(HARVEST_PER_TICK, state.resourceAmount[i]!, carryMax - e.carry);
      state.resourceAmount[i]! -= take;
      e.carry += take;
      e.path = [];
      e.routePending = false;
      const fdx = gx - e.x;
      const fdy = gy - e.y;
      if (Math.hypot(fdx, fdy) > 0.001) {
        e.facing = toIsometricFacing(fdx, fdy);
      }
      if (state.resourceAmount[i]! <= 0) {
        state.tiles[i] = 0;
        e.gatherX = undefined;
        e.gatherY = undefined;
        e.orderDestination = undefined;
        e.routePending = undefined;
        dropResourceTile(state, i);
      }
    } else if (!e.path.length && e.routePending !== false) {
      const result = tryFindPathDetailed(state, e, { x: gx, y: gy });
      if (result) {
        e.path = result.path;
        e.routePending = routePendingFor(result.status);
      }
    }
  }
  return events ?? EMPTY_EVENTS;
}
