"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    const isMobileViewport = window.matchMedia("(max-width: 900px)").matches;
    const shouldUsePwaCaching = isStandalone || isMobileViewport;

    const unregisterForDesktopBrowser = async () => {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));

      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((key) => key.startsWith("live-log-")).map((key) => caches.delete(key))
        );
      }
    };

    if (!shouldUsePwaCaching) {
      unregisterForDesktopBrowser().catch(() => {
        // Ignore cleanup failures; the app still works as a normal web app.
      });
      return;
    }

    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((registration) => registration.update())
      .catch(() => {
        // Ignore registration failures; the app still works as a normal web app.
      });
  }, []);

  return null;
}
