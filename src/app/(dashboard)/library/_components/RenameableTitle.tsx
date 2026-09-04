"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";
import { renameMediaItem } from "@/lib/actions/media";
import { cn } from "@/lib/utils/cn";

// The extension is kept out of the editable part entirely (Finder does the
// same) — a dotfile-style name with no real extension (idx <= 0) is treated
// as all base, nothing to protect.
function splitExtension(name: string): { base: string; ext: string } {
  const idx = name.lastIndexOf(".");
  if (idx <= 0) return { base: name, ext: "" };
  return { base: name.slice(0, idx), ext: name.slice(idx) };
}

export function RenameableTitle({ id, name, className }: { id: string; name: string; className?: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // Shown immediately on commit rather than waiting for router.refresh() to
  // bring the new name back down as a prop — otherwise display mode would
  // flash the stale `name` prop first and only jump to the real one later.
  const [displayName, setDisplayName] = useState(name);

  useEffect(() => {
    setDisplayName(name);
  }, [name]);

  const { base, ext } = splitExtension(displayName);

  function startEditing() {
    setEditing(true);
  }

  // A ref callback fires the moment the input is actually in the DOM —
  // unlike requestAnimationFrame (which waits a whole extra paint), this
  // can't lose a keystroke typed right after the double-click that opened it.
  function attachInput(node: HTMLInputElement | null) {
    inputRef.current = node;
    node?.focus();
    node?.select();
  }

  function commit() {
    const newBase = inputRef.current?.value.trim();
    setEditing(false);
    if (!newBase || newBase === base) return;
    const nextName = `${newBase}${ext}`;
    setDisplayName(nextName);
    startTransition(async () => {
      await renameMediaItem(id, nextName);
      router.refresh();
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      inputRef.current?.blur(); // commit() runs from onBlur
    } else if (e.key === "Escape") {
      e.preventDefault();
      // Unmounting a focused input doesn't fire blur, so this skips commit().
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <span className="inline-flex min-w-0 items-baseline">
        <input
          ref={attachInput}
          defaultValue={base}
          onBlur={commit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "min-w-0 flex-1 rounded-[3px] border border-accent bg-transparent px-1 -mx-1 outline-none",
            className,
          )}
        />
        {ext && <span className={className}>{ext}</span>}
      </span>
    );
  }

  return (
    <span
      // Stopped on every click, not just the double-click that starts
      // editing — a row this sits in may treat its own click as "select
      // this row," and the title needs to opt out of that entirely rather
      // than translate into two of those (a double-click fires two plain
      // click events before the dblclick itself).
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEditing();
      }}
      title="Double-click to rename"
      className={cn("truncate", className)}
    >
      {displayName}
    </span>
  );
}
