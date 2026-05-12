interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Module-level singleton — survives across component mount/unmount cycles
let stored: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function capturePrompt(e: Event) {
  stored = e as BeforeInstallPromptEvent;
  listeners.forEach((fn) => fn());
}

export function getPrompt() {
  return stored;
}

export function clearPrompt() {
  stored = null;
}

export function subscribePrompt(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
