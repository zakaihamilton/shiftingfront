import { BUILDING_KINDS, labelFor, UNIT_KINDS } from "../catalog";

export type CatalogAsset = {
  id: string;
  category: "unit" | "building" | "wreck" | "rubble";
  label: string;
  kind: string;
};

export type AssetCategoryFilter = CatalogAsset["category"] | "all";

export function filterGeneratedAssets(
  assets: readonly CatalogAsset[],
  filter: AssetCategoryFilter,
): readonly CatalogAsset[] {
  return filter === "all" ? assets : assets.filter((asset) => asset.category === filter);
}

export function listGeneratedAssets(): CatalogAsset[] {
  const assets: CatalogAsset[] = [];
  for (const kind of UNIT_KINDS) {
    assets.push({ id: `unit:${kind}`, category: "unit", label: labelFor(kind), kind });
  }
  for (const kind of BUILDING_KINDS) {
    assets.push({ id: `building:${kind}`, category: "building", label: labelFor(kind), kind });
  }
  for (const kind of UNIT_KINDS) {
    assets.push({ id: `wreck:${kind}`, category: "wreck", label: `${labelFor(kind)} wreck`, kind });
  }
  for (const kind of BUILDING_KINDS) {
    assets.push({
      id: `rubble:${kind}`,
      category: "rubble",
      label: `${labelFor(kind)} rubble`,
      kind,
    });
  }
  return assets;
}
