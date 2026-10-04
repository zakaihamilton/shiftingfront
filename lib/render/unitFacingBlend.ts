import type { Facing } from "../types";

export type UnitFacingLayer = { facing: Facing; weight: number };
type FacingTransition = {
  target: Facing;
  from: UnitFacingLayer[];
  startedAt: number;
  durationMs: number;
};

const transitions = new Map<number, FacingTransition>();

function sample(transition: FacingTransition, clockMs: number): UnitFacingLayer[] {
  const t = Math.max(0, Math.min(1, (clockMs - transition.startedAt) / transition.durationMs));
  if (t >= 1) return [{ facing: transition.target, weight: 1 }];
  const blend = t * t * (3 - 2 * t);
  const weights = new Map<Facing, number>();
  for (const layer of transition.from) weights.set(layer.facing, layer.weight * (1 - blend));
  weights.set(transition.target, (weights.get(transition.target) ?? 0) + blend);
  return [...weights].filter(([, weight]) => weight > 0).map(([facing, weight]) => ({ facing, weight }));
}

/** Retarget from the visible mix so a second turn never snaps back to an old view. */
export function unitFacingLayers(
  id: number,
  facing: Facing,
  clockMs: number,
  durationMs: number,
  targetReady: boolean,
  reducedMotion = false,
): UnitFacingLayer[] {
  let transition = transitions.get(id);
  if (!transition) {
    if (!targetReady) return [];
    transition = { target: facing, from: [{ facing, weight: 1 }], startedAt: clockMs, durationMs };
    transitions.set(id, transition);
  }
  const current = sample(transition, clockMs);
  if (targetReady && (transition.target !== facing || reducedMotion)) {
    transition = {
      target: facing,
      from: reducedMotion ? [{ facing, weight: 1 }] : current,
      startedAt: clockMs,
      durationMs,
    };
    transitions.set(id, transition);
  }
  // An unavailable incoming view must not replace the last ready artwork.
  if (reducedMotion) return [{ facing: transition.target, weight: 1 }];
  return sample(transition, clockMs);
}

export function pruneUnitFacingBlends(activeIds: Set<number>): void {
  for (const id of transitions.keys()) {
    if (!activeIds.has(id >= 0 ? id : -id - 1)) transitions.delete(id);
  }
}

export function resetUnitFacingBlends(): void {
  transitions.clear();
}
