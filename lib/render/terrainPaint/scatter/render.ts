import type { BiomeName } from "../../../types";
import type { BiomeMaterials, Rgb } from "../../terrainMaterials";
import { fillPoly, mixRgb, rgbOf, withAlpha } from "../style";

function detailHash(value: number, salt: number): number {
  return Math.imul((value ^ salt) >>> 0, 1597334677) >>> 0;
}

function detailUnit(value: number, salt: number): number {
  return detailHash(value, salt) / 4294967296;
}

function detailSigned(value: number, salt: number, span: number): number {
  return (detailUnit(value, salt) * 2 - 1) * span;
}

function paintDabs(
  ctx: CanvasRenderingContext2D,
  s: number,
  variant: number,
  tone: { r: number; g: number; b: number },
  count: number,
  xSpan: number,
  ySpan: number,
  radius: number,
  alpha: number,
): void {
  withAlpha(ctx, alpha, () => {
    ctx.fillStyle = rgbOf(tone);
    for (let i = 0; i < count; i++) {
      const x = detailSigned(variant, 701 + i * 13, xSpan) * s;
      const y = detailSigned(variant, 739 + i * 17, ySpan) * s;
      const rx = (0.45 + detailUnit(variant, 773 + i * 19) * 0.9) * radius * s;
      const ry = (0.28 + detailUnit(variant, 809 + i * 23) * 0.55) * radius * s;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, detailSigned(variant, 853 + i * 29, 0.7), 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function paintCrack(
  ctx: CanvasRenderingContext2D,
  s: number,
  variant: number,
  tone: { r: number; g: number; b: number },
  x: number,
  y: number,
  length: number,
  alpha = 0.34,
): void {
  const lean = detailSigned(variant, 887, 1.8);
  withAlpha(ctx, alpha, () => {
    ctx.strokeStyle = rgbOf(tone);
    ctx.lineWidth = Math.max(0.45, 0.48 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x * s, y * s);
    ctx.quadraticCurveTo((x + length * 0.42 + lean) * s, (y - length * 0.16) * s, (x + length) * s, (y - length * 0.48) * s);
    ctx.stroke();
  });
}

function paintLayeredShadow(
  ctx: CanvasRenderingContext2D,
  s: number,
  rx: number,
  ry: number,
  dy: number,
  tone?: { r: number; g: number; b: number },
): void {
  shadow(ctx, s, rx, ry, dy, tone);
  if (!tone) return;
  withAlpha(ctx, 0.22, () => {
    ctx.fillStyle = rgbOf(mixRgb(tone, { r: 8, g: 12, b: 12 }, 0.62));
    ctx.beginPath();
    ctx.ellipse(0, (dy - 0.1) * s, rx * 0.56 * s, ry * 0.68 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

export function shadow(
  ctx: CanvasRenderingContext2D,
  z: number,
  rx: number,
  ry: number,
  dy = 5,
  tone?: { r: number; g: number; b: number },
): void {
  const paint = () => {
    ctx.fillStyle = tone ? rgbOf(mixRgb(tone, { r: 14, g: 20, b: 20 }, 0.5)) : "rgba(6,10,12,0.14)";
    ctx.beginPath();
    ctx.ellipse(0, dy * z, rx * z, ry * z, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  if (tone) withAlpha(ctx, 0.28, paint);
  else paint();
}

export function drawPebble(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const lean = detailSigned(variant, 11, 0.6) * s;
  const profile = detailHash(variant, 17) % 4;
  const worn = detailUnit(variant, 19);
  const body = mixRgb(mats.dark, mats.light, 0.2 + worn * 0.16);
  const facet = mixRgb(mats.mid, mats.dark, 0.12 + worn * 0.2);
  const hi = mixRgb(mats.light, mats.mid, 0.34 + worn * 0.2);
  const left = 5.9 + detailUnit(variant, 21) * 1.2;
  const right = 4.7 + detailUnit(variant, 27) * 1.6;
  const crown = 3.3 + detailUnit(variant, 31) * 1.6;
  paintLayeredShadow(ctx, s, (left + right) * 0.5, 2.25, 2.9, mats.dark);
  withAlpha(ctx, 0.34, () => {
    ctx.fillStyle = rgbOf(mixRgb(mats.dark, { r: 8, g: 12, b: 12 }, 0.55));
    ctx.beginPath();
    ctx.ellipse(lean * 0.25, 2.15 * s, (left + right) * 0.34 * s, 0.9 * s, detailSigned(variant, 37, 0.12), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = rgbOf(mats.dark);
  fillPoly(ctx, [
    (-left + lean / s) * s, 1.4 * s,
    (-left * 0.62 + lean / s) * s, 2.9 * s,
    (right * 0.54 + lean / s) * s, 3.25 * s,
    right * s, 1.5 * s,
    right * 0.7 * s, 3.3 * s,
    -left * 0.76 * s, 3.15 * s,
  ]);
  ctx.fillStyle = rgbOf(body);
  fillPoly(ctx, [
    (-left + lean / s) * s, 0.7 * s,
    (-left * 0.56 + lean / s) * s, (-2.5 - profile * 0.35) * s,
    (-left * 0.12 + lean / s) * s, (-crown - profile * 0.3) * s,
    (right * 0.48 + lean / s) * s, (-crown + worn * 0.6) * s,
    right * s, (-1.1 + profile * 0.55) * s,
    (right + 0.2) * s, 1.9 * s,
    right * 0.45 * s, 2.8 * s,
    -left * 0.72 * s, 2.65 * s,
  ]);
  ctx.fillStyle = rgbOf(facet);
  fillPoly(ctx, [
    (-left * 0.46 + lean / s) * s, 0.2 * s,
    (-left * 0.1 + lean / s) * s, (-crown * 0.78) * s,
    (right * 0.36 + lean / s) * s, (-crown * 0.8 - profile * 0.2) * s,
    right * 0.85 * s, (-1.05 + worn * 0.3) * s,
    right * 0.48 * s, 1.5 * s,
  ]);
  withAlpha(ctx, 0.36, () => {
    ctx.fillStyle = rgbOf(hi);
    ctx.beginPath();
    ctx.ellipse(
      (-0.8 + detailSigned(variant, 23, 0.9)) * s,
      (-1.45 + detailSigned(variant, 29, 0.5)) * s,
      (1.6 + detailUnit(variant, 41) * 1.4) * s,
      (0.65 + detailUnit(variant, 43) * 0.45) * s,
      -0.45 + detailSigned(variant, 47, 0.12),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
  paintDabs(ctx, s, variant, mixRgb(mats.patchA, mats.dark, 0.4), 2, 3.2, 1.7, 0.72, 0.18);
  paintCrack(ctx, s, variant, mixRgb(mats.dark, mats.blocked, 0.28), -2.1, -2.1, 3.6, 0.42);
  ctx.strokeStyle = rgbOf(mixRgb(mats.light, body, 0.6));
  ctx.lineWidth = Math.max(0.45, 0.5 * s);
  ctx.beginPath();
  ctx.moveTo((-2.4 + detailSigned(variant, 53, 0.7)) * s, -2.4 * s);
  ctx.lineTo((2.2 + detailSigned(variant, 59, 0.7)) * s, -0.6 * s);
  ctx.stroke();
}

export function drawPebbleCluster(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const n = 2 + (variant % 2);
  const sizes = [1.05, 0.72, 0.58, 0.46];
  for (let i = 0; i < n; i++) {
    ctx.save();
    ctx.translate(
      detailSigned(variant, 41 + i * 7, 4.8) * z,
      detailSigned(variant, 59 + i * 11, 1.8) * z,
    );
    ctx.rotate(detailSigned(variant, 73 + i * 13, 0.22));
    drawPebble(ctx, mats, z, scale * (sizes[i] ?? 0.5) * (0.88 + detailUnit(variant, 89 + i * 17) * 0.26), variant + i * 13);
    ctx.restore();
  }
}

export function drawRockSlab(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const profile = detailHash(variant, 101) % 4;
  const lean = detailSigned(variant, 101, 1.1);
  const worn = detailUnit(variant, 107);
  const dark = mixRgb(mats.dark, mats.blocked, 0.2 + worn * 0.14);
  const body = mixRgb(mats.blocked, mats.mid, 0.2 + worn * 0.2);
  const facet = mixRgb(mats.mid, mats.light, 0.16 + detailUnit(variant, 113) * 0.2);
  const edge = mixRgb(mats.light, mats.high, 0.12 + detailUnit(variant, 127) * 0.16);
  const left = 7.5 + detailUnit(variant, 131) * 2.1;
  const right = 6.8 + detailUnit(variant, 137) * 2.5;
  const crown = 3.8 + detailUnit(variant, 139) * 2.2;
  paintLayeredShadow(ctx, s, (left + right) * 0.5, 2.45, 3.0, mats.dark);
  ctx.fillStyle = rgbOf(dark);
  fillPoly(ctx, [
    -left * s, 2.5 * s,
    -left * 0.12 * s, 3.15 * s,
    right * s, 2.8 * s,
    (right + 0.5) * s, 0.8 * s,
    -left * 0.86 * s, 0.5 * s,
  ]);
  ctx.fillStyle = rgbOf(body);
  const leftShoulder = profile === 2 ? 0.46 : profile === 3 ? 0.7 : 0.56;
  const rightShoulder = profile === 1 ? 0.42 : profile === 3 ? 0.66 : 0.54;
  fillPoly(ctx, [
    (-left + lean) * s,
    (0.8 + profile * 0.18) * s,
    (-left * leftShoulder + lean) * s,
    (-crown - profile * 0.35) * s,
    (right * rightShoulder + lean * 0.32) * s,
    (-crown * 0.82 + profile * 0.28) * s,
    right * s,
    (-0.7 + profile * 0.48) * s,
    right * 0.68 * s,
    2.1 * s,
    -left * 0.74 * s,
    1.9 * s,
  ]);
  ctx.fillStyle = rgbOf(facet);
  fillPoly(ctx, [
    (-left * 0.44 + (profile === 2 ? 1.4 : 0)) * s,
    (-crown * 0.74) * s,
    (right * 0.16 + lean * 0.2) * s,
    (-crown * 0.58) * s,
    right * 0.72 * s,
    (-0.6 + worn * 0.6) * s,
    right * 0.12 * s,
    0.8 * s,
  ]);
  withAlpha(ctx, 0.42, () => {
    ctx.fillStyle = rgbOf(edge);
    ctx.beginPath();
    ctx.ellipse(
      (-1.5 + detailSigned(variant, 149, 2.2)) * s,
      (-1.8 - profile * 0.25) * s,
      (2.2 + detailUnit(variant, 151) * 2.1) * s,
      (0.55 + detailUnit(variant, 157) * 0.5) * s,
      -0.15 + detailSigned(variant, 163, 0.14),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  });
  paintDabs(ctx, s, variant, mixRgb(mats.patchA, mats.dark, 0.35), 4, 5.8, 2.2, 0.8, 0.2);
  paintCrack(ctx, s, variant, mixRgb(mats.dark, mats.blocked, 0.2), -4.9, -1.6, 4.2, 0.44);
  paintCrack(ctx, s, variant + 17, mixRgb(mats.dark, mats.light, 0.24), 0.6, -2.8, 3.2, 0.3);
  ctx.strokeStyle = rgbOf(mixRgb(mats.dark, mats.light, 0.4));
  ctx.lineWidth = Math.max(0.55, 0.65 * s);
  ctx.beginPath();
  ctx.moveTo((-5.4 + profile + detailSigned(variant, 173, 0.8)) * s, -1.9 * s);
  ctx.lineTo((1.6 + profile * 1.4 + detailSigned(variant, 179, 0.9)) * s, -2.8 * s);
  ctx.lineTo((5.2 + lean + detailSigned(variant, 181, 0.8)) * s, -0.6 * s);
  ctx.stroke();
}

export function drawMineralFragment(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const count = 1 + ((variant >>> 4) % 3);
  const edge = mixRgb(mats.dark, mats.mid, 0.34);
  const body = mixRgb(mats.mid, mats.high, 0.34 + detailUnit(variant, 141) * 0.18);
  const facet = mixRgb(mats.high, mats.light, 0.24 + detailUnit(variant, 149) * 0.2);
  const stain = mixRgb(mats.patchB, mats.ore, 0.32);
  const hi = mixRgb(mats.light, mats.high, 0.38);
  paintLayeredShadow(ctx, s, 6.8 + count, 1.95, 2.65, mats.dark);
  for (let i = 0; i < count; i++) {
    const t = i - (count - 1) / 2;
    const x = t * (4.0 + detailUnit(variant, 157 + i) * 1.2) + detailSigned(variant, 163 + i * 7, 1.2);
    const rise = 2.4 + detailUnit(variant, 179 + i * 11) * 2.4;
    const half = 2.1 + detailUnit(variant, 191 + i * 13) * 1.8;
    const lean = detailSigned(variant, 211 + i * 17, 1.4);
    const profile = detailHash(variant, 223 + i * 19) % 3;
    withAlpha(ctx, 0.32, () => {
      ctx.fillStyle = rgbOf(mixRgb(mats.dark, mats.blocked, 0.32));
      ctx.beginPath();
      ctx.ellipse(x * s, 2.05 * s, (half + 1.0) * s, 0.7 * s, detailSigned(variant, 263 + i, 0.1), 0, Math.PI * 2);
      ctx.fill();
    });
    const left = x - half;
    const right = x + half;
    ctx.fillStyle = rgbOf(edge);
    if (profile === 0) {
      fillPoly(ctx, [
        (left - 0.8) * s, 2.2 * s,
        (left - 0.2) * s, -rise * 0.55 * s,
        (x - half * 0.3 + lean) * s, -rise * s,
        (x + half * 0.55 + lean) * s, -rise * 0.78 * s,
        (right + 0.8) * s, 1.9 * s,
        (x + half * 0.25) * s, 2.7 * s,
      ]);
    } else if (profile === 1) {
      ctx.beginPath();
      ctx.ellipse((x + lean * 0.3) * s, -0.05 * s, half * s, (rise * 0.7 + 0.9) * s, detailSigned(variant, 269 + i, 0.18), 0, Math.PI * 2);
      ctx.fill();
    } else {
      fillPoly(ctx, [
        (left - 0.7) * s, 2.1 * s,
        (left + 0.1) * s, -rise * 0.42 * s,
        (x - half * 0.2 + lean) * s, -rise * 0.7 * s,
        (x + half * 0.2 + lean) * s, -rise * 0.48 * s,
        (right + 0.9) * s, 1.8 * s,
        (x + half * 0.35) * s, 2.8 * s,
      ]);
    }
    ctx.fillStyle = rgbOf(body);
    fillPoly(ctx, [
      (left + 0.35) * s, 1.6 * s,
      (x - half * 0.18 + lean * 0.2) * s, -rise * 0.55 * s,
      (x + half * 0.42 + lean * 0.4) * s, -rise * 0.62 * s,
      (right - 0.35) * s, 1.45 * s,
    ]);
    ctx.fillStyle = rgbOf(facet);
    fillPoly(ctx, [
      (x - half * 0.48 + lean * 0.16) * s, 0.8 * s,
      (x - half * 0.12 + lean * 0.32) * s, -rise * 0.43 * s,
      (x + half * 0.34 + lean * 0.36) * s, -rise * 0.38 * s,
      (x + half * 0.58) * s, 0.7 * s,
    ]);
    ctx.fillStyle = rgbOf(stain);
    ctx.beginPath();
    ctx.ellipse((x + lean * 0.18) * s, 0.75 * s, half * 0.28 * s, 0.48 * s, detailSigned(variant, 277 + i, 0.25), 0, Math.PI * 2);
    ctx.fill();
    withAlpha(ctx, 0.42, () => {
      ctx.strokeStyle = rgbOf(hi);
      ctx.lineWidth = Math.max(0.45, 0.48 * s);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo((x - half * 0.32 + lean * 0.1) * s, 0.9 * s);
      ctx.quadraticCurveTo((x - half * 0.08 + lean * 0.28) * s, -rise * 0.34 * s, (x + half * 0.36 + lean * 0.3) * s, -rise * 0.38 * s);
      ctx.stroke();
    });
    paintDabs(ctx, s, variant + i * 31, mixRgb(mats.patchA, facet, 0.42), 2, half * 0.42, rise * 0.3, 0.42, 0.2);
  }
}

export function drawDryBrush(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const stem = mixRgb(mats.dark, mats.blocked, 0.22);
  const twig = mixRgb(mats.high, mats.mid, 0.28);
  const dust = mixRgb(mats.light, mats.high, 0.2);
  const stems = 3 + ((variant >>> 3) % 3);
  paintLayeredShadow(ctx, s, 6.8, 1.9, 2.6, mats.dark);
  ctx.lineCap = "round";
  for (let i = 0; i < stems; i++) {
    const t = i - (stems - 1) / 2;
    const x = (t * 2.2 + detailSigned(variant, 271 + i, 0.6)) * s;
    const lean = detailSigned(variant, 283 + i * 5, 1.4) * s;
    const tipY = -(5.2 + detailUnit(variant, 307 + i * 7) * 3.2) * s;
    ctx.strokeStyle = rgbOf(i % 2 === 0 ? stem : twig);
    ctx.lineWidth = Math.max(0.7, (0.78 + detailUnit(variant, 331 + i * 11) * 0.42) * s);
    ctx.beginPath();
    ctx.moveTo(x, 2.2 * s);
    ctx.quadraticCurveTo(x + lean * 0.35, (-1.6 + detailSigned(variant, 347 + i, 0.6)) * s, x + lean, tipY);
    ctx.stroke();
    if (i % 2 === (variant % 2) || detailUnit(variant, 359 + i) > 0.72) {
      ctx.fillStyle = rgbOf(dust);
      ctx.beginPath();
      ctx.ellipse(x + lean * 0.72, tipY + 0.7 * s, (1.0 + detailUnit(variant, 373 + i) * 0.7) * s, 0.7 * s, lean * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  paintDabs(ctx, s, variant, mixRgb(mats.patchA, mats.dark, 0.24), 2, 4.5, 1.5, 0.5, 0.22);
}

export type DesertFloraPalette = {
  stem: Rgb;
  stemHi: Rgb;
  foliageDark: Rgb;
  foliage: Rgb;
  foliageHi: Rgb;
  dry: Rgb;
};

const DESERT_FLORA_TINTS = [
  { stem: { r: 62, g: 72, b: 42 }, stemHi: { r: 108, g: 120, b: 72 }, dark: { r: 70, g: 92, b: 52 }, mid: { r: 105, g: 128, b: 74 }, hi: { r: 160, g: 168, b: 102 }, dry: { r: 150, g: 108, b: 54 } },
  { stem: { r: 52, g: 68, b: 70 }, stemHi: { r: 102, g: 126, b: 124 }, dark: { r: 60, g: 88, b: 88 }, mid: { r: 92, g: 122, b: 120 }, hi: { r: 154, g: 178, b: 164 }, dry: { r: 132, g: 118, b: 82 } },
  { stem: { r: 86, g: 54, b: 34 }, stemHi: { r: 142, g: 96, b: 52 }, dark: { r: 108, g: 68, b: 38 }, mid: { r: 158, g: 102, b: 54 }, hi: { r: 204, g: 148, b: 78 }, dry: { r: 180, g: 104, b: 42 } },
  { stem: { r: 76, g: 54, b: 68 }, stemHi: { r: 132, g: 94, b: 104 }, dark: { r: 102, g: 70, b: 82 }, mid: { r: 144, g: 96, b: 102 }, hi: { r: 192, g: 148, b: 136 }, dry: { r: 158, g: 96, b: 68 } },
] as const;

export function desertFloraPalette(mats: BiomeMaterials, variant: number): DesertFloraPalette {
  const tint = DESERT_FLORA_TINTS[detailHash(variant, 1001) % DESERT_FLORA_TINTS.length]!;
  return {
    stem: mixRgb(mats.dark, tint.stem, 0.64),
    stemHi: mixRgb(mats.mid, tint.stemHi, 0.5),
    foliageDark: mixRgb(mats.patchA, tint.dark, 0.62),
    foliage: mixRgb(mats.high, tint.mid, 0.5),
    foliageHi: mixRgb(mats.light, tint.hi, 0.42),
    dry: mixRgb(mats.ore, tint.dry, 0.42),
  };
}

export function drawDesertTree(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const palette = desertFloraPalette(mats, variant);
  const profile = detailHash(variant, 1013) % 3;
  const lean = detailSigned(variant, 1021, 1.7);
  const height = 6.4 + detailUnit(variant, 1027) * 3.4;
  const canopyProfiles = [
    [[-4.2, -5.0, 3.6, 2.1], [0.1, -6.8, 4.8, 2.5], [4.2, -5.0, 3.2, 2.0]],
    [[-2.8, -6.2, 3.2, 2.4], [2.4, -7.4, 3.8, 2.8], [0.4, -9.2, 3.0, 2.2]],
    [[-4.8, -4.5, 3.1, 1.8], [-0.3, -5.4, 4.0, 2.0], [4.8, -4.0, 2.8, 1.7], [1.4, -7.0, 2.7, 1.8]],
  ] as const;
  const canopy = canopyProfiles[profile]!;
  paintLayeredShadow(ctx, s, 7.2, 1.9, 2.7, mats.dark);
  ctx.strokeStyle = rgbOf(palette.stem);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.8, 0.95 * s);
  ctx.beginPath();
  ctx.moveTo(0, 2.4 * s);
  ctx.quadraticCurveTo(lean * 0.22 * s, -height * 0.42 * s, lean * s, -height * s);
  ctx.stroke();
  const branchCount = profile === 2 ? 3 : 2;
  for (let i = 0; i < branchCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const branchY = -3.2 - i * 1.3;
    const branchX = side * (2.0 + i * 0.8) + lean * 0.42;
    ctx.lineWidth = Math.max(0.55, 0.68 * s);
    ctx.beginPath();
    ctx.moveTo(lean * 0.6 * s, branchY * 0.18 * s);
    ctx.quadraticCurveTo(branchX * 0.45 * s, (branchY - 1.8) * s, branchX * s, (branchY - 2.5) * s);
    ctx.stroke();
  }
  for (let i = 0; i < canopy.length; i++) {
    const [x, y, rx, ry] = canopy[i]!;
    const jitterX = detailSigned(variant, 1031 + i * 7, 0.55);
    const jitterY = detailSigned(variant, 1037 + i * 11, 0.35);
    ctx.fillStyle = rgbOf(i % 3 === 0 ? palette.foliageDark : palette.foliage);
    ctx.beginPath();
    ctx.ellipse(
      (x + lean * Math.max(0, (-y - 3) / 8) + jitterX) * s,
      (y + jitterY) * s,
      (rx * (0.88 + detailUnit(variant, 1043 + i * 13) * 0.22)) * s,
      (ry * (0.88 + detailUnit(variant, 1049 + i * 17) * 0.18)) * s,
      detailSigned(variant, 1057 + i * 19, 0.14),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  withAlpha(ctx, 0.36, () => {
    ctx.fillStyle = rgbOf(palette.foliageHi);
    ctx.beginPath();
    ctx.ellipse((0.8 + lean * 0.35) * s, -7.1 * s, 2.1 * s, 0.85 * s, -0.16, 0, Math.PI * 2);
    ctx.fill();
  });
  paintDabs(ctx, s, variant, palette.dry, 2, 4.2, 1.1, 0.36, 0.24);
}

export function drawCactus(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const palette = desertFloraPalette(mats, variant);
  const profile = detailHash(variant, 1069) % 3;
  const lean = detailSigned(variant, 1073, 0.7);
  const body = mixRgb(palette.foliageDark, palette.foliage, 0.35);
  const edge = mixRgb(palette.stem, body, 0.28);
  paintLayeredShadow(ctx, s, 5.8, 1.75, 2.7, mats.dark);
  ctx.fillStyle = rgbOf(body);
  if (profile === 0) {
    fillPoly(ctx, [
      (-1.8 + lean) * s, 2.7 * s,
      (-2.1 + lean) * s, -5.7 * s,
      (-1.4 + lean) * s, -8.8 * s,
      (0.2 + lean) * s, -9.6 * s,
      (2.0 + lean) * s, -8.5 * s,
      (2.1 + lean) * s, 2.7 * s,
    ]);
    fillPoly(ctx, [
      (-2.0 + lean) * s, -1.0 * s,
      (-4.2 + lean) * s, -1.3 * s,
      (-5.1 + lean) * s, -3.8 * s,
      (-4.0 + lean) * s, -4.5 * s,
      (-3.0 + lean) * s, -3.3 * s,
      (-1.8 + lean) * s, -3.0 * s,
    ]);
    fillPoly(ctx, [
      (1.7 + lean) * s, -3.5 * s,
      (3.7 + lean) * s, -3.8 * s,
      (4.8 + lean) * s, -6.4 * s,
      (4.0 + lean) * s, -7.0 * s,
      (2.8 + lean) * s, -5.8 * s,
      (1.8 + lean) * s, -5.4 * s,
    ]);
  } else if (profile === 1) {
    fillPoly(ctx, [
      (-2.4 + lean) * s, 2.7 * s,
      (-2.7 + lean) * s, -4.8 * s,
      (-1.8 + lean) * s, -7.2 * s,
      (0.2 + lean) * s, -7.8 * s,
      (2.4 + lean) * s, -6.8 * s,
      (2.5 + lean) * s, 2.7 * s,
    ]);
    fillPoly(ctx, [
      (-2.3 + lean) * s, -1.8 * s,
      (-5.3 + lean) * s, -2.3 * s,
      (-6.2 + lean) * s, -5.2 * s,
      (-5.3 + lean) * s, -6.3 * s,
      (-4.0 + lean) * s, -5.2 * s,
      (-2.2 + lean) * s, -4.7 * s,
    ]);
    fillPoly(ctx, [
      (2.1 + lean) * s, -3.2 * s,
      (4.9 + lean) * s, -3.4 * s,
      (5.8 + lean) * s, -5.7 * s,
      (4.9 + lean) * s, -6.5 * s,
      (3.8 + lean) * s, -5.3 * s,
      (2.2 + lean) * s, -5.0 * s,
    ]);
  } else {
    ctx.beginPath();
    ctx.ellipse(lean * s, -0.2 * s, 3.7 * s, 4.7 * s, detailSigned(variant, 1079, 0.08), 0, Math.PI * 2);
    ctx.fillStyle = rgbOf(body);
    ctx.fill();
    fillPoly(ctx, [
      (-2.2 + lean) * s, -0.8 * s,
      (-4.9 + lean) * s, -1.2 * s,
      (-5.8 + lean) * s, -3.4 * s,
      (-4.8 + lean) * s, -4.2 * s,
      (-3.3 + lean) * s, -3.0 * s,
      (-2.0 + lean) * s, -2.8 * s,
    ]);
  }
  ctx.strokeStyle = rgbOf(edge);
  ctx.lineWidth = Math.max(0.5, 0.58 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo((lean - 0.7) * s, 1.8 * s);
  ctx.quadraticCurveTo((lean - 0.9) * s, -2.8 * s, (lean - 0.45) * s, -7.0 * s);
  ctx.stroke();
  withAlpha(ctx, 0.56, () => {
    ctx.strokeStyle = rgbOf(palette.foliageHi);
    ctx.lineWidth = Math.max(0.42, 0.48 * s);
    ctx.beginPath();
    ctx.moveTo((lean + 0.75) * s, 1.2 * s);
    ctx.lineTo((lean + 0.65) * s, -5.9 * s);
    ctx.stroke();
  });
  paintDabs(ctx, s, variant, palette.dry, 3, 3.8, 2.2, 0.32, 0.26);
}

export function drawDesertShrub(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const palette = desertFloraPalette(mats, variant);
  const profile = detailHash(variant, 1087) % 3;
  const lobeCount = profile === 2 ? 5 : 4;
  paintLayeredShadow(ctx, s, 6.8, 1.75, 2.6, mats.dark);
  ctx.strokeStyle = rgbOf(palette.stem);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.55, 0.68 * s);
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (1.2 + (i % 3) * 1.45) + detailSigned(variant, 1093 + i * 7, 0.45);
    const y = -(2.2 + (i % 2) * 1.3);
    ctx.beginPath();
    ctx.moveTo(0, 2.3 * s);
    ctx.quadraticCurveTo(x * 0.35 * s, y * 0.6 * s, x * 1.7 * s, (y - 2.5) * s);
    ctx.stroke();
  }
  for (let i = 0; i < lobeCount; i++) {
    const angle = (i / lobeCount) * Math.PI * 2;
    const x = Math.cos(angle) * (2.8 + detailUnit(variant, 1121 + i * 11) * 1.8);
    const y = -2.0 + Math.sin(angle) * 1.25 - (i % 2) * 0.55;
    const rx = 2.0 + detailUnit(variant, 1127 + i * 13) * 1.35;
    const ry = 1.15 + detailUnit(variant, 1133 + i * 17) * 0.85;
    ctx.fillStyle = rgbOf(i % 3 === 0 ? palette.foliageDark : palette.foliage);
    ctx.beginPath();
    ctx.ellipse(x * s, y * s, rx * s, ry * s, detailSigned(variant, 1139 + i * 19, 0.3), 0, Math.PI * 2);
    ctx.fill();
  }
  withAlpha(ctx, 0.34, () => {
    ctx.fillStyle = rgbOf(palette.foliageHi);
    ctx.beginPath();
    ctx.ellipse(-0.8 * s, -3.8 * s, 2.4 * s, 0.85 * s, -0.18, 0, Math.PI * 2);
    ctx.fill();
  });
  paintDabs(ctx, s, variant, palette.dry, 3, 4.8, 1.0, 0.34, 0.24);
}

export function drawMineralFlake(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const dark = mixRgb(mats.dark, mats.ore, 0.3);
  const gem = mixRgb(mats.ore, mats.light, 0.34);
  const hi = mixRgb(mats.light, mats.high, 0.22);
  const count = 2 + ((variant >>> 5) % 3);
  paintLayeredShadow(ctx, s, 5.8, 1.9, 2.5, mats.dark);
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 3.5 + detailSigned(variant, 401 + i, 0.9);
    const rise = 2.4 + detailUnit(variant, 419 + i * 5) * 3.2;
    const lean = detailSigned(variant, 433 + i * 7, 1.0);
    ctx.fillStyle = rgbOf(dark);
    fillPoly(ctx, [
      (x - 2.1) * s, 1.8 * s,
      (x - 0.9 + lean * 0.2) * s, -rise * 0.5 * s,
      (x + lean) * s, -rise * s,
      (x + 1.6 + lean * 0.2) * s, -rise * 0.35 * s,
      (x + 2.2) * s, 1.8 * s,
    ]);
    ctx.fillStyle = rgbOf(i % 2 ? gem : hi);
    fillPoly(ctx, [
      (x - 0.8) * s, 1.1 * s,
      (x - 0.2 + lean * 0.25) * s, -rise * 0.45 * s,
      (x + lean * 0.6) * s, (-rise + 0.45) * s,
      (x + 0.8) * s, 1.1 * s,
    ]);
    paintCrack(ctx, s, variant + i * 29, mixRgb(mats.light, mats.ore, 0.2), x - 0.5, 0.8, 1.4, 0.3);
  }
  paintDabs(ctx, s, variant, mixRgb(mats.ore, mats.dark, 0.28), 2, 3.8, 1.2, 0.46, 0.28);
}

export function drawTuft(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const blades = 5 + (detailHash(variant, 461) % 3);
  const stem = mixRgb(mats.dark, mats.blocked, 0.15);
  const tip = mixRgb(mats.light, mats.high, 0.45);
  const wind = detailSigned(variant, 467, 1.1) * s;
  paintLayeredShadow(ctx, s, 5.8, 1.9, 2.5, mats.dark);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < blades; i++) {
    const t = i - (blades - 1) / 2;
    const lean = t * 1.55 * s + detailSigned(variant, 479 + i * 3, 0.7) * s + wind * 0.35;
    const rise = (5.1 + detailUnit(variant, 503 + i * 5) * 2.6) * s;
    ctx.strokeStyle = i % 3 === 1 ? rgbOf(tip) : rgbOf(stem);
    ctx.lineWidth = Math.max(0.75, (1.05 - Math.abs(t) * 0.1 + detailUnit(variant, 521 + i * 7) * 0.22) * s);
    ctx.beginPath();
    ctx.moveTo(t * 0.35 * s, 1.9 * s);
    ctx.quadraticCurveTo(lean * 0.45, -rise * 0.35, lean, -rise);
    ctx.stroke();
  }
}

export function drawShrub(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const dark = mixRgb(mats.high, mats.blocked, 0.32);
  const mid = mixRgb(mats.high, mats.light, 0.35);
  const hi = mats.light;
  const lobes = 4 + (detailHash(variant, 541) % 2);
  paintLayeredShadow(ctx, s, 6.4, 2.05, 2.6, mats.dark);
  ctx.strokeStyle = rgbOf(mixRgb(mats.dark, mats.blocked, 0.52));
  ctx.lineWidth = Math.max(0.9, 1.2 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 2.2 * s);
  ctx.lineTo(detailSigned(variant, 557, 0.8) * s, -2.4 * s);
  ctx.stroke();
  const spots = [
    { x: -2.2, y: -3.2, rx: 5.4, ry: 3.1, rot: -0.15, fill: dark },
    { x: 2.4, y: -3.6, rx: 4.6, ry: 2.8, rot: 0.2, fill: mid },
    { x: 0.2, y: -5.0, rx: 3.6, ry: 2.3, rot: -0.05, fill: mid },
    { x: -3.4, y: -1.6, rx: 3.2, ry: 2.0, rot: 0.1, fill: dark },
    { x: 3.2, y: -1.8, rx: 2.8, ry: 1.8, rot: -0.2, fill: dark },
  ];
  for (let i = 0; i < lobes; i++) {
    const lobe = spots[i]!;
    ctx.fillStyle = rgbOf(lobe.fill);
    ctx.beginPath();
    ctx.ellipse(
      (lobe.x + detailSigned(variant, 571 + i * 7, 0.8)) * s,
      (lobe.y + detailSigned(variant, 589 + i * 11, 0.45)) * s,
      lobe.rx * (0.88 + detailUnit(variant, 607 + i * 13) * 0.22) * s,
      lobe.ry * (0.88 + detailUnit(variant, 631 + i * 17) * 0.2) * s,
      lobe.rot + detailSigned(variant, 653 + i * 19, 0.08),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  withAlpha(ctx, 0.32, () => {
    ctx.fillStyle = rgbOf(hi);
    ctx.beginPath();
    ctx.ellipse(0.4 * s, -4.6 * s, 2.1 * s, 1.3 * s, -0.25, 0, Math.PI * 2);
    ctx.fill();
  });
  paintDabs(ctx, s, variant, mixRgb(mats.patchB, mats.dark, 0.22), 3, 4.0, 2.0, 0.5, 0.2);
}

export function drawDebris(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const rust = mixRgb(mats.ore, mats.blocked, 0.35);
  const iron = mixRgb(mats.dark, mats.blocked, 0.2);
  const seam = mixRgb(mats.light, rust, 0.58);
  const tilt = detailSigned(variant, 677, 0.8);
  paintLayeredShadow(ctx, s, 6.9, 2.15, 2.7, mats.dark);
  ctx.fillStyle = rgbOf(iron);
  fillPoly(ctx, [
    (-6.8 + tilt) * s, 1.0 * s,
    (-2.3 + tilt * 0.5) * s, -1.7 * s,
    2.2 * s, (-2.4 + tilt * 0.4) * s,
    6.8 * s, 0.6 * s,
    5.4 * s, 3.2 * s,
    -5.2 * s, 3.4 * s,
  ]);
  ctx.fillStyle = rgbOf(rust);
  fillPoly(ctx, [
    (-3.2 + tilt * 0.3) * s, -0.2 * s,
    (1.5 + tilt * 0.4) * s, -2.1 * s,
    4.0 * s, -2.4 * s,
    5.0 * s, 0.6 * s,
    -1.6 * s, 1.8 * s,
  ]);
  ctx.fillStyle = rgbOf(mixRgb(iron, mats.light, 0.18));
  fillPoly(ctx, [
    -5.4 * s, 0.6 * s,
    -1.2 * s, -0.8 * s,
    0.4 * s, 0.4 * s,
    -4.2 * s, 2.2 * s,
  ]);
  ctx.strokeStyle = rgbOf(mixRgb(seam, iron, 0.18));
  ctx.lineWidth = Math.max(0.55, 0.65 * s);
  ctx.beginPath();
  ctx.moveTo(-4.2 * s, 0.6 * s);
  ctx.lineTo(3.4 * s, -0.8 * s + (variant % 3) * 0.25 * s);
  ctx.stroke();
  ctx.fillStyle = rgbOf(mixRgb(seam, mats.dark, 0.35));
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(
      (-3 + i * 2.4 + detailSigned(variant, 691 + i, 0.45)) * s,
      (0.4 + (i % 2) * 0.5 + detailSigned(variant, 709 + i, 0.2)) * s,
      (0.38 + detailUnit(variant, 727 + i) * 0.22) * s,
      (0.28 + detailUnit(variant, 743 + i) * 0.16) * s,
      detailSigned(variant, 761 + i, 0.5),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  paintDabs(ctx, s, variant, mixRgb(mats.patchB, rust, 0.3), 3, 4.8, 1.5, 0.5, 0.2);
  paintCrack(ctx, s, variant, mixRgb(mats.dark, seam, 0.38), -3.8, 0.5, 4.8, 0.36);
}

export function drawCrystalChip(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const gem = mixRgb(mats.ore, mats.light, 0.4);
  const dark = mixRgb(mats.dark, mats.ore, 0.35);
  const inner = mixRgb(gem, mats.light, 0.22);
  const lean = detailSigned(variant, 773, 1.1) * s;
  const height = (4.6 + detailUnit(variant, 787) * 2.3) * s;
  paintLayeredShadow(ctx, s, 4.5, 1.7, 2.5, mats.dark);
  ctx.fillStyle = rgbOf(dark);
  fillPoly(ctx, [-3.0 * s, 2.0 * s, lean - 0.4 * s, -(height + 0.4 * s), 3.2 * s, 1.7 * s]);
  ctx.fillStyle = rgbOf(gem);
  fillPoly(ctx, [-0.8 * s, 1.0 * s, lean * 0.65, -(height - 0.25 * s), 2.0 * s, 0.7 * s]);
  withAlpha(ctx, 0.4, () => {
    ctx.fillStyle = rgbOf(inner);
    fillPoly(ctx, [-0.15 * s, 0.2 * s, lean * 0.4, -(height - 0.9 * s), 1.05 * s, 0.15 * s]);
  });
  paintCrack(ctx, s, variant, mixRgb(mats.light, mats.ore, 0.18), -0.5, 0.7, 2.2, 0.38);
  paintDabs(ctx, s, variant, mixRgb(mats.patchB, mats.ore, 0.24), 2, 2.0, 1.0, 0.38, 0.24);
}

export function drawReed(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const stem = mixRgb(mats.blocked, mats.dark, 0.15);
  const hi = mixRgb(mats.light, mats.high, 0.25);
  const wind = detailSigned(variant, 809, 0.9) * s;
  paintLayeredShadow(ctx, s, 5.9, 1.9, 2.5, mats.dark);
  ctx.lineCap = "round";
  const n = 5 + (detailHash(variant, 821) % 2);
  for (let i = 0; i < n; i++) {
    const x = ((i - (n - 1) / 2) * 2.05 + detailSigned(variant, 829 + i, 0.55)) * s;
    const tipX = x + detailSigned(variant, 839 + i * 3, 1.0) * s + wind * 0.4;
    const tipY = -(5.4 + detailUnit(variant, 853 + i * 5) * 2.2) * s;
    ctx.strokeStyle = i % 2 ? rgbOf(hi) : rgbOf(stem);
    ctx.lineWidth = Math.max(0.8, (0.86 + detailUnit(variant, 863 + i * 7) * 0.34) * s);
    ctx.beginPath();
    ctx.moveTo(x, 2.4 * s);
    ctx.quadraticCurveTo(x + wind * 0.2, -1.2 * s, tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = rgbOf(i % 2 ? hi : mixRgb(stem, mats.high, 0.35));
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, (0.55 + detailUnit(variant, 877 + i) * 0.35) * s, 1.15 * s, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  paintDabs(ctx, s, variant, mixRgb(mats.patchA, mats.dark, 0.2), 2, 4.6, 1.4, 0.42, 0.18);
}

export function drawCinder(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const ember = mixRgb(mats.ore, mats.high, 0.22);
  const glow = mixRgb(ember, mats.light, 0.24);
  const ash = mixRgb(mats.dark, mats.blocked, 0.3);
  const lean = detailSigned(variant, 887, 0.55);
  paintLayeredShadow(ctx, s, 4.6, 1.7, 2.5, mats.dark);
  ctx.fillStyle = rgbOf(ash);
  ctx.beginPath();
  ctx.ellipse(lean * s, 0.55 * s, 4.2 * s, 2.2 * s, detailSigned(variant, 893, 0.25), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbOf(mixRgb(ash, mats.mid, 0.25));
  fillPoly(ctx, [
    (-2.4 + lean) * s, 0.4 * s,
    (-0.5 + lean) * s, -1.2 * s,
    (0.8 + lean) * s, -1.7 * s,
    2.8 * s, 0.8 * s,
    -0.4 * s, 1.6 * s,
  ]);
  if (variant % 3 !== 0) {
    withAlpha(ctx, 0.28, () => {
      ctx.fillStyle = rgbOf(glow);
      ctx.beginPath();
      ctx.ellipse(0.2 * s, -0.1 * s, 2.3 * s, 1.35 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    withAlpha(ctx, 0.62, () => {
      ctx.fillStyle = rgbOf(ember);
      ctx.beginPath();
      ctx.ellipse(0.45 * s, -0.25 * s, 1.35 * s, 0.85 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  paintDabs(ctx, s, variant, mixRgb(mats.patchB, mats.ore, 0.22), 2, 2.7, 0.9, 0.42, 0.26);
}

export function drawIceChip(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const ice = mixRgb(mats.light, mats.high, 0.28);
  const edge = mixRgb(mats.dark, mats.high, 0.35);
  const facet = mixRgb(ice, mats.high, 0.28);
  const lean = detailSigned(variant, 907, 0.7);
  paintLayeredShadow(ctx, s, 5.2, 1.9, 2.6, mats.dark);
  ctx.fillStyle = rgbOf(edge);
  fillPoly(ctx, [
    (-5.0 + lean) * s, 1.3 * s,
    (-2.1 + lean) * s, -3.4 * s,
    (-1.4 + lean) * s, -4.4 * s,
    (0.8 + lean) * s, -4.0 * s,
    3.2 * s, -3.2 * s,
    5.2 * s, -0.4 * s,
    2.2 * s, 2.9 * s,
  ]);
  ctx.fillStyle = rgbOf(ice);
  fillPoly(ctx, [
    (-2.6 + lean * 0.6) * s, 0.4 * s,
    (-0.5 + lean * 0.6) * s, -3.4 * s,
    (0.6 + lean * 0.5) * s, -3.0 * s,
    2.4 * s, -2.2 * s,
    3.4 * s, -0.2 * s,
    1.0 * s, 1.7 * s,
  ]);
  ctx.fillStyle = rgbOf(facet);
  fillPoly(ctx, [
    -0.8 * s, -0.4 * s,
    0.4 * s, -2.6 * s,
    2.0 * s, -1.2 * s,
  ]);
  if (variant % 2 === 0) {
    withAlpha(ctx, 0.34, () => {
      ctx.strokeStyle = rgbOf(mixRgb(mats.light, mats.high, 0.24));
      ctx.lineWidth = Math.max(0.5, 0.55 * s);
      ctx.beginPath();
      ctx.moveTo(-0.3 * s, -1.8 * s);
      ctx.lineTo(1.6 * s, 0.5 * s);
      ctx.stroke();
    });
  }
  paintDabs(ctx, s, variant, mixRgb(mats.patchB, mats.high, 0.24), 3, 3.8, 1.5, 0.45, 0.22);
  paintCrack(ctx, s, variant, mixRgb(mats.dark, mats.high, 0.28), -1.7, -1.7, 2.6, 0.3);
}

function drawLowMineralLandmark(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  biome: BiomeName,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const cool = biome === "tundra grid";
  const edge = mixRgb(mats.dark, mats.blocked, 0.24);
  const body = mixRgb(mats.mid, cool ? mats.high : mats.patchA, cool ? 0.32 : 0.28);
  const facet = mixRgb(mats.high, mats.light, cool ? 0.34 : 0.24);
  const stain = mixRgb(mats.patchB, mats.ore, cool ? 0.2 : 0.34);
  const profile = detailHash(variant, 1181) % 4;
  const pieces = profile === 0
    ? [[-8, -1.0, 6.5, 2.4], [0, -2.8, 8.0, 3.0], [8, -0.8, 5.4, 2.0]]
    : profile === 1
      ? [[-7, -1.4, 5.4, 2.1], [1, -2.2, 7.2, 2.6], [8, -1.2, 4.5, 1.8]]
      : profile === 2
        ? [[-8, -0.8, 5.5, 2.0], [-1, -3.1, 6.0, 2.8], [6.5, -1.0, 6.4, 2.2]]
        : [[-9, -1.0, 4.8, 1.8], [-3, -2.8, 5.8, 2.5], [4, -2.0, 6.6, 2.4], [9, -0.6, 3.8, 1.6]];
  for (let i = 0; i < pieces.length; i++) {
    const [x, y, rx, ry] = pieces[i]!;
    const jitterX = detailSigned(variant, 1187 + i * 7, 0.8);
    const jitterY = detailSigned(variant, 1193 + i * 11, 0.45);
    const localX = (x + jitterX) * s;
    const localY = (y + jitterY) * s;
    const localRx = (rx * (0.9 + detailUnit(variant, 1199 + i * 13) * 0.18)) * s;
    const localRy = (ry * (0.9 + detailUnit(variant, 1207 + i * 17) * 0.16)) * s;
    ctx.fillStyle = rgbOf(edge);
    ctx.beginPath();
    ctx.ellipse(localX, localY + 0.8 * s, localRx * 1.12, localRy * 0.9, detailSigned(variant, 1213 + i * 19, 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgbOf(i % 3 === 0 ? body : facet);
    ctx.beginPath();
    ctx.ellipse(localX + detailSigned(variant, 1219 + i * 23, 0.35) * s, localY, localRx, localRy, detailSigned(variant, 1223 + i * 29, 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgbOf(stain);
    ctx.beginPath();
    ctx.ellipse(localX - localRx * 0.16, localY + localRy * 0.2, localRx * 0.34, localRy * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  withAlpha(ctx, 0.46, () => {
    ctx.strokeStyle = rgbOf(mixRgb(mats.light, facet, 0.35));
    ctx.lineWidth = Math.max(0.55, 0.62 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8.5 * s, -1.4 * s);
    ctx.quadraticCurveTo(-2.0 * s, -4.4 * s, 4.6 * s, -2.5 * s);
    ctx.quadraticCurveTo(7.0 * s, -1.8 * s, 9.2 * s, -0.8 * s);
    ctx.stroke();
  });
  paintDabs(ctx, s, variant, stain, 4, 8.0, 1.6, 0.5, 0.22);
}

export function drawLandmark(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  biome: BiomeName,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  shadow(ctx, s, 12.5, 3.4, 4.5, mats.dark);
  const lean = ((variant % 5) - 2) * 0.7 * s;
  if (biome === "jungle wreckage" || biome === "salt marshes") {
    const stem = rgbOf(mixRgb(mats.dark, mats.blocked, 0.24));
    const leaf = rgbOf(mixRgb(mats.high, mats.light, biome === "jungle wreckage" ? 0.28 : 0.42));
    ctx.strokeStyle = stem;
    ctx.lineWidth = Math.max(1, 1.7 * s);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-3 * s, 3 * s);
    ctx.quadraticCurveTo(lean * 0.35, -6 * s, lean, -13 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(3 * s, 3 * s);
    ctx.quadraticCurveTo(-lean * 0.25, -5 * s, -lean * 0.75, -10 * s);
    ctx.stroke();
    ctx.fillStyle = leaf;
    for (const [x, y, rx, ry] of [[-8, -8, 6.5, 3.5], [5, -11, 7, 3.8], [0, -16, 5.5, 3.2]] as const) {
      ctx.beginPath();
      ctx.ellipse((x + lean * 0.18) * s, y * s, rx * s, ry * s, -0.16, 0, Math.PI * 2);
      ctx.fill();
    }
    withAlpha(ctx, 0.34, () => {
      ctx.fillStyle = rgbOf(mats.light);
      ctx.beginPath();
      ctx.ellipse((-2 + lean * 0.2) * s, -15 * s, 2.8 * s, 1.4 * s, -0.2, 0, Math.PI * 2);
      ctx.fill();
    });
    return;
  }
  if (biome === "crystal flats" || biome === "tundra grid" || biome === "glass desert") {
    drawLowMineralLandmark(ctx, mats, biome, z, scale, variant);
    return;
  }
  const body = rgbOf(mixRgb(mats.blocked, mats.dark, 0.12));
  const facet = rgbOf(mixRgb(mats.high, mats.light, 0.32));
  ctx.fillStyle = body;
  fillPoly(ctx, [-14 * s, 3 * s, -7 * s, -9 * s, 1 * s, -14 * s, 13 * s, -3 * s, 10 * s, 4 * s]);
  ctx.fillStyle = facet;
  fillPoly(ctx, [-7 * s, -8 * s, 1 * s, -14 * s, 6 * s, -4 * s, -1 * s, -2 * s]);
  ctx.strokeStyle = rgbOf(mixRgb(mats.ore, mats.light, 0.42));
  ctx.lineWidth = Math.max(0.65, 0.9 * s);
  ctx.beginPath();
  ctx.moveTo(-5 * s, -6 * s);
  ctx.lineTo(4 * s, -9 * s);
  ctx.stroke();
}
