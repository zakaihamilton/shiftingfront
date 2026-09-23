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
 * Component maps own mutable simulation data. The flat Entity values exposed
 * on SimState are live compatibility facades for saves, replays, rendering,
 * and callers that still read or write entity fields directly.
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
  | "missing-component"
  | "identity-mismatch"
  | "projection-order-mismatch";

export type EntityWorldInvariantFailure = {
  invariant: EntityWorldInvariant;
  id?: number;
};

type ComponentMap<T> = Map<number, T>;

type EntityComponentBundle = {
  identity: IdentityComponent;
  transform: TransformComponent;
  vital: VitalComponent;
  motion: MotionComponent;
  production: ProductionComponent;
  economy: EconomyComponent;
  combat: CombatComponent;
  support: SupportComponent;
  aircraft: AircraftComponent;
  scenario: ScenarioComponent;
};

type ComponentGroup = keyof EntityComponentBundle;

const ENTITY_COMPONENT_FIELDS = {
  identity: ["id", "owner", "class", "kind", "neutral", "scenarioRole"],
  transform: ["x", "y", "facing"],
  vital: ["hp", "maxHp"],
  motion: ["path", "idle", "orderMode", "orderDestination", "flowGoal", "blockedTicks", "routePending", "formation"],
  production: ["constructing", "producing", "queue", "rallyPoint", "refineryHarvesterPending"],
  economy: ["carry", "gatherX", "gatherY", "moveToHarvest"],
  combat: ["cooldown", "attackTarget", "marked", "stance", "suppression", "armor", "weapon"],
  support: ["supportTargetId", "supportMode", "repairing"],
  aircraft: ["ammo", "maxAmmo", "assignedRunwayId", "flightState", "serviceTicks", "landingRunwayId", "assignedPlaneId"],
  scenario: ["scenarioGuardTargetId"],
} as const satisfies Record<ComponentGroup, readonly (keyof Entity)[]>;

const ENTITY_FIELD_LOCATION = Object.fromEntries(
  Object.entries(ENTITY_COMPONENT_FIELDS).flatMap(([group, fields]) =>
    fields.map((field) => [field, { group: group as ComponentGroup, field }]),
  ),
) as Record<keyof Entity, { group: ComponentGroup; field: string }>;

const ENTITY_FIELD_ORDER = Object.values(ENTITY_COMPONENT_FIELDS).flat() as (keyof Entity)[];

function cloneFieldValue(field: keyof Entity, value: unknown): unknown {
  if (field === "path" && Array.isArray(value)) return value.map((point) => ({ ...point }));
  if (field === "queue" && Array.isArray(value)) return [...value];
  if ((field === "producing" || field === "orderDestination" || field === "flowGoal" || field === "rallyPoint") && value && typeof value === "object") {
    return { ...value };
  }
  return value;
}

function componentRecord(entity: Entity, fields: readonly (keyof Entity)[]): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const field of fields) record[field] = cloneFieldValue(field, entity[field]);
  return record;
}

function createEntityComponents(entity: Entity): EntityComponentBundle {
  return Object.fromEntries(
    Object.entries(ENTITY_COMPONENT_FIELDS).map(([group, fields]) => [group, componentRecord(entity, fields)]),
  ) as EntityComponentBundle;
}

function componentRecordFor(components: EntityComponentBundle, field: keyof Entity): Record<string, unknown> {
  const location = ENTITY_FIELD_LOCATION[field];
  return components[location.group] as unknown as Record<string, unknown>;
}

