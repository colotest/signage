"use server";

import { playlistName, quote, recordActivity, screenName } from "@/lib/activity";
import { assertScreenVisible, requirePage, requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

// The longest window a timer can reserve — generous (a fortnight), just a
// guard against a typo reserving a screen for years.
const MAX_MINUTES = 14 * 24 * 60;

function timeLabel(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function lengthLabel(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}

// Timed playback (see 0011, 0022 and 0047): the playlist replaces Now
// Playing at runAt, and the screen stays reserved for `minutes` — no other
// timer can be set on it for any part of that window. A playlist can be
// timed onto the same screen any number of times; passing timerId moves
// that one timer instead of adding another.
//
// An overlap comes back as a message naming the schedule in the way rather
// than as a thrown error, so the popup can show it and stay open. The
// database's own exclusion constraint is the real guarantee (two people
// scheduling at once); the lookup below is just what makes the message
// useful.
export async function schedulePlaylist(
  screenId: number,
  playlistId: string,
  runAtIso: string,
  minutes: number,
  timerId?: string,
): Promise<{ error: string } | { ok: true }> {
  const user = await requirePage("screens");
  assertScreenVisible(user, screenId);
  const runAt = new Date(runAtIso);
  if (Number.isNaN(runAt.getTime())) return { error: "That isn't a valid date." };
  if (runAt.getTime() <= Date.now()) return { error: "Pick a time in the future." };
  if (!Number.isInteger(minutes) || minutes < 1) return { error: "Play it for at least 1 minute." };
  if (minutes > MAX_MINUTES) return { error: `Play it for at most ${MAX_MINUTES / 60} hours.` };
  const endsAt = new Date(runAt.getTime() + minutes * 60_000);

  const admin = createAdminClient();

  let clashQuery = admin
    .from("scheduled_playbacks")
    .select("run_at, ends_at, playlist:playlists(name)")
    .eq("screen_id", screenId)
    .lt("run_at", endsAt.toISOString())
    .gt("ends_at", runAt.toISOString());
  if (timerId) clashQuery = clashQuery.neq("id", timerId);
  const { data: clashes, error: clashError } = await clashQuery.order("run_at", { ascending: true }).limit(1);
  if (clashError) throw new Error(clashError.message);
  const clash = clashes?.[0] as unknown as { run_at: string; ends_at: string; playlist: { name: string } | null } | undefined;
  if (clash) {
    return {
      error: `Overlaps “${clash.playlist?.name ?? "another playlist"}” (${timeLabel(clash.run_at)} – ${timeLabel(clash.ends_at)}). Cancel that one first.`,
    };
  }

  const window = { run_at: runAt.toISOString(), ends_at: endsAt.toISOString(), fired_at: null };
  const { error } = timerId
    ? await admin
        .from("scheduled_playbacks")
        .update({ ...window, playlist_id: playlistId })
        .eq("id", timerId)
        .eq("screen_id", screenId)
    : await admin.from("scheduled_playbacks").insert({ ...window, screen_id: screenId, playlist_id: playlistId });
  if (error) {
    // 23P01: someone else booked an overlapping window in the meantime.
    if (error.code === "23P01") return { error: "Overlaps another schedule on this screen. Cancel that one first." };
    throw new Error(error.message);
  }
  recordActivity(user, {
    action: "schedule.set",
    summary: async (admin) =>
      `Scheduled playlist ${await playlistName(admin, playlistId)} on screen ${await screenName(admin, screenId)} for ${timeLabel(runAt.toISOString())}, ${lengthLabel(minutes)}`,
  });
  return { ok: true };
}

// Frees the screen's window — whether the timer is still pending or already
// playing. Cancelling one that's playing doesn't change what's on screen;
// it just lets another playlist be scheduled into that time.
export async function cancelScheduledPlayback(screenId: number, timerId: string) {
  const user = await requirePage("screens");
  assertScreenVisible(user, screenId);
  const admin = createAdminClient();
  const { data: removed, error } = await admin
    .from("scheduled_playbacks")
    .delete()
    .eq("screen_id", screenId)
    .eq("id", timerId)
    .select("playlist_id");
  if (error) throw new Error(error.message);
  const playlistId = removed?.[0]?.playlist_id as string | undefined;
  recordActivity(user, {
    action: "schedule.cancel",
    summary: async (admin) =>
      `Cancelled a schedule for playlist ${playlistId ? await playlistName(admin, playlistId) : quote(undefined)} on screen ${await screenName(admin, screenId)}`,
  });
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
