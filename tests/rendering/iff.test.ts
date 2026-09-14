import { describe, expect, it } from "vitest";
import { unitSprite } from "../../lib/gen/assets";
import { generateFactions } from "../../lib/gen/factions";
import { generateVisualProfile } from "../../lib/gen/visualProfile";
import {
  ALLY_IFF_HEX,
  ENEMY_IFF_HEX,
  NEUTRAL_IFF_HEX,
  iffColors,
} from "../../lib/render/iff";

describe("iffColors", () => {
  it("uses cyan for allies, red for enemies, and gold for neutrals", () => {
    expect(iffColors(0).hex).toBe(ALLY_IFF_HEX);
    expect(iffColors(1).hex).toBe(ENEMY_IFF_HEX);
    expect(iffColors(0).hex).toBe("#46e2ff");
    expect(iffColors(1).hex).toBe("#ff4d36");
    expect(iffColors(1, true).hex).toBe(NEUTRAL_IFF_HEX);
    expect(iffColors(1, true).hex).not.toBe(ENEMY_IFF_HEX);
    expect(iffColors(0, true).pip).not.toBe(iffColors(1).pip);
  });

  it("keeps laser strokes on the same friend/foe tokens", () => {
    expect(iffColors(0).laser).toBe("rgba(70, 226, 255, 0.45)");
    expect(iffColors(1).laser).toBe("rgba(255, 77, 54, 0.45)");
    expect(iffColors(0).laserFill).toBe("rgba(70, 226, 255, 0.28)");
    expect(iffColors(1).laserFill).toBe("rgba(255, 77, 54, 0.28)");
  });

  it("adapts IFF colors for colorblindness modes", () => {
    // Deuteranopia & Protanopia swap red enemy IFF to safety orange
    const deutAlly = iffColors(0, false, "deuteranopia");
    const deutEnemy = iffColors(1, false, "deuteranopia");
    expect(deutAlly.hex).toBe("#38bdf8"); // sky/cyan
    expect(deutEnemy.hex).toBe("#fb923c"); // orange
    expect(deutEnemy.laser).toContain("251, 146, 60");

    const protEnemy = iffColors(1, false, "protanopia");
    expect(protEnemy.hex).toBe("#fb923c");

    // Tritanopia uses teal for ally and rose for enemy
    const tritAlly = iffColors(0, false, "tritanopia");
    const tritEnemy = iffColors(1, false, "tritanopia");
    expect(tritAlly.hex).toBe("#14b8a6");
    expect(tritEnemy.hex).toBe("#f43f5e");
  });
});

describe("faction raster tints", () => {
  it("gives owner 0 and owner 1 different live unit washes", () => {
    const [ally, enemy] = generateFactions(421);
    const profile = generateVisualProfile(421, 0);
    const a = unitSprite("tank", ally.palette, { facing: 2, profile });
    const b = unitSprite("tank", enemy.palette, { facing: 2, profile });
    expect(a.imageTint).not.toBe(b.imageTint);
    expect(a.imageTint).toMatch(/^hsla\(/);
    expect(b.imageTint).toMatch(/^hsla\(/);
    expect(a.imageTint).toMatch(/\/ 0\.14\)$/);
    expect(b.imageTint).toMatch(/\/ 0\.14\)$/);
  });
});
