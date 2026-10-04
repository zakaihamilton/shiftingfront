import type { AudioGraphContext } from "./musicState";

export type CinematicWaveRole = "bass" | "pulse" | "lead" | "harmony" | "pad";

const HARMONICS: Record<CinematicWaveRole, readonly number[]> = {
  bass: [1, 0.16, 0.045],
  pulse: [1, 0.24, 0.085, 0.028],
  lead: [1, 0.34, 0.14, 0.065, 0.028, 0.011],
  harmony: [1, 0.2, 0.065, 0.02],
  pad: [1, 0.18, 0.052, 0.016],
};

const waves = new WeakMap<AudioGraphContext, Map<CinematicWaveRole, PeriodicWave>>();

/** Build a band-limited, gently colored tone instead of exposing square-like chip harmonics. */
export function cinematicWave(audio: AudioGraphContext, role: CinematicWaveRole): PeriodicWave {
  let contextWaves = waves.get(audio);
  if (!contextWaves) {
    contextWaves = new Map();
    waves.set(audio, contextWaves);
  }

  const cached = contextWaves.get(role);
  if (cached) return cached;

  const harmonics = HARMONICS[role];
  const real = new Float32Array(harmonics.length + 1);
  const imag = new Float32Array(harmonics.length + 1);
  const normalization = harmonics.reduce((sum, amplitude) => sum + amplitude, 0);
  for (let index = 0; index < harmonics.length; index += 1) {
    imag[index + 1] = harmonics[index]! / normalization;
  }

  const wave = audio.createPeriodicWave(real, imag, { disableNormalization: true });
  contextWaves.set(role, wave);
  return wave;
}
