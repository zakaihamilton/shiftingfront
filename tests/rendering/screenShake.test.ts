import { describe, expect, it } from "vitest";
import {
  addScreenShake,
  createScreenShakeState,
  updateScreenShake,
  MAX_SHAKE_OFFSET_PX,
} from "../../lib/render/screenShake";

describe("screenShake", () => {
  it("initializes with zero trauma and zero offset", () => {
    const state = createScreenShakeState();
    expect(state.trauma).toBe(0);
    const offset = updateScreenShake(state, 100);
    expect(offset).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it("adds trauma capped at 1.0", () => {
    const state = createScreenShakeState();
    addScreenShake(state, 0.6);
    expect(state.trauma).toBe(0.6);
    addScreenShake(state, 0.7);
    expect(state.trauma).toBe(1.0);
  });

  it("computes non-zero offset when trauma exists and decays over time", () => {
    const state = createScreenShakeState();
    addScreenShake(state, 1.0);
    const first = updateScreenShake(state, 100);
    expect(Math.abs(first.offsetX)).toBeLessThanOrEqual(MAX_SHAKE_OFFSET_PX);
    expect(Math.abs(first.offsetY)).toBeLessThanOrEqual(MAX_SHAKE_OFFSET_PX);

    // Advance time by 500ms -> trauma should decay completely
    const later = updateScreenShake(state, 600);
    expect(state.trauma).toBe(0);
    expect(later).toEqual({ offsetX: 0, offsetY: 0 });
  });

  it("strictly suppresses shake when reducedMotion is true", () => {
    const state = createScreenShakeState();
    addScreenShake(state, 1.0);
    const offset = updateScreenShake(state, 100, true);
    expect(offset).toEqual({ offsetX: 0, offsetY: 0 });
    expect(state.trauma).toBe(0);
  });
});

describe("presentation coordinator screen shake filtering", () => {
  it("only shakes on building destruction, ignoring unit casualties and combat attacks", async () => {
    const { createPresentationCoordinator } = await import(
      "../../components/game/hooks/runtime/presentation"
    );
    const screenShakeRef = { current: createScreenShakeState() };
    const coordinator = createPresentationCoordinator({
      cameraRef: { current: { x: 0, y: 0, zoom: 1 } },
      canvasRef: { current: null },
      fxRef: { current: [] },
      fxSequence: { current: 0 },
      screenShakeRef,
      onAlert: () => undefined,
      onCommandNotice: () => undefined,
    });

    const dummyState = {
      tick: 1,
      width: 10,
      height: 10,
      heights: new Uint8Array(100),
      entities: [],
      runtime: {},
    } as unknown as import("../../lib/types").SimState;

    // 1. Combat attack event (cannon) -> should NOT trigger shake
    coordinator.onTick(dummyState, [
      {
        type: "combat",
        owner: 0,
        attackerKind: "tank",
        weapon: "cannon",
        x: 5,
        y: 5,
        targetX: 5,
        targetY: 5,
        targetOwner: 1,
        targetKind: "infantry",
        destroyed: false,
      },
    ], 100);
    expect(screenShakeRef.current.trauma).toBe(0);

    // 2. Unit casualties (tank, infantry, harvester) -> should NOT trigger shake
    coordinator.onTick(dummyState, [
      { type: "destroyed", id: 1, kind: "infantry", x: 5, y: 5, owner: 1 },
      { type: "destroyed", id: 2, kind: "tank", x: 5, y: 5, owner: 1 },
      { type: "destroyed", id: 3, kind: "harvester", x: 5, y: 5, owner: 1 },
    ], 200);
    expect(screenShakeRef.current.trauma).toBe(0);

    // 3. Building destruction (factory, turret, power) -> SHOULD trigger shake
    coordinator.onTick(dummyState, [
      { type: "destroyed", id: 4, kind: "factory", x: 5, y: 5, owner: 1 },
    ], 300);
    expect(screenShakeRef.current.trauma).toBeCloseTo(0.7);
  });
});
