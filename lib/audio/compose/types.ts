import type { BiomeName, MissionKind } from "../../types";

export type MusicCue = "menu" | "briefing" | "mission" | "victory" | "defeat";
export type MusicIntensity = "calm" | "engaged" | "critical";
export type BassHit = { tone: number; oct: number } | null;
export type MusicVoiceType = "triangle" | "sawtooth" | "square" | "sine";
export type MusicGroove = "march" | "pulse" | "shuffle" | "half-time" | "breakbeat" | "four-floor" | "offbeat";
export type MusicScaleName =
  | "natural minor"
  | "dorian"
  | "mixolydian"
  | "major"
  | "phrygian"
  | "harmonic minor"
  | "minor pentatonic"
  | "lydian"
  | "double harmonic"
  | "blues";
export type MusicVoiceEngine = "dual-osc" | "acid-res" | "pwm" | "fm-bell" | "chip" | "cinematic";
export type MusicDrumKit = "gated" | "analog-808" | "chip-noise" | "industrial";
export type MusicPulseRole = "arp" | "stab" | "offbeat" | "none";
export type MusicBassRiffFamily =
  | "classic"
  | "industrial"
  | "syncopated"
  | "octave"
  | "sparse"
  | "descending"
  | "restless"
  | "walking"
  | "pedal"
  | "acid-slide"
  | "chip-ostinato"
  | "dub-space";
export type MusicFillStyle = "snare-tom" | "kick-roll" | "hat-chatter" | "tom-only";
export type MusicArrangementName =
  | "slow-burn"
  | "forward-drive"
  | "syncopated-strike"
  | "ghost-signal"
  | "bass-siege"
  | "wide-open"
  | "panic-run"
  | "command-theme"
  | "half-time-break"
  | "call-and-echo"
  | "double-drop"
  | "anthem-lift"
  | "melody-late"
  | "drums-out"
  | "inverted-hold"
  | "echo-canon";
export type MusicStyleName =
  | "neon-arpeggio"
  | "industrial-march"
  | "acid-grid"
  | "orbital-drift"
  | "cinematic-tension"
  | "signal-chase"
  | "chrome-fanfare"
  | "low-orbit"
  | "glass-chime"
  | "foundry-stomp"
  | "night-raid"
  | "ice-protocol"
  | "bit-garrison"
  | "resonant-coil"
  | "break-wire"
  | "dune-cipher"
  | "relay-dub"
  | "disco-command"
  | "choir-vector"
  | "tape-static";
export type MusicSectionName =
  | "intro"
  | "groove"
  | "hook"
  | "development"
  | "breakdown"
  | "escalation"
  | "climax"
  | "turnaround";
export type MusicStem = "bass" | "pulse" | "harmony" | "melody" | "counter";
export type MusicDrumKind = "kick" | "snare" | "clap" | "hat" | "openHat" | "tom" | "impact" | "rim" | "shaker";

export type MusicDrumProfile = {
  kickStart: number;
  kickEnd: number;
  kickTail: number;
  snareBody: number;
  snareNoise: number;
  hatFrequency: number;
  openHatFrequency: number;
  tomStart: number;
  tomEnd: number;
  impactStart: number;
  impactEnd: number;
  noisePan: number;
};

export type MusicArrangementProfile = {
  name: MusicArrangementName;
  bassStrides: readonly (2 | 4 | 8)[];
  pulseStrides: readonly (1 | 2 | 4)[];
  melodyEnabled: readonly boolean[];
  pulseEnabled: readonly boolean[];
  counterEnabled: readonly boolean[];
  holdBass: readonly boolean[];
  hatStride: readonly (1 | 2 | 4)[];
  fillStyle: readonly MusicFillStyle[];
  echoMelody: boolean;
  melodyDegreeOffset: number;
  rhythmOffset: 0 | 1 | 2 | 3;
  drumDensity: readonly number[];
};

