import { type BuildingEntity, type BuildingKind, type Owner, type SharedProducerKind, type SharedProductionQueue, type SimState, type UnitKind } from "../types";

export const SHARED_PRODUCER_KINDS: readonly SharedProducerKind[] = ["barracks", "factory"];

export function isSharedProducerKind(kind: BuildingKind | string): kind is SharedProducerKind {
  return kind === "barracks" || kind === "factory";
}

function isReadyProducer(entity: SimState["entities"][number] | undefined, owner: Owner, kind: SharedProducerKind): entity is BuildingEntity {
  return Boolean(
    entity && entity.class === "building" && entity.kind === kind && entity.owner === owner &&
    entity.hp > 0 && entity.constructing <= 0,
  );
}

function readyProducers(state: SimState, owner: Owner, kind: SharedProducerKind): BuildingEntity[] {
  return state.entities
    .filter((entity) => isReadyProducer(entity, owner, kind))
    .sort((a, b) => a.id - b.id);
}

export function activeProducerFor(
  state: SimState,
  owner: Owner,
  kind: SharedProducerKind,
): BuildingEntity | undefined {
  const activeId = state.activeProducerIds?.[owner]?.[kind];
  const active = activeId === undefined ? undefined : state.entities.find((entity) => entity.id === activeId);
  if (isReadyProducer(active, owner, kind)) return active;
  return readyProducers(state, owner, kind)[0];
}

/** Resolves and records a deterministic fallback after an active producer is lost. */
export function ensureActiveProducer(
  state: SimState,
  owner: Owner,
  kind: SharedProducerKind,
): BuildingEntity | undefined {
  const activeId = state.activeProducerIds?.[owner]?.[kind];
  const active = activeId === undefined ? undefined : state.entities.find((entity) => entity.id === activeId);
  if (isReadyProducer(active, owner, kind)) return active;

  const next = readyProducers(state, owner, kind)[0];
  const owners = state.activeProducerIds ??= {};
  const choices = owners[owner] ??= {};
  if (next) choices[kind] = next.id;
  else delete choices[kind];
  return next;
}

export function activateProducer(state: SimState, owner: Owner, buildingId: number): BuildingEntity | undefined {
  const entity = state.entities.find((candidate) => candidate.id === buildingId);
  if (!entity || !isSharedProducerKind(entity.kind) || !isReadyProducer(entity, owner, entity.kind)) return undefined;
  const owners = state.activeProducerIds ??= {};
  const choices = owners[owner] ??= {};
  choices[entity.kind] = entity.id;
  return entity;
}

function legacyQueue(state: SimState, owner: Owner, kind: SharedProducerKind): SharedProductionQueue {
  const sources = state.entities
    .filter((entity) => entity.class === "building" && entity.kind === kind && entity.owner === owner && entity.hp > 0)
    .sort((a, b) => a.id - b.id);
  let producing: SharedProductionQueue["producing"];
  const queue: UnitKind[] = [];
  for (const source of sources) {
    if (source.producing) {
      if (!producing) producing = { ...source.producing };
      else queue.push(source.producing.kind);
    }
    queue.push(...(source.queue ?? []));
  }
  return { ...(producing ? { producing } : {}), queue };
}

export function readSharedProductionQueue(
  state: SimState,
  owner: Owner,
  kind: SharedProducerKind,
): SharedProductionQueue {
  return state.productionQueues?.[owner]?.[kind] ?? legacyQueue(state, owner, kind);
}

/** Lazily upgrades legacy entity-owned queues when an old raw save is loaded. */
export function sharedProductionQueue(
  state: SimState,
  owner: Owner,
  kind: SharedProducerKind,
): SharedProductionQueue {
  const queues = state.productionQueues ??= {};
  const byKind = queues[owner] ??= {};
  const existing = byKind[kind];
  if (existing) return existing;

  const upgraded = legacyQueue(state, owner, kind);
  for (const entity of state.entities) {
    if (entity.class !== "building" || entity.kind !== kind || entity.owner !== owner) continue;
    if (entity.hp <= 0) continue;
    delete entity.producing;
    entity.queue = [];
  }
  byKind[kind] = upgraded;
  return upgraded;
}

export function sharedProductionQueueSize(queue: SharedProductionQueue): number {
  return (queue.producing ? 1 : 0) + queue.queue.length;
}

export function activeProducerIdsFor(state: SimState, owner: Owner): number[] {
  return SHARED_PRODUCER_KINDS
    .map((kind) => activeProducerFor(state, owner, kind)?.id)
    .filter((id): id is number => id !== undefined);
}
