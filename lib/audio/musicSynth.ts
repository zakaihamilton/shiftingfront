import type { MusicIntensity, MusicPattern, MusicSectionName, MusicStem, MusicVoiceType } from "./compose";
import type { AudioGraphContext, MusicGraph } from "./musicGraph";
import { ATTACK_S, notePan } from "./musicGraph";
import { getNoiseBuffer } from "./musicGraph";

export function playSynthTone(
  audio: AudioGraphContext,
  g: MusicGraph,
  dest: AudioNode,
  freq: number,
  time: number,
  duration: number,
  type: MusicVoiceType,
  velocity: number,
  cutoff: number,
  voice: MusicStem,
  accent = false,
): void {
  const engine = g.style.voiceEngine;
  const filter = audio.createBiquadFilter();
  const envelope = audio.createGain();
  const pan = audio.createStereoPanner();
  const oscA = audio.createOscillator();
  const bass = voice === "bass";
  const pulse = voice === "pulse";
  const harmony = voice === "harmony";
  const lead = voice === "melody";
  const chip = engine === "chip";
  const acid = engine === "acid-res";
  const pwm = engine === "pwm";
  const fm = engine === "fm-bell";
  const cinematic = engine === "cinematic";
  const cleanType = cinematic && type === "square" ? (bass ? "triangle" : "sawtooth") : type;
  const attack = Math.min(
    chip ? 0.002 : cinematic ? (lead ? 0.035 : harmony ? 0.028 : bass ? 0.012 : 0.018) : lead ? 0.02 : harmony ? 0.014 : bass ? (acid ? 0.008 : 0.004) : pulse ? 0.003 : ATTACK_S,
    duration * 0.22,
  );
  const release = Math.min(
    chip ? 0.04 : cinematic ? (bass ? 0.16 : pulse ? 0.08 : lead ? 0.38 : harmony ? 0.22 : 0.28) : bass ? (acid ? 0.11 : 0.07) : pulse ? 0.045 : lead ? (fm ? 0.32 : 0.22) : harmony ? 0.16 : 0.18,
    duration * (chip ? 0.35 : pulse ? 0.55 : 0.4),
  );
  const end = time + Math.max(duration, attack + release + 0.02);
  const peak = Math.max(0.006, velocity * (accent ? 0.24 : harmony ? 0.12 : pulse ? (cinematic ? 0.12 : 0.14) : chip ? 0.17 : cinematic ? 0.2 : 0.22));

  filter.type = "lowpass";
  filter.Q.setValueAtTime(
    acid ? (bass ? 8.5 : 5.5) : cinematic ? (bass ? 1.05 : 0.72) : bass ? 1.8 : lead || pulse ? 1.2 : 1.05,
    time,
  );
  const startCut = Math.max(220, cutoff * (
    acid
      ? (accent ? 4.6 : 3.4)
      : cinematic
        ? (accent ? 2.15 : 1.65)
        : bass
          ? (accent ? 3.1 : 2.5)
          : accent
            ? 2.2
            : pulse
              ? 2.4
              : 1.7
  ));
  const endCut = Math.max(
    bass ? 90 : 140,
    cutoff * (
      acid
        ? (bass ? 0.18 : 0.42)
        : cinematic
          ? (bass ? 0.34 : pulse ? 0.72 : 0.88)
          : bass
            ? 0.26
            : pulse
              ? 1.1
              : 0.82
    ),
  );
  filter.frequency.setValueAtTime(startCut, time);
  filter.frequency.exponentialRampToValueAtTime(
    endCut,
    time + Math.min(acid ? 0.28 : cinematic ? 0.24 : 0.16, duration * (acid ? 0.8 : cinematic ? 0.72 : 0.55)),
  );
  const panCenter = notePan(voice);
  const panWidth = bass ? 0.02 : pulse ? 0.07 : lead ? 0.08 : harmony ? 0.025 : 0.05;
  const panMotion = Math.sin(freq * 0.013 + duration * 4.7) * panWidth;
  const panTarget = Math.max(-0.82, Math.min(0.82, panCenter + panMotion));
  pan.pan.setValueAtTime(panCenter, time);
  pan.pan.linearRampToValueAtTime(panTarget, time + Math.min(0.18, Math.max(0.03, duration * 0.25)));

  oscA.type = acid ? "sawtooth" : pwm ? (cleanType === "square" ? "sawtooth" : cleanType) : fm ? (cleanType === "sine" || cleanType === "triangle" ? cleanType : "sine") : cleanType;
  const glide = acid && bass
    ? Math.min(0.08, duration * 0.45)
    : cinematic && bass
      ? Math.min(0.022, duration * 0.25)
      : lead ? Math.min(0.03, duration * 0.22) : pulse ? Math.min(0.012, duration * 0.18) : 0;
  oscA.frequency.setValueAtTime(freq * (glide > 0 ? (acid ? 0.86 : 0.93) : 1), time);
  if (glide > 0) oscA.frequency.exponentialRampToValueAtTime(freq, time + glide);

  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(peak, time + Math.max(0.003, attack));
  if (pulse || chip) {
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + Math.max(0.04, duration * (chip ? 0.55 : 0.7)));
  } else {
    envelope.gain.setTargetAtTime(0.0001, Math.max(time + attack, end - release), Math.max(0.014, release * 0.4));
  }

  const oscAGain = audio.createGain();
  oscAGain.gain.setValueAtTime(0.64, time);
  oscA.connect(oscAGain);
  oscAGain.connect(filter);

  if (fm) {
    const mod = audio.createOscillator();
    const modGain = audio.createGain();
    mod.type = "sine";
    mod.frequency.setValueAtTime(freq * (lead ? 3.5 : bass ? 1.5 : 2.02), time);
    modGain.gain.setValueAtTime(freq * (lead ? 1.7 : bass ? 0.55 : 1.05), time);
    mod.connect(modGain);
    modGain.connect(oscA.frequency);
    mod.start(time);
    mod.stop(end + 0.04);
  } else if (!chip) {
    const oscB = audio.createOscillator();
    const oscBGain = audio.createGain();
    oscB.type = pwm ? (cleanType === "sawtooth" ? "triangle" : cleanType === "square" ? "sawtooth" : cleanType) : cleanType === "sawtooth" ? "triangle" : cleanType === "square" ? "sawtooth" : "triangle";
    oscB.frequency.setValueAtTime(freq * (bass ? 1.004 : 1.01), time);
    oscB.detune.setValueAtTime(cinematic ? (lead ? 6 : pulse ? -4 : -3) : lead ? 10 : pulse ? -8 : -5, time);
    oscBGain.gain.setValueAtTime(pwm ? 0.2 : cinematic ? 0.22 : 0.28, time);
    if (pwm) {
      const pwmGain = audio.createGain();
      const pwmLfo = audio.createOscillator();
      const pwmDepth = audio.createGain();
      pwmGain.gain.setValueAtTime(0.28, time);
      pwmDepth.gain.setValueAtTime(0.07, time);
      pwmLfo.type = "sine";
      pwmLfo.frequency.setValueAtTime(bass ? 0.7 : 4.2, time);
      pwmLfo.connect(pwmDepth);
      pwmDepth.connect(pwmGain.gain);
      oscB.connect(pwmGain);
      pwmGain.connect(oscBGain);
      oscBGain.connect(filter);
      pwmLfo.start(time);
      pwmLfo.stop(end + 0.04);
    } else {
      oscB.connect(oscBGain);
      oscBGain.connect(filter);
    }
    if (lead) {
      const vibrato = audio.createOscillator();
      const vibratoGain = audio.createGain();
      vibrato.type = "sine";
      vibrato.frequency.setValueAtTime(5.6, time);
      vibratoGain.gain.setValueAtTime(0.0001, time);
      vibratoGain.gain.setValueAtTime(0.0001, time + 0.12);
      vibratoGain.gain.linearRampToValueAtTime(cinematic ? 4 : 16, time + (cinematic ? 0.34 : 0.28));
      vibrato.connect(vibratoGain);
      vibratoGain.connect(oscA.detune);
      vibratoGain.connect(oscB.detune);
      vibrato.start(time);
      vibrato.stop(end + 0.04);
    }
    oscB.start(time);
    oscB.stop(end + 0.04);
  }

  if (!pulse && !harmony && !chip && !fm) {
    const oscSub = audio.createOscillator();
    const subGain = audio.createGain();
    oscSub.type = bass ? "sine" : lead ? g.style.counterType : "triangle";
    oscSub.frequency.setValueAtTime(freq * (bass || lead ? 0.5 : 0.25), time);
    subGain.gain.setValueAtTime(bass ? (acid ? 0.34 : 0.4) : lead ? 0.14 : 0.16, time);
    oscSub.connect(subGain);
    subGain.connect(filter);
    oscSub.start(time);
    oscSub.stop(end + 0.04);
  }

  const voiceHighpass = audio.createBiquadFilter();
  voiceHighpass.type = "highpass";
  voiceHighpass.frequency.setValueAtTime(bass ? 32 : pulse ? 88 : lead ? 118 : harmony ? 72 : 96, time);
  voiceHighpass.Q.setValueAtTime(0.55, time);
  filter.connect(voiceHighpass);
  voiceHighpass.connect(envelope);
  envelope.connect(pan);
  pan.connect(dest);
  if (lead || harmony || voice === "counter") envelope.connect(g.reverbSend);

  oscA.start(time);
  oscA.stop(end + 0.04);
}

