"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MediaThumb } from "@/components/MediaThumb";
import { InlineRename } from "@/components/InlineRename";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDuration, formatResolution, kindLabel } from "@/lib/utils/format";
import { createFolder, deleteFolder, renameFolder } from "@/lib/actions/folders";
import { deleteMediaItem } from "@/lib/actions/media";
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

  const { roots, rootFiles } = useMemo(() => buildTree(folders, media), [folders, media]);

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

  function handleExpandAndActivate(id: string) {
    toggleExpanded(id);
    onActivateFolder(id);
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
    <div className={cn("overflow-auto rounded-[var(--radius-lg)] border border-border", className)}>
      <table className="w-full min-w-[760px] border-collapse text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr className="border-b border-border bg-[var(--surface-elevated)] backdrop-blur-xl text-left text-[12px] text-muted">
            <Th label="Name" sortKey="name" active={sortKey} dir={sortDir} onClick={toggleSort} className="pl-4" />
            <Th label="Kind" sortKey="kind" active={sortKey} dir={sortDir} onClick={toggleSort} />
            <Th label="Resolution" sortKey="resolution" active={sortKey} dir={sortDir} onClick={toggleSort} />
            <Th label="Duration" sortKey="duration" active={sortKey} dir={sortDir} onClick={toggleSort} />
            <Th label="Size" sortKey="size" active={sortKey} dir={sortDir} onClick={toggleSort} />
            <Th label="Date Added" sortKey="date" active={sortKey} dir={sortDir} onClick={toggleSort} />
            <th className="w-px" />
          </tr>
        </thead>
        <tbody>
          <TreeLevel
            folders={sortFolders(roots)}
            files={sortFiles(rootFiles)}
            depth={0}
            expanded={expanded}
            onToggleExpanded={handleExpandAndActivate}
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
            <tr>
              <td colSpan={7} className="py-2 pl-4">
                <button type="button" onClick={() => setCreatingIn(null)} className="text-[13px] font-medium text-accent">
                  + New Folder
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function TreeLevel({
  folders,
  files,
  depth,
  expanded,
  onToggleExpanded,
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
  onToggleExpanded: (id: string) => void;
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
          <FragmentRow key={folder.id}>
            <FolderRow
              folder={folder}
              depth={depth}
              isExpanded={isExpanded}
              onToggleExpanded={() => onToggleExpanded(folder.id)}
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
                onToggleExpanded={onToggleExpanded}
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
          </FragmentRow>
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

// A plain array-returning component so React can flatten these into
// sibling <tr>s inside the <tbody> — <tbody> can't have a non-<tr> wrapper.
function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
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

function FolderRow({
  folder,
  depth,
  isExpanded,
  onToggleExpanded,
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
  onToggleExpanded: () => void;
  selectionMode: boolean;
  checkState: "all" | "some" | "none";
  onToggleSelect: () => void;
  onStartCreating: () => void;
  isUploadTarget: boolean;
  router: Router;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    if (!window.confirm(`Delete folder "${folder.name}"? Subfolders are removed too; files inside move to Unsorted.`)) return;
    startTransition(async () => {
      await deleteFolder(folder.id);
      router.refresh();
    });
  }

  return (
    <tr className="group/row border-b border-border last:border-0 hover:bg-black/[.02] dark:hover:bg-white/[.03]">
      <td className="py-2 pl-4 pr-3">
        <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: depth * 20 }}>
          {selectionMode && (
            <Checkbox state={checkState === "some" ? "indeterminate" : checkState === "all"} onChange={onToggleSelect} />
          )}
          <button
            type="button"
            onClick={onToggleExpanded}
            className="shrink-0 text-muted hover:text-foreground"
            aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
          >
            <Chevron open={isExpanded} />
          </button>
          <span className="shrink-0">📁</span>
          <InlineRename
            value={folder.name}
            onSave={(next) => {
              startTransition(async () => {
                await renameFolder(folder.id, next);
                router.refresh();
              });
            }}
            className={cn("font-medium", isUploadTarget && "text-accent")}
          />
        </div>
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted">Folder</td>
      <td className="py-2 pr-3 text-muted">—</td>
      <td className="py-2 pr-3 text-muted">—</td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted">
        {folder.children.length + folder.files.length} item{folder.children.length + folder.files.length === 1 ? "" : "s"}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatDate(folder.created_at)}</td>
      <td className="py-2 pr-4">
        <div className="flex items-center justify-end gap-3 whitespace-nowrap opacity-0 transition-opacity group-hover/row:opacity-100">
          <button type="button" onClick={onStartCreating} className="text-muted hover:text-foreground" title="New subfolder">
            + Folder
          </button>
          <button type="button" disabled={pending} onClick={handleDelete} className="text-danger hover:opacity-70">
            Delete
          </button>
        </div>
      </td>
    </tr>
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

  function handleDelete() {
    if (!window.confirm(`Delete "${item.name}"? This removes it from any screens or playlists using it.`)) return;
    startTransition(async () => {
      await deleteMediaItem(item.id);
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-border last:border-0 hover:bg-black/[.02] dark:hover:bg-white/[.03]">
      <td className="py-2 pl-4 pr-3">
        <div className="flex min-w-0 items-center gap-2.5" style={{ paddingLeft: depth * 20 + 18 }}>
          {selectionMode && <Checkbox state={selected} onChange={onToggleSelect} />}
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[4px] bg-black/[.04] dark:bg-white/[.06]">
            <MediaThumb item={item} />
          </div>
          <RenameableTitle id={item.id} name={item.name} className="font-medium" />
        </div>
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted">{kindLabel(item)}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatResolution(item.width, item.height)}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted">
        {item.media_type === "video" ? formatDuration(item.duration_seconds) : "—"}
      </td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatBytes(item.size_bytes)}</td>
      <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatDate(item.created_at)}</td>
      <td className="py-2 pr-4">
        <div className="flex items-center justify-end gap-3 whitespace-nowrap">
          <ReplaceMediaButton item={item} />
          <button type="button" disabled={pending} onClick={handleDelete} className="text-danger hover:opacity-70">
            Delete
          </button>
        </div>
      </td>
    </tr>
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
    <tr>
      <td colSpan={7} className="py-2 pl-4">
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
      </td>
    </tr>
  );
}

function Th({
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
    <th className={cn("py-2 pr-3 font-medium", className)}>
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground",
          isActive && "text-foreground",
        )}
      >
        {label}
        {isActive && <span className="text-[10px]">{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );
}
