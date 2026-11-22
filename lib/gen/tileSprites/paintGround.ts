import {
  type BiomeName,
  type CampaignVisualProfile,
  type Palette,
  type ShapeSpec,
  SURFACE_CONCRETE,
  SURFACE_ROAD,
  type SurfaceKind,
  type TileContour,
} from "../../types";
import { paintBiomeLandmark, paintBiomeSignature, pushBush } from "../tileDecor";
import { mixHex, pick, signed } from "../tilePalette";
import { shoreSand, wetGround } from "./colors";
import { arid, ell, irregularIso, line, lush, poly, tileCx, tileCy } from "./constants";

export function paintFloor(
  shapes: ShapeSpec[],
  biome: BiomeName,
  p: Palette,
  v: number,
  kind: "clear" | "water" | "resource" | "blocked",
  contour: TileContour,
  surface?: SurfaceKind,
  surfaceMask?: number,
): void {
  const cx = tileCx();
  const cy = tileCy();
  const base = kind === "water" || contour === "bank" ? wetGround(biome) : p.primary;
  const continuousBase =
    surfaceMask !== undefined &&
    (surfaceMask === -1 || (surfaceMask === 0 && (kind === "water" || kind === "resource")));
  const engineered = surface === SURFACE_CONCRETE || surface === SURFACE_ROAD;
  if (!continuousBase && !engineered)
    shapes.push(poly(irregularIso(cx, cy, 64 + 16, 32 + 10, v, 3), base));
  if (engineered) return;
  if (!continuousBase) {
    shapes.push(
      poly(irregularIso(cx + signed(v, 1, 3), cy + signed(v, 2, 1), 70, 30, v >> 1, 2), base),
    );
  }
  if (kind !== "water" && contour !== "bank") {
    const macroDensity = pick(v, 18, 6);
    const patches = macroDensity < 2 ? 1 : 2 + pick(v, 3, 2);
    for (let i = 0; i < patches; i++) {
      const ox = signed(v, 10 + i, 12);
      const oy = signed(v, 40 + i, 5);
      const ew = 9 + pick(v, 70 + i, 18);
      const eh = 4 + pick(v, 90 + i, 6);
      const fill = [p.light, p.dark, p.secondary, p.primary][pick(v, 110 + i, 4)]!;
      if (pick(v, 130 + i, 3) === 0) {
        shapes.push(poly(irregularIso(cx + ox, cy + oy, ew + 6, eh + 5, v + i * 19, 2), fill));
      } else {
        shapes.push(ell(cx + ox - ew / 2, cy + oy - eh / 2, ew, eh, fill));
      }
    }
    if (pick(v, 238, 4) !== 0) {
      const relief = pick(v, 239, 3);
      const reliefFill =
        relief === 0
          ? mixHex(p.secondary, p.dark, 0.32)
          : relief === 1
            ? mixHex(p.primary, p.light, 0.26)
            : mixHex(p.accent, p.primary, 0.32);
      shapes.push(
        poly(
          irregularIso(
            cx + signed(v, 240, 10),
            cy + signed(v, 241, 4),
            48 + pick(v, 242, 18),
            14 + pick(v, 243, 8),
            v >> 5,
            2,
          ),
          reliefFill,
        ),
      );
    }
    const specks = macroDensity < 4 ? 1 : 2;
    for (let i = 0; i < specks; i++) {
      const ox = signed(v, 150 + i, 11);
      const oy = signed(v, 170 + i, 4);
      shapes.push(
        ell(
          cx + ox,
          cy + oy,
          2 + pick(v, 190 + i, 3),
          1 + pick(v, 200 + i, 2),
          i % 2 ? p.light : p.dark,
        ),
      );
    }
  }
  if (kind !== "water" && contour === "bank") {
    shapes.push(poly(irregularIso(cx + signed(v, 4, 3), cy + 1, 54, 24, v, 3), shoreSand(biome)));
    shapes.push(
      ell(
        cx - 12 + signed(v, 5, 6),
        cy - 2 + signed(v, 6, 2),
        18 + pick(v, 7, 8),
        8 + pick(v, 8, 4),
        shoreSand(biome),
      ),
    );
    shapes.push(
      ell(
        cx + 4 + signed(v, 9, 6),
        cy + 2 + signed(v, 10, 2),
        16 + pick(v, 11, 8),
        7 + pick(v, 12, 4),
        wetGround(biome),
      ),
    );
    shapes.push(
      poly(irregularIso(cx + signed(v, 13, 3), cy + 2, 40, 16, v >> 4, 2), wetGround(biome)),
    );
  }
  if (!continuousBase && pick(v, 14, 10) === 0) {
    shapes.push(ell(cx + signed(v, 15, 10), cy + signed(v, 16, 3), 8 + pick(v, 17, 6), 4, p.dark));
  }
}

