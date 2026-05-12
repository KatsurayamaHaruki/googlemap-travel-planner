"use client";
import { useEffect } from "react";

export function PwaProvider() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch((err) => console.warn("[PWA] SW registration failed:", err));
    }
  }, []);
  return null;
}
