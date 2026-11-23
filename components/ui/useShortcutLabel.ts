"use client";

import { useSyncExternalStore } from "react";
import { formatShortcut, isMacPlatform } from "@/lib/ui/shortcuts";

const subscribe = () => () => {};
const getServerSnapshot = () => false;
const getSnapshot = () =>
  typeof navigator !== "undefined" ? isMacPlatform(navigator.platform, navigator.userAgent) : false;

export function useShortcutLabel(shortcut: string): string {
  const mac = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return formatShortcut(shortcut, mac);
}
