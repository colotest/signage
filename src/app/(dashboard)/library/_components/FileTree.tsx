"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { MediaThumb } from "@/components/MediaThumb";
import { InlineRename } from "@/components/InlineRename";
import { ProgressiveBlurEdge } from "@/components/ProgressiveBlurEdge";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDuration, formatResolution, kindLabel } from "@/lib/utils/format";
import { createFolder, deleteFolder, renameFolder } from "@/lib/actions/folders";
import { deleteMediaItem, moveMediaItem } from "@/lib/actions/media";
import { deleteDeck, moveDeck, renameDeck } from "@/lib/actions/decks";
import { removeWithAnimation } from "@/lib/animation/listMotion";
import { mediaPublicUrl, type DeckWithPages, type Folder, type MediaItem } from "@/types/domain";
import { RenameableTitle } from "./RenameableTitle";
import { ReplaceMediaButton } from "./ReplaceMediaButton";
import { ReplaceDeckButton } from "./ReplaceDeckButton";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

type Router = ReturnType<typeof useRouter>;
type FolderNode = Folder & { children: FolderNode[]; files: MediaItem[]; decks: DeckWithPages[] };

function buildTree(folders: Folder[], media: MediaItem[], decks: DeckWithPages[]) {
  const nodeById = new Map<string, FolderNode>();
  for (const f of folders) nodeById.set(f.id, { ...f, children: [], files: [], decks: [] });
  const roots: FolderNode[] = [];
  for (const f of folders) {
    const node = nodeById.get(f.id)!;
    const parent = f.parent_id ? nodeById.get(f.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const rootFiles: MediaItem[] = [];
  for (const m of media) {
    // A PDF's pages are listed inside their deck, never loose among the
    // files — the deck is the thing that lives in a folder.
    if (m.deck_id) continue;
    const parent = m.folder_id ? nodeById.get(m.folder_id) : undefined;
    if (parent) parent.files.push(m);
    else rootFiles.push(m);
  }
  const rootDecks: DeckWithPages[] = [];
  for (const deck of decks) {
    const parent = deck.folder_id ? nodeById.get(deck.folder_id) : undefined;
    if (parent) parent.decks.push(deck);
    else rootDecks.push(deck);
  }
  return { roots, rootFiles, rootDecks, nodeById };
}

// Everything a folder holds, deck pages included and in page order — what
// ticking a folder's own checkbox selects.
function collectMediaIds(node: FolderNode): string[] {
  return [
    ...node.files.map((f) => f.id),
    ...node.decks.flatMap((deck) => deck.pages.map((page) => page.id)),
    ...node.children.flatMap(collectMediaIds),
  ];
}

export type SortKey = "name" | "kind" | "resolution" | "duration" | "size" | "date";
export type SortDir = "asc" | "desc";

function sortValue(item: MediaItem, key: SortKey): string | number {
  switch (key) {
    case "name":
      return item.name.toLowerCase();
    case "kind":
      return kindLabel(item);
    case "resolution":
      return (item.width ?? 0) * (item.height ?? 0);
    case "duration":
      return item.duration_seconds ?? -1;
    case "size":
      return item.size_bytes ?? -1;
    case "date":
      return new Date(item.created_at).getTime();
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function FileTree({
  className,
  folders,
  media,
  decks,
  selectionMode,
  selectedIds,
  onToggleMedia,
  onToggleFolderIds,
  uploadTargetId,
  onActivateFolder,
  sortKey,
  sortDir,
  onToggleSort,
  creatingIn,
  onCreatingChange,
  onUploadFiles,
  dropTargetFolderId,
}: {
  className?: string;
  folders: Folder[];
  media: MediaItem[];
  decks: DeckWithPages[];
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleMedia: (id: string) => void;
  onToggleFolderIds: (ids: string[], select: boolean) => void;
  uploadTargetId: string | null;
  onActivateFolder: (id: string | null) => void;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggleSort: (key: SortKey) => void;
  creatingIn: string | null | undefined;
  onCreatingChange: (id: string | null | undefined) => void;
  // Left out where the tree is only ever a file picker (the dashboard's
  // Playback Menu) — OS file drops are then ignored instead of showing an
  // upload overlay that leads nowhere.
  onUploadFiles?: (files: FileList) => void;
  // Owned by LibraryView now — a single DndContext up there is what lets a
  // file be dragged out of this tree and dropped onto a playlist, which a
  // DndContext scoped to this component alone could never see.
  dropTargetFolderId: string | null | undefined;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // OS-level file drag (from the desktop, a Finder window, etc.) — entirely
  // separate machinery from the dnd-kit drag above (native DragEvents vs.
  // synthetic pointer tracking), so the two can't interfere with each
  // other. dragCounterRef, not the boolean alone, is what survives
  // dragenter/dragleave firing on every child element as the pointer moves
  // across nested rows — only going back to 0 means the pointer actually
  // left the whole list, not just one row for another.
  const [isDraggingOsFile, setIsDraggingOsFile] = useState(false);
  const dragCounterRef = useRef(0);
  const uploadTargetFolderName = folders.find((f) => f.id === uploadTargetId)?.name ?? "Root";

  function handleNativeDragEnter(e: React.DragEvent) {
    if (!onUploadFiles || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    setIsDraggingOsFile(true);
  }

  function handleNativeDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
  }

  function handleNativeDragLeave(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    dragCounterRef.current = Math.max(dragCounterRef.current - 1, 0);
    if (dragCounterRef.current === 0) setIsDraggingOsFile(false);
  }

  function handleNativeDrop(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingOsFile(false);
    if (e.dataTransfer.files.length > 0) onUploadFiles?.(e.dataTransfer.files);
  }

  const { roots, rootFiles, rootDecks } = useMemo(() => buildTree(folders, media, decks), [folders, media, decks]);

  function sortFiles(items: MediaItem[]) {
    const copy = [...items];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }

  function sortFolders(nodes: FolderNode[]) {
    return [...nodes].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Decks sort by the columns they actually have — name, size, date — and
  // fall back to name for the ones they don't (a deck has no single
  // resolution or duration of its own).
  function sortDecks(items: DeckWithPages[]) {
    const copy = [...items];
    copy.sort((a, b) => {
      const value = (deck: DeckWithPages): string | number => {
        if (sortKey === "size") return deck.size_bytes ?? -1;
        if (sortKey === "date") return new Date(deck.created_at).getTime();
        return deck.name.toLowerCase();
      };
      const av = value(a);
      const bv = value(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Creating a subfolder expands its parent so the new inline input is
  // actually visible where it lands.
  function startCreatingIn(id: string | null) {
    onCreatingChange(id);
    if (id) setExpanded((c) => new Set(c).add(id));
  }

  // A row click steps a folder through open → targeted → closed: a
  // collapsed folder expands and becomes the upload target; an expanded one
  // that isn't the target just becomes it (rather than collapsing out from
  // under the click); only clicking the current target collapses it again,
  // handing the target back to its parent (or Root) rather than leaving a
  // now-collapsed, no-longer-visible folder as the target.
  function handleFolderRowClick(folder: FolderNode) {
    const isExpanded = expanded.has(folder.id);
    if (!isExpanded) {
      toggleExpanded(folder.id);
      onActivateFolder(folder.id);
    } else if (uploadTargetId !== folder.id) {
      onActivateFolder(folder.id);
    } else {
      toggleExpanded(folder.id);
      onActivateFolder(folder.parent_id);
    }
  }

  // The chevron stays a plain open/close toggle — expanding still targets
  // the folder, collapsing hands the target back to its parent.
  function handleFolderChevronClick(folder: FolderNode) {
    const wasExpanded = expanded.has(folder.id);
    toggleExpanded(folder.id);
    onActivateFolder(wasExpanded ? folder.parent_id : folder.id);
  }

  if (roots.length === 0 && rootFiles.length === 0 && rootDecks.length === 0) {
    return (
      <div
        onDragEnter={handleNativeDragEnter}
        onDragOver={handleNativeDragOver}
        onDragLeave={handleNativeDragLeave}
        onDrop={handleNativeDrop}
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-16 text-center",
          className,
        )}
      >
        <p className="text-[17px] font-medium">No files here</p>
        <p className="text-sm text-muted">Upload images, videos, or PDFs, or create a folder to get started.</p>
        {isDraggingOsFile && <UploadDropOverlay folderName={uploadTargetFolderName} />}
      </div>
    );
  }

  return (
    <>
      {/* -mx-5 bleeds this whole section — header row included, so it stays
          aligned with the rows below it — out of the page's own left/right
          inset to reach the screen edges for more row width. -mt-10 pulls
          the whole thing up 40px, overlapping the "Media" title row above
          (LibraryView, which needs its own relative z-10 to stay on top) —
          on mobile, where the sort bar below is hidden, this is what lets
          scrolled-past rows fade away underneath that title instead of
          popping in and out below it, and (with pt-20 matching it below)
          the reach is pure fade zone — no row moves. sm:pt-10 gives back
          40px of it once the sort bar becomes visible, so the bar and the
          first row stay exactly where they were on desktop; the sort bar's
          own top-10 does the rest.

          -mb-5 stays at its original 20px rather than reaching as deep as
          the top: the playlists list sits directly below, and a list's own
          background wash (ProgressiveBlurEdge) paints over whatever is
          behind it. Reaching further down put the playlists list's wash
          straight over these rows as they faded, cutting them off dead
          instead of fading them — a title can layer itself above a
          neighbouring list's edge, another list's rows can't. */}
      <div
        onDragEnter={handleNativeDragEnter}
        onDragOver={handleNativeDragOver}
        onDragLeave={handleNativeDragLeave}
        onDrop={handleNativeDrop}
        className={cn("relative -mx-5 -mt-20 -mb-5 flex min-h-0 flex-col sm:pt-10", className)}
      >
        {/* overflow-x-hidden (not scroll) is the point — file details and
            row actions live behind the "⋯" menu precisely so a narrow row
            never needs to scroll sideways to reach them. Sharp corners:
            edge-to-edge leaves no room for rounding to actually read.
            pt-10/pb-10 (matching the fade's own 40px) keep the fade off the
            first and last row themselves, landing on blank padding instead.
            no-scrollbar: the native scrollbar track/thumb looked odd
            crossing the blurred/faded edges, and this list is easily
            scrollable by touch/trackpad without it.

            ProgressiveBlurEdge is a SIBLING of the scrolling div, not a
            child of it — a position:absolute descendant still scrolls along
            with the rest of a scroll container's content (only mask-image
            on the scrolling box itself is exempt from that). Making this
            wrapper the relative anchor instead, with the scrolling div
            sized via inset-0, is what keeps the blur pinned in place while
            content scrolls underneath it.

            scroll-fade-y sits on the scrolling div ITSELF, with the blur
            (and the background wash it carries — see ProgressiveBlurEdge)
            deliberately outside that mask. The blur has to stay at full
            strength right up to the edge: it's what dissolves the content
            there, and the wash on top is what takes everything — text and
            flat highlight colours alike — the rest of the way to the page
            background. A mask over both instead would fade the wash away
            exactly where it does its work, leaving hovered/target rows
            still showing their colour at the edge. */}
        <div className="relative min-h-0 flex-1">
          <div className="absolute inset-0">
            <div
              style={{ WebkitTouchCallout: "none" }}
              className="scroll-fade-y [--fade-bottom:24px] no-scrollbar absolute inset-0 select-none overflow-x-hidden overflow-y-auto overscroll-contain pt-20 pb-3 sm:pt-[92px]"
            >
              <div>
                <TreeLevel
                  folders={sortFolders(roots)}
                  files={sortFiles(rootFiles)}
                  decks={sortDecks(rootDecks)}
                  depth={0}
                  isRoot
                  expanded={expanded}
                  onFolderRowClick={handleFolderRowClick}
                  onFolderChevronClick={handleFolderChevronClick}
                  onToggleDeck={toggleExpanded}
                  creatingIn={creatingIn}
                  onStartCreating={startCreatingIn}
                  onDoneCreating={() => onCreatingChange(undefined)}
                  selectionMode={selectionMode}
                  selectedIds={selectedIds}
                  onToggleMedia={onToggleMedia}
                  onToggleFolderIds={onToggleFolderIds}
                  uploadTargetId={uploadTargetId}
                  sortFiles={sortFiles}
                  sortFolders={sortFolders}
                  sortDecks={sortDecks}
                  dropTargetFolderId={dropTargetFolderId}
                  router={router}
                />
                {creatingIn === null ? (
                  <NewFolderRow depth={0} parentId={null} onDone={() => onCreatingChange(undefined)} router={router} />
                ) : (
                  // Hidden on mobile — the mobile trigger for this now lives in
                  // the "⋯" menu next to Upload (LibraryView), alongside Sort by.
                  <div className="hidden px-4 py-2 sm:block">
                    <button
                      type="button"
                      onClick={() => startCreatingIn(null)}
                      className="press-ghost text-[13px] font-medium text-accent"
                    >
                      + New Folder
                    </button>
                  </div>
                )}
              </div>
            </div>
            <ProgressiveBlurEdge side="top" />
            {/* Shallower: the playlists list (or Now Playing, in the Playback
            Menu) starts right below, so this edge has no room for the deep
            version — and its depth is most of the empty band between the
            two. */}
        <ProgressiveBlurEdge side="bottom" extent={48} />
          </div>
          {/* Desktop-only sort bar — absolutely positioned so it overlays
              the blur/fade zone instead of taking its own row above it,
              which used to leave a visible gap (its own height, plus the
              list's separate pt-10 fade reservation below that) between it
              and the first real row. Its own (translucent, blurred)
              background is what lets it sit on top of the fade zone and
              still read — thinned further here so the rows passing behind
              it stay visible through it. top-[52px] rather than flush with
              the list's own top edge: 40px of that is the reach this list
              takes past that edge (see -mt-20 above), and the remaining
              12px — one of its own font sizes — keeps it off the Media
              title above, with sm:pt-[92px] on the list below matching so
              the first row still clears it.
              Hidden on mobile — the mobile equivalent is the round "⋯" sort
              button next to the Upload pill (LibraryView). */}
          <div className="hidden absolute inset-x-0 top-[52px] z-10 items-center gap-2 border-b border-border bg-[var(--surface-elevated)]/65 px-4 py-2 text-[12px] text-muted backdrop-blur-xl sm:flex">
            <SortButton label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={onToggleSort} className="flex-1" />
            <SortButton
              label="Kind"
              sortKey="kind"
              active={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
              className="w-28 shrink-0"
            />
            <SortButton
              label="Resolution"
              sortKey="resolution"
              active={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
              className="w-24 shrink-0"
            />
            <SortButton
              label="Duration"
              sortKey="duration"
              active={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
              className="w-16 shrink-0"
            />
            <SortButton
              label="Size"
              sortKey="size"
              active={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
              className="w-20 shrink-0"
            />
            <SortButton
              label="Date Added"
              sortKey="date"
              active={sortKey}
              dir={sortDir}
              onClick={onToggleSort}
              className="w-40 shrink-0 mr-9"
            />
          </div>
        </div>
        {isDraggingOsFile && <UploadDropOverlay folderName={uploadTargetFolderName} />}
      </div>
    </>
  );
}

function TreeLevel({
  folders,
  files,
  decks,
  depth,
  isRoot,
  expanded,
  onFolderRowClick,
  onFolderChevronClick,
  onToggleDeck,
  creatingIn,
  onStartCreating,
  onDoneCreating,
  selectionMode,
  selectedIds,
  onToggleMedia,
  onToggleFolderIds,
  uploadTargetId,
  sortFiles,
  sortFolders,
  sortDecks,
  dropTargetFolderId,
  router,
}: {
  folders: FolderNode[];
  files: MediaItem[];
  decks: DeckWithPages[];
  depth: number;
  isRoot?: boolean;
  expanded: Set<string>;
  onFolderRowClick: (folder: FolderNode) => void;
  onFolderChevronClick: (folder: FolderNode) => void;
  // A deck opens and closes like a folder, but has no upload target or
  // subfolder behaviour of its own — just the one toggle.
  onToggleDeck: (id: string) => void;
  creatingIn: string | null | undefined;
  onStartCreating: (id: string | null) => void;
  onDoneCreating: () => void;
  selectionMode: boolean;
  selectedIds: Set<string>;
  onToggleMedia: (id: string) => void;
  onToggleFolderIds: (ids: string[], select: boolean) => void;
  uploadTargetId: string | null;
  sortFiles: (items: MediaItem[]) => MediaItem[];
  sortFolders: (nodes: FolderNode[]) => FolderNode[];
  sortDecks: (items: DeckWithPages[]) => DeckWithPages[];
  dropTargetFolderId: string | null | undefined;
  router: Router;
}) {
  const fileRows = files.map((item) => (
    <FileRow
      key={item.id}
      item={item}
      depth={depth}
      selectionMode={selectionMode}
      selected={selectedIds.has(item.id)}
      onToggleSelect={() => onToggleMedia(item.id)}
      router={router}
    />
  ));

  return (
    <>
      {folders.map((folder) => {
        const isExpanded = expanded.has(folder.id);
        const descendantIds = collectMediaIds(folder);
        const selectedCount = descendantIds.filter((id) => selectedIds.has(id)).length;
        const checkState: "all" | "some" | "none" =
          descendantIds.length === 0 || selectedCount === 0
            ? "none"
            : selectedCount === descendantIds.length
              ? "all"
              : "some";

        return (
          // The drop-target highlight wraps the folder's row *and* its
          // expanded contents as one group, rather than whichever single
          // row happens to be under the pointer — see dropTargetFolderId.
          <div
            key={folder.id}
            className={cn(dropTargetFolderId === folder.id && "rounded-[var(--radius-md)] ring-2 ring-inset ring-accent")}
          >
            <FolderRow
              folder={folder}
              depth={depth}
              isExpanded={isExpanded}
              onRowClick={() => onFolderRowClick(folder)}
              onChevronClick={() => onFolderChevronClick(folder)}
              selectionMode={selectionMode}
              checkState={checkState}
              onToggleSelect={() => onToggleFolderIds(descendantIds, checkState !== "all")}
              onStartCreating={() => onStartCreating(folder.id)}
              isUploadTarget={uploadTargetId === folder.id}
              router={router}
            />
            {isExpanded && (
              <TreeLevel
                folders={sortFolders(folder.children)}
                files={sortFiles(folder.files)}
                decks={sortDecks(folder.decks)}
                depth={depth + 1}
                expanded={expanded}
                onFolderRowClick={onFolderRowClick}
                onFolderChevronClick={onFolderChevronClick}
                onToggleDeck={onToggleDeck}
                creatingIn={creatingIn}
                onStartCreating={onStartCreating}
                onDoneCreating={onDoneCreating}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleMedia={onToggleMedia}
                onToggleFolderIds={onToggleFolderIds}
                uploadTargetId={uploadTargetId}
                sortFiles={sortFiles}
                sortFolders={sortFolders}
                sortDecks={sortDecks}
                dropTargetFolderId={dropTargetFolderId}
                router={router}
              />
            )}
            {isExpanded && creatingIn === folder.id && (
              <NewFolderRow depth={depth + 1} parentId={folder.id} onDone={onDoneCreating} router={router} />
            )}
          </div>
        );
      })}

      {decks.map((deck) => {
        const pageIds = deck.pages.map((page) => page.id);
        const selectedCount = pageIds.filter((id) => selectedIds.has(id)).length;
        const checkState: "all" | "some" | "none" =
          pageIds.length === 0 || selectedCount === 0 ? "none" : selectedCount === pageIds.length ? "all" : "some";

        return (
          <div key={deck.id}>
            <DeckRow
              deck={deck}
              depth={depth}
              isExpanded={expanded.has(deck.id)}
              onToggleExpanded={() => onToggleDeck(deck.id)}
              selectionMode={selectionMode}
              checkState={checkState}
              onToggleSelect={() => onToggleFolderIds(pageIds, checkState !== "all")}
              router={router}
            />
            {expanded.has(deck.id) &&
              deck.pages.map((page) => (
                <FileRow
                  key={page.id}
                  item={page}
                  depth={depth + 1}
                  inDeck
                  selectionMode={selectionMode}
                  selected={selectedIds.has(page.id)}
                  onToggleSelect={() => onToggleMedia(page.id)}
                  router={router}
                />
              ))}
          </div>
        );
      })}

      {/* Root has no row of its own to anchor a highlight to, so when it's
          the drop target, its files get wrapped as a group instead — the
          equivalent of a folder's row + its own files getting one border. */}
      {isRoot && dropTargetFolderId === null ? (
        <div className="rounded-[var(--radius-md)] ring-2 ring-inset ring-accent">{fileRows}</div>
      ) : (
        fileRows
      )}
    </>
  );
}

// z-30 puts this above everything else in the list — the title (z-10), the
// desktop sort bar (z-10), and the blur (z-5) — since it needs to read as
// the frontmost thing happening the instant an OS file drag enters.
// pointer-events-none so the browser's drag hit-testing falls through to
// whatever's underneath (where the actual handlers live) rather than this.
function UploadDropOverlay({ folderName }: { folderName: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-[var(--radius-lg)] border-2 border-accent bg-accent/15">
      <p className="rounded-full bg-surface px-4 py-2 text-[15px] font-medium text-accent shadow-[var(--shadow-card)]">
        Drop here to upload to: {folderName}
      </p>
    </div>
  );
}

function Chevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn("h-3.5 w-3.5 shrink-0 transition-transform", open && "rotate-90", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
    >
      <polyline points="9 6 15 12 9 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Title above, date below in a smaller font, on mobile — there's no room
// for separate columns there, and everything besides title/date is already
// tucked behind the "⋯" menu. Desktop has the width to spare, so it gets a
// real Kind/Resolution/Duration/Size/Date Added row instead (see RowColumn
// below) and this stacked date is redundant with that Date Added column.
//
// items-start shrinks the title (and date) to their own text width instead
// of stretching across the whole column, so only the name itself is the
// double-click-to-rename hitbox and the rest of the column stays an
// ordinary row click. [&>*]:max-w-full keeps a long name truncating rather
// than overflowing; the rename inputs opt back into the full width
// themselves (self-stretch) while editing.
function RowInfo({ title, date }: { title: React.ReactNode; date: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-start [&>*]:max-w-full">
      {title}
      <span className="truncate text-[10px] text-muted sm:hidden">{date}</span>
    </div>
  );
}

// Desktop-only file-browser columns (Kind/Resolution/Duration/Size/Date
// Added) — hidden on mobile, where RowInfo's stacked date covers it and
// there's no room for the rest anyway. Widths here must match the
// corresponding SortButton's width in the sort bar for the header labels to
// land above their actual columns.
function RowColumn({ width, children }: { width: string; children: React.ReactNode }) {
  return <span className={cn("hidden shrink-0 truncate text-[12px] text-muted sm:block", width)}>{children}</span>;
}

export function ThreeDotIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

// Always in the row, so entering/leaving selection mode can slide it in and
// out instead of popping it: its slot grows from nothing (taking the row's
// contents along with it) while the box itself slides in from the left and
// fades up. collapsedClassName cancels out the row's own flex gap while
// hidden — a zero-width item would otherwise still leave a gap behind.
function Checkbox({
  visible,
  state,
  onChange,
  collapsedClassName,
}: {
  visible: boolean;
  state: boolean | "indeterminate";
  onChange: () => void;
  collapsedClassName: string;
}) {
  return (
    <span
      inert={!visible}
      className={cn(
        "flex shrink-0 overflow-hidden transition-[width,margin,opacity] duration-300 ease-[var(--ease-spring)]",
        visible ? "w-4 opacity-100" : cn("w-0 opacity-0", collapsedClassName),
      )}
    >
      <input
        ref={(node) => {
          if (node) node.indeterminate = state === "indeterminate";
        }}
        type="checkbox"
        checked={state === true}
        onChange={onChange}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "h-4 w-4 shrink-0 accent-accent transition-transform duration-300 ease-[var(--ease-spring)]",
          !visible && "-translate-x-4",
        )}
      />
    </span>
  );
}

// The per-row overflow menu — everything that used to be a column (kind,
// resolution, duration, size) or a hover-only action button (replace,
// delete, +subfolder) now lives in here instead, so a row never needs to
// grow wider or taller than its title + date to stay fully usable, and the
// actions stay reachable on touch (hover was never going to fire there).
function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
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
    <div
      ref={containerRef}
      className="relative shrink-0"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className="press-ghost-fit shrink-0 cursor-pointer rounded-full p-1.5 text-muted transition-colors hover:bg-black/[.04] hover:text-foreground dark:hover:bg-white/[.06]"
      >
        <ThreeDotIcon className="h-4 w-4" />
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 top-full z-20 mt-1 w-48 rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-card)]"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuInfo({ children }: { children: React.ReactNode }) {
  return <div className="px-2.5 py-1 text-[12px] text-muted">{children}</div>;
}

function MenuItem({
  onClick,
  danger,
  disabled,
  children,
}: {
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "press-ghost-fit block w-full cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[.04] disabled:opacity-50 dark:hover:bg-white/[.06]",
        danger ? "text-danger" : "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export const MENU_ITEM_CLASS =
  "press-ghost-fit block w-full cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-black/[.04] dark:hover:bg-white/[.06]";

function FolderRow({
  folder,
  depth,
  isExpanded,
  onRowClick,
  onChevronClick,
  selectionMode,
  checkState,
  onToggleSelect,
  onStartCreating,
  isUploadTarget,
  router,
}: {
  folder: FolderNode;
  depth: number;
  isExpanded: boolean;
  onRowClick: () => void;
  onChevronClick: () => void;
  selectionMode: boolean;
  checkState: "all" | "some" | "none";
  onToggleSelect: () => void;
  onStartCreating: () => void;
  isUploadTarget: boolean;
  router: Router;
}) {
  const [pending, startTransition] = useTransition();
  // isOver drives no styling of its own anymore — the wrapping div in
  // TreeLevel highlights the whole folder group instead of just this row —
  // but the droppable registration itself still needs to live here for hit
  // testing.
  const { setNodeRef } = useDroppable({ id: `folder-${folder.id}` });
  const rowRef = useRef<HTMLDivElement | null>(null);

  function handleDelete() {
    if (!window.confirm(`Delete folder "${folder.name}"? Subfolders are removed too; files inside move to Unsorted.`)) return;
    startTransition(async () => {
      // The row's parent is TreeLevel's per-folder group, so the folder's
      // expanded contents leave together with it.
      await removeWithAnimation(rowRef.current?.parentElement, () => deleteFolder(folder.id));
      router.refresh();
    });
  }

  // A row click opens/targets the folder in selection mode too — selecting
  // a whole folder's contents takes its checkbox specifically (which stops
  // its own click from reaching the row), so browsing into a folder while
  // picking never selects it by accident.
  function handleChevronClick(e: React.MouseEvent) {
    e.stopPropagation();
    onChevronClick();
  }

  const isHighlighted = selectionMode ? checkState === "all" : isUploadTarget;
  const itemCount = folder.children.length + folder.files.length;

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        rowRef.current = node;
      }}
      onClick={onRowClick}
      className={cn(
        "flex cursor-pointer items-center gap-2 border-b border-border px-4 py-2 last:border-0",
        isHighlighted ? "bg-accent/10 dark:bg-accent/15" : "hover:bg-black/[.02] dark:hover:bg-white/[.03]",
      )}
    >
      <Checkbox
        visible={selectionMode}
        state={checkState === "some" ? "indeterminate" : checkState === "all"}
        onChange={onToggleSelect}
        collapsedClassName="-mr-2"
      />
      <div style={{ width: depth * 20 }} className="shrink-0" />
      <button
        type="button"
        onClick={handleChevronClick}
        className="no-press shrink-0 text-muted hover:text-foreground"
        aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
      >
        <Chevron open={isExpanded} />
      </button>
      <span className="shrink-0">📁</span>

      <RowInfo
        title={
          <InlineRename
            value={folder.name}
            onSave={(next) => {
              startTransition(async () => {
                await renameFolder(folder.id, next);
                router.refresh();
              });
            }}
            className="truncate text-[13px] font-medium"
          />
        }
        date={formatDate(folder.created_at)}
      />

      <RowColumn width="w-28">Folder</RowColumn>
      <RowColumn width="w-24">—</RowColumn>
      <RowColumn width="w-16">—</RowColumn>
      <RowColumn width="w-20">
        {itemCount} item{itemCount === 1 ? "" : "s"}
      </RowColumn>
      <RowColumn width="w-40">{formatDate(folder.created_at)}</RowColumn>

      <RowMenu label={`${folder.name} actions`}>
        <MenuInfo>
          {itemCount} item{itemCount === 1 ? "" : "s"}
        </MenuInfo>
        <div className="my-1 border-t border-border" />
        <MenuItem onClick={onStartCreating}>+ New Subfolder</MenuItem>
        <MenuItem danger disabled={pending} onClick={handleDelete}>
          Delete Folder
        </MenuItem>
      </RowMenu>
    </div>
  );
}

function FileRow({
  item,
  depth,
  inDeck = false,
  selectionMode,
  selected,
  onToggleSelect,
  router,
}: {
  item: MediaItem;
  depth: number;
  // A page of a PDF: renamed, deleted and put in a playlist like anything
  // else, but with no file of its own to replace and no folder to move to —
  // the deck it belongs to has both.
  inDeck?: boolean;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  router: Router;
}) {
  const [pending, startTransition] = useTransition();
  // Disabled during selection mode so picking files for a playlist and
  // reorganizing folders never compete for the same click-and-drag gesture.
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: item.id,
    disabled: selectionMode,
  });
  // A file row is also a valid drop target, resolving to whichever folder
  // (including root) the file itself lives in — otherwise dropping a
  // dragged item onto another file (rather than precisely onto a folder
  // row) had no droppable to land on at all, and it just snapped back.
  // isOver itself drives no styling here anymore — the group wrapper in
  // TreeLevel highlights the whole folder (or root) a file belongs to.
  const { setNodeRef: setDropRef } = useDroppable({ id: `file-${item.id}` });
  const rowRef = useRef<HTMLDivElement | null>(null);

  function handleDelete() {
    if (!window.confirm(`Delete "${item.name}"? This removes it from any screens or playlists using it.`)) return;
    startTransition(async () => {
      await removeWithAnimation(rowRef.current, () => deleteMediaItem(item.id));
      router.refresh();
    });
  }

  function handleMoveToRoot() {
    startTransition(async () => {
      await moveMediaItem(item.id, null);
      router.refresh();
    });
  }

  return (
    <div
      ref={(node) => {
        setDragRef(node);
        setDropRef(node);
        rowRef.current = node;
      }}
      {...attributes}
      {...listeners}
      onClick={selectionMode ? onToggleSelect : undefined}
      className={cn(
        "flex items-center gap-2.5 border-b border-border px-4 py-2 last:border-0",
        selectionMode ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        selectionMode && selected ? "bg-accent/10 dark:bg-accent/15" : "hover:bg-black/[.02] dark:hover:bg-white/[.03]",
      )}
    >
      <Checkbox visible={selectionMode} state={selected} onChange={onToggleSelect} collapsedClassName="-mr-2.5" />
      <div style={{ width: depth * 20 }} className="shrink-0" />
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[4px] bg-black/[.04] dark:bg-white/[.06]">
        <MediaThumb item={item} />
      </div>

      <RowInfo
        title={
          <RenameableTitle
            id={item.id}
            name={item.name}
            selecting={selectionMode}
            className="truncate text-[13px] font-medium"
          />
        }
        date={formatDate(item.created_at)}
      />

      <RowColumn width="w-28">{kindLabel(item)}</RowColumn>
      <RowColumn width="w-24">{formatResolution(item.width, item.height)}</RowColumn>
      <RowColumn width="w-16">{item.media_type === "video" ? formatDuration(item.duration_seconds) : "—"}</RowColumn>
      <RowColumn width="w-20">{formatBytes(item.size_bytes)}</RowColumn>
      <RowColumn width="w-40">{formatDate(item.created_at)}</RowColumn>

      <RowMenu label={`${item.name} actions`}>
        <MenuInfo>
          {kindLabel(item)}
          {item.media_type !== "page" && <> · {formatResolution(item.width, item.height)}</>}
        </MenuInfo>
        {item.media_type === "video" && <MenuInfo>{formatDuration(item.duration_seconds)}</MenuInfo>}
        {item.media_type !== "page" && <MenuInfo>{formatBytes(item.size_bytes)}</MenuInfo>}
        {(item.folder_id || item.media_type !== "page") && <div className="my-1 border-t border-border" />}
        {item.folder_id && !inDeck && (
          <MenuItem disabled={pending} onClick={handleMoveToRoot}>
            Move to Root
          </MenuItem>
        )}
        {/* Pages are built in — there's no file behind one to replace, and
            deleting one would leave no way to add it back. */}
        {item.media_type !== "page" && (
          <>
            {/* Supabase's own ?download= is what actually saves the file
                under its library name: the file lives on the storage
                domain, so a plain download attribute (different origin)
                would be ignored and the browser would just open it. */}
            <a
              href={`${mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, item.storage_path)}?download=${encodeURIComponent(item.name)}`}
              download={item.name}
              className={MENU_ITEM_CLASS}
            >
              Download
            </a>
            {!inDeck && <ReplaceMediaButton item={item} className={MENU_ITEM_CLASS} />}
            <MenuItem danger disabled={pending} onClick={handleDelete}>
              Delete
            </MenuItem>
          </>
        )}
      </RowMenu>
    </div>
  );
}

function NewFolderRow({
  depth,
  parentId,
  onDone,
  router,
}: {
  depth: number;
  parentId: string | null;
  onDone: () => void;
  router: Router;
}) {
  const [pending, startTransition] = useTransition();

  function attachInput(node: HTMLInputElement | null) {
    node?.focus();
  }

  function submit(name: string) {
    const trimmed = name.trim();
    if (!trimmed) {
      onDone();
      return;
    }
    startTransition(async () => {
      await createFolder(trimmed, parentId);
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="px-4 py-2">
      <input
        ref={attachInput}
        disabled={pending}
        placeholder="Folder name"
        onBlur={(e) => submit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") onDone();
        }}
        style={{ marginLeft: depth * 20 + (parentId === null ? 0 : 20) }}
        className="rounded-[var(--radius-sm)] border border-accent bg-transparent px-2 py-1 text-[13px] outline-none"
      />
    </div>
  );
}

function SortButton({
  label,
  sortKey,
  active,
  dir,
  onClick,
  className,
}: {
  label: string;
  sortKey: SortKey;
  active: SortKey;
  dir: SortDir;
  onClick: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = active === sortKey;
  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "press-ghost inline-flex items-center gap-1 whitespace-nowrap font-medium hover:text-foreground",
        isActive && "text-foreground",
        className,
      )}
    >
      {label}
      {isActive && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}

// A PDF in the library: one row that opens like a folder to show the pages
// it was split into (see 0019_pdf_decks.sql). The pages themselves are
// ordinary media items, so each one below this row behaves exactly like any
// other file — its own duration in a playlist, its own deletion — while
// this row is the original PDF: rename it, move it, download it, replace it
// with a newer version, or delete the lot.
function DeckRow({
  deck,
  depth,
  isExpanded,
  onToggleExpanded,
  selectionMode,
  checkState,
  onToggleSelect,
  router,
}: {
  deck: DeckWithPages;
  depth: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  selectionMode: boolean;
  checkState: "all" | "some" | "none";
  onToggleSelect: () => void;
  router: Router;
}) {
  const [pending, startTransition] = useTransition();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const cover = deck.pages[0];
  const fileName = `${deck.name}.pdf`;

  function handleDelete() {
    if (
      !window.confirm(
        `Delete "${deck.name}" and all ${deck.pages.length} of its pages? They're removed from any screens or playlists using them.`,
      )
    )
      return;
    startTransition(async () => {
      await removeWithAnimation(rowRef.current?.parentElement, () => deleteDeck(deck.id));
      router.refresh();
    });
  }

  function handleMoveToRoot() {
    startTransition(async () => {
      await moveDeck(deck.id, null);
      router.refresh();
    });
  }

  return (
    <div
      ref={rowRef}
      onClick={selectionMode ? onToggleSelect : onToggleExpanded}
      className={cn(
        "flex cursor-pointer items-center gap-2.5 border-b border-border px-4 py-2 last:border-0",
        selectionMode && checkState === "all"
          ? "bg-accent/10 dark:bg-accent/15"
          : "hover:bg-black/[.02] dark:hover:bg-white/[.03]",
      )}
    >
      <Checkbox
        visible={selectionMode}
        state={checkState === "all" ? true : checkState === "some" ? "indeterminate" : false}
        onChange={onToggleSelect}
        collapsedClassName="-mr-2.5"
      />
      <div style={{ width: depth * 20 }} className="shrink-0" />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleExpanded();
        }}
        aria-label={isExpanded ? `Collapse ${deck.name}` : `Expand ${deck.name}`}
        className="press-ghost -m-1 shrink-0 p-1 text-muted"
      >
        <Chevron open={isExpanded} />
      </button>
      {/* The first page stands in for the deck, the way a cover does. */}
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[4px] bg-black/[.04] dark:bg-white/[.06]">
        {cover && <MediaThumb item={cover} />}
      </div>

      <RowInfo
        title={
          <RenameableTitle
            id={deck.id}
            name={deck.name}
            selecting={selectionMode}
            onRename={renameDeck}
            className="truncate text-[13px] font-medium"
          />
        }
        date={formatDate(deck.created_at)}
      />

      <RowColumn width="w-28">PDF</RowColumn>
      <RowColumn width="w-24">{formatResolution(cover?.width ?? null, cover?.height ?? null)}</RowColumn>
      <RowColumn width="w-16">{deck.pages.length} pp.</RowColumn>
      <RowColumn width="w-20">{formatBytes(deck.size_bytes)}</RowColumn>
      <RowColumn width="w-40">{formatDate(deck.created_at)}</RowColumn>

      <RowMenu label={`${deck.name} actions`}>
        <MenuInfo>
          PDF · {deck.pages.length} {deck.pages.length === 1 ? "page" : "pages"}
        </MenuInfo>
        <MenuInfo>{formatBytes(deck.size_bytes)}</MenuInfo>
        <div className="my-1 border-t border-border" />
        {deck.folder_id && (
          <MenuItem disabled={pending} onClick={handleMoveToRoot}>
            Move to Root
          </MenuItem>
        )}
        {/* The original PDF, exactly as it was uploaded — the pages on
            screen are images rendered from it. Same ?download= trick as a
            file's own Download above. */}
        <a
          href={`${mediaPublicUrl(SUPABASE_URL, deck.storage_path)}?download=${encodeURIComponent(fileName)}`}
          download={fileName}
          className={MENU_ITEM_CLASS}
        >
          Download
        </a>
        <ReplaceDeckButton deck={deck} className={MENU_ITEM_CLASS} />
        <MenuItem danger disabled={pending} onClick={handleDelete}>
          Delete
        </MenuItem>
      </RowMenu>
    </div>
  );
}
