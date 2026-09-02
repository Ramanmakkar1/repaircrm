/*
 * RepairFlow service worker.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT IS FOR, AND WHAT IT IS DELIBERATELY NOT FOR
 * ---------------------------------------------------------------------------
 * RepairFlow is a live view of a shop's tickets, invoices and stock. A cached
 * ticket list is a LIE — it shows a job as "In Progress" that was picked up an
 * hour ago. So this worker does not try to make the app work offline. It does
 * exactly two things:
 *
 *   1. Serves the static build assets from cache, so an installed copy on a
 *      counter tablet opens instantly instead of re-downloading its JavaScript.
 *   2. Shows a proper "you're offline" page when the network is gone, instead
 *      of the browser's dinosaur.
 *
 * NEVER CACHED, and each for its own reason:
 *
 *   /api/*      answers are per-request and often per-session; a cached one is
 *               a stale one, and a cached /api/v1 response would be somebody's
 *               shop data sitting in a shared browser profile.
 *   /portal/*   a customer's own documents. A cached copy in a shop's browser
 *               (or on a shared machine) is a privacy problem, not a speedup.
 *   /files/*    attachments — same reasoning, and they are session-gated.
 *   anything    a POST is an action, not a document. The cache API refuses to
 *   not GET     store them anyway; being explicit keeps the intent visible.
 *
 * ---------------------------------------------------------------------------
 * VERSIONING
 * ---------------------------------------------------------------------------
 * CACHE bakes a version into its name. Bump it when this file changes: the new
 * worker installs alongside the old one, `activate` deletes every cache that is
 * not the current name, and `clients.claim()` takes over open tabs immediately.
 * Without the bump a browser would keep serving whatever the old worker cached.
 */

const VERSION = "v2";
const CACHE = `repairflow-${VERSION}`;

/** Fetched during install, alongside whatever the offline page itself needs. */
const PRECACHE = ["/offline", "/icons/icon-192.png"];

/**
 * Caching /offline's HTML is not enough.
 *
 * It is a Next.js route, so the document is a shell that immediately asks for
 * its CSS and JavaScript chunks. With the network gone those requests fail and
 * the browser renders Next's "this page couldn't load" instead of our page —
 * the offline page's own assets have to be in the cache too.
 *
 * Their URLs are content-hashed and therefore unknowable ahead of time, so they
 * are read out of the HTML we just fetched. A regex over markup is usually a
 * bad idea; here the input is our own build output and the failure mode is a
 * missing asset, not a security hole.
 */
async function precacheOfflinePage(cache) {
  // `reload` bypasses the HTTP cache, so installing a new worker cannot
  // precache the very page the old one was serving.
  const response = await fetch("/offline", { cache: "reload" });
  if (!response.ok) return;

  await cache.put("/offline", response.clone());

  const html = await response.text();
  const assets = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    assets.add(match[1]);
  }

  // One at a time, each failure swallowed: a single 404 must not abort the
  // install and leave the worker with no offline page at all.
  await Promise.all(
    [...assets].map((url) =>
      cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
    ),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await precacheOfflinePage(cache);
      await Promise.all(
        PRECACHE.filter((url) => url !== "/offline").map((url) =>
          cache.add(new Request(url, { cache: "reload" })).catch(() => {}),
        ),
      );
      // Don't sit in "waiting" until every tab closes; a shop leaves the app
      // open for days and would otherwise never get the new worker.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/** True for anything whose freshness or privacy rules out a cache entry. */
function isPrivate(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/portal") ||
    url.pathname.startsWith("/files/")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Another origin's request is none of our business — passing it through
  // untouched is also what keeps a CDN font or an image from being cached here.
  if (url.origin !== self.location.origin) return;

  if (isPrivate(url)) return;

  // CACHE-FIRST for /_next/static: those URLs contain a content hash, so a
  // given URL's bytes never change. A cache hit is always correct.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // NETWORK-FIRST for navigations, falling back to the offline page. Never
  // falling back to a cached page: see the note at the top about lying.
  if (request.mode === "navigate") {
    event.respondWith(navigateOrOffline(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // Only complete, same-origin 200s are stored. An opaque or partial response
  // in the cache is a broken asset served forever.
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function navigateOrOffline(request) {
  try {
    return await fetch(request);
  } catch {
    const offline = await caches.match("/offline");
    return (
      offline ??
      new Response("You're offline.", {
        status: 503,
        headers: { "Content-Type": "text/plain" },
      })
    );
  }
}
