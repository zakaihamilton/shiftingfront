import { ASSET_API_HEADERS, ASSET_FACINGS, assetCorsPreflight, assetPreviewSpec, spriteSpecToSvg, withAssetRoute } from "@/lib/gen/assetApi";
import type { Facing } from "@/lib/types";

export const GET = withAssetRoute((asset, request) => {
  const url = new URL(request.url);
  const rawFacing = url.searchParams.get("facing");
  const facing = rawFacing === null ? 0 : Number(rawFacing);
  if (!Number.isInteger(facing) || !ASSET_FACINGS.includes(facing as Facing)) {
    return Response.json({ error: "facing must be an integer from 0 to 7" }, { status: 400, headers: ASSET_API_HEADERS });
  }
  if (asset.category !== "unit" && facing !== 0) {
    return Response.json({ error: "This asset does not support directional previews" }, { status: 400, headers: ASSET_API_HEADERS });
  }

  const spec = assetPreviewSpec(asset, facing as Facing);
  if (spec.imageSrc && asset.category !== "unit") {
    return new Response(null, {
      status: 307,
      headers: {
        ...ASSET_API_HEADERS,
        Location: new URL(spec.imageSrc, request.url).toString(),
      },
    });
  }

  const svgContent = spec.svg ?? spriteSpecToSvg(spec, spec.imageSrc ? new URL(spec.imageSrc, request.url).toString() : undefined);
  return new Response(svgContent, {
    headers: {
      ...ASSET_API_HEADERS,
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
});

export function OPTIONS(request: Request) {
  return assetCorsPreflight(request);
}
