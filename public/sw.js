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

// Builds a 206 Partial Content response by slicing a *complete* cached
// response — never a partial one, which is what the v2 bump above fixed.
// The only thing that ever populates a plain (non-Range) cache entry for
// media is Player.tsx's explicit whole-file prefetch, so finding one here
// means the full file is already local. Returns null for anything that
// doesn't parse or fit, so the caller can fall back to the network.
async function sliceCachedResponse(cachedResponse, rangeHeader) {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader || "");
  if (!match) return null;

  const blob = await cachedResponse.blob();
  const size = blob.size;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (start >= size || end < start) return null;

  const slice = blob.slice(start, end + 1, cachedResponse.headers.get("Content-Type") || undefined);
  const headers = new Headers(cachedResponse.headers);
  headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  headers.set("Content-Length", String(slice.size));
  headers.set("Accept-Ranges", "bytes");
  return new Response(slice, { status: 206, statusText: "Partial Content", headers });
}

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
      event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
          // Look up by plain URL (no Range header) — this only ever finds
          // an entry if Player.tsx's whole-file prefetch already landed
          // one, in which case serve the requested slice straight out of
          // it instead of going to the network at all.
          const cachedFull = await cache.match(request.url);
          if (cachedFull) {
            const sliced = await sliceCachedResponse(cachedFull, request.headers.get("range"));
            if (sliced) return sliced;
          }
          return fetch(request);
        }),
      );
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
