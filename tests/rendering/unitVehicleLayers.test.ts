import { beforeEach, describe, expect, it, vi } from "vitest";
import { unitSprite } from "../../lib/gen/assets";
import { UNIT_VEHICLE_LAYERS } from "../../lib/gen/unitAnimationAssets";
import { makeFixture } from "../../lib/sim/fixtures";
import { terrainLightRigForBiome } from "../../lib/render/terrainLighting";
import { resetUnitFacingBlends, unitFacingLayers } from "../../lib/render/unitFacingBlend";
import { drawLayeredVehicle, unitWeaponSockets } from "../../lib/render/unitVehicleLayers";

const mocks = vi.hoisted(() => ({
  ready: new Set<string>(),
  rasterize: vi.fn(() => ({} as HTMLCanvasElement)),
  light: vi.fn((image: HTMLCanvasElement) => image),
  draw: vi.fn(),
}));
vi.mock("../../lib/render/sprites", () => ({
  rasterize: mocks.rasterize,
  isRasterReady: (spec: { imageSrc: string }) => mocks.ready.has(spec.imageSrc),
}));
vi.mock("../../lib/render/unitLighting", () => ({ litUnitRaster: mocks.light }));
vi.mock("../../lib/render/unitSpriteBlend", () => ({ drawBlendedUnitSprites: mocks.draw }));

describe("cold articulated vehicle views", () => {
  beforeEach(() => {
    mocks.ready.clear(); vi.clearAllMocks(); resetUnitFacingBlends(); unitWeaponSockets.clear();
  });

  it.each(["tank", "behemoth"] as const)("waits for outgoing %s parts before lighting and drawing a turn", kind => {
    const state = makeFixture({ win: { kind: "annihilate" } });
    const art = UNIT_VEHICLE_LAYERS[kind];
    for (const part of ["hull", "turret", "barrel"] as const) mocks.ready.add(art["front-right"][part]);
    // The full sprite was facing right before articulated artwork was available.
    unitFacingLayers(7, 0, 0, 140, true);
    unitFacingLayers(-8, 0, 0, 110, true);
    const ctx = { getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }) } as CanvasRenderingContext2D;
    const options = { id: 7, kind, base: unitSprite(kind, state.factions[0]!.palette), hullFacing: 1 as const,
      turretYaw: -Math.PI / 4, x: 100, groundY: 100, zoom: 1, time: 10, alpha: 1, recoil: 0,
      reducedMotion: false, rig: terrainLightRigForBiome(421, "ash plains"), flash: 0 };
    unitWeaponSockets.set(7, { x: 1, y: 1 });
    expect(drawLayeredVehicle(ctx, options)).toBe(false);
    expect(mocks.light).not.toHaveBeenCalled();
    expect(mocks.draw).not.toHaveBeenCalled();
    expect(unitWeaponSockets.has(7)).toBe(false);
    for (const part of ["hull", "turret", "barrel"] as const) {
      expect(mocks.rasterize).toHaveBeenCalledWith(expect.objectContaining({ imageSrc: art.right[part] }));
      mocks.ready.add(art.right[part]);
    }
    // Once the missing files load, the same blend can paint all three parts.
    expect(drawLayeredVehicle(ctx, { ...options, time: 20 })).toBe(true);
    expect(mocks.draw).toHaveBeenCalledTimes(3);
    expect(unitWeaponSockets.has(7)).toBe(true);
  });
});
