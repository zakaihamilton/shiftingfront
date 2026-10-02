import type { SimState } from "@/lib/types";

const FRESH_LAUNCH_INTENT_KEY = "shiftingfront:fresh-launch";
const BRIEFING_SKIP_INTENT_KEY = "shiftingfront:briefing-skip";

type FreshLaunchIntent = {
  seed: number;
  mission: number;
};

type BriefingSkipIntent = FreshLaunchIntent;

let memoryFreshLaunchIntent: FreshLaunchIntent | null = null;
let memoryBriefingSkipIntent: BriefingSkipIntent | null = null;
let resultReturnSnapshot: SimState | null = null;

/** Preserve a terminal result for the replay briefing's return path without replacing the campaign save. */
export function stashResultReturnSnapshot(state: SimState): void {
  resultReturnSnapshot = state;
}

/** Consume the preserved result only when returning to that campaign mission. */
export function consumeResultReturnSnapshot(seed: number, mission: number): SimState | null {
  const state = resultReturnSnapshot;
  resultReturnSnapshot = null;
  if (!state || state.seed !== seed || state.missionIndex !== mission || !state.result) return null;
  return state;
}

export function clearResultReturnSnapshot(seed?: number, mission?: number): void {
  if (!resultReturnSnapshot) return;
  if (seed !== undefined && resultReturnSnapshot.seed !== seed) return;
  if (mission !== undefined && resultReturnSnapshot.missionIndex !== mission) return;
  resultReturnSnapshot = null;
}

function sessionStorageOrNull(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function markFreshLaunchIntent(seed: number, mission: number): void {
  const intent = { seed, mission } satisfies FreshLaunchIntent;
  const storage = sessionStorageOrNull();
  if (!storage) {
    memoryFreshLaunchIntent = intent;
    return;
  }
  try {
    storage.setItem(FRESH_LAUNCH_INTENT_KEY, JSON.stringify(intent));
    memoryFreshLaunchIntent = null;
  } catch {
    // Keep the intent in memory when a blocked or exhausted session store cannot persist it.
    memoryFreshLaunchIntent = intent;
  }
}

export function consumeFreshLaunchIntent(seed: number, mission: number): boolean {
  const memoryIntent = memoryFreshLaunchIntent;
  memoryFreshLaunchIntent = null;
  const storage = sessionStorageOrNull();
  if (!storage) return memoryIntent?.seed === seed && memoryIntent.mission === mission;

  let raw: string | null;
  try {
    raw = storage.getItem(FRESH_LAUNCH_INTENT_KEY);
  } catch {
    return memoryIntent?.seed === seed && memoryIntent.mission === mission;
  }

  if (raw !== null) {
    try {
      storage.removeItem(FRESH_LAUNCH_INTENT_KEY);
    } catch {
      // Treat the marker as consumed even if cleanup is unavailable.
    }
  }

  if (memoryIntent?.seed === seed && memoryIntent.mission === mission) return true;
  if (!raw) return false;
  try {
    const intent = JSON.parse(raw) as Partial<FreshLaunchIntent>;
    return intent.seed === seed && intent.mission === mission;
  } catch {
    return false;
  }
}

/**
 * Carries a presentation-only briefing action across the briefing -> mission
 * route transition without touching the deterministic save or simulation state.
 */
export function markBriefingSkippedIntent(seed: number, mission: number): void {
  const intent = { seed, mission } satisfies BriefingSkipIntent;
  const storage = sessionStorageOrNull();
  if (!storage) {
    memoryBriefingSkipIntent = intent;
    return;
  }
  try {
    storage.setItem(BRIEFING_SKIP_INTENT_KEY, JSON.stringify(intent));
    memoryBriefingSkipIntent = null;
  } catch {
    memoryBriefingSkipIntent = intent;
  }
}

/**
 * Clears a briefing action that was recorded for a route the player is
 * leaving without launching. This prevents a later visit to the same mission
 * from being misclassified as a skipped briefing.
 */
export function clearBriefingSkippedIntent(seed: number, mission: number): void {
  if (memoryBriefingSkipIntent?.seed === seed && memoryBriefingSkipIntent.mission === mission) {
    memoryBriefingSkipIntent = null;
  }

  const storage = sessionStorageOrNull();
  if (!storage) return;
  try {
    const raw = storage.getItem(BRIEFING_SKIP_INTENT_KEY);
    if (!raw) return;
    const intent = JSON.parse(raw) as Partial<BriefingSkipIntent>;
    if (intent.seed === seed && intent.mission === mission) storage.removeItem(BRIEFING_SKIP_INTENT_KEY);
  } catch {
    // Ignore blocked, malformed, or unavailable session storage.
  }
}

export function consumeBriefingSkippedIntent(seed: number, mission: number): boolean {
  const memoryIntent = memoryBriefingSkipIntent;
  memoryBriefingSkipIntent = null;
  const storage = sessionStorageOrNull();
  if (!storage) return memoryIntent?.seed === seed && memoryIntent.mission === mission;

  let raw: string | null;
  try {
    raw = storage.getItem(BRIEFING_SKIP_INTENT_KEY);
  } catch {
    return memoryIntent?.seed === seed && memoryIntent.mission === mission;
  }
  if (raw !== null) {
    try {
      storage.removeItem(BRIEFING_SKIP_INTENT_KEY);
    } catch {
      // Treat the marker as consumed even if cleanup is unavailable.
    }
  }
  if (memoryIntent?.seed === seed && memoryIntent.mission === mission) return true;
  if (!raw) return false;
  try {
    const intent = JSON.parse(raw) as Partial<BriefingSkipIntent>;
    return intent.seed === seed && intent.mission === mission;
  } catch {
    return false;
  }
}
