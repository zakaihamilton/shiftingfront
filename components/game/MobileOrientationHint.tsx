"use client";

import { useEffect, useState } from "react";
import { triggerHaptic } from "@/lib/ui/haptics";
import styles from "./MobileOrientationHint.module.css";

const DISMISS_KEY = "shiftingfront:orientation-dismissed";

export function MobileOrientationHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") {
        return;
      }
    } catch {
      // sessionStorage unavailable
    }

    const portraitQuery = window.matchMedia("(max-width: 600px) and (orientation: portrait)");

    const checkOrientation = () => {
      if (portraitQuery.matches) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    checkOrientation();
    portraitQuery.addEventListener?.("change", checkOrientation);

    return () => {
      portraitQuery.removeEventListener?.("change", checkOrientation);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    triggerHaptic("tap");
    setVisible(false);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // sessionStorage unavailable
    }
  };

  return (
    <aside
      className={styles.hint}
      role="status"
      aria-live="polite"
      data-testid="orientation-hint"
    >
      <div className={styles.icon} aria-hidden="true">
        <svg className={styles.iconSvg} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
          <path d="M12 18h.01" />
          <path d="M2 9l2-2 2 2" />
          <path d="M22 15l-2 2-2-2" />
        </svg>
      </div>
      <div className={styles.content}>
        <strong className={styles.title}>Rotate For Tactical View</strong>
        <span className={styles.description}>Landscape recommended for optimal radar & command overview</span>
      </div>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss orientation recommendation"
        onClick={dismiss}
      >
        ×
      </button>
    </aside>
  );
}