export type MusicStyleProfile = {
  name: MusicStyleName;
  scalePool: readonly MusicScaleName[];
  groove: MusicGroove;
  grooveVariant: 0 | 1 | 2;
  progressionVariant: 0 | 1 | 2 | 3;
  bassRiffFamily: MusicBassRiffFamily;
  arrangement: MusicArrangementProfile;
  tempoBias: number;
  swing: number;
  bassType: MusicVoiceType;
  pulseType: MusicVoiceType;
  melodyType: MusicVoiceType;
  counterType: MusicVoiceType;
  padType: MusicVoiceType;
  padDetune: readonly [number, number, number, number];
  padLfoRate: number;
  padLfoDepth: number;
  padQ: number;
  delayBeats: number;
  delayFeedback: number;
  delayWet: number;
  reverbSeconds: number;
  reverbDecay: number;
  reverbSend: number;
  reverbWet: number;
  cutoffMin: number;
  cutoffMax: number;
  bassStride: 2 | 4 | 8;
  pulseStride: 1 | 2 | 4;
  melodyOctave: 1 | 2;
  rhythmShift: 0 | 1 | 2;
  counterChance: number;
  drumDensity: number;
  voiceEngine: MusicVoiceEngine;
  drumKit: MusicDrumKit;
  pulseRole: MusicPulseRole;
  saturationAmount: number;
  drum: MusicDrumProfile;
};

export const TITLE_MUSIC_SEED = 0;
export const TUTORIAL_MUSIC_MISSION = -1;
export const STEPS_PER_BAR = 16;
export const BARS_PER_SECTION = 16;
export const SECTION_COUNT = 8;
export const MUSIC_BARS = SECTION_COUNT * BARS_PER_SECTION;
export const MUSIC_STEPS = STEPS_PER_BAR * MUSIC_BARS;


export * from "./progressions";

export type MusicNoteEvent = {
  step: number;
  midi: number;
  duration: number;
  velocity: number;
  accent?: boolean;
};

export type MusicDrumEvent = {
  step: number;
  kind: MusicDrumKind;
  velocity: number;
  accent?: boolean;
};

export type MusicMotif = {
  degrees: (number | null)[];
  response: (number | null)[];
  rhythm: number[];
  accentSteps: number[];
};

export type MusicSection = {
  name: MusicSectionName;
  startBar: number;
  endBar: number;
  energy: number;
};

export type MusicTheme = {
  rootMidi: number;
  scale: number[];
  scaleName: string;
  groove: MusicGroove;
  progressionA: number[];
  progressionB: number[];
  progressionC: number[];
  progressionD: number[];
  bassRiffA: BassHit[];
  bassRiffB: BassHit[];
  bassRiffC: BassHit[];
  bassRiffD: BassHit[];
  motif: MusicMotif;
  developmentMotif: MusicMotif;
  hook: MusicMotif;
};

export type MusicPattern = {
  cue: MusicCue;
  seed: number;
  missionIndex: number;
  biome?: BiomeName;
  missionKind?: MissionKind;
  bpm: number;
  swing: number;
  bars: number;
  steps: number;
  rootHz: number;
  rootMidi: number;
  scaleName: string;
  cutoff: number;
  style: MusicStyleProfile;
  bassType: MusicVoiceType;
  arpType: MusicVoiceType;
  melodyType: MusicVoiceType;
  counterType: MusicVoiceType;
  delayBeats: number;
  theme: MusicTheme;
  motif: MusicMotif;
  sections: MusicSection[];
  notes: Record<MusicStem, MusicNoteEvent[]>;
  drums: MusicDrumEvent[];
  bass: (number | null)[];
  arp: (number | null)[];
  melody: (number | null)[];
  counter: (number | null)[];
  harmony: (number | null)[];
  kick: boolean[];
  snare: boolean[];
  hats: boolean[];
  openHats: boolean[];
  padRoot: number[];
  padThird: number[];
  padFifth: number[];
  padSeventh: number[];
};
