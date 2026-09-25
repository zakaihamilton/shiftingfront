import { useEffect } from "react";

type WakeLockSentinelLike = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
  removeEventListener: (type: "release", listener: () => void) => void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request: (type: "screen") => Promise<WakeLockSentinelLike>;
  };
};

let activeSentinel: WakeLockSentinelLike | null = null;

export function isWakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && Boolean((navigator as NavigatorWithWakeLock).wakeLock);
}

export function isWakeLockActive(): boolean {
  return activeSentinel !== null && !activeSentinel.released;
}

export async function requestWakeLock(): Promise<boolean> {
  if (!isWakeLockSupported()) return false;
  const nav = navigator as NavigatorWithWakeLock;
  if (!nav.wakeLock) return false;

  try {
    if (activeSentinel && !activeSentinel.released) {
      return true;
    }
    const sentinel = await nav.wakeLock.request("screen");
    activeSentinel = sentinel;
    sentinel.addEventListener("release", () => {
      if (activeSentinel === sentinel) {
        activeSentinel = null;
      }
    });
    return true;
  } catch {
    activeSentinel = null;
    return false;
  }
}

export async function releaseWakeLock(): Promise<boolean> {
  if (!activeSentinel) return false;
  try {
    const sentinel = activeSentinel;
    activeSentinel = null;
    await sentinel.release();
    return true;
  } catch {
    activeSentinel = null;
    return false;
  }
}

/** Hook that keeps the screen awake during live tactical gameplay. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) {
      void releaseWakeLock();
      return;
    }

    void requestWakeLock();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void requestWakeLock();
      } else {
        void releaseWakeLock();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void releaseWakeLock();
    };
  }, [active]);
}
