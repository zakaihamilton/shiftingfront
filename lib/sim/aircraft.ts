import { footprintOf, isAirUnit, UNIT_STATS } from "../catalog";
import { isBuildingEntity, isUnitEntity, type Entity, type SimEvent, type SimState } from "../types";
import { byId } from "./world";
import { canTarget, isCombatTarget } from "./combat/grid";

type Aircraft = import("../types").UnitEntity & { kind: "strikePlane" };

export const AIRCRAFT_SERVICE_AMMO_INTERVAL = 18;
export const AIRCRAFT_SERVICE_REPAIR_PER_TICK = 12;
export const AIRCRAFT_AUTO_RETURN_HP_RATIO = 0.35;
export const AIRCRAFT_LANDING_RADIUS = 1.25;

export function isAircraft(entity: Entity): entity is Aircraft {
  return isUnitEntity(entity) && isAirUnit(entity.kind);
}

export function runwayServicePoint(runway: Entity): { x: number; y: number } {
  const footprint = footprintOf(runway.kind as import("../types").BuildingKind);
  return {
    x: runway.x + (footprint.w - 1) / 2,
    y: runway.y + (footprint.h - 1) / 2,
  };
}

function assignedRunway(state: SimState, aircraft: Entity): Entity | undefined {
  const runwayId = aircraft.assignedRunwayId;
  if (runwayId === undefined) return undefined;
  const runway = byId(state, runwayId);
  return runway && isBuildingEntity(runway) && runway.kind === "runway" && runway.owner === aircraft.owner && runway.hp > 0
    ? runway
    : undefined;
}

function clearRunwayAssignment(state: SimState, aircraft: Entity): void {
  const runway = aircraft.assignedRunwayId === undefined ? undefined : byId(state, aircraft.assignedRunwayId);
  if (runway?.class === "building" && runway.kind === "runway" && runway.assignedPlaneId === aircraft.id) {
    runway.assignedPlaneId = undefined;
  }
  aircraft.assignedRunwayId = undefined;
}

function resumableAttackTarget(state: SimState, aircraft: Aircraft): Entity | undefined {
  if (aircraft.attackTarget === undefined) return undefined;
  const target = byId(state, aircraft.attackTarget);
  return target && target.hp > 0 && target.owner !== aircraft.owner && !target.neutral && isCombatTarget(state, target) && canTarget(aircraft, target)
    ? target
    : undefined;
}

function setAirborne(aircraft: Entity): void {
  aircraft.flightState = "airborne";
  aircraft.serviceTicks = undefined;
  aircraft.landingRunwayId = undefined;
  aircraft.idle = false;
}

export function launchAircraft(state: SimState, aircraft: Entity, events?: SimEvent[]): void {
  if (!isAircraft(aircraft) || aircraft.flightState !== "servicing") return;
  // Auto-returning aircraft retain their target while they service. Restore
  // the attack order here so the normal aircraft tick resumes the sortie
  // instead of leaving the plane parked with only a stale target id.
  const resumedTarget = resumableAttackTarget(state, aircraft);
  setAirborne(aircraft);
  aircraft.path = [];
  if (resumedTarget) {
    aircraft.orderMode = "attack";
    aircraft.orderDestination = { x: resumedTarget.x, y: resumedTarget.y };
  } else {
    aircraft.orderDestination = undefined;
    aircraft.orderMode = undefined;
  }
  events?.push({
    type: "aircraftStatus",
    owner: aircraft.owner,
    aircraftId: aircraft.id,
    runwayId: aircraft.assignedRunwayId,
    status: "launched",
    x: aircraft.x,
    y: aircraft.y,
  });
}

