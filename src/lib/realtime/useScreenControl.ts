"use client";

import { useCallback, useEffect } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { controlChannelName, type ControlMessage, type PerfReport } from "@/lib/realtime/channels";

type Channel = ReturnType<ReturnType<typeof createBrowserClient>["channel"]>;

// One control channel per screen for the whole page, shared by everything
// that sends to it: the screen's own tile and the tile of every group it's
// in. The Supabase client hands back the same channel object for the same
// topic, so letting each tile subscribe and remove its own would have the
// first one to unmount cut the others off — hence the reference count.
//
// The players' frame-rate reports come back over the same channel, and go
// to whoever is listening for that screen (see onPerfReport).
const channels = new Map<number, { channel: Channel; users: number; listeners: Set<(report: PerfReport) => void> }>();

function acquire(screenId: number) {
  const existing = channels.get(screenId);
  if (existing) {
    existing.users += 1;
    return;
  }
  const channel = createBrowserClient().channel(controlChannelName(screenId));
  const listeners = new Set<(report: PerfReport) => void>();
  channel.on("broadcast", { event: "perf" }, ({ payload }) => listeners.forEach((listen) => listen(payload as PerfReport)));
  channel.subscribe();
  channels.set(screenId, { channel, users: 1, listeners });
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

// Hears a screen's frame-rate reports while it's measuring (see "measure"),
// for as long as the returned function isn't called. Only while that
// screen's channel is held by a useScreenControl.
export function onPerfReport(screenId: number, listen: (report: PerfReport) => void) {
  const entry = channels.get(screenId);
  entry?.listeners.add(listen);
  return () => {
    entry?.listeners.delete(listen);
  };
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
