import type { BiomeName } from "../../types";
import { hash, mixHex } from "../tilePalette";
import type { BlockerTone, PropPrim } from "./types";
import { detailHash, detailSigned, detailUnit, pe, pl, pc, pp, shadow, liftGreen, SNOW } from "./primitives";

export function lushBiome(biome: BiomeName): boolean {
  return biome === "jungle wreckage" || biome === "salt marshes";
}

type TreeLobe = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  rot: number;
  fill: "dark" | "mid" | "hi";
  alpha?: number;
};

type TreeProfile = {
  lobes: readonly TreeLobe[];
};

const TREE_PROFILES: readonly TreeProfile[] = [
  {
    lobes: [
      { x: -10.5, y: -15.3, rx: 13.6, ry: 8.6, rot: -0.1, fill: "dark" },
      { x: 6.4, y: -18.8, rx: 11.7, ry: 8.0, rot: 0.14, fill: "mid" },
      { x: -1.8, y: -22.4, rx: 10.0, ry: 7.1, rot: -0.12, fill: "mid" },
      { x: 10.1, y: -14.8, rx: 7.5, ry: 5.2, rot: 0.22, fill: "dark" },
      { x: 2.0, y: -25.8, rx: 6.1, ry: 4.1, rot: -0.05, fill: "hi", alpha: 0.55 },
      { x: -5.2, y: -24.5, rx: 5.3, ry: 3.7, rot: 0.15, fill: "mid" },
    ],
  },
  {
    lobes: [
      { x: -6.5, y: -14.4, rx: 10.0, ry: 7.7, rot: -0.08, fill: "dark" },
      { x: 4.6, y: -17.3, rx: 9.4, ry: 7.6, rot: 0.12, fill: "mid" },
      { x: -1.0, y: -21.7, rx: 8.1, ry: 7.0, rot: -0.1, fill: "mid" },
      { x: 6.8, y: -23.2, rx: 6.5, ry: 5.5, rot: 0.2, fill: "mid" },
      { x: -8.1, y: -20.9, rx: 6.0, ry: 5.2, rot: -0.2, fill: "dark" },
      { x: 1.6, y: -26.4, rx: 5.9, ry: 4.0, rot: -0.03, fill: "hi", alpha: 0.55 },
    ],
  },
  {
    lobes: [
      { x: -10.8, y: -15.4, rx: 12.4, ry: 8.0, rot: -0.12, fill: "dark" },
      { x: -2.5, y: -18.8, rx: 10.5, ry: 7.8, rot: 0.08, fill: "mid" },
      { x: 7.7, y: -19.2, rx: 8.2, ry: 6.5, rot: 0.2, fill: "mid" },
      { x: 10.8, y: -14.2, rx: 5.9, ry: 4.7, rot: 0.25, fill: "dark" },
      { x: -5.0, y: -24.2, rx: 6.0, ry: 4.5, rot: -0.1, fill: "mid" },
      { x: 2.5, y: -25.9, rx: 5.2, ry: 3.8, rot: 0.04, fill: "hi", alpha: 0.55 },
    ],
  },
  {
    lobes: [
      { x: -10.2, y: -14.2, rx: 10.9, ry: 7.2, rot: -0.16, fill: "dark" },
      { x: 2.6, y: -17.7, rx: 10.1, ry: 7.1, rot: 0.16, fill: "mid" },
      { x: -3.0, y: -24.0, rx: 8.1, ry: 5.4, rot: -0.08, fill: "mid" },
      { x: 8.2, y: -24.1, rx: 5.4, ry: 4.0, rot: 0.18, fill: "mid" },
      { x: -8.4, y: -22.6, rx: 5.3, ry: 3.8, rot: -0.24, fill: "hi", alpha: 0.55 },
    ],
  },
];

function treeUnit(v: number, salt: number): number {
  return hash(v + salt * 1009) / 0x1_0000_0000;
}

