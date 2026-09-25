import { safeSetItem, type StorageAdapter } from "./save";
import { isRecord, readPersistedEnvelope } from "./utils";
import { FIELD_GUIDE_TOPICS, isFieldGuideTopic, type FieldGuideTopic } from "../fieldGuide";

export const SETTINGS_KEY = "shiftingfront:settings";
export const SETTINGS_VERSION = 4 as const;

export type ColorblindMode = "none" | "deuteranopia" | "protanopia" | "tritanopia";
export type HudScale = "compact" | "normal" | "large";

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
  voiceEnabled: boolean;
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  reducedMotion: boolean;
  highContrast: boolean;
  colorblindMode: ColorblindMode;
  hudScale: HudScale;
  keyBindings: KeyBindings;
  seenFieldGuideTopics: FieldGuideTopic[];
};

export function defaultSettings(): GameSettings {
  return {
    sfxEnabled: true,
    musicEnabled: true,
    voiceEnabled: true,
    masterVolume: 1,
    musicVolume: 0.5,
    sfxVolume: 0.25,
    voiceVolume: 0.8,
    reducedMotion: false,
    highContrast: false,
    colorblindMode: "none",
    hudScale: "normal",
    keyBindings: defaultKeyBindings(),
    seenFieldGuideTopics: [],
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
  const validHudScales: HudScale[] = ["compact", "normal", "large"];
  const hudScale = typeof raw.hudScale === "string" && (validHudScales as string[]).includes(raw.hudScale)
    ? (raw.hudScale as HudScale)
    : "normal";

  return {
    sfxEnabled: raw.sfxEnabled !== false,
    musicEnabled: raw.musicEnabled !== false,
    voiceEnabled: raw.voiceEnabled !== false,
    masterVolume: clampVolume(raw.masterVolume, base.masterVolume),
    musicVolume: clampVolume(raw.musicVolume, base.musicVolume),
    sfxVolume: clampVolume(raw.sfxVolume, base.sfxVolume),
    voiceVolume: clampVolume(raw.voiceVolume, base.voiceVolume),
    reducedMotion: raw.reducedMotion === true,
    highContrast: raw.highContrast === true,
    colorblindMode,
    hudScale,
    keyBindings: normalizeKeyBindings(raw.keyBindings),
    seenFieldGuideTopics: Array.isArray(raw.seenFieldGuideTopics)
      ? [...new Set(raw.seenFieldGuideTopics.filter(isFieldGuideTopic))]
      : [],
  };
}

export function readSettings(storage: StorageAdapter): GameSettings {
  return readPersistedEnvelope(
    storage,
    SETTINGS_KEY,
    (parsed) => {
      if (!isRecord(parsed) || (parsed.version !== 1 && parsed.version !== 2 && parsed.version !== 3 && parsed.version !== SETTINGS_VERSION)) return null;
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
      voiceEnabled: settings.voiceEnabled !== false,
      masterVolume: clampVolume(settings.masterVolume, defaultSettings().masterVolume),
      musicVolume: clampVolume(settings.musicVolume, defaultSettings().musicVolume),
      sfxVolume: clampVolume(settings.sfxVolume, defaultSettings().sfxVolume),
      voiceVolume: clampVolume(settings.voiceVolume, defaultSettings().voiceVolume),
      reducedMotion: settings.reducedMotion === true,
      highContrast: settings.highContrast === true,
      colorblindMode: settings.colorblindMode || "none",
      hudScale: settings.hudScale || "normal",
      keyBindings: normalizeKeyBindings(settings.keyBindings),
      seenFieldGuideTopics: FIELD_GUIDE_TOPICS.filter((topic) => settings.seenFieldGuideTopics?.includes(topic)),
    },
  }));
}
