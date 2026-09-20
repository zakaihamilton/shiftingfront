import { isAirUnit, UNIT_STATS } from "../../catalog";
import { groundHeight } from "../../sim/world";
import { isoFacingAngle, isoHeadingAngle, screenAngleToFacing } from "../../iso";
import { unitMovementOffset, unitWalkCycle } from "../anim";
import type { Entity, Facing, SimState, UnitKind } from "../../types";
import { lerp, lerpAngle } from "./glMath";

export type UnitDynamicTransform = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  barrelPitch: number;
  recoil: number;
  legLAngle: number;
  legRAngle: number;
  scoopAngle: number;
  screenAngle: number;
  baseFacing: Facing;
  rotationOffset: number;
  angularVelocity: number;
  stridePhase: number;
  strideRatio: number;
  isFootPlant: boolean;
  footPlantSide: -1 | 1;
  swayX: number;
  gaitBobY: number;
  gaitTilt: number;
  scaleX: number;
  scaleY: number;
  /** Normalized aircraft altitude used for smooth runway transitions. */
  airborneMix: number;
};

type UnitStateHistory = {
  id: number;
  prevX: number;
  prevY: number;
  currX: number;
  currY: number;
  lastUpdateTick: number;
  yaw: number;
  screenAngle: number;
  turretYaw: number;
  stridePhase: number;
  lastClockMs: number;
  flightState: "airborne" | "servicing";
  flightTransition?: AircraftFlightTransition;
};

type AircraftFlightTransition = {
  kind: "landing" | "takeoff";
  startedAt: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromAirborneMix: number;
  toAirborneMix: number;
};

const AIRCRAFT_FLIGHT_TRANSITION_MS = 720;

export type UnitRenderPosition = {
  x: number;
  y: number;
  airborneMix: number;
};

const historyMap = new Map<number, UnitStateHistory>();

function aircraftTransitionPosition(
  e: Entity,
  hist: UnitStateHistory | undefined,
  clockMs: number,
): UnitRenderPosition | undefined {
  if (e.kind !== "strikePlane" || !hist?.flightTransition) return undefined;
  const transition = hist.flightTransition;
  const progress = Math.max(0, (clockMs - transition.startedAt) / AIRCRAFT_FLIGHT_TRANSITION_MS);
  if (progress >= 1) {
    hist.flightTransition = undefined;
    return undefined;
  }
  const eased = progress * progress * (3 - 2 * progress);
  return {
    x: lerp(transition.fromX, transition.toX, eased),
    y: lerp(transition.fromY, transition.toY, eased),
    airborneMix: lerp(transition.fromAirborneMix, transition.toAirborneMix, eased),
  };
}

/** Return the position and altitude used by the canvas renderer for an aircraft transition. */
export function unitRenderPosition(e: Entity, clockMs: number): UnitRenderPosition {
  const hist = historyMap.get(e.id);
  return aircraftTransitionPosition(e, hist, clockMs) ?? {
    x: e.x,
    y: e.y,
    airborneMix: isAirUnit(e.kind) && e.flightState !== "servicing" ? 1 : 0,
  };
}

function createUnitHistory(e: Entity, state: SimState, clockMs: number): UnitStateHistory {
  const initialYaw = e.facing !== undefined ? (e.facing / 8) * Math.PI * 2 - Math.PI / 4 : -Math.PI / 4;
  const initialScreenAngle = e.facing !== undefined ? isoFacingAngle(e.facing) : 0;
  return {
    id: e.id,
    prevX: e.x,
    prevY: e.y,
    currX: e.x,
    currY: e.y,
    lastUpdateTick: state.tick,
    yaw: initialYaw,
    screenAngle: initialScreenAngle,
    turretYaw: initialYaw,
    stridePhase: 0,
    lastClockMs: clockMs,
    flightState: e.flightState === "servicing" ? "servicing" : "airborne",
  };
}

export function resetUnitTransformTracker(): void {
  historyMap.clear();
}

