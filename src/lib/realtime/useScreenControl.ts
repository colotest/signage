"use client";

import { useCallback, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { controlChannelName, type ControlMessage } from "@/lib/realtime/channels";

type Channel = ReturnType<ReturnType<typeof createBrowserClient>["channel"]>;

// One control channel per screen for the whole page, shared by everything
// that sends to it: the screen's own tile and the tile of every group it's
// in. The Supabase client hands back the same channel object for the same
// topic, so letting each tile subscribe and remove its own would have the
// first one to unmount cut the others off — hence the reference count.
const channels = new Map<number, { channel: Channel; users: number }>();

function acquire(screenId: number) {
  const existing = channels.get(screenId);
  if (existing) {
    existing.users += 1;
    return;
  }
  const channel = createBrowserClient().channel(controlChannelName(screenId));
  channel.subscribe();
  channels.set(screenId, { channel, users: 1 });
}

function release(screenId: number) {
  const entry = channels.get(screenId);
  if (!entry) return;
  entry.users -= 1;
  if (entry.users > 0) return;
  channels.delete(screenId);
  createBrowserClient().removeChannel(entry.channel);
}

function sendTo(screenId: number, message: ControlMessage) {
  channels.get(screenId)?.channel.send({ type: "broadcast", event: "control", payload: message });
}

// Sends one-off playback commands to a screen's live player over a
// broadcast-only channel — there's nothing to persist here; what the
// player does with them comes back through its status reports.
export function useScreenControl(screenId: number) {
  useEffect(() => {
    acquire(screenId);
    return () => release(screenId);
  }, [screenId]);

  const send = useCallback((message: ControlMessage) => sendTo(screenId, message), [screenId]);
  return { send };
}

// The same, to every screen in a group at once.
export function useScreensControl(screenIds: number[]) {
  const key = screenIds.join(",");

  useEffect(() => {
    const ids = key ? key.split(",").map(Number) : [];
    ids.forEach(acquire);
    return () => ids.forEach(release);
  }, [key]);

  const send = useCallback(
    (message: ControlMessage) => {
      for (const id of key ? key.split(",").map(Number) : []) sendTo(id, message);
    },
    [key],
  );
  return { send };
}