export function landAircraft(state: SimState, ids: number[], runwayId: number): SimEvent[] {
  const runway = byId(state, runwayId);
  if (!runway || !isBuildingEntity(runway) || runway.kind !== "runway" || runway.owner !== 0 || runway.constructing > 0 || runway.hp <= 0) {
    return [{ type: "commandRejected", reason: "invalid runway" }];
  }

  let assigned = 0;
  for (const id of ids) {
    const aircraft = byId(state, id);
    if (!aircraft || !isAircraft(aircraft) || aircraft.owner !== 0 || aircraft.neutral) continue;
    const currentRunway = aircraft.assignedRunwayId !== undefined ? byId(state, aircraft.assignedRunwayId) : undefined;
    const runwayAvailable = runway.assignedPlaneId === undefined || runway.assignedPlaneId === aircraft.id;
    if (aircraft.assignedRunwayId !== runway.id) {
      if (!runwayAvailable) continue;
      if (currentRunway && currentRunway.hp > 0 && currentRunway.owner === aircraft.owner) continue;
      clearRunwayAssignment(state, aircraft);
      aircraft.assignedRunwayId = runway.id;
      runway.assignedPlaneId = aircraft.id;
    } else if (!runwayAvailable) {
      continue;
    }
    aircraft.landingRunwayId = runway.id;
    aircraft.orderMode = "move";
    aircraft.orderDestination = runwayServicePoint(runway);
    aircraft.attackTarget = undefined;
    aircraft.path = [];
    aircraft.idle = false;
    assigned += 1;
  }
  return assigned ? [] : [{ type: "commandRejected", reason: "no eligible aircraft" }];
}

function beginReturn(state: SimState, aircraft: Entity, runway: Entity, events?: SimEvent[]): void {
  if (aircraft.landingRunwayId === runway.id) return;
  aircraft.landingRunwayId = runway.id;
  aircraft.orderMode = "move";
  aircraft.orderDestination = runwayServicePoint(runway);
  aircraft.path = [];
  aircraft.idle = false;
  events?.push({
    type: "aircraftStatus",
    owner: aircraft.owner,
    aircraftId: aircraft.id,
    runwayId: runway.id,
    status: "returning",
    x: aircraft.x,
    y: aircraft.y,
  });
}

function serviceAircraft(state: SimState, aircraft: Entity, events?: SimEvent[]): void {
  if (!isAircraft(aircraft) || aircraft.flightState !== "servicing") return;
  const runway = assignedRunway(state, aircraft);
  if (!runway || runway.constructing > 0 || runway.hp <= 0) {
    clearRunwayAssignment(state, aircraft);
    setAirborne(aircraft);
    aircraft.idle = true;
    return;
  }

  const stats = UNIT_STATS[aircraft.kind];
  const maxAmmo = stats.ammoMax ?? aircraft.maxAmmo ?? 0;
  aircraft.maxAmmo = maxAmmo;
  const serviceTicks = (aircraft.serviceTicks ?? 0) + 1;
  if (serviceTicks >= AIRCRAFT_SERVICE_AMMO_INTERVAL) {
    aircraft.ammo = Math.min(maxAmmo, (aircraft.ammo ?? maxAmmo) + 1);
    aircraft.serviceTicks = 0;
  } else {
    aircraft.serviceTicks = serviceTicks;
  }
  aircraft.hp = Math.min(aircraft.maxHp, aircraft.hp + AIRCRAFT_SERVICE_REPAIR_PER_TICK);
  const servicePoint = runwayServicePoint(runway);
  aircraft.x = servicePoint.x;
  aircraft.y = servicePoint.y;
  aircraft.facing = aircraft.owner === 0 ? 1 : 5;
  aircraft.path = [];
  aircraft.orderDestination = undefined;
  aircraft.orderMode = undefined;
  aircraft.idle = true;
  if ((aircraft.ammo ?? 0) >= maxAmmo && aircraft.hp >= aircraft.maxHp) {
    if (resumableAttackTarget(state, aircraft)) launchAircraft(state, aircraft, events);
    else aircraft.attackTarget = undefined;
  }
}

