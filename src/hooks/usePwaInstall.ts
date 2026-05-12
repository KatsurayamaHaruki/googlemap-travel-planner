"use client";
import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export type PwaInstallState =
  | "installed"   // already running as PWA
  | "ios"         // iOS – must use Share sheet
  | "available"   // Chrome/Edge – prompt ready
  | "unavailable"; // browser doesn't support install

export function usePwaInstall() {
  const [state, setState] = useState<PwaInstallState>("unavailable");
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setState("installed");
      return;
    }

    // iOS Safari – no beforeinstallprompt, user must use Share sheet
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as Record<string, unknown>).MSStream;
    if (isIos) {
      setState("ios");
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setState("available");
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function promptInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setState("installed");
      setDeferredPrompt(null);
    }
  }

  return { state, promptInstall };
}
