import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Use a timestamp-based version so each build gets a unique cache key
const buildId = Date.now().toString(36);

const sw = `const CACHE_NAME = "travel-planner-${buildId}";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(["/", "/login"]).catch(() => {})
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Skip API calls, auth endpoints, and cross-origin requests
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/") ||
    url.origin !== self.location.origin
  )
    return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache Next.js static assets permanently
        if (response.ok && url.pathname.startsWith("/_next/static/")) {
          const clone = response.clone();
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
`;

writeFileSync(join(root, "public", "sw.js"), sw);
console.log(`Generated sw.js with cache version: travel-planner-${buildId}`);
