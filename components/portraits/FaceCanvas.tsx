"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { FaceTone } from "@/lib/render/portraits";
import type { Character } from "@/lib/types";
import { FACE_CANVAS_HEIGHT, FACE_CANVAS_WIDTH, paintFaceFrame } from "./paintFaceFrame";
import type { FacePortrait } from "./useFacePortrait";
import styles from "./Face.module.css";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function FaceCanvas({ who, talking, tone, portrait }: { who: Character; talking: boolean; tone: FaceTone; portrait: FacePortrait }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const whoRef = useRef(who);
  const talkingRef = useRef(talking);
  const toneRef = useRef(tone);

  useIsomorphicLayoutEffect(() => { whoRef.current = who; talkingRef.current = talking; toneRef.current = tone; }, [talking, tone, who]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = FACE_CANVAS_WIDTH * dpr;
    canvas.height = FACE_CANVAS_HEIGHT * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
    let t = 0;
    let last = performance.now();
    let raf = 0;
    let lastSig = "";
    const loop = (now: number) => { t += Math.min(32, now - last) * (60 / 1000); last = now; lastSig = paintFaceFrame(ctx, dpr, t, whoRef.current, talkingRef.current, toneRef.current, portrait, lastSig); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [portrait]);

  return <canvas ref={ref} width={FACE_CANVAS_WIDTH} height={FACE_CANVAS_HEIGHT} className={styles.canvas} data-testid="briefing-portrait" />;
}
