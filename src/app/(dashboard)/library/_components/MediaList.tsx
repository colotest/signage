"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { deleteMediaItem } from "@/lib/actions/media";
import { cn } from "@/lib/utils/cn";
import { formatBytes, formatDuration, formatResolution, kindLabel } from "@/lib/utils/format";
import type { MediaItem } from "@/types/domain";
import { MediaThumb } from "@/components/MediaThumb";
import { ReplaceMediaButton } from "./ReplaceMediaButton";
import type { ViewMode } from "./ViewToggle";

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

export function MediaList({ items, view }: { items: MediaItem[]; view: ViewMode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Matches the server's own default order (newest first) until the user
  // clicks a column header.
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [items, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleDelete(item: MediaItem) {
    if (!window.confirm(`Delete "${item.name}"? This removes it from any screens using it.`)) return;
    startTransition(async () => {
      await deleteMediaItem(item.id);
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border py-20 text-center">
        <p className="text-[17px] font-medium">No files here</p>
        <p className="text-sm text-muted">Upload images, videos, or PDFs to get started.</p>
      </div>
    );
  }

  if (view === "list") {
    return (
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border bg-black/[.02] dark:bg-white/[.03] text-left text-[12px] text-muted">
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
            {sorted.map((item) => (
              <tr
                key={item.id}
                className="border-b border-border last:border-0 hover:bg-black/[.02] dark:hover:bg-white/[.03]"
              >
                <td className="py-2 pl-4 pr-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded-[4px] bg-black/[.04] dark:bg-white/[.06]">
                      <MediaThumb item={item} />
                    </div>
                    <span className="truncate font-medium">{item.name}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-muted">{kindLabel(item)}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-muted">
                  {formatResolution(item.width, item.height)}
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-muted">
                  {item.media_type === "video" ? formatDuration(item.duration_seconds) : "—"}
                </td>
                <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatBytes(item.size_bytes)}</td>
                <td className="whitespace-nowrap py-2 pr-3 text-muted">{formatDate(item.created_at)}</td>
                <td className="py-2 pr-4">
                  <div className="flex items-center justify-end gap-3 whitespace-nowrap">
                    <ReplaceMediaButton item={item} />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleDelete(item)}
                      className="text-danger hover:opacity-70"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
      {sorted.map((item) => (
        <Card key={item.id} className="flex flex-col overflow-hidden">
          <div className="aspect-video bg-black/[.04] dark:bg-white/[.06]">
            <MediaThumb item={item} />
          </div>
          <div className="flex flex-col gap-1 p-3">
            <p className="truncate text-[14px] font-medium">{item.name}</p>
            <p className="truncate text-[12px] text-muted">
              {kindLabel(item)}
              {item.media_type === "video" && item.duration_seconds != null
                ? ` · ${formatDuration(item.duration_seconds)}`
                : ""}
              {item.width && item.height ? ` · ${formatResolution(item.width, item.height)}` : ""}
            </p>
            <p className="text-[12px] text-muted">
              {formatBytes(item.size_bytes)} ·{" "}
              {new Date(item.created_at).toLocaleDateString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </p>
            <div className="mt-1 flex items-center gap-3">
              <ReplaceMediaButton item={item} />
              <button
                type="button"
                disabled={pending}
                onClick={() => handleDelete(item)}
                className="self-start text-[13px] text-danger hover:opacity-70"
              >
                Delete
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
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
