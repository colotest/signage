"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MediaThumb } from "@/components/MediaThumb";
import type { Folder, MediaItem, PlaylistEntryWithMedia } from "@/types/domain";
import { createUploadUrl, finalizeMediaUpload, moveMediaItem } from "@/lib/actions/media";
import {
  addMediaToPlaylist,
  getPlaylistEntryIds,
  reorderPlaylistEntries,
} from "@/lib/actions/playlists";
import { inspectFile } from "@/lib/media/inspectFile";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { FileTree, MENU_ITEM_CLASS, ThreeDotIcon, type SortDir, type SortKey } from "./FileTree";
import { PlaylistSection, type PlaylistWithEntries } from "./PlaylistSection";
import { UploadDropzone } from "./UploadDropzone";

// Resolved from whatever id dnd-kit's `over` reports — a folder (including
// root, id null) when a file's dropped inside FileTree, or a playlist when
// it's dropped onto one instead. Keeping this as one union (rather than two
// separate "am I over a folder"/"am I over a playlist" checks) is what lets
// a single onDragEnd handle both without the two cases fighting over the
// same `over.id` string.
type DropTarget = { type: "folder"; folderId: string | null } | { type: "playlist"; playlistId: string };

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
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [uploading, setUploading] = useState(0);

  // A single DndContext up here (rather than one inside FileTree and
  // another inside PlaylistSection) is what lets a file be picked up in the
  // Media list and dropped onto a Playlist card — draggable/droppable hooks
  // only ever see the nearest ancestor DndContext, so two separate ones
  // could never interact.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );
  // Optimistic mirror of `media` — dragging a file onto a folder (or a
  // playlist) reflects immediately rather than waiting for router.refresh()
  // to bring the change back down as a prop.
  const [localMedia, setLocalMedia] = useState(media);
  useEffect(() => {
    setLocalMedia(media);
  }, [media]);
  const mediaById = useMemo(() => new Map(localMedia.map((m) => [m.id, m])), [localMedia]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingItem = draggingId ? (mediaById.get(draggingId) ?? null) : null;
  // The *resolved* drop target rather than which specific row/card is under
  // the pointer — a folder id (or null for root) drives a border around
  // that whole folder's row + its expanded files in FileTree; a playlist id
  // highlights that whole PlaylistRow.
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null | undefined>(undefined);
  const [dropTargetPlaylistId, setDropTargetPlaylistId] = useState<string | null>(null);

  // Dropping directly onto a folder row targets that folder; dropping onto
  // a file row (root-level or nested, in FileTree) targets whichever folder
  // that file itself lives in — this is what makes dropping among a
  // folder's (or root's) own files work as a destination, not just its row.
  // Dropping onto a PlaylistRow targets that playlist instead.
  function resolveDropTarget(overId: string): DropTarget | undefined {
    if (overId.startsWith("folder-")) return { type: "folder", folderId: overId.slice("folder-".length) };
    if (overId.startsWith("file-")) {
      return { type: "folder", folderId: mediaById.get(overId.slice("file-".length))?.folder_id ?? null };
    }
    if (overId.startsWith("playlist-")) return { type: "playlist", playlistId: overId.slice("playlist-".length) };
    return undefined;
  }

  function clearDragState() {
    setDraggingId(null);
    setDropTargetFolderId(undefined);
    setDropTargetPlaylistId(null);
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const target = event.over ? resolveDropTarget(String(event.over.id)) : undefined;
    setDropTargetFolderId(target?.type === "folder" ? target.folderId : undefined);
    setDropTargetPlaylistId(target?.type === "playlist" ? target.playlistId : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    clearDragState();
    if (!over) return;

    const mediaId = String(active.id);
    const target = resolveDropTarget(String(over.id));
    if (!target) return;

    if (target.type === "folder") {
      const item = mediaById.get(mediaId);
      if (!item || item.folder_id === target.folderId) return;
      setLocalMedia((current) =>
        current.map((m) => (m.id === mediaId ? { ...m, folder_id: target.folderId } : m)),
      );
      moveMediaItem(mediaId, target.folderId);
      router.refresh();
      return;
    }

    addFileToPlaylistAtStart(target.playlistId, mediaId);
  }

  // add_media_to_playlist always appends, so getting the new entry to the
  // front (what dropping a file directly onto a playlist should do) takes
  // an extra step: add normally, read the entry ids back to find where the
  // server put it, then reorder it to the front. The optimistic update
  // below shows it at the front immediately regardless, so none of that
  // round-tripping is visible.
  async function addFileToPlaylistAtStart(playlistId: string, mediaId: string) {
    const mediaItem = mediaById.get(mediaId);
    if (!mediaItem) return;

    const optimisticId = `optimistic-${mediaId}-${Date.now()}`;
    setLocalPlaylists((current) =>
      current.map((playlist) => {
        if (playlist.id !== playlistId) return playlist;
        const newEntry: PlaylistEntryWithMedia = {
          id: optimisticId,
          playlist_id: playlistId,
          media_item_id: mediaId,
          position: -1,
          duration_seconds: 10,
          created_at: new Date().toISOString(),
          media_item: mediaItem,
        };
        return { ...playlist, entries: [newEntry, ...playlist.entries] };
      }),
    );

    await addMediaToPlaylist(playlistId, [mediaId]);
    const ids = await getPlaylistEntryIds(playlistId);
    const newId = ids[ids.length - 1];
    if (newId) {
      await reorderPlaylistEntries(playlistId, [newId, ...ids.filter((id) => id !== newId)]);
    }
    router.refresh();
  }

  // Lives here (not in UploadDropzone) so both the "+ Upload" button and
  // dropping OS files directly onto the file list (see FileTree) share the
  // same upload pipeline and in-progress count.
  async function uploadFiles(files: FileList | File[]) {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const supabase = createBrowserClient();

    setUploading((n) => n + fileArray.length);
    await Promise.all(
      fileArray.map(async (file) => {
        try {
          const { mediaItemId, storagePath, mediaType, token } = await createUploadUrl({
            filename: file.name,
            contentType: file.type,
          });

          const [metadata, { error: uploadError }] = await Promise.all([
            inspectFile(file, mediaType),
            supabase.storage.from("media").uploadToSignedUrl(storagePath, token, file),
          ]);
          if (uploadError) throw uploadError;

          await finalizeMediaUpload({
            mediaItemId,
            folderId: uploadTargetId,
            name: file.name,
            storagePath,
            mediaType,
            mimeType: file.type,
            sizeBytes: file.size,
            width: metadata.width,
            height: metadata.height,
            durationSeconds: metadata.durationSeconds,
          });
        } catch (err) {
          console.error("Upload failed", file.name, err);
          alert(`Failed to upload "${file.name}": ${err instanceof Error ? err.message : "unknown error"}`);
        } finally {
          setUploading((n) => n - 1);
        }
      }),
    );
    router.refresh();
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={clearDragState}
    >
      <div className="flex h-full min-h-0 flex-col gap-6">
        {/* Two fixed sections, both always in view at once, with only their
            own content scrolling internally rather than the whole page
            growing past the viewport. On mobile the split is 3:4 (Media
            smaller, Playlists larger) rather than an even half each — sm:
            resets that back to equal halves on desktop. */}
        <section className="flex min-h-0 flex-[3] flex-col sm:flex-1">
          {/* relative z-10 keeps this above FileTree's own list, which now
              overlaps up underneath it (see FileTree) so scrolled-past rows
              fade away rather than popping in and out below this row. */}
          <div className="relative z-10 flex items-center justify-between gap-3">
            <h1 className="text-[28px] font-semibold tracking-tight">Media</h1>
            <div className="flex items-center gap-3">
              {/* Hidden while picking files for a playlist — there's nothing
                  to upload to while the list is busy being a file picker,
                  and the space is better spent on the list itself. */}
              {activePlaylistId === null && (
                <>
                  <span className="text-[12px] text-muted">
                    Uploading to:{" "}
                    <span className="text-foreground">{uploadTargetFolder ? uploadTargetFolder.name : "Root"}</span>
                  </span>
                  <UploadDropzone uploading={uploading} onUploadFiles={uploadFiles} />
                </>
              )}
              <MobileFileMenuButton
                sortKey={sortKey}
                sortDir={sortDir}
                onToggleSort={toggleSort}
                onNewFolder={() => setCreatingIn(null)}
              />
            </div>
          </div>

          <FileTree
            className="min-h-0 flex-1"
            folders={folders}
            media={localMedia}
            selectionMode={activePlaylistId !== null}
            selectedIds={selectedMediaIds}
            onToggleMedia={toggleMedia}
            onToggleFolderIds={toggleFolderIds}
            uploadTargetId={uploadTargetId}
            onActivateFolder={setUploadTargetId}
            sortKey={sortKey}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            creatingIn={creatingIn}
            onCreatingChange={setCreatingIn}
            onUploadFiles={uploadFiles}
            dropTargetFolderId={dropTargetFolderId}
          />
        </section>

        <section className="flex min-h-0 flex-[4] flex-col sm:flex-1">
          <PlaylistSection
            className="min-h-0 flex-1"
            playlists={localPlaylists}
            activePlaylistId={activePlaylistId}
            selectedCount={selectedMediaIds.size}
            onArmSelection={armSelection}
            onCancelSelection={cancelSelection}
            onConfirmAdd={confirmAdd}
            onReorderEntries={reorderEntriesLocal}
            dropTargetPlaylistId={dropTargetPlaylistId}
          />
        </section>
      </div>

      <DragOverlay>
        {draggingItem && (
          <div className="drag-pickup flex items-center gap-2.5 rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 shadow-[var(--shadow-card)]">
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[4px] bg-black/[.04] dark:bg-white/[.06]">
              <MediaThumb item={draggingItem} />
            </div>
            <span className="max-w-[220px] truncate text-[13px] font-medium">{draggingItem.name}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// Mobile-only stand-in for FileTree's own sort bar and its "+ New Folder"
// trigger (both hidden below the sm breakpoint — see FileTree) — tucked
// behind a "⋯" popup next to Upload instead, so the file list gets that
// space back on a small screen. Stays open after picking an option (the
// user may want to flip a sort direction more than once, or glance at the
// list after starting a new folder) — only an outside tap/Escape closes it.
function MobileFileMenuButton({
  sortKey,
  sortDir,
  onToggleSort,
  onNewFolder,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  onNewFolder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0 sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="File options"
        aria-expanded={open}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[.05] text-muted transition-colors hover:bg-black/[.08] hover:text-foreground dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        <ThreeDotIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-card)]">
          <div className="px-2.5 pb-1 pt-1.5 text-[12px] text-muted">Sort by</div>
          <SortMenuItem label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={onToggleSort} />
          <SortMenuItem label="Date Added" sortKey="date" active={sortKey} dir={sortDir} onClick={onToggleSort} />
          <div className="my-1 border-t border-border" />
          <button type="button" onClick={onNewFolder} className={MENU_ITEM_CLASS}>
            + New Folder
          </button>
        </div>
      )}
    </div>
  );
}

function SortMenuItem({
  label,
  sortKey,
  active,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
}) {
  const isActive = active === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "flex w-full items-center justify-between rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[.04] dark:hover:bg-white/[.06]",
        isActive ? "font-medium text-foreground" : "text-muted",
      )}
    >
      {label}
      {isActive && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}
