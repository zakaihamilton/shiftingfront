import { hash } from "./tilePalette";

export type ElevationFace = {
  points: number[];
  cracks: number[][];
};

export type ElevationFaceOptions = {
  tileX?: number;
  tileY?: number;
  chamferSouth?: number;
};

export type TileCliffGeometry = {
  south: ElevationFace | null;
  east: ElevationFace | null;
  wedge: number[] | null;
};

/** Samples along a cliff edge, inclusive of both endpoints. */
export const CLIFF_EDGE_SAMPLES = 5;
const CLIFF_CORNER_CHAMFER = 0.22;

function hash2(a: number, b: number, lane: number): number {
  return hash(a * 73856093 + b * 19349663 + lane * 83492791);
}

function unitSigned(a: number, b: number, lane: number): number {
  return (hash2(a, b, lane) / 4294967295) * 2 - 1;
}

function vertexOffset(vx: number, vy: number, scale: number): [number, number] {
  return [unitSigned(vx, vy, 1) * scale, unitSigned(vx, vy, 2) * scale * 1.2];
}

function faceOutward(side: "south" | "east", tw: number, th: number): [number, number] {
  const mx = side === "south" ? -tw / 4 : tw / 4;
  const my = th / 4;
  const len = Math.hypot(mx, my) || 1;
  return [mx / len, my / len];
}

function faceVertices(
  side: "south" | "east",
  tileX: number,
  tileY: number,
): { ax: number; ay: number; bx: number; by: number } {
  if (side === "south") return { ax: tileX, ay: tileY + 1, bx: tileX + 1, by: tileY + 1 };
  return { ax: tileX + 1, ay: tileY, bx: tileX + 1, by: tileY + 1 };
}

function nearSouthPoints(face: ElevationFace): { top: [number, number]; bot: [number, number] } {
  const topI = (CLIFF_EDGE_SAMPLES - 1) * 2;
  const botI = CLIFF_EDGE_SAMPLES * 2;
  return {
    top: [face.points[topI]!, face.points[topI + 1]!],
    bot: [face.points[botI]!, face.points[botI + 1]!],
  };
}

export function elevationFace(
  side: "south" | "east",
  dropSteps: number,
  tw: number,
  th: number,
  heightStep: number,
  seed: number,
  options: ElevationFaceOptions = {},
): ElevationFace {
  const tileX = options.tileX ?? 0;
  const tileY = options.tileY ?? 0;
  const chamfer = Math.max(0, Math.min(0.45, options.chamferSouth ?? 0));
  const hillside = dropSteps <= 1;
  const drop = dropSteps * heightStep * (hillside ? 0.8 : 1);
  const inset = hillside ? heightStep * 0.45 : heightStep * 0.08;
  const southTop: [number, number] = [0, th];
  const westTop: [number, number] = [-tw / 2, th / 2];
  const eastTop: [number, number] = [tw / 2, th / 2];
  const topA = side === "south" ? westTop : eastTop;
  const topB: [number, number] =
    chamfer > 0
      ? [
          topA[0] + (southTop[0] - topA[0]) * (1 - chamfer),
          topA[1] + (southTop[1] - topA[1]) * (1 - chamfer),
        ]
      : southTop;
  const verts = faceVertices(side, tileX, tileY);
  const jitterScale = heightStep * 0.14;
  const [adx, ady] = vertexOffset(verts.ax, verts.ay, jitterScale);
  const [bdx, bdy] = vertexOffset(verts.bx, verts.by, jitterScale);
  const [ox, oy] = faceOutward(side, tw, th);
  const samples = CLIFF_EDGE_SAMPLES;
  const tops: Array<[number, number]> = [];
  const bots: Array<[number, number]> = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const top: [number, number] = [
      topA[0] + (topB[0] - topA[0]) * t,
      topA[1] + (topB[1] - topA[1]) * t,
    ];
    const edge = i === 0 || i === samples - 1;
    const jx = adx + (bdx - adx) * t;
    const jy = ady + (bdy - ady) * t;
    const wave = Math.sin(t * Math.PI);
    const bulge = edge
      ? 0
      : wave * heightStep * (hillside ? 0.36 : 0.2) +
        unitSigned(tileX, tileY, seed + 20 + i + (side === "south" ? 0 : 40)) *
          heightStep *
          (hillside ? 0.14 : 0.1);
    const dropNudge = edge
      ? unitSigned(i === 0 ? verts.ax : verts.bx, i === 0 ? verts.ay : verts.by, 7) *
        heightStep *
        0.06
      : unitSigned(tileX, tileY, seed + 70 + i) * heightStep * (hillside ? 0.12 : 0.07);
    const along = -inset * (hillside ? 0.7 + wave * 0.5 : 1) + bulge;
    tops.push(top);
    bots.push([top[0] + ox * along + jx, top[1] + drop + dropNudge + oy * along * 0.55 + jy]);
  }
  const points: number[] = [];
  for (const top of tops) points.push(top[0], top[1]);
  for (let i = bots.length - 1; i >= 0; i--) points.push(bots[i]![0], bots[i]![1]);
  const cracks: number[][] = [];
  if (!hillside) {
    const mid = Math.floor((samples - 1) / 2);
    for (let i = 1; i < dropSteps; i++) {
      const t = i / dropSteps;
      const offset = unitSigned(tileX, tileY, seed + 50 + i) * heightStep * 0.08;
      const column = (index: number): [number, number] => [
        tops[index]![0] + (bots[index]![0] - tops[index]![0]) * t + offset,
        tops[index]![1] + (bots[index]![1] - tops[index]![1]) * t,
      ];
      const a = column(0);
      const m = column(mid);
      const b = column(samples - 1);
      cracks.push([a[0], a[1], m[0], m[1]]);
      cracks.push([m[0], m[1], b[0], b[1]]);
    }
    const fissures = 1 + (hash2(tileX, tileY, seed + 90) % 2);
    for (let f = 0; f < fissures; f++) {
      const col = 1 + (hash2(tileX, tileY, seed + 91 + f) % Math.max(1, samples - 2));
      const t0 = 0.18 + (hash2(tileX, tileY, seed + 110 + f) % 20) / 100;
      const t1 = Math.min(0.92, t0 + 0.42);
      const x0 = tops[col]![0] + (bots[col]![0] - tops[col]![0]) * t0;
      const y0 = tops[col]![1] + (bots[col]![1] - tops[col]![1]) * t0;
      const x1 = tops[col]![0] + (bots[col]![0] - tops[col]![0]) * t1;
      const y1 = tops[col]![1] + (bots[col]![1] - tops[col]![1]) * t1;
      cracks.push([x0, y0, x1, y1]);
    }
  }
  return { points, cracks };
}

