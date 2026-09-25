// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { setAudioLevels } from "../../lib/audio/mixer";
import {
  getVoiceVolume,
  isVoiceEnabled,
  playVoiceBark,
  resetVoiceCooldown,
  setVoiceEnabled,
  setVoiceVolume,
  voiceBarkForBeep,
} from "../../lib/audio/voice";

describe("voice bark system", () => {
  it("manages enabled state correctly", () => {
    expect(isVoiceEnabled()).toBe(true);
    setVoiceEnabled(false);
    expect(isVoiceEnabled()).toBe(false);
    setVoiceEnabled(true);
  });

  it("manages and clamps voice volume correctly", () => {
    expect(getVoiceVolume()).toBe(0.8);
    setVoiceVolume(0.5);
    expect(getVoiceVolume()).toBe(0.5);
    setVoiceVolume(-0.2);
    expect(getVoiceVolume()).toBe(0);
    setVoiceVolume(1.8);
    expect(getVoiceVolume()).toBe(1);
    setVoiceVolume(0.8);
  });

  it("handles voiceBarkForBeep without throwing in headless environments", () => {
    resetVoiceCooldown();
    expect(() => voiceBarkForBeep("select")).not.toThrow();
    expect(() => voiceBarkForBeep("ack")).not.toThrow();
    expect(() => voiceBarkForBeep("ackAttack")).not.toThrow();
    expect(() => voiceBarkForBeep("ackHarvest")).not.toThrow();
    expect(() => voiceBarkForBeep("alert")).not.toThrow();
    expect(() => voiceBarkForBeep(undefined)).not.toThrow();
  });

  it("triggers SpeechSynthesis when available in window", () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    const synthMock = {
      speak: speakMock,
      cancel: cancelMock,
      getVoices: () => [],
    };
    class UtteranceMock {
      text: string;
      rate = 1;
      pitch = 1;
      volume = 1;
      lang = "en-US";
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("speechSynthesis", synthMock);
    vi.stubGlobal("SpeechSynthesisUtterance", UtteranceMock);
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "speechSynthesis", {
        value: synthMock,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        value: UtteranceMock,
        configurable: true,
        writable: true,
      });
    }

    resetVoiceCooldown();
    setAudioLevels({ masterVolume: 0.5 });
    setVoiceVolume(0.6);
    playVoiceBark("select", true);
    expect(cancelMock).toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalled();
    const lastCall = speakMock.mock.calls[0]?.[0];
    expect(lastCall.volume).toBeCloseTo(0.3, 5);

    // Suppressed when disabled
    speakMock.mockClear();
    resetVoiceCooldown();
    setVoiceEnabled(false);
    playVoiceBark("select", true);
    expect(speakMock).not.toHaveBeenCalled();
    setVoiceEnabled(true);

    // Suppressed when voice volume is 0
    speakMock.mockClear();
    resetVoiceCooldown();
    setVoiceVolume(0);
    playVoiceBark("select", true);
    expect(speakMock).not.toHaveBeenCalled();
    setVoiceVolume(0.8);

    // Suppressed when master volume is 0
    speakMock.mockClear();
    resetVoiceCooldown();
    setAudioLevels({ masterVolume: 0 });
    playVoiceBark("select", true);
    expect(speakMock).not.toHaveBeenCalled();
    setAudioLevels({ masterVolume: 1 });

    vi.unstubAllGlobals();
  });

  it("selects different movement phrases for different random values", () => {
    const spoken: string[] = [];
    const speakMock = vi.fn();
    const synthMock = {
      speak: speakMock,
      cancel: vi.fn(),
      getVoices: () => [],
    };
    class UtteranceMock {
      rate = 1;
      pitch = 1;
      volume = 1;
      lang = "en-US";
      constructor(public text: string) {
        spoken.push(text);
      }
    }
    vi.stubGlobal("speechSynthesis", synthMock);
    vi.stubGlobal("SpeechSynthesisUtterance", UtteranceMock);
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "speechSynthesis", {
        value: synthMock,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        value: UtteranceMock,
        configurable: true,
        writable: true,
      });
    }

    const randomSpy = vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);
    resetVoiceCooldown();
    playVoiceBark("move", true);
    playVoiceBark("move", true);

    expect(spoken).toEqual(["Acknowledged.", "Coordinates set."]);
    expect(speakMock).toHaveBeenCalledTimes(2);

    randomSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("suppresses voice barks when window is blurred and cancels speech on blur", () => {
    const speakMock = vi.fn();
    const cancelMock = vi.fn();
    const synthMock = {
      speak: speakMock,
      cancel: cancelMock,
      getVoices: () => [],
    };
    class UtteranceMock {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
    vi.stubGlobal("speechSynthesis", synthMock);
    vi.stubGlobal("SpeechSynthesisUtterance", UtteranceMock);
    if (typeof window !== "undefined") {
      Object.defineProperty(window, "speechSynthesis", {
        value: synthMock,
        configurable: true,
        writable: true,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        value: UtteranceMock,
        configurable: true,
        writable: true,
      });
    }

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("blur"));
    }
    expect(cancelMock).toHaveBeenCalled();

    resetVoiceCooldown();
    playVoiceBark("select", true);
    expect(speakMock).not.toHaveBeenCalled();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("focus"));
    }
    resetVoiceCooldown();
    playVoiceBark("select", true);
    expect(speakMock).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
