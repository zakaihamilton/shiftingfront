import type { BiomeMaterials } from "../../../terrainMaterials";
import { fillPoly, mixRgb, rgbOf } from "../../style";
import { detailSigned, detailUnit, paintCrack, paintDabs, paintLayeredShadow } from "./primitives";

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
