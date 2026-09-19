import { BUILDING_STATS, footprintOf } from "../../catalog";
import type { BuildingKind, Entity, SimState } from "../../types";
import { findBuildSite, isStaticWalkable, livingView, powerFor, spawnBuilding } from "../world";
import { findPathDetailed } from "../pathfinding";
import { contestedResourcePoint, forwardRefinerySite, forwardRelaySite, hasBuildingNear } from "./helpers";
import { directorPhase } from "./director";

function reachableConstructionSite(state: SimState, kind: BuildingKind, spot: { x: number; y: number }, from: Entity): boolean {
  const footprint = footprintOf(kind);
  const approachTiles = new Set<string>();
  for (let oy = 0; oy < footprint.h; oy++) {
    for (let ox = 0; ox < footprint.w; ox++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const x = spot.x + ox + dx;
          const y = spot.y + oy + dy;
          const key = `${x}:${y}`;
          if (approachTiles.has(key) || !isStaticWalkable(state, x, y)) continue;
          approachTiles.add(key);
          if (findPathDetailed(state, from, { x, y }).status === "complete") return true;
        }
      }
    }
  }
  return false;
}

function tryPlaceBuilding(
  state: SimState,
  kind: BuildingKind,
  spot: { x: number; y: number } | null | undefined,
  reachableFrom?: Entity,
): boolean {
  if (!spot) return false;
  const stats = BUILDING_STATS[kind];
  if (state.credits[1] < stats.cost) return false;
  if (reachableFrom && !reachableConstructionSite(state, kind, spot, reachableFrom)) return false;
  spawnBuilding(state, 1, kind, spot.x, spot.y, stats.buildTicks);
  state.credits[1] -= stats.cost;
  return true;
}

export function tryBuildPower(state: SimState, yardX: number, yardY: number): boolean {
  // A plant under construction does not contribute power yet, so the
  // director can otherwise queue another one every tick while the deficit
  // remains active. Keep one power project in flight and let it finish before
  // committing more credits to the same recovery action.
  const powerUnderConstruction = livingView(state).some(
    (entity) => entity.owner === 1
      && entity.class === "building"
      && entity.kind === "power"
      && entity.constructing > 0,
  );
  if (powerUnderConstruction) return false;
  return tryPlaceBuilding(state, "power", findBuildSite(state, "power", yardX + 3, yardY, 12, 1));
}

export function tryBuildRefinery(state: SimState, yardX: number, yardY: number): boolean {
  return tryPlaceBuilding(state, "refinery", findBuildSite(state, "refinery", yardX + 3, yardY, 12, 1));
}

export function tryBuildForwardInfrastructure(state: SimState, yard: Entity, knownPlayers?: Entity[]): boolean {
  if (directorPhase(state) === "opening" || powerFor(state, 1) < 0) return false;
  const point = contestedResourcePoint(state, yard, knownPlayers);
  if (!point) return false;

  const refineries = livingView(state).filter(
    (entity) => entity.owner === 1 && entity.class === "building" && entity.kind === "refinery",
  );
  if (refineries.length >= 2 || hasBuildingNear(state, "refinery", point, 8)) return false;

  if (!hasBuildingNear(state, "power", point, 8)) {
    return tryPlaceBuilding(state, "power", forwardRelaySite(state, yard, point), yard);
  }

  return tryPlaceBuilding(state, "refinery", forwardRefinerySite(state, yard, point), yard);
}

export function tryBuildTurret(state: SimState, yard: Entity, threat: Entity): boolean {
  const cap = 1 + Math.floor(state.missionIndex / 2);
  const turrets = livingView(state).filter((e) => e.owner === 1 && e.kind === "turret");
  if (turrets.length >= cap) return false;
  if (turrets.some((e) => e.constructing > 0)) return false;
  const spot = findBuildSite(state, "turret", threat.x, threat.y, 12, 1)
    ?? findBuildSite(state, "turret", yard.x, yard.y, 12, 1);
  return tryPlaceBuilding(state, "turret", spot);
}

export function tryBuildRunway(state: SimState, yard: Entity, desiredCount: number): boolean {
  const runways = livingView(state).filter((e) => e.owner === 1 && e.class === "building" && e.kind === "runway");
  if (runways.length >= desiredCount || runways.some((e) => e.constructing > 0)) return false;
  const spot = findBuildSite(state, "runway", yard.x + 4, yard.y, 14, 1)
    ?? findBuildSite(state, "runway", yard.x, yard.y + 4, 14, 1);
  return tryPlaceBuilding(state, "runway", spot);
}

export function tryBuildAntiAir(state: SimState, yard: Entity, threat: Entity): boolean {
  const cap = 1 + Math.floor(state.missionIndex / 2);
  const antiAir = livingView(state).filter((e) => e.owner === 1 && e.class === "building" && e.kind === "antiAirTurret");
  if (antiAir.length >= cap || antiAir.some((e) => e.constructing > 0)) return false;
  const spot = findBuildSite(state, "antiAirTurret", threat.x, threat.y, 12, 1)
    ?? findBuildSite(state, "antiAirTurret", yard.x, yard.y, 12, 1);
  return tryPlaceBuilding(state, "antiAirTurret", spot);
}
