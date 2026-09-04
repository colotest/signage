"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/cn";

// Same double-click-to-edit mechanic as media's RenameableTitle, minus the
// filename-extension split that doesn't apply to a folder or playlist name.
export function InlineRename({
  value,
  onSave,
  className,
  startInEditMode = false,
}: {
  value: string;
  onSave: (next: string) => void;
  className?: string;
  // A freshly-created folder/playlist opens straight into rename mode
  // instead of appearing with a placeholder name the user has to notice
  // and then double-click.
  startInEditMode?: boolean;
}) {
  const [editing, setEditing] = useState(startInEditMode);
  // Shown the moment a rename commits rather than waiting for onSave's
  // server round trip to bring the new name back down as a prop — without
  // this, switching back to display mode would flash the stale `value`
  // prop first and only jump to the real name once that resolves.
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    setDisplayValue(value);
  }, [value]);

  function attachInput(node: HTMLInputElement | null) {
    node?.focus();
    node?.select();
  }

  function commit(next: string | undefined) {
    setEditing(false);
    const trimmed = next?.trim();
    if (!trimmed || trimmed === displayValue) return;
    setDisplayValue(trimmed);
    onSave(trimmed);
  }

  if (editing) {
    return (
      <input
        ref={attachInput}
        defaultValue={displayValue}
        onBlur={(e) => commit(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "min-w-0 rounded-[3px] border border-accent bg-transparent px-1 -mx-1 outline-none",
          className,
        )}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      title="Double-click to rename"
      className={cn("truncate", className)}
    >
      {displayValue}
    </span>
  );
}
