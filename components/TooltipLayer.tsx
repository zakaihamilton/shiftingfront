"use client";

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { placeTooltip, tooltipMaxBox } from "@/lib/ui/tooltip";
import styles from "./TooltipLayer.module.css";
import { useTooltipTarget } from "./useTooltipTarget";

export function TooltipLayer() {
  const tip = useTooltipTarget();
  const nodeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const node = nodeRef.current;
    if (!node || !tip) return;
    const view = { width: window.innerWidth, height: window.innerHeight };
    const max = tooltipMaxBox(view);
    node.style.maxWidth = `${max.width}px`;
    node.style.maxHeight = `${max.height}px`;
    const size = node.getBoundingClientRect();
    const next = placeTooltip(
      tip.anchor,
      { width: size.width, height: size.height },
      tip.pos,
      view,
    );
    node.style.top = `${next.top}px`;
    node.style.left = `${next.left}px`;
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={nodeRef}
      className={styles.tooltip}
      role="tooltip"
      style={{ top: -9999, left: -9999 }}
    >
      <span className={styles.text}>{tip.text}</span>
      {tip.shortcut ? <kbd className={styles.kbd}>{tip.shortcut}</kbd> : null}
    </div>,
    document.body,
  );
}
