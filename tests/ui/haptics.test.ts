// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isHapticsSupported, triggerHaptic, type HapticKind } from "../../lib/ui/haptics";

describe("haptics tactile feedback utility", () => {
  let originalVibrate: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalVibrate = Object.getOwnPropertyDescriptor(navigator, "vibrate");
  });

  afterEach(() => {
    if (originalVibrate) {
      Object.defineProperty(navigator, "vibrate", originalVibrate);
    } else {
      delete (navigator as { vibrate?: unknown }).vibrate;
    }
    vi.restoreAllMocks();
  });

  it("detects whether vibrate is supported in navigator", () => {
    Object.defineProperty(navigator, "vibrate", {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });
    expect(isHapticsSupported()).toBe(true);

    delete (navigator as { vibrate?: unknown }).vibrate;
    expect(isHapticsSupported()).toBe(false);
  });

  it("dispatches correct vibration patterns for each haptic kind", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    const expectedPatterns: Record<HapticKind, number | number[]> = {
      tap: 8,
      selection: 12,
      order: 16,
      deploy: 24,
      alert: [25, 40, 25],
    };

    (Object.keys(expectedPatterns) as HapticKind[]).forEach((kind) => {
      const result = triggerHaptic(kind);
      expect(result).toBe(true);
      expect(vibrateMock).toHaveBeenLastCalledWith(expectedPatterns[kind]);
    });
  });

  it("suppresses haptics when reducedMotion option is enabled", () => {
    const vibrateMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    const result = triggerHaptic("order", { reducedMotion: true });
    expect(result).toBe(false);
    expect(vibrateMock).not.toHaveBeenCalled();
  });

  it("gracefully handles environments where vibrate throws", () => {
    const vibrateMock = vi.fn().mockImplementation(() => {
      throw new Error("Vibration blocked by user permissions");
    });
    Object.defineProperty(navigator, "vibrate", {
      value: vibrateMock,
      configurable: true,
      writable: true,
    });

    const result = triggerHaptic("alert");
    expect(result).toBe(false);
  });
});
