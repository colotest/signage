"use server";

import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

// One-off timed playback (see 0011_scheduled_playbacks.sql). Setting a time
// for a playlist that already has one on this screen replaces it.
export async function schedulePlaylist(screenId: number, playlistId: string, runAtIso: string) {
  await requireSession();
  const runAt = new Date(runAtIso);
  if (Number.isNaN(runAt.getTime())) throw new Error("Invalid date");
  if (runAt.getTime() <= Date.now()) throw new Error("Pick a time in the future");
  const admin = createAdminClient();
  const { error } = await admin
    .from("scheduled_playbacks")
    .upsert(
      { screen_id: screenId, playlist_id: playlistId, run_at: runAt.toISOString() },
      { onConflict: "screen_id,playlist_id" },
    );
  if (error) throw new Error(error.message);
}

export async function cancelScheduledPlayback(screenId: number, playlistId: string) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin
    .from("scheduled_playbacks")
    .delete()
    .eq("screen_id", screenId)
    .eq("playlist_id", playlistId);
  if (error) throw new Error(error.message);
}

// The pg_cron job already does this every few seconds; an open dashboard
// also calls it the moment a countdown reaches zero, so the switch lands on
// the dot rather than up to one cron tick late.
export async function runDueScheduledPlaybacks() {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("run_due_scheduled_playbacks");
  if (error) throw new Error(error.message);
}
