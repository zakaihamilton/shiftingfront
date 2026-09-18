import { describe, expect, it } from "vitest";
import { createMission } from "../../lib/sim/api";
import { decodeSave, serializeState, SAVE_CONTENT_VERSION, SAVE_VERSION } from "../../lib/persist/save/serialize";
import { migrateSaveContent } from "../../lib/persist/save/migrations";
import { memoryStorage, readSlot, slotKey, writeSlot } from "../../lib/persist/save";
import { decodeSlot } from "../../lib/persist/save/slots";
import { freshCampaignProgress } from "../../lib/persist/campaign";

describe("save migrations", () => {
  it("passes current content through the explicit migration chain", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    expect(migrateSaveContent(state, SAVE_CONTENT_VERSION)).toBe(state);
    expect(decodeSave(JSON.stringify({
      version: SAVE_VERSION,
      contentVersion: SAVE_CONTENT_VERSION,
      savedAt: 1,
      state: JSON.parse(serializeState(state)),
    })).state.seed).toBe(421);
  });

  it("keeps legacy envelope and root saves loadable", () => {
    const state = createMission({ seed: 77, missionIndex: 0 });
    const legacyState = JSON.parse(serializeState(state));
    expect(decodeSave(JSON.stringify({ version: 1, savedAt: 1, state: legacyState })).state.seed).toBe(77);
    expect(decodeSave(JSON.stringify({ ...legacyState, savedAt: 2 })).state.seed).toBe(77);
  });

  it("rejects malformed and future content versions before state normalization", () => {
    expect(() => migrateSaveContent({}, 0)).toThrow("Unsupported save content version");
    expect(() => migrateSaveContent({}, SAVE_CONTENT_VERSION + 1)).toThrow("Unsupported save content version");
    expect(() => migrateSaveContent({}, "1")).toThrow("Unsupported save content version");
  });

  it("applies a registry chain when loading older content into a later format", () => {
    const migrated = migrateSaveContent({ seed: 7 }, 1, {
      currentVersion: 2,
      migrations: {
        1: (state) => ({ ...(state as { seed: number }), migrated: true }),
      },
    });
    expect(migrated).toEqual({ seed: 7, migrated: true });
    expect(() => migrateSaveContent({ seed: 7 }, 1, { currentVersion: 2, migrations: {} }))
      .toThrow("Missing save migration from content version 1");
  });

  it("uses the same migration path for named slots", () => {
    const state = createMission({ seed: 421, missionIndex: 0 });
    const storage = memoryStorage();
    const written = writeSlot(storage, {
      name: "Migration",
      state,
      campaign: freshCampaignProgress(421),
      savedAt: 10,
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const raw = JSON.parse(storage.getItem(slotKey(written.id))!);
    raw.state = JSON.parse(serializeState(state));
    expect(readSlot(storage, written.id)?.state.seed).toBe(421);
    expect(decodeSlot(JSON.stringify(raw)).state.seed).toBe(421);
  });
});
