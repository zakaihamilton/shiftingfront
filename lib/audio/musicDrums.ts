import type { AudioGraphContext, MusicGraph } from "./musicGraph";
import type { MusicStyleProfile } from "./compose";
import { getMusicSample, type MusicSampleName } from "./musicSamples";

const SAMPLE_GAIN: Record<MusicSampleName, number> = {
  kick: 0.72,
  snare: 0.24,
  clap: 0.12,
  hat: 0.06,
  openHat: 0.1,
  tom: 0.24,
  impact: 0.5,
  rim: 0.18,
  shaker: 0.065,
};

function rateFor(target: number, reference: number): number {
  return Math.max(0.68, Math.min(1.42, target / reference));
}

function playSample(
  audio: AudioGraphContext,
  g: MusicGraph,
  style: MusicStyleProfile,
  kind: MusicSampleName,
  time: number,
  velocity: number,
  panValue: number,
  playbackRate = 1,
  reverbSend = 0,
): void {
  const source = audio.createBufferSource();
  const envelope = audio.createGain();
  const pan = audio.createStereoPanner();
  source.buffer = getMusicSample(audio, style.drumKit, style.drum, kind);
  source.playbackRate.setValueAtTime(playbackRate, time);
  envelope.gain.setValueAtTime(Math.max(0.0001, SAMPLE_GAIN[kind] * velocity), time);
  pan.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), time);
  source.connect(envelope);
  envelope.connect(pan);
  pan.connect(kind === "impact" ? g.fxBus : g.rhythmBus);
  if (reverbSend > 0) {
    const send = audio.createGain();
    send.gain.setValueAtTime(reverbSend, time);
    envelope.connect(send);
    send.connect(g.reverbSend);
  }
  source.start(time);
}

export function playKick(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, style = g.style): void {
  const { drum } = style;
  playSample(
    audio,
    g,
    style,
    "kick",
    time,
    velocity,
    drum.noisePan * 0.35,
  );
}

export function playSnare(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, accent: boolean, style = g.style): void {
  const { drum } = style;
  playSample(
    audio,
    g,
    style,
    "snare",
    time,
    velocity * (accent ? 1.12 : 1),
    drum.noisePan,
    1,
    accent ? 0.18 : 0.12,
  );
}

export function playClap(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, accent: boolean, style = g.style): void {
  const { drum } = style;
  playSample(
    audio,
    g,
    style,
    "clap",
    time,
    velocity * (accent ? 1.08 : 0.9),
    drum.noisePan + 0.12,
    1,
    0.11,
  );
}

export function playHat(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, open: boolean, style = g.style): void {
  const { drum } = style;
  const kind = open ? "openHat" : "hat";
  const frequency = open ? drum.openHatFrequency : drum.hatFrequency;
  const reference = open ? 2600 : 5600;
  playSample(
    audio,
    g,
    style,
    kind,
    time,
    velocity,
    drum.noisePan + (open ? 0.16 : -0.1),
    rateFor(frequency, reference),
  );
}

export function playTom(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, style = g.style): void {
  const { drum } = style;
  playSample(audio, g, style, "tom", time, velocity, drum.noisePan + 0.08, 1, 0.06);
}

export function playImpact(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, style = g.style): void {
  const { drum } = style;
  playSample(audio, g, style, "impact", time, velocity, drum.noisePan, 1, 0.2);
}

export function playRim(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, style = g.style): void {
  playSample(audio, g, style, "rim", time, velocity, style.drum.noisePan + 0.2, 1, 0.04);
}

export function playShaker(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, style = g.style): void {
  playSample(audio, g, style, "shaker", time, velocity, -style.drum.noisePan, 1);
}
