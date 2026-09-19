"use server";

import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FitMode, PlaylistItemWithMedia } from "@/types/domain";

export async function assignMedia(screenId: number, mediaIds: string[]) {
  await requireSession();
  if (mediaIds.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("assign_media_to_screen", {
    p_screen_id: screenId,
    p_media_ids: mediaIds,
  });
  if (error) throw new Error(error.message);
}

export async function unassignMedia(playlistItemId: string) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("playlist_items").delete().eq("id", playlistItemId);
  if (error) throw new Error(error.message);
}

export async function reorderPlaylist(screenId: number, orderedPlaylistItemIds: string[]) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_playlist_items", {
    p_screen_id: screenId,
    p_ids: orderedPlaylistItemIds,
  });
  if (error) throw new Error(error.message);
}

export async function updateItemDuration(playlistItemId: string, durationSeconds: number) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin
    .from("playlist_items")
    .update({ duration_seconds: Math.max(1, Math.round(durationSeconds)) })
    .eq("id", playlistItemId);
  if (error) throw new Error(error.message);
}

export async function updateItemFitMode(playlistItemId: string, fitMode: FitMode) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("playlist_items").update({ fit_mode: fitMode }).eq("id", playlistItemId);
  if (error) throw new Error(error.message);
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
  await requireSession();
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

  return rows;
}

export async function clearScreenPlaylist(screenId: number) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("playlist_items").delete().eq("screen_id", screenId);
  if (error) throw new Error(error.message);
}
