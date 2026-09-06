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
import type { Folder, MediaItem } from "@/types/domain";
import { RenameableTitle } from "./RenameableTitle";
import { ReplaceMediaButton } from "./ReplaceMediaButton";

type Router = ReturnType<typeof useRouter>;
type FolderNode = Folder & { children: FolderNode[]; files: MediaItem[] };

function buildTree(folders: Folder[], media: MediaItem[]) {
  const nodeById = new Map<string, FolderNode>();
  for (const f of folders) nodeById.set(f.id, { ...f, children: [], files: [] });
  const roots: FolderNode[] = [];
  for (const f of folders) {
    const node = nodeById.get(f.id)!;
    const parent = f.parent_id ? nodeById.get(f.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const rootFiles: MediaItem[] = [];
  for (const m of media) {
    const parent = m.folder_id ? nodeById.get(m.folder_id) : undefined;
    if (parent) parent.files.push(m);
    else rootFiles.push(m);
  }
  return { roots, rootFiles, nodeById };
}

function collectMediaIds(node: FolderNode): string[] {
  return [...node.files.map((f) => f.id), ...node.children.flatMap(collectMediaIds)];
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
  onUploadFiles: (files: FileList) => void;
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
    if (!e.dataTransfer.types.includes("Files")) return;
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
    if (e.dataTransfer.files.length > 0) onUploadFiles(e.dataTransfer.files);
  }

  const { roots, rootFiles } = useMemo(() => buildTree(folders, media), [folders, media]);

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

  // Expanding a folder makes it the upload target — collapsing one hands
  // that back to its parent (or Root) rather than leaving a now-collapsed,
  // no-longer-visible folder as the target.
  function handleFolderRowClick(folder: FolderNode) {
    const wasExpanded = expanded.has(folder.id);
    toggleExpanded(folder.id);
    onActivateFolder(wasExpanded ? folder.parent_id : folder.id);
  }

  if (roots.length === 0 && rootFiles.length === 0) {
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
          popping in and out below it. sm:pt-10 cancels that shift back out
          once the sort bar becomes visible, so its own position on desktop
          is unaffected. -mb-5 does the same at the bottom edge (a smaller
          20px, not needing any sm: compensation since nothing else sits
          below this to protect) so the bottom fade gets a little more room
          too, for proportion against the top. */}
      <div
        onDragEnter={handleNativeDragEnter}
        onDragOver={handleNativeDragOver}
        onDragLeave={handleNativeDragLeave}
        onDrop={handleNativeDrop}
        className={cn("relative -mx-5 -mt-10 -mb-5 flex min-h-0 flex-col sm:pt-10", className)}
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

            scroll-fade-y itself lives one level further out, on the div
            wrapping BOTH the scrolling content and the blur — masking only
            the scrolling div left the blur unmasked, so it stayed at full
            strength (the strongest layers are the ones nearest the true
            edge) right up to the edge even where the color fade had
            already faded the content itself to invisible. Sharing one mask
            over both means the blur fades away in lockstep with the
            content instead of outliving it. The sort bar stays *outside*
            this masked div (siblings only share it if they're inside it) so
            it stays fully opaque regardless. */}
        <div className="relative min-h-0 flex-1">
          <div className="scroll-fade-y absolute inset-0">
            <div
              style={{ WebkitTouchCallout: "none" }}
              className="no-scrollbar absolute inset-0 select-none overflow-x-hidden overflow-y-auto pt-10 pb-10"
            >
              <div>
                <TreeLevel
                  folders={sortFolders(roots)}
                  files={sortFiles(rootFiles)}
                  depth={0}
                  isRoot
                  expanded={expanded}
                  onFolderRowClick={handleFolderRowClick}
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
                      className="text-[13px] font-medium text-accent"
                    >
                      + New Folder
                    </button>
                  </div>
                )}
              </div>
            </div>
            <ProgressiveBlurEdge side="top" />
            <ProgressiveBlurEdge side="bottom" />
          </div>
          {/* Desktop-only sort bar — absolutely positioned so it overlays
              the blur/fade zone instead of taking its own row above it,
              which used to leave a visible gap (its own height, plus the
              list's separate pt-10 fade reservation below that) between it
              and the first real row. It already has an opaque/blurred
              background, so sitting on top of the fade zone reads fine.
              Hidden on mobile — the mobile equivalent is the round "⋯" sort
              button next to the Upload pill (LibraryView). */}
          <div className="hidden absolute inset-x-0 top-0 z-10 items-center gap-2 border-b border-border bg-[var(--surface-elevated)] px-4 py-2 text-[12px] text-muted backdrop-blur-xl sm:flex">
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
  depth,
  isRoot,
  expanded,
  onFolderRowClick,
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
  dropTargetFolderId,
  router,
}: {
  folders: FolderNode[];
  files: MediaItem[];
  depth: number;
  isRoot?: boolean;
  expanded: Set<string>;
  onFolderRowClick: (folder: FolderNode) => void;
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
              onExpandAndActivate={() => onFolderRowClick(folder)}
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
                depth={depth + 1}
                expanded={expanded}
                onFolderRowClick={onFolderRowClick}
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
function RowInfo({ title, date }: { title: React.ReactNode; date: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
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

function Checkbox({
  state,
  onChange,
}: {
  state: boolean | "indeterminate";
  onChange: () => void;
}) {
  return (
    <input
      ref={(node) => {
        if (node) node.indeterminate = state === "indeterminate";
      }}
      type="checkbox"
      checked={state === true}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-4 w-4 shrink-0 accent-accent"
    />
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
        className="shrink-0 cursor-pointer rounded-full p-1.5 text-muted transition-colors hover:bg-black/[.04] hover:text-foreground dark:hover:bg-white/[.06]"
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
        "block w-full cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] hover:bg-black/[.04] disabled:opacity-50 dark:hover:bg-white/[.06]",
        danger ? "text-danger" : "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export const MENU_ITEM_CLASS =
  "block w-full cursor-pointer rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] text-foreground hover:bg-black/[.04] dark:hover:bg-white/[.06]";

function FolderRow({
  folder,
  depth,
  isExpanded,
  onExpandAndActivate,
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
  onExpandAndActivate: () => void;
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

  function handleDelete() {
    if (!window.confirm(`Delete folder "${folder.name}"? Subfolders are removed too; files inside move to Unsorted.`)) return;
    startTransition(async () => {
      await deleteFolder(folder.id);
      router.refresh();
    });
  }

  // In selection mode the row's job is picking files for a playlist, so a
  // click anywhere on it toggles selection instead — the chevron is carved
  // out separately (see its own onClick) so folders stay browsable while
  // selecting without that also touching selection or the upload target.
  function handleRowClick() {
    if (selectionMode) onToggleSelect();
    else onExpandAndActivate();
  }

  function handleChevronClick(e: React.MouseEvent) {
    e.stopPropagation();
    onExpandAndActivate();
  }

  const isHighlighted = selectionMode ? checkState === "all" : isUploadTarget;
  const itemCount = folder.children.length + folder.files.length;

  return (
    <div
      ref={setNodeRef}
      onClick={handleRowClick}
      className={cn(
        "flex cursor-pointer items-center gap-2 border-b border-border px-4 py-2 last:border-0",
        isHighlighted ? "bg-accent/10 dark:bg-accent/15" : "hover:bg-black/[.02] dark:hover:bg-white/[.03]",
      )}
    >
      {selectionMode && (
        <Checkbox state={checkState === "some" ? "indeterminate" : checkState === "all"} onChange={onToggleSelect} />
      )}
      <div style={{ width: depth * 20 }} className="shrink-0" />
      <button
        type="button"
        onClick={handleChevronClick}
        className="shrink-0 text-muted hover:text-foreground"
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
  selectionMode,
  selected,
  onToggleSelect,
  router,
}: {
  item: MediaItem;
  depth: number;
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

  function handleDelete() {
    if (!window.confirm(`Delete "${item.name}"? This removes it from any screens or playlists using it.`)) return;
    startTransition(async () => {
      await deleteMediaItem(item.id);
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
      {selectionMode && <Checkbox state={selected} onChange={onToggleSelect} />}
      <div style={{ width: depth * 20 }} className="shrink-0" />
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[4px] bg-black/[.04] dark:bg-white/[.06]">
        <MediaThumb item={item} />
      </div>

      <RowInfo
        title={
          <RenameableTitle
            id={item.id}
            name={item.name}
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
          {kindLabel(item)} · {formatResolution(item.width, item.height)}
        </MenuInfo>
        {item.media_type === "video" && <MenuInfo>{formatDuration(item.duration_seconds)}</MenuInfo>}
        <MenuInfo>{formatBytes(item.size_bytes)}</MenuInfo>
        <div className="my-1 border-t border-border" />
        {item.folder_id && (
          <MenuItem disabled={pending} onClick={handleMoveToRoot}>
            Move to Root
          </MenuItem>
        )}
        <ReplaceMediaButton item={item} className={MENU_ITEM_CLASS} />
        <MenuItem danger disabled={pending} onClick={handleDelete}>
          Delete
        </MenuItem>
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
        "inline-flex items-center gap-1 whitespace-nowrap font-medium hover:text-foreground",
        isActive && "text-foreground",
        className,
      )}
    >
      {label}
      {isActive && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
    </button>
  );
}
