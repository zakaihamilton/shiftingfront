import { MAX_SFX_QUEUE_S } from "./types";

let noiseBuf: AudioBuffer | null = null;
const driveCurves = new Map<number, Float32Array>();

export function scheduleSfxTime(
  now: number,
  previous: number,
  minInterval: number,
  maxQueue = MAX_SFX_QUEUE_S,
): number | null {
  if (!Number.isFinite(now)) return null;
  if (!(minInterval > 0) || !Number.isFinite(previous)) return now;
  const start = Math.max(now, previous + minInterval);
  if (start - now > maxQueue) return null;
  return start;
}

export function jitter(hz: number, amount = 0.06): number {
  return Math.max(20, hz * (1 + (Math.random() * 2 - 1) * amount));
}

export function getNoiseBuffer(audio: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === audio.sampleRate) return noiseBuf;
  const buffer = audio.createBuffer(1, Math.max(1, Math.floor(audio.sampleRate * 0.4)), audio.sampleRate);
  const data = buffer.getChannelData(0);
  let state = 0x1f123bb5;
  for (let i = 0; i < data.length; i++) {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    data[i] = ((state ^ (state >>> 14)) >>> 0) / 4294967295 * 2 - 1;
  }
  noiseBuf = buffer;
  return buffer;
}

export function connect(audio: AudioContext, source: AudioNode, dest: AudioNode, pan: number): StereoPannerNode | null {
  if (Math.abs(pan) < 0.01) {
    source.connect(dest);
    return null;
  }
  const panner = audio.createStereoPanner();
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), audio.currentTime);
  source.connect(panner);
  panner.connect(dest);
  return panner;
}

function disconnectSfxGraph(nodes: Array<AudioNode | null | undefined>): void {
  for (const node of nodes) {
    try {
      node?.disconnect();
    } catch {
      // Already disconnected.
    }
  }
}

export function driveCurve(amount: number): Float32Array {
  const k = Math.max(1, amount);
  const cached = driveCurves.get(k);
  if (cached) return cached;
  const n = 257;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * k);
  }
  driveCurves.set(k, curve);
  return curve;
}

export function createDrive(audio: AudioContext, amount: number): WaveShaperNode {
  const shaper = audio.createWaveShaper();
  shaper.curve = new Float32Array(driveCurve(amount));
  shaper.oversample = "2x";
  return shaper;
}

export function tone(
  audio: AudioContext,
  dest: AudioNode,
  options: {
    frequency: number;
    endFrequency?: number;
    duration: number;
    type: OscillatorType;
    gain: number;
    pan: number;
    cutoff?: number;
    delay?: number;
    drive?: number;
  },
): void {
  const o = audio.createOscillator();
  const g = audio.createGain();
  const f = audio.createBiquadFilter();
  const start = audio.currentTime + Math.max(0, options.delay ?? 0);
  const attack = Math.min(0.008, options.duration * 0.18);
  o.type = options.type;
  o.frequency.setValueAtTime(Math.max(20, options.frequency), start);
  if (options.endFrequency !== undefined) {
    o.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), start + options.duration);
  }
  f.type = "lowpass";
  f.frequency.setValueAtTime(options.cutoff ?? 2600, start);
  f.Q.setValueAtTime(0.8, start);
  g.gain.setValueAtTime(0.001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, options.gain), start + attack);
  g.gain.exponentialRampToValueAtTime(0.001, start + options.duration);
  o.connect(f);
  let shaper: WaveShaperNode | undefined;
  if (options.drive && options.drive > 1) {
    shaper = createDrive(audio, options.drive);
    f.connect(shaper);
    shaper.connect(g);
  } else {
    f.connect(g);
  }
  const panner = connect(audio, g, dest, options.pan);
  o.onended = () => disconnectSfxGraph([o, f, shaper, g, panner]);
  o.start(start);
  o.stop(start + options.duration + 0.03);
}

export function noise(
  audio: AudioContext,
  dest: AudioNode,
  options: {
    duration: number;
    gain: number;
    pan: number;
    frequency: number;
    endFrequency?: number;
    type?: BiquadFilterType;
    delay?: number;
    q?: number;
  },
): void {
  const source = audio.createBufferSource();
  const g = audio.createGain();
  const f = audio.createBiquadFilter();
  const start = audio.currentTime + Math.max(0, options.delay ?? 0);
  const attack = Math.min(0.004, options.duration * 0.16);
  source.buffer = getNoiseBuffer(audio);
  source.loop = true;
  f.type = options.type ?? "bandpass";
  f.frequency.setValueAtTime(options.frequency, start);
  if (options.endFrequency !== undefined) {
    f.frequency.exponentialRampToValueAtTime(Math.max(40, options.endFrequency), start + options.duration);
  }
  f.Q.setValueAtTime(options.q ?? 1.1, start);
  g.gain.setValueAtTime(0.001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(0.001, options.gain), start + attack);
  g.gain.exponentialRampToValueAtTime(0.001, start + options.duration);
  source.connect(f);
  f.connect(g);
  const panner = connect(audio, g, dest, options.pan);
  source.onended = () => disconnectSfxGraph([source, f, g, panner]);
  source.start(start);
  source.stop(start + options.duration + 0.03);
}
