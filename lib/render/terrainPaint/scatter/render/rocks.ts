import type { BiomeMaterials } from "../../../terrainMaterials";
import { fillPoly, mixRgb, rgbOf, withAlpha } from "../../style";
import { detailHash, detailSigned, detailUnit, paintCrack, paintDabs, paintLayeredShadow } from "./primitives";

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
