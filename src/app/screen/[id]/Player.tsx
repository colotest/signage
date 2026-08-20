"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { controlChannelName, playlistChannelName, presenceChannelName } from "@/lib/realtime/channels";
import type { ControlMessage } from "@/lib/realtime/channels";
import { mediaPublicUrl } from "@/types/domain";
import type { FitMode, PlaylistItemWithMedia, Screen } from "@/types/domain";
import { loadFromCache, saveToCache } from "@/lib/cache/playerCache";

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

  // Forces the current slide to fully remount (fresh <video>/<img> element,
  // fresh fetch) — bumped in two situations: (1) connectivity returns after
  // a drop, since a video/image/PDF that was mid-fetch when the network
  // died just stays stuck there rather than resuming on its own; (2) every
  // advance/retreat, which matters specifically for a single-item playlist
  // — looping back to the *same* index leaves current.id unchanged, so the
  // key wouldn't otherwise change and a finished video would just sit on
  // its last frame instead of restarting.
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
    setReloadToken((t) => t + 1);
  }

  function retreatNow() {
    const items = playlistRef.current;
    const next = items.length > 0 ? (indexRef.current - 1 + items.length) % items.length : 0;
    indexRef.current = next;
    setCurrentIndex(next);
    setReloadToken((t) => t + 1);
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

  // Broadcasts "now playing" so the dashboard can show a live preview and
  // online/offline status without polling the database. Always tracks once
  // connected, even with nothing assigned — "online" means a player is
  // connected, which is a distinct fact from whether it has content.
  //
  // The channel itself is subscribed once per screen and left alone after
  // that — re-tracking (rather than tearing down and resubscribing) on
  // every current-item or paused change avoids a brief window with two
  // overlapping presences where the dashboard's "latest wins" read could
  // pick the stale one.
  const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const presenceSubscribedRef = useRef(false);

  // Reads the current item and paused flag through refs rather than the
  // `current`/`paused` closures — this function is called both from a
  // [current?.id, paused] effect (where the closure is always fresh) and
  // from a heartbeat interval set up once at mount in a [screen.id]-only
  // effect (where it wouldn't be — a closure captured there would forever
  // report whatever "paused" was true at mount, silently reverting a live
  // pause back to "playing" on the next tick).
  function trackPresence() {
    const presence = presenceRef.current;
    if (!presence || !presenceSubscribedRef.current) return;
    const items = playlistRef.current;
    const item = items.length > 0 ? items[indexRef.current % items.length] : null;
    if (item) {
      presence.track({
        mediaItemId: item.media_item.id,
        name: item.media_item.name,
        mediaType: item.media_item.media_type,
        storagePath: item.media_item.storage_path,
        startedAt: Date.now(),
        paused: pausedRef.current,
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

    // A silent socket blip (sleep/wake, a flaky network, an idle timeout
    // overnight) can drop presence membership without the channel itself
    // ever reporting closed/errored — unlike postgres_changes, which just
    // resumes delivering new events on reconnect, presence needs an
    // explicit re-track since a rejoin doesn't restore what was tracked
    // before. Re-sending on a heartbeat bounds how long "Online" (and
    // "paused") can stay wrong to one interval, without requiring anyone
    // to reload the tab.
    const heartbeat = setInterval(trackPresence, 25_000);

    return () => {
      clearInterval(heartbeat);
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
  // broadcasts rather than persisted state — the player applies them
  // immediately and the presence effect above reports the result back.
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
      {/* A screen marked portrait is physically mounted rotated 90deg
          counterclockwise, so its native (still landscape) frame buffer
          needs content rotated 90deg clockwise to cancel that out and land
          upright for the viewer — that's the whole point: media never has
          to be pre-rotated for a portrait deployment. The box is laid out
          at the viewport's *swapped* dimensions (its width is the
          viewport's height and vice versa) before the rotation, so that
          once rotated it exactly fills the landscape viewport with no
          gaps — see the geometry note on ScreenTile's shadow rotation for
          the same underlying trick applied the other direction. */}
      <div
        className="absolute"
        style={
          screen.landscape !== false
            ? { inset: 0 }
            : {
                top: "50%",
                left: "50%",
                width: "100vh",
                height: "100vw",
                transform: "translate(-50%, -50%) rotate(90deg)",
              }
        }
      >
        {!current ? (
          <div className="flex h-full w-full items-center justify-center text-white/30">
            <p className="text-lg">No content assigned</p>
          </div>
        ) : (
          <Slide
            key={`${current.id}-${reloadToken}`}
            item={current}
            fitMode={screen.fit_mode}
            paused={paused}
            onVideoEnded={handleVideoEnded}
          />
        )}
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
