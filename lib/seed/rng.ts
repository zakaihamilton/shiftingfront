export const SEED_MIN = 0;
export const SEED_MAX = 9999;
export const MISSION_MIN = 0;
export const MISSION_MAX = 5;

export function formatSeed(seed: number): string {
  return Math.max(SEED_MIN, Math.min(SEED_MAX, seed | 0))
    .toString()
    .padStart(4, "0");
}

export function parseSeed(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const n = Number.parseInt(trimmed, 10);
  if (n < SEED_MIN || n > SEED_MAX) return null;
  return n;
}

/** Parse a mission query parameter without allowing NaN, fractions, or out-of-range indices. */
export function parseMissionIndex(raw: string | null | undefined): number | null {
  const trimmed = raw?.trim() ?? "";
  if (!/^\d{1,2}$/.test(trimmed)) return null;
  const mission = Number.parseInt(trimmed, 10);
  return mission >= MISSION_MIN && mission <= MISSION_MAX ? mission : null;
}

export function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mixSeed(seed: number, label = ""): number {
  return hash32(`${seed | 0}|${label}`);
}

export type Rng = {
  state: number;
  next: () => number;
  int: (max: number) => number;
  intRange: (min: number, maxInclusive: number) => number;
  pick: <T>(items: readonly T[]) => T;
  chance: (p: number) => boolean;
  fork: (label: string) => Rng;
  shuffle: <T>(items: readonly T[]) => T[];
};

function mulberryStep(state: number): { value: number; state: number } {
  let a = (state | 0) + 0x6d2b79f5;
  a |= 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

export function createRng(seed: number, label = ""): Rng {
  // Zero is a valid mulberry32 state. Keep it intact so a generated or
  // restored zero state remains deterministic across save/load boundaries.
  let s = mixSeed(seed, label);
  const rng: Rng = {
    get state() {
      return s;
    },
    set state(v: number) {
      s = v | 0;
    },
    next() {
      const step = mulberryStep(s);
      s = step.state;
      return step.value;
    },
    int(max: number) {
      if (max <= 0) return 0;
      return Math.floor(rng.next() * max);
    },
    intRange(min: number, maxInclusive: number) {
      if (maxInclusive <= min) return min;
      return min + rng.int(maxInclusive - min + 1);
    },
    pick<T>(items: readonly T[]) {
      return items[rng.int(items.length)]!;
    },
    chance(p: number) {
      return rng.next() < p;
    },
    fork(child: string) {
      return createRng(s, child);
    },
    shuffle<T>(items: readonly T[]) {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(i + 1);
        [out[i], out[j]] = [out[j]!, out[i]!];
      }
      return out;
    },
  };
  return rng;
}

export function rngFromState(state: number): Rng {
  const rng = createRng(1, "restore");
  rng.state = state;
  return rng;
}
