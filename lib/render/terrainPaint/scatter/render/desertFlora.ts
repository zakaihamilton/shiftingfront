import type { BiomeMaterials, Rgb } from "../../../terrainMaterials";
import { fillPoly, mixRgb, rgbOf, withAlpha } from "../../style";
import { detailHash, detailSigned, detailUnit, paintDabs, paintLayeredShadow } from "./primitives";

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
