// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isWakeLockActive,
  isWakeLockSupported,
  releaseWakeLock,
  requestWakeLock,
  useWakeLock,
} from "../../lib/ui/wakeLock";

describe("Screen Wake Lock API utility", () => {
  let originalWakeLock: PropertyDescriptor | undefined;
  let mockSentinel: {
    released: boolean;
    release: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };
  let releaseListeners: Array<() => void>;

  beforeEach(() => {
    originalWakeLock = Object.getOwnPropertyDescriptor(navigator, "wakeLock");
    releaseListeners = [];
    mockSentinel = {
      released: false,
      release: vi.fn().mockImplementation(async () => {
        mockSentinel.released = true;
        releaseListeners.forEach((fn) => fn());
      }),
      addEventListener: vi.fn().mockImplementation((event: string, listener: () => void) => {
        if (event === "release") releaseListeners.push(listener);
      }),
      removeEventListener: vi.fn(),
    };
  });

  afterEach(async () => {
    await releaseWakeLock();
    if (originalWakeLock) {
      Object.defineProperty(navigator, "wakeLock", originalWakeLock);
    } else {
      delete (navigator as { wakeLock?: unknown }).wakeLock;
    }
    vi.restoreAllMocks();
  });

  it("detects whether wakeLock is supported in navigator", () => {
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: vi.fn() },
      configurable: true,
      writable: true,
    });
    expect(isWakeLockSupported()).toBe(true);

    Object.defineProperty(navigator, "wakeLock", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    expect(isWakeLockSupported()).toBe(false);
  });

  it("requests and releases screen wake lock cleanly", async () => {
    const requestMock = vi.fn().mockResolvedValue(mockSentinel);
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const success = await requestWakeLock();
    expect(success).toBe(true);
    expect(requestMock).toHaveBeenCalledWith("screen");
    expect(isWakeLockActive()).toBe(true);

    const released = await releaseWakeLock();
    expect(released).toBe(true);
    expect(mockSentinel.release).toHaveBeenCalled();
    expect(isWakeLockActive()).toBe(false);
  });

  it("safely handles request rejections without throwing", async () => {
    const requestMock = vi.fn().mockRejectedValue(new Error("Low battery power save mode"));
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const success = await requestWakeLock();
    expect(success).toBe(false);
    expect(isWakeLockActive()).toBe(false);
  });

  it("keeps screen awake during live combat with useWakeLock hook", async () => {
    const requestMock = vi.fn().mockResolvedValue(mockSentinel);
    Object.defineProperty(navigator, "wakeLock", {
      value: { request: requestMock },
      configurable: true,
      writable: true,
    });

    const { rerender, unmount } = renderHook(({ active }) => useWakeLock(active), {
      initialProps: { active: true },
    });

    expect(requestMock).toHaveBeenCalledWith("screen");

    // Switching to inactive (e.g. pause or game over) releases the wake lock
    await act(async () => {
      rerender({ active: false });
    });
    expect(mockSentinel.release).toHaveBeenCalled();

    // Resuming reacquires
    await act(async () => {
      rerender({ active: true });
    });
    expect(requestMock).toHaveBeenCalledTimes(2);

    // Unmounting cleans up
    unmount();
    expect(mockSentinel.release).toHaveBeenCalled();
  });
});
