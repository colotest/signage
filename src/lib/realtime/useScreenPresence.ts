"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { presenceChannelName, type PresencePayload } from "@/lib/realtime/channels";

// The variant of PresencePayload that actually has media info — narrowed
// out so consumers don't have to re-check for the "connected but idle" case.
type PlayingPresence = Extract<PresencePayload, { mediaItemId: string }>;

// Listen-only counterpart to the `track()` call in Player.tsx — lets a
// dashboard tile show "now playing" and online/offline without polling.
export function useScreenPresence(screenId: number) {
  const [nowPlaying, setNowPlaying] = useState<PlayingPresence | null>(null);
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase.channel(presenceChannelName(screenId));

    function sync() {
      const state = channel.presenceState<PresencePayload>();
      const presences = Object.values(state).flat();
      setOnline(presences.length > 0);
      const latest = presences[presences.length - 1];
      setNowPlaying(latest && latest.mediaItemId ? (latest as PlayingPresence) : null);
    }

    channel.on("presence", { event: "sync" }, sync).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [screenId]);

  return { online, nowPlaying };
}
