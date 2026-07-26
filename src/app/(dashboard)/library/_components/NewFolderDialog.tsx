"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { createFolder } from "@/lib/actions/folders";

export function NewFolderDialog({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function submit() {
    const name = inputRef.current?.value ?? "";
    if (!name.trim()) {
      onDone();
      return;
    }
    startTransition(async () => {
      await createFolder(name);
      router.refresh();
      onDone();
    });
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      disabled={pending}
      placeholder="Folder name"
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") onDone();
      }}
      className="shrink-0 rounded-[var(--radius-sm)] border border-accent bg-transparent px-3 py-2 text-[15px] outline-none"
    />
  );
}
