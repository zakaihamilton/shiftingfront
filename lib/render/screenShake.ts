export type ScreenShakeState = {
  trauma: number;
  lastUpdateMs: number;
};

export const MAX_SHAKE_OFFSET_PX = 8;
export const SHAKE_DECAY_RATE = 2.4; // Trauma drops to zero in ~0.4s

export function createScreenShakeState(): ScreenShakeState {
  return {
    trauma: 0,
    lastUpdateMs: 0,
  };
}

/**
 * Add trauma to the screen shake system.
 * Values are capped at 1.0.
 * - Heavy building destruction: 0.75 - 0.9
 * - Vehicle destruction: 0.45 - 0.6
 * - Heavy cannon impact: 0.2 - 0.35
 */
export function addScreenShake(state: ScreenShakeState, amount: number): void {
  state.trauma = Math.min(1, state.trauma + Math.max(0, amount));
}

/**
 * Advance shake simulation and compute current pixel offsets.
 * Strictly returns { offsetX: 0, offsetY: 0 } when prefers-reduced-motion is active.
 */
export function updateScreenShake(
  state: ScreenShakeState,
  nowMs: number,
  reducedMotion = false,
): { offsetX: number; offsetY: number } {
  if (reducedMotion || state.trauma <= 0.001) {
    state.trauma = 0;
    state.lastUpdateMs = nowMs;
    return { offsetX: 0, offsetY: 0 };
  }

  const dtSeconds = state.lastUpdateMs > 0 ? Math.max(0, (nowMs - state.lastUpdateMs) / 1000) : 0.016;
  state.lastUpdateMs = nowMs;

  state.trauma = Math.max(0, state.trauma - SHAKE_DECAY_RATE * dtSeconds);
  const shake = state.trauma * state.trauma;

  if (shake <= 0.001) {
    return { offsetX: 0, offsetY: 0 };
  }

  // Harmonic multi-frequency oscillation for organic jolt
  const t = nowMs * 0.035;
  const offsetX = Math.round(MAX_SHAKE_OFFSET_PX * shake * Math.sin(t * 1.3 + 0.4));
  const offsetY = Math.round(MAX_SHAKE_OFFSET_PX * shake * Math.cos(t * 1.7 + 1.2));

  return { offsetX, offsetY };
}