export function paintGroundCover(
  shapes: ShapeSpec[],
  biome: BiomeName,
  p: Palette,
  v: number,
  contour: TileContour,
): void {
  const cx = tileCx();
  const cy = tileCy();
  const dense = lush(biome);
  const dry = arid(biome);
  const density = pick(v, 260, 6);
  const clumps = density < 3 ? 1 : dense ? 2 + pick(v, 1, 2) : 1 + pick(v, 1, 2);
  for (let i = 0; i < clumps; i++) {
    const ox = signed(v, 20 + i, 12);
    const oy = signed(v, 50 + i, 4);
    if (dry) {
      shapes.push(ell(cx + ox - 3, cy + oy, 6 + pick(v, 80 + i, 5), 3, i % 2 ? p.light : p.dark));
    } else {
      const w = 6 + pick(v, 80 + i, 6);
      const h = 3 + pick(v, 90 + i, 2);
      const fill = i % 2 ? mixHex(p.accent, p.primary, 0.38) : mixHex(p.dark, p.secondary, 0.34);
      shapes.push(
        poly(irregularIso(cx + ox, cy + oy, w, h, 1), fill, mixHex(p.dark, p.secondary, 0.32), 0.5),
      );
      if (pick(v, 100 + i, 3) !== 0) {
        shapes.push(
          poly(
            irregularIso(cx + ox + 1, cy + oy - 1, 4 + pick(v, 110 + i, 3), 2, 1),
            mixHex(p.light, p.primary, 0.42),
          ),
        );
      }
    }
  }
  if (density >= 4 && pick(v, 120, 5) === 0) {
    const ox = signed(v, 121, 12);
    const oy = signed(v, 122, 3);
    shapes.push(ell(cx + ox - 5, cy + oy - 1, 10, 4, p.dark));
    shapes.push(ell(cx + ox - 2, cy + oy - 2, 5, 2, p.light));
  }
  if (dense && density >= 5 && pick(v, 4, 6) === 0) {
    pushBush(shapes, cx + signed(v, 5, 8), cy + signed(v, 6, 3), v, biome, p);
  }
  if (pick(v, 7, 14) === 0) {
    const lx = cx + signed(v, 8, 8);
    const ly = cy + signed(v, 9, 2);
    shapes.push(ell(lx - 7, ly - 2, 14, 5, p.dark));
    shapes.push(ell(lx - 3, ly - 2, 7, 2, p.secondary));
  }
  if (contour === "ridge" || pick(v, 10, 12) === 0) {
    shapes.push(ell(cx + signed(v, 11, 6), cy + 2, 6 + pick(v, 12, 4), 3, p.dark));
    shapes.push(ell(cx + signed(v, 13, 6), cy + 1, 3 + pick(v, 14, 3), 2, p.light));
  }
  if (density >= 4 && pick(v, 261, 5) === 0) paintBiomeSignature(shapes, biome, p, v, cx, cy);
  if (pick(v, 262, 8) === 0) paintBiomeLandmark(shapes, biome, p, v, cx, cy);
  paintBiomeGroundMotif(shapes, biome, p, v, cx, cy);
}

