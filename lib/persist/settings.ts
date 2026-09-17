import { safeSetItem, type StorageAdapter } from "./save";
import { isRecord, readPersistedEnvelope } from "./utils";

export const SETTINGS_KEY = "shiftingfront:settings";
export const SETTINGS_VERSION = 3 as const;

export type ColorblindMode = "none" | "deuteranopia" | "protanopia" | "tritanopia";

export type KeyBindings = {
  panUp: string;
  panDown: string;
  panLeft: string;
  panRight: string;
  home: string;
  center: string;
  repair: string;
  sell: string;
  stop: string;
  construction: string;
  production: string;
  selected: string;
};

export function defaultKeyBindings(): KeyBindings {
  return {
    panUp: "w",
    panDown: "s",
    panLeft: "a",
    panRight: "d",
    home: "h",
    center: " ",
    repair: "r",
    sell: "f",
    stop: "x",
    construction: "q",
    production: "e",
    selected: "t",
  };
}

export type GameSettings = {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
  highContrast: boolean;
  colorblindMode: ColorblindMode;
  keyBindings: KeyBindings;
};

export function defaultSettings(): GameSettings {
  return {
    sfxEnabled: true,
    musicEnabled: true,
    masterVolume: 1,
    musicVolume: 0.5,
    sfxVolume: 0.25,
    reducedMotion: false,
    highContrast: false,
    colorblindMode: "none",
    keyBindings: defaultKeyBindings(),
  };
}

function clampVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function normalizeKey(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !value.length) return fallback;
  return value.length === 1 ? value.toLowerCase() : value;
}

function normalizeKeyBindings(raw: unknown): KeyBindings {
  const base = defaultKeyBindings();
  if (!raw || typeof raw !== "object") return base;
  const b = raw as Partial<KeyBindings>;
  return {
    panUp: normalizeKey(b.panUp, base.panUp),
    panDown: normalizeKey(b.panDown, base.panDown),
    panLeft: normalizeKey(b.panLeft, base.panLeft),
    panRight: normalizeKey(b.panRight, base.panRight),
    home: normalizeKey(b.home, base.home),
    center: normalizeKey(b.center, base.center),
    repair: normalizeKey(b.repair, base.repair),
    sell: normalizeKey(b.sell, base.sell),
    stop: normalizeKey(b.stop, base.stop),
    construction: normalizeKey(b.construction, base.construction),
    production: normalizeKey(b.production, base.production),
    selected: normalizeKey(b.selected, base.selected),
  };
}

function normalize(value: unknown): GameSettings {
  const base = defaultSettings();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<GameSettings>;
  const validModes: ColorblindMode[] = ["none", "deuteranopia", "protanopia", "tritanopia"];
  const colorblindMode = typeof raw.colorblindMode === "string" && (validModes as string[]).includes(raw.colorblindMode)
    ? raw.colorblindMode
    : "none";

  return {
    sfxEnabled: raw.sfxEnabled !== false,
    musicEnabled: raw.musicEnabled !== false,
    masterVolume: clampVolume(raw.masterVolume, base.masterVolume),
    musicVolume: clampVolume(raw.musicVolume, base.musicVolume),
    sfxVolume: clampVolume(raw.sfxVolume, base.sfxVolume),
    reducedMotion: raw.reducedMotion === true,
    highContrast: raw.highContrast === true,
    colorblindMode,
    keyBindings: normalizeKeyBindings(raw.keyBindings),
  };
}

export function readSettings(storage: StorageAdapter): GameSettings {
  return readPersistedEnvelope(
    storage,
    SETTINGS_KEY,
    (parsed) => {
      if (!isRecord(parsed) || (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== SETTINGS_VERSION)) return null;
      return normalize(parsed.settings);
    },
    defaultSettings(),
  );
}

export function writeSettings(storage: StorageAdapter, settings: GameSettings): boolean {
  return safeSetItem(storage, SETTINGS_KEY, JSON.stringify({
    version: SETTINGS_VERSION,
    savedAt: Date.now(),
    settings: {
      sfxEnabled: settings.sfxEnabled === true,
      musicEnabled: settings.musicEnabled === true,
      masterVolume: clampVolume(settings.masterVolume, defaultSettings().masterVolume),
      musicVolume: clampVolume(settings.musicVolume, defaultSettings().musicVolume),
      sfxVolume: clampVolume(settings.sfxVolume, defaultSettings().sfxVolume),
      reducedMotion: settings.reducedMotion === true,
      highContrast: settings.highContrast === true,
      colorblindMode: settings.colorblindMode || "none",
      keyBindings: normalizeKeyBindings(settings.keyBindings),
    },
  }));
}
