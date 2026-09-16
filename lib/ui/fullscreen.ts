import { useSyncExternalStore } from "react";
import { isMacPlatform } from "./shortcuts";

export function isFullscreenSupported(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.fullscreenEnabled ||
      (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled,
  );
}

export function isFullscreen(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.fullscreenElement ||
      (document as unknown as { webkitFullscreenElement?: Element | null }).webkitFullscreenElement,
  );
}

export async function enterFullscreen(element?: HTMLElement): Promise<boolean> {
  if (typeof document === "undefined") return false;
  const target = element ?? document.documentElement;
  try {
    if (target.requestFullscreen) {
      await target.requestFullscreen();
      return true;
    }
    const webkitTarget = target as unknown as { webkitRequestFullscreen?: () => Promise<void> | void };
    if (webkitTarget.webkitRequestFullscreen) {
      await webkitTarget.webkitRequestFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function exitFullscreen(): Promise<boolean> {
  if (typeof document === "undefined") return false;
  try {
    if (document.exitFullscreen) {
      await document.exitFullscreen();
      return true;
    }
    const webkitDoc = document as unknown as { webkitExitFullscreen?: () => Promise<void> | void };
    if (webkitDoc.webkitExitFullscreen) {
      await webkitDoc.webkitExitFullscreen();
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

export async function toggleFullscreen(element?: HTMLElement): Promise<boolean> {
  if (isFullscreen()) {
    const success = await exitFullscreen();
    return !success;
  }
  return enterFullscreen(element);
}

let fullscreenShortcutSubscribers = 0;

function onFullscreenShortcut(event: KeyboardEvent) {
  const isF11 = event.key === "F11" || event.code === "F11";
  const isMacCommand = typeof navigator !== "undefined"
    && isMacPlatform(navigator.platform, navigator.userAgent)
    && event.key.toLowerCase() === "f"
    && event.ctrlKey
    && event.metaKey
    && !event.altKey
    && !event.shiftKey;
  if (!isF11 && !isMacCommand) return;
  event.preventDefault();
  if (event.repeat) return;
  void toggleFullscreen();
}

function subscribeFullscreen(callback: () => void) {
  if (typeof document === "undefined") return () => undefined;
  document.addEventListener("fullscreenchange", callback);
  document.addEventListener("webkitfullscreenchange", callback);
  if (typeof window !== "undefined" && fullscreenShortcutSubscribers === 0) {
    window.addEventListener("keydown", onFullscreenShortcut, true);
  }
  fullscreenShortcutSubscribers += 1;
  return () => {
    document.removeEventListener("fullscreenchange", callback);
    document.removeEventListener("webkitfullscreenchange", callback);
    fullscreenShortcutSubscribers = Math.max(0, fullscreenShortcutSubscribers - 1);
    if (typeof window !== "undefined" && fullscreenShortcutSubscribers === 0) {
      window.removeEventListener("keydown", onFullscreenShortcut, true);
    }
  };
}

const noopSubscribe = () => () => undefined;
const getMacSnapshot = () => (
  typeof navigator !== "undefined" && isMacPlatform(navigator.platform, navigator.userAgent)
);
const getMacServerSnapshot = () => false;

export function useFullscreen(): {
  isFullscreen: boolean;
  isSupported: boolean;
  shortcut: string;
  toggle: () => void;
} {
  const fullscreenActive = useSyncExternalStore(
    subscribeFullscreen,
    isFullscreen,
    () => false,
  );
  const supported = useSyncExternalStore(
    noopSubscribe,
    isFullscreenSupported,
    () => false,
  );
  const isMac = useSyncExternalStore(noopSubscribe, getMacSnapshot, getMacServerSnapshot);

  const toggle = () => {
    void toggleFullscreen();
  };

  return {
    isFullscreen: fullscreenActive,
    isSupported: supported,
    shortcut: isMac ? "Control+Command+F" : "F11",
    toggle,
  };
}
