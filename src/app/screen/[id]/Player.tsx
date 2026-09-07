"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { controlChannelName, playlistChannelName } from "@/lib/realtime/channels";
import type { ControlMessage } from "@/lib/realtime/channels";
import { mediaPublicUrl } from "@/types/domain";
import type { FitMode, PlaylistItemWithMedia, Screen } from "@/types/domain";
import { loadFromCache, saveToCache } from "@/lib/cache/playerCache";
import { brandFont } from "@/lib/fonts";
import { QrCode } from "@/components/QrCode";

// pdf.js needs browser canvas APIs, so this must never run during SSR.
const PdfSlide = dynamic(() => import("./PdfSlide"), { ssr: false });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

// How many times a single playlist item is allowed to force itself a fresh
// <video> element before giving up — see handleAutoRefresh below.
const MAX_AUTO_REFRESH_ATTEMPTS = 1;

// Any value other than 0/90/180/270 (e.g. undefined, before the migration
// adding this column has run) falls through to the plain, unrotated case —
// same defensive default as the rest of this app's orientation handling.
function rotationWrapperStyle(rotation: number): CSSProperties {
  if (rotation === 90 || rotation === 270) {
    return {
      top: "50%",
      left: "50%",
      width: "100vh",
      height: "100vw",
      transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
    };
  }
  if (rotation === 180) {
    return { inset: 0, transform: "rotate(180deg)" };
  }
  return { inset: 0 };
}

