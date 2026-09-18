import { SAVE_CONTENT_VERSION, assertSupportedContentVersion } from "./validation";

export type SaveMigration = (state: unknown) => unknown;

export type SaveMigrationOptions = {
  currentVersion?: number;
  migrations?: Readonly<Record<number, SaveMigration>>;
};

/**
 * Content migrations are keyed by the version they upgrade from. The current
 * format is already version 1, so this registry is intentionally empty until
 * a future schema change requires a new version.
 */
export const SAVE_CONTENT_MIGRATIONS: Readonly<Record<number, SaveMigration>> = {};

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
