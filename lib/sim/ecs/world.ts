import type {
  ArmorType,
  BuildingEntity,
  Entity,
  EntityClass,
  Formation,
  Owner,
  ScenarioRole,
  SimState,
  Stance,
  UnitEntity,
  UnitKind,
  Vec2,
  WeaponType,
} from "../../types";

/**
 * The mutable simulation world is intentionally kept behind this boundary.
 *
 * The flat Entity object remains the compatibility projection used by saves,
 * replay fingerprints, and existing rendering callers. Component records are
 * typed views over that projection for now; systems can migrate to these
 * stores without introducing a second source of truth or changing the wire
 * format.
 */

export type IdentityComponent = {
  readonly id: number;
  owner: Owner;
  class: EntityClass;
  kind: Entity["kind"];
  neutral?: boolean;
  scenarioRole?: ScenarioRole;
};

export type TransformComponent = {
  x: number;
  y: number;
  facing?: Entity["facing"];
};

export type VitalComponent = {
  hp: number;
  maxHp: number;
};

export type MotionComponent = {
  path: Vec2[];
  idle: boolean;
  orderMode?: Entity["orderMode"];
  orderDestination?: Vec2;
  flowGoal?: Vec2;
  blockedTicks?: number;
  routePending?: boolean;
  formation?: Formation;
};

export type ProductionComponent = {
  constructing: number;
  producing?: { kind: UnitKind; remaining: number };
  queue: UnitKind[];
  rallyPoint?: Vec2;
  refineryHarvesterPending?: boolean;
};

export type EconomyComponent = {
  carry: number;
  gatherX?: number;
  gatherY?: number;
  moveToHarvest?: boolean;
};

export type CombatComponent = {
  cooldown: number;
  attackTarget?: number;
  marked: boolean;
  stance?: Stance;
  suppression?: number;
  armor?: ArmorType;
  weapon?: WeaponType;
};

export type SupportComponent = {
  supportTargetId?: number;
  supportMode?: "auto" | "assigned" | "hold";
  repairing?: boolean;
};

export type AircraftComponent = {
  ammo?: number;
  maxAmmo?: number;
  assignedRunwayId?: number;
  flightState?: Entity["flightState"];
  serviceTicks?: number;
  landingRunwayId?: number;
  assignedPlaneId?: number;
};

export type ScenarioComponent = {
  scenarioGuardTargetId?: number;
};

export type EntityWorldInvariant =
  | "duplicate-id"
  | "missing-entity"
  | "identity-mismatch"
  | "projection-order-mismatch";

export type EntityWorldInvariantFailure = {
  invariant: EntityWorldInvariant;
  id?: number;
};

type ComponentMap<T> = Map<number, T>;

class ReadonlyMapView<K, V> implements ReadonlyMap<K, V> {
  constructor(private readonly source: Map<K, V>) {}

  get size(): number {
    return this.source.size;
  }

  get(key: K): V | undefined {
    return this.source.get(key);
  }

  has(key: K): boolean {
    return this.source.has(key);
  }

  entries(): MapIterator<[K, V]> {
    return this.source.entries();
  }

  keys(): MapIterator<K> {
    return this.source.keys();
  }

  values(): MapIterator<V> {
    return this.source.values();
  }

  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this.source.forEach((value, key) => callbackfn.call(thisArg, value, key, this));
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries();
  }
}

function freezeEntities(entities: Entity[]): readonly Entity[] {
  return Object.freeze(entities);
}

function view<T extends object>(entity: Entity, keys: readonly (keyof Entity)[]): T {
  const component = {} as T;
  for (const key of keys) {
    Object.defineProperty(component, key, {
      enumerable: true,
      configurable: false,
      get: () => entity[key],
      set: (value: unknown) => {
        (entity as unknown as Record<string, unknown>)[key as string] = value;
      },
    });
  }
  return component;
}

/**
 * Stable, typed access to entity component views. The world owns structural
 * membership and component maps, while the compatibility entity projection
 * remains the storage backing individual field access during migration.
 */
