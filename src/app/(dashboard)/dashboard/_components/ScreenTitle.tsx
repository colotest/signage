"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { renameScreen } from "@/lib/actions/screens";

// Plain text by default — renaming used to start from pressing the title
// itself, but that's now the wrench menu's "Rename" option instead (see
// ScreenSetupMenu), which flips `editing` on from ScreenTile.
export function ScreenTitle({
  screenId,
  name,
  editing,
  onDoneEditing,
}: {
  screenId: number;
  name: string;
  editing: boolean;
  onDoneEditing: () => void;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Shown immediately on save rather than waiting for router.refresh() to
  // bring the new name back down as a prop — otherwise the title would
  // flash the stale `name` prop first and only jump to the real one later.
  const [displayName, setDisplayName] = useState(name);

  useEffect(() => {
    setDisplayName(name);
  }, [name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function save() {
    const next = inputRef.current?.value.trim() ?? "";
    onDoneEditing();
    if (!next || next === displayName) return;
    setDisplayName(next);
    startTransition(async () => {
      await renameScreen(screenId, next);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        defaultValue={displayName}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") onDoneEditing();
        }}
        className="w-full min-w-0 rounded-[var(--radius-sm)] border border-accent bg-transparent px-2 py-1 text-[17px] font-semibold outline-none"
      />
    );
  }

  return <h3 className="min-w-0 truncate text-[17px] font-semibold">{displayName}</h3>;
}
