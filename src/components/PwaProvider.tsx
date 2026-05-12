"use client";
import { useEffect } from "react";
import { capturePrompt } from "@/lib/pwaInstallPrompt";

export function PwaProvider() {
  useEffect(() => {
    // Capture the install prompt as early as possible (fires once on page load)
    window.addEventListener("beforeinstallprompt", capturePrompt);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[PWA] SW registration failed:", err));
    }

    return () => window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);
  return null;
}
