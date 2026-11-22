import {
  cachedSessionStorage,
  type StorageAdapter,
  safeGetItem,
  safeRemoveItem,
  safeSetItem,
} from "@/lib/persist/save";
import type { MusicCue } from "./compose";

export const MUSIC_POSITION_KEY = "shiftingfront:music-position";
export const MUSIC_POSITION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type MusicPositionEntry = {
  step: number;
  savedAt: number;
};

export type MusicPositionMap = Record<string, MusicPositionEntry>;

export function musicTrackKey(cue: MusicCue, seed: number, missionIndex = 0): string {
  return `${cue}:${seed}:${missionIndex}`;
}

export function readAllMusicPositions(
  storage: StorageAdapter = cachedSessionStorage(),
): MusicPositionMap {
  const raw = safeGetItem(storage, MUSIC_POSITION_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const now = Date.now();
    const result: MusicPositionMap = {};
    for (const [key, val] of Object.entries(parsed)) {
      if (
        val &&
        typeof val === "object" &&
        typeof (val as MusicPositionEntry).step === "number" &&
        Number.isFinite((val as MusicPositionEntry).step) &&
        typeof (val as MusicPositionEntry).savedAt === "number" &&
        now - (val as MusicPositionEntry).savedAt < MUSIC_POSITION_MAX_AGE_MS
      ) {
        result[key] = {
          step: Math.max(0, Math.floor((val as MusicPositionEntry).step)),
          savedAt: (val as MusicPositionEntry).savedAt,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function readMusicPosition(
  cue: MusicCue,
  seed: number,
  missionIndex = 0,
  storage: StorageAdapter = cachedSessionStorage(),
): number | null {
  const map = readAllMusicPositions(storage);
  const key = musicTrackKey(cue, seed, missionIndex);
  const entry = map[key];
  return entry ? entry.step : null;
}

export function saveMusicPosition(
  cue: MusicCue,
  seed: number,
  missionIndex = 0,
  step: number,
  storage: StorageAdapter = cachedSessionStorage(),
): boolean {
  if (!Number.isFinite(step) || step < 0) return false;
  const map = readAllMusicPositions(storage);
  const key = musicTrackKey(cue, seed, missionIndex);
  map[key] = {
    step: Math.max(0, Math.floor(step)),
    savedAt: Date.now(),
  };
  return safeSetItem(storage, MUSIC_POSITION_KEY, JSON.stringify(map));
}

export function clearMusicPosition(
  cue?: MusicCue,
  seed?: number,
  missionIndex?: number,
  storage: StorageAdapter = cachedSessionStorage(),
): boolean {
  if (cue === undefined || seed === undefined) {
    return safeRemoveItem(storage, MUSIC_POSITION_KEY);
  }
  const map = readAllMusicPositions(storage);
  const key = musicTrackKey(cue, seed, missionIndex ?? 0);
  if (!(key in map)) return true;
  delete map[key];
  if (Object.keys(map).length === 0) {
    return safeRemoveItem(storage, MUSIC_POSITION_KEY);
  }
  return safeSetItem(storage, MUSIC_POSITION_KEY, JSON.stringify(map));
}
