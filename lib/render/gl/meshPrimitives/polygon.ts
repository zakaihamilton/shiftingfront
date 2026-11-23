import { createBoxMesh } from "./box";
import { appendCap, appendQuad, type MeshPoint } from "./buffers";
import { computeNormal } from "./math";
import type { MeshData } from "./types";

export function createPolygonPrismMesh(
  pointsXY: [number, number][],
  minZ: number,
  maxZ: number,
  mask = 0,
): MeshData {
  const p: number[] = [];
  const n: number[] = [];
  const m: number[] = [];
  const idx: number[] = [];
  const buffers = { p, n, m, idx };
  const count = pointsXY.length;
  if (count < 3) return createBoxMesh(0, 0, minZ, 0, 0, maxZ, mask);

  let sumX = 0;
  let sumY = 0;
  for (const pt of pointsXY) {
    sumX += pt[0];
    sumY += pt[1];
  }
  const avgX = sumX / count;
  const avgY = sumY / count;

  // Side quads
  for (let i = 0; i < count; i++) {
    const pA = pointsXY[i]!;
    const pB = pointsXY[(i + 1) % count]!;

    const p0: MeshPoint = [pA[0], pA[1], minZ];
    const p1: MeshPoint = [pB[0], pB[1], minZ];
    const p2: MeshPoint = [pB[0], pB[1], maxZ];
    const p3: MeshPoint = [pA[0], pA[1], maxZ];

    appendQuad(buffers, p0, p1, p2, p3, computeNormal(p0, p1, p2), mask);
  }

  // Top cap (+Z)
  appendCap(buffers, [avgX, avgY, maxZ], [0, 0, 1], count, mask, (i) => [
    pointsXY[i]![0],
    pointsXY[i]![1],
    maxZ,
  ]);

  // Bottom cap (-Z)
  appendCap(
    buffers,
    [avgX, avgY, minZ],
    [0, 0, -1],
    count,
    mask,
    (i) => [pointsXY[i]![0], pointsXY[i]![1], minZ],
    true,
  );

  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    masks: new Float32Array(m),
    indices: new Uint16Array(idx),
  };
}
