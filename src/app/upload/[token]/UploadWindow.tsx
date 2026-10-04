"use client";

import { useMemo, useRef, useState } from "react";
import { useMediaUpload, type UploadActions } from "@/app/(dashboard)/library/_components/useMediaUpload";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import {
  createLinkDeckUploadUrls,
  createLinkReplaceUploadUrl,
  createLinkUploadUrl,
  finalizeLinkDeckReplace,
  finalizeLinkDeckUpload,
  finalizeLinkMediaReplace,
  finalizeLinkMediaUpload,
} from "@/lib/actions/uploadLinks";
import { brandFont } from "@/lib/fonts";
import { replaceDeckFile, replaceMediaFile, type ReplaceActions } from "@/lib/media/replaceFile";
import { ACCEPT_ATTRIBUTE, rejectionReason } from "@/lib/uploads/limits";
import { cn } from "@/lib/utils/cn";
import { displayName } from "@/lib/utils/format";
import { COPY, LANG_COOKIE, type Copy, type Lang } from "./copy";

export type UploadedFile = {
  id: string;
  name: string;
  icon: "image" | "video" | "pdf";
  createdAt: string;
};

const ICONS: Record<UploadedFile["icon"], string> = { image: "🖼️", video: "🎬", pdf: "📄" };

type Message = { tone: "success" | "error"; text: string };

