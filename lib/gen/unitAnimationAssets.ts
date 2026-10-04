import manifest from "./unitAnimationManifest.json";
import type { UnitView, WalkerKind } from "./visualAssets";
import type { UnitKind } from "../types";

export type UnitAction = "idle" | "fire" | "treat";
export type VehiclePart = "hull" | "turret" | "barrel";
export type VehicleLayerArt = Record<VehiclePart, string> & { mount: [number, number]; socket: [number, number]; muzzle: [number, number] };
export const UNIT_ACTION_ART = manifest.poses as Record<WalkerKind, Partial<Record<UnitAction, Record<UnitView, string>>>>;
export const UNIT_VEHICLE_LAYERS = manifest.vehicles as Record<"tank" | "behemoth", Record<UnitView, VehicleLayerArt>>;

export function unitAnimationSources(kind: UnitKind): string[] {
  const poses = UNIT_ACTION_ART[kind as WalkerKind];
  const layers = UNIT_VEHICLE_LAYERS[kind as "tank" | "behemoth"];
  return [...(poses ? Object.values(poses).flatMap(views => Object.values(views)) : []),
    ...(layers ? Object.values(layers).flatMap(view => [view.hull, view.turret, view.barrel]) : [])];
}
