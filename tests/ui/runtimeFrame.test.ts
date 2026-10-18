import { describe, expect, it, vi } from "vitest";
import { createCamera, TILE_H, TILE_W } from "../../lib/iso";
import { makeFixture } from "../../lib/sim/fixtures";
import {
  cameraFocusPoint,
  cameraPanBounds,
  focusCameraAtTile,
  panAvailability,
  EDGE_PAN_DELAY_MS,
  type PanDir,
} from "../../lib/render/camera";
import { createFrameCoordinator } from "../../components/game/hooks/runtime/frame";

import { defaultKeyBindings, type KeyBindings } from "../../lib/persist/settings";

const ref = <T,>(current: T) => ({ current });

function makeFrameCoordinator(
  keys: Record<string, boolean> = {},
  keyBindings?: KeyBindings,
  initialFocus: { x: number; y: number } = { x: 24, y: 24 },
) {
  const camera = createCamera();
  const canvas = { width: 640, height: 480 } as HTMLCanvasElement;
  const bounds = cameraPanBounds(48, 48, canvas.width, canvas.height);
  focusCameraAtTile(camera, initialFocus.x, initialFocus.y, bounds);
  const panAvailabilityRef = ref(panAvailability(camera, bounds));
  const edgePanHover = ref<{ dir: PanDir; startedAt: number } | null>(null);
  const panHold = ref<PanDir | null>(null);
  const setPanAvailability = vi.fn();
  const applyEdgePan = vi.fn();
  const coordinator = createFrameCoordinator({
    cameraRef: ref(camera),
    canvasRef: ref(canvas),
    keys: ref(keys),
    edgePanHover,
    panHold,
    panAvailabilityRef,
    keyBindingsRef: keyBindings ? ref(keyBindings) : undefined,
    setPanAvailability,
    applyEdgePan,
  });
  return { camera, bounds, coordinator, edgePanHover, panHold, setPanAvailability, applyEdgePan };
}

const focus = (frame: ReturnType<typeof makeFrameCoordinator>) => cameraFocusPoint(frame.camera, frame.bounds);
const screenFocus = (frame: ReturnType<typeof makeFrameCoordinator>) => {
  const point = focus(frame);
  return {
    x: (point.x - point.y) * (TILE_W / 2),
    y: (point.x + point.y) * (TILE_H / 2),
  };
};

