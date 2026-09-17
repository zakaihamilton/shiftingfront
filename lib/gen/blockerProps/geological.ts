import { mixHex } from "../tilePalette";
import type { BlockerTone, PropPrim } from "./types";
import { detailSigned, detailUnit, pe, pl, pp, shadow, liftGreen, SNOW } from "./primitives";

export function boulderPrims(v: number, t: BlockerTone, lush: boolean, snowCap: boolean): PropPrim[] {
  const profile = (v >>> 4) % 3;
  const twist = ((v % 5) - 2) * 0.35;
  const body = lush ? liftGreen(t.blocked, 18) : t.blocked;
  const facet = mixHex(body, t.dark, 0.22);
  const cap = snowCap ? mixHex(t.light, SNOW, 0.42) : mixHex(t.light, t.high, 0.18);
  const bodyPoints = profile === 0
    ? [
      -13 + twist, 2,
      -6 + twist, -8,
      -1, -13,
      13 + twist * 0.4, -1.4,
      9, 5.4,
      -10, 5.6,
    ]
    : profile === 1
      ? [
        -14 + twist, 2.8,
        -8 + twist, -6,
        1, -15,
        11 + twist * 0.4, -5.2,
        13, 3.8,
        4, 6.2,
        -11, 5.8,
      ]
      : [
        -12 + twist, 3.4,
        -4 + twist, -10.5,
        6, -8.4,
        14 + twist * 0.4, 0.2,
        8, 6.1,
        -11, 5.5,
      ];
  const out: PropPrim[] = [
    shadow(16.5, 5.2),
    pp([-15, 2.2, 14, 3.1, 10, 9.2, -12, 8.4], t.dark),
    pp(bodyPoints, body),
    pp([-6, 1, -1, -12, 6, -3, 4, 4], facet),
    pp([2, 2, 6, -3, 13 + twist * 0.4, -1.4, 9, 5.4], mixHex(body, t.dark, 0.36)),
    pl(-4, -4, 3, 3, mixHex(t.dark, body, 0.35), 0.85, { minWidth: 0.7 }),
  ];
  if (lush) {
    out.push(
      pe(-5, -2, 4.2, 2.1, -0.4, liftGreen(t.high, 12), 0.55),
      pe(4, 1.2, 3.2, 1.6, 0.2, liftGreen(t.high, 12), 0.55),
    );
  }
  out.push(
    pp([-1, -13, 13 + twist * 0.4, -1.4, 5, 0.6, -7, -6.4], cap, snowCap ? 0.68 : 0.36),
    pl(
      -7 + detailSigned(v, 31, 1.2),
      -2.4,
      1.2 + detailSigned(v, 37, 1.4),
      -7.2,
      mixHex(t.dark, body, 0.3),
      0.72,
      { minWidth: 0.55, cap: "round", alpha: 0.68 },
    ),
    pl(
      1.4 + detailSigned(v, 43, 0.9),
      -5.2,
      7.5 + detailSigned(v, 47, 1.0),
      -1.0,
      mixHex(t.dark, body, 0.26),
      0.58,
      { minWidth: 0.5, cap: "round", alpha: 0.54 },
    ),
    pe(
      -2.4 + detailSigned(v, 53, 2.2),
      -2.1 + detailSigned(v, 59, 0.8),
      1.3 + detailUnit(v, 61) * 0.9,
      0.5 + detailUnit(v, 67) * 0.35,
      detailSigned(v, 71, 0.5),
      mixHex(t.mid, t.dark, 0.35),
      0.28,
    ),
  );
  return out;
}

