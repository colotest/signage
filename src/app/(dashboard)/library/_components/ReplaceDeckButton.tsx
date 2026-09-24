"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { createDeckUploadUrls, finalizeDeckReplace } from "@/lib/actions/decks";
import { renderPdfPages } from "@/lib/media/renderPdfPages";
import { createBrowserClient } from "@/lib/supabase/client";
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
      setStatus("Reading…");
      const pages = await renderPdfPages(file, (done, total) => setStatus(`Page ${done}/${total}`));
      const { original, pages: slots } = await createDeckUploadUrls({ pageCount: pages.length });

      const supabase = createBrowserClient();
      setStatus("Uploading…");
      const { error: originalError } = await supabase.storage
        .from("media")
        .uploadToSignedUrl(original.storagePath, original.token, file);
      if (originalError) throw originalError;

      await Promise.all(
        pages.map(async (page, i) => {
          const { error } = await supabase.storage
            .from("media")
            .uploadToSignedUrl(slots[i].storagePath, slots[i].token, page.blob);
          if (error) throw error;
        }),
      );

      await finalizeDeckReplace({
        deckId: deck.id,
        storagePath: original.storagePath,
        sizeBytes: file.size,
        pages: pages.map((page, i) => ({
          storagePath: slots[i].storagePath,
          width: page.width,
          height: page.height,
          sizeBytes: page.blob.size,
        })),
      });
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