function treeJitter(v: number, salt: number, span: number): number {
  return (treeUnit(v, salt) * 2 - 1) * span;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function canopyLean(y: number, lean: number): number {
  return lean * Math.max(0, Math.min(1, (-y - 4) / 26));
}

export function treePrims(v: number, t: BlockerTone, biome: BiomeName): PropPrim[] {
  const dark = mixHex(t.high, t.blocked, 0.28);
  const mid = mixHex(liftGreen(t.high, 16), t.mid, 0.22);
  const hi = mixHex(t.light, t.high, 0.35);
  const wood = mixHex(t.dark, t.blocked, 0.42);
  const profile = TREE_PROFILES[hash(v + 7) % TREE_PROFILES.length]!;
  const scale = 0.93 + treeUnit(v, 11) * 0.14;
  const lean = treeJitter(v, 13, 2.6);
  const rootX = treeJitter(v, 17, 1.25);
  const trunkTopY = -(15.5 + treeUnit(v, 19) * 4.5) * scale;
  const trunkTopX = rootX + lean * 0.85;
  const out: PropPrim[] = [
    shadow(18.5 * scale, 5.6 * scale),
    pl(rootX - 2.4 * scale, 6.2 * scale, rootX + 2.2 * scale, 6.2 * scale, wood, 4.4 * scale, { minWidth: 2.8 * scale, cap: "round" }),
    pc(
      rootX,
      6 * scale,
      rootX + lean * 0.38 + treeJitter(v, 23, 1.8),
      -(4.5 + treeUnit(v, 29) * 2.5) * scale,
      trunkTopX,
      trunkTopY,
      wood,
      3.1 * scale,
      { minWidth: 2.1 * scale, cap: "round" },
    ),
  ];
  out.push(
    pp([
      (-18 + rootX * 0.2) * scale, -7 * scale,
      (-16 + lean * 0.25) * scale, -17 * scale,
      (-8 + lean * 0.45) * scale, -29 * scale,
      (1 + lean * 0.6) * scale, -33 * scale,
      (11 + lean * 0.35) * scale, -27 * scale,
      (18 + lean * 0.2) * scale, -15 * scale,
      (16 + rootX * 0.15) * scale, -6 * scale,
      (5 + rootX * 0.25) * scale, -3 * scale,
      (-7 + rootX * 0.2) * scale, -3 * scale,
    ], dark, 0.72),
    pp([
      (-12 + lean * 0.2) * scale, -8 * scale,
      (-10 + lean * 0.3) * scale, -19 * scale,
      (-3 + lean * 0.5) * scale, -26 * scale,
      (8 + lean * 0.3) * scale, -24 * scale,
      (13 + rootX * 0.12) * scale, -14 * scale,
      (10 + rootX * 0.16) * scale, -7 * scale,
      (0 + rootX * 0.18) * scale, -5 * scale,
    ], mid, 0.66),
  );
  const fills = { dark, mid, hi };
  for (let i = 0; i < Math.min(profile.lobes.length, 3); i++) {
    const lobe = profile.lobes[i]!;
    const lobeScale = 0.86 + treeUnit(v, 41 + i * 7) * 0.28;
    const rx = lobe.rx * scale * lobeScale;
    const ry = lobe.ry * scale * lobeScale;
    const rawX = lobe.x * scale + canopyLean(lobe.y, lean) + rootX * 0.35 + treeJitter(v, 53 + i * 11, 1.35);
    const rawY = lobe.y * scale + treeJitter(v, 59 + i * 13, 1.0);
    const x = clamp(rawX, -23.5 + rx, 23.5 - rx);
    const y = clamp(rawY, -35.5 + ry, 15.5 - ry);
    out.push(pe(
      x,
      y,
      rx,
      ry,
      lobe.rot + treeJitter(v, 67 + i * 17, 0.055),
      fills[lobe.fill],
      lobe.fill === "hi" ? 0.28 : lobe.alpha,
    ));
  }
  out.push(pe(
    rootX + lean * 0.55,
    -22 * scale,
    8.2 * scale,
    2.2 * scale,
    -0.18,
    hi,
    0.2,
  ));
  const bark = mixHex(wood, t.mid, 0.24);
  out.push(
    pc(rootX - 0.8 * scale, 4.8 * scale, rootX + lean * 0.2, -1.6 * scale, rootX + lean * 0.48, -9.2 * scale, bark, 0.72 * scale, { minWidth: 0.52 * scale, cap: "round", alpha: 0.58 }),
    pc(rootX + 1.4 * scale, 4.9 * scale, rootX + lean * 0.55, -2.4 * scale, trunkTopX + 0.7 * scale, trunkTopY + 4.8 * scale, mixHex(wood, t.dark, 0.26), 0.58 * scale, { minWidth: 0.48 * scale, cap: "round", alpha: 0.46 }),
  );
  if (detailUnit(v, 211) > 0.34) {
    out.push(
      pe(-8 + lean * 0.4 + detailSigned(v, 223, 1.2), -13 + detailSigned(v, 227, 0.9), 2.2, 1.0, -0.18, mixHex(dark, t.dark, 0.2), 0.28),
      pe(8 + lean * 0.35 + detailSigned(v, 229, 1.0), -18 + detailSigned(v, 233, 0.8), 1.8, 0.85, 0.14, mixHex(mid, dark, 0.22), 0.24),
    );
  }
  if (biome === "jungle wreckage" && v % 3 !== 1) {
    const vine = mixHex(dark, t.mid, 0.38);
    out.push(
      pc(rootX * 0.35 - 4 + lean * 0.65, -18 * scale, -8 + lean, -8 * scale, -7, 2, vine, 1.1 * scale, { minWidth: 0.85 * scale }),
      pc(rootX * 0.35 + 6 + lean * 0.65, -20 * scale, 9, -10 * scale, 8, 1, vine, 1.1 * scale, { minWidth: 0.85 * scale }),
    );
  }
  if (biome === "salt marshes") {
    out.push(pe(rootX * 0.25 - 6 + lean, -12 * scale, 4 * scale, 2.2 * scale, -0.3, mixHex(t.high, t.mid, 0.35), 0.42));
  }
  return out;
}

export function pinePrims(v: number, t: BlockerTone, snow: boolean): PropPrim[] {
  const lean = ((hash(v + 19) % 7) - 3) * 0.24;
  const needle = mixHex(t.high, t.mid, 0.25);
  const dark = mixHex(t.mid, needle, 0.4);
  const out: PropPrim[] = [
    shadow(14.5, 4.8),
    pl(0, 6.2, lean, -10, t.dark, 2.8, { minWidth: 1.8, cap: "round" }),
  ];
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const w = 17.5 - i * 3.35 + ((hash(v + 41 + i * 13) % 5) - 2) * 0.55;
    const y = -2 - i * 7.1 + ((hash(v + 71 + i * 17) % 3) - 1) * 0.35;
    out.push(pp(
      [-w + lean, y + 7.4, lean, y - 6.2, w + lean, y + 7.4],
      i >= tiers - 2 ? mixHex(needle, t.light, 0.16) : dark,
    ));
    if (snow && i >= 2) {
      out.push(pp(
        [-w * 0.35 + lean, y + 1.2, lean, y - 6.2, w * 0.35 + lean, y + 1.2],
        mixHex(t.light, SNOW, 0.42),
        0.42,
      ));
    }
    out.push(
      pl(
        -w * 0.72 + lean + detailSigned(v, 241 + i, 0.6),
        y + 4.4,
        w * 0.54 + lean + detailSigned(v, 251 + i, 0.6),
        y + 1.8,
        mixHex(needle, t.dark, 0.26),
        0.58,
        { minWidth: 0.5, cap: "round", alpha: 0.48 },
      ),
    );
  }
  out.push(pe(detailSigned(v, 263, 2.2), -18.5 + detailSigned(v, 269, 0.7), 2.2, 0.7, -0.12, mixHex(needle, t.light, 0.3), 0.18));
  return out;
}