export class EntityWorld {
  private readonly identityStore: ComponentMap<IdentityComponent> = new Map();
  private readonly transformStore: ComponentMap<TransformComponent> = new Map();
  private readonly vitalStore: ComponentMap<VitalComponent> = new Map();
  private readonly motionStore: ComponentMap<MotionComponent> = new Map();
  private readonly productionStore: ComponentMap<ProductionComponent> = new Map();
  private readonly economyStore: ComponentMap<EconomyComponent> = new Map();
  private readonly combatStore: ComponentMap<CombatComponent> = new Map();
  private readonly supportStore: ComponentMap<SupportComponent> = new Map();
  private readonly aircraftStore: ComponentMap<AircraftComponent> = new Map();
  private readonly scenarioStore: ComponentMap<ScenarioComponent> = new Map();

  private readonly identityView = new ReadonlyMapView(this.identityStore);
  private readonly transformView = new ReadonlyMapView(this.transformStore);
  private readonly vitalView = new ReadonlyMapView(this.vitalStore);
  private readonly motionView = new ReadonlyMapView(this.motionStore);
  private readonly productionView = new ReadonlyMapView(this.productionStore);
  private readonly economyView = new ReadonlyMapView(this.economyStore);
  private readonly combatView = new ReadonlyMapView(this.combatStore);
  private readonly supportView = new ReadonlyMapView(this.supportStore);
  private readonly aircraftView = new ReadonlyMapView(this.aircraftStore);
  private readonly scenarioView = new ReadonlyMapView(this.scenarioStore);

  get identity(): ReadonlyMap<number, IdentityComponent> { return this.identityView; }
  get transform(): ReadonlyMap<number, TransformComponent> { return this.transformView; }
  get vital(): ReadonlyMap<number, VitalComponent> { return this.vitalView; }
  get motion(): ReadonlyMap<number, MotionComponent> { return this.motionView; }
  get production(): ReadonlyMap<number, ProductionComponent> { return this.productionView; }
  get economy(): ReadonlyMap<number, EconomyComponent> { return this.economyView; }
  get combat(): ReadonlyMap<number, CombatComponent> { return this.combatView; }
  get support(): ReadonlyMap<number, SupportComponent> { return this.supportView; }
  get aircraft(): ReadonlyMap<number, AircraftComponent> { return this.aircraftView; }
  get scenario(): ReadonlyMap<number, ScenarioComponent> { return this.scenarioView; }

  private order: number[] = [];
  private entitiesById = new Map<number, Entity>();
  private projection: SimState["entities"];
  private projectionSnapshot: Entity[] = [];
  private orderedEntities: readonly Entity[] = freezeEntities([]);
  private readBatchDepth = 0;
  private structureVersion: object = {};

  constructor(private readonly state: SimState) {
    this.projection = state.entities;
    this.rebuild();
  }

  /**
   * Rebuild structural membership after a legacy caller changes the projection.
   * Outside a simulation read batch, content is checked on every access. Inside
   * a batch, callers rely on EntityWorld structural operations and skip the
   * same-length scan on hot paths.
   */
  syncProjection(force = false): void {
    if (this.projection !== this.state.entities || this.projectionSnapshot.length !== this.state.entities.length) {
      this.rebuild(true);
      return;
    }
    if (!force && this.readBatchDepth > 0) return;
    if (this.projectionSnapshot.every((entity, index) => entity === this.state.entities[index])) return;
    this.rebuild(true);
  }

  beginReadBatch(): void {
    if (this.readBatchDepth === 0) this.syncProjection(true);
    this.readBatchDepth += 1;
  }

  endReadBatch(): void {
    if (this.readBatchDepth === 0) throw new Error("Entity world read batch is not active");
    this.readBatchDepth -= 1;
  }

  get structuralVersion(): object {
    return this.structureVersion;
  }

  private rebuild(invalidateNavigation = false): void {
    this.clear();
    this.projection = this.state.entities;
    this.projectionSnapshot = [...this.state.entities];
    for (const entity of this.state.entities) this.register(entity);
    this.orderedEntities = freezeEntities(this.order.map((id) => this.entitiesById.get(id)!).filter(Boolean));
    this.structureVersion = {};
    if (invalidateNavigation) {
      this.state.navigationRevision = (this.state.navigationRevision ?? 0) + 1;
    }
  }

