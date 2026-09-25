import { cameraPanBounds, canPan, panAvailability, panCamera, panOffset, EDGE_PAN_DELAY_MS, type PanAvailability, type PanDir } from "@/lib/render/camera";
import type { Camera } from "@/lib/iso";
import type { SimState } from "@/lib/types";
import type { KeyBindings } from "@/lib/persist/settings";

// Recover useful edge-pan distance when WebKit or a backgrounded tab delivers
// animation frames sparsely, without allowing an arbitrarily long frame gap to
// teleport the camera.
const MAX_CAMERA_ELAPSED_MS = 1_000;
const EDGE_PAN_SPEED = 600;
const EDGE_PAN_RESPONSE_MS = 90;

function smoothPanVelocity(current: number, target: number, elapsedMs: number): number {
  const response = 1 - Math.exp(-elapsedMs / EDGE_PAN_RESPONSE_MS);
  return current + (target - current) * response;
}

function edgePanTarget(dir: PanDir): { dx: number; dy: number } {
  const offset = panOffset(dir, EDGE_PAN_SPEED);
  const magnitude = Math.hypot(offset.dx, offset.dy);
  if (magnitude <= EDGE_PAN_SPEED) return offset;
  const scale = EDGE_PAN_SPEED / magnitude;
  return { dx: offset.dx * scale, dy: offset.dy * scale };
}

export function createFrameCoordinator({
  cameraRef,
  canvasRef,
  keys,
  edgePanHover,
  panHold,
  panAvailabilityRef,
  keyBindingsRef,
  setPanAvailability,
  applyEdgePan,
}: {
  cameraRef: { current: Camera };
  canvasRef: { current: HTMLCanvasElement | null };
  keys: { current: Record<string, boolean> };
  edgePanHover: { current: { dir: PanDir; startedAt: number } | null };
  panHold: { current: PanDir | null };
  panAvailabilityRef: { current: PanAvailability };
  keyBindingsRef?: { current: KeyBindings | undefined };
  setPanAvailability: (availability: PanAvailability) => void;
  applyEdgePan: (direction: PanDir | null) => void;
}) {
  let previousFrameAt: number | null = null;
  let edgePanVelocity = { dx: 0, dy: 0 };

  return {
    onFrame(state: SimState, now: number, paused: boolean, frameMs: number) {
      const elapsedSinceFrame = previousFrameAt === null ? frameMs : Math.max(0, now - previousFrameAt);
      previousFrameAt = now;
      const cameraFrameMs = Math.min(elapsedSinceFrame, MAX_CAMERA_ELAPSED_MS);
      const panStep = EDGE_PAN_SPEED * frameMs / 1000;
      if (!paused) {
        const camera = cameraRef.current;
        const canvas = canvasRef.current;
        const bounds = canvas
          ? cameraPanBounds(camera, state.width, state.height, canvas.width, canvas.height)
          : undefined;
        const panUpKey = keyBindingsRef?.current?.panUp || "w";
        const panDownKey = keyBindingsRef?.current?.panDown || "s";
        const panLeftKey = keyBindingsRef?.current?.panLeft || "a";
        const panRightKey = keyBindingsRef?.current?.panRight || "d";
        if (keys.current[panUpKey] || keys.current[panUpKey.toLowerCase()] || keys.current[panUpKey.toUpperCase()] || keys.current.ArrowUp) panCamera(camera, 0, panStep, bounds);
        if (keys.current[panDownKey] || keys.current[panDownKey.toLowerCase()] || keys.current[panDownKey.toUpperCase()] || keys.current.ArrowDown) panCamera(camera, 0, -panStep, bounds);
        if (keys.current[panLeftKey] || keys.current[panLeftKey.toLowerCase()] || keys.current[panLeftKey.toUpperCase()] || keys.current.ArrowLeft) panCamera(camera, panStep, 0, bounds);
        if (keys.current[panRightKey] || keys.current[panRightKey.toLowerCase()] || keys.current[panRightKey.toUpperCase()] || keys.current.ArrowRight) panCamera(camera, -panStep, 0, bounds);
        const hoveredEdge = edgePanHover.current;
        const hold = hoveredEdge && now - hoveredEdge.startedAt >= EDGE_PAN_DELAY_MS ? hoveredEdge.dir : null;
        panHold.current = hold;
        const canApplyEdgePan = Boolean(hold && bounds && canPan(camera, bounds, hold));
        if (hold && bounds && !canApplyEdgePan) applyEdgePan(null);

        if (!hoveredEdge) {
          edgePanVelocity = { dx: 0, dy: 0 };
        } else {
          const target = canApplyEdgePan && hold ? edgePanTarget(hold) : { dx: 0, dy: 0 };
          edgePanVelocity = {
            dx: smoothPanVelocity(edgePanVelocity.dx, target.dx, cameraFrameMs),
            dy: smoothPanVelocity(edgePanVelocity.dy, target.dy, cameraFrameMs),
          };
        }
        if (bounds) {
          panCamera(
            camera,
            edgePanVelocity.dx * cameraFrameMs / 1000,
            edgePanVelocity.dy * cameraFrameMs / 1000,
            bounds,
          );
        }
        if (bounds) {
          const next = panAvailability(camera, bounds);
          const previous = panAvailabilityRef.current;
          if (previous.left !== next.left || previous.right !== next.right || previous.up !== next.up || previous.down !== next.down) {
            panAvailabilityRef.current = next;
            setPanAvailability(next);
          }
        }
      } else {
        previousFrameAt = null;
        edgePanHover.current = null;
        panHold.current = null;
        edgePanVelocity = { dx: 0, dy: 0 };
      }
    },
  };
}
