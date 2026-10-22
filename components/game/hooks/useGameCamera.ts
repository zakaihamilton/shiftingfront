import { canvasViewport, resizeRenderCanvas } from "@/lib/render/canvasViewport";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  cameraPanBounds,
  clampCamera,
  focusCameraAtTile,
  panAvailability,
  type PanAvailability,
  type PanDir,
} from "@/lib/render/camera";
import { createCamera, type Camera } from "@/lib/iso";
import { heightAt } from "@/lib/sim/world";
import type { SimState } from "@/lib/types";
import { renderDimensions, renderPixelRatio } from "../renderDimensions";
import { useMinimapInteraction } from "./useMinimapInteraction";

export function useGameCamera({
  stateRef,
  canvasRef,
  hostRef,
  enabled = true,
}: {
  stateRef: RefObject<SimState | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hostRef: RefObject<HTMLDivElement | null>;
  enabled?: boolean;
}) {
  const camRef = useRef<Camera>(createCamera());
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number } | null>(null);
  const panAvailRef = useRef<PanAvailability>({ left: false, right: false, up: false, down: false });
  const [panAvail, setPanAvail] = useState<PanAvailability>({ left: false, right: false, up: false, down: false });
  const [hotPan, setHotPan] = useState<PanDir | null>(null);
  const panHold = useRef<PanDir | null>(null);
  const edgePanHover = useRef<{ dir: PanDir; startedAt: number } | null>(null);
  const focusAnimationRef = useRef<number | null>(null);

  const cancelFocusAnimation = useCallback(() => {
    if (focusAnimationRef.current !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(focusAnimationRef.current);
    }
    focusAnimationRef.current = null;
  }, []);

  const minimap = useMinimapInteraction({ stateRef, canvasRef, camRef, cancelCameraFocus: cancelFocusAnimation });

  const applyEdgePan = useCallback((dir: PanDir | null) => {
    if (dir === null) {
      edgePanHover.current = null;
      panHold.current = null;
    } else if (edgePanHover.current?.dir !== dir) {
      cancelFocusAnimation();
      edgePanHover.current = { dir, startedAt: performance.now() };
      panHold.current = null;
    }
    setHotPan((prev) => (prev === dir ? prev : dir));
  }, [cancelFocusAnimation]);

  const focusTile = useCallback((tx: number, ty: number, yBias = 0.5) => {
    cancelFocusAnimation();
    const world = stateRef.current;
    const canvas = canvasRef.current;
    if (!world || !canvas) return;
    const bounds = cameraPanBounds(world.width, world.height, canvasViewport(canvas).width, canvasViewport(canvas).height);
    focusCameraAtTile(camRef.current, tx, ty, bounds, {
      elevation: heightAt(world, tx, ty),
      yBias,
    });
  }, [canvasRef, cancelFocusAnimation, stateRef]);

  const focusTileAnimated = useCallback((tx: number, ty: number, yBias = 0.5, durationMs = 480) => {
    const world = stateRef.current;
    const canvas = canvasRef.current;
    if (!world || !canvas) return;
    if (durationMs <= 0 || typeof requestAnimationFrame !== "function") {
      focusTile(tx, ty, yBias);
      return;
    }

    cancelFocusAnimation();
    const target = { ...camRef.current };
    const bounds = cameraPanBounds(world.width, world.height, canvasViewport(canvas).width, canvasViewport(canvas).height);
    focusCameraAtTile(target, tx, ty, bounds, {
      elevation: heightAt(world, tx, ty),
      yBias,
    });
    const startX = camRef.current.x;
    const startY = camRef.current.y;
    const startedAt = performance.now();
    const animate = (now: number) => {
      const progress = Math.min(1, Math.max(0, (now - startedAt) / durationMs));
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;
      camRef.current.x = startX + (target.x - startX) * eased;
      camRef.current.y = startY + (target.y - startY) * eased;
      clampCamera(camRef.current, bounds);
      if (progress < 1) {
        focusAnimationRef.current = requestAnimationFrame(animate);
        return;
      }
      focusAnimationRef.current = null;
      const next = panAvailability(camRef.current, bounds);
      panAvailRef.current = next;
      setPanAvail(next);
    };
    focusAnimationRef.current = requestAnimationFrame(animate);
  }, [canvasRef, cancelFocusAnimation, focusTile, panAvailRef, setPanAvail, stateRef]);

  const jumpHome = useCallback(() => {
    const current = stateRef.current;
    const owner = current?.viewOwner ?? 0;
    const cy = current?.entities.find((e) => e.hp > 0 && e.owner === owner && e.kind === "constructionYard");
    if (cy) focusTile(cy.x, cy.y, 1 / 3);
  }, [focusTile, stateRef]);

  const centerSelection = useCallback((selectedIds: Set<number>) => {
    const id = [...selectedIds][0];
    const ent = stateRef.current?.entities.find((e) => e.id === id && e.hp > 0);
    if (ent) focusTile(ent.x, ent.y);
  }, [focusTile, stateRef]);

  const resetCamera = useCallback((s: SimState) => {
    cancelFocusAnimation();
    const cy = s.entities.find((e) => e.owner === (s.viewOwner ?? 0) && e.kind === "constructionYard");
    const canvas = canvasRef.current;
    if (cy && canvas) {
      const bounds = cameraPanBounds(s.width, s.height, canvasViewport(canvas).width, canvasViewport(canvas).height);
      focusCameraAtTile(camRef.current, cy.x, cy.y, bounds, {
        elevation: heightAt(s, cy.x, cy.y),
        yBias: 1 / 3,
      });
      const avail = panAvailability(camRef.current, bounds);
      panAvailRef.current = avail;
      setPanAvail(avail);
    }
  }, [canvasRef, cancelFocusAnimation]);

  useEffect(() => () => cancelFocusAnimation(), [cancelFocusAnimation]);

  useLayoutEffect(() => {
    if (!enabled) return;
    const s = stateRef.current;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    let dimensions = renderDimensions(host);
    resizeRenderCanvas(canvas, dimensions, renderPixelRatio(dimensions, undefined, undefined, s?.entities.length));

    if (s) resetCamera(s);
    setViewportSize(dimensions);

    const syncViewport = () => {
      const nextDimensions = renderDimensions(host);
      if (nextDimensions.width === dimensions.width && nextDimensions.height === dimensions.height) return;

      cancelFocusAnimation();
      resizeRenderCanvas(canvas, nextDimensions, renderPixelRatio(nextDimensions, undefined, undefined, stateRef.current?.entities.length));

      const currentState = stateRef.current;
      if (currentState) {
        // Preserve the world point at the center of the view as fullscreen,
        // orientation, or the responsive sidebar changes the battlefield size.
        camRef.current.x += (nextDimensions.width - dimensions.width) / 2;
        camRef.current.y += (nextDimensions.height - dimensions.height) / 2;
        const bounds = cameraPanBounds(
          currentState.width,
          currentState.height,
          nextDimensions.width,
          nextDimensions.height,
        );
        clampCamera(camRef.current, bounds);
        const availability = panAvailability(camRef.current, bounds);
        panAvailRef.current = availability;
        setPanAvail(availability);
      }

      dimensions = nextDimensions;
      setViewportSize(nextDimensions);
    };

    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(syncViewport);
    observer?.observe(host);
    window.addEventListener("resize", syncViewport);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", syncViewport);
    };
  }, [camRef, cancelFocusAnimation, canvasRef, enabled, hostRef, panAvailRef, resetCamera, setPanAvail, stateRef]);

  return {
    camRef,
    viewportSize,
    panAvail,
    panAvailRef,
    setPanAvail,
    cancelFocusAnimation,
    hotPan,
    panHold,
    edgePanHover,
    applyEdgePan,
    focusTile,
    focusTileAnimated,
    jumpHome,
    centerSelection,
    resetCamera,
    ...minimap,
  };
}

export type GameCamera = ReturnType<typeof useGameCamera>;
