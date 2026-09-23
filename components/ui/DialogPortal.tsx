"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function DialogPortal({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  const themeRoot = document.querySelector<HTMLElement>("[data-hud-scale]");
  return createPortal(children, themeRoot ?? document.body);
}
