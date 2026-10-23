import { safeSetItem, type StorageAdapter } from "./save";
import { isRecord, readPersistedEnvelope } from "./utils";

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

/** First match wins, matching the order commands are resolved in. */
const KEY_BINDING_ORDER = [
  "construction",
  "production",
  "selected",
  "repair",
  "sell",
  "stop",
  "home",
  "center",
  "panUp",
  "panDown",
  "panLeft",
  "panRight",
] as const satisfies readonly (keyof KeyBindings)[];

function bindingKey(value: string): string {
  return value.length === 1 ? value.toLowerCase() : value;
}

function dedupeKeyBindings(bindings: KeyBindings): KeyBindings {
  const next = { ...bindings };
  const defaults = defaultKeyBindings();
  const used = new Set<string>();
  for (const action of KEY_BINDING_ORDER) {
    const key = bindingKey(next[action]);
    if (!used.has(key)) {
      next[action] = key.length === 1 ? key : next[action];
      used.add(key);
      continue;
    }
    const preferred = defaults[action];
    const replacement = !used.has(bindingKey(preferred))
      ? preferred
      : KEY_BINDING_ORDER.map((name) => defaults[name]).find((candidate) => !used.has(bindingKey(candidate)))
        ?? preferred;
    next[action] = replacement;
    used.add(bindingKey(replacement));
  }
  return next;
}

/** Assign a key and give the previous key to whichever command it displaced. */
export function assignKeyBinding(
  bindings: KeyBindings,
  action: keyof KeyBindings,
  rawKey: string,
): { bindings: KeyBindings; displaced: keyof KeyBindings | null } {
  const previous = bindings[action];
  const next: KeyBindings = { ...bindings, [action]: normalizeKey(rawKey, previous) };
  const taken = bindingKey(next[action]);
  let displaced: keyof KeyBindings | null = null;
  for (const other of KEY_BINDING_ORDER) {
    if (other === action || bindingKey(next[other]) !== taken) continue;
    next[other] = previous;
    displaced ??= other;
  }
  return { bindings: dedupeKeyBindings(next), displaced };
}

function normalizeKeyBindings(raw: unknown): KeyBindings {
  const base = defaultKeyBindings();
  if (!raw || typeof raw !== "object") return base;
  const b = raw as Partial<KeyBindings>;
  return dedupeKeyBindings({
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
  });
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
    },
  }));
}