function cornerWedgePoints(
  south: ElevationFace,
  east: ElevationFace,
  tw: number,
  th: number,
  heightStep: number,
  dropE: number,
  dropS: number,
  tileX: number,
  tileY: number,
): number[] {
  const s = nearSouthPoints(south);
  const e = nearSouthPoints(east);
  const southTop: [number, number] = [0, th];
  const maxDrop = Math.max(dropE, dropS);
  const hillside = maxDrop <= 1;
  const drop = maxDrop * heightStep * (hillside ? 0.8 : 1);
  const [osx, osy] = faceOutward("south", tw, th);
  const [oex, oey] = faceOutward("east", tw, th);
  let bx = osx + oex;
  let by = osy + oey;
  const len = Math.hypot(bx, by) || 1;
  bx /= len;
  by /= len;
  const [jx, jy] = vertexOffset(tileX + 1, tileY + 1, heightStep * 0.14);
  const out = heightStep * (hillside ? 0.22 : 0.32);
  const cornerBot: [number, number] = [
    southTop[0] + bx * out + jx,
    southTop[1] + drop + by * out * 0.45 + jy,
  ];
  return [
    s.top[0],
    s.top[1],
    southTop[0],
    southTop[1],
    e.top[0],
    e.top[1],
    e.bot[0],
    e.bot[1],
    cornerBot[0],
    cornerBot[1],
    s.bot[0],
    s.bot[1],
  ];
}

export function tileCliffGeometry(
  tw: number,
  th: number,
  heightStep: number,
  dropE: number,
  dropS: number,
  seed: number,
  tileX = 0,
  tileY = 0,
): TileCliffGeometry {
  const chamfer = dropE > 0 && dropS > 0 ? CLIFF_CORNER_CHAMFER : 0;
  const south =
    dropS > 0
      ? elevationFace("south", dropS, tw, th, heightStep, seed, {
          tileX,
          tileY,
          chamferSouth: chamfer,
        })
      : null;
  const east =
    dropE > 0
      ? elevationFace("east", dropE, tw, th, heightStep, seed, {
          tileX,
          tileY,
          chamferSouth: chamfer,
        })
      : null;
  const wedge =
    south && east
      ? cornerWedgePoints(south, east, tw, th, heightStep, dropE, dropS, tileX, tileY)
      : null;
  return { south, east, wedge };
}

export function cliffCornerWedge(
  tw: number,
  th: number,
  heightStep: number,
  dropE: number,
  dropS: number,
  seed: number,
  tileX = 0,
  tileY = 0,
): number[] | null {
  return tileCliffGeometry(tw, th, heightStep, dropE, dropS, seed, tileX, tileY).wedge;
}
