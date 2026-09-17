import type { BiomeName } from "../../../types";
import type { BiomeMaterials } from "../../terrainMaterials";
import { fillPoly, mixRgb, rgbOf, withAlpha } from "../style";

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
  const lean = ((variant % 5) - 2) * 0.32 * s;
  const body = mixRgb(mats.dark, mats.light, 0.3);
  const facet = mixRgb(mats.mid, mats.dark, 0.28);
  const hi = mixRgb(mats.light, mats.mid, 0.52);
  shadow(ctx, s, 5.4, 2.0, 2.6, mats.dark);
  ctx.fillStyle = rgbOf(mats.dark);
  fillPoly(ctx, [
    -5.2 * s + lean, 1.4 * s,
    4.8 * s + lean, 1.6 * s,
    4.2 * s, 3.2 * s,
    -4.4 * s, 3.1 * s,
  ]);
  ctx.fillStyle = rgbOf(body);
  fillPoly(ctx, [
    -5.6 * s + lean, 0.8 * s,
    -2.4 * s + lean * 0.4, -3.6 * s,
    1.2 * s, -4.4 * s,
    5.0 * s + lean, -1.4 * s,
    5.4 * s, 2.4 * s,
    -4.2 * s, 2.9 * s,
  ]);
  ctx.fillStyle = rgbOf(facet);
  fillPoly(ctx, [
    -2.2 * s, 0.4 * s,
    1.0 * s, -4.0 * s,
    4.6 * s + lean, -1.2 * s,
    3.4 * s, 1.6 * s,
  ]);
  withAlpha(ctx, 0.36, () => {
    ctx.fillStyle = rgbOf(hi);
    ctx.beginPath();
    ctx.ellipse(-0.4 * s, -1.6 * s, 2.0 * s, 1.05 * s, -0.45, 0, Math.PI * 2);
    ctx.fill();
  });
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
    ctx.translate(((i * 37 + variant) % 11 - 5) * z * 0.62, ((i * 19 + variant) % 7 - 3) * z * 0.24);
    drawPebble(ctx, mats, z, scale * (sizes[i] ?? 0.5), variant + i * 13);
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
  const lean = ((variant % 7) - 3) * 0.28 * s;
  const dark = mixRgb(mats.dark, mats.blocked, 0.28);
  const body = mixRgb(mats.blocked, mats.mid, 0.34);
  const facet = mixRgb(mats.mid, mats.light, 0.28);
  const edge = mixRgb(mats.light, mats.high, 0.2);
  shadow(ctx, s, 7.8, 2.1, 2.7, mats.dark);
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
  const edge = mixRgb(mats.dark, mats.blocked, 0.18);
  const shard = mixRgb(mats.light, mats.high, 0.18);
  const face = mixRgb(shard, mats.ore, 0.12);
  const hi = mixRgb(mats.light, shard, 0.22);
  shadow(ctx, s, 6.2 + count, 2.0, 2.6, mats.dark);
  for (let i = 0; i < count; i++) {
    const t = i - (count - 1) / 2;
    const x = t * 4.1 + ((variant >>> (i * 3)) % 3 - 1) * 0.7;
    const height = 6.5 + ((variant >>> (i * 5 + 2)) % 8);
    const half = 1.7 + ((variant >>> (i * 4 + 1)) % 4) * 0.35;
    const lean = ((variant >>> (i * 2 + 1)) % 5 - 2) * 0.55;
    ctx.fillStyle = rgbOf(edge);
    fillPoly(ctx, [
      (x - half - 1.2) * s, 2.2 * s,
      (x + lean) * s, (-height - 1.4) * s,
      (x + half + 1.2) * s, 2.2 * s,
    ]);
    ctx.fillStyle = rgbOf(i % 2 === 0 ? shard : face);
    fillPoly(ctx, [
      (x - half * 0.46) * s, 1.8 * s,
      (x + lean * 0.78) * s, (-height + 0.4) * s,
      (x + half * 0.46) * s, 1.8 * s,
    ]);
    withAlpha(ctx, 0.42, () => {
      ctx.strokeStyle = rgbOf(hi);
      ctx.lineWidth = Math.max(0.5, 0.62 * s);
      ctx.beginPath();
      ctx.moveTo((x - half * 0.18) * s, 0.8 * s);
      ctx.lineTo((x + lean * 0.72) * s, (-height + 1.4) * s);
      ctx.stroke();
    });
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
  shadow(ctx, s, 6.5, 1.8, 2.5, mats.dark);
  ctx.lineCap = "round";
  for (let i = 0; i < stems; i++) {
    const t = i - (stems - 1) / 2;
    const x = t * 2.2 * s;
    const lean = ((variant >>> (i * 3)) % 5 - 2) * 0.65 * s;
    const tipY = -(5.2 + ((variant >>> (i + 6)) % 4) * 0.9) * s;
    ctx.strokeStyle = rgbOf(i % 2 === 0 ? stem : twig);
    ctx.lineWidth = Math.max(0.7, 0.95 * s);
    ctx.beginPath();
    ctx.moveTo(x, 2.2 * s);
    ctx.quadraticCurveTo(x + lean * 0.35, -1.6 * s, x + lean, tipY);
    ctx.stroke();
    if (i % 2 === (variant % 2)) {
      ctx.fillStyle = rgbOf(dust);
      ctx.beginPath();
      ctx.ellipse(x + lean * 0.72, tipY + 0.7 * s, 1.35 * s, 0.7 * s, lean * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }
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
  shadow(ctx, s, 5.6, 1.8, 2.4, mats.dark);
  for (let i = 0; i < count; i++) {
    const x = (i - (count - 1) / 2) * 3.5 + ((variant >>> (i + 2)) % 3 - 1) * 0.5;
    const rise = 2.4 + ((variant >>> (i * 4 + 1)) % 5) * 0.65;
    const lean = ((variant >>> (i * 3 + 2)) % 5 - 2) * 0.45;
    ctx.fillStyle = rgbOf(dark);
    fillPoly(ctx, [(x - 2.1) * s, 1.8 * s, (x + lean) * s, -rise * s, (x + 2.2) * s, 1.8 * s]);
    ctx.fillStyle = rgbOf(i % 2 ? gem : hi);
    fillPoly(ctx, [(x - 0.8) * s, 1.1 * s, (x + lean * 0.6) * s, (-rise + 0.45) * s, (x + 0.8) * s, 1.1 * s]);
  }
}

export function drawTuft(
  ctx: CanvasRenderingContext2D,
  mats: BiomeMaterials,
  z: number,
  scale: number,
  variant: number,
): void {
  const s = z * scale;
  const blades = 5 + (variant % 3);
  const stem = mixRgb(mats.dark, mats.blocked, 0.15);
  const tip = mixRgb(mats.light, mats.high, 0.45);
  const wind = ((variant % 5) - 2) * 0.55 * s;
  shadow(ctx, s, 5.6, 1.8, 2.4, mats.dark);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 0; i < blades; i++) {
    const t = i - (blades - 1) / 2;
    const lean = t * 1.55 * s + ((variant >>> i) % 3 - 1) * 0.4 * s + wind * 0.35;
    const rise = 5.4 * s + (i % 3) * 0.85 * s;
    ctx.strokeStyle = i % 3 === 1 ? rgbOf(tip) : rgbOf(stem);
    ctx.lineWidth = Math.max(0.75, (1.25 - Math.abs(t) * 0.12) * s);
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
  const lobes = 4 + (variant % 2);
  shadow(ctx, s, 6.2, 2.0, 2.5, mats.dark);
  ctx.strokeStyle = rgbOf(mixRgb(mats.dark, mats.blocked, 0.52));
  ctx.lineWidth = Math.max(0.9, 1.2 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, 2.2 * s);
  ctx.lineTo(((variant % 3) - 1) * 0.35 * s, -2.4 * s);
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
    ctx.ellipse(lobe.x * s, lobe.y * s, lobe.rx * s, lobe.ry * s, lobe.rot, 0, Math.PI * 2);
    ctx.fill();
  }
  withAlpha(ctx, 0.32, () => {
    ctx.fillStyle = rgbOf(hi);
    ctx.beginPath();
    ctx.ellipse(0.4 * s, -4.6 * s, 2.1 * s, 1.3 * s, -0.25, 0, Math.PI * 2);
    ctx.fill();
  });
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
  shadow(ctx, s, 6.8, 2.1, 2.6, mats.dark);
  ctx.fillStyle = rgbOf(iron);
  fillPoly(ctx, [
    -6.8 * s, 1.0 * s,
    2.2 * s, -2.4 * s,
    6.8 * s, 0.6 * s,
    5.4 * s, 3.2 * s,
    -5.2 * s, 3.4 * s,
  ]);
  ctx.fillStyle = rgbOf(rust);
  fillPoly(ctx, [
    -3.2 * s, -0.2 * s,
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
    ctx.ellipse((-3 + i * 2.4) * s, (0.4 + (i % 2) * 0.5) * s, 0.45 * s, 0.35 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
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
  const lean = ((variant % 5) - 2) * 0.5 * s;
  shadow(ctx, s, 4.2, 1.6, 2.4, mats.dark);
  ctx.fillStyle = rgbOf(dark);
  fillPoly(ctx, [-3.0 * s, 2.0 * s, lean - 0.4 * s, -5.0 * s, 3.2 * s, 1.7 * s]);
  ctx.fillStyle = rgbOf(gem);
  fillPoly(ctx, [-0.8 * s, 1.0 * s, lean * 0.65, -4.4 * s, 2.0 * s, 0.7 * s]);
  withAlpha(ctx, 0.4, () => {
    ctx.fillStyle = rgbOf(inner);
    fillPoly(ctx, [-0.15 * s, 0.2 * s, lean * 0.4, -3.6 * s, 1.05 * s, 0.15 * s]);
  });
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
  const wind = ((variant % 5) - 2) * 0.4 * s;
  shadow(ctx, s, 5.8, 1.8, 2.4, mats.dark);
  ctx.lineCap = "round";
  const n = 5 + (variant % 2);
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * 2.05 * s;
    const tipX = x + ((variant >>> i) % 3 - 1) * 0.7 * s + wind * 0.4;
    const tipY = -5.4 * s - (i % 2) * 1.15 * s;
    ctx.strokeStyle = i % 2 ? rgbOf(hi) : rgbOf(stem);
    ctx.lineWidth = Math.max(0.8, 1.05 * s);
    ctx.beginPath();
    ctx.moveTo(x, 2.4 * s);
    ctx.quadraticCurveTo(x + wind * 0.2, -1.2 * s, tipX, tipY);
    ctx.stroke();
    ctx.fillStyle = rgbOf(i % 2 ? hi : mixRgb(stem, mats.high, 0.35));
    ctx.beginPath();
    ctx.ellipse(tipX, tipY, 0.7 * s, 1.15 * s, 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
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
  shadow(ctx, s, 4.4, 1.6, 2.4, mats.dark);
  ctx.fillStyle = rgbOf(ash);
  ctx.beginPath();
  ctx.ellipse(0, 0.55 * s, 4.2 * s, 2.2 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rgbOf(mixRgb(ash, mats.mid, 0.25));
  fillPoly(ctx, [-2.4 * s, 0.4 * s, 0.6 * s, -1.6 * s, 2.8 * s, 0.8 * s, -0.4 * s, 1.6 * s]);
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
  shadow(ctx, s, 5.0, 1.8, 2.5, mats.dark);
  ctx.fillStyle = rgbOf(edge);
  fillPoly(ctx, [
    -5.0 * s, 1.3 * s,
    -1.4 * s, -4.4 * s,
    3.2 * s, -3.2 * s,
    5.2 * s, -0.4 * s,
    2.2 * s, 2.9 * s,
  ]);
  ctx.fillStyle = rgbOf(ice);
  fillPoly(ctx, [
    -2.6 * s, 0.4 * s,
    -0.5 * s, -3.4 * s,
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
    const edge = mixRgb(mats.dark, mats.blocked, 0.2);
    const body = mixRgb(mats.high, mats.light, 0.24);
    const face = mixRgb(body, mats.ore, 0.12);
    const highlight = mixRgb(mats.light, body, 0.16);
    const drawShard = (x: number, height: number, half: number, lean: number, tone: number): void => {
      const base = 3.2;
      ctx.fillStyle = rgbOf(edge);
      fillPoly(ctx, [
        (x - half - 1.5) * s, base * s,
        (x + lean) * s, (-height - 1.6) * s,
        (x + half + 1.5) * s, base * s,
      ]);
      ctx.fillStyle = rgbOf(tone % 2 === 0 ? body : face);
      fillPoly(ctx, [
        (x - half * 0.48) * s, (base - 0.7) * s,
        (x + lean * 0.78) * s, (-height + 0.4) * s,
        (x + half * 0.48) * s, (base - 0.7) * s,
      ]);
      withAlpha(ctx, 0.46, () => {
        ctx.strokeStyle = rgbOf(highlight);
        ctx.lineWidth = Math.max(0.65, 0.82 * s);
        ctx.beginPath();
        ctx.moveTo((x - half * 0.2) * s, (base - 0.9) * s);
        ctx.lineTo((x + lean * 0.7) * s, (-height + 1.7) * s);
        ctx.stroke();
      });
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
