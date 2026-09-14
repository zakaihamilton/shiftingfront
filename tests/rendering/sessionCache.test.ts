// @vitest-environment jsdom

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearVisualProfileCache, generateCampaignVisualProfile, generateVisualProfile, visualProfileCacheSize } from "../../lib/gen/visualProfile";
import { clearRenderSessionCaches } from "../../lib/render/sessionCache";
import { entityVisibilityCacheSize, pruneEntityVisibilityCache, renderEntityOpacity } from "../../lib/render/renderPicking";
import { pruneTurretAimCache, turretAimMap } from "../../lib/render/renderStructures/turret";
import { addUnit, makeFixture } from "../../lib/sim/fixtures";
import { fogIndex } from "../../lib/sim/fog";
import { cachedSprite, rasterize, spriteCacheSize } from "../../lib/render/sprites";
import type { SpriteSpec } from "../../lib/types";

function sprite(id: string): SpriteSpec {
  return {
    id,
    kind: "tile",
    w: 1,
    h: 1,
    palette: {
      primary: "#000",
      secondary: "#000",
      accent: "#000",
      outline: "#000",
      light: "#000",
      dark: "#000",
    },
    shapes: [],
  };
}

function imageSprite(sourceW: number, sourceH: number): SpriteSpec {
  return {
    ...sprite("shared-image"),
    kind: "unit",
    w: 64,
    h: 60,
    imageSrc: "/shared.webp",
    imageCrop: { x: 0, y: 0, w: 32, h: 32, sourceW, sourceH },
  };
}

describe("render session caches", () => {
  let getContext: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterAll(() => {
    getContext.mockRestore();
  });

  beforeEach(() => {
    clearRenderSessionCaches();
  });

  it("keeps the raster cache at its 512-entry limit and evicts the oldest entry", () => {
    for (let index = 0; index < 512; index++) rasterize(sprite(`sprite-${index}`));
    expect(spriteCacheSize()).toBe(512);
    expect(cachedSprite("sprite-0")).toBeDefined();

    rasterize(sprite("sprite-512"));

    expect(spriteCacheSize()).toBe(512);
    expect(cachedSprite("sprite-0")).toBeUndefined();
    expect(cachedSprite("sprite-512")).toBeDefined();
  });

  it("keeps raster entries separate when image source dimensions differ", () => {
    const first = rasterize(imageSprite(384, 512));
    const second = rasterize(imageSprite(512, 384));

    expect(second).not.toBe(first);
    expect(spriteCacheSize()).toBe(2);
  });

  it("bounds and clears visual profile caches by session", () => {
    for (let seed = 0; seed < 80; seed++) {
      generateCampaignVisualProfile(seed);
      generateVisualProfile(seed, 0);
      generateVisualProfile(seed, 1);
    }
    expect(visualProfileCacheSize()).toEqual({ campaigns: 64, profiles: 128 });

    clearVisualProfileCache();

    expect(visualProfileCacheSize()).toEqual({ campaigns: 0, profiles: 0 });
  });

  it("clears raster and profile state through the session cleanup entrypoint", () => {
    rasterize(sprite("session-sprite"));
    generateVisualProfile(421, 0);

    clearRenderSessionCaches();

    expect(spriteCacheSize()).toBe(0);
    expect(visualProfileCacheSize()).toEqual({ campaigns: 0, profiles: 0 });
  });

  it("clears transient renderer state through the session cleanup entrypoint", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const enemy = addUnit(state, 1, "infantry", 4, 4);
    renderEntityOpacity(state, enemy, 0);
    turretAimMap.set(enemy.id, { angle: 0, lastMs: 0 });

    expect(entityVisibilityCacheSize()).toBe(1);
    expect(turretAimMap.size).toBe(1);

    clearRenderSessionCaches();

    expect(entityVisibilityCacheSize()).toBe(0);
    expect(turretAimMap.size).toBe(0);
  });

  it("prunes stale visibility and turret aim entries for destroyed entities", () => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const enemy = addUnit(state, 1, "infantry", 4, 4);
    renderEntityOpacity(state, enemy, 0);
    turretAimMap.set(enemy.id, { angle: 0, lastMs: 0 });
    turretAimMap.set(9999, { angle: 1, lastMs: 0 });

    pruneEntityVisibilityCache([enemy.id]);
    pruneTurretAimCache([enemy.id]);

    expect(entityVisibilityCacheSize()).toBe(1);
    expect(turretAimMap.has(enemy.id)).toBe(true);
    expect(turretAimMap.has(9999)).toBe(false);
  });

  it("renders a hostile unit fully opaque as soon as its tile is discovered", () => {
    const state = makeFixture({ width: 10, height: 10, win: { kind: "annihilate" } });
    state.fog.fill(0);
    const enemy = addUnit(state, 1, "infantry", 4, 4);

    expect(renderEntityOpacity(state, enemy, 0)).toBe(0);

    state.fog[fogIndex(state, 4, 4)!] = 2;
    expect(renderEntityOpacity(state, enemy, 1)).toBe(1);
  });
});