export function playNoise(
  audio: AudioGraphContext,
  dest: AudioNode,
  time: number,
  gain: number,
  frequency: number,
  duration: number,
  type: BiquadFilterType = "highpass",
  panValue = 0,
): void {
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const envelope = audio.createGain();
  source.buffer = getNoiseBuffer(audio);
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, time);
  if (type === "bandpass") filter.Q.setValueAtTime(1.1, time);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.001, gain), time + Math.min(0.006, duration * 0.18));
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(filter);
  filter.connect(envelope);
  const pan = audio.createStereoPanner();
  pan.pan.setValueAtTime(panValue, time);
  envelope.connect(pan);
  pan.connect(dest);
  source.start(time);
  source.stop(time + duration + 0.025);
}

export function playTransition(audio: AudioGraphContext, g: MusicGraph, time: number, duration: number, rising: boolean): void {
  const source = audio.createBufferSource();
  const filter = audio.createBiquadFilter();
  const envelope = audio.createGain();
  source.buffer = getNoiseBuffer(audio);
  filter.type = "bandpass";
  filter.Q.setValueAtTime(0.8, time);
  filter.frequency.setValueAtTime(rising ? 220 : 4200, time);
  filter.frequency.exponentialRampToValueAtTime(rising ? 4200 : 220, time + duration);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.exponentialRampToValueAtTime(0.085, time + duration * 0.72);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(g.fxBus);
  envelope.connect(g.reverbSend);
  source.start(time);
  source.stop(time + duration + 0.03);
}