function moveAircraft(aircraft: Aircraft, destination: { x: number; y: number }): void {
  const stats = UNIT_STATS[aircraft.kind];
  const dx = destination.x - aircraft.x;
  const dy = destination.y - aircraft.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= stats.speed || distance <= 0.001) {
    aircraft.x = destination.x;
    aircraft.y = destination.y;
    aircraft.path = [];
    aircraft.idle = true;
    aircraft.routePending = false;
    aircraft.orderDestination = undefined;
    aircraft.orderMode = undefined;
    return;
  }
  aircraft.x += dx / distance * stats.speed;
  aircraft.y += dy / distance * stats.speed;
  aircraft.facing = Math.round(((Math.atan2(dy, dx) / (Math.PI * 2)) * 8 + 8) % 8) as import("../types").Facing;
  aircraft.path = [{ ...destination }];
  aircraft.idle = false;
}

export function tickAircraft(state: SimState, eventSink?: SimEvent[]): void {
  for (const aircraft of state.entities) {
    if (!isAircraft(aircraft) || aircraft.hp <= 0) continue;
    aircraft.flightState ??= "airborne";
    if (aircraft.flightState === "servicing") {
      serviceAircraft(state, aircraft, eventSink);
      continue;
    }

    const runway = assignedRunway(state, aircraft);
    if (!runway) {
      if (aircraft.assignedRunwayId !== undefined) aircraft.assignedRunwayId = undefined;
    } else if ((aircraft.ammo ?? 0) <= 0 || aircraft.hp / aircraft.maxHp <= AIRCRAFT_AUTO_RETURN_HP_RATIO) {
      beginReturn(state, aircraft, runway, eventSink);
    }

    const landingRunway = aircraft.landingRunwayId === undefined ? undefined : byId(state, aircraft.landingRunwayId);
    if (aircraft.landingRunwayId !== undefined && (!landingRunway || landingRunway.kind !== "runway" || landingRunway.owner !== aircraft.owner || landingRunway.constructing > 0 || landingRunway.hp <= 0)) {
      aircraft.landingRunwayId = undefined;
    }
    if (landingRunway && aircraft.landingRunwayId === landingRunway.id) {
      const point = runwayServicePoint(landingRunway);
      if (Math.hypot(aircraft.x - point.x, aircraft.y - point.y) <= AIRCRAFT_LANDING_RADIUS) {
        aircraft.x = point.x;
        aircraft.y = point.y;
        // The runway art is aligned with the positive isometric x-axis. Set
        // the parked aircraft to that heading so its centered sprite rests
        // along the runway instead of pointing across it.
        aircraft.facing = aircraft.owner === 0 ? 1 : 5;
        aircraft.flightState = "servicing";
        aircraft.serviceTicks = 0;
        aircraft.landingRunwayId = undefined;
        aircraft.idle = true;
        aircraft.path = [];
        aircraft.orderDestination = undefined;
        aircraft.orderMode = undefined;
        landingRunway.assignedPlaneId = aircraft.id;
        eventSink?.push({
          type: "aircraftStatus",
          owner: aircraft.owner,
          aircraftId: aircraft.id,
          runwayId: landingRunway.id,
          status: "landed",
          x: aircraft.x,
          y: aircraft.y,
        });
        continue;
      }
      moveAircraft(aircraft, point);
      continue;
    }

    const target = aircraft.attackTarget === undefined ? undefined : byId(state, aircraft.attackTarget);
    const targetRange = target ? UNIT_STATS[aircraft.kind].range : 0;
    if (target && target.hp > 0 && Math.hypot(aircraft.x - target.x, aircraft.y - target.y) <= targetRange) {
      aircraft.path = [];
      aircraft.idle = false;
      continue;
    }
    const destination = target && target.hp > 0 && aircraft.orderMode === "attack"
      ? { x: target.x, y: target.y }
      : aircraft.orderDestination;
    if (destination) moveAircraft(aircraft, destination);
  }
}
