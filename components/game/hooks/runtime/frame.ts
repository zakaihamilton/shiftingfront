import { canvasViewport } from "@/lib/render/canvasViewport";
import {
  cameraPanBounds,
  canPan,
  capPanInput,
  panAvailability,
  panCameraPreservingDirection,
  panInputForDirection,
  EDGE_PAN_DELAY_MS,
  type PanAvailability,
  type PanDir,
} from "@/lib/render/camera";
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
      if (!paused) {
        const camera = cameraRef.current;
        const canvas = canvasRef.current;
        const bounds = canvas
          ? cameraPanBounds(state.width, state.height, canvasViewport(canvas).width, canvasViewport(canvas).height)
          : undefined;
        const panElapsedMs = cameraFrameMs;
        const panStep = EDGE_PAN_SPEED * panElapsedMs / 1000;
        const panUpKey = keyBindingsRef?.current?.panUp || "w";
        const panDownKey = keyBindingsRef?.current?.panDown || "s";
        const panLeftKey = keyBindingsRef?.current?.panLeft || "a";
        const panRightKey = keyBindingsRef?.current?.panRight || "d";
        const keyIsDown = (key: string) => Boolean(
          keys.current[key] || keys.current[key.toLowerCase()] || keys.current[key.toUpperCase()],
        );
        const canPanDirection = (dir: PanDir) => Boolean(bounds && canPan(camera, bounds, dir));
        const keyboardPan = { dx: 0, dy: 0 };
        const keyboardDirections: { dir: PanDir; pressed: boolean }[] = [
          { dir: "up", pressed: keyIsDown(panUpKey) || Boolean(keys.current.ArrowUp) },
          { dir: "down", pressed: keyIsDown(panDownKey) || Boolean(keys.current.ArrowDown) },
          { dir: "left", pressed: keyIsDown(panLeftKey) || Boolean(keys.current.ArrowLeft) },
          { dir: "right", pressed: keyIsDown(panRightKey) || Boolean(keys.current.ArrowRight) },
        ];
        for (const { dir, pressed } of keyboardDirections) {
          if (!pressed) continue;
          const input = panInputForDirection(dir, panStep, camera.zoom);
          keyboardPan.dx += input.dx;
          keyboardPan.dy += input.dy;
        }
        const hoveredEdge = edgePanHover.current;
        const hold = hoveredEdge && now - hoveredEdge.startedAt >= EDGE_PAN_DELAY_MS ? hoveredEdge.dir : null;
        const activeEdge = hold && canPanDirection(hold) ? hold : null;
        panHold.current = activeEdge;
        if (hold && !activeEdge) applyEdgePan(null);

        if (!hoveredEdge || !activeEdge) {
          edgePanVelocity = { dx: 0, dy: 0 };
        } else {
          const target = panInputForDirection(activeEdge, EDGE_PAN_SPEED, camera.zoom);
          edgePanVelocity = {
            dx: smoothPanVelocity(edgePanVelocity.dx, target.dx, cameraFrameMs),
            dy: smoothPanVelocity(edgePanVelocity.dy, target.dy, cameraFrameMs),
          };
        }
        const edgeStep = {
          dx: edgePanVelocity.dx * panElapsedMs / 1000,
          dy: edgePanVelocity.dy * panElapsedMs / 1000,
        };
        const combineAxis = (keyDelta: number, edgeDelta: number, edgeDirection: number) => {
          if (keyDelta && edgeDirection && Math.sign(keyDelta) !== Math.sign(edgeDirection)) return 0;
          return keyDelta + edgeDelta;
        };
        const combinedPan = capPanInput({
          space: "map",
          dx: combineAxis(keyboardPan.dx, edgeStep.dx, activeEdge ? panInputForDirection(activeEdge, 1, camera.zoom).dx : 0),
          dy: combineAxis(keyboardPan.dy, edgeStep.dy, activeEdge ? panInputForDirection(activeEdge, 1, camera.zoom).dy : 0),
        }, panStep, camera.zoom);
        if (bounds && combinedPan.space === "map") panCameraPreservingDirection(camera, combinedPan, bounds);
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
