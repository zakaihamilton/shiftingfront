import type { ModelKind, ModelNode, UnitModel } from "./modelLoader";

type RawGroup = {
  name: string;
  pos: number[];
  norm: number[];
  mask: number[];
  indices: number[];
};

/** Parses the small Wavefront OBJ subset used by the optional tactical model assets. */
export function parseObjModelData(
  text: string,
  kind: ModelKind,
  fallback: (kind: ModelKind) => UnitModel,
): UnitModel {
  const lines = text.split(/\r?\n/);
  const globalPositions: [number, number, number][] = [];
  const globalNormals: [number, number, number][] = [];
  const groups: RawGroup[] = [];
  let currentGroup: RawGroup = {
    name: "main",
    pos: [],
    norm: [],
    mask: [],
    indices: [],
  };
  let currentMask = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    const tag = parts[0];

    if (tag === "v" && parts.length >= 4) {
      globalPositions.push([parseFloat(parts[1]!), parseFloat(parts[2]!), parseFloat(parts[3]!)]);
    } else if (tag === "vn" && parts.length >= 4) {
      globalNormals.push([parseFloat(parts[1]!), parseFloat(parts[2]!), parseFloat(parts[3]!)]);
    } else if (tag === "o" || tag === "g") {
      if (currentGroup.indices.length > 0) groups.push(currentGroup);
      currentGroup = {
        name: parts[1] || `node_${groups.length}`,
        pos: [],
        norm: [],
        mask: [],
        indices: [],
      };
    } else if (tag === "usemtl") {
      const mat = parts[1]?.toLowerCase() || "";
      if (mat.includes("primary") || mat.includes("team")) currentMask = 1;
      else if (mat.includes("secondary")) currentMask = 2;
      else if (mat.includes("accent") || mat.includes("glass") || mat.includes("glow"))
        currentMask = 3;
      else if (mat.includes("dark") || mat.includes("track")) currentMask = 4;
      else if (mat.includes("bronze") || mat.includes("heat")) currentMask = 5;
      else if (mat.includes("hazard") || mat.includes("yellow")) currentMask = 6;
      else if (mat.includes("chrome") || mat.includes("piston")) currentMask = 7;
      else currentMask = 0;
    } else if (tag === "f" && parts.length >= 4) {
      const faceVerts: { p: [number, number, number]; n: [number, number, number] }[] = [];
      for (let i = 1; i < parts.length; i++) {
        const segs = parts[i]!.split("/");
        const pi = parseInt(segs[0]!, 10) - 1;
        const ni = segs.length >= 3 && segs[2] ? parseInt(segs[2]!, 10) - 1 : -1;
        const p = globalPositions[pi] || ([0, 0, 0] as [number, number, number]);
        const n =
          ni >= 0 && globalNormals[ni]
            ? globalNormals[ni]!
            : ([0, 0, 1] as [number, number, number]);
        faceVerts.push({ p, n });
      }
      for (let i = 1; i < faceVerts.length - 1; i++) {
        const v0 = faceVerts[0]!;
        const v1 = faceVerts[i]!;
        const v2 = faceVerts[i + 1]!;
        const baseIdx = currentGroup.pos.length / 3;
        currentGroup.pos.push(...v0.p, ...v1.p, ...v2.p);
        currentGroup.norm.push(...v0.n, ...v1.n, ...v2.n);
        currentGroup.mask.push(currentMask, currentMask, currentMask);
        currentGroup.indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
      }
    }
  }

  if (currentGroup.indices.length > 0) groups.push(currentGroup);
  if (groups.length === 0) return fallback(kind);

  const nodes: ModelNode[] = groups.map((group) => ({
    name: group.name,
    pivot: [0, 0, 0],
    mesh: {
      positions: new Float32Array(group.pos),
      normals: new Float32Array(group.norm),
      masks: new Float32Array(group.mask),
      indices: new Uint16Array(group.indices),
    },
  }));

  return { kind, nodes };
}
