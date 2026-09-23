export { at, inBounds, tileAt, heightAt, groundHeight, occupies, unitAt, unitOccupied, unitOccupancyFor, buildingAt, living, livingView, invalidateEntityCaches, invalidateLivingCache, invalidateUnitAtCache, invalidatePowerCache, powerBreakdownFor, byId, dist, distToEntity } from "./world/queries";
export { terrainAccess, staticNavigationFor, invalidateNavigation, isStaticWalkable, isWalkable, makeUnitOccupancy, fillUnitOccupancy, canClimb, canStep } from "./world/terrain";
export type { StaticNavigation, TerrainAccess } from "./world/terrain";
export { BUILDING_PLACEMENT_RADIUS, BUILDING_CLEARANCE, DEFAULT_BUILDING_CLEARANCE, INITIAL_BUILDING_EDGE_MARGIN, footprintFlat, canPlaceBuilding, findBuildSite, openTileNear, frontTileNear } from "./world/building";
export { nextEntityId, makeUnit, makeBuilding, closestApproach, nearest, powerBreakdown, powerFor, spawnUnit, trySpawnUnit, spawnBuilding, spawnBuildingAt, emptyRoleCounts } from "./world/spawn";
export { compactDestroyedEntities, compactedState } from "./world/lifecycle";
export { assertWorld, entitiesFor, entityFor, livingEntitiesFor, rebuildWorld, withEntityWorldBatch, worldFor, EntityWorld } from "./ecs";
export type {
  AircraftComponent,
  CombatComponent,
  EconomyComponent,
  EntityWorldInvariant,
  EntityWorldInvariantFailure,
  IdentityComponent,
  MotionComponent,
  ProductionComponent,
  ScenarioComponent,
  SupportComponent,
  TransformComponent,
  VitalComponent,
} from "./ecs";
