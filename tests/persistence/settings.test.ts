import { describe, expect, it } from "vitest";
import { memoryStorage } from "../../lib/persist/save";
import {
  defaultKeyBindings,
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

  it("defaults music volume to 50% and sound effects to 25%", () => {
    expect(defaultSettings().musicVolume).toBe(0.5);
    expect(defaultSettings().sfxVolume).toBe(0.25);
    expect(readSettings(memoryStorage()).musicVolume).toBe(0.5);
    expect(readSettings(memoryStorage()).sfxVolume).toBe(0.25);
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
      sfxVolume: 0.25,
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
      colorblindMode: "none",
      hudScale: "normal",
      keyBindings: defaultKeyBindings(),
    });
  });

  it("round-trips hudScale through storage", () => {
    const storage = memoryStorage();
    writeSettings(storage, {
      ...defaultSettings(),
      hudScale: "large",
    });
    expect(readSettings(storage).hudScale).toBe("large");

    writeSettings(storage, {
      ...defaultSettings(),
      hudScale: "compact",
    });
    expect(readSettings(storage).hudScale).toBe("compact");
  });

  it("normalizes invalid hudScale to normal", () => {
    const storage = memoryStorage({
      [SETTINGS_KEY]: JSON.stringify({
        version: SETTINGS_VERSION,
        savedAt: 1,
        settings: {
          hudScale: "gigantic",
        },
      }),
    });
    expect(readSettings(storage).hudScale).toBe("normal");
  });

  it("round-trips colorblindMode and keyBindings through storage", () => {
    const storage = memoryStorage();
    const customBindings = {
      ...defaultKeyBindings(),
      panUp: "ArrowUp",
      repair: "p",
    };
    writeSettings(storage, {
      ...defaultSettings(),
      colorblindMode: "deuteranopia",
      keyBindings: customBindings,
    });
    expect(readSettings(storage)).toMatchObject({
      colorblindMode: "deuteranopia",
      keyBindings: customBindings,
    });
  });

  it("persists reviewed Field Guide topics in settings version 4", () => {
    const storage = memoryStorage();
    const guideTopics = ["scenario:escort", "biome:ash plains"] as const;
    writeSettings(storage, { ...defaultSettings(), seenFieldGuideTopics: [...guideTopics] });
    expect(readSettings(storage).seenFieldGuideTopics).toEqual(guideTopics);
    expect(JSON.parse(storage.getItem(SETTINGS_KEY)!).version).toBe(4);
  });

  it("accepts settings versions 1 through 4 and normalizes guide topic IDs", () => {
    const storage = memoryStorage();
    for (const version of [1, 2, 3, 4]) {
      storage.setItem(SETTINGS_KEY, JSON.stringify({
        version,
        savedAt: 1,
        settings: {
          sfxEnabled: false,
          seenFieldGuideTopics: ["scenario:rescue", "scenario:rescue", "not-a-topic"],
        },
      }));
      const loaded = readSettings(storage);
      expect(loaded.sfxEnabled).toBe(false);
      expect(loaded.seenFieldGuideTopics).toEqual(["scenario:rescue"]);
    }
  });

  it("normalizes invalid colorblindMode and partial keyBindings", () => {
    const storage = memoryStorage({
      [SETTINGS_KEY]: JSON.stringify({
        version: SETTINGS_VERSION,
        savedAt: 1,
        settings: {
          colorblindMode: "invalid-mode",
          keyBindings: {
            panUp: "w",
          },
        },
      }),
    });

    const loaded = readSettings(storage);
    expect(loaded.colorblindMode).toBe("none");
    expect(loaded.keyBindings.panUp).toBe("w");
    expect(loaded.keyBindings.panDown).toBe(defaultKeyBindings().panDown);
    expect(loaded.keyBindings.repair).toBe(defaultKeyBindings().repair);
  });

  it("returns false when settings cannot be written", () => {
    const storage = memoryStorage();
    storage.setItem = () => {
      throw new Error("quota exceeded");
    };

    expect(writeSettings(storage, defaultSettings())).toBe(false);
  });
});
