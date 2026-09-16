"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      window.location.protocol.startsWith("http")
    ) {
      const isLocalDevelopment = window.location.hostname === "localhost"
        || window.location.hostname === "127.0.0.1";
      if (isLocalDevelopment) {
        // Never let the PWA cache mask HMR or fresh local builds. Unregistering
        // also cleans up workers left behind by older development sessions.
        void navigator.serviceWorker
          .getRegistrations()
          .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
          .catch(() => {
            // Service worker cleanup is best effort in restricted browser contexts.
          });
        return;
      }

      const handleLoad = () => {
        navigator.serviceWorker
          .register("/sw.js", { scope: "/", updateViaCache: "none" })
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
