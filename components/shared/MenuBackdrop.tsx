"use client";

import { useEffect, useRef } from "react";
import { createCinemaScene, renderCinemaFrame, stepCinemaScene, type Shot } from "./ambient/menuBackdropSim";
import styles from "./MenuBackdrop.module.css";

export function MenuBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scene = createCinemaScene();
    const shots: Shot[] = [];
    let raf = 0;
    let t = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (now: number) => {
      t += 1;
      stepCinemaScene(scene, shots, t, now);
      renderCinemaFrame(ctx, canvas.width, canvas.height, t, scene, shots);
      if (!reduceMotion) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className={styles.canvas} aria-hidden />;
}
