"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      window.location.protocol.startsWith("http")
    ) {
      const handleLoad = () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/" })
          .catch(() => {
            // Service worker registration error (e.g. unsupported in sandboxed iframe)
          });
      };

      if (document.readyState === "complete") {
        handleLoad();
      } else {
        window.addEventListener("load", handleLoad, { once: true });
      }
    }
  }, []);

  return null;
}
