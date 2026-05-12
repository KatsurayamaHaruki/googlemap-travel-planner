"use client";
import { useState, useEffect } from "react";
import { getPrompt, clearPrompt, subscribePrompt } from "@/lib/pwaInstallPrompt";

export type PwaInstallState =
  | "installed"    // already running as PWA
  | "ios"          // iOS – must use Share sheet
  | "available"    // Chrome/Edge – prompt ready
  | "unavailable"; // browser doesn't support install

export function usePwaInstall() {
  const [state, setState] = useState<PwaInstallState>("unavailable");

  useEffect(() => {
    // Already installed (standalone mode)
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setState("installed");
      return;
    }

    // iOS Safari doesn't support beforeinstallprompt
    const isIos =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as Record<string, unknown>).MSStream;
    if (isIos) {
      setState("ios");
      return;
    }

    // Check if the prompt was already captured by PwaProvider before this hook mounted
    if (getPrompt()) {
      setState("available");
    }

    // Also subscribe to future captures (edge case: hook mounted before PwaProvider fires)
    const unsubscribe = subscribePrompt(() => {
      if (getPrompt()) setState("available");
    });
    return () => { unsubscribe(); };
  }, []);

  async function promptInstall() {
    const prompt = getPrompt();
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      clearPrompt();
      setState("installed");
    }
  }

  return { state, promptInstall };
}
