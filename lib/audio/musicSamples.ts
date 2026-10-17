import { createRng } from "../seed/rng";
import type { MusicDrumKit, MusicDrumProfile } from "./compose";
import type { AudioGraphContext } from "./musicGraph";

export type MusicSampleName = "kick" | "snare" | "clap" | "hat" | "openHat" | "tom" | "impact" | "rim" | "shaker";

const DURATIONS: Record<MusicSampleName, number> = {
  kick: 0.52,
  snare: 0.3,
  clap: 0.28,
  hat: 0.08,
  openHat: 0.42,
  tom: 0.34,
  impact: 0.58,
  rim: 0.09,
  shaker: 0.16,
};

const KIT_SEEDS: Record<MusicDrumKit, number> = {
  gated: 173,
  "analog-808": 409,
  "chip-noise": 827,
  industrial: 1297,
};

const sampleCache = new WeakMap<object, Map<string, AudioBuffer>>();

function kitCharacter(kit: MusicDrumKit) {
  if (kit === "analog-808") return { grit: 0.16, metallic: 0.36 };
  if (kit === "chip-noise") return { grit: 0.46, metallic: 0.2 };
  if (kit === "industrial") return { grit: 0.58, metallic: 0.5 };
  return { grit: 0.28, metallic: 0.32 };
}

function profileKey(kit: MusicDrumKit, drum: MusicDrumProfile, kind: MusicSampleName): string {
  return [
    kit,
    kind,
    drum.kickStart,
    drum.kickEnd,
    drum.kickTail,
    drum.snareBody,
    drum.snareNoise,
    drum.hatFrequency,
    drum.openHatFrequency,
    drum.tomStart,
    drum.tomEnd,
    drum.impactStart,
    drum.impactEnd,
  ].join(":");
}

function renderSample(
  audio: AudioGraphContext,
  kit: MusicDrumKit,
  drum: MusicDrumProfile,
  kind: MusicSampleName,
): AudioBuffer {
  const sampleRate = audio.sampleRate;
  const length = Math.max(1, Math.floor(sampleRate * DURATIONS[kind]));
  const buffer = audio.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const rng = createRng(KIT_SEEDS[kit], `music-one-shot:${kind}`);
  const character = kitCharacter(kit);
  let phase = 0;
  let previousNoise = 0;
  let highNoise = 0;
  const noiseFeedback = Math.exp(-2 * Math.PI * drum.snareNoise / sampleRate);
  let peak = 0;

  for (let i = 0; i < length; i++) {
    const time = i / sampleRate;
    const noise = rng.next() * 2 - 1;
    highNoise = noise - previousNoise + highNoise * noiseFeedback;
    previousNoise = noise;
    let sample = 0;

    if (kind === "kick") {
      const frequency = drum.kickEnd + (drum.kickStart - drum.kickEnd) * Math.exp(-time * 19);
      phase += Math.PI * 2 * frequency / sampleRate;
      const envelope = Math.exp(-time * (3 / Math.max(0.04, drum.kickTail)));
      const body = Math.sin(phase) + Math.sin(phase * 2) * 0.2 + Math.sin(phase * 3) * 0.055;
      const click = Math.exp(-time * 110) * (noise * 0.12 + Math.sin(phase * 8) * 0.05);
      sample = body * envelope * (kit === "analog-808" ? 0.9 : 0.76) + click;
      if (kit === "chip-noise") sample = Math.tanh(sample * 2.4);
    } else if (kind === "snare") {
      const tone = Math.sin(Math.PI * 2 * drum.snareBody * time) * Math.exp(-time * 27);
      const noiseEnvelope = Math.exp(-time * (kit === "analog-808" ? 19 : 15));
      sample = highNoise * noiseEnvelope * (0.56 + character.grit * 0.3) + tone * 0.34;
      if (kit === "industrial") sample += Math.sin(Math.PI * 2 * 620 * time) * Math.exp(-time * 35) * 0.08;
    } else if (kind === "clap") {
      let burst = 0;
      for (const onset of [0, 0.012, 0.024, 0.039]) {
        const elapsed = time - onset;
        if (elapsed >= 0) burst += Math.exp(-elapsed * (elapsed < 0.012 ? 210 : 39)) * (elapsed < 0.012 ? 0.56 : 0.22);
      }
      sample = highNoise * burst * (kit === "industrial" ? 0.64 : 0.52);
    } else if (kind === "hat" || kind === "openHat") {
      const decay = kind === "openHat" ? 8 : 36;
      const noiseLayer = highNoise * Math.exp(-time * decay) * (kind === "openHat" ? 0.2 : 0.28);
      const metal = (
        Math.sin(Math.PI * 2 * 3177 * time) +
        Math.sin(Math.PI * 2 * 4219 * time + 0.4) * 0.72 +
        Math.sin(Math.PI * 2 * 5633 * time + 1.3) * 0.48 +
        Math.sin(Math.PI * 2 * 6871 * time + 2.1) * 0.3
      ) * Math.exp(-time * decay) * character.metallic;
      sample = noiseLayer + metal;
      if (kit === "chip-noise") sample = Math.tanh(sample * 1.8);
    } else if (kind === "tom") {
      const frequency = drum.tomEnd + (drum.tomStart - drum.tomEnd) * Math.exp(-time * 4.5);
      phase += Math.PI * 2 * frequency / sampleRate;
      sample = Math.sin(phase) * Math.exp(-time * 9) + highNoise * Math.exp(-time * 47) * 0.08;
    } else if (kind === "impact") {
      const frequency = drum.impactEnd + (drum.impactStart - drum.impactEnd) * Math.exp(-time * 5.2);
      phase += Math.PI * 2 * frequency / sampleRate;
      sample = Math.sin(phase) * Math.exp(-time * 5.5) * 0.8 + highNoise * Math.exp(-time * 9) * 0.22;
      if (kit === "industrial") sample += Math.sin(phase * 2.03) * Math.exp(-time * 8) * 0.12;
    } else if (kind === "rim") {
      sample = (
        Math.sin(Math.PI * 2 * 820 * time) * 0.52 +
        Math.sin(Math.PI * 2 * 1340 * time) * 0.18 +
        highNoise * 0.32
      ) * Math.exp(-time * 48);
    } else {
      const gate = time % 0.024 < 0.009 ? 1 : 0.28;
      sample = highNoise * Math.exp(-time * 7) * gate * 0.32;
    }

    data[i] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }

  const normalization = peak > 0 ? 0.82 / peak : 1;
  for (let i = 0; i < data.length; i++) data[i] *= normalization;
  return buffer;
}

export function getMusicSample(
  audio: AudioGraphContext,
  kit: MusicDrumKit,
  drum: MusicDrumProfile,
  kind: MusicSampleName,
): AudioBuffer {
  let contextCache = sampleCache.get(audio as object);
  if (!contextCache) {
    contextCache = new Map();
    sampleCache.set(audio as object, contextCache);
  }
  const key = profileKey(kit, drum, kind);
  const cached = contextCache.get(key);
  if (cached) return cached;
  const sample = renderSample(audio, kit, drum, kind);
  contextCache.set(key, sample);
  return sample;
}

export function prewarmMusicSamples(audio: AudioGraphContext, kit: MusicDrumKit, drum: MusicDrumProfile): void {
  for (const kind of Object.keys(DURATIONS) as MusicSampleName[]) getMusicSample(audio, kit, drum, kind);
}
