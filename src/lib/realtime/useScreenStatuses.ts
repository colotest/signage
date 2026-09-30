"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { OFFLINE_AFTER_MS } from "@/lib/realtime/screenStatus";
import type { Database } from "@/types/database.types";

export type ScreenStatusRow = Database["public"]["Views"]["screen_status_live"]["Row"];
type TableRow = Database["public"]["Tables"]["screen_status"]["Row"];

// What a tile shows: whether the screen's player is running, and if so what
// it's on. A screen that has never reported in reads as offline.
export type ScreenLiveStatus = {
  online: boolean;
  mediaItemId: string | null;
  paused: boolean;
  // Where in the current video the player was as of seenAt; null if it
  // isn't on a video (or runs a build from before 0026).
  positionMs: number | null;
  // Local-clock ms of the last report, for "last seen …" and for playing
  // the preview on from positionMs; null if never.
  seenAt: number | null;
};

type Entry = {
  mediaItemId: string | null;
  paused: boolean;
  positionMs: number | null;
  disconnected: boolean;
  seenAt: number;
};

// The safety net under the realtime events: a missed event, or a dashboard
// socket that's quietly died, costs at most this long.
const POLL_MS = 15_000;
// How often "has this gone quiet for too long" is re-evaluated.
const TICK_MS = 5_000;

function fromRows(rows: ScreenStatusRow[], receivedAt: number) {
  const map = new Map<number, Entry>();
  for (const row of rows) {
    map.set(row.screen_id, {
      mediaItemId: row.media_item_id,
      paused: row.paused,
      // undefined until 0026 has been run.
      positionMs: row.position_ms ?? null,
      disconnected: row.disconnected,
      seenAt: receivedAt - row.age_ms,
    });
  }
  return map;
}

// Live status of every screen, from what each player reports about itself
// (see 0025_screen_status.sql and the player's useStatusReport). Offline is
// never an event that has to arrive: it's reports stopping, judged here
// against a ticking clock — so a TV that just loses power still shows up.
//
// Every age is measured on the database's clock (age_ms) and converted
// into this browser's clock on arrival, so a wrong clock on either the TV
// or this machine can't make a screen look stale or fresh.
//
// `initial` is the server render's snapshot, so the first paint is already
// right; null means the table isn't there (0025 not run yet), and the
// dashboard falls back to showing what's assigned, as it did before.
export function useScreenStatuses(initial: ScreenStatusRow[] | null) {
  const [available, setAvailable] = useState(initial !== null);
  const [entries, setEntries] = useState(() => fromRows(initial ?? [], Date.now()));
  const [now, setNow] = useState(() => Date.now());
  // When this dashboard last actually heard from the database. Ages are only
  // judged up to a little past this, so if this machine goes offline (or
  // to sleep) its screens freeze at what was last known instead of all
  // flipping to Offline.
  const [syncedAt, setSyncedAt] = useState(() => Date.now());
  // Per screen, when a realtime event last updated it — a poll that was
  // already in flight by then carries older data and mustn't overwrite it.
  const eventAtRef = useRef(new Map<number, number>());

  useEffect(() => {
    if (!available) return;
    const supabase = createBrowserClient();
    let cancelled = false;

    async function poll() {
      const startedAt = Date.now();
      const { data, error } = await supabase.from("screen_status_live").select("*");
      if (cancelled) return;
      if (error) {
        if (error.code === "PGRST205" || error.code === "42P01") setAvailable(false);
        return;
      }
      const receivedAt = Date.now();
      const fresh = fromRows(data, receivedAt);
      setEntries((prev) => {
        const next = new Map<number, Entry>();
        for (const [id, entry] of fresh) {
          const newer = (eventAtRef.current.get(id) ?? 0) > startedAt && prev.get(id);
          next.set(id, newer || entry);
        }
        return next;
      });
      setSyncedAt(receivedAt);
      setNow(receivedAt);
    }

    const channel = supabase
      .channel("screen-status")
      .on("postgres_changes", { event: "*", schema: "public", table: "screen_status" }, (payload) => {
        const receivedAt = Date.now();
        if (payload.eventType === "DELETE") {
          const id = (payload.old as Partial<TableRow>).screen_id;
          if (id === undefined) return;
          eventAtRef.current.set(id, receivedAt);
          setEntries((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
          return;
        }
        const row = payload.new as TableRow;
        const old = payload.old as Partial<TableRow> | undefined;
        eventAtRef.current.set(row.screen_id, receivedAt);
        setEntries((prev) => {
          const next = new Map(prev);
          // A clean close only sets disconnected_at; last_seen_at moving is
          // what marks an actual report, which just happened.
          const reported = old?.last_seen_at !== row.last_seen_at;
          next.set(row.screen_id, {
            mediaItemId: row.media_item_id,
            paused: row.paused,
            positionMs: row.position_ms ?? null,
            disconnected: row.disconnected_at !== null,
            seenAt: reported ? receivedAt : (prev.get(row.screen_id)?.seenAt ?? receivedAt),
          });
          return next;
        });
        setSyncedAt(receivedAt);
        setNow(receivedAt);
      })
      .subscribe((status) => {
        // Reconnects don't replay missed events — resync on every (re)join.
        if (status === "SUBSCRIBED") poll();
      });

    const pollId = setInterval(poll, POLL_MS);
    const tickId = setInterval(() => setNow(Date.now()), TICK_MS);
    function onVisible() {
      if (document.visibilityState === "visible") poll();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(pollId);
      clearInterval(tickId);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [available]);

  const judgedAt = Math.min(now, syncedAt + POLL_MS + TICK_MS);

  function statusOf(screenId: number): ScreenLiveStatus | null {
    if (!available) return null;
    const entry = entries.get(screenId);
    if (!entry) return { online: false, mediaItemId: null, paused: false, positionMs: null, seenAt: null };
    const online = !entry.disconnected && judgedAt - entry.seenAt < OFFLINE_AFTER_MS;
    return {
      online,
      mediaItemId: entry.mediaItemId,
      paused: entry.paused,
      positionMs: entry.positionMs,
      seenAt: entry.seenAt,
    };
  }

  return statusOf;
}