export function Player({
  screen: initialScreen,
  initialPlaylist,
}: {
  screen: Screen;
  initialPlaylist: PlaylistItemWithMedia[];
}) {
  const [screen, setScreen] = useState(initialScreen);
  const [playlist, setPlaylist] = useState(initialPlaylist);
  const [currentIndex, setCurrentIndex] = useState(0);
  const supabase = useMemo(() => createBrowserClient(), []);

  const current = playlist.length > 0 ? playlist[currentIndex % playlist.length] : null;

  // The auto-refresh/overlay mechanism further below is scoped to only
  // this one item — whichever plays first after a cold load — rather than
  // every item, so a run of glitchy items doesn't chop up playback with
  // repeated QR-code breaks. Captured once and never changed after: the
  // lazy initializer covers the common case (content already assigned at
  // mount), and the guarded setState below covers a screen that starts out
  // empty and only gets a playlist assigned later.
  const [firstItemId, setFirstItemId] = useState<PlaylistItemWithMedia["id"] | null>(
    () => initialPlaylist[0]?.id ?? null,
  );
  // Setting state directly during render, guarded so it only ever fires
  // once (the condition is false on every render after) — React's own
  // documented pattern for "derive this from what render sees, the first
  // time render sees it", cheaper than a useEffect for the same job and
  // without one more round trip through a committed frame first.
  if (firstItemId === null && current) {
    setFirstItemId(current.id);
  }

  // The playback loop reads the playlist/index through refs and reschedules
  // itself directly (see scheduleTick below) rather than through a
  // useEffect keyed on currentIndex. That's deliberate: when a playlist has
  // only one item, advancing computes the same index (0 -> 0), and React
  // bails out of re-rendering for an unchanged state value — an effect
  // keyed on that index would then simply never run again, silently
  // killing the cycle the first time a duplicate index came up. A newly
  // assigned second item would then never appear, since nothing was left
  // to notice the playlist had grown.
  const playlistRef = useRef(playlist);
  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  const indexRef = useRef(currentIndex);
  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A video/image/PDF that's mid-fetch when the network dies just stays
  // stuck there — browsers don't automatically resume a failed media fetch
  // on their own, unlike our Realtime channels which reconnect by design.
  // Bumping this forces the current slide to fully remount (fresh <video>/
  // <img> element, fresh fetch) once connectivity is confirmed back, so
  // nobody has to walk over and manually reload the tab. Deliberately not
  // used for the ordinary single-item-playlist loop (see VideoSlide's own
  // `loop` handling below) — remounting means a fresh fetch, which is
  // exactly the half-second black gap a same-item loop should never have.
  const [reloadToken, setReloadToken] = useState(0);
  const wasDisconnectedRef = useRef(false);

  function markDisconnected() {
    wasDisconnectedRef.current = true;
  }

  function reconnectIfNeeded() {
    if (!wasDisconnectedRef.current) return;
    wasDisconnectedRef.current = false;
    setReloadToken((t) => t + 1);
  }

  // The browser's own online/offline events are a useful supplementary
  // signal, but navigator.onLine only reflects the local network
  // interface — a router that stays "connected" locally while its WAN link
  // is actually down won't necessarily fire these. The playlist channel's
  // own reconnect below (tied to an actual round-trip with Supabase) is
  // the more reliable signal and covers that gap.
  useEffect(() => {
    window.addEventListener("offline", markDisconnected);
    window.addEventListener("online", reconnectIfNeeded);
    return () => {
      window.removeEventListener("offline", markDisconnected);
      window.removeEventListener("online", reconnectIfNeeded);
    };
  }, []);

  // Pause freezes the current image/PDF's duration countdown rather than
  // resetting it — remainingMsRef holds what's left, segmentStartRef marks
  // when the current running segment began, and pauseTick/resumeTick bank
  // and restore the difference. Video's own position is its countdown, so
  // pausing it is just calling .pause() on the element (see VideoSlide
  // below). None of this has any on-screen UI of its own — the only visible
  // trace of "paused" lives on the dashboard's preview tile.
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const remainingMsRef = useRef(0);
  const segmentStartRef = useRef(0);

  function advanceNow() {
    const items = playlistRef.current;
    const next = items.length > 0 ? (indexRef.current + 1) % items.length : 0;
    indexRef.current = next;
    setCurrentIndex(next);
  }

  function retreatNow() {
    const items = playlistRef.current;
    const next = items.length > 0 ? (indexRef.current - 1 + items.length) % items.length : 0;
    indexRef.current = next;
    setCurrentIndex(next);
  }

  function armTimer(ms: number) {
    if (timerRef.current) clearTimeout(timerRef.current);
    remainingMsRef.current = ms;
    segmentStartRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      advanceNow();
      scheduleTick(); // re-arm for the new current item, regardless of whether the index visibly changed
    }, ms);
  }

  // Called whenever the current item is (or becomes) an image/PDF that
  // needs a timer — on a fresh item this banks its full duration, only
  // actually arming the countdown if we're not currently paused.
  function scheduleTick() {
    const items = playlistRef.current;
    if (items.length === 0) return;
    const item = items[indexRef.current % items.length];
    if (!item || item.media_item.media_type === "video") return; // videos advance via onEnded instead
    const ms = item.duration_seconds * 1000;
    if (pausedRef.current) {
      remainingMsRef.current = ms;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    armTimer(ms);
  }

  function pauseTick() {
    if (!timerRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const elapsed = Date.now() - segmentStartRef.current;
    remainingMsRef.current = Math.max(0, remainingMsRef.current - elapsed);
  }

  function resumeTick() {
    const items = playlistRef.current;
    const item = items[indexRef.current % items.length];
    if (!item || item.media_item.media_type === "video") return;
    armTimer(remainingMsRef.current > 0 ? remainingMsRef.current : item.duration_seconds * 1000);
  }

  // Explicit and idempotent rather than a toggle — a broadcast can arrive
  // more than once for one logical command (e.g. two effect instances
  // briefly overlapping across a reconnect), and a toggle would flip back
  // and forth on a duplicate delivery, silently cancelling the pause. Since
  // the sender always states the target state it wants, applying "pause"
  // twice in a row is simply a no-op the second time.
  function applyPaused(next: boolean) {
    if (pausedRef.current === next) return;
    pausedRef.current = next;
    if (next) pauseTick();
    else resumeTick();
    setPaused(next);
  }

  // Some Android WebView video loads (observed on Fire TV Stick) get stuck
  // indefinitely on their very first buffering attempt — a blank/white
  // element that never progresses — while a brand-new <video> element
  // pointed at the exact same URL loads normally right away. We tried
  // detecting this from inside the page (a "playing"-event watchdog, then a
  // canvas pixel-sampling one) and both came up empty on the real device —
  // the element reports fully healthy playback (readyState=4, no error,
  // currentTime advancing through several loop cycles) the entire time the
  // screen is actually white, so there's no in-page signal left to trust.
  // Rather than keep chasing a detector, just do unconditionally what
  // fixing it by hand does: force a fresh <video> element a few seconds
  // into that first item's play, regardless of whether anything looks
  // wrong. One attempt isn't always enough in practice, so allow a few
  // tries before giving up and just showing whatever's there — but only
  // for firstItemId (see above): a run of glitchy items each getting this
  // treatment would chop up playback with repeated QR-code breaks, so
  // every item after the first is left alone, whatever it does.
  const autoRefreshCountsRef = useRef<Map<PlaylistItemWithMedia["id"], number>>(new Map());
  // A render-time-readable mirror of the ref above — reading a ref during
  // render is unreliable (and the lint rules here correctly forbid it), so
  // this is what Slide's "should I still cover the video with the branding
  // overlay" decision below actually reads. The ref stays the source of
  // truth for the callback's own attempt-counting guard, since that check
  // happens inside an event handler, not during render.
  const [autoRefreshCounts, setAutoRefreshCounts] = useState<Map<PlaylistItemWithMedia["id"], number>>(() => new Map());

  // Stable identity (empty deps aside from firstItemId, which changes at
  // most once, reading everything else through refs like
  // advanceNow/retreatNow above) is load-bearing here, not just tidiness:
  // this is handed to VideoSlide as a prop its timer effect depends on, so
  // a new function reference on every Player render — which a plain
  // function declaration would produce — would tear down and re-arm that
  // effect's setTimeout on every single re-render, and a re-render is not
  // guaranteed to leave enough of a gap for the timer to ever fire.
  const handleAutoRefresh = useCallback(() => {
    const items = playlistRef.current;
    if (items.length === 0) return;
    const item = items[indexRef.current % items.length];
    if (!item || item.id !== firstItemId) return;
    const attempts = autoRefreshCountsRef.current.get(item.id) ?? 0;
    if (attempts >= MAX_AUTO_REFRESH_ATTEMPTS) return;
    const next = attempts + 1;
    autoRefreshCountsRef.current.set(item.id, next);
    setAutoRefreshCounts((prev) => new Map(prev).set(item.id, next));
    setReloadToken((t) => t + 1);
  }, [firstItemId]);

  function skipNext() {
    advanceNow();
    scheduleTick();
  }

  function skipPrev() {
    retreatNow();
    scheduleTick();
  }

  function handleVideoEnded() {
    // A pause requested right as the video reaches its natural end can
    // otherwise race the "ended" event — without this guard, the video
    // would freeze for an instant and then still advance to the next item
    // despite having just been paused.
    if (pausedRef.current) return;
    skipNext(); // in case the next item is an image/PDF that needs a timer
  }

  // Cache whatever we last successfully rendered so a reload while offline
  // still shows something instead of a blank screen.
  useEffect(() => {
    saveToCache(screen.id, { screen, playlist });
  }, [screen, playlist]);

  // Scoped to /screen/ only — never registered for the authed dashboard.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/screen/" }).catch(() => {});
    }
  }, []);

  // The <video> element only ever issues Range requests, which sw.js
  // deliberately never caches (a cached partial response would get replayed
  // for the wrong byte range later — see that file). So nothing about
  // playing a video ever leaves a local copy behind, and every play is a
  // live fetch against Supabase's origin over whatever the venue's
  // connection happens to be that moment — on a slow link that reads as a
  // long white screen while enough of the file trickles in. A plain GET
  // (no Range header) is the one request shape the service worker *does*
  // cache in full, so proactively firing one per video here — well before
  // it's due to play — gives sw.js a complete local copy to slice Range
  // requests out of instead of ever hitting the network live. Waits for
  // the service worker to actually be controlling the page first, since a
  // prefetch that lands before that would just be an ordinary uncached
  // fetch.
  const prefetchedUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    navigator.serviceWorker.ready.then(() => {
      if (cancelled) return;
      for (const item of playlist) {
        if (item.media_item.media_type !== "video") continue;
        const url = mediaPublicUrl(SUPABASE_URL, item.media_item.storage_path);
        if (prefetchedUrlsRef.current.has(url)) continue;
        prefetchedUrlsRef.current.add(url);
        fetch(url).catch(() => {
          prefetchedUrlsRef.current.delete(url); // let a failed attempt retry on the next playlist change
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [playlist]);

  // Multiple realtime events firing in quick succession (e.g. assigning an
  // item and then immediately editing its duration) each kick off their own
  // async refetch — network responses can resolve out of order, so an older
  // refetch's result could otherwise clobber a newer one. Track a sequence
  // number and only apply the result from the most recently started refetch.
  const refetchSeqRef = useRef(0);

  useEffect(() => {
    async function refetch() {
      const seq = ++refetchSeqRef.current;
      const [{ data: freshScreen }, { data: freshPlaylist }] = await Promise.all([
        supabase.from("screens").select("*").eq("id", screen.id).single(),
        supabase
          .from("playlist_items")
          .select("*, media_item:media_items(*)")
          .eq("screen_id", screen.id)
          .order("position", { ascending: true }),
      ]);
      if (seq !== refetchSeqRef.current) return; // a newer refetch has since started — discard
      if (freshScreen) setScreen(freshScreen);
      if (freshPlaylist) setPlaylist(freshPlaylist as unknown as PlaylistItemWithMedia[]);
    }

    const channel = supabase
      .channel(playlistChannelName(screen.id))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "playlist_items", filter: `screen_id=eq.${screen.id}` },
        refetch,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "screens", filter: `id=eq.${screen.id}` },
        refetch,
      )
      .subscribe((status) => {
        // Websocket reconnects don't replay missed deltas, so reconcile
        // with a full refetch every time the channel (re)connects — this
        // also covers the case where the tab was offline and just came back.
        if (status === "SUBSCRIBED") {
          refetch();
          reconnectIfNeeded();
        }
        if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          markDisconnected();
          const cached = loadFromCache(screen.id);
          if (cached) {
            setScreen(cached.screen);
            setPlaylist(cached.playlist);
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id]);

  // Playback commands from a dashboard tile arrive here as one-off
  // broadcasts rather than persisted state — the player applies them
  // immediately with no report-back to the dashboard.
  useEffect(() => {
    const channel = supabase.channel(controlChannelName(screen.id));
    channel
      .on("broadcast", { event: "control" }, ({ payload }) => {
        const message = payload as ControlMessage;
        switch (message.type) {
          case "play":
            applyPaused(false);
            break;
          case "pause":
            applyPaused(true);
            break;
          case "next":
            skipNext();
            break;
          case "prev":
            skipPrev();
            break;
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id]);

  // Kicks off the playback loop, and restarts it promptly if the currently
  // shown item's own duration is edited mid-display. Once started,
  // scheduleTick() re-arms itself directly (see above) — this effect does
  // not need to fire again just to keep the cycle going.
  useEffect(() => {
    scheduleTick();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.duration_seconds]);

  // Reset to a valid index if the playlist shrinks (e.g. an item was unassigned).
  useEffect(() => {
    if (currentIndex >= playlist.length && playlist.length > 0) {
      setCurrentIndex(0);
    }
  }, [playlist.length, currentIndex]);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-black">
      {/* A screen mounted rotated N degrees counterclockwise needs its
          content rotated N degrees clockwise to cancel that out and land
          upright for the viewer — that's the whole point: media never has
          to be pre-rotated for a rotated deployment, at any of the four
          quarter-turns. At 90/270° the box is laid out at the viewport's
          *swapped* dimensions (its width is the viewport's height and vice
          versa) before the rotation, so that once rotated it exactly fills
          the landscape viewport with no gaps — see the geometry note on
          ScreenTile's shadow rotation for the same underlying trick applied
          the other direction. 0/180° don't need swapped dimensions since a
          half-turn (or no turn) doesn't change which axis is longer. */}
      <div className="absolute" style={rotationWrapperStyle(screen.rotation ?? 0)}>
        {!current ? (
          <NoContentPlaceholder />
        ) : (
          <Slide
            key={`${current.id}-${reloadToken}`}
            item={current}
            fitMode={screen.fit_mode}
            paused={paused}
            loop={playlist.length === 1}
            onVideoEnded={handleVideoEnded}
            onVideoAutoRefresh={handleAutoRefresh}
            showAutoRefreshOverlay={
              current.id === firstItemId && (autoRefreshCounts.get(current.id) ?? 0) < MAX_AUTO_REFRESH_ATTEMPTS
            }
          />
        )}
      </div>
    </div>
  );
}

// The QR code's target depends on the origin this player happens to be
// served from (custom domain, *.vercel.app, localhost), which is only known
// client-side — so it renders one tick after mount rather than needing a
// prop threaded down from the server.
function NoContentPlaceholder() {
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);

  useEffect(() => {
    setDashboardUrl(`${window.location.origin}/dashboard`);
  }, []);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6">
      <span className={`${brandFont.className} text-[40px] uppercase tracking-tight text-white`}>Colo Cloud</span>
      {dashboardUrl && <QrCode value={dashboardUrl} size={200} />}
    </div>
  );
}

function Slide({
  item,
  fitMode,
  paused,
  loop,
  onVideoEnded,
  onVideoAutoRefresh,
  showAutoRefreshOverlay,
}: {
  item: PlaylistItemWithMedia;
  fitMode: FitMode;
  paused: boolean;
  loop: boolean;
  onVideoEnded: () => void;
  onVideoAutoRefresh: () => void;
  showAutoRefreshOverlay: boolean;
}) {
  const url = mediaPublicUrl(SUPABASE_URL, item.media_item.storage_path);
  const fitClass = fitMode === "cover" ? "object-cover" : "object-contain";

  if (item.media_item.media_type === "video") {
    return (
      <VideoSlide
        url={url}
        fitClass={fitClass}
        paused={paused}
        loop={loop}
        onVideoEnded={onVideoEnded}
        onAutoRefresh={onVideoAutoRefresh}
        showInitialOverlay={showAutoRefreshOverlay}
      />
    );
  }

  if (item.media_item.media_type === "pdf") {
    return <PdfSlide url={url} fit={fitMode} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={item.media_item.name} className={`h-full w-full ${fitClass}`} />;
}

// Keeps the autoPlay attribute for the initial start — browsers handle
// attribute-driven autoplay far more robustly than a script-called .play()
// (e.g. a hidden/backgrounded document can silently reject a JS play()
// call, whereas autoPlay just waits and starts once eligible). The effect
// below only takes over for pause/resume *after* that initial start, and
// re-syncs on visibilitychange as a safety net in case the kiosk browser
// window briefly loses focus (screensaver, OS switch, display wake).

// A ?debug=1 run showed the video element reporting a fully healthy
// playback state (readyState=4, no error, fully buffered, currentTime
// advancing through several loop cycles) for the entire time the screen
// was still visibly white — so there's no in-page signal that reliably
// indicates this failure. Gated behind a URL flag so it costs nothing in
// normal operation — append ?debug=1 to a screen's URL to show it.
const MEDIA_EVENTS = [
  "loadstart",
  "loadedmetadata",
  "loadeddata",
  "canplay",
  "canplaythrough",
  "playing",
  "waiting",
  "stalled",
  "suspend",
  "abort",
  "emptied",
  "error",
] as const;

function isDebugMode() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
}

function useVideoDebugLog(video: HTMLVideoElement | null, enabled: boolean) {
  const [log, setLog] = useState<string[]>([]);
  const [, forceTick] = useState(0);
  const startRef = useRef(0);

  useEffect(() => {
    if (!enabled || !video) return;
    startRef.current = Date.now();

    function record(e: Event) {
      const t = ((Date.now() - startRef.current) / 1000).toFixed(1);
      const err = video!.error;
      const extra = e.type === "error" && err ? ` (code=${err.code} "${err.message}")` : "";
      setLog((prev) => [...prev.slice(-19), `${t}s ${e.type}${extra}`]);
    }

    for (const ev of MEDIA_EVENTS) video.addEventListener(ev, record);
    const interval = setInterval(() => forceTick((t) => t + 1), 500); // keeps the live readout (currentTime/buffered) fresh
    return () => {
      for (const ev of MEDIA_EVENTS) video.removeEventListener(ev, record);
      clearInterval(interval);
    };
  }, [video, enabled]);

  return log;
}

function VideoDebugOverlay({ video, log }: { video: HTMLVideoElement; log: string[] }) {
  const buffered =
    Array.from({ length: video.buffered.length }, (_, i) => `${video.buffered.start(i).toFixed(1)}-${video.buffered.end(i).toFixed(1)}`).join(
      ", ",
    ) || "none";

  return (
    <pre className="pointer-events-none absolute left-0 top-0 z-50 m-2 max-w-[90vw] whitespace-pre-wrap break-all bg-black/80 p-2 text-[11px] leading-tight text-lime-300">
      {`readyState=${video.readyState} networkState=${video.networkState} paused=${video.paused} ended=${video.ended}
currentTime=${video.currentTime.toFixed(1)} buffered=${buffered}
error=${video.error ? `code=${video.error.code} ${video.error.message}` : "none"}
events:
${log.join("\n")}`}
    </pre>
  );
}

// Mirrors the manual fix exactly and unconditionally: a few seconds into
// every video's first play, force a fresh <video> element regardless of
// whether anything looks wrong. "Within seconds" is what made the manual
// version reliable, so this stays short — long enough to give a genuinely
// healthy load a moment to get going first, short enough that a real stall
// doesn't sit on screen for long before it's fixed either way.
const AUTO_REFRESH_DELAY_MS = 4000;

function VideoSlide({
  url,
  fitClass,
  paused,
  loop,
  onVideoEnded,
  onAutoRefresh,
  showInitialOverlay,
}: {
  url: string;
  fitClass: string;
  paused: boolean;
  // A single-item playlist "advancing" is really just looping the same
  // video — letting the browser handle that natively (seeking back to 0
  // in place) is what keeps it gapless. The remount-based reload token
  // elsewhere in this file is a different, deliberately heavier tool for a
  // different job (recovering a genuinely stuck fetch after a connectivity
  // drop), not something to reach for on every ordinary loop.
  loop: boolean;
  onVideoEnded: () => void;
  onAutoRefresh: () => void;
  // True as long as this item has attempts left, meaning this mount will
  // itself end in another forced remount — so the overlay just needs to
  // cover this component's own lifetime, no separate hide timer required,
  // since the remount's unmount *is* the reveal. Only false on the mount
  // that follows the final allowed attempt, which is presumed (not
  // confirmed — we still have no way to check) to finally be a good one.
  showInitialOverlay: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [debug] = useState(isDebugMode);
  // A plain useRef read during render can't be relied on to reflect the
  // mounted element (and the lint rules here correctly forbid it) — this
  // callback ref also lands the element in state, which is safe to read
  // at render time and reactively updates once the <video> actually mounts.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const debugLog = useVideoDebugLog(videoEl, debug);

  useEffect(() => {
    const timer = setTimeout(onAutoRefresh, AUTO_REFRESH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [onAutoRefresh]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    function sync() {
      if (paused) video!.pause();
      else video!.play().catch(() => {});
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [paused]);

  return (
    <>
      <video
        ref={(el) => {
          videoRef.current = el;
          setVideoEl(el);
        }}
        src={url}
        autoPlay
        muted
        loop={loop}
        playsInline
        preload="auto"
        // The kiosk display has no user to click it, so the browser's own
        // cast-to-TV affordance (the icon in the corner) is pure noise here.
        disableRemotePlayback
        onEnded={onVideoEnded}
        className={`h-full w-full ${fitClass}`}
        // A rotated screen puts a CSS transform on this element's ancestor
        // (see rotationWrapperStyle above), which on its own tends to knock
        // hardware video decode off its fast overlay path and onto a much
        // more expensive CPU-side composite — exactly the kind of thing a
        // weak set-top box's SoC struggles with. Promoting the video itself
        // onto its own GPU layer keeps the decoded frames on a hardware
        // surface that the compositor can still just rotate wholesale.
        style={{ transform: "translateZ(0)", willChange: "transform" }}
      />
      {showInitialOverlay && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
          <NoContentPlaceholder />
        </div>
      )}
      {debug && videoEl && <VideoDebugOverlay video={videoEl} log={debugLog} />}
    </>
  );
}