export function updateUnitHistory(state: SimState, clockMs: number): void {
  const activeIds = new Set<number>();

  for (const e of state.entities) {
    if (e.hp <= 0 || e.class !== "unit") continue;
    activeIds.add(e.id);

    let hist = historyMap.get(e.id);
    if (!hist) {
      hist = createUnitHistory(e, state, clockMs);
      historyMap.set(e.id, hist);
    } else {
      const previousX = hist.currX;
      const previousY = hist.currY;
      const nextFlightState = e.flightState === "servicing" ? "servicing" : "airborne";
      if (e.kind === "strikePlane" && hist.flightState !== nextFlightState) {
        hist.flightTransition = {
          kind: nextFlightState === "servicing" ? "landing" : "takeoff",
          startedAt: clockMs,
          fromX: previousX,
          fromY: previousY,
          toX: e.x,
          toY: e.y,
          fromAirborneMix: nextFlightState === "servicing" ? 1 : 0,
          toAirborneMix: nextFlightState === "servicing" ? 0 : 1,
        };
        hist.flightState = nextFlightState;
      }
      if (state.tick !== hist.lastUpdateTick) {
        const tickGap = state.tick - hist.lastUpdateTick;
        const jump = Math.hypot(e.x - hist.currX, e.y - hist.currY);
        if (tickGap > 2 || jump > 2) {
          hist.prevX = e.x;
          hist.prevY = e.y;
        } else {
          hist.prevX = hist.currX;
          hist.prevY = hist.currY;
        }
        hist.currX = e.x;
        hist.currY = e.y;
        hist.lastUpdateTick = state.tick;
      }
      if (e.kind === "strikePlane" && hist.flightTransition?.kind === "takeoff") {
        // The sortie may receive an attack or movement order on the same tick
        // that servicing completes. Keep the takeoff animation connected to
        // the live flight path so it never snaps back when the animation ends.
        hist.flightTransition.toX = e.x;
        hist.flightTransition.toY = e.y;
      }
    }
  }

  // Cleanup dead/removed entities
  for (const id of historyMap.keys()) {
    if (!activeIds.has(id)) {
      historyMap.delete(id);
    }
  }
}

