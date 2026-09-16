// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { AUDIO_SAMPLE_RATE } from "../../lib/audio/constants";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("audio context", () => {
  it("creates the live graph at the configured sample rate", async () => {
    const optionsSeen: AudioContextOptions[] = [];
    class AudioContextStub {
      sampleRate = AUDIO_SAMPLE_RATE;

      constructor(options?: AudioContextOptions) {
        if (options) optionsSeen.push(options);
      }
    }

    vi.stubGlobal("window", { AudioContext: AudioContextStub });
    const { getAudioContext } = await import("../../lib/audio/context");

    expect(getAudioContext()?.sampleRate).toBe(AUDIO_SAMPLE_RATE);
    expect(optionsSeen).toEqual([{ sampleRate: AUDIO_SAMPLE_RATE }]);
  });

  it("only resumes after an explicit unlock and can recover a suspended context", async () => {
    const resume = vi.fn(async () => undefined);
    class AudioContextStub {
      sampleRate = AUDIO_SAMPLE_RATE;
      resume = resume;

      constructor(options?: AudioContextOptions) {
        void options;
      }
    }

    vi.stubGlobal("window", { AudioContext: AudioContextStub });
    const { resumeAudio, unlockAudioContext } = await import("../../lib/audio/context");

    expect(resumeAudio()).toBeNull();
    expect(resume).not.toHaveBeenCalled();

    expect(unlockAudioContext()).not.toBeNull();
    expect(resume).toHaveBeenCalledOnce();

    expect(resumeAudio()).not.toBeNull();
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it("clears the unlock state when resume fails so a later gesture can retry", async () => {
    const resume = vi.fn()
      .mockRejectedValueOnce(new Error("autoplay blocked"))
      .mockResolvedValue(undefined);
    class AudioContextStub {
      sampleRate = AUDIO_SAMPLE_RATE;
      resume = resume;

      constructor(options?: AudioContextOptions) {
        void options;
      }
    }

    vi.stubGlobal("window", { AudioContext: AudioContextStub });
    const { isAudioUnlocked, unlockAudioContext } = await import("../../lib/audio/context");

    unlockAudioContext();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isAudioUnlocked()).toBe(false);

    unlockAudioContext();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isAudioUnlocked()).toBe(true);
    expect(resume).toHaveBeenCalledTimes(2);
  });

  it("falls back to default AudioContext when sampleRate option throws (e.g. iOS/Safari)", async () => {
    let attemptedWithOptions = false;
    let fallbackCalled = false;
    class AudioContextStub {
      sampleRate = 48000;

      constructor(options?: AudioContextOptions) {
        if (options?.sampleRate) {
          attemptedWithOptions = true;
          throw new DOMException("The operation is not supported", "NotSupportedError");
        }
        fallbackCalled = true;
      }
    }

    vi.stubGlobal("window", { AudioContext: AudioContextStub });
    const { getAudioContext } = await import("../../lib/audio/context");

    const ctx = getAudioContext();
    expect(attemptedWithOptions).toBe(true);
    expect(fallbackCalled).toBe(true);
    expect(ctx).not.toBeNull();
    expect(ctx?.sampleRate).toBe(48000);
  });
});
