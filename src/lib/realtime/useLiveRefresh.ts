"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/client";

// Everything the dashboard and library pages render, so any edit by anyone
// — reordering, renaming, durations, fit modes, uploads, deletions, timers
// — reaches every other open dashboard. Both pages are server-rendered, so
// "apply the change" is just router.refresh(): the server components re-run
// and the new props flow down. Each page's local optimistic state already
// resyncs from those props, which is what made this a small change.
const LIVE_TABLES = [
  "screens",
  "playlist_items",
  "folders",
  "media_items",
  "decks",
  "playlists",
  "playlist_entries",
  "scheduled_playbacks",
] as const;

// A burst of changes (a multi-file upload, a reorder writing every row)
// should cost one refresh, not one per row.
const DEBOUNCE_MS = 400;

// Refetches the current page whenever anyone else touches the data it's
// built from. Own edits already refresh directly — an extra refresh landing
// on top of that is harmless, since it produces the same server render.
//
// Needs each table in the supabase_realtime publication (see 0016, and
// 0020 for decks).
// Without that, nothing arrives and pages behave as they did before: fresh
// on load, updated by your own edits.
export function useLiveRefresh(channelName: string) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient();
    let timer: ReturnType<typeof setTimeout> | undefined;

    function scheduleRefresh() {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), DEBOUNCE_MS);
    }

    let channel = supabase.channel(channelName);
    for (const table of LIVE_TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, scheduleRefresh);
    }
    channel.subscribe((status) => {
      // A dropped websocket doesn't replay what it missed, so reconcile
      // once on every (re)connect — that also covers a laptop that was
      // asleep while someone else was editing.
      if (status === "SUBSCRIBED") scheduleRefresh();
    });

    return () => {
      clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [channelName, router]);
}
