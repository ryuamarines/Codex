"use client";

import { useEffect } from "react";

export function CanonicalHostRedirect() {
  useEffect(() => {
    const configuredAuthDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;

    if (!configuredAuthDomain || typeof window === "undefined") {
      return;
    }

    const currentUrl = new URL(window.location.href);
    const isWebAppHost = currentUrl.hostname.endsWith(".web.app");
    const isFirebaseAppHost = configuredAuthDomain.endsWith(".firebaseapp.com");

    if (!isWebAppHost || !isFirebaseAppHost) {
      return;
    }

    if (currentUrl.hostname === configuredAuthDomain) {
      return;
    }

    currentUrl.hostname = configuredAuthDomain;
    window.location.replace(currentUrl.toString());
  }, []);

  return null;
}
