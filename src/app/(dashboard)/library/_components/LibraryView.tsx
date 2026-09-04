"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Folder, MediaItem, PlaylistEntryWithMedia } from "@/types/domain";
import { addMediaToPlaylist, reorderPlaylistEntries, reorderPlaylists } from "@/lib/actions/playlists";
import { FileTree } from "./FileTree";
import { PlaylistSection, type PlaylistWithEntries } from "./PlaylistSection";
import { UploadDropzone } from "./UploadDropzone";

export function LibraryView({
  folders,
  media,
  playlists,
}: {
  folders: Folder[];
  media: MediaItem[];
  playlists: PlaylistWithEntries[];
}) {
  const router = useRouter();
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());

  // An optimistic mirror of the server-provided playlists, mutated
  // immediately on reorder/add so the UI reflects what the user just did
  // without waiting for router.refresh() to bring it back down as props —
  // and resynced whenever fresh server data actually arrives.
  const [localPlaylists, setLocalPlaylists] = useState(playlists);
  useEffect(() => {
    setLocalPlaylists(playlists);
  }, [playlists]);

  function toggleMedia(id: string) {
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleFolderIds(ids: string[], select: boolean) {
    setSelectedMediaIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  function armSelection(playlistId: string) {
    setActivePlaylistId(playlistId);
    setSelectedMediaIds(new Set());
  }

  function cancelSelection() {
    setActivePlaylistId(null);
    setSelectedMediaIds(new Set());
  }

  function reorderPlaylistsLocal(next: PlaylistWithEntries[]) {
    setLocalPlaylists(next);
    reorderPlaylists(next.map((p) => p.id));
    router.refresh();
  }

  function reorderEntriesLocal(playlistId: string, nextEntries: PlaylistEntryWithMedia[]) {
    setLocalPlaylists((current) =>
      current.map((p) => (p.id === playlistId ? { ...p, entries: nextEntries } : p)),
    );
    reorderPlaylistEntries(
      playlistId,
      nextEntries.map((e) => e.id),
    );
    router.refresh();
  }

  async function confirmAdd(playlistId: string) {
    if (selectedMediaIds.size === 0) return;
    const ids = Array.from(selectedMediaIds);
    const mediaById = new Map(media.map((m) => [m.id, m]));
    const addedAt = new Date().toISOString();

    // Built from media already known client-side, matching the server's
    // own defaults exactly (10s, appended at the end) so nothing visibly
    // corrects itself once the real rows come back from router.refresh().
    setLocalPlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const startPosition = playlist.entries.length;
        const newEntries: PlaylistEntryWithMedia[] = ids.flatMap((mediaId, i) => {
          const mediaItem = mediaById.get(mediaId);
          if (!mediaItem) return [];
          return [
            {
              id: `optimistic-${mediaId}-${i}-${Date.now()}`,
              playlist_id: playlistId,
              media_item_id: mediaId,
              position: startPosition + i,
              duration_seconds: 10,
              created_at: addedAt,
              media_item: mediaItem,
            },
          ];
        });
        return { ...playlist, entries: [...playlist.entries, ...newEntries] };
      }),
    );
    setActivePlaylistId(null);
    setSelectedMediaIds(new Set());

    await addMediaToPlaylist(playlistId, ids);
    router.refresh();
  }

  const uploadTargetFolder = uploadTargetId ? folders.find((f) => f.id === uploadTargetId) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      {/* Two fixed halves, each exactly half of the available height — the
          file tree and the playlists below it are always both in view at
          once, with only their own content scrolling internally, rather
          than the whole page growing past the viewport. */}
      <section className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">Media</h1>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted">
              Uploading to: <span className="text-foreground">{uploadTargetFolder ? uploadTargetFolder.name : "Root"}</span>
            </span>
            <UploadDropzone folderId={uploadTargetId} />
          </div>
        </div>

        <FileTree
          className="min-h-0 flex-1"
          folders={folders}
          media={media}
          selectionMode={activePlaylistId !== null}
          selectedIds={selectedMediaIds}
          onToggleMedia={toggleMedia}
          onToggleFolderIds={toggleFolderIds}
          uploadTargetId={uploadTargetId}
          onActivateFolder={setUploadTargetId}
        />
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <PlaylistSection
          className="min-h-0 flex-1"
          playlists={localPlaylists}
          activePlaylistId={activePlaylistId}
          selectedCount={selectedMediaIds.size}
          onArmSelection={armSelection}
          onCancelSelection={cancelSelection}
          onConfirmAdd={confirmAdd}
          onReorderPlaylists={reorderPlaylistsLocal}
          onReorderEntries={reorderEntriesLocal}
        />
      </section>
    </div>
  );
}
