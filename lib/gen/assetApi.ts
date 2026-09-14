import { BUILDING_STATS, UNIT_STATS } from "../catalog";
import { isoFacingAngleDegrees } from "../iso";
import { buildingSprite, rubbleSprite, unitSprite, wreckSprite } from "./assets";
import { listGeneratedAssets, type CatalogAsset } from "./assetCatalog";
import { generateVisualProfile } from "./visualProfile";
import { generateFactions } from "./factions";
import { rotatedSpriteBounds } from "./spriteBounds";
import type { Facing, ShapeSpec, SpriteSpec } from "../types";

export const ASSET_API_VERSION = 1;
export const ASSET_API_CATEGORIES = ["unit", "building", "wreck", "rubble"] as const;
export const ASSET_API_HEADERS = {
  "Cache-Control": "public, max-age=3600, s-maxage=3600",
  "Access-Control-Allow-Origin": "*",
};

export function assetCorsPreflight(request: Request): Response {
  const requestedHeaders = request.headers.get("Access-Control-Request-Headers");
  return new Response(null, {
    headers: {
      ...ASSET_API_HEADERS,
      Allow: "GET, OPTIONS",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": requestedHeaders ?? "Content-Type",
    },
  });
}

const DEFAULT_SEED = 421;
const DEFAULT_PALETTE = generateFactions(DEFAULT_SEED)[0].palette;
const DEFAULT_PROFILE = { ...generateVisualProfile(DEFAULT_SEED, 0), designFamily: 0 as const };
export const ASSET_FACINGS: Facing[] = [0, 1, 2, 3, 4, 5, 6, 7];

export function resolveAssetParam(id: string) {
  let decodedId: string;
  try {
    decodedId = decodeURIComponent(id);
  } catch {
    return {
      errorResponse: Response.json(
        { error: "Asset id is not valid URL encoding" },
        { status: 400, headers: ASSET_API_HEADERS },
      ),
    };
  }
  const asset = assetById(decodedId);
  if (!asset) {
    return {
      errorResponse: Response.json({ error: "Asset not found" }, { status: 404, headers: ASSET_API_HEADERS }),
    };
  }
  return { asset };
}

export type AssetRouteContext = { params: Promise<{ id: string }> };

export function withAssetRoute(
  handler: (asset: CatalogAsset, request: Request) => Response | Promise<Response>,
) {
  return function GET(request: Request, { params }: AssetRouteContext) {
    return params.then((p) => {
      const { asset, errorResponse } = resolveAssetParam(p.id);
      if (!asset || errorResponse) return errorResponse;
      return handler(asset, request);
    });
  };
}

export type AssetDirection = {
  facing: Facing;
  angleDegrees: number;
  previewUrl: string;
};

export type AssetApiItem = CatalogAsset & {
  metadataUrl: string;
  previewUrl: string;
  render: {
    format: "image" | "svg";
    width: number;
    height: number;
    sourceUrl: string;
    supportsFacing: boolean;
    directions: AssetDirection[];
  };
  details: Record<string, unknown>;
};

export function assetById(id: string): CatalogAsset | undefined {
  return listGeneratedAssets().find((asset) => asset.id === id);
}

export function assetPreviewSpec(asset: CatalogAsset, facing: Facing = 0): SpriteSpec {
  if (asset.category === "unit") {
    return unitSprite(asset.kind as Parameters<typeof unitSprite>[0], DEFAULT_PALETTE, {
      facing,
      animationFrame: 0,
      variant: 11,
      profile: DEFAULT_PROFILE,
    });
  }
  if (asset.category === "building") {
    return buildingSprite(asset.kind as Parameters<typeof buildingSprite>[0], DEFAULT_PALETTE, {
      constructionStage: 3,
      damageStage: 0,
      variant: 13,
      profile: DEFAULT_PROFILE,
    });
  }
  if (asset.category === "wreck") {
    return wreckSprite(asset.kind as Parameters<typeof wreckSprite>[0], DEFAULT_PALETTE, {
      profile: DEFAULT_PROFILE,
    });
  }
  return rubbleSprite(asset.kind as Parameters<typeof rubbleSprite>[0], DEFAULT_PALETTE, {
    profile: DEFAULT_PROFILE,
  });
}

function detailsFor(asset: CatalogAsset): Record<string, unknown> {
  if (asset.category === "unit") return { stats: UNIT_STATS[asset.kind as keyof typeof UNIT_STATS] };
  if (asset.category === "building") return { stats: BUILDING_STATS[asset.kind as keyof typeof BUILDING_STATS] };
  return { baseAssetId: `${asset.category === "wreck" ? "unit" : "building"}:${asset.kind}` };
}

