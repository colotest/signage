"use server";

import { mediaNames, plural, quote, recordActivity, screenName } from "@/lib/activity";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FitMode, PlaylistItemWithMedia } from "@/types/domain";

export async function assignMedia(screenId: number, mediaIds: string[]) {
  const user = await requireSession();
  if (mediaIds.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("assign_media_to_screen", {
    p_screen_id: screenId,
    p_media_ids: mediaIds,
  });
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.add",
    summary: async (admin) => `Added ${await mediaNames(admin, mediaIds)} to screen ${await screenName(admin, screenId)}`,
  });
}

export async function unassignMedia(playlistItemId: string) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: removed, error } = await admin
    .from("playlist_items")
    .delete()
    .eq("id", playlistItemId)
    .select("screen_id, media_item:media_items(name)");
  if (error) throw new Error(error.message);
  const item = removed?.[0] as unknown as { screen_id: number; media_item: { name: string } | null } | undefined;
  if (item) {
    recordActivity(user, {
      action: "screen.remove",
      summary: async (admin) =>
        `Removed ${quote(item.media_item?.name)} from screen ${await screenName(admin, item.screen_id)}`,
    });
  }
}

export async function reorderPlaylist(screenId: number, orderedPlaylistItemIds: string[]) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_playlist_items", {
    p_screen_id: screenId,
    p_ids: orderedPlaylistItemIds,
  });
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.reorder",
    target: `screen:${screenId}`,
    summary: async (admin) => `Reordered what's playing on screen ${await screenName(admin, screenId)}`,
  });
}

export async function updateItemDuration(playlistItemId: string, durationSeconds: number) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("playlist_items")
    .update({ duration_seconds: Math.max(1, Math.round(durationSeconds)) })
    .eq("id", playlistItemId)
    .select("screen_id, duration_seconds, media_item:media_items(name)");
  if (error) throw new Error(error.message);
  const item = updated?.[0] as unknown as
    | { screen_id: number; duration_seconds: number; media_item: { name: string } | null }
    | undefined;
  if (item) {
    recordActivity(user, {
      action: "screen.duration",
      target: `playlist_item:${playlistItemId}`,
      summary: async (admin) =>
        `Set ${quote(item.media_item?.name)} on screen ${await screenName(admin, item.screen_id)} to ${plural(item.duration_seconds, "second")}`,
    });
  }
}

export async function updateItemFitMode(playlistItemId: string, fitMode: FitMode) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("playlist_items")
    .update({ fit_mode: fitMode })
    .eq("id", playlistItemId)
    .select("screen_id, media_item:media_items(name)");
  if (error) throw new Error(error.message);
  const item = updated?.[0] as unknown as { screen_id: number; media_item: { name: string } | null } | undefined;
  if (item) {
    recordActivity(user, {
      action: "screen.item_fit",
      target: `playlist_item:${playlistItemId}`,
      summary: async (admin) =>
        `Set ${quote(item.media_item?.name)} on screen ${await screenName(admin, item.screen_id)} to ${fitMode === "cover" ? "fill" : "fit"} the screen`,
    });
  }
}

// What the dashboard's Playback Menu uses to fill a screen's "Now Playing"
// list — unlike assign_media_to_screen, which only ever appends at the
// default 10s, this takes a per-item duration (so a library playlist's own
// durations carry over) and can insert at the front. Hands the inserted rows
// back, media joined, so the client can swap its optimistic rows for real ones.
export async function addItemsToScreen(
  screenId: number,
  items: { mediaId: string; durationSeconds?: number }[],
  at: "start" | "end",
): Promise<PlaylistItemWithMedia[]> {
  const user = await requireSession();
  if (items.length === 0) return [];
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("playlist_items")
    .select("id, position")
    .eq("screen_id", screenId)
    .order("position", { ascending: true });
  if (existingError) throw new Error(existingError.message);

  const startPosition = at === "end" ? (existing?.at(-1)?.position ?? -1) + 1 : 0;
  const { data: inserted, error: insertError } = await admin
    .from("playlist_items")
    .insert(
      items.map((item, i) => ({
        screen_id: screenId,
        media_item_id: item.mediaId,
        position: startPosition + i,
        duration_seconds: Math.max(1, Math.round(item.durationSeconds ?? 10)),
      })),
    )
    .select("*, media_item:media_items(*)");
  if (insertError) throw new Error(insertError.message);

  const rows = ((inserted ?? []) as unknown as PlaylistItemWithMedia[]).sort((a, b) => a.position - b.position);

  // Front insertion: the new rows took positions 0..n-1, colliding with
  // what was already there — renumber everything so they genuinely lead.
  if (at === "start" && existing && existing.length > 0) {
    const { error } = await admin.rpc("reorder_playlist_items", {
      p_screen_id: screenId,
      p_ids: [...rows.map((r) => r.id), ...existing.map((r) => r.id)],
    });
    if (error) throw new Error(error.message);
  }

  recordActivity(user, {
    action: "screen.add",
    summary: async (admin) =>
      `Added ${await mediaNames(admin, items.map((i) => i.mediaId))} to screen ${await screenName(admin, screenId)}`,
  });
  return rows;
}

export async function clearScreenPlaylist(screenId: number) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("playlist_items").delete().eq("screen_id", screenId);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "screen.clear",
    summary: async (admin) => `Cleared what's playing on screen ${await screenName(admin, screenId)}`,
  });
}
