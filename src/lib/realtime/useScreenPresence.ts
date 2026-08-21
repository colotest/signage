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
      // Picking "last in the array" broke down as soon as a screen ever had
      // more than one simultaneous presence entry — e.g. a stale connection
      // that hasn't timed out yet alongside the real one, which does happen
      // in practice. Array order has no relationship to which is actually
      // current, but each entry's own startedAt does: the player re-tracks
      // itself (bumping startedAt) on every real state change and on a
      // heartbeat, so a genuinely live connection's timestamp stays fresh
      // while a stale one's stays stuck wherever it last was.
      const latest = presences.reduce<PresencePayload | null>((best, p) => {
        if (!best) return p;
        const bestStarted = "startedAt" in best ? best.startedAt : 0;
        const pStarted = "startedAt" in p ? p.startedAt : 0;
        return pStarted >= bestStarted ? p : best;
      }, null);
      setNowPlaying(latest && latest.mediaItemId ? (latest as PlayingPresence) : null);
    }

    // Without an explicit re-sync on (re)join, a blip on this dashboard
    // tab's own connection (not the player's) could otherwise leave
    // "online" stuck on whatever it last was until some unrelated presence
    // change happens to push a fresh sync.
    channel
      .on("presence", { event: "sync" }, sync)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") sync();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [screenId]);

  return { online, nowPlaying };
}
