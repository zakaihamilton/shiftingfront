import type { Palette } from "../../types";
import type { UnitModel } from "./modelLoader";

function parseHex(hex: string): [number, number, number] {
  if (hex.startsWith("#")) {
    if (hex.length === 4) {
      return [
        parseInt(hex[1]! + hex[1]!, 16) || 0,
        parseInt(hex[2]! + hex[2]!, 16) || 0,
        parseInt(hex[3]! + hex[3]!, 16) || 0,
      ];
    }
    return [
      parseInt(hex.slice(1, 3), 16) || 0,
      parseInt(hex.slice(3, 5), 16) || 0,
      parseInt(hex.slice(5, 7), 16) || 0,
    ];
  }
  return [120, 140, 160];
}

function shadeColor(hex: string, factor: number): string {
  const [r, g, b] = parseHex(hex);
  const nr = Math.max(0, Math.min(255, Math.round(r * factor)));
  const ng = Math.max(0, Math.min(255, Math.round(g * factor)));
  const nb = Math.max(0, Math.min(255, Math.round(b * factor)));
  return `rgb(${nr},${ng},${nb})`;
}

function blendHex(hexA: string, hexB: string, amount: number): string {
  const [r1, g1, b1] = parseHex(hexA);
  const [r2, g2, b2] = parseHex(hexB);
  const t = Math.max(0, Math.min(1, amount));
  const nr = Math.round(r1 + (r2 - r1) * t);
  const ng = Math.round(g1 + (g2 - g1) * t);
  const nb = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${nr},${ng},${nb})`;
}

// Normalized isometric key light direction vector (from top-left)
const SUN_DIR: [number, number, number] = [0.528, -0.624, 0.720];
const SKY_DIR: [number, number, number] = [0, 0, 1];
const BOUNCE_DIR: [number, number, number] = [-0.566, 0.728, -0.388];
const VIEW_DIR: [number, number, number] = [0.485, 0.485, 0.686];

// Half vector for Blinn-Phong specular highlight
const HALF_DIR: [number, number, number] = [
  (SUN_DIR[0] + VIEW_DIR[0]) / Math.hypot(SUN_DIR[0] + VIEW_DIR[0], SUN_DIR[1] + VIEW_DIR[1], SUN_DIR[2] + VIEW_DIR[2]),
  (SUN_DIR[1] + VIEW_DIR[1]) / Math.hypot(SUN_DIR[0] + VIEW_DIR[0], SUN_DIR[1] + VIEW_DIR[1], SUN_DIR[2] + VIEW_DIR[2]),
  (SUN_DIR[2] + VIEW_DIR[2]) / Math.hypot(SUN_DIR[0] + VIEW_DIR[0], SUN_DIR[1] + VIEW_DIR[1], SUN_DIR[2] + VIEW_DIR[2]),
];

export type DrawModelOptions = {
  recoil?: number;
  legLAngle?: number;
  legRAngle?: number;
  scoopAngle?: number;
  barrelPitch?: number;
};

export function draw3dModel(
  ctx: CanvasRenderingContext2D,
  model: UnitModel,
  screenX: number,
  screenY: number,
  scale: number,
  yawAngle: number,
  palette?: Palette,
  recoilOrOptions?: number | DrawModelOptions,
): void {
  const options: DrawModelOptions = typeof recoilOrOptions === "number"
    ? { recoil: recoilOrOptions }
    : recoilOrOptions ?? {};
  const recoil = options.recoil ?? 0;
  const legLAngle = options.legLAngle ?? 0;
  const legRAngle = options.legRAngle ?? 0;
  const scoopAngle = options.scoopAngle ?? 0;
  const barrelPitch = options.barrelPitch ?? 0;

  const cos = Math.cos(yawAngle);
  const sin = Math.sin(yawAngle);

  // Isometric projection constants matching Shifting Front's tile ratio (2:1)
  const isoX = 20 * scale;
  const isoY = 10 * scale;
  const isoZ = 16 * scale;

  type PolyFace = {
    pts: [number, number][];
    depth: number;
    color: string;
    stroke: string;
    isGlowing?: boolean;
  };

  const faces: PolyFace[] = [];

  for (const node of model.nodes) {
    const isBarrel = node.name === "barrel";
    const isLegL = node.name === "legL";
    const isLegR = node.name === "legR";
    const isScoop = node.name === "scoop";
    const pivot = node.pivot ?? [0, 0, 0];

    const { positions, normals, masks, indices } = node.mesh;
    const count = indices.length;

    let i = 0;
    while (i < count) {
      // Check if consecutive triangles form a Quad: [v0, v1, v2] and [v0, v2, v3]
      const canBeQuad =
        i + 5 < count &&
        indices[i]! === indices[i + 3]! &&
        indices[i + 2]! === indices[i + 4]!;

      let vertIndices: number[];
      if (canBeQuad) {
        vertIndices = [indices[i]!, indices[i + 1]!, indices[i + 2]!, indices[i + 5]!];
        i += 6;
      } else {
        vertIndices = [indices[i]!, indices[i + 1]!, indices[i + 2]!];
        i += 3;
      }

      const numVerts = vertIndices.length;
      const pts: [number, number][] = [];
      let avgDepth = 0;
      let avgZ = 0;

      for (let v = 0; v < numVerts; v++) {
        const vi = vertIndices[v]!;
        let x = positions[vi * 3]!;
        const y = positions[vi * 3 + 1]!;
        let z = positions[vi * 3 + 2]!;

        // Articulated node transformations around pivot
        if (isLegL && legLAngle !== 0) {
          const rx0 = x - pivot[0];
          const rz0 = z - pivot[2];
          const cosA = Math.cos(legLAngle);
          const sinA = Math.sin(legLAngle);
          x = pivot[0] + rx0 * cosA + rz0 * sinA;
          z = pivot[2] - rx0 * sinA + rz0 * cosA;
        } else if (isLegR && legRAngle !== 0) {
          const rx0 = x - pivot[0];
          const rz0 = z - pivot[2];
          const cosA = Math.cos(legRAngle);
          const sinA = Math.sin(legRAngle);
          x = pivot[0] + rx0 * cosA + rz0 * sinA;
          z = pivot[2] - rx0 * sinA + rz0 * cosA;
        } else if (isScoop && scoopAngle !== 0) {
          const rx0 = x - pivot[0];
          const rz0 = z - pivot[2];
          const cosA = Math.cos(scoopAngle);
          const sinA = Math.sin(scoopAngle);
          x = pivot[0] + rx0 * cosA + rz0 * sinA;
          z = pivot[2] - rx0 * sinA + rz0 * cosA;
        } else if (isBarrel) {
          if (recoil > 0) {
            x -= recoil * 0.10;
          }
          if (barrelPitch !== 0) {
            const rx0 = x - pivot[0];
            const rz0 = z - pivot[2];
            const cosA = Math.cos(barrelPitch);
            const sinA = Math.sin(barrelPitch);
            x = pivot[0] + rx0 * cosA - rz0 * sinA;
            z = pivot[2] + rx0 * sinA + rz0 * cosA;
          }
        }

        // Rotate around Z axis by yawAngle
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;

        // Project to isometric screen coordinates
        const sx = screenX + (rx - ry) * isoX;
        const sy = screenY + (rx + ry) * isoY - z * isoZ;

        pts.push([sx, sy]);
        avgDepth += (rx + ry) - z * 0.15;
        avgZ += z;
      }

      avgDepth /= numVerts;
      avgZ /= numVerts;

      // 2D Backface culling on the screen projection
      const cross =
        (pts[1]![0] - pts[0]![0]) * (pts[2]![1] - pts[0]![1]) -
        (pts[1]![1] - pts[0]![1]) * (pts[2]![0] - pts[0]![0]);
      if (cross >= 0) continue;

      // Rotated surface normal
      const refIdx = vertIndices[0]!;
      let nx = normals[refIdx * 3]!;
      const ny = normals[refIdx * 3 + 1]!;
      let nz = normals[refIdx * 3 + 2]!;
      // Keep the lighting attached to the elevated gun assembly. Without
      // rotating the normals here, the barrels would move skyward while their
      // highlights still described a level weapon.
      if (isBarrel && barrelPitch !== 0) {
        const cosA = Math.cos(barrelPitch);
        const sinA = Math.sin(barrelPitch);
        const pitchedNx = nx * cosA - nz * sinA;
        nz = nx * sinA + nz * cosA;
        nx = pitchedNx;
      }
      const rnx = nx * cos - ny * sin;
      const rny = nx * sin + ny * cos;
      const rnz = nz;

      // Multi-source lighting calculation
      const dotSun = Math.max(0, rnx * SUN_DIR[0] + rny * SUN_DIR[1] + rnz * SUN_DIR[2]);
      const dotSky = Math.max(0, 0.5 + 0.5 * (rnx * SKY_DIR[0] + rny * SKY_DIR[1] + rnz * SKY_DIR[2]));
      const dotBounce = Math.max(0, rnx * BOUNCE_DIR[0] + rny * BOUNCE_DIR[1] + rnz * BOUNCE_DIR[2]);

      const diffuse = 0.60 * dotSun + 0.28 * dotSky + 0.12 * dotBounce;

      // Specular highlight
      const dotH = Math.max(0, rnx * HALF_DIR[0] + rny * HALF_DIR[1] + rnz * HALF_DIR[2]);
      const mask = masks[refIdx] ?? 0;

      let specular = 0;
      if (mask === 7) {
        // Polished chrome / hydraulic rods
        specular = Math.pow(dotH, 32) * 0.85;
      } else if (mask === 1 || mask === 2 || mask === 0 || mask === 5) {
        // Metallic armor and bronze vents
        specular = Math.pow(dotH, 16) * 0.40;
      }

      // Height / Crevice Ambient Occlusion
      const ao = Math.max(0.72, Math.min(1.05, 0.84 + avgZ * 0.35));
      const lightFactor = Math.max(0.25, Math.min(1.45, (diffuse + 0.22) * ao));

      // Material color determination
      let baseColor = "#444f5c";
      let strokeColor = "#222a33";
      let isGlowing = false;

      if (mask === 1) {
        // Primary Faction Team Armor
        baseColor = palette?.primary ?? "#4a5d6e";
        strokeColor = shadeColor(baseColor, 0.50);
      } else if (mask === 2) {
        // Secondary Faction Armor Trim
        baseColor = palette?.secondary ?? "#6b7c8d";
        strokeColor = shadeColor(baseColor, 0.48);
      } else if (mask === 3) {
        // Tactical Glowing Cyan Optics / Visors
        baseColor = "#46e2ff";
        strokeColor = "#1cb2d0";
        isGlowing = true;
      } else if (mask === 4) {
        // Dark Titanium / Carbon Mechanical Joints & Barrel Shroud
        baseColor = "#22272e";
        strokeColor = "#101418";
      } else if (mask === 5) {
        // Heat-tempered Bronze / Copper Muzzle Vents & Heat Sinks
        baseColor = "#d68b3e";
        strokeColor = "#784318";
      } else if (mask === 6) {
        // Hazard / Yellow Warning Trim
        baseColor = "#f5c542";
        strokeColor = "#927418";
      } else if (mask === 7) {
        // Polished Chrome / Hydraulic Steel
        baseColor = "#d4e4f2";
        strokeColor = "#788c9e";
      }

      let finalColor: string;
      if (isGlowing) {
        // Top-facing sensor visors get bright core highlight
        finalColor = rnz > 0.6 || dotSun > 0.4 ? "#b8f6ff" : "#46e2ff";
      } else {
        const shaded = shadeColor(baseColor, lightFactor);
        finalColor = specular > 0.05 ? blendHex(shaded, "#ffffff", Math.min(0.75, specular)) : shaded;
      }

      faces.push({
        pts,
        depth: avgDepth,
        color: finalColor,
        stroke: strokeColor,
        isGlowing,
      });
    }
  }

  // Painter's sorting (back to front)
  faces.sort((a, b) => a.depth - b.depth);

  ctx.save();
  ctx.lineWidth = Math.max(0.5, 0.70 * scale);
  ctx.lineJoin = "round";

  for (const face of faces) {
    if (face.isGlowing) {
      ctx.shadowColor = "#46e2ff";
      ctx.shadowBlur = 4 * scale;
    } else {
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = face.color;
    ctx.strokeStyle = face.stroke;
    ctx.beginPath();
    ctx.moveTo(face.pts[0]![0], face.pts[0]![1]);
    for (let p = 1; p < face.pts.length; p++) {
      ctx.lineTo(face.pts[p]![0], face.pts[p]![1]);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}
