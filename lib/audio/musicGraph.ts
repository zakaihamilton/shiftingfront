import {
  type MusicDrumEvent,
  type MusicIntensity,
  type MusicNoteEvent,
  type MusicPattern,
  type MusicStem,
} from "./compose";
import { AUDIO_SAMPLE_RATE } from "./constants";
import type {
  AudioGraphContext,
  MusicGraph,
  PatternIndex,
} from "./musicState";
import { noiseBuf, setNoiseBuf } from "./musicState";

export type { AudioGraphContext, MusicGraph, PatternIndex };

export const SAMPLE_RATE = AUDIO_SAMPLE_RATE;
export const MASTER_GAIN = 0.082;
export const PAD_GAIN = 0.09;
export const DUCK_RATIO = 0.34;
export const CROSSFADE_S = 0.55;
export const SCHEDULE_AHEAD_S = 0.22;
export const SCHEDULER_MS = 25;
export const ATTACK_S = 0.012;

export const INTENSITY_MULTIPLIER: Record<MusicIntensity, number> = {
  calm: 0.86,
  engaged: 1,
  critical: 1.08,
};

export function masterGain(value: MusicIntensity = "calm", isDucked = false): number {
  return MASTER_GAIN * INTENSITY_MULTIPLIER[value] * (isDucked ? DUCK_RATIO : 1);
}

export function layerMultiplier(layer: "bass" | "pulse" | "harmony" | "counter" | "melody" | "drums", value: MusicIntensity = "calm"): number {
  if (value === "critical") return layer === "drums" ? 1.08 : layer === "harmony" ? 0.94 : layer === "counter" ? 0.86 : 1.02;
  if (value === "engaged") return layer === "drums" ? 1.02 : layer === "harmony" ? 0.82 : layer === "counter" ? 0.72 : 1;
  if (layer === "drums") return 0.88;
  if (layer === "counter") return 0.62;
  if (layer === "harmony") return 0.7;
  if (layer === "pulse") return 0.9;
  return 1;
}

export function padGainFor(value: MusicIntensity = "calm"): number {
  if (value === "critical") return PAD_GAIN * 0.48;
  if (value === "engaged") return PAD_GAIN * 0.7;
  return PAD_GAIN;
}

function createSaturationCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(new ArrayBuffer(1024 * Float32Array.BYTES_PER_ELEMENT));
  const k = amount * 60;
  for (let i = 0; i < curve.length; i++) {
    const x = (i * 2) / (curve.length - 1) - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

function createImpulseResponse(audio: AudioGraphContext, seconds: number, decay: number): AudioBuffer {
  const length = Math.max(1, Math.floor(audio.sampleRate * seconds));
  const impulse = audio.createBuffer(2, length, audio.sampleRate);
  let state = 0x6d2b79f5;
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < data.length; i++) {
      state = Math.imul(state ^ (state >>> 15), 1 | state);
      state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
      const noise = ((state ^ (state >>> 14)) >>> 0) / 4294967295 * 2 - 1;
      data[i] = noise * (1 - i / data.length) ** decay * (channel === 0 ? 1 : 0.92);
    }
  }
  return impulse;
}

export function getNoiseBuffer(audio: AudioGraphContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === audio.sampleRate) return noiseBuf;
  const buf = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * 0.8)), audio.sampleRate);
  const data = buf.getChannelData(0);
  let state = 0x4d595df4;
  for (let i = 0; i < data.length; i++) {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    data[i] = ((state ^ (state >>> 14)) >>> 0) / 4294967295 * 2 - 1;
  }
  setNoiseBuf(buf);
  return buf;
}

function createBus(audio: AudioGraphContext, parent: AudioNode, gain: number): GainNode {
  const bus = audio.createGain();
  bus.gain.setValueAtTime(gain, audio.currentTime);
  bus.connect(parent);
  return bus;
}

function indexNoteLane(events: MusicNoteEvent[]): Map<number, MusicNoteEvent[]> {
  const lane = new Map<number, MusicNoteEvent[]>();
  for (const event of events) {
    const existing = lane.get(event.step);
    if (existing) existing.push(event);
    else lane.set(event.step, [event]);
  }
  return lane;
}

export function indexPattern(p: MusicPattern): PatternIndex {
  const notes = {
    bass: indexNoteLane(p.notes.bass),
    pulse: indexNoteLane(p.notes.pulse),
    harmony: indexNoteLane(p.notes.harmony),
    melody: indexNoteLane(p.notes.melody),
    counter: indexNoteLane(p.notes.counter),
  };
  const drums = new Map<number, MusicDrumEvent[]>();
  for (const event of p.drums) {
    const events = drums.get(event.step);
    if (events) events.push(event);
    else drums.set(event.step, [event]);
  }
  return { notes, drums };
}

