"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Folder, MediaItem, PlaylistEntryWithMedia } from "@/types/domain";
import { addMediaToPlaylist, reorderPlaylistEntries, reorderPlaylists } from "@/lib/actions/playlists";
import { cn } from "@/lib/utils/cn";
import { FileTree, MENU_ITEM_CLASS, ThreeDotIcon, type SortDir, type SortKey } from "./FileTree";
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
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);

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
      <section className="flex min-h-0 flex-1 flex-col">
        {/* relative z-10 keeps this above FileTree's own list, which now
            overlaps up underneath it (see FileTree) so scrolled-past rows
            fade away rather than popping in and out below this row. */}
        <div className="relative z-10 flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">Media</h1>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted">
              Uploading to: <span className="text-foreground">{uploadTargetFolder ? uploadTargetFolder.name : "Root"}</span>
            </span>
            <UploadDropzone folderId={uploadTargetId} />
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
          media={media}
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
