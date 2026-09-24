"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)];
}

export function useModalFocus(
  active: boolean,
  resetKey?: string | number,
  initial: "dialog" | "first" = "first",
): RefObject<HTMLElement | null> {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const items = focusableElements(node);
    const start = initial === "first" ? (items[0] ?? node) : node;
    start.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const modalDialogs = document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (modalDialogs.length && modalDialogs[modalDialogs.length - 1] !== node) return;
      const cycle = focusableElements(node);
      if (cycle.length === 0) {
        event.preventDefault();
        node.focus();
        return;
      }
      const first = cycle[0]!;
      const last = cycle[cycle.length - 1]!;
      const activeEl = document.activeElement;
      const inside = activeEl instanceof Node && node.contains(activeEl);
      if (!inside) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (event.shiftKey && (activeEl === first || activeEl === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeEl === last || activeEl === node)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (previous?.isConnected) previous.focus();
    };
  }, [active, initial, resetKey]);

  return ref;
}
