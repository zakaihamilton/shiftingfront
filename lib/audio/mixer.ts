import { defaultSettings } from "../persist/settings";
import { getAudioContext, peekAudioContext } from "./context";

export type AudioBus = "music" | "sfx";
export type AudioVolumeKey = "masterVolume" | "musicVolume" | "sfxVolume" | "voiceVolume";

export type AudioLevels = {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
};

const defaults = defaultSettings();
const DEFAULT_LEVELS: AudioLevels = {
  masterVolume: defaults.masterVolume,
  musicVolume: defaults.musicVolume,
  sfxVolume: defaults.sfxVolume,
  voiceVolume: defaults.voiceVolume,
};

const RAMP_S = 0.045;
/** Makeup after the limiter so compressed bodies stay present. */
export const SFX_MAKEUP_GAIN = 1.35;

let levels: AudioLevels = { ...DEFAULT_LEVELS };
let enabled: Record<AudioBus, boolean> = { music: true, sfx: true };
let foreground = true;
let master: GainNode | null = null;
let music: GainNode | null = null;
let sfx: GainNode | null = null;
let sfxLimiter: DynamicsCompressorNode | null = null;
let sfxMakeup: GainNode | null = null;
let musicDuck: { until: number; depth: number } | null = null;

export function clampAudioVolume(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

export function isAudioForeground(): boolean {
  return foreground;
}

function applyLevels(audio: AudioContext): void {
  const now = audio.currentTime;
  master?.gain.setTargetAtTime(levels.masterVolume, now, RAMP_S);
  const activeDuck = musicDuck && now < musicDuck.until ? musicDuck : null;
  if (!activeDuck) musicDuck = null;
  music?.gain.cancelScheduledValues?.(now);
  music?.gain.setTargetAtTime(
    enabled.music && foreground ? levels.musicVolume * (activeDuck?.depth ?? 1) : 0,
    now,
    activeDuck ? 0.018 : RAMP_S,
  );
  if (activeDuck) {
    music?.gain.setTargetAtTime(enabled.music && foreground ? levels.musicVolume : 0, activeDuck.until, 0.08);
  }
  sfx?.gain.setTargetAtTime(enabled.sfx && foreground ? levels.sfxVolume : 0, now, RAMP_S);
}

function disconnectNode(node: AudioNode | null): void {
  try {
    node?.disconnect();
  } catch {
    /* already disconnected or never connected */
  }
}

function teardownMixer(): void {
  disconnectNode(music);
  disconnectNode(sfx);
  disconnectNode(sfxLimiter);
  disconnectNode(sfxMakeup);
  disconnectNode(master);
  master = null;
  music = null;
  sfx = null;
  sfxLimiter = null;
  sfxMakeup = null;
}

function configureLimiter(limiter: DynamicsCompressorNode, now: number): void {
  limiter.threshold.setValueAtTime(-10, now);
  limiter.knee.setValueAtTime(3, now);
  limiter.ratio.setValueAtTime(12, now);
  limiter.attack.setValueAtTime(0, now);
  limiter.release.setValueAtTime(0.1, now);
}

function ensureMixer(audio: AudioContext): void {
  if (master && music && sfx && sfxLimiter && sfxMakeup) {
    applyLevels(audio);
    return;
  }

  teardownMixer();

  let nextMaster: GainNode | undefined;
  let nextMusic: GainNode | undefined;
  let nextSfx: GainNode | undefined;
  let nextLimiter: DynamicsCompressorNode | undefined;
  let nextMakeup: GainNode | undefined;
  try {
    nextMaster = audio.createGain();
    nextMusic = audio.createGain();
    nextSfx = audio.createGain();
    nextLimiter = audio.createDynamicsCompressor();
    nextMakeup = audio.createGain();
    configureLimiter(nextLimiter, audio.currentTime);
    nextMakeup.gain.setValueAtTime(SFX_MAKEUP_GAIN, audio.currentTime);
    nextMusic.connect(nextMaster);
    nextSfx.connect(nextLimiter);
    nextLimiter.connect(nextMakeup);
    nextMakeup.connect(nextMaster);
    nextMaster.connect(audio.destination);
  } catch (error) {
    disconnectNode(nextMusic ?? null);
    disconnectNode(nextSfx ?? null);
    disconnectNode(nextLimiter ?? null);
    disconnectNode(nextMakeup ?? null);
    disconnectNode(nextMaster ?? null);
    throw error;
  }

  master = nextMaster;
  music = nextMusic;
  sfx = nextSfx;
  sfxLimiter = nextLimiter;
  sfxMakeup = nextMakeup;
  applyLevels(audio);
}

export function getAudioBus(bus: AudioBus): AudioNode | null {
  const audio = getAudioContext();
  if (!audio) return null;
  ensureMixer(audio);
  return bus === "music" ? music : sfx;
}

export function setAudioLevels(next: Partial<AudioLevels>): void {
  levels = {
    masterVolume: next.masterVolume === undefined ? levels.masterVolume : clampAudioVolume(next.masterVolume),
    musicVolume: next.musicVolume === undefined ? levels.musicVolume : clampAudioVolume(next.musicVolume),
    sfxVolume: next.sfxVolume === undefined ? levels.sfxVolume : clampAudioVolume(next.sfxVolume),
    voiceVolume: next.voiceVolume === undefined ? levels.voiceVolume : clampAudioVolume(next.voiceVolume),
  };
  const audio = peekAudioContext();
  if (audio) {
    ensureMixer(audio);
    applyLevels(audio);
  }
}

export function setAudioBusEnabled(bus: AudioBus, value: boolean): void {
  enabled[bus] = value;
  const audio = peekAudioContext();
  if (audio) {
    ensureMixer(audio);
    applyLevels(audio);
  }
}

/** Mute both buses while the game is not the active foreground page. */
export function setAudioForeground(value: boolean): void {
  foreground = value;
  const audio = peekAudioContext();
  if (audio) {
    ensureMixer(audio);
    applyLevels(audio);
  }
}

/** Briefly make room for nearby heavy battlefield cues, then recover the saved music level. */
export function duckMusic(depth = 0.78, duration = 0.16): void {
  const audio = peekAudioContext();
  if (!audio || !enabled.music) return;
  ensureMixer(audio);
  if (!music) return;
  const now = audio.currentTime;
  const nextDepth = clampAudioVolume(depth);
  const nextUntil = now + Math.max(0.04, duration);
  const activeDuck = musicDuck && now < musicDuck.until ? musicDuck : null;
  musicDuck = {
    until: Math.max(nextUntil, activeDuck?.until ?? 0),
    depth: Math.min(nextDepth, activeDuck?.depth ?? 1),
  };
  const ducked = levels.musicVolume * musicDuck.depth;
  music.gain.cancelScheduledValues?.(now);
  music.gain.setTargetAtTime(ducked, now, 0.018);
  music.gain.setTargetAtTime(levels.musicVolume, musicDuck.until, 0.08);
}

export function getAudioLevels(): AudioLevels {
  return { ...levels };
}

export function resetAudioMixerForTests(): void {
  levels = { ...DEFAULT_LEVELS };
  enabled = { music: true, sfx: true };
  foreground = true;
  musicDuck = null;
  teardownMixer();
}
