import type { AudioGraphContext, MusicGraph } from "./musicGraph";
import { playNoise } from "./musicSynth";

export function playKick(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number): void {
  const drum = g.style.drum;
  const kit = g.style.drumKit;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  const analog = kit === "analog-808";
  const chip = kit === "chip-noise";
  const industrial = kit === "industrial";
  oscillator.type = analog ? "sine" : chip ? "square" : "sine";
  oscillator.frequency.setValueAtTime(drum.kickStart, time);
  oscillator.frequency.exponentialRampToValueAtTime(drum.kickEnd, time + (analog ? Math.max(drum.kickTail, 0.28) : chip ? 0.05 : drum.kickTail));
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime((analog ? 0.78 : chip ? 0.46 : 0.68) * velocity, time + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + (analog ? 0.4 : chip ? 0.08 : 0.22));
  oscillator.connect(envelope);
  envelope.connect(g.rhythmBus);
  oscillator.start(time);
  oscillator.stop(time + (analog ? 0.46 : chip ? 0.1 : 0.28));
  if (!analog) {
    const click = audio.createOscillator();
    const clickGain = audio.createGain();
    click.type = industrial ? "sawtooth" : "triangle";
    click.frequency.setValueAtTime(Math.max(320, Math.min(900, drum.kickStart * (chip ? 3 : 2.5))), time);
    click.frequency.exponentialRampToValueAtTime(220, time + (chip ? 0.01 : 0.018));
    clickGain.gain.setValueAtTime(0.0001, time);
    clickGain.gain.exponentialRampToValueAtTime((industrial ? 0.07 : chip ? 0.05 : 0.055) * velocity, time + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + (chip ? 0.014 : 0.022));
    click.connect(clickGain);
    clickGain.connect(g.rhythmBus);
    click.start(time);
    click.stop(time + 0.03);
  }
}

export function playSnare(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, accent: boolean): void {
  const drum = g.style.drum;
  const kit = g.style.drumKit;
  const analog = kit === "analog-808";
  const chip = kit === "chip-noise";
  const industrial = kit === "industrial";
  const dry = (accent ? 0.12 : 0.065) * velocity * (chip ? 0.7 : 1);
  playNoise(
    audio,
    g.rhythmBus,
    time,
    dry * (analog ? 0.5 : industrial ? 0.72 : 0.62),
    Math.min(drum.snareNoise, 2_100),
    accent ? 0.035 : 0.022,
    "bandpass",
    drum.noisePan,
  );
  if (!chip) {
    const body = audio.createOscillator();
    const bodyGain = audio.createGain();
    const bodyLen = analog ? (accent ? 0.12 : 0.08) : accent ? 0.08 : 0.055;
    body.type = analog ? "sine" : "triangle";
    body.frequency.setValueAtTime(drum.snareBody, time);
    body.frequency.exponentialRampToValueAtTime(drum.snareBody * 0.72, time + bodyLen);
    bodyGain.gain.setValueAtTime(0.0001, time);
    bodyGain.gain.exponentialRampToValueAtTime((analog ? 0.18 : 0.12) * velocity, time + 0.004);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + bodyLen);
    body.connect(bodyGain);
    bodyGain.connect(g.rhythmBus);
    body.start(time);
    body.stop(time + bodyLen + 0.03);
  }
}

export function playClap(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, accent: boolean): void {
  const drum = g.style.drum;
  const gain = (accent ? 0.055 : 0.035) * velocity;
  playNoise(audio, g.rhythmBus, time, gain, Math.min(drum.snareNoise * 0.7, 1_800), accent ? 0.04 : 0.028, "bandpass", drum.noisePan + 0.04);
}

export function playHat(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, open: boolean): void {
  const drum = g.style.drum;
  const kit = g.style.drumKit;
  const chip = kit === "chip-noise";
  const industrial = kit === "industrial";
  const duration = open ? (chip ? 0.07 : 0.12) : chip ? 0.014 : 0.022;
  playNoise(
    audio,
    g.rhythmBus,
    time,
    (open ? 0.045 : 0.022) * velocity * (industrial ? 1.05 : 1),
    Math.min(open ? drum.openHatFrequency : drum.hatFrequency, open ? 3_400 : 6_200),
    duration,
    industrial && !open ? "bandpass" : open ? "bandpass" : "highpass",
    open ? drum.noisePan + 0.12 : drum.noisePan - 0.08,
  );
}

export function playTom(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number): void {
  const drum = g.style.drum;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(drum.tomStart, time);
  oscillator.frequency.exponentialRampToValueAtTime(drum.tomEnd, time + 0.18);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(0.2 * velocity, time + 0.006);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.22);
  oscillator.connect(envelope);
  envelope.connect(g.rhythmBus);
  oscillator.start(time);
  oscillator.stop(time + 0.26);
}

export function playImpact(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number): void {
  const drum = g.style.drum;
  const oscillator = audio.createOscillator();
  const envelope = audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(drum.impactStart, time);
  oscillator.frequency.exponentialRampToValueAtTime(drum.impactEnd, time + 0.28);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(0.24 * velocity, time + 0.012);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.36);
  oscillator.connect(envelope);
  envelope.connect(g.fxBus);
  oscillator.start(time);
  oscillator.stop(time + 0.4);
}

export function playRim(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number): void {
  const drum = g.style.drum;
  playNoise(audio, g.rhythmBus, time, 0.04 * velocity, 1_400, 0.02, "bandpass", drum.noisePan + 0.12);
  const body = audio.createOscillator();
  const bodyGain = audio.createGain();
  body.type = "triangle";
  body.frequency.setValueAtTime(820, time);
  body.frequency.exponentialRampToValueAtTime(420, time + 0.04);
  bodyGain.gain.setValueAtTime(0.0001, time);
  bodyGain.gain.exponentialRampToValueAtTime(0.09 * velocity, time + 0.002);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  body.connect(bodyGain);
  bodyGain.connect(g.rhythmBus);
  body.start(time);
  body.stop(time + 0.07);
}

export function playShaker(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number): void {
  const drum = g.style.drum;
  playNoise(audio, g.rhythmBus, time, 0.025 * velocity, 5_600, 0.018, "highpass", drum.noisePan * -1);
}