export function sandstonePrims(v: number, t: BlockerTone): PropPrim[] {
  const profile = (v >>> 5) % 3;
  const lean = ((v % 5) - 2) * 0.28;
  const base = mixHex(t.blocked, t.high, 0.22);
  const mid = mixHex(t.high, t.light, 0.28);
  const hi = mixHex(t.light, t.high, 0.34);
  const bands = [
    { y: 4 + (profile === 2 ? 0.8 : 0), h: profile === 1 ? 4.8 : 5.5, c: mixHex(base, t.dark, 0.2) },
    { y: -2, h: profile === 0 ? 7.4 : 6.4, c: mixHex(base, mid, 0.35) },
  ];
  const out: PropPrim[] = [
    shadow(15.5, 5),
    pp([-14, 3, 13, 3.4, 10, 8.6, -11, 8.2], t.dark),
  ];
  for (const band of bands) {
    out.push(pp([
      -12 + lean, band.y + 1.2,
      11 + lean * 0.4, band.y + 0.6,
      9, band.y - band.h + 1.4,
      -10 + lean * 0.2, band.y - band.h + 1.8,
    ], band.c));
  }
  out.push(
    pp(
      profile === 0
        ? [-8, -9.2, 1, -12.4, 9, -8.4, 6, -6.6, -5, -7.2]
        : profile === 1
          ? [-7, -8.4, 0, -14, 8, -9.2, 5, -6.2, -4, -6.8]
          : [-9, -7.8, -2, -13.2, 6, -10.2, 9, -6.8, -2, -6.1],
      hi,
    ),
    pl(-9, -1.2, 8, -2.4, mixHex(t.dark, base, 0.4), 0.75, { minWidth: 0.65 }),
    pl(-8, 3.2, 7, 2.2, mixHex(t.dark, base, 0.4), 0.75, { minWidth: 0.65 }),
  );
  if (profile === 1) {
    out.push(pp([-2.2, 3.1, 1.4, -8.6, 4.8, 3.0], mixHex(mid, t.dark, 0.24), 0.58));
  } else if (profile === 2) {
    out.push(pp([-10.5, 1.4, -6.2, -5.8, -3.1, 1.7], mixHex(base, hi, 0.3), 0.62));
  }
  const strata = mixHex(t.dark, base, 0.32);
  const weather = mixHex(t.light, base, 0.34);
  out.push(
    pl(-10.4 + lean, -5.2 + detailSigned(v, 83, 0.5), 2.4 + lean, -5.7 + detailSigned(v, 89, 0.45), strata, 0.68, { minWidth: 0.58, alpha: 0.7 }),
    pl(-7.6 + lean, 0.2 + detailSigned(v, 97, 0.35), 8.1 + lean, -0.5 + detailSigned(v, 101, 0.4), strata, 0.62, { minWidth: 0.52, alpha: 0.62 }),
    pl(-3.2 + detailSigned(v, 107, 1.1), -8.0, 3.0 + detailSigned(v, 109, 1.1), -10.4, weather, 0.58, { minWidth: 0.5, alpha: 0.42 }),
    pe(-5.4 + detailSigned(v, 113, 2.2), -3.1 + detailSigned(v, 127, 0.55), 1.2, 0.42, 0.1, mixHex(weather, base, 0.38), 0.28),
  );
  return out;
}

export function crystalPrims(v: number, t: BlockerTone): PropPrim[] {
  const gem = mixHex(t.ore, t.light, 0.42);
  const dark = mixHex(t.dark, t.ore, 0.38);
  const inner = mixHex(gem, t.light, 0.22);
  const shards = [
    { lean: -7, rise: 13, half: 4.0, gem: false },
    { lean: -1, rise: 16, half: 3.2, gem: true },
    { lean: 3, rise: 20, half: 3.5, gem: true },
    { lean: 8, rise: 12, half: 3.6, gem: false },
    { lean: 11, rise: 9, half: 2.6, gem: true },
  ];
  const shardCount = 3 + ((v >>> 5) % 3);
  const out: PropPrim[] = [
    shadow(13, 4.2),
    pp([-11, 3.4, 12, 3.6, 8, 7.2, -8, 7], mixHex(t.blocked, t.dark, 0.2)),
  ];
  for (let i = 0; i < shardCount; i++) {
    const shard = shards[i]!;
    const twist = detailSigned(v, 131 + i * 7, 0.9);
    out.push(pp([
      shard.lean - shard.half, 3.2,
      shard.lean - shard.half * 0.25 + twist, -shard.rise * 0.42,
      shard.lean + twist, -shard.rise,
      shard.lean + shard.half * 0.28 + twist * 0.4, -shard.rise * 0.32,
      shard.lean + shard.half, 2.6,
    ], shard.gem ? gem : dark));
    if (i % 2 === 0) {
      out.push(pl(
        shard.lean - shard.half * 0.25,
        1.8,
        shard.lean + twist * 0.6,
        -shard.rise + 1.8,
        mixHex(t.light, gem, 0.28),
        0.65,
        { minWidth: 0.55, cap: "round", alpha: 0.46 },
      ));
    }
  }
  out.push(
    pp([1.2, -2, 2.4, -17, 5, -1.2], inner, 0.34),
    pe(-4.6 + detailSigned(v, 149, 1.2), 3.2, 2.3, 0.8, 0, mixHex(t.dark, gem, 0.25), 0.32),
    pe(5.4 + detailSigned(v, 157, 1.1), 2.6, 1.8, 0.65, 0, mixHex(t.dark, gem, 0.2), 0.28),
  );
  return out;
}

