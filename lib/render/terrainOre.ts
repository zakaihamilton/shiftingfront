import type { AtlasWorld } from "./terrainMaterials";
import { artSalt, fbm, resourceAt, tileVariant } from "./terrainMaterials";

export const ORE_GLINT_RIDGE = 0.55;
export const ORE_CRYSTAL_MIN_AMOUNT = 50;

export type OreVeinSample = {
  ridge: number;
  intensity: number;
};

export type OreVeinContext = {
  salt: number;
  amount: number;
};

export type OreVeinPeak = {
  fx: number;
  fy: number;
  intensity: number;
};

export type OreShardPose = {
  dx: number;
  dy: number;
  lean: number;
  rise: number;
  half: number;
  buried: number;
  twist: number;
};

export type OreBurstOrigin = {
  dx: number;
  dy: number;
};

export type OreCrystalCluster = {
  fx: number;
  fy: number;
  intensity: number;
  bursts: OreBurstOrigin[];
  shards: OreShardPose[];
};
export function oreVeinAt(state: AtlasWorld, mapX: number, mapY: number, context?: OreVeinContext): OreVeinSample {
  const x = Math.floor(mapX);
  const y = Math.floor(mapY);
  const amount = context?.amount ?? resourceAt(state, x, y);
  const salt = context?.salt ?? artSalt(state);
  const seam = fbm(mapX * 0.72, mapY * 0.28, salt + 91);
  const crack = fbm(mapX * 0.31, mapY * 0.64, salt + 140);
  const ridge = Math.max(
    (1 - Math.abs(seam - 0.5) * 2) ** 2,
    (1 - Math.abs(crack - 0.48) * 2) ** 3 * 0.65,
  );
  const richness = Math.min(1, Math.max(0, amount / 900));
  return { ridge, intensity: ridge * (0.28 + richness * 0.72) };
}

export const ORE_VEIN_PROBES: ReadonlyArray<readonly [number, number]> = [
  [0.28, 0.32],
  [0.62, 0.28],
  [0.38, 0.68],
  [0.72, 0.58],
];

export function oreVeinPeak(state: AtlasWorld, x: number, y: number): OreVeinPeak {
  let fx = 0.5;
  let fy = 0.5;
  let intensity = 0;
  for (const [px, py] of ORE_VEIN_PROBES) {
    const vein = oreVeinAt(state, x + px, y + py);
    if (vein.intensity > intensity) {
      intensity = vein.intensity;
      fx = px;
      fy = py;
    }
  }
  return { fx, fy, intensity };
}

export function oreShardCount(amount: number): number {
  if (amount > 700) return 9;
  if (amount > 380) return 7;
  return 5;
}

function variantMod(v: number, shift: number, mod: number): number {
  return ((v >>> (shift & 31)) % mod);
}

const ORE_BURST_SLOTS: ReadonlyArray<readonly [number, number]> = [
  [0.20, 0.20],
  [0.52, 0.18],
  [0.82, 0.24],
  [0.18, 0.52],
  [0.50, 0.50],
  [0.84, 0.54],
  [0.22, 0.80],
  [0.50, 0.84],
  [0.80, 0.78],
];

const ORE_BURST_SETS_2: ReadonlyArray<readonly [number, number]> = [
  [0, 5],
  [0, 8],
  [1, 6],
  [2, 6],
  [2, 7],
  [3, 5],
  [3, 8],
  [1, 8],
];

const ORE_BURST_SETS_3: ReadonlyArray<readonly [number, number, number]> = [
  [0, 2, 6],
  [0, 2, 7],
  [0, 5, 6],
  [1, 6, 8],
  [2, 3, 7],
  [2, 3, 8],
  [1, 5, 6],
  [0, 5, 7],
];

const ORE_BURST_DIRS: ReadonlyArray<readonly [number, number]> = [
  [-1.00, 0.38],
  [-0.68, 0.82],
  [-0.22, 1.00],
  [0.26, 0.96],
  [0.64, 0.78],
  [0.98, 0.40],
  [-0.86, 0.22],
  [0.88, 0.24],
  [-0.48, 0.58],
  [0.42, 0.52],
];