  private clear(): void {
    this.order = [];
    this.entitiesById.clear();
    this.identityStore.clear();
    this.transformStore.clear();
    this.vitalStore.clear();
    this.motionStore.clear();
    this.productionStore.clear();
    this.economyStore.clear();
    this.combatStore.clear();
    this.supportStore.clear();
    this.aircraftStore.clear();
    this.scenarioStore.clear();
    this.orderedEntities = freezeEntities([]);
  }

  private register(entity: Entity): void {
    if (this.entitiesById.has(entity.id)) return;
    this.order.push(entity.id);
    this.entitiesById.set(entity.id, entity);
    this.identityStore.set(entity.id, view<IdentityComponent>(entity, ["id", "owner", "class", "kind", "neutral", "scenarioRole"]));
    this.transformStore.set(entity.id, view<TransformComponent>(entity, ["x", "y", "facing"]));
    this.vitalStore.set(entity.id, view<VitalComponent>(entity, ["hp", "maxHp"]));
    this.motionStore.set(entity.id, view<MotionComponent>(entity, ["path", "idle", "orderMode", "orderDestination", "flowGoal", "blockedTicks", "routePending", "formation"]));
    this.productionStore.set(entity.id, view<ProductionComponent>(entity, ["constructing", "producing", "queue", "rallyPoint", "refineryHarvesterPending"]));
    this.economyStore.set(entity.id, view<EconomyComponent>(entity, ["carry", "gatherX", "gatherY", "moveToHarvest"]));
    this.combatStore.set(entity.id, view<CombatComponent>(entity, ["cooldown", "attackTarget", "marked", "stance", "suppression", "armor", "weapon"]));
    this.supportStore.set(entity.id, view<SupportComponent>(entity, ["supportTargetId", "supportMode", "repairing"]));
    this.aircraftStore.set(entity.id, view<AircraftComponent>(entity, ["ammo", "maxAmmo", "assignedRunwayId", "flightState", "serviceTicks", "landingRunwayId", "assignedPlaneId"]));
    this.scenarioStore.set(entity.id, view<ScenarioComponent>(entity, ["scenarioGuardTargetId"]));
  }

  add(entity: Entity): Entity {
    this.syncProjection(false);
    if (this.entitiesById.has(entity.id)) throw new Error(`Entity ${entity.id} already exists`);
    this.state.entities.push(entity);
    this.projection = this.state.entities;
    this.projectionSnapshot.push(entity);
    this.register(entity);
    this.orderedEntities = freezeEntities([...this.orderedEntities, entity]);
    this.structureVersion = {};
    if (entity.class === "building") {
      this.state.navigationRevision = (this.state.navigationRevision ?? 0) + 1;
    }
    return entity;
  }

  /**
   * Despawn an entity while keeping the compatibility projection coherent.
   * Command-specific accounting, such as production refunds, must happen
   * before calling this structural operation.
   */
  remove(id: number): Entity | undefined {
    this.syncProjection(false);
    const entity = this.entitiesById.get(id);
    if (!entity) return undefined;
    const removedIds = new Set([id]);
    for (const candidate of this.state.entities) {
      if (candidate.id !== id) clearEntityReferences(candidate, removedIds);
    }
    if (entity.class === "building") this.state.navigationRevision = (this.state.navigationRevision ?? 0) + 1;
    this.state.entities = this.state.entities.filter((candidate) => candidate.id !== id);
    this.projection = this.state.entities;
    this.rebuild();
    return entity;
  }

  get(id: number): Entity | undefined {
    this.syncProjection(false);
    return this.entitiesById.get(id);
  }

  all(): readonly Entity[] {
    this.syncProjection(false);
    return this.orderedEntities;
  }

  living(): Entity[] {
    return this.all().filter((entity) => entity.hp > 0);
  }

  units(): UnitEntity[] {
    return this.living().filter((entity): entity is UnitEntity => entity.class === "unit");
  }

  buildings(): BuildingEntity[] {
    return this.living().filter((entity): entity is BuildingEntity => entity.class === "building");
  }

