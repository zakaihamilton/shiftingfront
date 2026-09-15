import {
  TITLE_MUSIC_SEED,
  type MusicCue,
  type MusicDrumEvent,
  type MusicIntensity,
  type MusicNoteEvent,
  type MusicPattern,
  type MusicStyleProfile,
  type MusicStem,
} from "./compose";

export type AudioGraphContext = AudioContext | OfflineAudioContext;

export type PatternIndex = {
  notes: Record<MusicStem, Map<number, MusicNoteEvent[]>>;
  drums: Map<number, MusicDrumEvent[]>;
};

export type MusicGraph = {
  style: MusicStyleProfile;
  master: GainNode;
  highpass: BiquadFilterNode;
  saturation: WaveShaperNode;
  compressor: DynamicsCompressorNode;
  bassBus: GainNode;
  rhythmBus: GainNode;
  harmonyBus: GainNode;
  pulseBus: GainNode;
  leadBus: GainNode;
  counterBus: GainNode;
  fxBus: GainNode;
  bassDuck: GainNode;
  reverb: ConvolverNode;
  reverbFilter: BiquadFilterNode;
  reverbSend: GainNode;
  reverbWet: GainNode;
  delay: DelayNode;
  delayFilter: BiquadFilterNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  padGain: GainNode;
  padFilter: BiquadFilterNode;
  padOscA: OscillatorNode;
  padOscB: OscillatorNode;
  padOscC: OscillatorNode;
  padOscD: OscillatorNode;
  padLfo: OscillatorNode;
  padLfoGain: GainNode;
  padGate: GainNode;
  padPanA: StereoPannerNode;
  padPanB: StereoPannerNode;
  padPanC: StereoPannerNode;
  padPanD: StereoPannerNode;
  padReverbFilter: BiquadFilterNode;
  padReverbGate: GainNode;
  padReverbSend: GainNode;
  padReverbVoices: readonly GainNode[];
  padBase: number;
  index: PatternIndex;
};

export let enabled = true;
export let ducked = false;
// Music is opt-in to the active battlefield; menu initialization must not
// create a playable graph before a mission route selects a cue.
export let paused = true;
export let intensity: MusicIntensity = "calm";
export let pendingIntensity: MusicIntensity | null = null;
export let cue: MusicCue = "menu";
export let seed = TITLE_MUSIC_SEED;
export let missionIndex = 0;
export let trackIndex = 0;
export let transitioning = false;
export let pattern: MusicPattern | null = null;
export let timer: number | null = null;
export let nextNoteTime = 0;
export let step = 0;
export let graph: MusicGraph | null = null;
export let fadeGen = 0;
export let noiseBuf: AudioBuffer | null = null;

export function setEnabled(v: boolean) { enabled = v; }
export function setDucked(v: boolean) { ducked = v; }
export function setPaused(v: boolean) { paused = v; }
export function setIntensity(v: MusicIntensity) { intensity = v; }
export function setPendingIntensity(v: MusicIntensity | null) { pendingIntensity = v; }
export function setCue(v: MusicCue) { cue = v; }
export function setSeed(v: number) { seed = v; }
export function setMissionIndex(v: number) { missionIndex = v; }
export function setTrackIndex(v: number) { trackIndex = v; }
export function setTransitioning(v: boolean) { transitioning = v; }
export function setPattern(v: MusicPattern | null) { pattern = v; }
export function setTimer(v: number | null) { timer = v; }
export function setNextNoteTime(v: number) { nextNoteTime = v; }
export function setStep(v: number) { step = v; }
export function setGraph(v: MusicGraph | null) { graph = v; }
export function setFadeGen(v: number) { fadeGen = v; }
export function setNoiseBuf(v: AudioBuffer | null) { noiseBuf = v; }

export function incrementFadeGen(): number { return ++fadeGen; }
