"use client";

import { useEffect, useMemo, useState } from "react";
import type { Folder, MediaItem } from "@/types/domain";
import { FolderSidebar, type FolderFilter } from "./FolderSidebar";
import { MediaList } from "./MediaList";
import { UploadDropzone } from "./UploadDropzone";
import { ViewToggle, type ViewMode } from "./ViewToggle";

const VIEW_MODE_KEY = "colo-cloud:library-view-mode";

export function LibraryView({ folders, media }: { folders: Folder[]; media: MediaItem[] }) {
  const [selected, setSelected] = useState<FolderFilter>("all");
  // Grid is the fixed value for the server-rendered/first-hydration pass —
  // localStorage isn't available then. The effect below swaps in whatever
  // was last chosen, same one-frame-late tradeoff as any browser-only
  // preference with no server-persisted source of truth.
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    const stored = localStorage.getItem(VIEW_MODE_KEY);
    if (stored === "list" || stored === "grid") setView(stored);
  }, []);

  function handleViewChange(mode: ViewMode) {
    setView(mode);
    localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  const visibleMedia = useMemo(() => {
    if (selected === "all") return media;
    if (selected === "unsorted") return media.filter((m) => m.folder_id === null);
    return media.filter((m) => m.folder_id === selected);
  }, [media, selected]);

  const uploadFolderId = selected === "all" || selected === "unsorted" ? null : selected;

  return (
    <div className="flex h-full flex-col gap-5 lg:flex-row">
      <FolderSidebar folders={folders} selected={selected} onSelect={setSelected} />

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-[28px] font-semibold tracking-tight">Media</h1>
          <div className="flex items-center gap-3">
            <ViewToggle mode={view} onChange={handleViewChange} />
            <UploadDropzone folderId={uploadFolderId} />
          </div>
        </div>

        <MediaList items={visibleMedia} view={view} />
      </div>
    </div>
  );
}
