"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/ui/cx";
import {
  cinemaShotCamera,
  createCinemaScene,
  PREVIEW_INITIAL_DELAY_MS,
  PREVIEW_LOCK_COUNT,
  PREVIEW_LOCK_IDS,
  PREVIEW_SHOT_COUNT,
  previewAt,
  previewMissionIndex,
  previewScenarioKind,
  previewSeed,
  renderCinemaFrame,
  resetUnitTransformTracker,
  stepCinemaScene,
  type CinemaScene,
  type PreviewPhase,
  type Shot,
} from "./menuBackdropSim";
import { isTerrainAtlasReady, preloadTerrainAtlas } from "@/lib/render/terrainAtlas";
import styles from "./MenuSignalOverlay.module.css";

const REDUCE_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const FEED_WIDTH = 768;
const FEED_HEIGHT = 512;

function subscribeReduceMotion(onStoreChange: () => void) {
  const media = window.matchMedia?.(REDUCE_MOTION_QUERY);
  if (!media) return () => {};
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function reduceMotionSnapshot() {
  return window.matchMedia?.(REDUCE_MOTION_QUERY)?.matches ?? false;
}

function reduceMotionServerSnapshot() {
  return false;
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReduceMotion, reduceMotionSnapshot, reduceMotionServerSnapshot);
}

function previewChanged(a: PreviewPhase, b: PreviewPhase): boolean {
  return (
    a.expanded !== b.expanded ||
    a.lockIndex !== b.lockIndex ||
    a.shotIndex !== b.shotIndex ||
    a.cycleIndex !== b.cycleIndex
  );
}

export function MenuSignalOverlay({ paused = false }: { paused?: boolean }) {
  const reducedMotion = usePrefersReducedMotion();
  const [sessionOffset] = useState(() =>
    typeof window !== "undefined" && !navigator.userAgent.includes("jsdom")
      ? Math.floor(Math.random() * 60)
      : 0,
  );
  const [preview, setPreview] = useState<PreviewPhase>(() =>
    previewAt(0, PREVIEW_LOCK_COUNT, PREVIEW_SHOT_COUNT, PREVIEW_INITIAL_DELAY_MS, sessionOffset),
  );
  const previewRef = useRef<PreviewPhase>(preview);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([null, null, null]);
  const elapsedRef = useRef(0);
  const animationTickRef = useRef(0);

  useEffect(() => {
    if (reducedMotion || paused) return;

    resetUnitTransformTracker();
    const initialCycleIndex = previewRef.current.cycleIndex;
    const initialSeed = previewSeed(initialCycleIndex);
    let scene = createCinemaScene(
      initialSeed,
      previewMissionIndex(initialCycleIndex, initialSeed),
      previewScenarioKind(initialCycleIndex),
    );
    preloadTerrainAtlas(scene.ground);
    if (scene.state) preloadTerrainAtlas(scene.state);

    let nextScene: CinemaScene | null = null;
    let cycleIndex = previewRef.current.cycleIndex;
    const shots: Shot[] = [];
    let raf = 0;
    const started = performance.now() - elapsedRef.current;

    const frame = (now: number) => {
      const t = animationTickRef.current + 1;
      animationTickRef.current = t;
      elapsedRef.current = Math.max(0, now - started);
      const next = previewAt(
        elapsedRef.current,
        PREVIEW_LOCK_COUNT,
        PREVIEW_SHOT_COUNT,
        PREVIEW_INITIAL_DELAY_MS,
        sessionOffset,
      );
      if (next.cycleIndex !== cycleIndex) {
        resetUnitTransformTracker();
        const seed = previewSeed(next.cycleIndex);
        scene = nextScene ?? createCinemaScene(
          seed,
          previewMissionIndex(next.cycleIndex, seed),
          previewScenarioKind(next.cycleIndex),
        );
        preloadTerrainAtlas(scene.ground);
        if (scene.state) preloadTerrainAtlas(scene.state);
        nextScene = null;
        shots.length = 0;
        cycleIndex = next.cycleIndex;
      } else if (!next.expanded && nextScene === null) {
        const nextSeed = previewSeed(next.cycleIndex + 1);
        nextScene = createCinemaScene(
          nextSeed,
          previewMissionIndex(next.cycleIndex + 1, nextSeed),
          previewScenarioKind(next.cycleIndex + 1),
        );
        preloadTerrainAtlas(nextScene.ground);
        if (nextScene.state) preloadTerrainAtlas(nextScene.state);
      }

      const terrainReady = scene.state ? isTerrainAtlasReady(scene.state) : isTerrainAtlasReady(scene.ground);
      const isExpanded = next.expanded && terrainReady;
      const effectivePreview: PreviewPhase = isExpanded === next.expanded ? next : { ...next, expanded: false };

      if (effectivePreview.expanded) {
        stepCinemaScene(scene, shots, t, now);
        const canvas = canvasRefs.current[effectivePreview.lockIndex];
        const ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          if (canvas.width !== FEED_WIDTH) canvas.width = FEED_WIDTH;
          if (canvas.height !== FEED_HEIGHT) canvas.height = FEED_HEIGHT;
          renderCinemaFrame(ctx, canvas.width, canvas.height, t, scene, shots, {
            camera: cinemaShotCamera(scene, effectivePreview.shotIndex, canvas.width, canvas.height),
            paintAmbient: false,
          });
        }
      }

      // Clear inactive lock canvases so stale frames or unrendered terrain never flash
      for (let i = 0; i < canvasRefs.current.length; i++) {
        if (!effectivePreview.expanded || effectivePreview.lockIndex !== i) {
          const c = canvasRefs.current[i];
          if (c) {
            const ctx = c.getContext("2d");
            if (ctx && c.width > 0 && c.height > 0) {
              ctx.clearRect(0, 0, c.width, c.height);
            }
          }
        }
      }
      if (previewChanged(previewRef.current, effectivePreview)) {
        previewRef.current = effectivePreview;
        setPreview(effectivePreview);
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [paused, reducedMotion, sessionOffset]);

  return (
    <div
      className={cx(styles.overlay, reducedMotion && styles.static, paused && styles.paused)}
      data-testid="menu-signal-overlay"
      data-reduced-motion={reducedMotion ? "true" : "false"}
      data-paused={paused ? "true" : "false"}
      aria-hidden
    >
      <div className={styles.viewportEffects}>
        <div className={styles.crt} />
        <div className={styles.grid} />
        <div className={styles.sweep} />
      </div>
      <div className={styles.previewRegion}>
        {PREVIEW_LOCK_IDS.map((id, index) => {
          const expanded = !reducedMotion && preview.expanded && preview.lockIndex === index;
          return (
            <span
              key={id}
              className={styles.lock}
              data-lock={id}
              data-expanded={expanded ? "true" : "false"}
              data-shot={expanded ? String(preview.shotIndex) : undefined}
              data-seed={expanded ? String(previewSeed(preview.cycleIndex)) : undefined}
            >
              {!reducedMotion ? (
                <canvas
                  ref={(node) => {
                    canvasRefs.current[index] = node;
                  }}
                  className={styles.feed}
                  width={FEED_WIDTH}
                  height={FEED_HEIGHT}
                />
              ) : null}
            </span>
          );
        })}
      </div>
    </div>
  );
}
