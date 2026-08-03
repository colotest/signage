"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { controlChannelName, playlistChannelName, presenceChannelName } from "@/lib/realtime/channels";
import type { ControlMessage } from "@/lib/realtime/channels";
import { mediaPublicUrl } from "@/types/domain";
import type { FitMode, PlaylistItemWithMedia, Screen } from "@/types/domain";
import { loadFromCache, saveToCache } from "@/lib/cache/playerCache";
import { cn } from "@/lib/utils/cn";
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from "@/components/icons/PlaybackIcons";

// pdf.js needs browser canvas APIs, so this must never run during SSR.
const PdfSlide = dynamic(() => import("./PdfSlide"), { ssr: false });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

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

  // Pause freezes the current image/PDF's duration countdown rather than
  // resetting it — remainingMsRef holds what's left, segmentStartRef marks
  // when the current running segment began, and pauseTick/resumeTick bank
  // and restore the difference. Video's own position is its countdown, so
  // pausing it is just calling .pause() on the element (see Slide below).
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

  function togglePause() {
    setPaused((prev) => {
      const next = !prev;
      pausedRef.current = next;
      if (next) pauseTick();
      else resumeTick();
      return next;
    });
  }

  function skipNext() {
    advanceNow();
    scheduleTick();
  }

  function skipPrev() {
    retreatNow();
    scheduleTick();
  }

  function handleVideoEnded() {
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
        if (status === "SUBSCRIBED") refetch();
        if (status === "CLOSED" || status === "CHANNEL_ERROR") {
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

  // Broadcasts "now playing" so the dashboard can show a live preview and
  // online/offline status without polling the database. Always tracks once
  // connected, even with nothing assigned — "online" means a player is
  // connected, which is a distinct fact from whether it has content.
  // A stable channel subscribed once per screen — re-tracking on every
  // paused toggle (rather than tearing down and resubscribing the whole
  // channel) avoids a brief window with two overlapping presences where
  // the dashboard's "latest wins" read could pick the stale one.
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceSubscribedRef = useRef(false);

  function trackPresence() {
    const presence = presenceRef.current;
    if (!presence || !presenceSubscribedRef.current) return;
    if (current) {
      presence.track({
        mediaItemId: current.media_item.id,
        name: current.media_item.name,
        mediaType: current.media_item.media_type,
        storagePath: current.media_item.storage_path,
        startedAt: Date.now(),
        paused,
      });
    } else {
      presence.track({});
    }
  }

  useEffect(() => {
    const presence = supabase.channel(presenceChannelName(screen.id));
    presenceRef.current = presence;
    presence.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      presenceSubscribedRef.current = true;
      trackPresence();
    });
    return () => {
      presenceSubscribedRef.current = false;
      presenceRef.current = null;
      supabase.removeChannel(presence);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id]);

  useEffect(() => {
    trackPresence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, paused]);

  // Playback commands from a dashboard tile arrive here as one-off
  // broadcasts rather than persisted state — the same handlers the
  // on-screen controls below call, so both sources of input converge on
  // identical behavior.
  useEffect(() => {
    const channel = supabase.channel(controlChannelName(screen.id));
    channel
      .on("broadcast", { event: "control" }, ({ payload }) => {
        const message = payload as ControlMessage;
        switch (message.type) {
          case "play":
            if (pausedRef.current) togglePause();
            break;
          case "pause":
            if (!pausedRef.current) togglePause();
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

  // On-screen controls stay invisible until the pointer actually moves, then
  // fade out again after a few seconds of stillness — standard video-player
  // behavior, so the controls never sit permanently over the content.
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveringControlsRef = useRef(false);

  function showControls() {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (!hoveringControlsRef.current) setControlsVisible(false);
    }, 2500);
  }

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  return (
    <div className="relative h-dvh w-dvw overflow-hidden bg-black" onPointerMove={showControls}>
      {!current ? (
        <div className="flex h-full w-full items-center justify-center text-white/30">
          <p className="text-lg">No content assigned</p>
        </div>
      ) : (
        <Slide key={current.id} item={current} fitMode={screen.fit_mode} paused={paused} onVideoEnded={handleVideoEnded} />
      )}

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-8 flex justify-center transition-opacity duration-300",
          controlsVisible ? "opacity-100" : "opacity-0",
        )}
      >
        <div
          onMouseEnter={() => {
            hoveringControlsRef.current = true;
          }}
          onMouseLeave={() => {
            hoveringControlsRef.current = false;
          }}
          className="pointer-events-auto flex items-center gap-1 rounded-full bg-black/60 p-1.5 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={skipPrev}
            aria-label="Previous item"
            className="rounded-full p-3 text-white/80 hover:text-white"
          >
            <SkipBackIcon className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={togglePause}
            aria-label={paused ? "Play" : "Pause"}
            className="rounded-full p-3 text-white/80 hover:text-white"
          >
            {paused ? <PlayIcon className="h-6 w-6" /> : <PauseIcon className="h-6 w-6" />}
          </button>
          <button
            type="button"
            onClick={skipNext}
            aria-label="Next item"
            className="rounded-full p-3 text-white/80 hover:text-white"
          >
            <SkipForwardIcon className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Slide({
  item,
  fitMode,
  paused,
  onVideoEnded,
}: {
  item: PlaylistItemWithMedia;
  fitMode: FitMode;
  paused: boolean;
  onVideoEnded: () => void;
}) {
  const url = mediaPublicUrl(SUPABASE_URL, item.media_item.storage_path);
  const fitClass = fitMode === "cover" ? "object-cover" : "object-contain";

  if (item.media_item.media_type === "video") {
    return <VideoSlide url={url} fitClass={fitClass} paused={paused} onVideoEnded={onVideoEnded} />;
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
function VideoSlide({
  url,
  fitClass,
  paused,
  onVideoEnded,
}: {
  url: string;
  fitClass: string;
  paused: boolean;
  onVideoEnded: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    function sync() {
      const video = videoRef.current;
      if (!video) return;
      if (paused) video.pause();
      else video.play().catch(() => {});
    }
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [paused]);

  return (
    <video
      ref={videoRef}
      src={url}
      autoPlay
      muted
      playsInline
      onEnded={onVideoEnded}
      className={`h-full w-full ${fitClass}`}
    />
  );
}
