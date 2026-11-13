import type { BiomeName, Palette, ShapeSpec } from "../../types";
import { hash, mixHex, pick, signed, ORE } from "../tilePalette";
import { appendPropArtShapes, blockerPropPrims, blockerToneFromPalette } from "../blockerPropArt";
import { blockerPropKind } from "../terrainDecorKinds";
import { tileCx, tileCy, INK, poly, ell, line, irregularIso } from "./constants";
import { wetGround, shoreSand, waterDeep, waterMid, waterHi, foam, rockColors, diamondEdges, insetBand } from "./colors";

export function paintWater(shapes: ShapeSpec[], biome: BiomeName, v: number, mask: number): void {
  const cx = tileCx();
  const cy = tileCy();
  const deep = waterDeep(biome);
  const mid = waterMid(biome);
  const hi = waterHi(biome);
  shapes.push(poly(irregularIso(cx, cy, 108, 54, 0, 2), mixHex(deep, mid, 0.32)));
  shapes.push(ell(cx - 10, cy - 2, 24, 10, mixHex(deep, mid, 0.1)));
  shapes.push(line(cx - 14, cy + 1, cx + 12, cy - 3, mixHex(mid, hi, 0.22), 1));
  if (mask) paintBanks(shapes, biome, mask, v);
}

export function paintBanks(shapes: ShapeSpec[], biome: BiomeName, mask: number, v: number): void {
  const sand = shoreSand(biome);
  const mud = wetGround(biome);
  const froth = foam(biome);
  const deep = waterDeep(biome);
  for (const edge of diamondEdges()) {
    if (!(mask & edge.bit)) continue;
    const band = insetBand(edge.a, edge.b, 7);
    shapes.push(poly([...edge.a, ...edge.b, ...band.b, ...band.a], sand, mud, 1));
    const inner = insetBand(edge.a, edge.b, 4);
    shapes.push(poly([...band.a, ...band.b, ...inner.b, ...inner.a], deep));
    shapes.push(line(inner.a[0]!, inner.a[1]!, inner.b[0]!, inner.b[1]!, froth, 2));
    if ((v + edge.bit) % 3 === 0) {
      const mx = (edge.a[0]! + edge.b[0]!) / 2;
      const my = (edge.a[1]! + edge.b[1]!) / 2;
      shapes.push(ell(mx - 2, my - 1, 5, 3, "#6a5a44", INK));
    }
  }
}

export function paintRidge(shapes: ShapeSpec[], biome: BiomeName, p: Palette, v: number, mask: number): void {
  const rock = rockColors(biome, p);
  if (!mask) {
    shapes.push(ell(tileCx() + ((v % 7) - 3), tileCy() + 1, 7, 3, rock.dark));
    shapes.push(ell(tileCx() + ((v % 5) - 2), tileCy(), 4, 2, rock.hi));
    return;
  }
  for (const edge of diamondEdges()) {
    if (!(mask & edge.bit)) continue;
    const face = insetBand(edge.a, edge.b, 8);
    shapes.push(poly([...edge.a, ...edge.b, ...face.b, ...face.a], rock.mid, rock.ink, 1));
    const facet = insetBand(edge.a, edge.b, 4);
    shapes.push(poly([
      edge.a[0]!, edge.a[1]!,
      (edge.a[0]! + edge.b[0]!) / 2, (edge.a[1]! + edge.b[1]!) / 2,
      facet.a[0]!, facet.a[1]!,
    ], rock.hi));
    shapes.push(line(face.a[0]!, face.a[1]!, face.b[0]!, face.b[1]!, rock.dark, 2));
    const mx = (edge.a[0]! + edge.b[0]!) / 2 + ((v % 3) - 1);
    const my = (edge.a[1]! + edge.b[1]!) / 2;
    shapes.push(line(mx - 3, my, mx + 2, my + 2, rock.ink, 1));
  }
  if ((mask & 3) === 3) {
    const cx = tileCx();
    const cy = tileCy() - 14;
    shapes.push(poly([cx - 4, cy + 2, cx, cy, cx + 4, cy + 2, cx, cy + 8], rock.hi, rock.ink, 1));
    shapes.push(poly([cx - 2, cy + 2, cx, cy + 1, cx, cy + 7], rock.dark));
  }
}