function paintBiomeGroundMotif(
  shapes: ShapeSpec[],
  biome: BiomeName,
  p: Palette,
  v: number,
  cx: number,
  cy: number,
): void {
  const marks =
    biome === "jungle wreckage" || biome === "salt marshes"
      ? 2 + pick(v, 330, 2)
      : biome === "glass desert" || biome === "volcanic shelf"
        ? 1 + pick(v, 330, 2)
        : 1 + pick(v, 330, 1);
  for (let i = 0; i < marks; i++) {
    const ox = signed(v, 332 + i, 12);
    const oy = signed(v, 340 + i, 4);
    if (biome === "tundra grid") {
      shapes.push(
        poly(
          [
            cx + ox - 4,
            cy + oy + 1,
            cx + ox - 1,
            cy + oy - 3,
            cx + ox + 4,
            cy + oy,
            cx + ox + 1,
            cy + oy + 2,
          ],
          mixHex(p.light, "#d4eeee", 0.4),
          p.dark,
          1,
        ),
      );
    } else if (biome === "crystal flats") {
      shapes.push(
        poly(
          [cx + ox - 2, cy + oy + 2, cx + ox, cy + oy - 5, cx + ox + 2, cy + oy + 1],
          mixHex(p.accent, p.light, 0.35),
          p.dark,
          1,
        ),
      );
    } else if (biome === "volcanic shelf") {
      shapes.push(ell(cx + ox - 2, cy + oy, 5, 2, mixHex(p.dark, "#9f3024", i % 2 ? 0.35 : 0.08)));
    } else if (biome === "jungle wreckage" || biome === "salt marshes") {
      if (i === 0 && pick(v, 348, 3) === 0) pushBush(shapes, cx + ox, cy + oy, v + i, biome, p);
      else
        shapes.push(
          ell(cx + ox - 2, cy + oy, 5 + pick(v, 350 + i, 4), 2, i % 2 ? p.accent : p.dark),
        );
    } else if (biome === "rust canyons") {
      shapes.push(
        line(cx + ox - 5, cy + oy, cx + ox + 5, cy + oy + 1, mixHex(p.dark, "#c16f3d", 0.35), 2),
      );
    } else if (biome === "glass desert") {
      shapes.push(ell(cx + ox - 4, cy + oy, 8, 3, i % 2 ? p.light : p.dark));
    } else {
      shapes.push(ell(cx + ox - 3, cy + oy, 6, 2, i % 2 ? p.light : p.dark));
    }
  }
}

export function paintRoad(
  shapes: ShapeSpec[],
  biome: BiomeName,
  v: number,
  surfaceMask: number,
): void {
  const cx = tileCx();
  const cy = tileCy();
  const dirt =
    biome === "tundra grid" ? "#344c54" : biome === "volcanic shelf" ? "#4a302d" : "#59483b";
  const worn =
    biome === "tundra grid" ? "#789fa2" : biome === "volcanic shelf" ? "#a95b48" : "#9a7651";
  const boundary = surfaceMask !== 0;
  shapes.push(poly(irregularIso(cx, cy, boundary ? 92 : 108, boundary ? 44 : 54, v, 3), dirt));
  if (boundary) {
    const detail = pick(v, 295, 6);
    if (detail <= 1) {
      shapes.push(
        poly(
          irregularIso(
            cx + signed(v, 296, 5),
            cy + signed(v, 297, 2),
            38 + pick(v, 298, 20),
            10,
            v >> 3,
            2,
          ),
          worn,
        ),
      );
      shapes.push(line(cx - 11, cy + 2, cx + 11, cy - 3, "#4a3c30", 1));
    } else if (detail === 2) {
      shapes.push(line(cx - 15, cy - 3, cx + 13, cy + 4, worn, 2));
    }
    if (biome === "tundra grid" && pick(v, 306, 3) === 0) {
      shapes.push(line(cx - 19, cy + 4, cx + 17, cy - 4, "#b9d6d2", 1));
      shapes.push(line(cx - 9, cy + 3, cx - 3, cy + 1, "#d7a956", 2));
      shapes.push(line(cx + 5, cy, cx + 11, cy - 2, "#d7a956", 2));
    }
    if (pick(v, 304, 9) === 0) paintRoadLandmark(shapes, biome, v, cx, cy);
  } else if (pick(v, 301, 9) === 0) {
    shapes.push(
      ell(cx + signed(v, 302, 14) - 5, cy + signed(v, 303, 4) - 2, 10, 4, mixHex(dirt, worn, 0.4)),
    );
  }
}

