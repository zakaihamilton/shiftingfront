import type { AudioGraphContext } from "./musicState";

export type CinematicWaveRole = "bass" | "pulse" | "lead" | "harmony" | "piano" | "guitar" | "pad";

const HARMONICS: Record<CinematicWaveRole, readonly number[]> = {
  bass: [1, 0.24, 0.07, 0.025],
  pulse: [1, 0.24, 0.085, 0.028],
  lead: [1, 0.45, 0.26, 0.14, 0.065, 0.028],
  harmony: [1, 0.2, 0.065, 0.02],
  piano: [1, 0.58, 0.32, 0.16, 0.075, 0.032, 0.012],
  guitar: [1, 0.4, 0.25, 0.16, 0.095, 0.052, 0.026, 0.012],
  pad: [1, 0.3, 0.11, 0.045, 0.018],
};

/** Keep partials from peaking together so the attack is a tone, not a click. */
const PARTIAL_PHASE = [0.2, -0.55, 0.85, -0.35, 0.65, -0.15, 0.4, -0.75];

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
    const amplitude = harmonics[index]! / normalization;
    const phase = PARTIAL_PHASE[index] ?? 0;
    real[index + 1] = amplitude * Math.sin(phase);
    imag[index + 1] = amplitude * Math.cos(phase);
  }

  const wave = audio.createPeriodicWave(real, imag, { disableNormalization: true });
  contextWaves.set(role, wave);
  return wave;
}
