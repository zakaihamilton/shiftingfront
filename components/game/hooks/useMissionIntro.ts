"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import type { MultiplayerSession } from "@/lib/multiplayer/session";
import { createMissionIntroPlan, createMissionIntroPlayback, missionIntroPhaseFor, updateMissionIntroReducedMotion, type MissionIntroPhase, type MissionIntroPlayback } from "@/lib/render/missionIntro";
import { MOBILE_HQ_DIRECTION_ART, SPRITE_ART } from "@/lib/gen/visualAssets";
import { preloadRasterSources } from "@/lib/render/sprites";
import type { SimState } from "@/lib/types";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(listener: () => void): () => void {
  const media = window.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!media) return () => undefined;
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function systemReducedMotionSnapshot(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
}

export function useMissionIntro({
  state,
  initiallyActive,
  assetsReady,
  session,
  reducedMotion,
  pausedRef,
  setPaused,
  onHandoff,
}: {
  state: SimState;
  initiallyActive: boolean;
  assetsReady: boolean;
  session?: MultiplayerSession;
  reducedMotion: boolean;
  pausedRef: MutableRefObject<boolean>;
  setPaused: Dispatch<SetStateAction<boolean>>;
  onHandoff: () => void;
}) {
  const systemReducedMotion = useSyncExternalStore(subscribeReducedMotion, systemReducedMotionSnapshot, () => false);
  const shouldReduceMotion = reducedMotion || systemReducedMotion;
  const [bootPlayback] = useState(() => {
    if (!initiallyActive) return null;
    const plan = createMissionIntroPlan(state, shouldReduceMotion);
    return plan ? createMissionIntroPlayback(plan, shouldReduceMotion) : null;
  });
  const isInitiallyActive = initiallyActive && bootPlayback !== null;
  const activeRef = useRef(isInitiallyActive);
  const localReadyRef = useRef(false);
  const playbackRef = useRef<MissionIntroPlayback | null>(bootPlayback);
  const [active, setActive] = useState(isInitiallyActive);
  const [awaiting, setAwaiting] = useState(false);
  const [phase, setPhase] = useState<MissionIntroPhase>("APPROACHING BASE SITE");
  const phaseRef = useRef<MissionIntroPhase>("APPROACHING BASE SITE");

  useEffect(() => {
    if (active) preloadRasterSources([
      ...Object.values(MOBILE_HQ_DIRECTION_ART),
      SPRITE_ART.constructionYard,
    ]);
  }, [active]);

  const introReleased = useSyncExternalStore(
    useCallback((listener) => typeof session?.subscribe === "function" ? session.subscribe(listener) : (() => undefined), [session]),
    useCallback(() => session?.introReleased ?? true, [session]),
    () => true,
  );

  const finish = useCallback(() => {
    activeRef.current = false;
    playbackRef.current = null;
    setActive(false);
    setAwaiting(false);
    onHandoff();
    pausedRef.current = false;
    setPaused(false);
  }, [onHandoff, pausedRef, setPaused]);

  const markReady = useCallback(() => {
    if (localReadyRef.current) return;
    localReadyRef.current = true;
    const playback = playbackRef.current;
    if (playback) playback.elapsedMs = playback.plan.durationMs * 0.9;
    if (session) {
      session.markIntroReady();
      const waiting = !session.introReleased;
      if (playback) playback.waitingForPlayers = waiting;
      setAwaiting(waiting);
      if (!waiting) return;
    } else {
      setAwaiting(false);
    }
  }, [session]);

  const begin = useCallback((nextState: SimState) => {
    if (nextState.multiplayer) return;
    const plan = createMissionIntroPlan(nextState, shouldReduceMotion);
    if (!plan) return;
    playbackRef.current = createMissionIntroPlayback(plan, shouldReduceMotion);
    activeRef.current = true;
    localReadyRef.current = false;
    setAwaiting(false);
    setActive(true);
    phaseRef.current = "APPROACHING BASE SITE";
    setPhase("APPROACHING BASE SITE");
    pausedRef.current = true;
    setPaused(true);
  }, [pausedRef, setPaused, shouldReduceMotion]);

  const skip = useCallback(() => {
    if (!activeRef.current) return;
    if (!session) {
      const playback = playbackRef.current;
      if (playback) playback.elapsedMs = playback.plan.durationMs;
      localReadyRef.current = true;
      finish();
      return;
    }
    markReady();
  }, [finish, markReady, session]);

  useEffect(() => {
    if (!isInitiallyActive || !activeRef.current) return;
    pausedRef.current = true;
    if (!session) setPaused(true);
  }, [isInitiallyActive, pausedRef, session, setPaused]);

  useEffect(() => {
    const playback = playbackRef.current;
    if (playback) updateMissionIntroReducedMotion(playback, shouldReduceMotion);
    if (playback) {
      const nextPhase = missionIntroPhaseFor(playback.plan, playback.elapsedMs, playback.reducedMotion);
      phaseRef.current = nextPhase;
      setPhase(nextPhase);
    }
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (!active || !introReleased || !localReadyRef.current) return;
    const playback = playbackRef.current;
    if (!playback) {
      finish();
      return;
    }
    playback.waitingForPlayers = false;
  }, [active, finish, introReleased]);

  useEffect(() => {
    if (!active || !assetsReady) return;
    let raf = 0;
    let previous = performance.now();
    const frame = (now: number) => {
      const playback = playbackRef.current;
      if (!playback || !activeRef.current) return;
      const delta = Math.min(80, Math.max(0, now - previous));
      previous = now;
      const nextPhase = missionIntroPhaseFor(playback.plan, playback.elapsedMs, playback.reducedMotion);
      if (nextPhase !== phaseRef.current) {
        phaseRef.current = nextPhase;
        setPhase(nextPhase);
      }
      if (!localReadyRef.current) {
        playback.elapsedMs = Math.min(playback.plan.durationMs, playback.elapsedMs + delta);
        if (playback.elapsedMs >= playback.plan.durationMs) {
          if (session) markReady();
          else {
            finish();
            return;
          }
        }
      } else if (!session || session.introReleased) {
        playback.waitingForPlayers = false;
        playback.elapsedMs = Math.min(playback.plan.durationMs, playback.elapsedMs + delta);
        if (playback.elapsedMs >= playback.plan.durationMs) {
          finish();
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [active, assetsReady, finish, markReady, session]);

  return {
    active,
    activeRef,
    playbackRef,
    awaiting,
    phase,
    reducedMotion: shouldReduceMotion,
    begin,
    skip,
  };
}
