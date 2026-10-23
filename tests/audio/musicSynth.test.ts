import { describe, expect, it, vi } from "vitest";
import { cinematicHarmonics } from "../../lib/audio/cinematicWaves";
import { playSynthTone, schedulePadGate } from "../../lib/audio/musicSynth";
import { composeMusic } from "../../lib/audio/compose";
import type { AudioGraphContext, MusicGraph } from "../../lib/audio/musicGraph";

class RecordedParam {
  value = 0;
  actions: { method: string; args: number[] }[] = [];

  setValueAtTime(...args: number[]) { this.actions.push({ method: "setValueAtTime", args }); }
  exponentialRampToValueAtTime(...args: number[]) { this.actions.push({ method: "exponentialRampToValueAtTime", args }); }
  linearRampToValueAtTime(...args: number[]) { this.actions.push({ method: "linearRampToValueAtTime", args }); }
  setTargetAtTime(...args: number[]) { this.actions.push({ method: "setTargetAtTime", args }); }
}

function createAudioMocks() {
  const periodicWaves: { real: Float32Array; imag: Float32Array }[] = [];
  const oscillators: {
    type: OscillatorType;
    frequency: RecordedParam;
    detune: RecordedParam;
    connect: ReturnType<typeof vi.fn>;
    setPeriodicWave: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  }[] = [];
  const gains: { gain: RecordedParam; connect: ReturnType<typeof vi.fn> }[] = [];
  const node = { connect: vi.fn() };
  const audio = {
    createBiquadFilter: () => ({
      type: "lowpass" as BiquadFilterType,
      frequency: new RecordedParam(),
      Q: new RecordedParam(),
      connect: vi.fn(),
    }),
    createGain: () => {
      const gain = { gain: new RecordedParam(), connect: vi.fn() };
      gains.push(gain);
      return gain;
    },
    createStereoPanner: () => ({ pan: new RecordedParam(), connect: vi.fn() }),
    createOscillator: () => {
      const oscillator = {
        type: "sine" as OscillatorType,
        frequency: new RecordedParam(),
        detune: new RecordedParam(),
        connect: vi.fn(),
        setPeriodicWave: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(oscillator);
      return oscillator;
    },
    createPeriodicWave: (real: Float32Array, imag: Float32Array) => {
      const wave = { real, imag };
      periodicWaves.push(wave);
      return wave as unknown as PeriodicWave;
    },
  };
  return { audio, node, oscillators, gains, periodicWaves };
}

describe("cinematic music synthesis", () => {
  it("replaces square inputs with a layered, sustained cinematic tone", () => {
    const pattern = composeMusic(421, "victory");
    const { audio, node, oscillators, gains, periodicWaves } = createAudioMocks();
    const graph = { style: pattern.style, reverbSend: node } as unknown as MusicGraph;

    playSynthTone(
      audio as unknown as AudioGraphContext,
      graph,
      node as unknown as AudioNode,
      440,
      1,
      0.3,
      "square",
      0.8,
      900,
      "melody",
    );

    expect(pattern.style.voiceEngine).toBe("cinematic");
    expect(oscillators[0]?.setPeriodicWave).toHaveBeenCalledOnce();
    expect(oscillators.map(({ type }) => type)).not.toContain("square");
    expect(oscillators.filter(({ setPeriodicWave }) => setPeriodicWave.mock.calls.length === 1)).toHaveLength(3);
    const leadSpectrum = periodicWaves[0]!.imag;
    expect(Array.from(leadSpectrum).filter((amplitude) => amplitude > 0)).toHaveLength(6);
    expect(leadSpectrum[1]).toBeGreaterThan(leadSpectrum[2]!);
    expect(gains[0]?.gain.actions.at(-1)?.method).toBe("setTargetAtTime");
  });

  it("lets cinematic pulses sustain through their note before fading", () => {
    const pattern = composeMusic(421, "briefing");
    const { audio, node, gains, oscillators } = createAudioMocks();
    const graph = { style: pattern.style, reverbSend: node } as unknown as MusicGraph;

    playSynthTone(
      audio as unknown as AudioGraphContext,
      graph,
      node as unknown as AudioNode,
      330,
      1,
      0.24,
      "triangle",
      0.5,
      800,
      "pulse",
    );

    const envelopeActions = gains[0]?.gain.actions ?? [];
    expect(envelopeActions.at(-1)?.method).toBe("setTargetAtTime");
    expect(envelopeActions.some(({ method, args }) => method === "exponentialRampToValueAtTime" && args[0] === 0.0001)).toBe(false);
    expect(oscillators[0]?.setPeriodicWave).toHaveBeenCalledOnce();
  });

  it("holds the harmonic pad through the bar instead of gating it to silence", () => {
    const actions: { method: string; args: number[] }[] = [];
    const gain = {
      cancelScheduledValues: () => undefined,
      setValueAtTime: (...args: number[]) => { actions.push({ method: "setValueAtTime", args }); },
      linearRampToValueAtTime: (...args: number[]) => { actions.push({ method: "linearRampToValueAtTime", args }); },
    };
    const gate = { gain };
    schedulePadGate(
      { currentTime: 0 } as unknown as AudioGraphContext,
      { padGate: gate, padReverbGate: gate } as unknown as MusicGraph,
      2,
      0.12,
      0,
      "hook",
      "calm",
    );

    const levels = actions.map((action) => action.args[0]!);
    expect(Math.min(...levels)).toBeGreaterThan(0.2);
    expect(Math.max(...levels)).toBeGreaterThan(Math.min(...levels));
    expect(actions.at(-1)?.args[1]).toBeCloseTo(2 + 0.12 * 16);
  });

  it("colors the lead, bed, piano, and guitar by voice type", () => {
    for (const role of ["lead", "pad", "piano", "guitar", "harmony"] as const) {
      const warm = cinematicHarmonics(role, "warm");
      const bright = cinematicHarmonics(role, "bright");
      const soft = cinematicHarmonics(role, "soft");
      expect(warm).not.toEqual(bright);
      expect(warm).not.toEqual(soft);
      expect(bright).not.toEqual(soft);
      if (role === "lead") {
        for (const spectrum of [warm, bright, soft]) {
          expect(spectrum).toHaveLength(6);
          expect(spectrum[0]).toBeGreaterThan(spectrum[1]!);
        }
      }
    }
  });
});