describe("runtime frame coordinator", () => {
  it("moves keyboard arrow directions along matching battlefield screen axes", () => {
    const rightFrame = makeFrameCoordinator({ ArrowRight: true });
    const upFrame = makeFrameCoordinator({ ArrowUp: true });
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    const rightStart = screenFocus(rightFrame);
    const upStart = screenFocus(upFrame);

    rightFrame.coordinator.onFrame(state, 0, false, 16);
    upFrame.coordinator.onFrame(state, 0, false, 16);

    expect(screenFocus(rightFrame).x).toBeGreaterThan(rightStart.x);
    expect(screenFocus(rightFrame).y).toBeCloseTo(rightStart.y);
    expect(screenFocus(upFrame).x).toBeCloseTo(upStart.x);
    expect(screenFocus(upFrame).y).toBeLessThan(upStart.y);
  });

  it("does not skew an upward pan when one map axis is at its boundary", () => {
    const frame = makeFrameCoordinator({ w: true }, undefined, { x: 24, y: 0 });
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    const before = focus(frame);

    frame.coordinator.onFrame(state, 0, false, 16);

    expect(focus(frame)).toEqual(before);
    expect(frame.setPanAvailability).not.toHaveBeenCalled();
  });

  it("keeps a combined keyboard pan on its diagonal path at a map edge", () => {
    const frame = makeFrameCoordinator({ ArrowLeft: true, ArrowDown: true }, undefined, { x: 0, y: 24 });
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    const before = screenFocus(frame);

    frame.coordinator.onFrame(state, 0, false, 16);

    const after = screenFocus(frame);
    expect(after.x).toBeLessThan(before.x);
    expect(after.y).toBeGreaterThan(before.y);
    expect(Math.abs(after.x - before.x)).toBeCloseTo(Math.abs(after.y - before.y));
  });

  it("blocks an edge direction when the matching screen direction is unavailable", () => {
    const frame = makeFrameCoordinator({}, undefined, { x: 24, y: 0 });
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "up", startedAt: 0 };
    const before = screenFocus(frame);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);

    expect(screenFocus(frame)).toEqual(before);
    expect(frame.panHold.current).toBeNull();
    expect(frame.applyEdgePan).toHaveBeenLastCalledWith(null);
  });

  it("supports remapped camera pan keybindings", () => {
    const customBindings = {
      ...defaultKeyBindings(),
      panUp: "k",
      panRight: "l",
    };
    const frame = makeFrameCoordinator({ l: true, k: true }, customBindings);
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    const before = screenFocus(frame);

    frame.coordinator.onFrame(state, 0, false, 16);

    expect(screenFocus(frame).x).toBeGreaterThan(before.x);
    expect(screenFocus(frame).y).toBeLessThan(before.y);
  });

  it("publishes changed direction availability after reaching a map edge", () => {
    const frame = makeFrameCoordinator({ d: true }, undefined, { x: 46.9, y: 24 });
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    const before = screenFocus(frame);

    frame.coordinator.onFrame(state, 0, false, 100);

    expect(focus(frame).x).toBe(47);
    expect(screenFocus(frame).y).toBeCloseTo(before.y);
    expect(frame.setPanAvailability).toHaveBeenCalledWith(expect.objectContaining({ right: false }));
  });

  it("waits for the edge-pan delay and clears edge state while paused", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "left", startedAt: 0 };
    const before = screenFocus(frame);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS - 1, false, 16);
    expect(frame.panHold.current).toBeNull();
    expect(screenFocus(frame)).toEqual(before);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);
    expect(frame.panHold.current).toBe("left");
    expect(screenFocus(frame).x).toBeLessThan(before.x);
    expect(screenFocus(frame).y).toBeCloseTo(before.y);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 2, true, 16);
    expect(frame.edgePanHover.current).toBeNull();
    expect(frame.panHold.current).toBeNull();
  });

  it("uses elapsed time when edge-pan frames are delayed", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "right", startedAt: 0 };
    const before = screenFocus(frame);

    frame.coordinator.onFrame(state, 0, false, 0);
    frame.coordinator.onFrame(state, 1_000, false, 100);

    expect(screenFocus(frame).x).toBeGreaterThan(before.x);
    const after = screenFocus(frame);
    const screenDistance = Math.hypot(after.x - before.x, after.y - before.y);
    expect(screenDistance).toBeCloseTo(600, 1);
  });

  it("moves along both battlefield screen axes for a diagonal edge hold", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "down-right", startedAt: 0 };
    const before = screenFocus(frame);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);

    expect(screenFocus(frame).x).toBeGreaterThan(before.x);
    expect(screenFocus(frame).y).toBeGreaterThan(before.y);
  });

  it("moves a cardinal edge hold straight along its battlefield screen axis", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "up", startedAt: 0 };
    const before = screenFocus(frame);

    frame.coordinator.onFrame(state, 0, false, 16);
    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);

    expect(screenFocus(frame).x).toBeCloseTo(before.x);
    expect(screenFocus(frame).y).toBeLessThan(before.y);
  });

  it("eases into edge scrolling instead of jumping to full speed", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "left", startedAt: 0 };
    const before = focus(frame);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);
    const firstStep = before.x - focus(frame).x;
    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 17, false, 16);
    const secondStep = before.x - focus(frame).x - firstStep;

    expect(firstStep).toBeGreaterThan(0);
    expect(secondStep).toBeGreaterThan(firstStep);
    expect(secondStep).toBeLessThan(18.75 * 16 / 1000);
  });

  it("merges matching keyboard and edge input without exceeding the pan speed", () => {
    const keyboard = makeFrameCoordinator({ d: true });
    const combined = makeFrameCoordinator({ d: true });
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    combined.edgePanHover.current = { dir: "right", startedAt: 0 };
    const keyboardStart = focus(keyboard);
    const combinedStart = focus(combined);

    keyboard.coordinator.onFrame(state, 1_000, false, 1_000);
    combined.coordinator.onFrame(state, 1_000, false, 1_000);

    expect(focus(combined).x - combinedStart.x).toBeCloseTo(focus(keyboard).x - keyboardStart.x, 5);
  });

  it("cancels opposing keyboard and edge directions", () => {
    const frame = makeFrameCoordinator({ d: true });
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "left", startedAt: 0 };
    const before = focus(frame);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);

    expect(focus(frame)).toEqual(before);
  });
});
