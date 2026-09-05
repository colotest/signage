"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { MediaThumb } from "@/components/MediaThumb";
import { InlineRename } from "@/components/InlineRename";
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

// useDroppable only resolves the *real* DndContext when called from a
// component rendered as a child of <DndContext> — calling it directly in
// FileTree (the component that creates that element) silently binds to the
// library's no-op default context instead, so this needs to be its own
// component rendered inside the JSX tree, not a hook call in FileTree itself.
function RootDropZone({ draggingId }: { draggingId: string | null }) {
  const { setNodeRef, isOver } = useDroppable({ id: "folder-root" });
  return (
    <div
      ref={setNodeRef}
      title="Drag a file here to move it to Root"
      // A plain CSS class for -webkit-touch-callout gets its declaration
      // silently stripped by the build's CSS minifier (lightningcss treats
      // the non-standard vendor property as invalid) — inline style bypasses
      // that pipeline.
      style={{ WebkitTouchCallout: "none" }}
      className={cn(
        "flex w-full shrink-0 select-none items-center gap-1.5 rounded-[var(--radius-sm)] border px-3 py-1.5 text-[12px] font-medium transition-colors",
        isOver
          ? "border-accent bg-accent/25 text-foreground"
          : draggingId
            ? "border-accent border-dashed text-accent"
            : "border-border text-muted",
      )}
    >
      📁 Root
    </div>
  );
}

function collectMediaIds(node: FolderNode): string[] {
  return [...node.files.map((f) => f.id), ...node.children.flatMap(collectMediaIds)];
}

type SortKey = "name" | "kind" | "resolution" | "duration" | "size" | "date";
type SortDir = "asc" | "desc";

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
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [creatingIn, setCreatingIn] = useState<string | null | undefined>(undefined);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Mouse picks up on a small drag (immediate, like any desktop drag); touch
  // instead waits out a held press before engaging — a plain touchstart (as
  // opposed to one that's about to become a scroll) doesn't move much within
  // that window, so this is what stops a scroll's initial touch from being
  // misread as a pickup.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  // Optimistic mirror of `media` — dragging a file onto a folder moves it in
  // the tree immediately, rather than waiting for router.refresh() to bring
  // the new folder_id back down as a prop.
  const [localMedia, setLocalMedia] = useState(media);
  useEffect(() => {
    setLocalMedia(media);
  }, [media]);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const { roots, rootFiles } = useMemo(() => buildTree(folders, localMedia), [folders, localMedia]);
  const mediaById = useMemo(() => new Map(localMedia.map((m) => [m.id, m])), [localMedia]);
  const draggingItem = draggingId ? (mediaById.get(draggingId) ?? null) : null;

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setDraggingId(null);
    if (!over) return;

    const mediaId = String(active.id);
    const overId = String(over.id);
    const targetFolderId =
      overId === "folder-root" ? null : overId.startsWith("folder-") ? overId.slice("folder-".length) : undefined;
    if (targetFolderId === undefined) return;

    const item = mediaById.get(mediaId);
    if (!item || item.folder_id === targetFolderId) return;

    setLocalMedia((current) => current.map((m) => (m.id === mediaId ? { ...m, folder_id: targetFolderId } : m)));
    moveMediaItem(mediaId, targetFolderId);
    router.refresh();
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

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
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-16 text-center",
          className,
        )}
      >
        <p className="text-[17px] font-medium">No files here</p>
        <p className="text-sm text-muted">Upload images, videos, or PDFs, or create a folder to get started.</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      <div className={cn("flex min-h-0 flex-col gap-2", className)}>
        <RootDropZone draggingId={draggingId} />

        {/* overflow-x-hidden (not scroll) is the point — file details and
            row actions live behind the "⋯" menu precisely so a narrow row
            never needs to scroll sideways to reach them. */}
        <div
          style={{ WebkitTouchCallout: "none" }}
          className="min-h-0 flex-1 select-none overflow-x-hidden overflow-y-auto rounded-[var(--radius-lg)] border border-border"
        >
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-[var(--surface-elevated)] px-4 py-2 text-[12px] text-muted backdrop-blur-xl">
            <SortButton label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={toggleSort} />
            <SortButton
              label="Date Added"
              sortKey="date"
              active={sortKey}
              dir={sortDir}
              onClick={toggleSort}
              className="ml-auto mr-9"
            />
          </div>
          <div>
            <TreeLevel
              folders={sortFolders(roots)}
              files={sortFiles(rootFiles)}
              depth={0}
              expanded={expanded}
              onFolderRowClick={handleFolderRowClick}
              creatingIn={creatingIn}
              onStartCreating={(id) => {
                setCreatingIn(id);
                if (id) setExpanded((c) => new Set(c).add(id));
              }}
              onDoneCreating={() => setCreatingIn(undefined)}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleMedia={onToggleMedia}
              onToggleFolderIds={onToggleFolderIds}
              uploadTargetId={uploadTargetId}
              sortFiles={sortFiles}
              sortFolders={sortFolders}
              router={router}
            />
            {creatingIn === null ? (
              <NewFolderRow depth={0} parentId={null} onDone={() => setCreatingIn(undefined)} router={router} />
            ) : (
              <div className="px-4 py-2">
                <button type="button" onClick={() => setCreatingIn(null)} className="text-[13px] font-medium text-accent">
                  + New Folder
                </button>
              </div>
            )}
          </div>
        </div>
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

