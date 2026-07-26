"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils/cn";
import { deleteFolder } from "@/lib/actions/folders";
import type { Folder } from "@/types/domain";
import { NewFolderDialog } from "./NewFolderDialog";

export type FolderFilter = "all" | "unsorted" | string;

export function FolderSidebar({
  folders,
  selected,
  onSelect,
}: {
  folders: Folder[];
  selected: FolderFilter;
  onSelect: (filter: FolderFilter) => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);

  function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete folder "${name}"? Files move to Unsorted.`)) return;
    startTransition(async () => {
      if (selected === id) onSelect("all");
      await deleteFolder(id);
      router.refresh();
    });
  }

  return (
    <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-visible">
      <SidebarItem label="All Files" active={selected === "all"} onClick={() => onSelect("all")} />
      <SidebarItem label="Unsorted" active={selected === "unsorted"} onClick={() => onSelect("unsorted")} />

      <div className="my-1 hidden h-px bg-border lg:block" />

      {folders.map((folder) => (
        <div key={folder.id} className="group flex items-center gap-1">
          <SidebarItem
            label={folder.name}
            active={selected === folder.id}
            onClick={() => onSelect(folder.id)}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => handleDelete(folder.id, folder.name)}
            className="hidden shrink-0 px-2 text-[13px] text-danger group-hover:block"
            title="Delete folder"
          >
            ✕
          </button>
        </div>
      ))}

      {adding ? (
        <NewFolderDialog onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="shrink-0 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[15px] text-accent"
        >
          + New Folder
        </button>
      )}
    </nav>
  );
}

function SidebarItem({
  label,
  active,
  onClick,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 truncate rounded-[var(--radius-sm)] px-3 py-2 text-left text-[15px] transition-colors",
        active
          ? "bg-accent/15 text-accent font-medium"
          : "text-foreground/80 hover:bg-black/[.04] dark:hover:bg-white/[.06]",
        className,
      )}
    >
      {label}
    </button>
  );
}
