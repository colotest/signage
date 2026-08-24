// Minimal offline cache for /screen/* player pages only (registered with
// scope: '/screen/' in Player.tsx — it never touches the authed dashboard).
// Goal: if connectivity drops, a screen that already loaded keeps showing
// its last content instead of going blank. This is intentionally simple —
// no precache manifest, since chunk hashes change every build and a stale
// precache would fight the browser's own HTTP caching.

// Bumped to v2 to purge any cache entries poisoned by the old Range-request
// bug (a partial response cached under a plain URL key could get served
// back for an unrelated byte range) — see the range-request check below.
const CACHE_NAME = "signage-player-v2";
const MEDIA_PATH = "/storage/v1/object/public/";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase Storage media (images/videos/PDFs): stale-while-revalidate so
  // already-shown content keeps playing offline, and updates in the background.
  if (url.pathname.includes(MEDIA_PATH)) {
    // Range requests — how <video> streams and buffers — must always go
    // straight to the network. Cache Storage keys entries by URL alone, with
    // no awareness of the Range header, so caching a partial response here
    // would let a *different* later range request be served those same
    // stale bytes back instead of its own: the decoder would silently get
    // the wrong data, which reads as stutter or corruption rather than an
    // outright error. Android WebView (FireTV Sticks) issues range requests
    // far more aggressively during video playback than a desktop browser
    // does, which lines up with this only showing up there.
    if (request.headers.has("range")) {
      event.respondWith(fetch(request));
      return;
    }

    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const network = fetch(request)
          .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached ?? network;
      }),
    );
    return;
  }

  // The player page itself and its JS/CSS: network-first, falling back to
  // the last cached copy if the network is unavailable.
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
  }
});
