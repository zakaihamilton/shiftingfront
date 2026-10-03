import { beforeEach, describe, expect, it, vi } from "vitest";

const soundNodes = vi.hoisted(() => ({
  jitter: vi.fn((frequency: number) => frequency),
  noise: vi.fn(),
  tone: vi.fn(),
}));

vi.mock("../../lib/audio/synth/nodes", () => soundNodes);

import { playLayeredSfx } from "../../lib/audio/synth/sfxRecipes";

const audio = {} as AudioContext;
const destination = {} as AudioNode;

describe("weapon sound recipes", () => {
  beforeEach(() => {
    soundNodes.noise.mockClear();
    soundNodes.tone.mockClear();
  });

  it("synthesizes a descending air-strike rush", () => {
    playLayeredSfx("airStrike", audio, destination, -0.3, 0.8, false);

    expect(soundNodes.noise).toHaveBeenCalledTimes(2);
    expect(soundNodes.noise).toHaveBeenNthCalledWith(
      1,
      audio,
      destination,
      expect.objectContaining({ duration: 0.25, frequency: 3200, endFrequency: 520, type: "bandpass", pan: -0.3 }),
    );
    expect(soundNodes.tone).toHaveBeenCalledWith(
      audio,
      destination,
      expect.objectContaining({ frequency: 760, endFrequency: 180, duration: 0.3, type: "sine", pan: -0.3 }),
    );
    expect(soundNodes.noise).toHaveBeenNthCalledWith(
      2,
      audio,
      destination,
      expect.objectContaining({ frequency: 280, type: "lowpass", delay: 0.16 }),
    );
  });

  it("synthesizes anti-air fire as a three-shot burst", () => {
    playLayeredSfx("antiAir", audio, destination, 0.4, 0.7, false);

    expect(soundNodes.noise).toHaveBeenCalledTimes(4);
    expect(soundNodes.tone).toHaveBeenCalledTimes(3);
    expect(soundNodes.noise.mock.calls.slice(0, 3).map(([, , options]) => options.delay ?? 0)).toEqual([0, 0.045, 0.09]);
    expect(soundNodes.tone.mock.calls.map(([, , options]) => options.delay ?? 0)).toEqual([0, 0.045, 0.09]);
  });
});
