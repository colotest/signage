"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { renameScreen } from "@/lib/actions/screens";

export function RenameScreenDialog({
  screenId,
  name,
}: {
  screenId: number;
  name: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function save() {
    const next = inputRef.current?.value ?? "";
    setEditing(false);
    if (!next.trim() || next === name) return;
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
        defaultValue={name}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-full rounded-[var(--radius-sm)] border border-accent bg-transparent px-2 py-1 text-[17px] font-semibold outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      disabled={pending}
      className="truncate text-left text-[17px] font-semibold hover:opacity-70"
      title="Rename screen"
    >
      {name}
    </button>
  );
}
