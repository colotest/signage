"use server";

import { revalidatePath } from "next/cache";
import { mediaNames, playlistName, plural, quote, recordActivity } from "@/lib/activity";
import { requireSession } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

// Reusable, named playlists — independent of any screen. Kept in their own
// file (plural "playlists.ts") deliberately separate from the existing
// singular "playlist.ts", which governs screens' playlist_items and is
// untouched by any of this.

type EntryNames = { media_item: { name: string } | null; playlist: { name: string } | null };
const ENTRY_NAMES = "media_item:media_items(name), playlist:playlists(name)";

export async function createPlaylist() {
  const user = await requireSession();
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
  recordActivity(user, { action: "playlist.create", summary: "Created a new playlist" });
  revalidatePath("/library");
  return data;
}

export async function renamePlaylist(id: string, name: string) {
  const user = await requireSession();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name cannot be empty");
  const admin = createAdminClient();
  const { data: before } = await admin.from("playlists").select("name").eq("id", id).maybeSingle();
  const { error } = await admin.from("playlists").update({ name: trimmed }).eq("id", id);
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "playlist.rename",
    target: `playlist:${id}`,
    summary: `Renamed playlist ${quote(before?.name)} to ${quote(trimmed)}`,
  });
  revalidatePath("/library");
}

export async function deletePlaylist(id: string) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: deleted, error } = await admin.from("playlists").delete().eq("id", id).select("name");
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "playlist.delete", summary: `Deleted playlist ${quote(deleted?.[0]?.name)}` });
  revalidatePath("/library");
}

export async function reorderPlaylists(orderedIds: string[]) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_playlists", { p_ids: orderedIds });
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "playlists.reorder", target: "playlists", summary: "Reordered the playlists" });
}

export async function addMediaToPlaylist(playlistId: string, mediaIds: string[]) {
  const user = await requireSession();
  if (mediaIds.length === 0) return;
  const admin = createAdminClient();
  const { error } = await admin.rpc("add_media_to_playlist", {
    p_playlist_id: playlistId,
    p_media_ids: mediaIds,
  });
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "playlist.add",
    summary: async (admin) =>
      `Added ${await mediaNames(admin, mediaIds)} to playlist ${await playlistName(admin, playlistId)}`,
  });
  revalidatePath("/library");
}

export async function removePlaylistEntry(entryId: string) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { data: removed, error } = await admin
    .from("playlist_entries")
    .delete()
    .eq("id", entryId)
    .select(ENTRY_NAMES);
  if (error) throw new Error(error.message);
  const entry = removed?.[0] as unknown as EntryNames | undefined;
  recordActivity(user, {
    action: "playlist.remove",
    summary: `Removed ${quote(entry?.media_item?.name)} from playlist ${quote(entry?.playlist?.name)}`,
  });
  revalidatePath("/library");
}

// add_media_to_playlist always appends and doesn't hand back the new row's
// id, so inserting at the front (see LibraryView's cross-list drag-and-drop)
// means adding normally, then reading the entry ids back to find it and
// reorder it to the front — this is what that second step reads.
export async function getPlaylistEntryIds(playlistId: string): Promise<string[]> {
  await requireSession();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("playlist_entries")
    .select("id")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => row.id as string);
}

export async function reorderPlaylistEntries(playlistId: string, orderedEntryIds: string[]) {
  const user = await requireSession();
  const admin = createAdminClient();
  const { error } = await admin.rpc("reorder_playlist_entries", {
    p_playlist_id: playlistId,
    p_ids: orderedEntryIds,
  });
  if (error) throw new Error(error.message);
  recordActivity(user, {
    action: "playlist.reorder",
    target: `playlist:${playlistId}`,
    summary: async (admin) => `Reordered playlist ${await playlistName(admin, playlistId)}`,
  });
}

export async function updatePlaylistEntryDuration(entryId: string, durationSeconds: number) {
  const user = await requireSession();
  const admin = createAdminClient();
  const seconds = Math.max(1, Math.round(durationSeconds));
  const { data: updated, error } = await admin
    .from("playlist_entries")
    .update({ duration_seconds: seconds })
    .eq("id", entryId)
    .select(ENTRY_NAMES);
  if (error) throw new Error(error.message);
  const entry = updated?.[0] as unknown as EntryNames | undefined;
  recordActivity(user, {
    action: "playlist.duration",
    target: `playlist_entry:${entryId}`,
    summary: `Set ${quote(entry?.media_item?.name)} in playlist ${quote(entry?.playlist?.name)} to ${plural(seconds, "second")}`,
  });
}
