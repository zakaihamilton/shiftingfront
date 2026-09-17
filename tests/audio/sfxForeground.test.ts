import { beforeEach, describe, expect, it, vi } from "vitest";

const audioState = vi.hoisted(() => ({
  foreground: true,
  audio: { currentTime: 12 } as unknown as AudioContext,
}));
const getAudioContext = vi.hoisted(() => vi.fn(() => audioState.audio));
const getAudioBus = vi.hoisted(() => vi.fn(() => ({}) as AudioNode));
const playLayeredSfx = vi.hoisted(() => vi.fn());
const resumeAudio = vi.hoisted(() => vi.fn());

vi.mock("../../lib/audio/context", () => ({
  getAudioContext,
  isAudioUnlocked: () => true,
  resumeAudio,
}));
vi.mock("../../lib/audio/mixer", () => ({
  getAudioBus,
  isAudioForeground: () => audioState.foreground,
  setAudioBusEnabled: vi.fn(),
}));
vi.mock("../../lib/audio/synth/index", () => ({
  DEFAULT_INTERVALS: {},
  playLayeredSfx,
  scheduleSfxTime: (now: number) => now,
}));

import { playSfx } from "../../lib/audio/synth";

describe("foreground sound effects", () => {
  beforeEach(() => {
    audioState.foreground = true;
    getAudioContext.mockClear();
    getAudioBus.mockClear();
    playLayeredSfx.mockClear();
    resumeAudio.mockClear();
  });

  it("does not schedule firing cues while the window is out of focus", () => {
    audioState.foreground = false;

    playSfx("cannon");

    expect(getAudioContext).not.toHaveBeenCalled();
    expect(getAudioBus).not.toHaveBeenCalled();
    expect(playLayeredSfx).not.toHaveBeenCalled();
  });

  it("resumes sound effects when the window returns to the foreground", () => {
    audioState.foreground = false;
    playSfx("cannon");

    audioState.foreground = true;
    playSfx("cannon", { force: true });

    expect(playLayeredSfx).toHaveBeenCalledTimes(1);
    expect(resumeAudio).toHaveBeenCalledTimes(1);
  });
});
