import { describe, expect, it } from "vitest";
import { BUILDING_KINDS, UNIT_KINDS } from "../../lib/catalog";
import { assetById, assetPreviewSpec, spriteSpecToSvg, toAssetApiItem } from "../../lib/gen/assetApi";
import { listGeneratedAssets } from "../../lib/gen/assetCatalog";

describe("asset API contract", () => {
  it("exposes every Asset Bay entry with stable metadata and preview URLs", () => {
    const assets = listGeneratedAssets();
    const items = assets.map((asset) => toAssetApiItem(asset, "https://example.test/"));

    expect(items).toHaveLength(UNIT_KINDS.length * 2 + BUILDING_KINDS.length * 2);
    expect(items.every((item) => item.metadataUrl.startsWith("https://example.test/api/assets/"))).toBe(true);
    expect(items.every((item) => item.previewUrl.endsWith("/preview"))).toBe(true);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);

    const unit = items.find((item) => item.id === "unit:infantry")!;
    expect(unit.render.supportsFacing).toBe(true);
    expect(unit.render.directions).toHaveLength(8);
    expect(unit.render.directions[7]!.previewUrl).toContain("facing=7");
    expect(unit.render.directions[1]!.angleDegrees).toBeCloseTo(26.565, 2);
    expect(unit.render.directions[0]!.angleDegrees).toBe(0);
    const convoy = items.find((item) => item.id === "unit:convoyTruck")!;
    expect(convoy.label).toBe("Convoy Truck");
    expect(convoy.render.directions).toHaveLength(8);
    expect(convoy.details.stats).toMatchObject({ damage: 0, range: 0, cooldown: 0, scenarioOnly: true });
    expect(items.find((item) => item.id === "building:power")!.render.directions).toHaveLength(0);
  });

  it("renders wrecks from the same raster plate as the live unit", () => {
    const asset = assetById("wreck:infantry");
    expect(asset).toBeDefined();
    const spec = assetPreviewSpec(asset!);
    expect(spec.imageSrc).toMatch(/\/art\/sprites\/.+\.webp$/);
    expect(spec.svg).toBeUndefined();
    const live = assetPreviewSpec(assetById("unit:infantry")!, 2);
    expect(spec.imageSrc).toBe(live.imageSrc);
    expect(spec.imageTint).not.toBe(live.imageTint);
  });

  it("applies each facing to unit previews", () => {
    const units = listGeneratedAssets().filter((asset) => asset.category === "unit");
    for (const asset of units) {
      for (const facing of [0, 1, 2, 3, 4, 5, 6, 7] as const) {
        const spec = assetPreviewSpec(asset, facing);
        const svg = spriteSpecToSvg(spec, "https://example.test/unit.png");
        expect(spec.rotation).toBeUndefined();
        expect(svg).not.toContain("rotate(");
        if (spec.imageSrc) expect(svg).toContain(`<image href="https://example.test/unit.png"`);
        else expect(svg).toContain("<svg ");
      }
    }

    const infantry = assetById("unit:infantry")!;
    expect(spriteSpecToSvg(assetPreviewSpec(infantry, 0), "https://example.test/infantry.png"))
      .toContain('width="38" height="42" viewBox="0 0 38 42"');
    expect(spriteSpecToSvg(assetPreviewSpec(infantry, 6), "https://example.test/infantry.png"))
      .toContain('width="38" height="42" viewBox="0 0 38 42"');

    const harvester = assetById("unit:harvester")!;
    expect(spriteSpecToSvg(assetPreviewSpec(harvester, 2), "https://example.test/harvester.png"))
      .toContain('viewBox="0 0 535 580"');
  });
});