function createEntityFacade(entity: Entity, components: EntityComponentBundle): Entity {
  const prototype = Object.create(Object.prototype) as object;
  const facade = Object.create(prototype) as Entity;
  for (const field of ENTITY_FIELD_ORDER) {
    const record = componentRecordFor(components, field);
    Object.defineProperty(prototype, field, {
      configurable: true,
      enumerable: false,
      get() {
        return undefined;
      },
      set(value: unknown) {
        if (field === "id" && value !== record.id) {
          throw new TypeError("Entity ids are immutable; replace the entity through EntityWorld");
        }
        record[field] = value;
        defineEntityField(this as Entity, components, field);
      },
    });
  }
  for (const property of Reflect.ownKeys(entity)) {
    if (typeof property === "string" && Object.hasOwn(ENTITY_FIELD_LOCATION, property)) {
      const field = property as keyof Entity;
      const record = componentRecordFor(components, field);
      Object.defineProperty(facade, field, {
        configurable: field !== "id",
        enumerable: true,
        get: () => record[field],
        set: field === "id" ? undefined : (value: unknown) => { record[field] = value; },
      });
      continue;
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(entity, property);
    if (descriptor) {
      Object.defineProperty(facade, property, {
        configurable: true,
        enumerable: descriptor.enumerable,
        writable: true,
        value: Reflect.get(entity, property),
      });
    }
  }
  return facade;
}

function defineEntityField(entity: Entity, components: EntityComponentBundle, field: keyof Entity): void {
  if (Object.hasOwn(entity, field)) return;
  const record = componentRecordFor(components, field);
  Object.defineProperty(entity, field, {
    configurable: field !== "id",
    enumerable: true,
    get: () => record[field],
    set: (value: unknown) => { record[field] = value; },
  });
}

function bindEntityComponentRecords(components: EntityComponentBundle, entity: Entity): void {
  for (const [group, fields] of Object.entries(ENTITY_COMPONENT_FIELDS) as [ComponentGroup, readonly (keyof Entity)[]][]) {
    const record = components[group] as unknown as Record<string, unknown>;
    Object.assign(components, {
      [group]: new Proxy(record, {
        get(target, property, receiver) {
          if (typeof property === "string" && fields.includes(property as keyof Entity)) {
            const field = property as keyof Entity;
            if (field !== "id" && !Object.hasOwn(entity, field)) return undefined;
          }
          return Reflect.get(target, property, receiver);
        },
        set(target, property, value, receiver) {
          if (typeof property === "string" && fields.includes(property as keyof Entity)) {
            const field = property as keyof Entity;
            if (field === "id" && value !== Reflect.get(target, property, receiver)) {
              throw new TypeError("Entity ids are immutable; replace the entity through EntityWorld");
            }
            defineEntityField(entity, components, field);
          }
          return Reflect.set(target, property, value, target);
        },
      }),
    });
  }
}

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

/** Stable typed component stores with a legacy-shaped entity projection. */
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
  private componentsById = new Map<number, EntityComponentBundle>();
  private duplicateIds = new Set<number>();
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
    const incoming = [...this.state.entities];
    this.clear();
    for (const entity of incoming) this.register(entity);
    this.orderedEntities = freezeEntities(this.order.map((id) => this.entitiesById.get(id)!).filter(Boolean));
    this.state.entities = [...this.orderedEntities];
    this.projection = this.state.entities;
    this.projectionSnapshot = [...this.state.entities];
    this.structureVersion = {};
    if (invalidateNavigation) {
      this.state.navigationRevision = (this.state.navigationRevision ?? 0) + 1;
    }
  }

  private clear(): void {
    this.order = [];
    this.entitiesById.clear();
    this.componentsById.clear();
    this.duplicateIds.clear();
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

  private register(entity: Entity): Entity | undefined {
    if (this.entitiesById.has(entity.id)) {
      this.duplicateIds.add(entity.id);
      return undefined;
    }
    const components = createEntityComponents(entity);
    const facade = createEntityFacade(entity, components);
    bindEntityComponentRecords(components, facade);
    const id = components.identity.id;
    this.order.push(id);
    this.entitiesById.set(id, facade);
    this.componentsById.set(id, components);
    this.identityStore.set(id, components.identity);
    this.transformStore.set(id, components.transform);
    this.vitalStore.set(id, components.vital);
    this.motionStore.set(id, components.motion);
    this.productionStore.set(id, components.production);
    this.economyStore.set(id, components.economy);
    this.combatStore.set(id, components.combat);
    this.supportStore.set(id, components.support);
    this.aircraftStore.set(id, components.aircraft);
    this.scenarioStore.set(id, components.scenario);
    return facade;
  }

  add(entity: Entity): Entity {
    this.syncProjection(false);
    if (this.entitiesById.has(entity.id)) throw new Error(`Entity ${entity.id} already exists`);
    const facade = this.register(entity);
    if (!facade) throw new Error(`Entity ${entity.id} already exists`);
    this.orderedEntities = freezeEntities([...this.orderedEntities, facade]);
    this.state.entities = [...this.orderedEntities];
    this.projection = this.state.entities;
    this.projectionSnapshot = [...this.state.entities];
    this.structureVersion = {};
    if (facade.class === "building") {
      this.state.navigationRevision = (this.state.navigationRevision ?? 0) + 1;
    }
    return facade;
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
    this.removeMany([id]);
    return entity;
  }

  /** Remove several entities in one structural update and clear their references. */
  removeMany(ids: Iterable<number>, navigationHandledIds: ReadonlySet<number> = new Set()): Entity[] {
    this.syncProjection(false);
    const removedIds = new Set([...ids].filter((id) => this.entitiesById.has(id)));
    if (removedIds.size === 0) return [];

    const removed = [...removedIds].map((id) => this.entitiesById.get(id)!);
    for (const entity of removed) {
      if (entity.class === "building" && !navigationHandledIds.has(entity.id)) {
        this.state.navigationRevision = (this.state.navigationRevision ?? 0) + 1;
      }
    }
    for (const candidate of this.orderedEntities) {
      if (!removedIds.has(candidate.id)) clearEntityReferences(candidate, removedIds);
    }

    for (const id of removedIds) {
      this.entitiesById.delete(id);
      this.componentsById.delete(id);
      this.identityStore.delete(id);
      this.transformStore.delete(id);
      this.vitalStore.delete(id);
      this.motionStore.delete(id);
      this.productionStore.delete(id);
      this.economyStore.delete(id);
      this.combatStore.delete(id);
      this.supportStore.delete(id);
      this.aircraftStore.delete(id);
      this.scenarioStore.delete(id);
      this.duplicateIds.delete(id);
    }
    this.order = this.order.filter((id) => !removedIds.has(id));
    this.orderedEntities = freezeEntities(this.order.map((entityId) => this.entitiesById.get(entityId)!).filter(Boolean));
    this.state.entities = [...this.orderedEntities];
    this.projection = this.state.entities;
    this.projectionSnapshot = [...this.state.entities];
    this.structureVersion = {};
    return removed;
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
    for (const id of this.duplicateIds) failures.push({ invariant: "duplicate-id", id });
    for (const entity of this.state.entities) {
      if (seen.has(entity.id)) failures.push({ invariant: "duplicate-id", id: entity.id });
      seen.add(entity.id);
      const components = this.componentsById.get(entity.id);
      if (!components) failures.push({ invariant: "missing-entity", id: entity.id });
      else if (components.identity.id !== entity.id || components.identity.class !== entity.class || components.identity.kind !== entity.kind || components.identity.owner !== entity.owner) {
        failures.push({ invariant: "identity-mismatch", id: entity.id });
      }
    }
    if (
      this.order.length !== this.state.entities.length ||
      this.order.some((id, index) => id !== this.state.entities[index]?.id)
    ) failures.push({ invariant: "projection-order-mismatch" });
    const stores = [
      this.identityStore, this.transformStore, this.vitalStore, this.motionStore, this.productionStore,
      this.economyStore, this.combatStore, this.supportStore, this.aircraftStore, this.scenarioStore,
    ];
    if (stores.some((store) => store.size !== this.order.length || this.order.some((id) => !store.has(id)))) {
      failures.push({ invariant: "missing-component" });
    }
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
