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
    click.frequency.setValueAtTime(Math.max(drum.kickStart * (chip ? 4 : 8), chip ? 900 : 1400), time);
    click.frequency.exponentialRampToValueAtTime(220, time + (chip ? 0.01 : 0.018));
    clickGain.gain.setValueAtTime(0.0001, time);
    clickGain.gain.exponentialRampToValueAtTime((industrial ? 0.16 : chip ? 0.08 : 0.1) * velocity, time + 0.002);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, time + (chip ? 0.014 : 0.022));
    click.connect(clickGain);
    clickGain.connect(g.rhythmBus);
    click.start(time);
    click.stop(time + 0.03);
  }
  playNoise(
    audio,
    g.rhythmBus,
    time,
    (chip ? 0.14 : industrial ? 0.14 : analog ? 0.05 : 0.06) * velocity,
    drum.snareNoise * (chip ? 2.2 : 1.45),
    chip ? 0.012 : analog ? 0.01 : 0.018,
    "highpass",
    drum.noisePan,
  );
}

export function playSnare(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, accent: boolean): void {
  const drum = g.style.drum;
  const kit = g.style.drumKit;
  const analog = kit === "analog-808";
  const chip = kit === "chip-noise";
  const industrial = kit === "industrial";
  const dry = (accent ? 0.16 : 0.085) * velocity * (chip ? 0.7 : 1);
  playNoise(audio, g.rhythmBus, time, dry * (analog ? 0.7 : industrial ? 1.2 : 1), drum.snareNoise, accent ? (chip ? 0.04 : 0.07) : (chip ? 0.028 : 0.05), "bandpass", drum.noisePan);
  playNoise(audio, g.rhythmBus, time, dry * (analog ? 0.26 : 0.35), drum.snareNoise * 2.2, chip ? 0.018 : 0.035, "highpass", drum.noisePan);
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
  playNoise(audio, g.reverbSend, time, dry * (chip ? 0.16 : 0.4), drum.snareNoise * 0.84, accent ? 0.14 : 0.1, "bandpass", drum.noisePan);
}

export function playClap(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, accent: boolean): void {
  const drum = g.style.drum;
  const gain = (accent ? 0.1 : 0.06) * velocity;
  playNoise(audio, g.rhythmBus, time, gain, drum.snareNoise * 0.76, accent ? 0.085 : 0.06, "bandpass", drum.noisePan + 0.08);
  playNoise(audio, g.rhythmBus, time + 0.014, gain * 0.72, drum.snareNoise * 1.03, accent ? 0.07 : 0.045, "bandpass", drum.noisePan - 0.08);
  playNoise(audio, g.reverbSend, time, gain * 0.42, drum.snareNoise * 0.66, accent ? 0.12 : 0.08, "bandpass", drum.noisePan);
}

export function playHat(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number, open: boolean): void {
  const drum = g.style.drum;
  const kit = g.style.drumKit;
  const chip = kit === "chip-noise";
  const industrial = kit === "industrial";
  const duration = open ? (chip ? 0.08 : 0.17) : chip ? 0.016 : 0.027;
  playNoise(
    audio,
    g.rhythmBus,
    time,
    (open ? 0.07 : 0.038) * velocity * (industrial ? 1.1 : 1),
    open ? drum.openHatFrequency : drum.hatFrequency,
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
  oscillator.type = "sawtooth";
  oscillator.frequency.setValueAtTime(drum.impactStart, time);
  oscillator.frequency.exponentialRampToValueAtTime(drum.impactEnd, time + 0.34);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(0.42 * velocity, time + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.42);
  oscillator.connect(envelope);
  envelope.connect(g.fxBus);
  oscillator.start(time);
  oscillator.stop(time + 0.46);
  playNoise(audio, g.fxBus, time, 0.1 * velocity, drum.impactStart * 8.3, 0.16, "bandpass", drum.noisePan);
  playNoise(audio, g.reverbSend, time, 0.06 * velocity, drum.impactStart * 6.5, 0.28, "bandpass", drum.noisePan);
}

export function playRim(audio: AudioGraphContext, g: MusicGraph, time: number, velocity: number): void {
  const drum = g.style.drum;
  playNoise(audio, g.rhythmBus, time, 0.08 * velocity, 1800, 0.028, "bandpass", drum.noisePan + 0.16);
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
  playNoise(audio, g.rhythmBus, time, 0.05 * velocity, 6800, 0.022, "highpass", drum.noisePan * -1);
}
