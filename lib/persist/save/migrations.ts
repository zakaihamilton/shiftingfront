import { SAVE_CONTENT_VERSION, assertSupportedContentVersion } from "./validation";
import { isRecord } from "../utils";

export type SaveMigration = (state: unknown) => unknown;

export type SaveMigrationOptions = {
  currentVersion?: number;
  migrations?: Readonly<Record<number, SaveMigration>>;
};

function migrateSharedProducerQueues(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const entities = Array.isArray(value.entities) ? value.entities : [];
  const productionQueues: Record<string, Record<string, unknown>> = isRecord(value.productionQueues)
    ? Object.fromEntries(Object.entries(value.productionQueues).map(([owner, queues]) => [
      owner,
      isRecord(queues) ? { ...queues } : {},
    ]))
    : {};
  const activeProducerIds: Record<string, Record<string, unknown>> = isRecord(value.activeProducerIds)
    ? Object.fromEntries(Object.entries(value.activeProducerIds).map(([owner, choices]) => [
      owner,
      isRecord(choices) ? { ...choices } : {},
    ]))
    : {};
  const producers = entities
    .filter((entity): entity is Record<string, unknown> =>
      isRecord(entity)
      && entity.class === "building"
      && (entity.kind === "barracks" || entity.kind === "factory")
      && typeof entity.owner === "number"
      && Number.isInteger(entity.owner)
      && entity.owner >= 0
      && entity.owner <= 3
      && typeof entity.hp === "number"
      && entity.hp > 0,
    )
    .sort((a, b) => Number(a.id) - Number(b.id));

  const jobsByKey = new Map<string, { kind: string; remaining: number; order: number }[]>();
  let jobOrder = 0;
  for (const producer of producers) {
    const owner = String(producer.owner);
    const kind = producer.kind as "barracks" | "factory";
    const ownerQueues = productionQueues[owner] ??= {};
    const ownerChoices = activeProducerIds[owner] ??= {};
    const sharedQueue = ownerQueues[kind];
    let recordQueue: Record<string, unknown>;
    if (!isRecord(sharedQueue) || !Array.isArray(sharedQueue.queue)) {
      recordQueue = { queue: [] as unknown[] };
      ownerQueues[kind] = recordQueue;
    } else {
      recordQueue = sharedQueue;
    }
    const queuedUnits = recordQueue.queue as unknown[];
    if (isRecord(producer.producing) && typeof producer.producing.kind === "string" && typeof producer.producing.remaining === "number") {
      const key = `${owner}:${kind}`;
      const jobs = jobsByKey.get(key) ?? [];
      jobs.push({ kind: producer.producing.kind, remaining: producer.producing.remaining, order: jobOrder });
      jobOrder += 1;
      jobsByKey.set(key, jobs);
    }
    if (Array.isArray(producer.queue)) queuedUnits.push(...producer.queue);

    delete producer.producing;
    producer.queue = [];

    if (!(kind in ownerChoices) && typeof producer.constructing === "number" && producer.constructing <= 0) {
      ownerChoices[kind] = producer.id;
    }
  }

  for (const [key, jobs] of jobsByKey) {
    const separator = key.indexOf(":");
    const owner = key.slice(0, separator);
    const kind = key.slice(separator + 1);
    const recordQueue = (productionQueues[owner] as Record<string, Record<string, unknown>> | undefined)?.[kind];
    if (!recordQueue) continue;
    const sorted = [...jobs].sort((a, b) => a.remaining - b.remaining || a.order - b.order);
    const parked = sorted.map(({ kind: unit, remaining }) => ({ kind: unit, remaining }));
    if (recordQueue.producing === undefined) {
      recordQueue.producing = parked[0];
      if (parked.length > 1) recordQueue.resume = parked.slice(1);
    } else if (parked.length) {
      const existing = Array.isArray(recordQueue.resume) ? recordQueue.resume : [];
      recordQueue.resume = [...existing, ...parked];
    }
  }

  return { ...value, productionQueues, activeProducerIds };
}

/** Content migrations are keyed by the version they upgrade from. */
export const SAVE_CONTENT_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {
  1: migrateSharedProducerQueues,
};

export function migrateSaveContent(
  state: unknown,
  contentVersion: unknown,
  options: SaveMigrationOptions = {},
): unknown {
  const currentVersion = options.currentVersion ?? SAVE_CONTENT_VERSION;
  const migrations = options.migrations ?? SAVE_CONTENT_MIGRATIONS;
  assertSupportedContentVersion(contentVersion, currentVersion);

  let migrated = state;
  for (let version = contentVersion; version < currentVersion; version += 1) {
    const migration = migrations[version];
    if (!migration) throw new Error(`Missing save migration from content version ${version}`);
    migrated = migration(migrated);
  }
  return migrated;
}
