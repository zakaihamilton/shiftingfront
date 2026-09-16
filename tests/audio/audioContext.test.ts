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

  it("handles legacy webkitAudioContext prefix when standard AudioContext is absent", async () => {
    class WebkitAudioStub {
      sampleRate = AUDIO_SAMPLE_RATE;
    }
    vi.stubGlobal("window", { webkitAudioContext: WebkitAudioStub });
    const { getAudioContext } = await import("../../lib/audio/context");

    const ctx = getAudioContext();
    expect(ctx).not.toBeNull();
    expect(ctx?.sampleRate).toBe(AUDIO_SAMPLE_RATE);
  });

  it("gracefully returns null when AudioContext is completely unsupported or throws fatally", async () => {
    class BrokenAudioStub {
      constructor() {
        throw new Error("DeviceNotFound");
      }
    }
    vi.stubGlobal("window", { AudioContext: BrokenAudioStub });
    const { getAudioContext, resumeAudio, unlockAudioContext } = await import("../../lib/audio/context");

    expect(getAudioContext()).toBeNull();
    expect(resumeAudio()).toBeNull();
    expect(unlockAudioContext()).toBeNull();
  });

  it("automatically recreates a new context if an existing context transitions to closed state", async () => {
    let instances = 0;
    class AudioContextStub {
      sampleRate = AUDIO_SAMPLE_RATE;
      state: AudioContextState = "running";
      constructor() {
        instances += 1;
      }
    }
    vi.stubGlobal("window", { AudioContext: AudioContextStub });
    const { getAudioContext } = await import("../../lib/audio/context");

    const first = getAudioContext();
    expect(instances).toBe(1);

    // Simulate system closing the audio context (e.g. unplugging headphones / OS sleep)
    if (first) Reflect.defineProperty(first, "state", { value: "closed", configurable: true });

    const second = getAudioContext();
    expect(instances).toBe(2);
    expect(second).not.toBe(first);
  });
});