export function deadTreePrims(v: number, t: BlockerTone): PropPrim[] {
  const wood = mixHex(t.dark, t.blocked, 0.25);
  const lean = ((v % 5) - 2) * 0.3;
  return [
    shadow(11, 3.6),
    pc(0, 5.4, lean * 0.4, -4, lean, -16, wood, 2.5, { minWidth: 1.7, cap: "round" }),
    pl(lean * 0.3, -5, -7.2, -12, wood, 1.45, { minWidth: 1.05, cap: "round" }),
    pl(lean * 0.4, -8, 6.4, -14, wood, 1.45, { minWidth: 1.05, cap: "round" }),
    pl(lean * 0.5, -11, -3.2, -17, wood, 1.45, { minWidth: 1.05, cap: "round" }),
    pl(lean * 0.45, -7, 4.2, -9.5, wood, 1.45, { minWidth: 1.05, cap: "round" }),
    pl(-0.2 + detailSigned(v, 277, 0.8), -3.5, -4.8 + detailSigned(v, 281, 0.6), -8.2, mixHex(wood, t.light, 0.22), 0.58, { minWidth: 0.52, cap: "round", alpha: 0.46 }),
    pe(-2.2 + detailSigned(v, 283, 1.1), 1.6, 1.4, 0.55, 0, mixHex(wood, t.dark, 0.24), 0.34),
  ];
}

