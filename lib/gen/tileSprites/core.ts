import {
  type ShapeSpec,
  type SpriteSpec,
  SURFACE_CONCRETE,
  SURFACE_ROAD,
  type TileSpriteOptions,
} from "../../types";
import { hash, terrainPalette, terrainZonePalette } from "../tilePalette";
import { TERRAIN_ART } from "../visualAssets";
import { campaignProfileKey, generateCampaignVisualProfile } from "../visualProfile";
import {
  ART_PIXEL_SCALE,
  defaultContour,
  SPRITE_H,
  SPRITE_W,
  TERRAIN_ART_REV,
  TILE_SPRITE_PAD_X,
  TILE_SPRITE_PAD_Y,
  tileCx,
  tileCy,
} from "./constants";
import { paintConcrete, paintFloor, paintGroundCover, paintRoad } from "./paintGround";
import { paintBlocker, paintOreField, paintRidge, paintWater } from "./paintTerrain";

export { TILE_SPRITE_PAD_X, TILE_SPRITE_PAD_Y };

export function tileSprite(
  kind: "clear" | "water" | "resource" | "blocked",
  elev = 1,
  variantOrOptions: number | TileSpriteOptions = 0,
): SpriteSpec {
  const opts =
    typeof variantOrOptions === "number" ? { variant: variantOrOptions } : variantOrOptions;
  const biome = opts.biome ?? "ash plains";
  const variant = opts.variant ?? 0;
  const campaign = opts.campaignProfile ?? generateCampaignVisualProfile(0);
  const v = hash((variant & 0xff) + elev * 17);
  const contour = opts.contour ?? defaultContour(kind, elev);
  const floorElev = contour === "bank" || kind === "water" ? 0 : elev;
  const p = terrainZonePalette(terrainPalette(biome, floorElev, campaign), variant);
  const cx = tileCx();
  const cy = tileCy();
  const mask = opts.edgeMask ?? 0;
  const surfaceMask = opts.surfaceMask ?? 15;
  const shapes: ShapeSpec[] = [];

  paintFloor(shapes, biome, p, v, kind, contour, opts.surface, surfaceMask);
  if (opts.surface === SURFACE_ROAD) paintRoad(shapes, biome, v, surfaceMask);
  else if (opts.surface === SURFACE_CONCRETE)
    paintConcrete(shapes, biome, p, v, campaign, surfaceMask);
  else if (kind !== "water" && kind !== "resource") paintGroundCover(shapes, biome, p, v, contour);

  if (kind === "water" && surfaceMask !== 0) {
    paintWater(shapes, biome, v, mask);
  }

  if (contour === "ridge") paintRidge(shapes, biome, p, v, mask);
  if (kind === "resource")
    paintOreField(
      shapes,
      biome,
      v,
      opts.resourceLevel ?? 4,
      surfaceMask === -1 || surfaceMask === 0,
    );
  else if (kind === "blocked" && contour !== "ridge") paintBlocker(shapes, biome, p, v, cx, cy);

  const plate = kind === "water" ? undefined : TERRAIN_ART[campaign.terrainTreatment];
  return {
    id: tileSpriteId(kind, elev, { ...opts, biome, variant, contour, campaignProfile: campaign }),
    kind: "tile",
    w: SPRITE_W,
    h: SPRITE_H,
    palette: p,
    shapes,
    pixelScale: ART_PIXEL_SCALE,
    imageTextureSrc: plate,
    imageTextureOpacity: plate ? 0.3 : undefined,
    imageTextureOffset: plate ? variant & 0xff : undefined,
  };
}

export function tileSpriteId(
  kind: "clear" | "water" | "resource" | "blocked",
  elev = 1,
  opts: TileSpriteOptions = {},
): string {
  const biome = opts.biome ?? "ash plains";
  const variant = opts.variant ?? 0;
  const contour = opts.contour ?? defaultContour(kind, elev);
  const campaign = opts.campaignProfile ?? generateCampaignVisualProfile(0);
  return `tile:${TERRAIN_ART_REV}:${kind}:${biome}:${campaignProfileKey(campaign)}:${elev}:${variant}:${opts.edgeMask ?? 0}:${opts.surfaceMask ?? 15}:${opts.surface ?? 0}:${opts.resourceLevel ?? 0}:${contour}`;
}
