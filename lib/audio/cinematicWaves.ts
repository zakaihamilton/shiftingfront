import type { MusicVoiceType } from "./compose/types";
import type { AudioGraphContext } from "./musicState";

export type CinematicWaveRole = "bass" | "pulse" | "lead" | "harmony" | "piano" | "guitar" | "pad";
export type CinematicTone = "warm" | "bright" | "soft";

const COLORED: Record<CinematicWaveRole, Record<CinematicTone, readonly number[]>> = {
  bass: {
    warm: [1, 0.24, 0.07, 0.025],
    bright: [1, 0.46, 0.2, 0.09, 0.03],
    soft: [1, 0.12, 0.03],
  },
  pulse: {
    warm: [1, 0.24, 0.085, 0.028],
    bright: [1, 0.52, 0.24, 0.1, 0.04],
    soft: [1, 0.14, 0.04, 0.012],
  },
  lead: {
    warm: [1, 0.45, 0.26, 0.14, 0.065, 0.028],
    bright: [1, 0.62, 0.4, 0.22, 0.11, 0.045],
    soft: [1, 0.22, 0.08, 0.03, 0.012, 0.004],
  },
  pad: {
    warm: [1, 0.3, 0.11, 0.045, 0.018],
    bright: [1, 0.5, 0.24, 0.1, 0.04],
    soft: [1, 0.16, 0.05, 0.016],
  },
  harmony: {
    warm: [1, 0.2, 0.065, 0.02],
    bright: [1, 0.42, 0.2, 0.09, 0.035],
    soft: [1, 0.1, 0.03],
  },
  piano: {
    warm: [1, 0.58, 0.32, 0.16, 0.075, 0.032, 0.012],
    bright: [1, 0.72, 0.48, 0.28, 0.15, 0.07, 0.03],
    soft: [1, 0.3, 0.12, 0.04, 0.012],
  },
  guitar: {
    warm: [1, 0.4, 0.25, 0.16, 0.095, 0.052, 0.026, 0.012],
    bright: [1, 0.62, 0.4, 0.26, 0.16, 0.09, 0.045, 0.02],
    soft: [1, 0.22, 0.08, 0.03, 0.01],
  },
};

/** Keep partials from peaking together so the attack is a tone, not a click. */
const PARTIAL_PHASE = [0.2, -0.55, 0.85, -0.35, 0.65, -0.15, 0.4, -0.75];

const waves = new WeakMap<AudioGraphContext, Map<string, PeriodicWave>>();

export function cinematicToneFor(type: MusicVoiceType): CinematicTone {
  if (type === "sawtooth" || type === "square") return "bright";
  if (type === "sine") return "soft";
  return "warm";
}

export function cinematicHarmonics(role: CinematicWaveRole, tone: CinematicTone = "warm"): readonly number[] {
  return COLORED[role][tone];
}

/** Build a band-limited, gently colored tone instead of exposing square-like chip harmonics. */
export function cinematicWave(
  audio: AudioGraphContext,
  role: CinematicWaveRole,
  tone: CinematicTone = "warm",
): PeriodicWave {
  let contextWaves = waves.get(audio);
  if (!contextWaves) {
    contextWaves = new Map();
    waves.set(audio, contextWaves);
  }

  const key = `${role}:${tone}`;
  const cached = contextWaves.get(key);
  if (cached) return cached;

  const harmonics = cinematicHarmonics(role, tone);
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  const normalization = harmonics.reduce((sum, amplitude) => sum + amplitude, 0);
  for (let index = 0; index < harmonics.length; index += 1) {
    const amplitude = harmonics[index]! / normalization;
    const phase = PARTIAL_PHASE[index] ?? 0;
    real[index + 1] = amplitude * Math.sin(phase);
    imag[index + 1] = amplitude * Math.cos(phase);
  }

  const wave = audio.createPeriodicWave(real, imag, { disableNormalization: true });
  contextWaves.set(key, wave);
  return wave;
}
