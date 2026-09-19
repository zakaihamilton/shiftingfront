import { BUILDING_STATS, UNIT_STATS } from "../catalog";
import { TICK_MS } from "../game/loop";
import { isoFacingAngle, screenAngleToFacing } from "../iso";
import { isBuildingEntity, type BuildingKind, type Entity, type Facing, type UnitKind } from "../types";

export type AnimFrame = 0 | 1 | 2 | 3;
export type UnitPose = "idle" | "move" | "attack" | "work";

export type UnitWalkCycle = {
  frame: AnimFrame;
  previousFrame: AnimFrame;
  frameBlend: number;
  phase: number;
};

export type UnitAnim = {
  pose: UnitPose;
  frame: AnimFrame;
  previousFrame?: AnimFrame;
  frameBlend?: number;
  bobY: number;
  stridePhase: number;
  strideRatio: number;
  recoil: number;
  swayX?: number;
  tilt?: number;
  scaleX?: number;
  scaleY?: number;
  isFootPlant?: boolean;
  footPlantSide?: -1 | 1;
};

export type BuildingAnim = {
  frame: AnimFrame;
  constructing: boolean;
  producing: boolean;
  repairing: boolean;
  damageStage: 0 | 1 | 2;
  lightOn: boolean;
  smoke: number;
  spark: number;
  antenna: number;
  doorOpen: boolean;
};

export function animClock(tick: number, clockMs?: number): number {
  return clockMs ?? tick * TICK_MS;
}

export function animFrame(timeMs: number, periodMs: number, count: 4, offset = 0): AnimFrame {
  const n = Math.max(1, count);
  const period = Math.max(1, periodMs);
  return (((Math.floor(timeMs / period) + offset) % n) + n) % n as AnimFrame;
}

export function toFacing(dx: number, dy: number): Facing {
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return 0;
  return screenAngleToFacing(Math.atan2(dy, dx));
}

export function facingVector(facing: Facing): { x: number; y: number } {
  const angle = isoFacingAngle(facing);
  return { x: Math.cos(angle), y: Math.sin(angle) * 0.52 };
}

export function unitWalkPeriod(kind: UnitKind): number {
  if (kind === "antiArmor") return 170;
  if (kind === "infantry") return 150;
  if (kind === "medic") return 160;
  return 160;
}

/** Keep the walk-sheet pose, pose transition, and continuous gait motion on one clock. */
export function unitWalkCycle(kind: UnitKind, timeMs: number, offset = 0): UnitWalkCycle {
  const period = unitWalkPeriod(kind);
  const framePosition = (((timeMs / period + offset) % 4) + 4) % 4;
  const frameIndex = Math.floor(framePosition);
  const frameProgress = framePosition - frameIndex;
  // A short incoming cross-fade masks the hard silhouette change at each
  // four-frame pose boundary without slowing or changing the walk cadence.
  const transitionProgress = Math.min(1, frameProgress / 0.22);
  const frameBlend = transitionProgress * transitionProgress * (3 - 2 * transitionProgress);
  return {
    frame: frameIndex as AnimFrame,
    previousFrame: ((frameIndex + 3) & 3) as AnimFrame,
    frameBlend,
    phase: (framePosition / 4) * Math.PI * 2,
  };
}

export type UnitMovementOffset = {
  bobY: number;
  swayX: number;
  tilt: number;
  scaleX: number;
  scaleY: number;
  strideRatio: number;
  isFootPlant: boolean;
  footPlantSide: -1 | 1;
};

export function unitMovementOffset(
  kind: UnitKind,
  frame: AnimFrame,
  stridePhase?: number,
): UnitMovementOffset {
  const infantry = kind === "infantry" || kind === "antiArmor" || kind === "medic";
  if (!infantry) {
    return {
      bobY: 0,
      swayX: 0,
      tilt: 0,
      scaleX: 1,
      scaleY: 1,
      strideRatio: 0,
      isFootPlant: false,
      footPlantSide: 1,
    };
  }
  const phase = stridePhase !== undefined ? stridePhase : (frame / 4) * Math.PI * 2;
  // The raster walk art already carries the body motion. Do not layer a
  // second vertical transform over it; that makes the torso visibly hop when
  // the four-frame pose changes.
  const bob = 0;
  const footPlantSide = (Math.sin(phase) >= 0 ? 1 : -1) as -1 | 1;
  const isFootPlant = Math.abs(Math.cos(phase)) > 0.82;

  return {
    bobY: bob,
    swayX: 0,
    tilt: 0,
    scaleX: 1,
    scaleY: 1,
    strideRatio: Math.sin(phase),
    isFootPlant,
    footPlantSide,
  };
}