export function paintOreField(shapes: ShapeSpec[], biome: BiomeName, v: number, level: number, continuous = false): void {
  const cx = tileCx();
  const cy = tileCy();
  const n = Math.max(1, Math.min(4, level));
  const fieldTint = biome === "crystal flats" ? "#34594f"
    : biome === "rust canyons" ? "#5f321d"
      : biome === "tundra grid" ? "#465b5c"
        : biome === "volcanic shelf" ? "#2c1e1a"
          : biome === "jungle wreckage" ? "#2a3c22"
            : ORE.stainLo;
  const density = 1 + pick(v, 401, 4);
  if (!continuous) {
    shapes.push(poly(irregularIso(cx, cy + 1, 76, 36, v, 2), fieldTint));
    shapes.push(poly(irregularIso(cx, cy, 66, 29, v, 2), mixHex(fieldTint, ORE.stain, 0.54)));
  }
  for (let i = 0; i < density; i++) {
    const ox = -16 + i * 11 + signed(v, 404 + i, 2);
    const oy = 4 - i * 5 + signed(v, 410 + i, 2);
    const seam = 10 + pick(v, 416 + i, 7);
    shapes.push(line(cx + ox, cy + oy, cx + ox + seam, cy + oy - Math.max(2, Math.round(seam * 0.28)), ORE.south, 3));
    shapes.push(line(cx + ox + 1, cy + oy - 1, cx + ox + seam - 1, cy + oy - Math.max(3, Math.round(seam * 0.28)) - 1, ORE.lit, 1));
  }

  const slots: Array<[number, number, number, number]> = [
    [-11, 2, 8, 5],
    [8, -4, 9, 6],
    [1, 5, 7, 4],
    [14, 3, 6, 5],
    [-7, -5, 7, 5],
    [5, 1, 8, 6],
    [-15, 4, 5, 4],
  ];
  const picked = slots
    .map((slot, i) => ({ slot, order: slot[1]! * 8 + slot[0]!, mix: hash(v + i * 19) }))
    .sort((a, b) => a.mix - b.mix)
    .slice(0, 1 + Math.floor(n / 2))
    .sort((a, b) => a.order - b.order);

  for (let i = 0; i < picked.length; i++) {
    const [ox, oy, rw, zh] = picked[i]!.slot;
    const seed = hash(v + i * 31);
    const width = rw + (seed % 3) - 1;
    const z = Math.min(zh + (seed % 2), 6);
    const x = cx + ox;
    const y = cy + oy;
    const half = Math.max(3, Math.round(width * 0.38));
    shapes.push(poly([x - half, y, x, y - z, x + half, y, x, y + Math.max(2, half * 0.42)], ORE.top, ORE.ink, 1));
    shapes.push(poly([x - half, y, x, y + Math.max(2, half * 0.42), x, y + Math.max(2, half * 0.42) + 2, x - half, y + 2], ORE.south, ORE.ink, 1));
    shapes.push(line(x - half + 1, y - 1, x - 1, y - z + 1, ORE.lit, 1));
  }

  shapes.push(line(cx - 20, cy + 8, cx + 20, cy - 8, ORE.ink, 1));
  shapes.push(line(cx - 18, cy + 8, cx + 18, cy - 7, ORE.glint, 1));
}

export function paintBlocker(
  shapes: ShapeSpec[],
  biome: BiomeName,
  p: Palette,
  v: number,
  cx: number,
  cy: number,
): void {
  const ox = signed(v, 3, 4);
  const oy = signed(v, 4, 2);
  appendPropArtShapes(
    shapes,
    blockerPropPrims(blockerPropKind(biome, v), v, blockerToneFromPalette(p), biome),
    cx + ox,
    cy + oy,
  );
}
