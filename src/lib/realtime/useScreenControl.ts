"use client";

import { useEffect, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { controlChannelName, type ControlMessage } from "@/lib/realtime/channels";

// Sends one-off playback commands to a screen's live player over a
// broadcast-only channel — there's nothing to persist here, and nothing
// reports back; the dashboard's paused state is a local, optimistic guess.
export function useScreenControl(screenId: number) {
  const channelRef = useRef<ReturnType<ReturnType<typeof createBrowserClient>["channel"]> | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase.channel(controlChannelName(screenId));
    channel.subscribe();
    channelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [screenId]);

  function send(message: ControlMessage) {
    channelRef.current?.send({ type: "broadcast", event: "control", payload: message });
  }

  return { send };
}
