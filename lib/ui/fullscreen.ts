import { useSyncExternalStore } from "react";

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

function subscribeFullscreen(callback: () => void) {
  if (typeof document === "undefined") return () => undefined;
  document.addEventListener("fullscreenchange", callback);
  document.addEventListener("webkitfullscreenchange", callback);
  return () => {
    document.removeEventListener("fullscreenchange", callback);
    document.removeEventListener("webkitfullscreenchange", callback);
  };
}

const noopSubscribe = () => () => undefined;

export function useFullscreen(): {
  isFullscreen: boolean;
  isSupported: boolean;
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

  const toggle = () => {
    void toggleFullscreen();
  };

  return {
    isFullscreen: fullscreenActive,
    isSupported: supported,
    toggle,
  };
}
