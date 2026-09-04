"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Folder, MediaItem } from "@/types/domain";
import { addMediaToPlaylist } from "@/lib/actions/playlists";
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

  async function confirmAdd(playlistId: string) {
    if (selectedMediaIds.size === 0) return;
    await addMediaToPlaylist(playlistId, Array.from(selectedMediaIds));
    setActivePlaylistId(null);
    setSelectedMediaIds(new Set());
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
          playlists={playlists}
          activePlaylistId={activePlaylistId}
          selectedCount={selectedMediaIds.size}
          onArmSelection={armSelection}
          onCancelSelection={cancelSelection}
          onConfirmAdd={confirmAdd}
        />
      </section>
    </div>
  );
}
