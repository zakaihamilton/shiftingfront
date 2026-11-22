import { isAirUnit } from "../../catalog";
import { isoFacingAngle } from "../../iso";
import type { Entity, Facing, SimState, UnitKind } from "../../types";
import { pruneUnitFacingBlends, resetUnitFacingBlends } from "../unitFacingBlend";
import { lerp } from "./glMath";

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
  moveSpeed: number;
  travel: number;
  suspensionY: number;
  chassisLean: number;
};

export type StaticUnitTransformKey = {
  kind: UnitKind;
  x: number;
  y: number;
  facing?: Facing;
  flightState?: Entity["flightState"];
  width: number;
  height: number;
  yaw: number;
  screenAngle: number;
  turretYaw: number;
  speed: number;
  travel: number;
  suspensionY: number;
  chassisLean: number;
  stridePhase: number;
};

export type UnitStateHistory = {
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
  speed: number;
  travel: number;
  suspensionY: number;
  chassisLean: number;
  flightState: "airborne" | "servicing";
  flightTransition?: AircraftFlightTransition;
  staticTransformKey?: StaticUnitTransformKey;
  staticTransformHeights?: number[];
  staticTransform?: UnitDynamicTransform;
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

export const AIRCRAFT_FLIGHT_TRANSITION_MS = 720;

export type UnitRenderPosition = {
  x: number;
  y: number;
  airborneMix: number;
};

const historyMap = new Map<number, UnitStateHistory>();

function angularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function isSettledStaticTransform(e: Entity, hist: UnitStateHistory): boolean {
  if (
    !e.idle ||
    e.path.length > 0 ||
    e.attackTarget !== undefined ||
    e.orderDestination !== undefined ||
    e.flowGoal !== undefined ||
    e.cooldown > 0 ||
    e.gatherX !== undefined ||
    hist.flightTransition !== undefined ||
    hist.prevX !== hist.currX ||
    hist.prevY !== hist.currY ||
    e.x !== hist.currX ||
    e.y !== hist.currY ||
    Math.abs(hist.speed) > 0.025 ||
    Math.abs(hist.suspensionY) > 0.001 ||
    Math.abs(hist.chassisLean) > 0.001
  ) {
    return false;
  }

  const targetYaw = e.facing !== undefined ? (e.facing / 8) * Math.PI * 2 - Math.PI / 2 : hist.yaw;
  const targetScreenAngle = e.facing !== undefined ? isoFacingAngle(e.facing) : hist.screenAngle;
  if (
    angularDistance(hist.yaw, targetYaw) > 0.001 ||
    angularDistance(hist.screenAngle, targetScreenAngle) > 0.001 ||
    angularDistance(hist.turretYaw, targetYaw) > 0.001
  ) {
    return false;
  }

  return true;
}

export function matchesStaticTransformKey(
  e: Entity,
  state: SimState,
  hist: UnitStateHistory,
  key: StaticUnitTransformKey,
): boolean {
  return (
    key.kind === e.kind &&
    key.x === e.x &&
    key.y === e.y &&
    key.facing === e.facing &&
    key.flightState === e.flightState &&
    key.width === state.width &&
    key.height === state.height &&
    key.yaw === hist.yaw &&
    key.screenAngle === hist.screenAngle &&
    key.turretYaw === hist.turretYaw &&
    key.speed === hist.speed &&
    key.travel === hist.travel &&
    key.suspensionY === hist.suspensionY &&
    key.chassisLean === hist.chassisLean &&
    key.stridePhase === hist.stridePhase
  );
}

export function staticTransformKey(
  e: Entity,
  state: SimState,
  hist: UnitStateHistory,
): StaticUnitTransformKey {
  return {
    kind: e.kind as UnitKind,
    x: e.x,
    y: e.y,
    facing: e.facing,
    flightState: e.flightState,
    width: state.width,
    height: state.height,
    yaw: hist.yaw,
    screenAngle: hist.screenAngle,
    turretYaw: hist.turretYaw,
    speed: hist.speed,
    travel: hist.travel,
    suspensionY: hist.suspensionY,
    chassisLean: hist.chassisLean,
    stridePhase: hist.stridePhase,
  };
}

export function aircraftTransitionPosition(
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
  return (
    aircraftTransitionPosition(e, hist, clockMs) ?? {
      x: e.x,
      y: e.y,
      airborneMix: isAirUnit(e.kind) && e.flightState !== "servicing" ? 1 : 0,
    }
  );
}

function createUnitHistory(e: Entity, state: SimState, clockMs: number): UnitStateHistory {
  const initialYaw =
    e.facing !== undefined ? (e.facing / 8) * Math.PI * 2 - Math.PI / 2 : -Math.PI / 2;
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
    speed: 0,
    travel: 0,
    suspensionY: 0,
    chassisLean: 0,
    flightState: e.flightState === "servicing" ? "servicing" : "airborne",
  };
}

export function getOrCreateUnitHistory(
  e: Entity,
  state: SimState,
  clockMs: number,
): UnitStateHistory {
  let hist = historyMap.get(e.id);
  if (!hist) {
    hist = createUnitHistory(e, state, clockMs);
    historyMap.set(e.id, hist);
  }
  return hist;
}

export function resetUnitTransformTracker(): void {
  historyMap.clear();
  resetUnitFacingBlends();
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
        if (tickGap > 0 && tickGap <= 2 && jump <= 2) hist.travel += jump;
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
  pruneUnitFacingBlends(activeIds);
}