  byOwner(owner: Owner): Entity[] {
    return this.living().filter((entity) => entity.owner === owner);
  }

  query(predicate: (entity: Entity) => boolean): Entity[] {
    return this.living().filter(predicate);
  }

  validate(): EntityWorldInvariantFailure[] {
    this.syncProjection(true);
    const failures: EntityWorldInvariantFailure[] = [];
    const seen = new Set<number>();
    for (const entity of this.state.entities) {
      if (seen.has(entity.id)) failures.push({ invariant: "duplicate-id", id: entity.id });
      seen.add(entity.id);
      const stored = this.entitiesById.get(entity.id);
      if (!stored) failures.push({ invariant: "missing-entity", id: entity.id });
      else if (stored.class !== entity.class || stored.kind !== entity.kind || stored.owner !== entity.owner) {
        failures.push({ invariant: "identity-mismatch", id: entity.id });
      }
    }
    if (
      this.order.length !== this.state.entities.length ||
      this.order.some((id, index) => id !== this.state.entities[index]?.id)
    ) failures.push({ invariant: "projection-order-mismatch" });
    return failures;
  }
}

export function clearEntityReferences(entity: Entity, removedIds: ReadonlySet<number>): void {
  if (entity.attackTarget !== undefined && removedIds.has(entity.attackTarget)) {
    entity.attackTarget = undefined;
  }
  if (entity.supportTargetId !== undefined && removedIds.has(entity.supportTargetId)) {
    entity.supportTargetId = undefined;
    if (entity.supportMode === "assigned") entity.supportMode = "auto";
  }
  if (entity.assignedRunwayId !== undefined && removedIds.has(entity.assignedRunwayId)) {
    entity.assignedRunwayId = undefined;
    entity.landingRunwayId = undefined;
    if (entity.flightState === "servicing") {
      entity.flightState = "airborne";
      entity.serviceTicks = undefined;
      entity.idle = true;
    }
  }
  if (entity.landingRunwayId !== undefined && removedIds.has(entity.landingRunwayId)) {
    entity.landingRunwayId = undefined;
  }
  if (entity.assignedPlaneId !== undefined && removedIds.has(entity.assignedPlaneId)) {
    entity.assignedPlaneId = undefined;
  }
}

const worlds = new WeakMap<SimState, EntityWorld>();

/** Get the compatibility-backed ECS world for a simulation state. */
export function worldFor(state: SimState): EntityWorld {
  let world = worlds.get(state);
  if (!world) {
    world = new EntityWorld(state);
    worlds.set(state, world);
  } else {
    world.syncProjection(false);
  }
  return world;
}

/** Run a simulation operation with one full projection sync and cheap indexed reads. */
export function withEntityWorldBatch<T>(state: SimState, operation: () => T): T {
  let world = worlds.get(state);
  if (!world) {
    world = new EntityWorld(state);
    worlds.set(state, world);
  }
  world.beginReadBatch();
  try {
    return operation();
  } finally {
    world.endReadBatch();
  }
}

/** Stable projection access for systems that only need to iterate entities. */
export function entitiesFor(state: SimState): readonly Entity[] {
  return worldFor(state).all();
}

/** Stable living projection access for systems that do not need raw dead entities. */
export function livingEntitiesFor(state: SimState): Entity[] {
  return worldFor(state).living();
}

export function entityFor(state: SimState, id: number): Entity | undefined {
  return worldFor(state).get(id);
}

/** Rebuild the world after replacing a state object or its entity projection. */
export function rebuildWorld(state: SimState, invalidateNavigation = true): EntityWorld {
  if (invalidateNavigation) state.navigationRevision = (state.navigationRevision ?? 0) + 1;
  const world = new EntityWorld(state);
  worlds.set(state, world);
  return world;
}

/** Development/test invariant for callers crossing the ECS compatibility boundary. */
export function assertWorld(state: SimState): void {
  const failures = worldFor(state).validate();
  if (failures.length > 0) {
    throw new Error(`Entity world invariant failed: ${failures.map((failure) => `${failure.invariant}${failure.id === undefined ? "" : `:${failure.id}`}`).join(", ")}`);
  }
}
