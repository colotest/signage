"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { playlistChannelName, presenceChannelName } from "@/lib/realtime/channels";
import { mediaPublicUrl } from "@/types/domain";
import type { PlaylistItemWithMedia, Screen } from "@/types/domain";
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

  function advanceNow() {
    const items = playlistRef.current;
    const next = items.length > 0 ? (indexRef.current + 1) % items.length : 0;
    indexRef.current = next;
    setCurrentIndex(next);
  }

  function scheduleTick() {
    if (timerRef.current) clearTimeout(timerRef.current);
    const items = playlistRef.current;
    if (items.length === 0) return;
    const item = items[indexRef.current % items.length];
    if (!item || item.media_item.media_type === "video") return; // videos advance via onEnded instead
    timerRef.current = setTimeout(() => {
      advanceNow();
      scheduleTick(); // re-arm for the new current item, regardless of whether the index visibly changed
    }, item.duration_seconds * 1000);
  }

  function handleVideoEnded() {
    advanceNow();
    scheduleTick(); // in case the next item is an image/PDF that needs a timer
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
  // online/offline status without polling the database.
  useEffect(() => {
    const presence = supabase.channel(presenceChannelName(screen.id));
    presence.subscribe((status) => {
      if (status !== "SUBSCRIBED") return;
      if (current) {
        presence.track({
          mediaItemId: current.media_item.id,
          name: current.media_item.name,
          mediaType: current.media_item.media_type,
          storagePath: current.media_item.storage_path,
          startedAt: Date.now(),
        });
      } else {
        // Nothing assigned (or just unassigned) — clear any previously
        // tracked payload so the dashboard doesn't keep showing stale content.
        presence.untrack();
      }
    });
    return () => {
      supabase.removeChannel(presence);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id, current?.id]);

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
      {!current ? (
        <div className="flex h-full w-full items-center justify-center text-white/30">
          <p className="text-lg">No content assigned</p>
        </div>
      ) : (
        <Slide key={current.id} item={current} onVideoEnded={handleVideoEnded} />
      )}
    </div>
  );
}

function Slide({
  item,
  onVideoEnded,
}: {
  item: PlaylistItemWithMedia;
  onVideoEnded: () => void;
}) {
  const url = mediaPublicUrl(SUPABASE_URL, item.media_item.storage_path);
  const fitClass = item.fit_mode === "cover" ? "object-cover" : "object-contain";

  if (item.media_item.media_type === "video") {
    return (
      <video
        key={url}
        src={url}
        autoPlay
        muted
        playsInline
        onEnded={onVideoEnded}
        className={`h-full w-full ${fitClass}`}
      />
    );
  }

  if (item.media_item.media_type === "pdf") {
    return <PdfSlide url={url} fit={item.fit_mode} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={item.media_item.name} className={`h-full w-full ${fitClass}`} />;
}
