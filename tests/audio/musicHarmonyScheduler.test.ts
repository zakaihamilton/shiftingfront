import { describe, expect, it, vi } from "vitest";
import { composeMusic } from "../../lib/audio/compose";
import { indexPattern, type AudioGraphContext, type MusicGraph } from "../../lib/audio/musicGraph";

const playSynthTone = vi.hoisted(() => vi.fn());

vi.mock("../../lib/audio/musicSynth", () => ({
  playSynthTone,
  playTransition: vi.fn(),
  retunePad: vi.fn(),
  schedulePadGate: vi.fn(),
  syncDelay: vi.fn(),
}));

vi.mock("../../lib/audio/musicDrums", () => ({
  playKick: vi.fn(),
  playSnare: vi.fn(),
  playClap: vi.fn(),
  playHat: vi.fn(),
  playTom: vi.fn(),
  playImpact: vi.fn(),
  playRim: vi.fn(),
  playShaker: vi.fn(),
}));

import { scheduleStep } from "../../lib/audio/musicScheduler";

describe("harmony scheduling", () => {
  it("schedules generated harmony events on the harmony bus", () => {
    const pattern = composeMusic(421, "mission", 3);
    const harmonyEvent = pattern.notes.harmony[0]!;
    const harmonyBus = {} as GainNode;
    const gainNode = { gain: {
      value: 0.09,
      cancelScheduledValues: vi.fn(),
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
    } };
    const graph = {
      style: pattern.style,
      index: indexPattern(pattern),
      bassBus: {},
      pulseBus: {},
      harmonyBus,
      leadBus: {},
      counterBus: {},
      master: {},
      padGain: gainNode,
      padReverbGate: gainNode,
      bassDuck: gainNode,
      padBase: 0.09,
    } as unknown as MusicGraph;

    playSynthTone.mockClear();
    scheduleStep({ currentTime: 0 } as AudioGraphContext, graph, pattern, 0, harmonyEvent.step, "engaged");

    expect(playSynthTone).toHaveBeenCalledWith(
      expect.anything(),
      graph,
      harmonyBus,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      pattern.style.padType,
      expect.any(Number),
      expect.any(Number),
      "harmony",
      expect.any(Boolean),
    );
  });
});
