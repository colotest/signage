"use client";

import { useMemo, useState } from "react";
import type { Folder, MediaItem } from "@/types/domain";
import { FolderSidebar, type FolderFilter } from "./FolderSidebar";
import { MediaList } from "./MediaList";
import { UploadDropzone } from "./UploadDropzone";

export function LibraryView({ folders, media }: { folders: Folder[]; media: MediaItem[] }) {
  const [selected, setSelected] = useState<FolderFilter>("all");

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
        <div className="flex items-center justify-between">
          <h1 className="text-[28px] font-semibold tracking-tight">Media</h1>
          <UploadDropzone folderId={uploadFolderId} />
        </div>

        <MediaList items={visibleMedia} />
      </div>
    </div>
  );
}