export function wreckagePrims(v: number, t: BlockerTone): PropPrim[] {
  const profile = (v >>> 5) % 3;
  const rust = mixHex(t.ore, t.blocked, 0.28);
  const iron = mixHex(t.dark, t.blocked, 0.15);
  const seam = mixHex(t.light, rust, 0.56);
  const out: PropPrim[] = [
    shadow(15, 4.6),
    pp(
      profile === 0
        ? [-13, 3.2, 3, -7.2, 14, 1.2, 9, 7.4, -10, 7.2]
        : profile === 1
          ? [-14, 2.8, 0, -8.7, 13, 0.2, 8, 7.8, -11, 7.1]
          : [-12, 4.2, 5, -6.4, 14, 2.4, 7, 7.6, -10, 6.4],
      iron,
    ),
    pp(
      profile === 2
        ? [-7, 1.6, 5.2, -4.8, 10.5, 2.8, -2.2, 5.4]
        : [-6.5, 1.2, 7.4, -4.4, 11, 2.2, -3.2, 5.2],
      rust,
    ),
    pp([-10, 2, -2, -3, 1.4, 1.6, -7, 5], mixHex(iron, t.light, 0.16)),
    pl(-8, 2, 6, -2 + (v % 3) * 0.4, seam, 1.15, { minWidth: 0.85, cap: "round" }),
    pl(8, 1, 13, -8, seam, 1.6, { minWidth: 1.1, cap: "round" }),
  ];
  const rivet = mixHex(seam, t.dark, 0.3);
  for (let i = 0; i < 3; i++) {
    out.push(pe(-5 + i * 4.2, 1.4 + (i % 2) * 0.7, 0.5, 0.35, 0, rivet, 0.72));
  }
  if (profile === 1) out.push(pl(-10, -0.4, -2.2, -6.8, seam, 1.1, { minWidth: 0.8 }));
  if (profile === 2) out.push(pp([1.8, -0.5, 8, -3.2, 10.4, 0.2, 4.2, 1.9], mixHex(rust, t.light, 0.2), 0.72));
  out.push(
    pl(-5.8 + detailSigned(v, 167, 1.0), 2.2, 0.2 + detailSigned(v, 173, 1.1), -2.8, mixHex(seam, t.dark, 0.32), 0.7, { minWidth: 0.58, cap: "round", alpha: 0.5 }),
    pl(2.8 + detailSigned(v, 179, 0.8), 1.8, 9.3 + detailSigned(v, 181, 0.7), 0.2, mixHex(iron, t.light, 0.3), 0.62, { minWidth: 0.52, cap: "round", alpha: 0.42 }),
  );
  return out;
}

export function spirePrims(v: number, t: BlockerTone): PropPrim[] {
  const profile = (v >>> 5) % 3;
  const rock = mixHex(t.blocked, t.dark, 0.2);
  const glow = mixHex(t.ore, t.high, 0.28);
  const out: PropPrim[] = [
    shadow(11, 3.8),
    pe(0, 5.4, 9.5, 3.2, 0, mixHex(t.dark, glow, 0.25), 0.34),
    pp(
      profile === 0
        ? [-8, 5.2, -2.4, -17, 2.6, -9, 8.4, 5.2, -4.2, 7.2]
        : profile === 1
          ? [-9, 5.2, -4.1, -13, 1.6, -19, 8.8, 5.1, -3.5, 7.4]
          : [-8, 5.2, -0.6, -11, 4.6, -16, 9.2, 5.2, -3.4, 7.2],
      rock,
    ),
    pp(
      profile === 2 ? [-2.4, 2.4, 1.2, -13.5, 4, -5.5] : [-1.2, 2.4, -1.6, -15, 1.8, -6.4],
      glow,
      0.42,
    ),
    pl(-0.4, 3, profile === 1 ? 1.3 : -1.2, profile === 2 ? -12.5 : -14, mixHex(glow, t.light, 0.28), 0.7, { minWidth: 0.6 }),
  ];
  if (v % 2 === 0) {
    out.push(pp([-2.2, -10, -2.2, -17, 0.8, -11], t.light, 0.22));
  }
  out.push(
    pl(-5.2, 2.2, -1.8 + detailSigned(v, 193, 0.8), -6.2, mixHex(rock, t.dark, 0.35), 0.62, { minWidth: 0.52, alpha: 0.56 }),
    pl(2.8, 1.6, 6.4 + detailSigned(v, 197, 0.7), -2.8, mixHex(rock, glow, 0.36), 0.58, { minWidth: 0.5, alpha: 0.4 }),
    pe(-4.8 + detailSigned(v, 199, 1.1), 4.2, 1.5, 0.65, 0, mixHex(t.dark, glow, 0.28), 0.3),
  );
  return out;
}