export function paintRoadLandmark(
  shapes: ShapeSpec[],
  biome: BiomeName,
  v: number,
  cx: number,
  cy: number,
): void {
  const feature = pick(v, 305, 4);
  if (feature === 0) {
    shapes.push(
      ell(cx - 17, cy - 7, 34, 12, biome === "tundra grid" ? "#55727b" : "#353d36", "#292b27"),
    );
    shapes.push(
      line(cx - 10, cy - 5, cx + 9, cy - 2, biome === "tundra grid" ? "#accfd2" : "#788b73", 1),
    );
  } else if (feature === 1) {
    for (let i = -1; i <= 1; i++) {
      shapes.push(
        line(
          cx - 22,
          cy - 5 + i * 4,
          cx + 21,
          cy + 5 + i * 4,
          i === 0 ? "#292820" : "#544838",
          i === 0 ? 2 : 1,
        ),
      );
    }
  } else if (feature === 2) {
    shapes.push(
      poly(
        [cx - 19, cy + 4, cx - 10, cy - 7, cx + 17, cy - 1, cx + 8, cy + 8],
        "#3c4441",
        "#202421",
        1,
      ),
    );
    for (let i = 0; i < 5; i++)
      shapes.push(
        line(cx - 12 + i * 6, cy - 4, cx - 9 + i * 6, cy + 4, i % 2 ? "#2c322f" : "#8b744c", 2),
      );
  } else {
    const green = biome === "jungle wreckage" || biome === "salt marshes";
    shapes.push(line(cx - 23, cy + 5, cx + 18, cy - 5, green ? "#29452d" : "#3b3429", 3));
    shapes.push(ell(cx - 8, cy - 8, 17, 7, green ? "#527344" : "#76573c"));
    shapes.push(ell(cx + 7, cy + 1, 12, 5, green ? "#3c5f38" : "#4a3d30"));
  }
}