export function unitPose(e: Entity): UnitPose {
  if (e.class !== "unit") return "idle";
  if (e.path.length > 0) return "move";
  if (e.attackTarget !== undefined) return "attack";
  if (e.kind === "harvester" && e.gatherX !== undefined && e.carry < UNIT_STATS.harvester.carryMax) return "work";
  return "idle";
}

export function unitAnim(e: Entity, tick: number, clockMs?: number): UnitAnim {
  const t = animClock(tick, clockMs);
  const pose = unitPose(e);
  const kind = e.kind as UnitKind;

  if (pose === "move") {
    // Natural human running cadence (~3.3 steps/second, ~600ms per full stride cycle)
    const cycle = unitWalkCycle(kind, t, e.id);
    const offset = unitMovementOffset(kind, cycle.frame, cycle.phase);

    return {
      pose,
      frame: cycle.frame,
      previousFrame: cycle.previousFrame,
      frameBlend: cycle.frameBlend,
      bobY: offset.bobY,
      swayX: offset.swayX,
      tilt: offset.tilt,
      scaleX: offset.scaleX,
      scaleY: offset.scaleY,
      isFootPlant: offset.isFootPlant,
      footPlantSide: offset.footPlantSide,
      stridePhase: cycle.phase,
      strideRatio: offset.strideRatio,
      recoil: 0,
    };
  }
  if (pose === "attack") {
    const recoil = attackRecoil(e);
    return {
      pose,
      frame: recoil > 0 ? 2 : 0,
      bobY: 0,
      stridePhase: 0,
      strideRatio: 0,
      recoil,
    };
  }
  if (pose === "work") {
    const frame = animFrame(t, 140, 4, e.id);
    return {
      pose,
      frame,
      bobY: 0,
      stridePhase: 0,
      strideRatio: 0,
      recoil: 0,
    };
  }
  return {
    pose: "idle",
    frame: 0,
    bobY: 0,
    stridePhase: 0,
    strideRatio: 0,
    recoil: 0,
  };
}

export function buildingAnim(e: Entity, tick: number, clockMs?: number): BuildingAnim {
  const t = animClock(tick, clockMs);
  const phase = t * 0.001 + e.id * 0.29;
  const hpRatio = e.maxHp > 0 ? e.hp / e.maxHp : 1;
  const damageStage = hpRatio < 0.34 ? 2 : hpRatio < 0.67 ? 1 : 0;
  const constructing = e.constructing > 0;
  const producing = Boolean(e.producing);
  const repairing = Boolean(e.repairing) && !constructing;
  const frame = animFrame(t, constructing || producing || repairing ? 110 : 280, 4, e.id);
  return {
    frame,
    constructing,
    producing,
    repairing,
    damageStage,
    lightOn: Math.sin(phase * (producing ? 14 : 5.5)) > (damageStage > 0 ? 0.15 : -0.15),
    smoke: (Math.sin(phase * 1.8) + 1) * 0.5,
    spark: constructing || producing || repairing ? (Math.sin(phase * 17) + 1) * 0.5 : 0,
    antenna: Math.sin(phase * 3.2) * 3,
    doorOpen: producing && frame >= 1,
  };
}

export function constructionProgress(e: Entity): number {
  if (e.constructing <= 0 || e.class !== "building") return 1;
  const total = BUILDING_STATS[e.kind as BuildingKind].buildTicks || 1;
  return Math.max(0, Math.min(1, 1 - e.constructing / total));
}

export function waterShimmer(timeMs: number, x: number, y: number): { offset: number; alpha: number } {
  const phase = timeMs * 0.0022 + x * 0.73 + y * 0.41;
  return {
    offset: Math.sin(phase) * 3.2,
    alpha: 0.1 + (Math.sin(phase * 1.4) + 1) * 0.08,
  };
}

export function selectionPulse(timeMs: number): number {
  return 0.55 + (Math.sin(timeMs * 0.007) + 1) * 0.22;
}

export function damageFlicker(timeMs: number, id: number, damageStage: 0 | 1 | 2): number {
  if (damageStage <= 0) return 1;
  const phase = timeMs * 0.011 + id * 1.7;
  const dip = damageStage > 1 ? 0.28 : 0.14;
  return 1 - ((Math.sin(phase) + 1) * 0.5) * dip;
}

function attackRecoil(e: Entity): number {
  const max = e.class === "unit"
    ? UNIT_STATS[e.kind as UnitKind].cooldown
    : isBuildingEntity(e) ? BUILDING_STATS[e.kind].combat?.cooldown ?? 0 : 0;
  if (max <= 0 || e.cooldown <= 0) return 0;
  const firedAgo = max - e.cooldown;
  if (firedAgo > 4) return 0;
  return 1 - firedAgo / 4;
}