export function computeUnitDynamicTransform(
  e: Entity,
  state: SimState,
  subTickAlpha: number,
  clockMs: number,
  entityById?: Map<number, Entity>,
): UnitDynamicTransform {
  let hist = historyMap.get(e.id);
  if (!hist) {
    hist = createUnitHistory(e, state, clockMs);
    historyMap.set(e.id, hist);
  }

  const dt = Math.max(0.001, Math.min(0.1, (clockMs - hist.lastClockMs) * 0.001));
  hist.lastClockMs = clockMs;

  const alpha = Math.max(0, Math.min(1, subTickAlpha));
  let x = lerp(hist.prevX, hist.currX, alpha);
  let y = lerp(hist.prevY, hist.currY, alpha);
  let airborneMix = isAirUnit(e.kind) && e.flightState !== "servicing" ? 1 : 0;
  const transitionPosition = aircraftTransitionPosition(e, hist, clockMs);
  if (transitionPosition) {
    // Smoothstep keeps both ends of the runway transition soft: the plane
    // settles onto the runway and lifts away without a visible snap.
    x = transitionPosition.x;
    y = transitionPosition.y;
    airborneMix = transitionPosition.airborneMix;
    const transition = hist.flightTransition!;
    const progress = Math.max(0, Math.min(1, (clockMs - transition.startedAt) / AIRCRAFT_FLIGHT_TRANSITION_MS));
    if (progress >= 1) hist.flightTransition = undefined;
  }
  const z = groundHeight(state, x, y);

  // Terrain slope calculation (pitch / roll)
  const delta = 0.35;
  const hX1 = groundHeight(state, x + delta, y);
  const hX0 = groundHeight(state, x - delta, y);
  const hY1 = groundHeight(state, x, y + delta);
  const hY0 = groundHeight(state, x, y - delta);

  const slopeX = (hX1 - hX0) / (delta * 2);
  const slopeY = (hY1 - hY0) / (delta * 2);

  // Target yaw calculation based on movement velocity, path, or explicit facing (preserving GL model contract)
  const moveDx = hist.currX - hist.prevX;
  const moveDy = hist.currY - hist.prevY;
  const moveDist = Math.hypot(moveDx, moveDy);
  const parkedAircraft = e.kind === "strikePlane" && e.flightState === "servicing";
  const attackTargetCandidate = !parkedAircraft && e.attackTarget !== undefined
    ? entityById?.get(e.attackTarget) ?? state.entities.find((entity) => entity.id === e.attackTarget)
    : undefined;
  const attackTarget = attackTargetCandidate && attackTargetCandidate.hp > 0 ? attackTargetCandidate : undefined;
  const attackDx = attackTarget ? attackTarget.x - x : 0;
  const attackDy = attackTarget ? attackTarget.y - y : 0;
  const attackDist = Math.hypot(attackDx, attackDy);
  const waypoint = e.path[0];
  const waypointDx = waypoint ? waypoint.x - x : 0;
  const waypointDy = waypoint ? waypoint.y - y : 0;
  const waypointDist = Math.hypot(waypointDx, waypointDy);

  let targetYaw = hist.yaw;
  if (moveDist > 0.005) {
    targetYaw = Math.atan2(moveDy, moveDx) - Math.PI / 4;
  } else if (attackDist > 0.005) {
    targetYaw = Math.atan2(attackDy, attackDx) - Math.PI / 4;
  } else if (waypointDist > 0.005) {
    targetYaw = Math.atan2(waypointDy, waypointDx) - Math.PI / 4;
  } else if (e.facing !== undefined) {
    targetYaw = (e.facing / 8) * Math.PI * 2 - Math.PI / 4;
  }

  // Smooth angular interpolation for chassis in GL model space
  const isVehicle = e.kind === "tank" || e.kind === "harvester" || e.kind === "convoyTruck" || e.kind === "repairTruck";
  const legacyTurnSpeed = e.kind === "tank" ? 9.0 : 14.0;
  hist.yaw = lerpAngle(hist.yaw, targetYaw, Math.min(1, dt * legacyTurnSpeed));

  // Compute screen isometric target angle
  let targetScreenAngle = hist.screenAngle;
  if (moveDist > 0.005) {
    targetScreenAngle = isoHeadingAngle(moveDx, moveDy);
  } else if (attackDist > 0.005) {
    targetScreenAngle = isoHeadingAngle(attackDx, attackDy);
  } else if (waypointDist > 0.005) {
    targetScreenAngle = isoHeadingAngle(waypointDx, waypointDy);
  } else if (e.facing !== undefined) {
    targetScreenAngle = isoFacingAngle(e.facing);
  }

  // Smooth fluid turning rate: vehicles preserve their established per-unit
  // rates, while walkers turn responsively through intermediate facings too.
  const isWalker = e.kind === "infantry" || e.kind === "antiArmor" || e.kind === "medic";
  const isMoving = moveDist > 0.001 || waypointDist > 0.001;
  const turnSpeed = isWalker
    ? (isMoving ? 18.0 : 12.0)
    : isMoving
      ? (e.kind === "tank" ? 14.0 : e.kind === "harvester" ? 16.0 : 20.0)
      : (e.kind === "tank" ? 8.0 : e.kind === "harvester" ? 9.0 : 12.0);
  const prevAngle = hist.screenAngle;
  hist.screenAngle = lerpAngle(hist.screenAngle, targetScreenAngle, Math.min(1, dt * turnSpeed));
  const angularVelocity = (hist.screenAngle - prevAngle) / dt;

  // Determine nearest 8-way isometric facing and rotation offset
  const baseFacing = screenAngleToFacing(hist.screenAngle);
  const nominalAngle = isoFacingAngle(baseFacing);

  let rotationOffset = hist.screenAngle - nominalAngle;
  while (rotationOffset > Math.PI) rotationOffset -= Math.PI * 2;
  while (rotationOffset < -Math.PI) rotationOffset += Math.PI * 2;
  // Keep the authored 8-way perspective authoritative. The raster art is
  // positioned against the logical contact anchor for its discrete view; a
  // large residual rotation makes that perspective swing around the anchor
  // and reads as a position jump. The existing vehicle envelope also keeps
  // the transition continuous without allowing an adjacent view to be
  // over-rotated while its sprite is still selected.
  rotationOffset = Math.max(-Math.PI / 8, Math.min(Math.PI / 8, rotationOffset));

  // Compute pitch and roll aligned with current heading, plus centrifugal chassis roll during turns
  const cosYaw = Math.cos(hist.yaw + Math.PI / 4);
  const sinYaw = Math.sin(hist.yaw + Math.PI / 4);
  const pitch = -(slopeX * cosYaw + slopeY * sinYaw) * 0.45;
  const centrifugalRoll = isVehicle ? -angularVelocity * 0.04 : 0;
  const roll = Math.max(-0.25, Math.min(0.25, (slopeX * sinYaw - slopeY * cosYaw) * 0.45 + centrifugalRoll));

  // Turret aim tracking
  let targetTurretYaw = targetYaw;
  let barrelPitch = 0;
  if (attackTarget) {
    const tDx = attackTarget.x - x;
    const tDy = attackTarget.y - y;
    targetTurretYaw = Math.atan2(tDy, tDx) - Math.PI / 4;
    const tZ = groundHeight(state, attackTarget.x, attackTarget.y);
    const dist = Math.max(0.5, Math.hypot(tDx, tDy));
    barrelPitch = Math.atan2(tZ - z, dist) * 0.5;
  }

  hist.turretYaw = lerpAngle(hist.turretYaw, targetTurretYaw, Math.min(1, dt * 12.0));

  // Keep model gait timing aligned with the raster walk cycle used by the
  // Canvas renderer. The shared phase also keeps foot plants deterministic
  // when the render cadence changes.
  const walkCycle = isWalker ? unitWalkCycle(e.kind as UnitKind, clockMs, e.id) : undefined;
  const stridePhase = walkCycle?.phase ?? hist.stridePhase;
  if (isMoving && isWalker) hist.stridePhase = stridePhase;
  const walkOffset = walkCycle
    ? unitMovementOffset(e.kind as UnitKind, walkCycle.frame, walkCycle.phase)
    : undefined;

  const legLAngle = isMoving ? Math.sin(stridePhase) * 0.6 : 0;
  const legRAngle = isMoving ? -Math.sin(stridePhase) * 0.6 : 0;

  // Gait properties for walkers: stable upright silhouette with native raster
  // pose motion supplying the visible body movement.
  const gaitBobY = isMoving && isWalker ? (walkOffset?.bobY ?? 0) : 0;
  const swayX = 0;
  const gaitTilt = 0;
  const scaleY = 1.0;
  const scaleX = 1.0;
  const footPlantSide = (Math.sin(stridePhase) >= 0 ? 1 : -1) as -1 | 1;
  const isFootPlant = isMoving && isWalker && Math.abs(Math.cos(stridePhase)) > 0.82;
  const strideRatio = isMoving && isWalker ? Math.sin(stridePhase) : 0;

  // Recoil
  let recoil = 0;
  const maxCooldown = UNIT_STATS[e.kind as UnitKind].cooldown;
  if (maxCooldown > 0 && e.cooldown > 0) {
    const firedAgo = maxCooldown - e.cooldown;
    if (firedAgo <= 4) {
      recoil = 1 - firedAgo / 4;
    }
  }

  // Harvester scoop
  let scoopAngle = 0;
  if (e.kind === "harvester") {
    if (e.gatherX !== undefined) {
      scoopAngle = Math.sin(clockMs * 0.008) * 0.25 - 0.2;
    }
  }

  return {
    x,
    y,
    z,
    yaw: hist.yaw,
    pitch,
    roll,
    turretYaw: hist.turretYaw,
    barrelPitch,
    recoil,
    legLAngle,
    legRAngle,
    scoopAngle,
    screenAngle: hist.screenAngle,
    baseFacing,
    rotationOffset,
    angularVelocity,
    stridePhase: hist.stridePhase,
    strideRatio,
    isFootPlant,
    footPlantSide,
    swayX,
    gaitBobY,
    gaitTilt,
    scaleX,
    scaleY,
    airborneMix,
  };
}
