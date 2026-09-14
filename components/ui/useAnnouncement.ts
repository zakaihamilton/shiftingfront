"use client";

import { useCallback, useState } from "react";

/**
 * Shared announcement pattern for accessibility live regions (tactical
 * roster, pause notices). Returns the current message plus a stable
 * announcer that mirrors it to an optional parent channel.
 */
export function useAnnouncement(onAnnounce?: (message: string) => void): [string, (message: string) => void] {
  const [message, setMessage] = useState("");
  const announce = useCallback(
    (next: string) => {
      setMessage((current) => {
        if (current === next) return `${next}\u200b`;
        if (current === `${next}\u200b`) return next;
        return next;
      });
      onAnnounce?.(next);
    },
    [onAnnounce],
  );
  return [message, announce];
}