export function paintConcrete(
  shapes: ShapeSpec[],
  biome: BiomeName,
  p: Palette,
  v: number,
  campaign: CampaignVisualProfile,
  surfaceMask: number,
): void {
  const cx = tileCx();
  const cy = tileCy();
  const materials: Record<BiomeName, [string, string, string, string]> = {
    "ash plains": ["#59605d", "#747d78", "#303735", "#9aa39c"],
    "crystal flats": ["#435d5d", "#63817c", "#223b3d", "#8fc9bd"],
    "rust canyons": ["#70503e", "#96684b", "#3e2d27", "#c58a5b"],
    "salt marshes": ["#45594e", "#657266", "#263a32", "#91a67d"],
    "glass desert": ["#83785f", "#aaa080", "#49463d", "#d1c49c"],
    "tundra grid": ["#425f68", "#93c0c1", "#22343d", "#d4efea"],
    "jungle wreckage": ["#34483d", "#536256", "#1d3028", "#77916a"],
    "volcanic shelf": ["#373535", "#5a5250", "#1c1b1d", "#d36a3d"],
  };
  const [rawBase, rawHi, rawLo, rawAccent] = materials[biome];
  const base = mixHex(rawBase, p.primary, 0.14);
  const hi = mixHex(rawHi, p.light, 0.14);
  const lo = mixHex(rawLo, p.dark, 0.12);
  const accent = mixHex(rawAccent, p.accent, 0.18);
  const interior = surfaceMask === 0;
  shapes.push(
    poly(
      irregularIso(cx, cy, interior ? 108 : 88, interior ? 54 : 43, v, 1),
      mixHex(base, lo, interior ? 0.06 : 0.12),
    ),
  );
  const panel = pick(v, 307, 5);
  if (!interior && panel >= 2) {
    shapes.push(
      poly(
        irregularIso(
          cx + signed(v, 308, 5),
          cy + signed(v, 309, 2),
          56 + pick(v, 311, 18),
          22 + pick(v, 312, 7),
          v >> 3,
          1,
        ),
        mixHex(base, panel === 4 ? hi : lo, panel === 4 ? 0.18 : 0.22),
      ),
    );
  }
  if (surfaceMask !== 0 && pick(v, 310, 11) <= 2) {
    const seam = campaign.terrainTreatment === "expeditionary" ? hi : accent;
    shapes.push(
      line(
        cx - 22 + signed(v, 313, 3),
        cy + 5,
        cx + 20,
        cy - 5 + signed(v, 314, 2),
        seam,
        panel === 4 ? 2 : 1,
      ),
    );
    if (pick(v, 316, 3) === 0) {
      shapes.push(line(cx - 17, cy + 6, cx + 14, cy - 2, mixHex(seam, lo, 0.42), 1));
    }
  }
  if (pick(v, 317, interior ? 18 : 8) <= (interior ? 1 : 3)) {
    paintConcreteBiomeDetail(shapes, biome, v, cx, cy, 2);
  }
  if (pick(v, 318, interior ? 17 : 7) === 0) {
    shapes.push(
      ell(
        cx + signed(v, 319, 18) - 7,
        cy + signed(v, 320, 5) - 2,
        14 + pick(v, 321, 13),
        4 + pick(v, 322, 4),
        mixHex(lo, base, 0.32),
      ),
    );
  }
  if (surfaceMask !== 0 && pick(v, 323, 11) === 0) {
    const hazard = campaign.terrainAccent === "red" ? "#d87868" : "#d5a64e";
    shapes.push(line(cx - 13, cy + 5, cx - 5, cy + 2, hazard, 2));
    shapes.push(line(cx - 3, cy + 1, cx + 5, cy - 2, hazard, 2));
  }
}

