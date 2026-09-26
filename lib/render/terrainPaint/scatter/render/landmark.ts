import type { BiomeName } from "../../../../types";
import type { BiomeMaterials } from "../../../terrainMaterials";
import { fillPoly, mixRgb, rgbOf, withAlpha } from "../../style";
import { detailHash, detailSigned, detailUnit, paintDabs, shadow } from "./primitives";

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