export function deadShrubPrims(v: number, t: BlockerTone): PropPrim[] {
  const profile = (v >>> 4) % 3;
  const wood = mixHex(t.dark, t.blocked, 0.2);
  const dust = mixHex(t.light, t.blocked, 0.35);
  const lean = ((v % 3) - 1) * 0.4;
  const out: PropPrim[] = [
    shadow(11.5, 3.6),
    pl(0, 5.2, lean, -9, wood, 1.8, { minWidth: 1.25, cap: "round" }),
    pl(-0.5, -2.4, -7.4, -8.4, wood, 1.15, { minWidth: 0.9, cap: "round" }),
    pl(0.6, -3.6, 7.2, -9.6, wood, 1.15, { minWidth: 0.9, cap: "round" }),
    pl(lean * 0.4, -6, 2.4, -13, wood, 1.15, { minWidth: 0.9, cap: "round" }),
    pl(lean * 0.3, -5, -3.4, -11, wood, 1.15, { minWidth: 0.9, cap: "round" }),
    pl(0.2, -4, 4.6, -6.4, wood, 1.15, { minWidth: 0.9, cap: "round" }),
    pe(-4.4, -7.4, 3.4, 1.7, -0.4, dust, 0.55),
    pe(4.6, -8.4, 3.0, 1.5, 0.3, dust, 0.55),
    pe(1.2, -11.2, 2.2, 1.15, 0.1, dust, 0.55),
  ];
  if (profile === 1) {
    out.push(
      pl(-0.1, -5.6, -8.6, -4.2, wood, 1.05, { minWidth: 0.85, cap: "round" }),
      pe(-7.8, -4.1, 2.3, 1.1, -0.25, dust, 0.5),
    );
  } else if (profile === 2) {
    out.push(
      pl(0.3, -6.4, 8.8, -3.4, wood, 1.05, { minWidth: 0.85, cap: "round" }),
      pl(0.2, -8, -1.2, -15.2, wood, 0.95, { minWidth: 0.8, cap: "round" }),
      pe(8.5, -3.3, 2.5, 1.2, 0.2, dust, 0.5),
    );
  }
  out.push(
    pl(-5.2 + detailSigned(v, 293, 0.7), -6.6, 0.5 + detailSigned(v, 307, 0.9), -9.2, mixHex(wood, dust, 0.24), 0.55, { minWidth: 0.48, cap: "round", alpha: 0.5 }),
    pl(2.2 + detailSigned(v, 311, 0.8), -5.8, 6.4 + detailSigned(v, 313, 0.7), -7.6, mixHex(wood, dust, 0.2), 0.5, { minWidth: 0.45, cap: "round", alpha: 0.42 }),
  );
  return out;
}

type DesertOrganicPalette = {
  stem: string;
  stemHi: string;
  foliageDark: string;
  foliage: string;
  foliageHi: string;
  dry: string;
};

const DESERT_ORGANIC_TINTS = [
  { stem: "#3e482a", stemHi: "#6f7b4b", dark: "#52683d", mid: "#7f9858", hi: "#afb87a", dry: "#a06d36" },
  { stem: "#344447", stemHi: "#6b8585", dark: "#4c7070", mid: "#789a98", hi: "#aec7b2", dry: "#887955" },
  { stem: "#563822", stemHi: "#966536", dark: "#794a2b", mid: "#aa6f3d", hi: "#cf9b59", dry: "#ba6a2b" },
  { stem: "#4d3645", stemHi: "#886273", dark: "#704c5b", mid: "#966978", hi: "#bd9a90", dry: "#9c6047" },
] as const;