export function paintConcreteBiomeDetail(
  shapes: ShapeSpec[],
  biome: BiomeName,
  v: number,
  cx: number,
  cy: number,
  split: number,
): void {
  const feature = pick(v, 315, 4);
  if (biome === "jungle wreckage") {
    if (feature === 0) {
      shapes.push(line(cx - 23, cy + 6, cx + 17, cy - 6, "#203b2c", 3));
      shapes.push(line(cx - 12, cy + 5, cx - 8, cy - 8, "#77a563", 2));
      shapes.push(ell(cx + 8, cy - 5, 12, 5, "#355e3d"));
    } else if (feature === 1) {
      shapes.push(ell(cx - 18, cy - 7, 36, 13, "#172f2d", "#294b43"));
      shapes.push(ell(cx - 10, cy - 5, 18, 6, "#315d55"));
      shapes.push(line(cx - 7, cy - 6, cx + 7, cy - 3, "#80a89a", 1));
    } else if (feature === 2) {
      shapes.push(
        poly(
          [cx - 20, cy + 4, cx - 8, cy - 7, cx + 18, cy, cx + 7, cy + 8],
          "#66503b",
          "#231f1c",
          1,
        ),
      );
      for (let i = 0; i < 4; i++)
        shapes.push(
          line(cx - 12 + i * 7, cy - 4, cx - 8 + i * 7, cy + 4, i % 2 ? "#2a302a" : "#b57b3e", 2),
        );
    } else {
      shapes.push(line(cx - 20, cy + 6, cx + 5, cy - 3, "#182d20", 3));
      shapes.push(line(cx - 5, cy - 2, cx + 18, cy + 3, "#182d20", 3));
      shapes.push(line(cx - 4, cy - 1, cx + 2, cy - 9, "#679451", 2));
      shapes.push(ell(cx + 11, cy - 5, 9, 5, "#4c7a45"));
    }
  } else if (biome === "crystal flats") {
    const shift = feature * 3 - 5;
    shapes.push(
      poly(
        [cx - 12 + shift, cy + 5, cx - 6 + shift, cy - 10 - feature, cx - 1 + shift, cy + 3],
        "#8fcfc4",
        "#1c3435",
        1,
      ),
    );
    shapes.push(
      poly(
        [cx + 2 - shift, cy + 5, cx + 9 - shift, cy - 5, cx + 13 - shift, cy + 4],
        feature % 2 ? "#6f9fff" : "#5e9e94",
        "#1c3435",
        1,
      ),
    );
    if (feature >= 2) shapes.push(line(cx - 20, cy + 4, cx + 20, cy - 5, "#a8f4e5", 1));
  } else if (biome === "rust canyons") {
    if (feature < 2) {
      shapes.push(line(cx - 22, cy - 5 + feature * 4, cx + 20, cy + 6 - feature * 3, "#35231d", 4));
      shapes.push(line(cx - 18, cy - 4 + feature * 4, cx + 17, cy + 5 - feature * 3, "#c16f3d", 1));
    } else {
      shapes.push(
        poly(
          [cx - 18, cy + 5, cx - 11, cy - 7, cx + 16, cy - 2, cx + 10, cy + 8],
          "#754630",
          "#2b201c",
          1,
        ),
      );
      for (let i = 0; i < 5; i++)
        shapes.push(ell(cx - 12 + i * 7, cy - 3 + (i % 2) * 5, 3, 2, "#d0935d", "#35231d"));
    }
  } else if (biome === "salt marshes") {
    shapes.push(
      ell(cx - 20 + feature * 3, cy - 7, 34, 13, feature % 2 ? "#263f38" : "#625f44", "#1d302b"),
    );
    for (let i = 0; i < 3 + feature; i++)
      shapes.push(line(cx - 12 + i * 6, cy + 3, cx - 11 + i * 6, cy - 7 - (i % 3), "#8d9565", 1));
  } else if (biome === "glass desert") {
    shapes.push(
      poly(
        [cx - 22, cy + 3, cx - 7 + feature, cy - 9, cx + 22, cy + 1, cx + 5, cy + 9],
        feature % 2 ? "#313b3d" : "#806d52",
        "#d0c7aa",
        1,
      ),
    );
    shapes.push(line(cx - 7 + feature, cy - 8, cx + 14, cy, "#f0dfb6", 1));
  } else if (biome === "tundra grid") {
    shapes.push(
      poly(
        irregularIso(cx + feature * 2 - 3, cy, 42, 17, v >> 2, 2),
        feature % 2 ? "#6f8990" : "#9bb3b5",
        "#324c54",
        1,
      ),
    );
    shapes.push(line(cx - 22, cy - 4, cx + 20, cy + 6, "#d2efee", 2));
    if (feature >= 2) shapes.push(line(cx - 15, cy + 5, cx + 4, cy - 7, "#4c6970", 2));
  } else if (biome === "volcanic shelf") {
    shapes.push(line(cx - 22, cy - 4, cx - 4, cy + feature - 1, "#151417", 4));
    shapes.push(
      line(cx - 4, cy + feature - 1, cx + 21, cy - 3, feature % 2 ? "#9f3024" : "#d6572f", 3),
    );
    shapes.push(line(cx - 3, cy + feature - 2, cx + 18, cy - 3, "#ff9a46", 1));
  } else {
    if (feature < 2) {
      shapes.push(
        ell(
          cx + signed(v, 302, 10),
          cy + signed(v, 303, 3),
          10 + split * 2,
          5 + feature,
          "#343c39",
        ),
      );
      shapes.push(line(cx - 17, cy + 5, cx + 14, cy - 6, "#818b84", 1));
    } else {
      shapes.push(
        poly(
          [cx - 19, cy + 3, cx - 6, cy - 8, cx + 19, cy, cx + 8, cy + 7],
          "#4a514e",
          "#272e2c",
          1,
        ),
      );
      shapes.push(line(cx - 12, cy - 3, cx + 12, cy + 3, "#9aa39c", 2));
    }
  }
}
