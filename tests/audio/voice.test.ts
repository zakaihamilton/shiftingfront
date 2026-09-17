// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  isVoiceEnabled,
  playVoiceBark,
  resetVoiceCooldown,
  setVoiceEnabled,
  voiceBarkForBeep,
} from "../../lib/audio/voice";

describe("voice bark system", () => {
  it("manages enabled state correctly", () => {
    expect(isVoiceEnabled()).toBe(true);
    setVoiceEnabled(false);
    expect(isVoiceEnabled()).toBe(false);
    setVoiceEnabled(true);
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
    playVoiceBark("select", true);
    expect(cancelMock).toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalled();

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
