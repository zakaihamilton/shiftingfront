import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildingSprite, unitSprite } from "../../lib/gen/assets";
import { generateFactions } from "../../lib/gen/factions";
import { RASTER_ART, SPRITE_ART, TERRAIN_ART, TEXTURE_ART } from "../../lib/gen/visualAssets";
import {
  campaignProfileKey,
  generateCampaignVisualProfile,
  generateVisualProfile,
  profileKey,
} from "../../lib/gen/visualProfile";

describe("cinematic visual profiles", () => {
  it("derives stable but varied faction identities from seed and owner", () => {
    for (const seed of [0, 42, 421, 1847, 9999]) {
      expect(generateVisualProfile(seed, 0)).toEqual(generateVisualProfile(seed, 0));
      expect(generateVisualProfile(seed, 0)).toBe(generateVisualProfile(seed, 0));
    }
    const profiles = [0, 42, 421, 1847, 8162, 9999].flatMap((seed) => [
      profileKey(generateVisualProfile(seed, 0)),
      profileKey(generateVisualProfile(seed, 1)),
    ]);
    expect(new Set(profiles).size).toBeGreaterThan(7);
    expect(new Set(profiles.map((value) => value.split(":")[0])).size).toBe(3);
  });

  it("selects a stable shared tactical art family for every campaign", () => {
    for (const seed of [0, 42, 421, 1847, 9999]) {
      expect(generateCampaignVisualProfile(seed)).toEqual(generateCampaignVisualProfile(seed));
      expect(generateVisualProfile(seed, 0).designFamily).toBe(
        generateCampaignVisualProfile(seed).family,
      );
      expect(generateVisualProfile(seed, 1).designFamily).toBe(
        generateCampaignVisualProfile(seed).family,
      );
    }
    const keys = Array.from({ length: 96 }, (_, seed) =>
      campaignProfileKey(generateCampaignVisualProfile(seed)),
    );
    expect(new Set(keys.map((key) => key.split(":")[0])).size).toBe(3);
  });

  it("includes visual identity in sprite cache keys and silhouettes", () => {
    const palette = generateFactions(421)[0].palette;
    const profiles = ([0, 1, 2] as const).map((designFamily) => ({
      ...generateVisualProfile(421, 0),
      designFamily,
    }));
    const units = profiles.map((profile) =>
      unitSprite("tank", palette, { facing: 2, variant: 9, profile }),
    );
    const buildings = profiles.map((profile) =>
      buildingSprite("factory", palette, { variant: 9, profile }),
    );
    expect(new Set(units.map((spec) => spec.id)).size).toBe(3);
    expect(new Set(units.map((spec) => spec.imageTint ?? spec.svg)).size).toBe(3);
    expect(new Set(buildings.map((spec) => spec.id)).size).toBe(3);
    expect(new Set(buildings.map((spec) => spec.imageTint ?? spec.svg)).size).toBe(3);
  });

  it("tints live units and finished buildings from each faction palette", () => {
    const [ally, enemy] = generateFactions(421);
    const profile = generateVisualProfile(421, 0);
    const units = [
      unitSprite("tank", ally.palette, { facing: 2, variant: 9, profile }),
      unitSprite("tank", enemy.palette, { facing: 2, variant: 9, profile }),
    ];
    const buildings = [
      buildingSprite("factory", ally.palette, { variant: 9, profile }),
      buildingSprite("factory", enemy.palette, { variant: 9, profile }),
    ];
    expect(units[0]!.imageTint).not.toBe(units[1]!.imageTint);
    expect(buildings[0]!.imageTint).not.toBe(buildings[1]!.imageTint);
    expect(units[0]!.imageTint).toMatch(/^hsla\(/);
    expect(units[0]!.imageTint).toMatch(/\/ 0\.14\)$/);
    expect(buildings[0]!.imageTint).toBe(units[0]!.imageTint);
  });

  it("bundles every declared raster plate and texture locally", () => {
    const assets = [
      ...Object.values(RASTER_ART),
      ...Object.values(SPRITE_ART),
      ...Object.values(TERRAIN_ART),
      ...Object.values(TEXTURE_ART),
    ];
    expect(new Set(assets).size).toBe(assets.length);
    for (const asset of assets) {
      const file = join(process.cwd(), "public", asset);
      expect(existsSync(file), asset).toBe(true);
      expect(statSync(file).size, asset).toBeGreaterThan(1_000);
    }
  });
});
