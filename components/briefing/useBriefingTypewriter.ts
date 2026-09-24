import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cachedLocalStorage } from "@/lib/persist/save";
import { readSettings } from "@/lib/persist/settings";
import type { BriefingLine } from "@/lib/types";
import { briefingActiveLineIndex, briefingRevealedLines } from "./briefingWrap";

const CHAR_MS = 40;
const CHAR_BATCH = 2;

export function useBriefingTypewriter(lines: readonly BriefingLine[], onComplete?: () => void) {
  const [shown, setShown] = useState(0);
  const [playId, setPlayId] = useState(0);
  const storyRef = useRef<HTMLDivElement>(null);
  const autoFollowStoryRef = useRef(true);
  const shownRef = useRef(0);
  const completedRef = useRef(false);
  const [reducedMotion, setReducedMotion] = useState(() => (
    typeof window !== "undefined" && (
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
      || readSettings(cachedLocalStorage()).reducedMotion
    )
  ));
  const totalChars = lines.reduce((n, line) => n + line.text.length, 0);
  const resetKey = `${playId}:${totalChars}`;
  const [activeKey, setActiveKey] = useState(resetKey);
  if (activeKey !== resetKey) {
    setActiveKey(resetKey);
    setShown(0);
  }
  const displayShown = reducedMotion ? totalChars : activeKey !== resetKey ? 0 : shown;

  const replayTransmission = useCallback(() => {
    shownRef.current = 0;
    completedRef.current = false;
    autoFollowStoryRef.current = true;
    setShown(0);
    setPlayId((n) => n + 1);
  }, []);

  const skipToEnd = useCallback(() => {
    shownRef.current = totalChars;
    autoFollowStoryRef.current = true;
    setShown(totalChars);
  }, [totalChars]);

  const onStoryScroll = useCallback(() => {
    const el = storyRef.current;
    if (!el) return;
    autoFollowStoryRef.current = el.scrollHeight - el.clientHeight - el.scrollTop <= 8;
  }, []);

  useEffect(() => {
    shownRef.current = displayShown;
  }, [displayShown]);

  useEffect(() => {
    completedRef.current = false;
  }, [playId, totalChars]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(
      (media?.matches ?? false) || readSettings(cachedLocalStorage()).reducedMotion,
    );
    update();
    if (!media) return;
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let raf = 0;
    let last = performance.now();
    let carry = 0;
    let stopped = false;
    const step = (now: number) => {
      if (stopped) return;
      if (shownRef.current >= totalChars) return;
      const dt = Math.min(100, now - last);
      last = now;
      carry += dt / CHAR_MS;
      if (carry >= CHAR_BATCH || shownRef.current + Math.floor(carry) >= totalChars) {
        const add = Math.max(1, Math.floor(carry));
        carry -= add;
        const next = Math.min(totalChars, shownRef.current + add);
        shownRef.current = next;
        setShown(next);
        if (next >= totalChars) return;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [playId, reducedMotion, totalChars]);

  useEffect(() => {
    if (displayShown < totalChars || completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  }, [displayShown, totalChars, onComplete]);

  useLayoutEffect(() => {
    const el = storyRef.current;
    if (!el || !autoFollowStoryRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [displayShown]);

  const revealedLines = briefingRevealedLines(lines, displayShown);
  const visibleLines = revealedLines.filter((line) => line.started);
  const isComplete = displayShown >= totalChars;
  const isTalking = displayShown > 0 && !isComplete;
  const activeLineIndex = isTalking ? briefingActiveLineIndex(lines, displayShown) : -1;

  return {
    shown: displayShown,
    playId,
    totalChars,
    storyRef,
    onStoryScroll,
    visibleLines,
    revealedLines,
    activeLineIndex,
    isTalking,
    isComplete,
    replayTransmission,
    skipToEnd,
  };
}
