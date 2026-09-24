import { useEffect, useState } from "react";
import { parseTooltipPos, type TooltipPos } from "@/lib/ui/tooltip";

export type TipState = {
  text: string;
  shortcut: string | null;
  pos: TooltipPos;
  anchor: DOMRect;
};

function tooltipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof Element)) return null;
  return node.closest("[data-tooltip]");
}

export function useTooltipTarget() {
  const [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => {
    const hoverRef = { current: null as HTMLElement | null };
    const forcedRef = { current: null as HTMLElement | null };
    const keyboardDismissedRef = { current: false };
    const pointerFocusSuppressedRef = { current: false };
    const forcedEl = () => document.querySelector("[data-tooltip-open]") as HTMLElement | null;

    const paint = () => {
      if (keyboardDismissedRef.current) {
        setTip(null);
        return;
      }
      const forced = forcedEl();
      const el = forced ?? hoverRef.current;
      forcedRef.current = forced;
      if (!el || !document.body.contains(el)) {
        hoverRef.current = null;
        forcedRef.current = null;
        setTip(null);
        return;
      }
      const text = el.getAttribute("data-tooltip");
      if (!text) {
        setTip(null);
        return;
      }
      const shortcut = el.getAttribute("data-shortcut");
      setTip({
        text,
        shortcut: shortcut && shortcut.trim() ? shortcut.trim() : null,
        pos: parseTooltipPos(el.getAttribute("data-tooltip-pos")),
        anchor: el.getBoundingClientRect(),
      });
    };

    const onOver = (e: PointerEvent) => {
      const el = tooltipTarget(e.target);
      if (!el) return;
      pointerFocusSuppressedRef.current = false;
      keyboardDismissedRef.current = false;
      hoverRef.current = el;
      paint();
    };

    const onOut = (e: PointerEvent) => {
      const el = tooltipTarget(e.target);
      if (!el || el !== hoverRef.current) return;
      const next = tooltipTarget(e.relatedTarget);
      if (next === el) return;
      hoverRef.current = next;
      paint();
    };

    const onPointerDown = () => {
      pointerFocusSuppressedRef.current = true;
      keyboardDismissedRef.current = true;
      hoverRef.current = null;
      forcedRef.current = null;
      setTip(null);
    };

    const onFocus = (e: FocusEvent) => {
      if (pointerFocusSuppressedRef.current) return;
      const el = tooltipTarget(e.target);
      if (!el) return;
      keyboardDismissedRef.current = false;
      hoverRef.current = el;
      paint();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (["Alt", "Control", "Meta", "Shift"].includes(e.key)) return;
      pointerFocusSuppressedRef.current = false;
      keyboardDismissedRef.current = true;
      hoverRef.current = null;
      forcedRef.current = null;
      setTip(null);
    };

    const onBlur = (e: FocusEvent) => {
      if (hoverRef.current && !hoverRef.current.contains(e.relatedTarget as Node | null) && hoverRef.current !== forcedEl()) {
        if (tooltipTarget(e.target) === hoverRef.current) hoverRef.current = null;
        paint();
      }
    };

    const onScrollOrResize = () => paint();

    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerout", onOut);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    const mo = new MutationObserver(paint);
    mo.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["data-tooltip", "data-tooltip-pos", "data-tooltip-open", "data-shortcut"],
    });
    paint();
    return () => {
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerout", onOut);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      mo.disconnect();
    };
  }, []);

  return tip;
}
