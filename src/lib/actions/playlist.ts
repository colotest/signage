"use server";

import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { FitMode } from "@/types/domain";

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
