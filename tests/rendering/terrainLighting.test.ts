import { describe, expect, it } from "vitest";
import {
  gradeTerrainColor,
  terrainPropLightGain,
  terrainPropLightFactor,
  restrainTerrainColor,
  terrainEdgeDarkening,
  terrainLightFactor,
  terrainLightRigFor,
} from "../../lib/render/terrainLighting";
import { generateCampaignVisualProfile } from "../../lib/gen/visualProfile";

describe("terrain lighting", () => {
  it("keeps a stable seeded light rig and bounds surface response", () => {
    const rig = terrainLightRigFor(832);
    expect(terrainLightRigFor(832)).toBe(rig);
    expect(rig.directionX).toBeGreaterThan(0);
    expect(rig.directionY).toBeGreaterThan(0);
    expect(terrainEdgeDarkening(rig, 0, 0)).toBe(1);
    expect(terrainEdgeDarkening(rig, 1, 1)).toBeLessThan(1);
    for (const fx of [0, 0.5, 1]) {
      for (const fy of [0, 0.5, 1]) {
        const factor = terrainLightFactor(rig, 2, 1, 1, fx, fy);
        expect(factor).toBeGreaterThanOrEqual(0.76);
        expect(factor).toBeLessThanOrEqual(1.12);
      }
    }
  });

  it("shares deterministic low-contrast light response with props", () => {
    const world = {
      seed: 832,
      biome: "ash plains" as const,
      width: 4,
      height: 4,
      tiles: new Array(16).fill(0),
      heights: new Array(16).fill(1),
    };
    const flat = terrainPropLightFactor(world, 1, 1);
    world.heights[5] = 3;
    const raised = terrainPropLightFactor(world, 1, 1);
    expect(terrainPropLightFactor(world, 1, 1)).toBe(raised);
    expect(raised).toBeGreaterThan(flat);
    expect(raised - flat).toBeLessThan(0.25);
    expect(terrainPropLightGain(world, 1, 1)).toBeGreaterThanOrEqual(0.82);
    expect(terrainPropLightGain(world, 1, 1)).toBeLessThanOrEqual(1.02);
  });

  it("brightens the lit corner and restrains excessive ground chroma", () => {
    const rig = terrainLightRigFor(421);
    expect(terrainLightFactor(rig, 2, 1, 1, 0.05, 0.05))
      .toBeGreaterThan(terrainLightFactor(rig, 2, 1, 1, 0.95, 0.95));
    const restrained = restrainTerrainColor({ r: 220, g: 80, b: 42 }, 0.1);
    expect(restrained.g).toBeGreaterThan(80);
    expect(restrained.r).toBeLessThan(220);
    const graded = gradeTerrainColor({ r: 100, g: 120, b: 110 }, 1.08, rig);
    expect(graded.r).toBeGreaterThan(100);
  });

  it("keeps explicit profiles isolated from the seed-only rig cache", () => {
    const defaultRig = terrainLightRigFor(832);
    const profile = generateCampaignVisualProfile(832);
    const alternateAccent = profile.terrainAccent === "red" ? "cyan" : "red";
    const alternateRig = terrainLightRigFor(832, { ...profile, terrainAccent: alternateAccent });
    expect(alternateRig.keyColor).not.toEqual(defaultRig.keyColor);
    expect(terrainLightRigFor(832)).toBe(defaultRig);
    expect(terrainLightRigFor(832, { ...profile, terrainAccent: alternateAccent })).toBe(alternateRig);
  });
});