export function stemBus(g: MusicGraph, stem: MusicStem): GainNode {
  if (stem === "bass") return g.bassBus;
  if (stem === "pulse") return g.pulseBus;
  if (stem === "harmony") return g.harmonyBus;
  if (stem === "melody") return g.leadBus;
  return g.counterBus;
}

export function notePan(stem: MusicStem): number {
  if (stem === "pulse") return -0.34;
  if (stem === "harmony") return 0.04;
  if (stem === "melody") return 0.3;
  if (stem === "counter") return -0.12;
  return 0;
}

export function createGraph(audio: AudioGraphContext, destination: AudioNode, p: MusicPattern): MusicGraph {
  const master = audio.createGain();
  const highpass = audio.createBiquadFilter();
  const saturation = audio.createWaveShaper();
  const compressor = audio.createDynamicsCompressor();
  const now = audio.currentTime;

  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(38, now);
  saturation.curve = createSaturationCurve(p.style.saturationAmount);
  saturation.oversample = "2x";
  compressor.threshold.setValueAtTime(-16, now);
  compressor.knee.setValueAtTime(18, now);
  compressor.ratio.setValueAtTime(3.4, now);
  compressor.attack.setValueAtTime(0.02, now);
  compressor.release.setValueAtTime(0.28, now);
  master.gain.setValueAtTime(masterGain("calm", false), now);
  master.connect(highpass);
  highpass.connect(saturation);
  saturation.connect(compressor);
  compressor.connect(destination);

  const bassDuck = createBus(audio, master, 1);
  const bassBus = createBus(audio, bassDuck, 0.94);
  const rhythmBus = createBus(audio, master, 0.76);
  const harmonyBus = createBus(audio, master, 0.72);
  const pulseBus = createBus(audio, master, 0.74);
  const leadBus = createBus(audio, master, 0.8);
  const counterBus = createBus(audio, master, 0.38);
  const fxBus = createBus(audio, master, 0.34);

  const reverb = audio.createConvolver();
  const reverbFilter = audio.createBiquadFilter();
  const reverbSend = audio.createGain();
  const reverbWet = audio.createGain();
  reverb.buffer = createImpulseResponse(audio, p.style.reverbSeconds, p.style.reverbDecay);
  reverbFilter.type = "lowpass";
  reverbFilter.frequency.setValueAtTime(Math.min(5600, Math.max(1800, p.cutoff * 2.8)), now);
  reverbFilter.Q.setValueAtTime(0.32, now);
  reverbSend.gain.setValueAtTime(p.style.reverbSend, now);
  reverbWet.gain.setValueAtTime(p.style.reverbWet, now);
  reverbSend.connect(reverb);
  reverb.connect(reverbFilter);
  reverbFilter.connect(reverbWet);
  reverbWet.connect(master);
  const padReverbSend = createBus(audio, reverbSend, 0.24);

  const delay = audio.createDelay(1.5);
  const delayFilter = audio.createBiquadFilter();
  const delayFeedback = audio.createGain();
  const delayWet = audio.createGain();
  delayFilter.type = "lowpass";
  delayFilter.frequency.setValueAtTime(Math.min(5200, Math.max(1600, p.cutoff * 2.4)), now);
  delayFilter.Q.setValueAtTime(0.42, now);
  delayFeedback.gain.setValueAtTime(p.style.delayFeedback, now);
  delayWet.gain.setValueAtTime(p.style.delayWet, now);
  delay.connect(delayFilter);
  delayFilter.connect(delayFeedback);
  delayFeedback.connect(delay);
  delayFilter.connect(delayWet);
  delayWet.connect(master);
  leadBus.connect(delay);
  pulseBus.connect(reverbSend);
  leadBus.connect(reverbSend);
  counterBus.connect(reverbSend);

  const padGain = audio.createGain();
  const padFilter = audio.createBiquadFilter();
  const padOscA = audio.createOscillator();
  const padOscB = audio.createOscillator();
  const padOscC = audio.createOscillator();
  const padOscD = audio.createOscillator();
  const padLfo = audio.createOscillator();
  const padLfoGain = audio.createGain();
  const padGate = audio.createGain();
  const padPanA = audio.createStereoPanner();
  const padPanB = audio.createStereoPanner();
  const padPanC = audio.createStereoPanner();
  const padPanD = audio.createStereoPanner();
  const padPans = [padPanA, padPanB, padPanC, padPanD];
  const padReverbVoices = [0.16, 0.2, 0.11, 0.14].map((depth) => {
    const send = audio.createGain();
    send.gain.setValueAtTime(depth, now);
    return send;
  });
  const padReverbFilter = audio.createBiquadFilter();
  const padReverbGate = audio.createGain();
  padFilter.type = "lowpass";
  padFilter.frequency.setValueAtTime(Math.min(p.cutoff, 960), now);
  padFilter.Q.setValueAtTime(p.style.padQ, now);
  padReverbFilter.type = "lowpass";
  padReverbFilter.frequency.setValueAtTime(Math.min(p.cutoff, 960), now);
  padReverbFilter.Q.setValueAtTime(p.style.padQ, now);
  padGain.gain.setValueAtTime(PAD_GAIN, now);
  padGate.gain.setValueAtTime(1, now);
  padReverbGate.gain.setValueAtTime(1, now);
  padOscA.type = p.style.padType;
  padOscB.type = p.style.padType;
  padOscC.type = p.style.padType;
  padOscD.type = p.style.padType;
  padOscA.frequency.setValueAtTime(p.padRoot[0] ?? p.rootHz, now);
  padOscB.frequency.setValueAtTime((p.padThird[0] ?? (p.padRoot[0] ?? p.rootHz) * 1.25) * 1.002, now);
  padOscC.frequency.setValueAtTime((p.padFifth[0] ?? p.rootHz * 1.5) * 0.998, now);
  padOscD.frequency.setValueAtTime((p.padSeventh[0] ?? (p.padRoot[0] ?? p.rootHz) * 1.78) * 1.001, now);
  padOscA.detune.setValueAtTime(p.style.padDetune[0], now);
  padOscB.detune.setValueAtTime(p.style.padDetune[1], now);
  padOscC.detune.setValueAtTime(p.style.padDetune[2], now);
  padOscD.detune.setValueAtTime(p.style.padDetune[3], now);
  padLfo.type = "sine";
  padLfo.frequency.setValueAtTime(p.style.padLfoRate, now);
  padLfoGain.gain.setValueAtTime(p.style.padLfoDepth, now);
  padPanA.pan.setValueAtTime(-0.34, now);
  padPanB.pan.setValueAtTime(0.34, now);
  padPanC.pan.setValueAtTime(-0.2, now);
  padPanD.pan.setValueAtTime(0.2, now);
  padOscA.connect(padPanA);
  padOscB.connect(padPanB);
  padOscC.connect(padPanC);
  padOscD.connect(padPanD);
  padPans.forEach((panner, index) => {
    panner.connect(padFilter);
    panner.connect(padReverbVoices[index]!);
    padReverbVoices[index]!.connect(padReverbFilter);
  });
  padFilter.connect(padGain);
  padGain.connect(padGate);
  padGate.connect(harmonyBus);
  padReverbFilter.connect(padReverbGate);
  padReverbGate.connect(padReverbSend);
  padLfo.connect(padLfoGain);
  padLfoGain.connect(padFilter.frequency);
  padOscA.start(now);
  padOscB.start(now);
  padOscC.start(now);
  padOscD.start(now);
  padLfo.start(now);

  return {
    style: p.style,
    master,
    highpass,
    saturation,
    compressor,
    bassBus,
    rhythmBus,
    harmonyBus,
    pulseBus,
    leadBus,
    counterBus,
    fxBus,
    bassDuck,
    reverb,
    reverbFilter,
    reverbSend,
    reverbWet,
    delay,
    delayFilter,
    delayFeedback,
    delayWet,
    padGain,
    padFilter,
    padOscA,
    padOscB,
    padOscC,
    padOscD,
    padLfo,
    padLfoGain,
    padGate,
    padPanA,
    padPanB,
    padPanC,
    padPanD,
    padReverbFilter,
    padReverbGate,
    padReverbSend,
    padReverbVoices,
    padBase: PAD_GAIN,
    index: indexPattern(p),
  };
}

export function disconnectGraph(g: MusicGraph): void {
  for (const oscillator of [g.padOscA, g.padOscB, g.padOscC, g.padOscD, g.padLfo]) {
    try {
      oscillator.stop();
    } catch {
      /* Offline contexts may already be complete. */
    }
    oscillator.disconnect();
  }
  for (const panner of [g.padPanA, g.padPanB, g.padPanC, g.padPanD]) panner.disconnect();
  for (const node of [
    g.padFilter, g.padGain, g.padGate, g.padLfoGain, g.padReverbFilter, g.padReverbGate, g.padReverbSend,
    ...g.padReverbVoices, g.delay, g.delayFeedback, g.delayWet,
    g.reverb, g.reverbFilter, g.reverbSend, g.reverbWet, g.bassBus, g.bassDuck, g.rhythmBus, g.harmonyBus,
    g.pulseBus, g.leadBus, g.counterBus, g.fxBus, g.highpass, g.saturation,
    g.delayFilter,
    g.compressor, g.master,
  ]) node.disconnect();
}
