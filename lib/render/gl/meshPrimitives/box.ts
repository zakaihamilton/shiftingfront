import { appendQuad, type MeshPoint } from "./buffers";
import { computeNormal } from "./math";
import type { MeshData } from "./types";

export function createBoxMesh(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
  mask = 0,
): MeshData {
  const p: number[] = [];
  const n: number[] = [];
  const m: number[] = [];
  const idx: number[] = [];

  const buffers = { p, n, m, idx };

  // +Z (top)
  appendQuad(
    buffers,
    [minX, minY, maxZ],
    [maxX, minY, maxZ],
    [maxX, maxY, maxZ],
    [minX, maxY, maxZ],
    [0, 0, 1],
    mask,
  );
  // -Z (bottom)
  appendQuad(
    buffers,
    [minX, maxY, minZ],
    [maxX, maxY, minZ],
    [maxX, minY, minZ],
    [minX, minY, minZ],
    [0, 0, -1],
    mask,
  );
  // +X (front)
  appendQuad(
    buffers,
    [maxX, minY, minZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
    [maxX, minY, maxZ],
    [1, 0, 0],
    mask,
  );
  // -X (back)
  appendQuad(
    buffers,
    [minX, minY, maxZ],
    [minX, maxY, maxZ],
    [minX, maxY, minZ],
    [minX, minY, minZ],
    [-1, 0, 0],
    mask,
  );
  // +Y (left)
  appendQuad(
    buffers,
    [minX, maxY, minZ],
    [maxX, maxY, minZ],
    [maxX, maxY, maxZ],
    [minX, maxY, maxZ],
    [0, 1, 0],
    mask,
  );
  // -Y (right)
  appendQuad(
    buffers,
    [minX, minY, maxZ],
    [maxX, minY, maxZ],
    [maxX, minY, minZ],
    [minX, minY, minZ],
    [0, -1, 0],
    mask,
  );

  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    masks: new Float32Array(m),
    indices: new Uint16Array(idx),
  };
}

export function createTrapezoidMesh(
  bMinX: number,
  bMinY: number,
  tMinX: number,
  tMinY: number,
  bMaxX: number,
  bMaxY: number,
  tMaxX: number,
  tMaxY: number,
  minZ: number,
  maxZ: number,
  mask = 0,
): MeshData {
  const p: number[] = [];
  const n: number[] = [];
  const m: number[] = [];
  const idx: number[] = [];

  const buffers = { p, n, m, idx };
  const addQuad = (p0: MeshPoint, p1: MeshPoint, p2: MeshPoint, p3: MeshPoint): void => {
    appendQuad(buffers, p0, p1, p2, p3, computeNormal(p0, p1, p2), mask);
  };

  // +Z (top)
  addQuad([tMinX, tMinY, maxZ], [tMaxX, tMinY, maxZ], [tMaxX, tMaxY, maxZ], [tMinX, tMaxY, maxZ]);
  // -Z (bottom)
  addQuad([bMinX, bMaxY, minZ], [bMaxX, bMaxY, minZ], [bMaxX, bMinY, minZ], [bMinX, bMinY, minZ]);
  // +X (front)
  addQuad([bMaxX, bMinY, minZ], [bMaxX, bMaxY, minZ], [tMaxX, tMaxY, maxZ], [tMaxX, tMinY, maxZ]);
  // -X (back)
  addQuad([bMinX, bMinY, minZ], [tMinX, tMinY, maxZ], [tMinX, tMaxY, maxZ], [bMinX, bMaxY, minZ]);
  // +Y (left)
  addQuad([bMinX, bMaxY, minZ], [tMinX, tMaxY, maxZ], [tMaxX, tMaxY, maxZ], [bMaxX, bMaxY, minZ]);
  // -Y (right)
  addQuad([bMinX, bMinY, minZ], [bMaxX, bMinY, minZ], [tMaxX, tMinY, maxZ], [tMinX, tMinY, maxZ]);

  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    masks: new Float32Array(m),
    indices: new Uint16Array(idx),
  };
}
