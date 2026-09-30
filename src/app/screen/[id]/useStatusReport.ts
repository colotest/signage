"use client";

import { useEffect, useRef, useState } from "react";
import type { createBrowserClient } from "@/lib/supabase/client";
import { HEARTBEAT_MS } from "@/lib/realtime/screenStatus";

type Supabase = ReturnType<typeof createBrowserClient>;

// crypto.randomUUID only exists in secure contexts on reasonably recent
// browsers; an old kiosk browser still needs a session id.
function newSessionId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}

// Tells the dashboard what this player is showing (see 0025_screen_status):
// straight away on load, on every slide or pause change, and on a heartbeat
// in between. Each report is an ordinary request that either lands or
// doesn't; a failed one is just covered by the next one, and the dashboard
// only calls a screen offline once reports have stopped for a while. That
// makes a power cut, which sends nothing at all, show up reliably too.
export function useStatusReport({
  supabase,
  screenId,
  mediaItemId,
  paused,
}: {
  supabase: Supabase;
  screenId: number;
  mediaItemId: string | null;
  paused: boolean;
}) {
  const [sessionId] = useState(newSessionId);

  // Read by the heartbeat and wake-up handlers, which are set up once.
  const latestRef = useRef({ mediaItemId, paused });
  useEffect(() => {
    latestRef.current = { mediaItemId, paused };
  });

  const reportRef = useRef(() => {});
  useEffect(() => {
    reportRef.current = () => {
      const { mediaItemId, paused } = latestRef.current;
      supabase
        .rpc("report_screen_status", {
          p_screen_id: screenId,
          p_session_id: sessionId,
          p_media_item_id: mediaItemId,
          p_paused: paused,
        })
        .then(({ error }) => {
          if (error) console.warn("Status report failed", error.message);
        });
    };
  }, [supabase, screenId, sessionId]);

  // A change on screen is reported the moment it happens.
  useEffect(() => {
    reportRef.current();
  }, [mediaItemId, paused]);

  useEffect(() => {
    const report = () => reportRef.current();
    const id = setInterval(report, HEARTBEAT_MS);

    // Back from sleep, a hidden window or a network drop: say so now rather
    // than at the next heartbeat.
    function onVisible() {
      if (document.visibilityState === "visible") report();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", report);

    // Best effort on a clean close (reload, tab closed), so the dashboard
    // doesn't wait out the timeout. A keepalive fetch outlives the page; the
    // supabase client can't make one, hence the raw request.
    function onPageHide() {
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/report_screen_offline`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", apikey: key, Authorization: `Bearer ${key}` },
        body: JSON.stringify({ p_screen_id: screenId, p_session_id: sessionId }),
      }).catch(() => {});
    }
    window.addEventListener("pagehide", onPageHide);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", report);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [screenId, sessionId]);
}
