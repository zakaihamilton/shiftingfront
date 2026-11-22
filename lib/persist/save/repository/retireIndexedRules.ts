import type { CampaignProgress, SimState } from "@/lib/types";
import { campaignKey, readCampaignProgress } from "../../campaign";
import { planSeedRetirement } from "../../rulesRetirement";
import { decodeSave } from "../serialize";
import { decodeSlot } from "../slots";
import { memoryStorage } from "../storage";
import {
  type CampaignRecord,
  encodeProgress,
  request,
  type SaveTransaction,
  type SlotRecord,
} from "./progressMerge";

export async function retireIndexedRulesStore(
  db: IDBDatabase | null,
  transaction: SaveTransaction,
): Promise<boolean> {
  if (!db) return false;
  return transaction(["campaigns", "slots"], async (tx) => {
    const campaigns = (await request(tx.objectStore("campaigns").getAll())) as CampaignRecord[];
    const slotRecords = (await request(tx.objectStore("slots").getAll())) as SlotRecord[];
    const slotsBySeed = new Map<
      number,
      Array<{ id: string; state: SimState; campaign: CampaignProgress }>
    >();
    for (const record of slotRecords) {
      try {
        const decoded = decodeSlot(record.raw);
        const list = slotsBySeed.get(decoded.state.seed) ?? [];
        list.push({ id: record.id, state: decoded.state, campaign: decoded.campaign });
        slotsBySeed.set(decoded.state.seed, list);
      } catch {
        // Unreadable slots stay available to the archive recovery UI.
      }
    }
    let rebuilt = false;
    const seeds = new Set<number>([
      ...campaigns.map((record) => record.seed),
      ...slotsBySeed.keys(),
    ]);
    for (const seed of seeds) {
      const record = campaigns.find((candidate) => candidate.seed === seed);
      let autosave: SimState | null = null;
      if (record?.autosave) {
        try {
          autosave = decodeSave(record.autosave).state;
        } catch {
          autosave = null;
        }
      }
      const plan = planSeedRetirement({
        seed,
        progress: record?.progress
          ? readCampaignProgress(memoryStorage({ [campaignKey(seed)]: record.progress }), seed)
          : null,
        autosave,
        slots: slotsBySeed.get(seed) ?? [],
        journal: null,
      });
      if (!plan) continue;
      if (plan.rebuilt) rebuilt = true;
      for (const id of plan.dropSlotIds) tx.objectStore("slots").delete(id);
      tx.objectStore("campaigns").put({
        seed,
        revision: (record?.revision ?? 0) + 1,
        autosave: plan.dropAutosave ? null : (record?.autosave ?? null),
        progress: encodeProgress(plan.progress),
      } satisfies CampaignRecord);
    }
    return rebuilt;
  });
}