function desertOrganicPalette(v: number, t: BlockerTone): DesertOrganicPalette {
  const tint = DESERT_ORGANIC_TINTS[detailHash(v, 1001) % DESERT_ORGANIC_TINTS.length]!;
  return {
    stem: mixHex(t.dark, tint.stem, 0.64),
    stemHi: mixHex(t.mid, tint.stemHi, 0.5),
    foliageDark: mixHex(t.blocked, tint.dark, 0.62),
    foliage: mixHex(t.high, tint.mid, 0.5),
    foliageHi: mixHex(t.light, tint.hi, 0.42),
    dry: mixHex(t.ore, tint.dry, 0.42),
  };
}

export function desertTreePrims(v: number, t: BlockerTone): PropPrim[] {
  const palette = desertOrganicPalette(v, t);
  const profile = detailHash(v, 1013) % 3;
  const scale = 0.92 + detailUnit(v, 1021) * 0.14;
  const lean = detailSigned(v, 1027, 2.6);
  const height = (18.5 + detailUnit(v, 1033) * 4.5) * scale;
  const topX = lean * 0.8;
  const canopyProfiles = [
    [[-9.5, -13.8, 8.0, 4.7], [0.5, -17.8, 10.5, 5.5], [10.0, -13.4, 6.8, 4.0]],
    [[-6.7, -14.7, 7.2, 5.0], [5.4, -17.2, 8.8, 5.3], [-0.6, -21.1, 6.6, 4.4]],
    [[-11.0, -12.6, 6.8, 3.9], [-2.4, -15.8, 8.7, 4.8], [7.2, -13.0, 7.3, 4.1], [2.8, -19.0, 5.8, 3.8]],
  ] as const;
  const canopy = canopyProfiles[profile]!;
  const out: PropPrim[] = [
    shadow(17.5 * scale, 4.5 * scale, 5.6 * scale),
    pc(0, 6 * scale, lean * 0.28, -4.5 * scale, topX, -height, palette.stem, 3.1 * scale, { minWidth: 2.0 * scale, cap: "round" }),
    pl(-2.4 * scale, 6.3 * scale, 2.4 * scale, 6.3 * scale, palette.stem, 4.0 * scale, { minWidth: 2.5 * scale, cap: "round" }),
  ];
  const branches = profile === 2 ? 3 : 2;
  for (let i = 0; i < branches; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const branchY = -(7.0 + i * 3.2) * scale;
    const branchX = side * (6.5 + i * 2.1) + lean * 0.45;
    out.push(pc(
      topX * 0.55,
      branchY * 0.42,
      branchX * 0.45,
      branchY - 3.4 * scale,
      branchX,
      branchY - 5.0 * scale,
      palette.stem,
      1.35 * scale,
      { minWidth: 0.9 * scale, cap: "round" },
    ));
  }
  for (let i = 0; i < canopy.length; i++) {
    const [x, y, rx, ry] = canopy[i]!;
    const jitterX = detailSigned(v, 1039 + i * 7, 1.0);
    const jitterY = detailSigned(v, 1043 + i * 11, 0.8);
    const lobeScale = 0.9 + detailUnit(v, 1049 + i * 13) * 0.18;
    out.push(pe(
      x * scale + lean * Math.max(0, (-y - 5) / 18) + jitterX,
      y * scale + jitterY,
      rx * scale * lobeScale,
      ry * scale * lobeScale,
      detailSigned(v, 1057 + i * 17, 0.12),
      i % 3 === 0 ? palette.foliageDark : palette.foliage,
      i === canopy.length - 1 ? 0.48 : 0.72,
    ));
  }
  out.push(
    pe(1.2 * scale + lean * 0.35, -20.8 * scale, 6.5 * scale, 1.8 * scale, -0.16, palette.foliageHi, 0.24),
    pc(-1.0 * scale, 4.7 * scale, lean * 0.18, -2.0 * scale, topX * 0.48, -9.3 * scale, palette.stemHi, 0.72 * scale, { minWidth: 0.5 * scale, cap: "round", alpha: 0.58 }),
    pc(1.4 * scale, 4.9 * scale, lean * 0.5, -3.4 * scale, topX + 0.6 * scale, -height + 4.5 * scale, palette.stemHi, 0.58 * scale, { minWidth: 0.44 * scale, cap: "round", alpha: 0.45 }),
    pe(-5.2 + detailSigned(v, 1063, 1.4), -11.5 + detailSigned(v, 1069, 0.9), 2.3, 0.9, -0.18, palette.dry, 0.3),
  );
  return out;
}

