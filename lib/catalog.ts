import { BUILDING_LABELS } from "./catalog/buildings";
import { isUnitKind, UNIT_LABELS } from "./catalog/units";
import type { BuildingKind, UnitKind } from "./types";

export const TICKS_PER_SECOND = 12;
export const MAX_PRODUCTION_QUEUE = 10;
export const STARTING_CREDITS = { player: 2000, enemy: 2000 } as const;

export function productionQueueSize(entity: {
  producing?: { kind: UnitKind; remaining: number };
  queue?: UnitKind[];
}): number {
  return (entity.producing ? 1 : 0) + (entity.queue?.length ?? 0);
}

export function labelFor(kind: UnitKind | BuildingKind): string {
  return isUnitKind(kind) ? UNIT_LABELS[kind] : BUILDING_LABELS[kind];
}

export const WIN_KIND_ORDER: import("./types").WinCategoryKind[] = [
  "harvestQuota",
  "forceQuota",
  "structureQuota",
  "destroyMarked",
  "razeAll",
  "decapitate",
  "annihilate",
  "holdTheLine",
];

export const NEW_MISSION_KINDS: import("./types").MissionKind[] = [
  "escort",
  "sabotage",
  "rescue",
  "extraction",
];

export * from "./catalog/buildings";
export * from "./catalog/cameo";
export * from "./catalog/units";
