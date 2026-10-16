import { describe, expect, it } from "vitest";
import type { Facing } from "../../lib/types";
import {
  TILE_H,
  TILE_W,
  HEIGHT_STEP,
  cameraViewQuad,
  createCamera,
  expandIsoDiamond,
  isoAtlasTransform,
  isoFacingAngle,
  isoFacingAngleDegrees,
  screenAngleToFacing,
  screenToGroundTile,
  screenToTile,
  tileToScreen,
  toIsometricFacing,
} from "../../lib/iso";

describe("orthographic battlefield projection", () => {
  it("round-trips tile coordinates through screen space", () => {
    const cam = createCamera();
    cam.x = 120;
    cam.y = -40;
    cam.zoom = 1.25;
    const screen = tileToScreen(6.5, 3.25, cam, 2);
    const tile = screenToTile(screen.x, screen.y, cam);
    expect(tile.x).toBeCloseTo(6.5);
    expect(tile.y).toBeCloseTo(3.25);
  });

  it("keeps tile positions flat across elevation and picks their square centers", () => {
    expect(HEIGHT_STEP).toBe(14);
    const cam = createCamera();
    const ground = tileToScreen(4, 4, cam, 0);
    const raised = tileToScreen(4, 4, cam, 2);
    expect(raised.x).toBe(ground.x);
    expect(raised.y).toBe(ground.y);

    const picked = screenToGroundTile(ground.x, ground.y + (TILE_H / 2) * cam.zoom, cam);
    expect(picked.x).toBeCloseTo(4);
    expect(picked.y).toBeCloseTo(4);
  });

  it("returns a four-corner ground quad for the camera view", () => {
    const cam = createCamera();
    const quad = cameraViewQuad(cam, 640, 480);
    expect(quad).toHaveLength(4);
    expect(quad[0]!.y).toBeCloseTo(quad[1]!.y);
    expect(quad[1]!.x).toBeCloseTo(quad[2]!.x);
  });

  it("expands a square tile around its vertical center", () => {
    expect(expandIsoDiamond(10, 20, 64, 32, 1.5)).toEqual({
      x: 10,
      y: 20 - 8,
      w: 96,
      h: 48,
    });
  });

  it("builds an axis-aligned atlas transform onto a square tile", () => {
    const [a, b, c, d, e, f] = isoAtlasTransform(8, 16, TILE_W, TILE_H, 8, 8);
    expect([a, b, c, d, e, f]).toEqual([8, 0, 0, 8, -24, 16]);
  });

  it("maps between 8-way compass facings and screen angles", () => {
    // Each of the 8 facings round-trips through screenAngleToFacing(isoFacingAngle(f))
    for (let f = 0; f < 8; f++) {
      const angle = isoFacingAngle(f as Facing);
      expect(screenAngleToFacing(angle)).toBe(f);
    }

    // Map axes and screen axes now match directly.
    expect(toIsometricFacing(1, 0)).toBe(0);    // East
    expect(toIsometricFacing(1, 1)).toBe(1);    // South-East
    expect(toIsometricFacing(0, 1)).toBe(2);    // South
    expect(toIsometricFacing(-1, 1)).toBe(3);   // South-West
    expect(toIsometricFacing(-1, 0)).toBe(4);   // West
    expect(toIsometricFacing(-1, -1)).toBe(5);  // North-West
    expect(toIsometricFacing(0, -1)).toBe(6);   // North
    expect(toIsometricFacing(1, -1)).toBe(7);   // North-East
  });

  it("publishes screen-space facing degrees that match isoFacingAngle", () => {
    expect(isoFacingAngleDegrees(0)).toBe(0);
    expect(isoFacingAngleDegrees(1)).toBe(45);
    expect(isoFacingAngleDegrees(2)).toBe(90);
    expect(isoFacingAngleDegrees(4)).toBe(180);
    expect(isoFacingAngleDegrees(6)).toBe(270);
  });
});
