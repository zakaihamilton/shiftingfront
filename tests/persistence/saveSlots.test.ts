import { describe, expect, it, vi } from "vitest";
import {
  createSlotId,
  defaultSlotName,
  exportSlot,
  hasLoadableSaves,
  importSlot,
  listArchiveEntries,
  listPauseLoadEntries,
  listSlots,
  listUnreadableSlots,
  memoryStorage,
  normalizeSlotName,
  readSlot,
  removeSave,
  removeSlot,
  SLOT_NAME_MAX,
  SLOT_IMPORT_MAX_BYTES,
  SLOT_PREFIX,
  slotKey,
  SLOT_VERSION,
  writeSave,
  writeSlot,
  SAVE_CONTENT_VERSION,
  saveKey,
} from "../../lib/persist/save";
import { completeMission, freshCampaignProgress, readCampaignProgress, writeCampaignProgress } from "../../lib/persist/campaign";
import { makeFixture } from "../../lib/sim/fixtures";
import { generateWorld } from "../../lib/gen/world";

function makeState(seed: number) {
  return makeFixture({ seed, win: { kind: "annihilate" } });
}

describe("named save slots", () => {
  it("round-trips a named slot with campaign snapshot", () => {
    const storage = memoryStorage();
    const state = makeState(421);
    state.tick = 48;
    const campaign = completeMission(freshCampaignProgress(421), 0, 2, 900);
    const written = writeSlot(storage, { name: "  Bridgehead  ", state, campaign });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const loaded = readSlot(storage, written.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Bridgehead");
    expect(loaded!.state.tick).toBe(48);
    expect(loaded!.campaign.completedMissions).toEqual([0]);
    expect(loaded!.campaign.medals).toEqual({ "0": 2 });
    expect(listSlots(storage).map((slot) => slot.id)).toEqual([written.id]);
  });

  it("uses the world name and mission number as the default slot name", () => {
    const state = makeState(421);
    expect(defaultSlotName(state)).toBe(`${generateWorld(421).name} · M1`);
  });

  it("rejects blank names and mismatched campaign seeds", () => {
    const storage = memoryStorage();
    const state = makeState(421);
    expect(writeSlot(storage, { name: "   ", state, campaign: freshCampaignProgress(421) })).toEqual({ ok: false });
    expect(writeSlot(storage, { name: "Valid", state, campaign: freshCampaignProgress(422) })).toEqual({ ok: false });
    expect(listSlots(storage)).toEqual([]);
  });

  it("overwrites an existing slot id and trims names to the max length", () => {
    const storage = memoryStorage();
    const state = makeState(7);
    const first = writeSlot(storage, { name: "Alpha", state, campaign: freshCampaignProgress(7) });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state.tick = 12;
    const longName = "N".repeat(SLOT_NAME_MAX + 8);
    const second = writeSlot(storage, {
      id: first.id,
      name: longName,
      state,
      campaign: freshCampaignProgress(7),
    });
    expect(second).toEqual({ ok: true, id: first.id });
    expect(readSlot(storage, first.id)?.name).toBe("N".repeat(SLOT_NAME_MAX));
    expect(readSlot(storage, first.id)?.state.tick).toBe(12);
    expect(listSlots(storage)).toHaveLength(1);
  });

  it("returns false when storage rejects a slot write", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };
    expect(writeSlot(storage, {
      name: "Quota",
      state: makeState(1),
      campaign: freshCampaignProgress(1),
    })).toEqual({ ok: false });
  });

  it("lists newest slots first and skips unreadable payloads", () => {
    vi.useFakeTimers();
    try {
      const storage = memoryStorage();
      vi.setSystemTime(new Date(1000));
      writeSlot(storage, { name: "Old", state: makeState(1), campaign: freshCampaignProgress(1) });
      vi.setSystemTime(new Date(2000));
      writeSlot(storage, { name: "New", state: makeState(2), campaign: freshCampaignProgress(2) });
      storage.setItem(`${SLOT_PREFIX}not-a-valid-id`, "nope");
      storage.setItem(slotKey("deadbeefdeadbeef"), "not-json");
      expect(listSlots(storage).map((slot) => slot.name)).toEqual(["New", "Old"]);
      expect(listUnreadableSlots(storage)).toEqual(["deadbeefdeadbeef"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes only the requested slot", () => {
    const storage = memoryStorage();
    const first = writeSlot(storage, { name: "Keep", state: makeState(1), campaign: freshCampaignProgress(1) });
    const second = writeSlot(storage, { name: "Drop", state: makeState(2), campaign: freshCampaignProgress(2) });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    removeSlot(storage, second.id);
    expect(readSlot(storage, first.id)?.name).toBe("Keep");
    expect(readSlot(storage, second.id)).toBeNull();
  });

  it("restores the slot campaign snapshot instead of merging later progress", () => {
    const storage = memoryStorage();
    const early = completeMission(freshCampaignProgress(421), 0, 1, 100);
    const written = writeSlot(storage, { name: "Early", state: makeState(421), campaign: early });
    expect(written.ok).toBe(true);
    writeCampaignProgress(storage, completeMission(early, 1, 3, 800));
    if (!written.ok) return;
    const loaded = readSlot(storage, written.id)!;
    writeCampaignProgress(storage, loaded.campaign);
    expect(readCampaignProgress(storage, 421).completedMissions).toEqual([0]);
    expect(readCampaignProgress(storage, 421).unlockedMission).toBe(1);
  });

  it("mixes named slots with autosaves in the archive list", () => {
    vi.useFakeTimers();
    try {
      const storage = memoryStorage();
      vi.setSystemTime(new Date(1000));
      writeSave(storage, makeState(9));
      vi.setSystemTime(new Date(2000));
      writeSlot(storage, { name: "Strike", state: makeState(421), campaign: freshCampaignProgress(421) });
      const listed = listArchiveEntries(storage);
      expect(listed.map((entry) => entry.kind)).toEqual(["slot", "autosave"]);
      expect(listPauseLoadEntries(storage, 9).map((entry) => entry.kind)).toEqual(["slot", "autosave"]);
      expect(listPauseLoadEntries(storage, 421).map((entry) => entry.kind)).toEqual(["slot"]);
      expect(hasLoadableSaves(storage, 9)).toBe(true);
      expect(hasLoadableSaves(memoryStorage(), 9)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("excludes deleted autosaves and slots from archive and pause load entries", () => {
    const storage = memoryStorage();
    writeSave(storage, makeState(9));
    const slot = writeSlot(storage, { name: "Strike", state: makeState(9), campaign: freshCampaignProgress(9) });
    expect(slot.ok).toBe(true);
    if (!slot.ok) return;

    expect(listArchiveEntries(storage)).toHaveLength(2);
    expect(listPauseLoadEntries(storage, 9)).toHaveLength(2);

    removeSlot(storage, slot.id);
    expect(listArchiveEntries(storage)).toHaveLength(1);
    expect(listPauseLoadEntries(storage, 9)).toHaveLength(1);
    expect(listArchiveEntries(storage)[0]!.kind).toBe("autosave");

    removeSave(storage, 9);
    expect(listArchiveEntries(storage)).toHaveLength(0);
    expect(listPauseLoadEntries(storage, 9)).toHaveLength(0);
    expect(hasLoadableSaves(storage, 9)).toBe(false);
  });

  it("does not treat an unreadable autosave as loadable for a paused mission", () => {
    const storage = memoryStorage();
    storage.setItem(saveKey(9), "{not valid json");

    expect(hasLoadableSaves(storage, 9)).toBe(false);
    expect(listPauseLoadEntries(storage, 9)).toEqual([]);
    expect(hasLoadableSaves(storage)).toBe(false);
  });

  it("writes a versioned slot envelope", () => {
    const storage = memoryStorage();
    const written = writeSlot(storage, {
      name: "Envelope",
      state: makeState(3),
      campaign: freshCampaignProgress(3),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;
    const envelope = JSON.parse(storage.getItem(slotKey(written.id))!);
    expect(envelope.version).toBe(SLOT_VERSION);
    expect(envelope.contentVersion).toBe(SAVE_CONTENT_VERSION);
    expect(envelope.name).toBe("Envelope");
  });

  it("exports a validated envelope and imports it as a fresh slot", () => {
    const source = memoryStorage();
    const written = writeSlot(source, {
      name: "Portable",
      state: makeState(421),
      campaign: freshCampaignProgress(421),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const raw = exportSlot(source, written.id);
    expect(raw).toBe(source.getItem(slotKey(written.id)));

    const destination = memoryStorage();
    const imported = importSlot(destination, raw!);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.id).not.toBe(written.id);
    expect(readSlot(destination, imported.id)).toMatchObject({ name: "Portable", state: { seed: 421 } });
    expect(listSlots(destination)).toHaveLength(1);
  });

  it("rejects invalid imports without changing storage", () => {
    const storage = memoryStorage();
    const existing = writeSlot(storage, {
      name: "Keep",
      state: makeState(7),
      campaign: freshCampaignProgress(7),
    });
    expect(existing.ok).toBe(true);
    const before = storage.keys().map((key) => [key, storage.getItem(key)]);

    expect(importSlot(storage, "not-json")).toEqual({ ok: false });
    expect(importSlot(storage, JSON.stringify({ version: SLOT_VERSION + 1 }))).toEqual({ ok: false });
    expect(importSlot(storage, "x".repeat(SLOT_IMPORT_MAX_BYTES + 1))).toEqual({ ok: false });
    expect(storage.keys().map((key) => [key, storage.getItem(key)])).toEqual(before);
  });

  it("creates collision-resistant slot ids", () => {
    const storage = memoryStorage();
    const ids = new Set(Array.from({ length: 20 }, () => createSlotId(storage)));
    expect(ids.size).toBe(20);
    expect([...ids].every((id) => slotKey(id).startsWith(SLOT_PREFIX))).toBe(true);
  });

  it("does not overwrite a slot if a fresh import ID collides", () => {
    const storage = memoryStorage();
    const source = memoryStorage();
    const written = writeSlot(source, {
      name: "Portable",
      state: makeState(421),
      campaign: freshCampaignProgress(421),
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const baseId = "ab".repeat(8);
    const fallbackId = `${baseId}0`;
    storage.setItem(slotKey(baseId), "existing-base");
    storage.setItem(slotKey(fallbackId), "existing-fallback");
    const randomValues = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation((bytes) => {
      if (bytes) new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).fill(0xab);
      return bytes;
    });
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      expect(importSlot(storage, exportSlot(source, written.id)!)).toEqual({ ok: false });
      expect(storage.getItem(slotKey(baseId))).toBe("existing-base");
      expect(storage.getItem(slotKey(fallbackId))).toBe("existing-fallback");
    } finally {
      randomValues.mockRestore();
      vi.useRealTimers();
    }
  });

  it("normalizes whitespace in slot names", () => {
    expect(normalizeSlotName("  alpha   bravo  ")).toBe("alpha bravo");
    expect(normalizeSlotName(" \n\t ")).toBeNull();
  });
});
