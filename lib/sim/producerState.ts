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
  const jobs: { kind: UnitKind; remaining: number; order: number }[] = [];
  const queue: UnitKind[] = [];
  sources.forEach((source, order) => {
    if (source.producing) jobs.push({ kind: source.producing.kind, remaining: source.producing.remaining, order });
    queue.push(...(source.queue ?? []));
  });
  jobs.sort((a, b) => a.remaining - b.remaining || a.order - b.order);
  const [first, ...rest] = jobs;
  return {
    ...(first ? { producing: { kind: first.kind, remaining: first.remaining } } : {}),
    ...(rest.length ? { resume: rest.map(({ kind: unit, remaining }) => ({ kind: unit, remaining })) } : {}),
    queue,
  };
}

/** Take the next preserved in-progress job, if a legacy migration parked one. */
export function shiftSharedResume(queue: SharedProductionQueue): { kind: UnitKind; remaining: number } | undefined {
  const resumed = queue.resume?.shift();
  if (queue.resume && queue.resume.length === 0) delete queue.resume;
  return resumed;
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
  return (queue.producing ? 1 : 0) + (queue.resume?.length ?? 0) + queue.queue.length;
}

export function activeProducerIdsFor(state: SimState, owner: Owner): number[] {
  return SHARED_PRODUCER_KINDS
    .map((kind) => activeProducerFor(state, owner, kind)?.id)
    .filter((id): id is number => id !== undefined);
}
