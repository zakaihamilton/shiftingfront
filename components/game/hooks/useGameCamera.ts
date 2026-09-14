import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  cameraPanBounds,
  clampCamera,
  panAvailability,
  type PanAvailability,
  type PanDir,
} from "@/lib/render/camera";
import { createCamera, tileToScreen, type Camera } from "@/lib/iso";
import { heightAt } from "@/lib/sim/world";
import type { SimState } from "@/lib/types";
import { useMinimapInteraction } from "./useMinimapInteraction";

export const MIN_RENDER_WIDTH = 640;
export const MIN_RENDER_HEIGHT = 480;

export function renderDimensions(host: HTMLElement): { width: number; height: number } {
  return {
    width: Math.max(MIN_RENDER_WIDTH, Math.floor(host.clientWidth)),
    height: Math.max(MIN_RENDER_HEIGHT, Math.floor(host.clientHeight)),
  };
}

export function useGameCamera({
  stateRef,
  canvasRef,
  hostRef,
}: {
  stateRef: RefObject<SimState | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  const camRef = useRef<Camera>(createCamera());
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
    const elev = heightAt(world, tx, ty);
    const p = tileToScreen(tx, ty, { x: 0, y: 0, zoom: camRef.current.zoom }, elev);
    camRef.current.x = canvas.width / 2 - p.x;
    camRef.current.y = canvas.height * yBias - p.y;
    const bounds = cameraPanBounds(camRef.current, world.width, world.height, canvas.width, canvas.height);
    clampCamera(camRef.current, bounds);
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
    const elev = heightAt(world, tx, ty);
    const p = tileToScreen(tx, ty, { x: 0, y: 0, zoom: camRef.current.zoom }, elev);
    const target = {
      x: canvas.width / 2 - p.x,
      y: canvas.height * yBias - p.y,
      zoom: camRef.current.zoom,
    };
    const bounds = cameraPanBounds(target, world.width, world.height, canvas.width, canvas.height);
    clampCamera(target, bounds);
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
    const cy = stateRef.current?.entities.find((e) => e.hp > 0 && e.owner === 0 && e.kind === "constructionYard");
    if (cy) focusTile(cy.x, cy.y, 1 / 3);
  }, [focusTile, stateRef]);

  const centerSelection = useCallback((selectedIds: Set<number>) => {
    const id = [...selectedIds][0];
    const ent = stateRef.current?.entities.find((e) => e.id === id && e.hp > 0);
    if (ent) focusTile(ent.x, ent.y);
  }, [focusTile, stateRef]);

  const resetCamera = useCallback((s: SimState) => {
    cancelFocusAnimation();
    const cy = s.entities.find((e) => e.owner === 0 && e.kind === "constructionYard");
    const canvas = canvasRef.current;
    if (cy && canvas) {
      const elev = heightAt(s, cy.x, cy.y);
      const p = tileToScreen(cy.x, cy.y, { x: 0, y: 0, zoom: camRef.current.zoom }, elev);
      camRef.current.x = canvas.width / 2 - p.x;
      camRef.current.y = canvas.height / 3 - p.y;
      const bounds = cameraPanBounds(camRef.current, s.width, s.height, canvas.width, canvas.height);
      clampCamera(camRef.current, bounds);
      const avail = panAvailability(camRef.current, bounds);
      panAvailRef.current = avail;
      setPanAvail(avail);
    }
  }, [canvasRef, cancelFocusAnimation]);

  useEffect(() => () => cancelFocusAnimation(), [cancelFocusAnimation]);

  useEffect(() => {
    const s = stateRef.current;
    const resize = () => {
      const c = canvasRef.current;
      const host = hostRef.current;
      if (!c || !host) return;
      const dimensions = renderDimensions(host);
      c.width = dimensions.width;
      c.height = dimensions.height;
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (hostRef.current) observer.observe(hostRef.current);
    if (s) resetCamera(s);
    return () => observer.disconnect();
  }, [canvasRef, hostRef, resetCamera, stateRef]);

  return {
    camRef,
    panAvail,
    panAvailRef,
    setPanAvail,
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
