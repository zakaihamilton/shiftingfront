import type { BiomeName } from "../../../types";
import type { BiomeMaterials } from "../../terrainMaterials";
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
  withAlpha(ctx, 0.18, () => {
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
  if (tone) withAlpha(ctx, 0.24, paint);
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
  const profile = detailUnit(variant, 17);
  const body = mixRgb(mats.dark, mats.light, 0.24 + profile * 0.14);
  const facet = mixRgb(mats.mid, mats.dark, 0.18 + profile * 0.18);
  const hi = mixRgb(mats.light, mats.mid, 0.42 + profile * 0.16);
  paintLayeredShadow(ctx, s, 5.6, 2.05, 2.7, mats.dark);
  ctx.fillStyle = rgbOf(mats.dark);
  fillPoly(ctx, [
    (-5.6 + lean / s) * s, 1.4 * s,
    (-2.1 + lean / s) * s, 2.9 * s,
    (2.8 + lean / s) * s, 3.25 * s,
    5.2 * s, 1.5 * s,
    3.8 * s, 3.3 * s,
    -4.6 * s, 3.15 * s,
  ]);
  ctx.fillStyle = rgbOf(body);
  fillPoly(ctx, [
    (-5.7 + lean / s) * s, 0.7 * s,
    (-3.2 + lean / s) * s, -2.7 * s,
    (-1.0 + lean / s) * s, -4.4 * s,
    (1.6 + lean / s) * s, (-4.0 - profile) * s,
    4.8 * s, (-1.2 + profile * 0.7) * s,
    5.35 * s, 1.9 * s,
    2.4 * s, 2.8 * s,
    -4.2 * s, 2.65 * s,
  ]);
  ctx.fillStyle = rgbOf(facet);
  fillPoly(ctx, [
    (-2.8 + lean / s) * s, 0.2 * s,
    (-0.8 + lean / s) * s, -3.55 * s,
    (1.2 + lean / s) * s, (-3.4 - profile * 0.3) * s,
    4.35 * s, -1.05 * s,
    3.1 * s, 1.5 * s,
  ]);
  withAlpha(ctx, 0.36, () => {
    ctx.fillStyle = rgbOf(hi);
    ctx.beginPath();
    ctx.ellipse((-0.8 + detailSigned(variant, 23, 0.8)) * s, (-1.6 + detailSigned(variant, 29, 0.45)) * s, 2.0 * s, 0.9 * s, -0.45, 0, Math.PI * 2);
    ctx.fill();
  });
  paintDabs(ctx, s, variant, mixRgb(mats.patchA, mats.dark, 0.4), 2, 3.2, 1.7, 0.72, 0.18);
  paintCrack(ctx, s, variant, mixRgb(mats.dark, mats.blocked, 0.28), -2.1, -2.1, 3.6, 0.42);
  ctx.strokeStyle = rgbOf(mixRgb(mats.light, body, 0.6));
  ctx.lineWidth = Math.max(0.45, 0.5 * s);
  ctx.beginPath();
  ctx.moveTo(-1.8 * s, -2.4 * s);
  ctx.lineTo(2.2 * s, -0.6 * s);
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
  const profile = (variant >>> 5) % 3;
  const lean = detailSigned(variant, 101, 1.1) * s;
  const dark = mixRgb(mats.dark, mats.blocked, 0.28);
  const body = mixRgb(mats.blocked, mats.mid, 0.28 + detailUnit(variant, 107) * 0.14);
  const facet = mixRgb(mats.mid, mats.light, 0.22 + detailUnit(variant, 113) * 0.14);
  const edge = mixRgb(mats.light, mats.high, 0.16 + detailUnit(variant, 127) * 0.12);
  paintLayeredShadow(ctx, s, 8.1, 2.2, 2.8, mats.dark);
  ctx.fillStyle = rgbOf(dark);
  fillPoly(ctx, [-8.2 * s, 2.5 * s, 6.8 * s, 2.8 * s, 8 * s, 0.8 * s, -6.9 * s, 0.5 * s]);
  ctx.fillStyle = rgbOf(body);
  if (profile === 0) {
    fillPoly(ctx, [
      -8.2 * s + lean, 0.8 * s,
      -4.3 * s + lean, -4.6 * s,
      2.8 * s + lean * 0.35, -3.2 * s,
      7.4 * s, -0.7 * s,
      5.7 * s, 2.1 * s,
      -6.4 * s, 1.9 * s,
    ]);
  } else if (profile === 1) {
    fillPoly(ctx, [
      -7.2 * s + lean, 1.3 * s,
      -3.8 * s + lean, -5.2 * s,
      5.8 * s + lean * 0.25, -4.2 * s,
      7.8 * s, 0.2 * s,
      3.9 * s, 2.1 * s,
      -6.8 * s, 2.2 * s,
    ]);
  } else {
    fillPoly(ctx, [
      -8.6 * s + lean, 1.4 * s,
      -1.4 * s + lean, -5.5 * s,
      7.2 * s + lean * 0.15, -2.5 * s,
      6.2 * s, 2.3 * s,
      -5.7 * s, 2.1 * s,
    ]);
  }
  ctx.fillStyle = rgbOf(facet);
  fillPoly(ctx, [
    (-3.6 + (profile === 2 ? 1.4 : 0)) * s,
    -3.8 * s,
    (1.4 + lean / s * 0.2) * s,
    -3.2 * s,
    4.8 * s,
    -0.6 * s,
    0.8 * s,
    0.8 * s,
  ]);
  withAlpha(ctx, 0.42, () => {
    ctx.fillStyle = rgbOf(edge);
    ctx.beginPath();
    ctx.ellipse((-1.5 + (variant % 3)) * s, -2.1 * s, 2.8 * s, 0.7 * s, -0.15, 0, Math.PI * 2);
    ctx.fill();
  });
  paintDabs(ctx, s, variant, mixRgb(mats.patchA, mats.dark, 0.35), 4, 5.8, 2.2, 0.8, 0.2);
  paintCrack(ctx, s, variant, mixRgb(mats.dark, mats.blocked, 0.2), -4.9, -1.6, 4.2, 0.44);
  paintCrack(ctx, s, variant + 17, mixRgb(mats.dark, mats.light, 0.24), 0.6, -2.8, 3.2, 0.3);
  ctx.strokeStyle = rgbOf(mixRgb(mats.dark, mats.light, 0.4));
  ctx.lineWidth = Math.max(0.55, 0.65 * s);
  ctx.beginPath();
  ctx.moveTo((-5.4 + profile) * s, -1.9 * s);
  ctx.lineTo((1.6 + profile * 1.4) * s, -2.8 * s);
  ctx.lineTo((5.2 + lean / s) * s, -0.6 * s);
  ctx.stroke();
}

export function drawSandShard(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const count = 1 + ((variant >>> 4) % 3);
  const edge = mixRgb(mats.dark, mats.mid, 0.34);
  const shard = mixRgb(mats.mid, mats.light, 0.46 + detailUnit(variant, 141) * 0.16);
  const face = mixRgb(mats.mid, mats.high, 0.48 + detailUnit(variant, 149) * 0.12);
  const hi = mixRgb(mats.light, mats.high, 0.38);
  paintLayeredShadow(ctx, s, 6.8 + count, 2.15, 2.7, mats.dark);
  for (let i = 0; i < count; i++) {
    const t = i - (count - 1) / 2;
    const x = t * (4.0 + detailUnit(variant, 157 + i) * 1.2) + detailSigned(variant, 163 + i * 7, 1.2);
    const height = 6.2 + detailUnit(variant, 179 + i * 11) * 8.4;
    const half = 1.55 + detailUnit(variant, 191 + i * 13) * 1.3;
    const lean = detailSigned(variant, 211 + i * 17, 1.5);
    const shoulder = 0.55 + detailUnit(variant, 223 + i * 19) * 0.35;
    const chip = detailUnit(variant, 239 + i * 23) > 0.58 ? 0.7 : 0;
    ctx.fillStyle = rgbOf(edge);
    fillPoly(ctx, [
      (x - half - 1.0) * s, 2.3 * s,
      (x - half * shoulder) * s, -height * 0.42 * s,
      (x + lean - chip) * s, (-height - 1.35) * s,
      (x + lean + chip * 0.45) * s, (-height + 0.3) * s,
      (x + half * shoulder) * s, -height * 0.38 * s,
      (x + half + 1.0) * s, 2.3 * s,
    ]);
    ctx.fillStyle = rgbOf(i % 2 === 0 ? shard : face);
    fillPoly(ctx, [
      (x - half * 0.52) * s, 1.8 * s,
      (x - half * 0.34 + lean * 0.2) * s, -height * 0.35 * s,
      (x + lean * 0.78 - chip * 0.55) * s, (-height + 0.55) * s,
      (x + half * 0.28 + lean * 0.12) * s, -height * 0.22 * s,
      (x + half * 0.52) * s, 1.8 * s,
    ]);
    ctx.fillStyle = rgbOf(mixRgb(face, mats.dark, 0.28));
    fillPoly(ctx, [
      (x + lean * 0.78 - chip * 0.55) * s, (-height + 0.55) * s,
      (x + half * 0.28 + lean * 0.12) * s, -height * 0.22 * s,
      (x + half * 0.52) * s, 1.8 * s,
      (x + half * 0.15) * s, 1.5 * s,
    ]);
    withAlpha(ctx, 0.42, () => {
      ctx.strokeStyle = rgbOf(hi);
      ctx.lineWidth = Math.max(0.45, 0.5 * s);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo((x - half * 0.2 + lean * 0.15) * s, 0.9 * s);
      ctx.quadraticCurveTo((x - half * 0.12 + lean * 0.35) * s, (-height * 0.35) * s, (x + lean * 0.72) * s, (-height + 1.4) * s);
      ctx.stroke();
    });
    paintDabs(ctx, s, variant + i * 31, mixRgb(mats.patchA, face, 0.42), 2, half * 0.42, height * 0.22, 0.42, 0.2);
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
  if (biome === "crystal flats" || biome === "tundra grid") {
    const gem = rgbOf(mixRgb(mats.ore, mats.light, biome === "tundra grid" ? 0.54 : 0.42));
    const edge = rgbOf(mixRgb(mats.dark, mats.high, 0.3));
    ctx.fillStyle = edge;
    fillPoly(ctx, [-12 * s, 3 * s, -5 * s, -15 * s, 0, 1 * s, 7 * s, -19 * s, 12 * s, 3 * s]);
    ctx.fillStyle = gem;
    fillPoly(ctx, [-7 * s, 2 * s, -4 * s, -12 * s, 0, 1 * s, 6 * s, -16 * s, 8 * s, 2 * s]);
    withAlpha(ctx, 0.44, () => {
      ctx.fillStyle = rgbOf(mats.light);
      fillPoly(ctx, [-3 * s, 0, -2 * s, -9 * s, 0, -1 * s]);
    });
    return;
  }
  if (biome === "glass desert") {
    const profile = (variant >>> 4) % 4;
    const jitter = ((variant >>> 8) % 5) - 2;
    const edge = mixRgb(mats.dark, mats.mid, 0.34);
    const body = mixRgb(mats.high, mats.light, 0.36);
    const face = mixRgb(mats.high, mats.mid, 0.28);
    const highlight = mixRgb(mats.light, mats.high, 0.34);
    const drawShard = (x: number, height: number, half: number, lean: number, tone: number): void => {
      const base = 3.2;
      const local = variant + tone * 31 + Math.round(x * 7);
      const shoulder = 0.52 + detailUnit(local, 941) * 0.3;
      const chip = detailUnit(local, 947) > 0.58 ? 0.9 : 0;
      ctx.fillStyle = rgbOf(edge);
      fillPoly(ctx, [
        (x - half - 1.5) * s, base * s,
        (x - half * shoulder) * s, (-height * 0.38) * s,
        (x + lean - chip) * s, (-height - 1.6) * s,
        (x + lean + chip * 0.4) * s, (-height + 0.2) * s,
        (x + half * shoulder) * s, (-height * 0.34) * s,
        (x + half + 1.5) * s, base * s,
      ]);
      ctx.fillStyle = rgbOf(tone % 2 === 0 ? body : face);
      fillPoly(ctx, [
        (x - half * 0.48) * s, (base - 0.7) * s,
        (x - half * 0.28 + lean * 0.22) * s, (-height * 0.34) * s,
        (x + lean * 0.78 - chip * 0.55) * s, (-height + 0.4) * s,
        (x + half * 0.26 + lean * 0.14) * s, (-height * 0.2) * s,
        (x + half * 0.48) * s, (base - 0.7) * s,
      ]);
      ctx.fillStyle = rgbOf(mixRgb(face, mats.dark, 0.24));
      fillPoly(ctx, [
        (x + lean * 0.78 - chip * 0.55) * s, (-height + 0.4) * s,
        (x + half * 0.26 + lean * 0.14) * s, (-height * 0.2) * s,
        (x + half * 0.48) * s, (base - 0.7) * s,
        (x + half * 0.1) * s, (base - 0.8) * s,
      ]);
      withAlpha(ctx, 0.3, () => {
        ctx.strokeStyle = rgbOf(highlight);
        ctx.lineWidth = Math.max(0.5, 0.62 * s);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo((x - half * 0.2 + lean * 0.12) * s, (base - 0.9) * s);
        ctx.quadraticCurveTo((x - half * 0.1 + lean * 0.38) * s, (-height * 0.4) * s, (x + lean * 0.7) * s, (-height + 1.7) * s);
        ctx.stroke();
      });
      paintDabs(ctx, s, local, mixRgb(mats.patchA, face, 0.28), 2, half * 0.42, height * 0.2, 0.38, 0.2);
    };
    if (profile === 0) {
      drawShard(-7 + jitter * 0.4, 14 + jitter, 5.2, -1.4, 0);
      drawShard(5 + jitter * 0.25, 18 - jitter * 0.4, 6.4, 2.2, 1);
    } else if (profile === 1) {
      drawShard(-1 + jitter * 0.2, 22 - jitter * 0.35, 7.4, -2.5, 1);
      drawShard(8 + jitter * 0.4, 10 + jitter, 4.4, 1.8, 0);
    } else if (profile === 2) {
      drawShard(-10 + jitter * 0.2, 13 + jitter * 0.4, 4.6, -3.4, 0);
      drawShard(-1 + jitter * 0.25, 18 - jitter * 0.3, 5.8, 0.4, 1);
      drawShard(9 + jitter * 0.2, 15 + jitter * 0.25, 4.8, 2.8, 0);
    } else {
      drawShard(-9 + jitter * 0.3, 10 + jitter * 0.2, 5.2, 1.2, 0);
      drawShard(0 + jitter * 0.25, 16 - jitter * 0.25, 7.2, -2.1, 1);
      drawShard(9 + jitter * 0.3, 8 + jitter * 0.3, 4.2, 2.4, 0);
      ctx.strokeStyle = rgbOf(mixRgb(mats.dark, mats.high, 0.42));
      ctx.lineWidth = Math.max(0.55, 0.65 * s);
      ctx.beginPath();
      ctx.moveTo(-11 * s, -1.2 * s);
      ctx.lineTo(10 * s, 0.8 * s);
      ctx.stroke();
    }
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
