import { campaignKey, readCampaignProgress } from "../../campaign";
import { JOURNAL_PREFIX, mergeCampaignProgress } from "../../rulesRetirement";
import { decodeSave } from "../serialize";
import { isSlotId, slotKey, writeSlot } from "../slots";
import {
  memoryStorage,
  type StorageAdapter,
  safeGetItem,
  safeKeys,
  safeRemoveItem,
} from "../storage";
import {
  type CampaignRecord,
  encodeProgress,
  type Journal,
  keepNewerDeploymentEdge,
  type MigrationRecord,
  progressSavedAt,
  progressWhenBattlefieldMatches,
  request,
  type SaveTransaction,
  sameBattlefield,
  validatedProgress,
} from "./progressMerge";

export async function recoverJournalsFromStorage(
  legacy: StorageAdapter,
  transaction: SaveTransaction,
): Promise<void> {
  for (const key of safeKeys(legacy).filter((entry) => entry.startsWith(JOURNAL_PREFIX))) {
    const raw = safeGetItem(legacy, key);
    if (!raw) continue;
    try {
      const journal: Journal = JSON.parse(raw);
      const state = decodeSave(journal.autosave).state;
      if (
        !Number.isSafeInteger(journal.revision) ||
        journal.revision < 0 ||
        key !== `${JOURNAL_PREFIX}${state.seed.toString().padStart(4, "0")}`
      ) {
        throw new Error("Invalid recovery journal");
      }
      const progress = validatedProgress(journal.progress, state.seed);
      const journalSavedAt =
        typeof journal.savedAt === "number" && Number.isFinite(journal.savedAt)
          ? journal.savedAt
          : 0;
      await transaction(["campaigns", "slots"], async (tx) => {
        const store = tx.objectStore("campaigns");
        const record = (await request(store.get(state.seed))) as CampaignRecord | undefined;
        if (record?.autosave && sameBattlefield(decodeSave(record.autosave).state, state)) {
          const merged = progressWhenBattlefieldMatches(record, journalSavedAt, progress);
          // Leave the revision alone. This record is also the autosave lock.
          if (merged) store.put({ ...record, progress: merged });
          return;
        }
        const existing = readCampaignProgress(
          memoryStorage(record?.progress ? { [campaignKey(state.seed)]: record.progress } : {}),
          state.seed,
        );
        const incoming = readCampaignProgress(
          memoryStorage({ [campaignKey(state.seed)]: progress }),
          state.seed,
        );
        const merged = encodeProgress(
          keepNewerDeploymentEdge(
            existing,
            mergeCampaignProgress(existing, incoming),
            progressSavedAt(record?.progress ?? null),
            journalSavedAt,
          ),
        );
        if ((record?.revision ?? 0) === journal.revision) {
          store.put({
            seed: state.seed,
            revision: journal.revision + 1,
            autosave: journal.autosave,
            progress: merged,
          });
        } else {
          store.put({
            seed: state.seed,
            revision: (record?.revision ?? 0) + 1,
            autosave: record?.autosave ?? null,
            progress: merged,
          });
          const temp = memoryStorage({ [campaignKey(state.seed)]: progress });
          const result = writeSlot(temp, {
            name: "Recovered interrupted save",
            state,
            campaign: readCampaignProgress(temp, state.seed),
          });
          if (result.ok) {
            tx.objectStore("slots").put({
              id: result.id,
              revision: 1,
              raw: temp.getItem(slotKey(result.id))!,
            });
          }
        }
      });
      safeRemoveItem(legacy, key);
    } catch {
      // Preserve the original and expose malformed journals in the existing damaged-slot UI.
      const id = `journal${key.slice(JOURNAL_PREFIX.length)}`;
      if (isSlotId(id)) {
        await transaction(["metadata"], async (tx) => {
          tx.objectStore("metadata").put({
            key: slotKey(id),
            raw,
            unreadable: true,
            sourceKey: key,
          } satisfies MigrationRecord);
        });
      }
    }
  }
}
