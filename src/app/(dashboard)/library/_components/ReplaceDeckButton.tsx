"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { replaceDeckFile } from "@/lib/media/replaceFile";
import type { DeckWithPages } from "@/types/domain";

// Swapping a newer PDF in under the same deck. Page 1 stays page 1 — the
// same library item, repointed at the new render — so a playlist showing it
// keeps showing it, in its place, with its own duration. A shorter PDF
// drops the pages past its end; a longer one leaves the extra pages in the
// deck for you to place yourself.
export function ReplaceDeckButton({ deck, className }: { deck: DeckWithPages; className?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;

    const proceed = window.confirm(
      `Replace "${deck.name}" with "${file.name}"? Its pages are updated in place, so playlists using them keep working. Any pages beyond the new PDF's length are removed.`,
    );
    if (!proceed) {
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    try {
      await replaceDeckFile(file, deck.id, (progress) =>
        setStatus(
          progress.phase === "reading"
            ? "Reading…"
            : progress.phase === "rendering"
              ? `Page ${progress.done}/${progress.total}`
              : "Uploading…",
        ),
      );
      router.refresh();
    } catch (err) {
      console.error("Replace failed", deck.name, err);
      alert(`Failed to replace "${deck.name}": ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setStatus(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => handleFile(e.target.files)}
      />
      <button
        type="button"
        disabled={status !== null}
        // Kept from reaching the row menu this sits in, which closes on any
        // click inside it — that would unmount this button and the hidden
        // input with it while the file dialog is still open, and picking a
        // file would then fire a change event nothing is listening to.
        onClick={(e) => {
          e.stopPropagation();
          inputRef.current?.click();
        }}
        className={className ?? "press-ghost self-start text-[13px] text-muted hover:opacity-70"}
      >
        {status ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner className="inline h-3.5 w-3.5" />
            {status}
          </span>
        ) : (
          "Replace"
        )}
      </button>
    </>
  );
}
