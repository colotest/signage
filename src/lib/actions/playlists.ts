"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Reusable, named playlists — independent of any screen. Kept in their own
// file (plural "playlists.ts") deliberately separate from the existing
// singular "playlist.ts", which governs screens' playlist_items and is
// untouched by any of this.

export async function createPlaylist() {
  await requireSession();
  const admin = createAdminClient();
  const { data: last } = await admin
    .from("playlists")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (last?.position ?? -1) + 1;
  const { data, error } = await admin
    .from("playlists")
    .insert({ name: "New Playlist", position: nextPosition })
    .select()
    .single();
  if (error) throw new Error(error.message);
  revalidatePath("/library");
  return data;
}

export async function renamePlaylist(id: string, name: string) {
  await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const { error } = await admin.from("playlists").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

export async function deletePlaylist(id: string) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("playlists").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

export async function reorderPlaylists(orderedIds: string[]) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_playlists", { p_ids: orderedIds });
  if (error) throw new Error(error.message);
}

export async function addMediaToPlaylist(playlistId: string, mediaIds: string[]) {
  await requireSession();
  if (mediaIds.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("add_media_to_playlist", {
    p_playlist_id: playlistId,
    p_media_ids: mediaIds,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

export async function removePlaylistEntry(entryId: string) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.from("playlist_entries").delete().eq("id", entryId);
  if (error) throw new Error(error.message);
  revalidatePath("/library");
}

export async function reorderPlaylistEntries(playlistId: string, orderedEntryIds: string[]) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_playlist_entries", {
    p_playlist_id: playlistId,
    p_ids: orderedEntryIds,
  });
  if (error) throw new Error(error.message);
}

export async function updatePlaylistEntryDuration(entryId: string, durationSeconds: number) {
  await requireSession();
  const admin = createAdminClient();
  const { error } = await admin
    .from("playlist_entries")
    .update({ duration_seconds: Math.max(1, Math.round(durationSeconds)) })
    .eq("id", entryId);
  if (error) throw new Error(error.message);
}
