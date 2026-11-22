import { appendCap, appendQuad } from "./buffers";
import type { MeshData } from "./types";

export function createCylinderMesh(
  cx: number,
  cy: number,
  minZ: number,
  maxZ: number,
  rBot: number,
  rTop: number,
  segments = 8,
  mask = 0,
  capTop = true,
  capBottom = true,
): MeshData {
  const p: number[] = [];
  const n: number[] = [];
  const m: number[] = [];
  const idx: number[] = [];
  const buffers = { p, n, m, idx };

  const dz = Math.max(0.0001, maxZ - minZ);
  const dr = rBot - rTop;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const midA = (a0 + a1) * 0.5;

    const nx = Math.cos(midA);
    const ny = Math.sin(midA);
    const nz = dr / dz;
    const len = Math.hypot(nx, ny, nz) || 1;
    const norm: [number, number, number] = [nx / len, ny / len, nz / len];

    const p0: [number, number, number] = [cx + rBot * Math.cos(a0), cy + rBot * Math.sin(a0), minZ];
    const p1: [number, number, number] = [cx + rBot * Math.cos(a1), cy + rBot * Math.sin(a1), minZ];
    const p2: [number, number, number] = [cx + rTop * Math.cos(a1), cy + rTop * Math.sin(a1), maxZ];
    const p3: [number, number, number] = [cx + rTop * Math.cos(a0), cy + rTop * Math.sin(a0), maxZ];

    appendQuad(buffers, p0, p1, p2, p3, norm, mask);
  }

  // Cap Top
  if (capTop) {
    appendCap(buffers, [cx, cy, maxZ], [0, 0, 1], segments, mask, (i) => {
      const a = (i / segments) * Math.PI * 2;
      return [cx + rTop * Math.cos(a), cy + rTop * Math.sin(a), maxZ];
    });
  }

  // Cap Bottom
  if (capBottom) {
    appendCap(
      buffers,
      [cx, cy, minZ],
      [0, 0, -1],
      segments,
      mask,
      (i) => {
        const a = (i / segments) * Math.PI * 2;
        return [cx + rBot * Math.cos(a), cy + rBot * Math.sin(a), minZ];
      },
      true,
    );
  }

  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    masks: new Float32Array(m),
    indices: new Uint16Array(idx),
  };
}

export function createCylinderXMesh(
  minX: number,
  maxX: number,
  cy: number,
  cz: number,
  rBack: number,
  rFront: number,
  segments = 8,
  mask = 0,
  capFront = true,
  capBack = true,
): MeshData {
  const p: number[] = [];
  const n: number[] = [];
  const m: number[] = [];
  const idx: number[] = [];
  const buffers = { p, n, m, idx };

  const dx = Math.max(0.0001, maxX - minX);
  const dr = rBack - rFront;

  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const midA = (a0 + a1) * 0.5;

    const nx = dr / dx;
    const ny = Math.cos(midA);
    const nz = Math.sin(midA);
    const len = Math.hypot(nx, ny, nz) || 1;
    const norm: [number, number, number] = [nx / len, ny / len, nz / len];

    const p0: [number, number, number] = [
      minX,
      cy + rBack * Math.cos(a0),
      cz + rBack * Math.sin(a0),
    ];
    const p1: [number, number, number] = [
      minX,
      cy + rBack * Math.cos(a1),
      cz + rBack * Math.sin(a1),
    ];
    const p2: [number, number, number] = [
      maxX,
      cy + rFront * Math.cos(a1),
      cz + rFront * Math.sin(a1),
    ];
    const p3: [number, number, number] = [
      maxX,
      cy + rFront * Math.cos(a0),
      cz + rFront * Math.sin(a0),
    ];

    appendQuad(buffers, p0, p1, p2, p3, norm, mask);
  }

  // Cap Front (+X)
  if (capFront) {
    appendCap(buffers, [maxX, cy, cz], [1, 0, 0], segments, mask, (i) => {
      const a = (i / segments) * Math.PI * 2;
      return [maxX, cy + rFront * Math.cos(a), cz + rFront * Math.sin(a)];
    });
  }

  // Cap Back (-X)
  if (capBack) {
    appendCap(
      buffers,
      [minX, cy, cz],
      [-1, 0, 0],
      segments,
      mask,
      (i) => {
        const a = (i / segments) * Math.PI * 2;
        return [minX, cy + rBack * Math.cos(a), cz + rBack * Math.sin(a)];
      },
      true,
    );
  }

  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    masks: new Float32Array(m),
    indices: new Uint16Array(idx),
  };
}
