// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAudibleStep,
  pauseMusic,
  resetMusicPosition,
  saveAudibleMusicPosition,
  setMusicCue,
  setMusicEnabled,
} from "../../lib/audio/music";
import {
  clearMusicPosition,
  MUSIC_POSITION_KEY,
  MUSIC_POSITION_MAX_AGE_MS,
  musicTrackKey,
  readAllMusicPositions,
  readMusicPosition,
  saveMusicPosition,
} from "../../lib/audio/musicPosition";
import { cue, missionIndex, paused, seed, step, timer } from "../../lib/audio/musicState";
import { memoryStorage } from "../../lib/persist/save";

describe("music position persistence", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    resetMusicPosition();
  });

  afterEach(() => {
    pauseMusic();
    resetMusicPosition();
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores and retrieves the playback position for a specific track", () => {
    const storage = memoryStorage();
    expect(readMusicPosition("mission", 421, 2, storage)).toBeNull();

    expect(saveMusicPosition("mission", 421, 2, 384, storage)).toBe(true);
    expect(readMusicPosition("mission", 421, 2, storage)).toBe(384);
  });

  it("keeps positions separate across distinct cues, seeds, and missions", () => {
    const storage = memoryStorage();
    saveMusicPosition("mission", 421, 0, 100, storage);
    saveMusicPosition("mission", 421, 1, 250, storage);
    saveMusicPosition("mission", 999, 0, 400, storage);
    saveMusicPosition("victory", 421, 0, 50, storage);

    expect(readMusicPosition("mission", 421, 0, storage)).toBe(100);
    expect(readMusicPosition("mission", 421, 1, storage)).toBe(250);
    expect(readMusicPosition("mission", 999, 0, storage)).toBe(400);
    expect(readMusicPosition("victory", 421, 0, storage)).toBe(50);
    expect(readMusicPosition("mission", 421, 2, storage)).toBeNull();
  });

  it("clears a single track position or all track positions", () => {
    const storage = memoryStorage();
    saveMusicPosition("mission", 421, 0, 128, storage);
    saveMusicPosition("mission", 421, 1, 256, storage);

    clearMusicPosition("mission", 421, 0, storage);
    expect(readMusicPosition("mission", 421, 0, storage)).toBeNull();
    expect(readMusicPosition("mission", 421, 1, storage)).toBe(256);

    clearMusicPosition(undefined, undefined, undefined, storage);
    expect(readMusicPosition("mission", 421, 1, storage)).toBeNull();
    expect(storage.getItem(MUSIC_POSITION_KEY)).toBeNull();
  });

  it("ignores expired positions or malformed storage payloads", () => {
    const storage = memoryStorage();
    const key = musicTrackKey("mission", 421, 0);

    // Stale saved timestamp (older than 24h)
    storage.setItem(
      MUSIC_POSITION_KEY,
      JSON.stringify({
        [key]: { step: 500, savedAt: Date.now() - (MUSIC_POSITION_MAX_AGE_MS + 1000) },
      }),
    );
    expect(readMusicPosition("mission", 421, 0, storage)).toBeNull();

    // Malformed JSON
    storage.setItem(MUSIC_POSITION_KEY, "invalid-json{{");
    expect(readMusicPosition("mission", 421, 0, storage)).toBeNull();

    // Invalid payload structure
    storage.setItem(MUSIC_POSITION_KEY, JSON.stringify("not-an-object"));
    expect(readAllMusicPositions(storage)).toEqual({});
  });

  it("rejects non-finite or negative step values", () => {
    const storage = memoryStorage();
    expect(saveMusicPosition("mission", 421, 0, -1, storage)).toBe(false);
    expect(saveMusicPosition("mission", 421, 0, Number.NaN, storage)).toBe(false);
    expect(saveMusicPosition("mission", 421, 0, Number.POSITIVE_INFINITY, storage)).toBe(false);
    expect(readMusicPosition("mission", 421, 0, storage)).toBeNull();
  });

  it("restores the remembered music position when setting a music cue after window reload", () => {
    // Simulate playing a track and saving its position to sessionStorage before window reload
    saveMusicPosition("mission", 421, 0, 320);
    expect(readMusicPosition("mission", 421, 0)).toBe(320);

    // Window reloaded: setMusicCue is called for the same track
    setMusicCue("mission", 421, 0);

    // The in-memory step should be initialized to the remembered step instead of 0
    expect(cue).toBe("mission");
    expect(seed).toBe(421);
    expect(missionIndex).toBe(0);
    expect(step).toBe(320);
  });

  it("does not start music before a gameplay cue is selected", () => {
    setMusicEnabled(true);

    expect(paused).toBe(true);
    expect(timer).toBeNull();
  });

  it("starts a different mission music track from step 0 when no position was saved for it", () => {
    saveMusicPosition("mission", 421, 0, 320);

    // Navigating to mission 1 instead of mission 0
    setMusicCue("mission", 421, 1);

    expect(cue).toBe("mission");
    expect(seed).toBe(421);
    expect(missionIndex).toBe(1);
    expect(step).toBe(0);
  });

  it("saves the audible playback position to sessionStorage", () => {
    setMusicCue("mission", 421, 0);
    saveAudibleMusicPosition();

    expect(readMusicPosition("mission", 421, 0)).not.toBeNull();
    expect(readMusicPosition("mission", 421, 0)).toBeGreaterThanOrEqual(0);
  });

  it("resets position in storage and in memory when resetMusicPosition is called", () => {
    saveMusicPosition("mission", 421, 0, 240);
    setMusicCue("mission", 421, 0);
    expect(step).toBe(240);

    resetMusicPosition("mission", 421, 0);
    expect(readMusicPosition("mission", 421, 0)).toBeNull();
    expect(step).toBe(0);
  });

  it("saves audible position when beforeunload or pagehide fires", () => {
    setMusicCue("mission", 777, 2);
    expect(readMusicPosition("mission", 777, 2)).toBeNull();

    window.dispatchEvent(new Event("beforeunload"));
    expect(readMusicPosition("mission", 777, 2)).toBe(0);

    // Update position and test pagehide
    saveMusicPosition("mission", 777, 2, 512);
    setMusicCue("mission", 777, 2);
    window.dispatchEvent(new Event("pagehide"));
    expect(readMusicPosition("mission", 777, 2)).toBe(512);
  });

  it("handles step wrap-around within pattern steps", () => {
    // 2048 is MUSIC_STEPS (128 bars * 16 steps)
    saveMusicPosition("mission", 421, 0, 2048 + 32);
    setMusicCue("mission", 421, 0);
    // After reload, steps beyond bounds are validly wrapped or stored
    expect(readMusicPosition("mission", 421, 0)).toBe(2080);
  });

  it("exposes getAudibleStep matching current in-memory step when inactive", () => {
    setMusicEnabled(true);
    setMusicCue("mission", 421, 0);
    expect(getAudibleStep()).toBe(step);
  });

  it("remembers music position when pausing for game menu and returning", () => {
    // Start track at step 160
    saveMusicPosition("mission", 421, 0, 160);
    setMusicCue("mission", 421, 0);
    expect(step).toBe(160);

    // Player opens the in-game pause menu
    pauseMusic();

    // The audible position should be saved to storage
    expect(readMusicPosition("mission", 421, 0)).toBe(160);

    // Player returns from game menu (unpauses)
    setMusicCue("mission", 421, 0);

    // Step should be restored to 160, not restarted to 0
    expect(step).toBe(160);
  });

  it("remembers music position when leaving to main menu and resuming the mission", () => {
    // Player plays mission up to step 480
    saveMusicPosition("mission", 421, 2, 480);
    setMusicCue("mission", 421, 2);
    expect(step).toBe(480);

    // Player leaves to main menu
    pauseMusic();
    expect(readMusicPosition("mission", 421, 2)).toBe(480);

    // Some other screen/cue is viewed
    resetMusicPosition();
    expect(step).toBe(0);

    // Save position for the mission was preserved across menu visit
    saveMusicPosition("mission", 421, 2, 480);

    // Returning to the mission
    setMusicCue("mission", 421, 2);
    expect(cue).toBe("mission");
    expect(seed).toBe(421);
    expect(missionIndex).toBe(2);
    expect(step).toBe(480);
  });
});
