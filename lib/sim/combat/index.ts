import { isAirUnit } from "../../catalog";
import { distToEntity, livingView } from "../world";
import { rngFromState } from "../../seed/rng";
import { buildGrid, statsFor, canTarget, isCombatTarget, isCombatThreat, acquire, acquirePreferred, closestEnemy } from "./grid";
import { lineOfSight, firingPosition, heightRangeBonus } from "./targeting";
import { strike, chase } from "./damage";
import { createPendingAlerts, flushPlayerAlerts } from "./alerts";
import type { SimEvent, SimState } from "../../types";
import { tryFindPath } from "../pathBudget";

const EMPTY_EVENTS: SimEvent[] = [];

export function tickCombat(state: SimState, eventSink?: SimEvent[], collectEvents = true): SimEvent[] {
  const events = eventSink ?? (collectEvents ? [] : undefined);
  const pending = collectEvents ? createPendingAlerts() : undefined;
  const rng = rngFromState(state.rngState);
  const grid = buildGrid(state);
  for (const e of livingView(state)) {
    if (e.hp <= 0) continue;
    if (state.tutorialStage !== undefined && e.owner === 1) continue;
    if (e.class === "unit") e.suppression = Math.max(0, (e.suppression ?? 0) - 1);
    const st = statsFor(e);
    if (st.damage <= 0 || e.neutral) continue;
    if (e.class === "unit" && (e.flightState === "servicing" || e.landingRunwayId !== undefined)) continue;
    if (e.constructing > 0) continue;
    if (e.cooldown > 0) e.cooldown -= 1;

    const ordered = e.class === "unit" && !e.idle;
    if (ordered && e.orderMode === "attackMove") e.attackTarget = undefined;
    if (ordered && e.attackTarget !== undefined && e.orderMode !== "attackMove") {
      const assignedCandidate = grid.byId[e.attackTarget];
        const assigned = assignedCandidate && assignedCandidate.hp > 0 && isCombatTarget(state, assignedCandidate) && canTarget(e, assignedCandidate)
        ? assignedCandidate
        : undefined;
      if (!assigned) {
        e.attackTarget = undefined;
      } else {
        const d = distToEntity(e, assigned);
        const effectiveRange = st.range + heightRangeBonus(state, e, assigned);
        if (d <= effectiveRange) {
          e.path = [];
          e.routePending = false;
          e.flowGoal = undefined;
          if ((e.class === "unit" && isAirUnit(e.kind)) || (assigned.class === "unit" && isAirUnit(assigned.kind))) {
            strike(state, e, assigned, st, rng, events, pending, grid);
          } else if (lineOfSight(state, e, assigned)) {
            strike(state, e, assigned, st, rng, events, pending, grid);
          } else {
            const flank = firingPosition(state, e, assigned, effectiveRange);
            if (flank) {
              const path = tryFindPath(state, e, flank);
              if (path !== undefined) e.path = path;
            }
          }
        } else {
          const intercept = e.owner === 1 && !isCombatThreat(state, assigned)
            ? closestEnemy(grid, e, st.range, true)
            : undefined;
          if (intercept && ((e.class === "unit" && isAirUnit(e.kind)) || (intercept.class === "unit" && isAirUnit(intercept.kind)) || lineOfSight(state, e, intercept))) {
            e.attackTarget = intercept.id;
            e.path = [];
            e.routePending = false;
            e.flowGoal = undefined;
            strike(state, e, intercept, st, rng, events, pending, grid);
          } else {
            chase(state, e, assigned);
          }
        }
        continue;
      }
    }

    if (ordered && (e.path.length > 0 || e.flowGoal || e.routePending)) {
      // Travel orders may fire at targets already in weapon range, but they
      // never replace the route with a combat chase. Empty paths with a flow
      // goal or pending route are still in transit: marking them idle or
      // chasing would strand the original destination.
      const opportunity = closestEnemy(grid, e, st.range, false);
      if (opportunity && ((e.class === "unit" && isAirUnit(e.kind)) || (opportunity.class === "unit" && isAirUnit(opportunity.kind)) || lineOfSight(state, e, opportunity))) strike(state, e, opportunity, st, rng, events, pending, grid);
      continue;
    }

    if (ordered) e.idle = true;

    const stance = e.class === "unit" ? (e.stance ?? "aggressive") : "aggressive";
    const hold = stance === "hold";
    const defend = stance === "defensive";
    const inRangeThreat = hold ? undefined : closestEnemy(grid, e, st.range, true, defend);
    let target = inRangeThreat ?? (hold ? undefined : e.attackTarget !== undefined ? grid.byId[e.attackTarget] : undefined);
    if (target && target.hp <= 0) target = undefined;
    if (target && !isCombatThreat(state, target)) {
      const threat = hold || defend ? closestEnemy(grid, e, st.range, true, defend) : acquire(grid, e, true);
      if (threat) {
        target = threat;
        e.path = [];
        e.routePending = false;
      }
    }
    if (!target && !hold && !defend) target = acquirePreferred(grid, e);
    if (target) e.attackTarget = target.id;
    else {
      if (hold || defend) e.attackTarget = undefined;
      continue;
    }

    const d = distToEntity(e, target);
    const effectiveRange = st.range + heightRangeBonus(state, e, target);
    if (d <= effectiveRange && ((e.class === "unit" && isAirUnit(e.kind)) || (target.class === "unit" && isAirUnit(target.kind)) || lineOfSight(state, e, target))) {
      e.path = [];
      e.routePending = false;
      strike(state, e, target, st, rng, events, pending, grid);
      continue;
    }

    if (e.class === "unit" && !hold && !defend) chase(state, e, target);
    else {
      e.path = [];
      e.routePending = false;
      e.attackTarget = undefined;
    }
  }
  if (events && pending) flushPlayerAlerts(state, pending, events);
  state.rngState = rng.state;
  return events ?? EMPTY_EVENTS;
}