function TreeLevel({
  folders,
  files,
  depth,
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
  router,
}: {
  folders: FolderNode[];
  files: MediaItem[];
  depth: number;
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
  router: Router;
}) {
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
          <div key={folder.id}>
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
                router={router}
              />
            )}
            {isExpanded && creatingIn === folder.id && (
              <NewFolderRow depth={depth + 1} parentId={folder.id} onDone={onDoneCreating} router={router} />
            )}
          </div>
        );
      })}

      {files.map((item) => (
        <FileRow
          key={item.id}
          item={item}
          depth={depth}
          selectionMode={selectionMode}
          selected={selectedIds.has(item.id)}
          onToggleSelect={() => onToggleMedia(item.id)}
          router={router}
        />
      ))}
    </>
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

// The title+date pair reflows based on actual content, not a guessed
// breakpoint: flex-wrap naturally drops the date to its own line the
// moment the title's *full* text no longer fits alongside it (the title
// keeps its content-based minimum size for this — see its `flex-auto` +
// unset min-width below — so it's never squeezed into truncating early
// just to keep the date on the same line). Only once the title alone
// still doesn't fit its own line does `truncate` (which needs min-w-0,
// applied directly on the title) actually clip it with "…".
// A ResizeObserver watches for the resulting wrap (comparing the title's
// and date's positions) purely to shrink the date's font once it lands
// on its own line — CSS has no selector for "did this item wrap".
function RowInfo({ title, date }: { title: React.ReactNode; date: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [stacked, setStacked] = useState(false);

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    function measure() {
      const [titleEl, dateEl] = row!.children;
      if (!titleEl || !dateEl) return;
      setStacked(dateEl.getBoundingClientRect().top > titleEl.getBoundingClientRect().top + 1);
    }

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-w-0 flex-1">
      <div ref={rowRef} className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        {title}
        <span className={cn("truncate text-muted", stacked ? "text-[10px]" : "text-[12px]")}>{date}</span>
      </div>
    </div>
  );
}

function ThreeDotIcon({ className }: { className?: string }) {
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

const MENU_ITEM_CLASS =
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
  const { setNodeRef, isOver } = useDroppable({ id: `folder-${folder.id}` });

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
        isOver
          ? "bg-accent/25"
          : isHighlighted
            ? "bg-accent/10 dark:bg-accent/15"
            : "hover:bg-black/[.02] dark:hover:bg-white/[.03]",
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
            className="min-w-0 flex-auto truncate text-[13px] font-medium"
          />
        }
        date={formatDate(folder.created_at)}
      />

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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled: selectionMode });

  function handleDelete() {
    if (!window.confirm(`Delete "${item.name}"? This removes it from any screens or playlists using it.`)) return;
    startTransition(async () => {
      await deleteMediaItem(item.id);
      router.refresh();
    });
  }

  return (
    <div
      ref={setNodeRef}
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
            className="min-w-0 flex-auto truncate text-[13px] font-medium"
          />
        }
        date={formatDate(item.created_at)}
      />

      <RowMenu label={`${item.name} actions`}>
        <MenuInfo>
          {kindLabel(item)} · {formatResolution(item.width, item.height)}
        </MenuInfo>
        {item.media_type === "video" && <MenuInfo>{formatDuration(item.duration_seconds)}</MenuInfo>}
        <MenuInfo>{formatBytes(item.size_bytes)}</MenuInfo>
        <div className="my-1 border-t border-border" />
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