// The whole page below the server's data lookup, so switching language
// re-renders everything at once. `link` is null for a link that's no
// longer active.
export function UploadPage({
  initialLang,
  token,
  link,
}: {
  initialLang: Lang;
  token: string;
  link: { folderName: string; ownerName: string | null; files: UploadedFile[] } | null;
}) {
  const [lang, setLang] = useState(initialLang);
  const t = COPY[lang];

  function switchLang(next: Lang) {
    setLang(next);
    // Remembered for this browser, and read by the server on the next
    // visit so the page renders in it straight away.
    document.cookie = `${LANG_COOKIE}=${next}; path=/upload; max-age=31536000; samesite=lax`;
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-4">
        <div className="flex justify-end">
          <LanguageSwitch lang={lang} onChange={switchLang} />
        </div>
        <h1
          lang="en"
          className={`${brandFont.className} mt-4 text-center text-[52px] uppercase leading-none tracking-tight sm:mt-6`}
        >
          Colo Cloud
        </h1>
        <div lang={lang}>
          {link ? (
            <UploadWindow token={token} t={t} {...link} />
          ) : (
            <div className="mx-auto mt-10 max-w-sm text-center">
              <p className="text-[17px] font-semibold">{t.inactiveTitle}</p>
              <p className="mt-1 text-sm text-muted">{t.inactiveBody}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function LanguageSwitch({ lang, onChange }: { lang: Lang; onChange: (lang: Lang) => void }) {
  return (
    <div role="group" aria-label="Sprache / Language" className="flex rounded-full bg-black/[.05] p-0.5 dark:bg-white/[.08]">
      {(["de", "en"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={lang === option}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-full px-3 py-1 text-[12px] font-semibold uppercase transition-colors",
            lang === option ? "bg-surface text-foreground shadow-sm" : "text-muted hover:text-foreground",
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function UploadWindow({
  token,
  t,
  folderName,
  ownerName,
  files,
}: {
  token: string;
  t: Copy;
  folderName: string;
  ownerName: string | null;
  files: UploadedFile[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);

  // The same pipelines as the Library's own uploads and replaces, run on
  // actions bound to this link — they pick the folder from the token, so
  // the folder id the upload hook passes along is never used.
  const uploadActions = useMemo<UploadActions>(
    () => ({
      createUploadUrl: (input) => createLinkUploadUrl(token, input),
      finalizeMediaUpload: (input) => finalizeLinkMediaUpload(token, input),
      createDeckUploadUrls: (input) => createLinkDeckUploadUrls(token, input),
      finalizeDeckUpload: (input) => finalizeLinkDeckUpload(token, input),
    }),
    [token],
  );
  const replaceActions = useMemo<ReplaceActions>(
    () => ({
      createReplaceUploadUrl: (input) => createLinkReplaceUploadUrl(token, input),
      finalizeMediaReplace: (input) => finalizeLinkMediaReplace(token, input),
      createDeckUploadUrls: (input) => createLinkDeckUploadUrls(token, input),
      finalizeDeckReplace: (input) => finalizeLinkDeckReplace(token, input),
    }),
    [token],
  );

  // Collected rather than alerted, so they read in the page's language.
  const failedUploads = useRef<string[]>([]);
  const { uploading, uploadFiles } = useMediaUpload(null, uploadActions, (file) => {
    failedUploads.current.push(file.name);
  });

  const [replacing, setReplacing] = useState<{ id: string; label: string } | null>(null);
  const busy = uploading > 0 || replacing !== null;

  const inputRef = useRef<HTMLInputElement>(null);
  // dragenter/dragleave fire for every child the pointer crosses; only a
  // count back at zero means it actually left the window.
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);

  async function handleFiles(list: FileList | null) {
    if (!list || list.length === 0 || busy) return;
    const all = Array.from(list);
    const next: Message[] = [];
    const accepted = all.filter((file) => {
      const reason = rejectionReason(file);
      if (reason) next.push({ tone: "error", text: t.rejection(file.name, reason) });
      return reason === null;
    });
    setMessages(next);
    if (accepted.length === 0) return;

    failedUploads.current = [];
    const succeeded = await uploadFiles(accepted);
    setMessages([
      ...next,
      ...(succeeded > 0 ? [{ tone: "success" as const, text: t.uploaded(succeeded) }] : []),
      ...failedUploads.current.map((name) => ({ tone: "error" as const, text: t.uploadFailed(name) })),
    ]);
  }

  async function handleReplace(item: UploadedFile, file: File) {
    const name = displayName(item.name);
    const reason = rejectionReason(file);
    if (reason) return setMessages([{ tone: "error", text: t.rejection(file.name, reason) }]);
    const fileIsPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    if (item.icon === "pdf" && !fileIsPdf) return setMessages([{ tone: "error", text: t.replaceNeedsPdf(name) }]);
    if (item.icon !== "pdf" && fileIsPdf) return setMessages([{ tone: "error", text: t.replaceNeedsMedia(name) }]);
    if (!window.confirm(t.confirmReplace(name, file.name))) return;

    setMessages([]);
    setReplacing({ id: item.id, label: t.replacing });
    try {
      if (item.icon === "pdf") {
        await replaceDeckFile(
          file,
          item.id,
          (progress) =>
            setReplacing({
              id: item.id,
              label: progress.phase === "rendering" ? t.replacePage(progress.done, progress.total) : t.replacing,
            }),
          replaceActions,
        );
      } else {
        await replaceMediaFile(file, item.id, replaceActions);
      }
      setMessages([{ tone: "success", text: t.replaced(name) }]);
    } catch (err) {
      console.error("Replace failed", item.name, err);
      setMessages([{ tone: "error", text: t.replaceFailed(name) }]);
    } finally {
      setReplacing(null);
    }
  }

  return (
    <div className="mt-8 w-full">
      <div className="text-center text-[15px] leading-relaxed text-muted">
        <p>{t.introLine1}</p>
        <p>
          {t.introLine2[0]}
          <span className="font-semibold text-foreground">{ownerName ?? t.ownerFallback}</span>
          {t.introLine2[1]}
          <span className="font-semibold text-foreground">{folderName}</span>
          {t.introLine2[2]}
        </p>
      </div>

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
          "relative mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-card)] transition-shadow",
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
          <span className="flex-1">{t.columnName}</span>
          <span className="hidden w-24 text-right sm:block">{t.columnAdded}</span>
          {/* Room for the row's pill, so the columns above line up. */}
          <span className="w-[7.5rem]" />
        </div>

        <div className="max-h-[340px] min-h-[180px] overflow-y-auto">
          {files.length === 0 ? (
            <div className="flex h-[180px] flex-col items-center justify-center px-6 text-center text-sm text-muted">
              <span className="text-2xl">⤓</span>
              <span className="mt-1">{t.empty}</span>
            </div>
          ) : (
            files.map((file) => (
              <FileRow
                key={file.id}
                file={file}
                t={t}
                replacingLabel={replacing?.id === file.id ? replacing.label : null}
                disabled={busy}
                onReplace={(picked) => handleReplace(file, picked)}
              />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-black/[.02] px-4 py-3 dark:bg-white/[.03]">
          <span className="text-[12px] text-muted">
            {uploading > 0 ? t.uploadingCount(uploading) : t.itemCount(files.length)}
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
            {uploading > 0 ? <Spinner /> : null}
            {uploading > 0 ? t.uploading : t.choose}
          </Button>
        </div>

        {dragging && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent/10 px-6 text-center text-[15px] font-semibold text-accent backdrop-blur-[2px]">
            {t.dropHere(folderName)}
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div className="mt-3 space-y-1 text-center text-[13px]">
          {messages.map((message, i) => (
            <p key={i} className={message.tone === "success" ? "text-success" : "text-danger"}>
              {message.text}
            </p>
          ))}
        </div>
      )}

      <InfoBlock title={t.screensTitle}>
        <ul className="space-y-1 text-muted">
          {t.screens.map((screen) => (
            <li key={screen.size}>
              <span className="font-medium text-foreground">{screen.size}</span> · {screen.orientation} ·{" "}
              {screen.format} — {screen.ideal}
            </li>
          ))}
        </ul>
      </InfoBlock>

      <InfoBlock title={t.guideTitle}>
        <ul className="space-y-1 text-muted">
          {t.types.map((type) => (
            <li key={type.label}>
              <span className="font-medium text-foreground">{type.label}:</span> {type.formats}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-muted">
          {t.maxSize[0]}
          <span className="font-medium text-foreground">{t.maxSize[1]}</span>
          {t.maxSize[2]}
        </p>
        <p className="mt-2 text-muted">
          <span className="font-medium text-foreground">{t.presentationsLabel}</span>
          {t.presentationsHint}
        </p>
      </InfoBlock>
    </div>
  );
}

function FileRow({
  file,
  t,
  replacingLabel,
  disabled,
  onReplace,
}: {
  file: UploadedFile;
  t: Copy;
  replacingLabel: string | null;
  disabled: boolean;
  onReplace: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[13px] last:border-0">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0">{ICONS[file.icon]}</span>
        <span className="truncate font-medium">{displayName(file.name)}</span>
      </span>
      <span className="hidden w-24 text-right tabular-nums text-muted sm:block">
        {formatDate(file.createdAt, t.dateLocale)}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={file.icon === "pdf" ? "application/pdf,.pdf" : "image/*,video/*"}
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (picked) onReplace(picked);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="flex w-[7.5rem] shrink-0 items-center justify-center gap-1.5 rounded-full bg-black/[.05] px-3 py-1 text-[12px] font-medium text-foreground transition-colors hover:bg-black/[.08] disabled:opacity-40 dark:bg-white/[.08] dark:hover:bg-white/[.12]"
      >
        {replacingLabel ? (
          <>
            <Spinner className="inline h-3 w-3" />
            <span className="truncate">{replacingLabel}</span>
          </>
        ) : (
          t.replace
        )}
      </button>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-[var(--radius-md)] border border-border bg-surface/60 px-5 py-4 text-[13px]">
      <p className="font-semibold">{title}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function formatDate(iso: string, locale: string) {
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
}
