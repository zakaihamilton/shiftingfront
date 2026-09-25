import { describe, expect, it, vi } from "vitest";
import { createCamera } from "../../lib/iso";
import { makeFixture } from "../../lib/sim/fixtures";
import { cameraPanBounds, EDGE_PAN_DELAY_MS, type PanDir } from "../../lib/render/camera";
import { createFrameCoordinator } from "../../components/game/hooks/runtime/frame";

import { defaultKeyBindings, type KeyBindings } from "../../lib/persist/settings";

const ref = <T,>(current: T) => ({ current });

function makeFrameCoordinator(keys: Record<string, boolean> = {}, keyBindings?: KeyBindings) {
  const camera = createCamera();
  const canvas = { width: 640, height: 480 } as HTMLCanvasElement;
  const bounds = cameraPanBounds(camera, 48, 48, canvas.width, canvas.height);
  camera.x = (bounds.minX + bounds.maxX) / 2;
  camera.y = (bounds.minY + bounds.maxY) / 2;
  const panAvailability = ref({ left: true, right: true, up: true, down: true });
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
    panAvailabilityRef: panAvailability,
    keyBindingsRef: keyBindings ? ref(keyBindings) : undefined,
    setPanAvailability,
    applyEdgePan,
  });
  return { camera, bounds, coordinator, edgePanHover, panHold, setPanAvailability };
}

describe("runtime frame coordinator", () => {
  it("clamps keyboard pan and publishes availability changes", () => {
    const frame = makeFrameCoordinator({ d: true, w: true });
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });

    frame.coordinator.onFrame(state, 0, false, 10_000);

    expect(frame.camera.x).toBe(frame.bounds.minX);
    expect(frame.camera.y).toBe(frame.bounds.maxY);
    expect(frame.setPanAvailability).toHaveBeenCalled();
  });

  it("supports remapped camera pan keybindings", () => {
    const customBindings = {
      ...defaultKeyBindings(),
      panUp: "k",
      panRight: "l",
    };
    const frame = makeFrameCoordinator({ l: true, k: true }, customBindings);
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });

    frame.coordinator.onFrame(state, 0, false, 10_000);

    expect(frame.camera.x).toBe(frame.bounds.minX);
    expect(frame.camera.y).toBe(frame.bounds.maxY);
  });

  it("waits for the edge-pan delay and clears edge state while paused", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "left", startedAt: 0 };
    const before = frame.camera.x;

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS - 1, false, 16);
    expect(frame.panHold.current).toBeNull();
    expect(frame.camera.x).toBe(before);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);
    expect(frame.panHold.current).toBe("left");
    expect(frame.camera.x).toBeGreaterThan(before);

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 2, true, 16);
    expect(frame.edgePanHover.current).toBeNull();
    expect(frame.panHold.current).toBeNull();
  });

  it("uses elapsed time when edge-pan frames are delayed", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "right", startedAt: 0 };
    const before = frame.camera.x;

    frame.coordinator.onFrame(state, 0, false, 0);
    frame.coordinator.onFrame(state, 1_000, false, 100);

    expect(frame.camera.x).toBeLessThan(before);
    expect(frame.camera.x).toBeGreaterThan(before - 600);
  });

  it("moves both camera axes for a diagonal edge hold", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "down-right", startedAt: 0 };
    const before = { x: frame.camera.x, y: frame.camera.y };

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);

    expect(frame.camera.x).toBeLessThan(before.x);
    expect(frame.camera.y).toBeLessThan(before.y);
  });

  it("eases into edge scrolling instead of jumping to full speed", () => {
    const frame = makeFrameCoordinator();
    const state = makeFixture({ width: 48, height: 48, win: { kind: "annihilate" } });
    frame.edgePanHover.current = { dir: "left", startedAt: 0 };
    const before = frame.camera.x;

    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 1, false, 16);
    const firstStep = frame.camera.x - before;
    frame.coordinator.onFrame(state, EDGE_PAN_DELAY_MS + 17, false, 16);
    const secondStep = frame.camera.x - before - firstStep;

    expect(firstStep).toBeGreaterThan(0);
    expect(secondStep).toBeGreaterThan(firstStep);
    expect(secondStep).toBeLessThan(600 * 16 / 1000);
  });
});
