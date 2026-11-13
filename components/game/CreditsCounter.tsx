"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/lib/ui/cx";
import styles from "./CreditsCounter.module.css";

function CreditsIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 18 14" width="18" height="14" aria-hidden="true" focusable="false">
      <path d="M2 10.5h9.5l1.8 2.2H3.8z" fill="#8a6a24" />
      <path d="M2 10.5 3.8 8.4h9.5L11.5 10.5z" fill="#e8c45a" />
      <path d="M13.3 8.4 15.1 10.5v2.2l-1.8-2.2z" fill="#6e5418" />
      <path d="M4.2 6.6h9.5l1.8 2.2H6z" fill="#a07a28" />
      <path d="M4.2 6.6 6 4.5h9.5l-1.8 2.1z" fill="#f3d56a" />
      <path d="M15.5 4.5 17.3 6.6v2.2l-1.8-2.2z" fill="#7a5e1c" />
      <path d="M6 4.4h8.2" stroke="#fff4c4" strokeWidth="0.7" />
    </svg>
  );
}

function formatCredits(value: number): string {
  return value.toLocaleString("en-US");
}

export function CreditsCounter({ value }: { value: number }) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const shownRef = useRef(value);
  const digitsRef = useRef<HTMLElement>(null);
  const flashTimer = useRef<number | null>(null);

  const writeDigits = useCallback(() => {
    const el = digitsRef.current;
    if (el) el.textContent = formatCredits(shownRef.current);
  }, []);

  useLayoutEffect(writeDigits);

  useEffect(() => {
    const from = shownRef.current;
    const to = value;
    if (from === to) {
      writeDigits();
      return;
    }
    setFlash(to > from ? "up" : "down");
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 480);
    let raf = 0;
    const t0 = performance.now();
    const dur = Math.min(700, 160 + Math.abs(to - from) * 4);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / dur);
      const eased = 1 - (1 - t) * (1 - t);
      const next = Math.round(from + (to - from) * eased);
      shownRef.current = next;
      writeDigits();
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, [value, writeDigits]);

  return (
    <div className={cx(styles.counter, flash === "up" && styles.up, flash === "down" && styles.down)} role="status" aria-label={`${value} available credits`}>
      <CreditsIcon />
      <span className={styles.label}>Available</span>
      <div className={styles.lcd}>
        <span className={styles.currency}>$</span>
        <span className={styles.readout}>
          <strong ref={digitsRef} data-testid="credits" className={styles.digits}>
            {formatCredits(value)}
          </strong>
        </span>
      </div>
    </div>
  );
}
