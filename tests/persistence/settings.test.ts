import { describe, expect, it } from "vitest";
import { memoryStorage } from "../../lib/persist/save";
import {
  defaultSettings,
  readSettings,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  writeSettings,
} from "../../lib/persist/settings";

describe("audio settings", () => {
  it("round-trips music and sound toggles through memory storage", () => {
    const storage = memoryStorage();
    writeSettings(storage, { ...defaultSettings(), sfxEnabled: false, musicEnabled: true, musicVolume: 0.4 });
    expect(readSettings(storage)).toEqual({ ...defaultSettings(), sfxEnabled: false, musicEnabled: true, musicVolume: 0.4 });
    writeSettings(storage, { ...defaultSettings(), sfxEnabled: true, musicEnabled: false, sfxVolume: 0.25 });
    expect(readSettings(storage)).toEqual({ ...defaultSettings(), sfxEnabled: true, musicEnabled: false, sfxVolume: 0.25 });
  });

  it("defaults both channels on when nothing is stored", () => {
    expect(readSettings(memoryStorage())).toEqual(defaultSettings());
  });

  it("defaults music volume to 50%", () => {
    expect(defaultSettings().musicVolume).toBe(0.5);
    expect(readSettings(memoryStorage()).musicVolume).toBe(0.5);
  });

  it("rejects mismatched versions and malformed envelopes", () => {
    const storage = memoryStorage();
    storage.setItem(SETTINGS_KEY, JSON.stringify({
      version: SETTINGS_VERSION + 1,
      savedAt: 1,
      settings: { sfxEnabled: false, musicEnabled: false },
    }));
    expect(readSettings(storage)).toEqual(defaultSettings());

    storage.setItem(SETTINGS_KEY, JSON.stringify({
      version: 1,
      savedAt: 1,
      settings: { sfxEnabled: false, musicEnabled: true },
    }));
    expect(readSettings(storage)).toEqual({ ...defaultSettings(), sfxEnabled: false });

    storage.setItem(SETTINGS_KEY, JSON.stringify({
      version: 2,
      savedAt: 1,
      settings: { musicEnabled: false },
    }));
    expect(readSettings(storage)).toEqual({ ...defaultSettings(), musicEnabled: false });

    storage.setItem(SETTINGS_KEY, "{not-json");
    expect(readSettings(storage)).toEqual(defaultSettings());
  });

  it("clamps volume values when reading and writing", () => {
    const storage = memoryStorage();
    writeSettings(storage, {
      ...defaultSettings(),
      masterVolume: 4,
      musicVolume: -1,
      sfxVolume: Number.NaN,
    });
    expect(readSettings(storage)).toEqual({
      ...defaultSettings(),
      masterVolume: 1,
      musicVolume: 0,
      sfxVolume: 0.9,
    });
  });

  it("writes a versioned envelope", () => {
    const storage = memoryStorage();
    writeSettings(storage, { ...defaultSettings(), sfxEnabled: false, musicEnabled: false });
    const envelope = JSON.parse(storage.getItem(SETTINGS_KEY)!);
    expect(envelope.version).toBe(SETTINGS_VERSION);
    expect(envelope.settings).toEqual({ ...defaultSettings(), sfxEnabled: false, musicEnabled: false });
    expect(typeof envelope.savedAt).toBe("number");
  });

  it("migrates older preferences with new accessibility settings off", () => {
    const storage = memoryStorage({
      [SETTINGS_KEY]: JSON.stringify({
        version: 2,
        savedAt: 1,
        settings: { sfxEnabled: false },
      }),
    });

    expect(readSettings(storage)).toMatchObject({
      sfxEnabled: false,
      reducedMotion: false,
      highContrast: false,
    });
  });

  it("returns false when settings cannot be written", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };

    expect(writeSettings(storage, defaultSettings())).toBe(false);
  });
});