export function cactusPrims(v: number, t: BlockerTone): PropPrim[] {
  const palette = desertOrganicPalette(v, t);
  const profile = detailHash(v, 1073) % 3;
  const lean = detailSigned(v, 1079, 1.0);
  const body = mixHex(palette.foliageDark, palette.foliage, 0.35);
  const edge = mixHex(palette.stem, body, 0.28);
  const out: PropPrim[] = [shadow(13.5, 4.0), pp([
    -13, 3.0, 13, 3.2, 9, 6.2, -10, 6.0,
  ], t.dark)];
  if (profile === 0) {
    out.push(
      pp([-2.6 + lean, 3, -2.9 + lean, -7.6, -1.2 + lean, -12.6, 2.0 + lean, -11.6, 2.8 + lean, 3], body),
      pp([-2.6 + lean, -2.2, -7.4 + lean, -2.8, -8.7 + lean, -6.6, -7.0 + lean, -7.7, -4.3 + lean, -5.5, -2.5 + lean, -5.0], body),
      pp([2.1 + lean, -4.2, 6.4 + lean, -4.7, 8.1 + lean, -8.4, 6.6 + lean, -9.7, 4.2 + lean, -7.7, 2.0 + lean, -7.0], body),
    );
  } else if (profile === 1) {
    out.push(
      pp([-3.0 + lean, 3, -3.5 + lean, -6.8, -1.7 + lean, -10.2, 1.6 + lean, -9.4, 3.2 + lean, 3], body),
      pp([-2.8 + lean, -1.8, -8.2 + lean, -2.8, -9.3 + lean, -7.0, -7.6 + lean, -8.2, -4.7 + lean, -6.0, -2.7 + lean, -5.0], body),
      pp([2.4 + lean, -3.4, 7.8 + lean, -3.8, 9.2 + lean, -7.0, 7.4 + lean, -8.5, 4.4 + lean, -6.0, 2.3 + lean, -5.8], body),
    );
  } else {
    out.push(
      pp([-4.6 + lean, 3, -5.0 + lean, -3.2, -3.4 + lean, -9.4, 0.0 + lean, -11.3, 3.8 + lean, -8.6, 4.6 + lean, 3], body),
      pp([-3.8 + lean, -0.8, -9.0 + lean, -1.4, -10.0 + lean, -5.4, -8.5 + lean, -6.3, -6.1 + lean, -4.6, -3.8 + lean, -4.0], body),
    );
  }
  out.push(
    pp([-1.2 + lean, 2.2, -1.6 + lean, -6.4, 0.1 + lean, -9.7, 1.2 + lean, 2.2], palette.foliageHi, 0.34),
    pl(-5.6 + lean, -3.4, -4.1 + lean, -6.0, edge, 0.72, { minWidth: 0.52, cap: "round", alpha: 0.62 }),
    pl(3.6 + lean, -5.4, 5.4 + lean, -7.4, palette.stemHi, 0.62, { minWidth: 0.46, cap: "round", alpha: 0.56 }),
    pe(-3.0 + detailSigned(v, 1087, 1.8), -1.8 + detailSigned(v, 1093, 0.7), 1.0, 0.42, 0.1, palette.dry, 0.36),
    pe(4.1 + detailSigned(v, 1099, 1.4), -4.3 + detailSigned(v, 1103, 0.6), 0.9, 0.38, -0.1, palette.dry, 0.32),
  );
  return out;
}
