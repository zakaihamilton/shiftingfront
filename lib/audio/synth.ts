import { getAudioContext, isAudioUnlocked, resumeAudio } from "./context";
import { getAudioBus, isAudioForeground, setAudioBusEnabled } from "./mixer";
import {
  type BeepKind,
  type SfxKind,
  type SfxOptions,
  DEFAULT_INTERVALS,
  scheduleSfxTime,
  playLayeredSfx,
} from "./synth/index";

export * from "./synth/index";

let sfxEnabled = true;
const lastPlayed = new Map<SfxKind, number>();

let lastAudioContext: AudioContext | null = null;

export function setSfxEnabled(value: boolean): void {
  const enabledForRuntime = process.env.NEXT_PUBLIC_E2E_MUTE_SFX === "1" ? false : value;
  sfxEnabled = enabledForRuntime;
  setAudioBusEnabled("sfx", enabledForRuntime);
}

export function isSfxEnabled(): boolean {
  return sfxEnabled;
}

export function playSfx(kind: SfxKind, options: SfxOptions = {}): void {
  if (!sfxEnabled || !isAudioForeground() || !isAudioUnlocked()) return;
  const audio = getAudioContext();
  const dest = getAudioBus("sfx");
  if (!audio || !dest) return;
  if (lastAudioContext !== audio) {
    lastPlayed.clear();
    lastAudioContext = audio;
  }
  const now = audio.currentTime;
  const requested = now + Math.max(0, options.delay ?? 0);
  const minInterval = options.minInterval ?? DEFAULT_INTERVALS[kind] ?? 0;
  const previous = lastPlayed.get(kind) ?? Number.NEGATIVE_INFINITY;
  let start = requested;
  if (!options.force) {
    const scheduled = scheduleSfxTime(requested, previous, minInterval);
    if (scheduled === null) return;
    start = scheduled;
  }
  lastPlayed.set(kind, start);
  resumeAudio();
  playLayeredSfx(
    kind,
    audio,
    dest,
    Math.max(-0.9, Math.min(0.9, options.pan ?? 0)),
    Math.max(0, options.gain ?? 1),
    options.heavy === true,
    Math.max(0, start - now),
  );
}

/** Backwards-compatible shorthand for existing command/UI call sites. */
export function beep(kind: BeepKind): void {
  const mapped: Record<BeepKind, SfxKind> = {
    select: "uiSelect",
    ack: "uiConfirm",
    ackAttack: "orderAttack",
    ackHarvest: "orderHarvest",
    build: "buildStart",
    cancel: "uiCancel",
    alert: "warning",
    win: "victory",
    lose: "defeat",
  };
  playSfx(mapped[kind]);
}
