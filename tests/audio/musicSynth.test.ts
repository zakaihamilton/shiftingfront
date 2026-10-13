import { describe, expect, it, vi } from "vitest";
import { playSynthTone } from "../../lib/audio/musicSynth";
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
});
