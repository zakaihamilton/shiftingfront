import { safeSetItem, type StorageAdapter } from "./save";
import { isRecord, readPersistedEnvelope } from "./utils";

export const SETTINGS_KEY = "shiftingfront:settings";
export const SETTINGS_VERSION = 3 as const;

export type GameSettings = {
  sfxEnabled: boolean;
  musicEnabled: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  reducedMotion: boolean;
  highContrast: boolean;
};

export function defaultSettings(): GameSettings {
  return {
    sfxEnabled: true,
    musicEnabled: true,
    masterVolume: 1,
    musicVolume: 0.5,
    sfxVolume: 0.9,
    reducedMotion: false,
    highContrast: false,
  };
}

function clampVolume(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

function normalize(value: unknown): GameSettings {
  const base = defaultSettings();
  if (!value || typeof value !== "object") return base;
  const raw = value as Partial<GameSettings>;
  return {
    sfxEnabled: raw.sfxEnabled !== false,
    musicEnabled: raw.musicEnabled !== false,
    masterVolume: clampVolume(raw.masterVolume, base.masterVolume),
    musicVolume: clampVolume(raw.musicVolume, base.musicVolume),
    sfxVolume: clampVolume(raw.sfxVolume, base.sfxVolume),
    reducedMotion: raw.reducedMotion === true,
    highContrast: raw.highContrast === true,
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
    },
  }));
}
