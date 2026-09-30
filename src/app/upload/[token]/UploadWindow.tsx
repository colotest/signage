"use client";

import { useMemo, useRef, useState } from "react";
import { useMediaUpload, type UploadActions } from "@/app/(dashboard)/library/_components/useMediaUpload";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  createLinkDeckUploadUrls,
  createLinkUploadUrl,
  finalizeLinkDeckUpload,
  finalizeLinkMediaUpload,
} from "@/lib/actions/uploadLinks";
import { ACCEPT_ATTRIBUTE, ACCEPTED_TYPES, MAX_UPLOAD_BYTES, rejectionReason } from "@/lib/uploads/limits";
import { cn } from "@/lib/utils/cn";
import { formatBytes } from "@/lib/utils/format";

export type UploadedFile = {
  id: string;
  name: string;
  kind: string;
  icon: "image" | "video" | "pdf";
  sizeBytes: number | null;
  createdAt: string;
};

const ICONS: Record<UploadedFile["icon"], string> = { image: "🖼️", video: "🎬", pdf: "📄" };

export function UploadWindow({ token, folderName, files }: { token: string; folderName: string; files: UploadedFile[] }) {
  // The same pipeline as the Library's own uploads, run on actions bound to
  // this link — they pick the folder from the token, so the folder id the
  // hook passes along is never used.
  const actions = useMemo<UploadActions>(
    () => ({
      createUploadUrl: (input) => createLinkUploadUrl(token, input),
      finalizeMediaUpload: (input) => finalizeLinkMediaUpload(token, input),
      createDeckUploadUrls: (input) => createLinkDeckUploadUrls(token, input),
      finalizeDeckUpload: (input) => finalizeLinkDeckUpload(token, input),
    }),
    [token],
  );
  const { uploading, status, uploadFiles } = useMediaUpload(null, actions);

  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [lastUploaded, setLastUploaded] = useState<number | null>(null);
  // dragenter/dragleave fire for every child the pointer crosses; only a
  // count back at zero means it actually left the window.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || uploading > 0) return;
    const all = Array.from(list);
    const accepted = all.filter((file) => rejectionReason(file) === null);
    setRejected(all.flatMap((file) => {
      const reason = rejectionReason(file);
      return reason ? [`“${file.name}” ${reason}.`] : [];
    }));
    setLastUploaded(null);
    if (accepted.length === 0) return;
    setLastUploaded(await uploadFiles(accepted));
  }

  const busy = uploading > 0;

  return (
    <div className="mt-8 w-full">
      <p className="text-center text-[15px] text-muted">
        Add your files to <span className="font-semibold text-foreground">{folderName}</span>. You&apos;ll only see what&apos;s
        been uploaded to this folder.
      </p>

      <div
        onDragEnter={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) e.preventDefault();
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "relative mt-5 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-card)] transition-shadow",
          dragging && "ring-2 ring-accent",
        )}
      >
        {/* Title bar */}
        <div className="relative flex items-center border-b border-border bg-black/[.02] px-4 py-2.5 dark:bg-white/[.03]">
          <div className="flex gap-1.5" aria-hidden>
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="pointer-events-none absolute inset-x-12 flex items-center justify-center gap-1.5 text-[13px] font-medium">
            <span>📁</span>
            <span className="truncate">{folderName}</span>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
          <span className="flex-1">Name</span>
          <span className="hidden w-32 sm:block">Kind</span>
          <span className="w-16 text-right">Size</span>
          <span className="hidden w-24 text-right sm:block">Added</span>
        </div>

        <div className="max-h-[340px] min-h-[180px] overflow-y-auto">
          {files.length === 0 ? (
            <div className="flex h-[180px] flex-col items-center justify-center px-6 text-center text-sm text-muted">
              <span className="text-2xl">⤓</span>
              <span className="mt-1">No files yet — drop them here, or choose them below.</span>
            </div>
          ) : (
            files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-3 border-b border-border px-4 py-2 text-[13px] last:border-0"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="shrink-0">{ICONS[file.icon]}</span>
                  <span className="truncate font-medium">{file.name}</span>
                </span>
                <span className="hidden w-32 truncate text-muted sm:block">{file.kind}</span>
                <span className="w-16 text-right tabular-nums text-muted">{formatBytes(file.sizeBytes)}</span>
                <span className="hidden w-24 text-right tabular-nums text-muted sm:block">{formatDate(file.createdAt)}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-black/[.02] px-4 py-3 dark:bg-white/[.03]">
          <span className="text-[12px] text-muted">
            {busy
              ? (status ?? `Uploading ${uploading} file${uploading === 1 ? "" : "s"}…`)
              : `${files.length} item${files.length === 1 ? "" : "s"}`}
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTRIBUTE}
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <Button onClick={() => inputRef.current?.click()} disabled={busy}>
            {busy ? <Spinner /> : null}
            {busy ? "Uploading…" : "Choose Files"}
          </Button>
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent/10 text-[15px] font-semibold text-accent backdrop-blur-[2px]">
            Drop to upload to {folderName}
          </div>
        )}
      </div>

      {(lastUploaded !== null && lastUploaded > 0) || rejected.length > 0 ? (
        <div className="mt-3 space-y-1 text-center text-[13px]">
          {lastUploaded !== null && lastUploaded > 0 && (
            <p className="text-success">
              ✓ {lastUploaded} file{lastUploaded === 1 ? "" : "s"} uploaded. Thank you!
            </p>
          )}
          {rejected.map((message) => (
            <p key={message} className="text-danger">
              {message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-6 rounded-[var(--radius-md)] border border-border bg-surface/60 px-5 py-4 text-[13px]">
        <p className="font-semibold">What you can upload</p>
        <ul className="mt-2 space-y-1 text-muted">
          {ACCEPTED_TYPES.map((type) => (
            <li key={type.label}>
              <span className="font-medium text-foreground">{type.label}:</span> {type.formats}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-muted">
          Up to <span className="font-medium text-foreground">{MAX_UPLOAD_BYTES / 1024 / 1024} MB</span> per file.
        </p>
        <p className="mt-2 text-muted">
          <span className="font-medium text-foreground">Presentations</span> (PowerPoint, Keynote, Google Slides): export
          them as a PDF first — File → Export (or Download) → PDF — then upload the PDF.
        </p>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