export function retunePad(audio: AudioGraphContext, g: MusicGraph, p: MusicPattern, bar: number, time: number): void {
  const index = ((bar % p.bars) + p.bars) % p.bars;
  const root = p.padRoot[index] ?? p.rootHz;
  const third = p.padThird[index] ?? root * 1.25;
  const fifth = p.padFifth[index] ?? root * 1.5;
  const seventh = p.padSeventh[index] ?? root * 1.78;
  const t = Math.max(time, audio.currentTime);
  g.padOscA.frequency.setTargetAtTime(root, t, 0.04);
  g.padOscB.frequency.setTargetAtTime(third * 1.002, t, 0.04);
  g.padOscC.frequency.setTargetAtTime(fifth * 0.998, t, 0.04);
  g.padOscD.frequency.setTargetAtTime(seventh * 1.001, t, 0.04);
}

export function schedulePadGate(
  audio: AudioGraphContext,
  g: MusicGraph,
  time: number,
  stepDuration: number,
  stepIndex: number,
  section: MusicSectionName | undefined,
  value: MusicIntensity,
): void {
  const t = Math.max(time, audio.currentTime);
  const level = value === "critical" ? 1 : value === "engaged" ? 0.82 : 0.7;
  const sustain = section === "intro" || section === "breakdown";
  if (sustain) {
    g.padGate.gain.setTargetAtTime(level * 0.92, t, 0.05);
    g.padReverbGate.gain.setTargetAtTime(level * 0.92, t, 0.05);
    return;
  }
  if (stepIndex % 2 !== 0) return;
  const eighth = stepDuration * 2;
  for (const gate of [g.padGate, g.padReverbGate]) {
    gate.gain.setValueAtTime(0.03, t);
    gate.gain.linearRampToValueAtTime(level, t + Math.max(0.004, stepDuration * 0.08));
    gate.gain.setValueAtTime(level, t + eighth * 0.42);
    gate.gain.linearRampToValueAtTime(0.03, t + eighth * 0.9);
  }
}

export function syncDelay(audio: AudioGraphContext, g: MusicGraph, p: MusicPattern): void {
  const seconds = Math.max(0.05, (60 / p.bpm) * p.delayBeats);
  g.delay.delayTime.setTargetAtTime(seconds, audio.currentTime, 0.04);
}
