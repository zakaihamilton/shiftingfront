// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  isFullscreenSupported,
  toggleFullscreen,
  useFullscreen,
} from "../../lib/ui/fullscreen";

describe("fullscreen utility", () => {
  let originalFullscreenEnabled: PropertyDescriptor | undefined;
  let originalFullscreenElement: PropertyDescriptor | undefined;
  let originalPlatform: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalFullscreenEnabled = Object.getOwnPropertyDescriptor(document, "fullscreenEnabled");
    originalFullscreenElement = Object.getOwnPropertyDescriptor(document, "fullscreenElement");
    originalPlatform = Object.getOwnPropertyDescriptor(navigator, "platform");
  });

  afterEach(() => {
    if (originalFullscreenEnabled) {
      Object.defineProperty(document, "fullscreenEnabled", originalFullscreenEnabled);
    }
    if (originalFullscreenElement) {
      Object.defineProperty(document, "fullscreenElement", originalFullscreenElement);
    }
    if (originalPlatform) {
      Object.defineProperty(navigator, "platform", originalPlatform);
    }
    vi.restoreAllMocks();
  });

  it("detects whether fullscreen is supported and active", () => {
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });

    expect(isFullscreenSupported()).toBe(true);
    expect(isFullscreen()).toBe(false);

    Object.defineProperty(document, "fullscreenElement", { value: document.body, configurable: true });
    expect(isFullscreen()).toBe(true);
  });

  it("enters and exits fullscreen", async () => {
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    await enterFullscreen();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
    await exitFullscreen();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("toggles fullscreen based on current state", async () => {
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    await toggleFullscreen();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
    await toggleFullscreen();
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1);
  });

  it("updates state in useFullscreen hook on fullscreenchange events", () => {
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });

    const { result } = renderHook(() => useFullscreen());
    expect(result.current.isFullscreen).toBe(false);
    expect(result.current.isSupported).toBe(true);

    act(() => {
      Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    expect(result.current.isFullscreen).toBe(true);
  });

  it("uses F11 to toggle fullscreen", async () => {
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: requestFullscreen,
      configurable: true,
      writable: true,
    });

    const { unmount } = renderHook(() => useFullscreen());
    const event = new KeyboardEvent("keydown", { key: "F11", code: "F11" });
    const preventDefault = vi.spyOn(event, "preventDefault");

    act(() => window.dispatchEvent(event));

    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
    expect(preventDefault).toHaveBeenCalledOnce();
    unmount();
  });

  it("uses the macOS fullscreen shortcut", async () => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, "requestFullscreen", {
      value: requestFullscreen,
      configurable: true,
      writable: true,
    });

    const { result, unmount } = renderHook(() => useFullscreen());
    expect(result.current.shortcut).toBe("Control+Command+F");
    const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, metaKey: true });
    const preventDefault = vi.spyOn(event, "preventDefault");

    act(() => window.dispatchEvent(event));

    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());
    expect(preventDefault).toHaveBeenCalledOnce();
    unmount();
  });
});
