import type { BuildingKind, UnitKind } from "../types";
import { BUILDING_STATS } from "./buildings";
import { UNIT_STATS } from "./units";

export type CameoPhase = "idle" | "progress" | "waiting";

export type CameoStatus = {
  ratio: number;
  queued: number;
  phase: CameoPhase;
};

export type CameoEntity = {
  hp: number;
  owner: number;
  class: string;
  kind: string;
  constructing: number;
  producing?: { kind: UnitKind; remaining: number };
  queue?: UnitKind[];
};

export function buildingCameoStatus(
  entities: ReadonlyArray<CameoEntity>,
  owner: number,
  kind: BuildingKind,
): CameoStatus {
  let queued = 0;
  let bestRatio = 0;
  for (const e of entities) {
    if (e.hp <= 0 || e.owner !== owner || e.class !== "building" || e.kind !== kind) continue;
    if (e.constructing <= 0) continue;
    queued += 1;
    const total = BUILDING_STATS[kind].buildTicks || 1;
    const ratio = Math.max(0, Math.min(1, 1 - e.constructing / total));
    if (ratio > bestRatio) bestRatio = ratio;
  }
  if (queued === 0) return { ratio: 0, queued: 0, phase: "idle" };
  return { ratio: bestRatio, queued, phase: "progress" };
}

export function unitCameoStatus(
  entities: ReadonlyArray<CameoEntity>,
  owner: number,
  kind: UnitKind,
  sharedQueue?: { producing?: { kind: UnitKind; remaining: number }; queue: UnitKind[] },
): CameoStatus {
  if (sharedQueue) {
    const queued = (sharedQueue.producing?.kind === kind ? 1 : 0) + sharedQueue.queue.filter((item) => item === kind).length;
    if (queued === 0) return { ratio: 0, queued: 0, phase: "idle" };
    if (sharedQueue.producing?.kind === kind) {
      const total = UNIT_STATS[kind].buildTicks || 1;
      const ratio = Math.max(0, Math.min(1, 1 - sharedQueue.producing.remaining / total));
      return { ratio, queued, phase: "progress" };
    }
    return { ratio: 0, queued, phase: "waiting" };
  }

  let queued = 0;
  let bestRatio = 0;
  let producing = false;
  for (const e of entities) {
    if (e.hp <= 0 || e.owner !== owner || e.class !== "building" || e.constructing > 0) continue;
    if (e.producing?.kind === kind) {
      queued += 1;
      producing = true;
      const total = UNIT_STATS[kind].buildTicks || 1;
      const ratio = Math.max(0, Math.min(1, 1 - e.producing.remaining / total));
      if (ratio > bestRatio) bestRatio = ratio;
    }
    if (e.queue) {
      for (const item of e.queue) {
        if (item === kind) queued += 1;
      }
    }
  }
  if (queued === 0) return { ratio: 0, queued: 0, phase: "idle" };
  if (producing) return { ratio: bestRatio, queued, phase: "progress" };
  return { ratio: 0, queued, phase: "waiting" };
}