export function toAssetApiItem(asset: CatalogAsset, requestUrl: string): AssetApiItem {
  const encodedId = encodeURIComponent(asset.id);
  const baseUrl = new URL("/api/assets/", requestUrl);
  const metadataUrl = new URL(encodedId, baseUrl).toString();
  const previewUrl = new URL(`${encodedId}/preview`, baseUrl).toString();
  const spec = assetPreviewSpec(asset);
  const supportsFacing = asset.category === "unit";
  const directions = supportsFacing
    ? ASSET_FACINGS.map((facing) => ({
      facing,
      angleDegrees: isoFacingAngleDegrees(facing),
      previewUrl: directionUrl(previewUrl, facing),
    }))
    : [];
  const sourceUrl = supportsFacing
    ? previewUrl
    : spec.imageSrc
      ? new URL(spec.imageSrc, requestUrl).toString()
      : previewUrl;

  return {
    ...asset,
    metadataUrl,
    previewUrl,
    render: {
      format: supportsFacing || !spec.imageSrc ? "svg" : "image",
      width: spec.w,
      height: spec.h,
      sourceUrl,
      supportsFacing,
      directions,
    },
    details: detailsFor(asset),
  };
}

function directionUrl(previewUrl: string, facing: Facing): string {
  const url = new URL(previewUrl);
  url.searchParams.set("facing", String(facing));
  return url.toString();
}

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]!);
}

function shapeToSvg(shape: ShapeSpec): string {
  const common = `fill="${escapeXml(shape.fill)}"${shape.stroke ? ` stroke="${escapeXml(shape.stroke)}"` : ""}${shape.strokeWidth ? ` stroke-width="${shape.strokeWidth}"` : ""}${shape.alpha !== undefined ? ` opacity="${shape.alpha}"` : ""}`;
  if (shape.type === "rect") return `<rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" ${common}/>`;
  if (shape.type === "ellipse") return `<ellipse cx="${shape.x + shape.w / 2}" cy="${shape.y + shape.h / 2}" rx="${shape.w / 2}" ry="${shape.h / 2}" ${common}/>`;
  if (shape.type === "line") return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + shape.w}" y2="${shape.y + shape.h}" ${common}/>`;
  const points = shape.type === "diamond"
    ? [shape.x + shape.w / 2, shape.y, shape.x + shape.w, shape.y + shape.h / 2, shape.x + shape.w / 2, shape.y + shape.h, shape.x, shape.y + shape.h / 2]
    : shape.points ?? [];
  return `<polygon points="${points.join(" ")}" ${common}/>`;
}

type SvgViewport = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

function cleanSvgNumber(value: number): number {
  const clean = Math.abs(value) < 0.000001 ? 0 : value;
  return Math.round(clean * 1000) / 1000;
}

function spriteViewport(spec: SpriteSpec): SvgViewport {
  const bounds = rotatedSpriteBounds(spec);
  return {
    minX: cleanSvgNumber(bounds.minX),
    minY: cleanSvgNumber(bounds.minY),
    width: cleanSvgNumber(bounds.width),
    height: cleanSvgNumber(bounds.height),
  };
}

export function spriteSpecToSvg(spec: SpriteSpec, imageUrl?: string): string {
  const shapes = spec.shapes.map(shapeToSvg).join("");
  const image = spec.imageSrc && imageUrl
    ? spec.imageCrop
      ? `<svg x="0" y="0" width="${spec.w}" height="${spec.h}" viewBox="${spec.imageCrop.x} ${spec.imageCrop.y} ${spec.imageCrop.w} ${spec.imageCrop.h}" preserveAspectRatio="xMidYMax meet"><image href="${escapeXml(imageUrl)}" x="0" y="0" width="${spec.imageCrop.sourceW}" height="${spec.imageCrop.sourceH}" preserveAspectRatio="none"/></svg>`
      : `<image href="${escapeXml(imageUrl)}" x="0" y="0" width="${spec.w}" height="${spec.h}" preserveAspectRatio="xMidYMax meet"${spec.rotation ? ` transform="rotate(${spec.rotation * 180 / Math.PI} ${spec.anchorX ?? spec.w / 2} ${spec.anchorY ?? spec.h})"` : ""}/>`
    : "";
  const viewport = spriteViewport(spec);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${viewport.width}" height="${viewport.height}" viewBox="${viewport.minX} ${viewport.minY} ${viewport.width} ${viewport.height}">${shapes}${image}</svg>`;
}
