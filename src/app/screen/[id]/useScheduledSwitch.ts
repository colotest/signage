"use client";

import { useEffect, useRef, useState } from "react";
import type { createBrowserClient } from "@/lib/supabase/client";
import type { PlaylistEntryWithMedia } from "@/types/domain";

type Supabase = ReturnType<typeof createBrowserClient>;

export type PendingTimer = {
  id: string;
  runAt: number;
  entries: PlaylistEntryWithMedia[];
};

// How far ahead of a timer the player starts pulling its media in.
const PRELOAD_MS = 60_000;
// A timer this far past due when the player first sees it (say the TV was
// off, or the cron job's been down) is left to the database rather than
// fired locally — the player shouldn't override Now Playing on its own
// long after the fact.
const STALE_MS = 60_000;
// Long waits are re-checked in steps rather than trusted to one setTimeout,
// which drifts (or pauses outright) across device sleep.
const MAX_WAIT_MS = 30_000;
const CLOCK_RESYNC_MS = 15 * 60_000;

// How far the device clock is behind the database's (server − device, in
// ms). Timers are fired against the server's clock, and a TV's own clock
// can easily be off by seconds or more — enough to defeat switching "on
// the dot". Best of three round trips (smallest RTT, so the midpoint guess
// is tightest), re-measured every so often. Stays 0 if server_now() isn't
// there yet (migration 0012 not run) or the network's down.
function useServerClockOffset(supabase: Supabase) {
  const offsetRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    async function sync() {
      let best: { rtt: number; offset: number } | null = null;
      for (let i = 0; i < 3; i++) {
        const sentAt = Date.now();
        const { data, error } = await supabase.rpc("server_now");
        const receivedAt = Date.now();
        if (error || !data) return;
        const rtt = receivedAt - sentAt;
        const offset = new Date(data).getTime() - (sentAt + receivedAt) / 2;
        if (!best || rtt < best.rtt) best = { rtt, offset };
      }
      if (!cancelled && best) offsetRef.current = best.offset;
    }
    sync();
    const id = setInterval(sync, CLOCK_RESYNC_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [supabase]);

  return offsetRef;
}

async function fetchTimers(supabase: Supabase, screenId: number): Promise<PendingTimer[] | null> {
  const { data: rows, error } = await supabase
    .from("scheduled_playbacks")
    .select("id, playlist_id, run_at")
    .eq("screen_id", screenId)
    .order("run_at", { ascending: true });
  if (error) return null;
  if (!rows || rows.length === 0) return [];

  const playlistIds = [...new Set(rows.map((r) => r.playlist_id))];
  const { data: entries, error: entriesError } = await supabase
    .from("playlist_entries")
    .select("*, media_item:media_items(*)")
    .in("playlist_id", playlistIds)
    .order("position", { ascending: true });
  if (entriesError) return null;

  const byPlaylist = new Map<string, PlaylistEntryWithMedia[]>();
  for (const entry of (entries ?? []) as unknown as PlaylistEntryWithMedia[]) {
    const list = byPlaylist.get(entry.playlist_id);
    if (list) list.push(entry);
    else byPlaylist.set(entry.playlist_id, [entry]);
  }

  return rows.map((r) => ({
    id: r.id,
    runAt: new Date(r.run_at).getTime(),
    entries: byPlaylist.get(r.playlist_id) ?? [],
  }));
}

// Watches this screen's pending timers (see 0011/0012) and, for each one:
// calls onPreload from a minute ahead — repeatedly, whenever the timer's
// entries are refreshed, so the caller should dedupe — and calls onFire
// exactly once at its time, measured on the server's clock. The database
// makes the same swap a few seconds later (cron) or on the dot (an open
// dashboard); the caller is expected to treat that arriving copy as a
// no-op when it matches what's already playing. Returns the server clock
// offset (see useServerClockOffset).
export function useScheduledSwitch({
  supabase,
  screenId,
  onPreload,
  onFire,
}: {
  supabase: Supabase;
  screenId: number;
  onPreload: (timer: PendingTimer) => void;
  onFire: (timer: PendingTimer) => void;
}) {
  const offsetRef = useServerClockOffset(supabase);
  const [timers, setTimers] = useState<PendingTimer[]>([]);
  const refreshRef = useRef<() => void>(() => {});
  // Keyed on id + time, so moving a timer that already fired to a new time
  // makes it eligible again.
  const firedRef = useRef(new Set<string>());
  const refreshedForPreloadRef = useRef(new Set<string>());

  // Always the latest callbacks, without re-arming the timer loop whenever
  // the caller re-renders.
  const onPreloadRef = useRef(onPreload);
  const onFireRef = useRef(onFire);
  useEffect(() => {
    onPreloadRef.current = onPreload;
    onFireRef.current = onFire;
  });

  useEffect(() => {
    let seq = 0;
    async function refresh() {
      const mine = ++seq;
      const next = await fetchTimers(supabase, screenId);
      // Out-of-order responses and failed fetches both keep what we had.
      if (mine === seq && next) setTimers(next);
    }
    refreshRef.current = refresh;

    const channel = supabase
      .channel(`schedule-changes:${screenId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "scheduled_playbacks", filter: `screen_id=eq.${screenId}` },
        refresh,
      )
      .subscribe((status) => {
        // Reconnects don't replay missed events — resync on every (re)join.
        if (status === "SUBSCRIBED") refresh();
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, screenId]);

  useEffect(() => {
    if (timers.length === 0) return;
    let handle: ReturnType<typeof setTimeout> | undefined;

    function check() {
      const now = Date.now() + offsetRef.current;
      let nextWake = Infinity;

      for (const timer of timers) {
        const key = `${timer.id}:${timer.runAt}`;
        if (firedRef.current.has(key)) continue;

        if (now >= timer.runAt) {
          firedRef.current.add(key);
          if (now - timer.runAt < STALE_MS) onFireRef.current(timer);
          continue;
        }

        if (now >= timer.runAt - PRELOAD_MS) {
          onPreloadRef.current(timer);
          // Pull the playlist's entries fresh once as the window opens, in
          // case it was edited since the timer was set — the refreshed
          // timers come back through here and get preloaded in turn.
          if (!refreshedForPreloadRef.current.has(key)) {
            refreshedForPreloadRef.current.add(key);
            refreshRef.current();
          }
          nextWake = Math.min(nextWake, timer.runAt);
        } else {
          nextWake = Math.min(nextWake, timer.runAt - PRELOAD_MS);
        }
      }

      if (nextWake !== Infinity) {
        handle = setTimeout(check, Math.min(Math.max(0, nextWake - now), MAX_WAIT_MS));
      }
    }

    check();
    return () => clearTimeout(handle);
  }, [timers, offsetRef]);
  // Handed back so the player's clock page can show server time too.
  return offsetRef;
}
