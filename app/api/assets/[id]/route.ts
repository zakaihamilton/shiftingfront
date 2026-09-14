import { ASSET_API_HEADERS, ASSET_API_VERSION, assetCorsPreflight, toAssetApiItem, withAssetRoute } from "@/lib/gen/assetApi";

export const GET = withAssetRoute((asset, request) => {
  return Response.json(
    { apiVersion: ASSET_API_VERSION, asset: toAssetApiItem(asset, request.url) },
    { headers: ASSET_API_HEADERS },
  );
});

export function OPTIONS(request: Request) {
  return assetCorsPreflight(request);
}
