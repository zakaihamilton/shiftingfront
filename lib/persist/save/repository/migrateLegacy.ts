import { CAMPAIGN_PREFIX, campaignKey, readCampaignProgress } from "../../campaign";
import { mergeCampaignProgress } from "../../rulesRetirement";
import { decodeSave, SAVE_PREFIX } from "../serialize";
import { createSlotId, decodeSlot, isSlotId, SLOT_PREFIX, slotKey, writeSlot } from "../slots";
import { memoryStorage, type StorageAdapter, safeGetItem, safeKeys } from "../storage";
import {
  type CampaignRecord,
  encodeProgress,
  legacyCampaignMirror,
  type MigrationRecord,
  progressFor,
  progressSavedAt,
  request,
  SAVE_FALLBACK_EPOCH_KEY,
  type SaveTransaction,
  type SlotRecord,
  savedAtOf,
  validatedProgress,
} from "./progressMerge";

export async function migrateLegacyStorage(
  legacy: StorageAdapter,
  transaction: SaveTransaction,
): Promise<void> {
  for (const key of safeKeys(legacy).sort()) {
    if (
      !key.startsWith(SAVE_PREFIX) &&
      !key.startsWith(CAMPAIGN_PREFIX) &&
      !key.startsWith(SLOT_PREFIX)
    ) {
      continue;
    }
    const raw = safeGetItem(legacy, key);
    if (!raw) continue;
    await transaction(["campaigns", "slots", "metadata"], async (tx) => {
      const metadata = tx.objectStore("metadata");
      const previous = (await request(metadata.get(key))) as MigrationRecord | undefined;
      if (previous?.raw === raw) return;
      try {
        if (key.startsWith(SLOT_PREFIX)) {
          const slot = decodeSlot(raw);
          const id = key.slice(SLOT_PREFIX.length);
          if (!isSlotId(id)) throw new Error("Invalid slot ID");
          const slots = tx.objectStore("slots");
          const existing = (await request(slots.get(id))) as SlotRecord | undefined;
          slots.put({ id: existing ? createSlotId() : id, revision: 1, raw } satisfies SlotRecord);
          void slot;
        } else {
          const seed = Number(key.slice(key.lastIndexOf(":") + 1));
          if (!/^\d{4}$/.test(key.slice(key.lastIndexOf(":") + 1))) {
            throw new Error("Invalid seed key");
          }
          const campaigns = tx.objectStore("campaigns");
          const existing = (await request(campaigns.get(seed))) as CampaignRecord | undefined;
          const record = existing ?? { seed, revision: 0, autosave: null, progress: null };
          if (key.startsWith(SAVE_PREFIX)) {
            const saved = decodeSave(raw);
            if (saved.state.seed !== seed) throw new Error("Save seed mismatch");
            const fallbackEpoch = Number(safeGetItem(legacy, SAVE_FALLBACK_EPOCH_KEY));
            const legacyWins =
              record.autosave &&
              record.autosave !== raw &&
              Number.isFinite(fallbackEpoch) &&
              fallbackEpoch > 0 &&
              saved.savedAt >= fallbackEpoch &&
              saved.savedAt >= savedAtOf(record.autosave);
            if (legacyWins && record.autosave) {
              const archived = decodeSave(record.autosave);
              const temp = memoryStorage();
              const result = writeSlot(temp, {
                name: "Recovered earlier save",
                state: archived.state,
                campaign: progressFor(record, archived.state),
              });
              if (result.ok) {
                tx.objectStore("slots").put({
                  id: result.id,
                  revision: 1,
                  raw: temp.getItem(slotKey(result.id))!,
                });
              }
              record.autosave = raw;
              if (saved.state.result === "won") {
                record.progress = encodeProgress(progressFor(record, saved.state));
              }
            } else if (record.autosave && record.autosave !== raw) {
              const temp = memoryStorage();
              const result = writeSlot(temp, {
                name: "Recovered legacy save",
                state: saved.state,
                campaign: progressFor(record, saved.state),
              });
              if (result.ok) {
                tx.objectStore("slots").put({
                  id: result.id,
                  revision: 1,
                  raw: temp.getItem(slotKey(result.id))!,
                });
              }
            } else {
              record.autosave = raw;
              if (saved.state.result === "won") {
                record.progress = encodeProgress(progressFor(record, saved.state));
              }
            }
          } else {
            const incomingEncoded = validatedProgress(raw, seed);
            const incoming = readCampaignProgress(
              memoryStorage({ [campaignKey(seed)]: incomingEncoded }),
              seed,
            );
            if (!record.progress) record.progress = incomingEncoded;
            else if (!previous || previous.raw !== raw) {
              const existingProgress = readCampaignProgress(
                memoryStorage({ [campaignKey(seed)]: record.progress }),
                seed,
              );
              const mirror = legacyCampaignMirror(
                existingProgress,
                incoming,
                progressSavedAt(record.progress),
                progressSavedAt(raw),
              );
              if (mirror === "keep") {
                metadata.put({ key, raw } satisfies MigrationRecord);
                return;
              }
              if (mirror === "edge") {
                const stamped = JSON.parse(incomingEncoded) as { savedAt?: number };
                stamped.savedAt = progressSavedAt(raw);
                record.progress = JSON.stringify(stamped);
                campaigns.put(record);
                metadata.put({ key, raw } satisfies MigrationRecord);
                return;
              }
              record.progress = encodeProgress(mergeCampaignProgress(existingProgress, incoming));
              if (record.autosave && previous && previous.raw !== raw) {
                const temp = memoryStorage();
                const result = writeSlot(temp, {
                  name: "Recovered legacy progress",
                  state: decodeSave(record.autosave).state,
                  campaign: incoming,
                });
                if (result.ok) {
                  tx.objectStore("slots").put({
                    id: result.id,
                    revision: 1,
                    raw: temp.getItem(slotKey(result.id))!,
                  });
                }
              }
            }
          }
          record.revision++;
          campaigns.put(record);
        }
        metadata.put({ key, raw } satisfies MigrationRecord);
      } catch {
        metadata.put({ key, raw, unreadable: true } satisfies MigrationRecord);
      }
    });
  }
}
