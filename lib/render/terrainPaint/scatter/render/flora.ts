import type { BiomeMaterials } from "../../../terrainMaterials";
import { mixRgb, rgbOf, withAlpha } from "../../style";
import { detailHash, detailSigned, detailUnit, paintDabs, paintLayeredShadow } from "./primitives";

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
