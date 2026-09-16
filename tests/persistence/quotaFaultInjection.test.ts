import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../../lib/persist/save/storage";
import { writeSave, readSave } from "../../lib/persist/save/api";
import { writeSlot, readSlot } from "../../lib/persist/save/slots";
import { createMission } from "../../lib/sim/api";
import { freshCampaignProgress } from "../../lib/persist/campaign";

function createQuotaStorage(maxBytes: number): StorageAdapter {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      let currentSize = 0;
      for (const [k, v] of data.entries()) {
        if (k !== key) currentSize += k.length + v.length;
      }
      if (currentSize + key.length + value.length > maxBytes) {
        const error = new Error("QuotaExceededError: The quota has been exceeded.");
        error.name = "QuotaExceededError";
        throw error;
      }
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    keys: () => Array.from(data.keys()),
  };
}

describe("storage quota fault injection", () => {
  it("gracefully catches QuotaExceededError during writeSave without throwing", () => {
    // 15 KB quota fits exactly one ~8.5KB RLE save, but rejects a second (~17KB total)
    const storage = createQuotaStorage(15 * 1024);
    const state1 = createMission({ seed: 101, missionIndex: 0 });

    // First save fits comfortably
    const success1 = writeSave(storage, state1);
    expect(success1).toBe(true);
    expect(readSave(storage, 101)).not.toBeNull();

    // Fill up remaining quota with a second save that exceeds the 15KB ceiling
    const state2 = createMission({ seed: 202, missionIndex: 0 });
    const success2 = writeSave(storage, state2);
    expect(success2).toBe(false); // Fails safely

    // Prior save remains intact
    const restored1 = readSave(storage, 101);
    expect(restored1?.seed).toBe(101);
  });

  it("gracefully catches QuotaExceededError during writeSlot without corrupting storage", () => {
    const storage = createQuotaStorage(15 * 1024);
    const state = createMission({ seed: 421, missionIndex: 0 });
    const campaign = freshCampaignProgress(421);

    const result1 = writeSlot(storage, { name: "First Save", state, campaign });
    expect(result1.ok).toBe(true);
    if (!result1.ok) throw new Error("Expected slot write to succeed");
    expect(readSlot(storage, result1.id)).not.toBeNull();

    // Second slot exceeds quota
    const result2 = writeSlot(storage, { name: "Second Save", state, campaign });
    expect(result2.ok).toBe(false);

    // Freeing the first slot allows new writes to succeed
    storage.removeItem(`shiftingfront:slot:${result1.id}`);
    const retry = writeSlot(storage, { name: "Second Save", state, campaign });
    expect(retry.ok).toBe(true);
  });
});