export function oreCrystalCluster(state: AtlasWorld, x: number, y: number): OreCrystalCluster | null {
  const amount = resourceAt(state, x, y);
  if (amount <= ORE_CRYSTAL_MIN_AMOUNT) return null;
  const peak = oreVeinPeak(state, x, y);
  const v = tileVariant(state.seed, x, y);
  const v2 = tileVariant(state.seed ^ 0x9e3779b9, x * 3 + 1, y * 5 + 2);
  const burstCount = 2 + variantMod(v, 11, 2);
  let count = oreShardCount(amount) + variantMod(v, 7, 3) - 1;
  if (count < burstCount + 2) count = burstCount + 2;
  const set = burstCount === 3
    ? ORE_BURST_SETS_3[variantMod(v, 0, ORE_BURST_SETS_3.length)]!
    : ORE_BURST_SETS_2[variantMod(v, 0, ORE_BURST_SETS_2.length)]!;
  const shiftU = (variantMod(v, 21, 7) - 3) * 0.028;
  const shiftV = (variantMod(v2, 21, 7) - 3) * 0.028;
  const bursts: OreBurstOrigin[] = [];
  const shards: OreShardPose[] = [];
  let remaining = count;
  let shardIndex = 0;
  for (let b = 0; b < burstCount; b++) {
    const slot = ORE_BURST_SLOTS[set[b]!]!;
    const jitterU = (variantMod(v, 3 + b * 5, 11) - 5) * 0.03;
    const jitterV = (variantMod(v2, 2 + b * 5, 11) - 5) * 0.03;
    const u = Math.min(0.86, Math.max(0.14, slot[0] + shiftU + jitterU));
    const vv = Math.min(0.86, Math.max(0.14, slot[1] + shiftV + jitterV));
    const originDx = (u - vv) * 32;
    const originDy = (u + vv) * 16;
    bursts.push({ dx: originDx, dy: originDy });
    const left = burstCount - b;
    const n = b === burstCount - 1
      ? remaining
      : Math.min(remaining - (left - 1), Math.max(1, 1 + variantMod(v2, b * 4, 3)));
    remaining -= n;
    const leanSign = variantMod(v, 17 + b, 2) === 0 ? -1 : 1;
    const dirStart = variantMod(v2, 8 + b * 6, ORE_BURST_DIRS.length);
    const dirStride = 1 + variantMod(v, 20 + b, 3);
    const scale = 0.78 + variantMod(v2, 14 + b * 3, 7) * 0.055;
    for (let k = 0; k < n; k++) {
      const dir = ORE_BURST_DIRS[(dirStart + k * dirStride) % ORE_BURST_DIRS.length]!;
      const spin = (variantMod(v, k * 3 + b * 7, 7) - 3) * 0.18;
      const dirX = dir[0] + spin * dir[1];
      const dirY = Math.max(0.2, dir[1] - spin * dir[0] * 0.4);
      const lengthT = variantMod(v2, shardIndex * 5 + 1, 32) / 31;
      const length = (3.5 + lengthT * 9.4 + Math.min(1.2, amount / 600)) * scale;
      const lean = dirX * length * leanSign;
      const rise = Math.max(2.4, dirY * length + 0.7);
      const push = 1.05 + k * 0.38 + variantMod(v, shardIndex + 9, 3) * 0.2;
      const dx = originDx + lean * (push / length);
      const dy = originDy - rise * (push / length) * 0.35;
      const half = 2.05 + variantMod(v2, shardIndex + 6, 5) * 0.36 + (k === 0 ? 0.35 : 0);
      const buried = 1.2 + variantMod(v, shardIndex + 4, 3) * 0.35;
      const twist = (variantMod(v2, shardIndex + 2, 5) - 2) * 0.22;
      shards.push({ dx, dy, lean, rise, half, buried, twist });
      shardIndex += 1;
    }
  }
  shards.sort((a, b) => a.dy - b.dy);
  return { fx: 0, fy: 0, intensity: peak.intensity, bursts, shards };
}
