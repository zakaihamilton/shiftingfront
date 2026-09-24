export type HapticKind = "tap" | "selection" | "order" | "deploy" | "alert";

const HAPTIC_PATTERNS: Record<HapticKind, number | number[]> = {
  tap: 8,
  selection: 12,
  order: 16,
  deploy: 24,
  alert: [25, 40, 25],
};

export function isHapticsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

export function triggerHaptic(kind: HapticKind, options?: { reducedMotion?: boolean }): boolean {
  if (options?.reducedMotion) return false;
  if (!isHapticsSupported()) return false;
  try {
    return navigator.vibrate(HAPTIC_PATTERNS[kind]);
  } catch {
    return false;
  }
}
