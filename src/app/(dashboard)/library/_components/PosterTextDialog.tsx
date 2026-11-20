"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type InputHTMLAttributes } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons/PlaybackIcons";
import { POPUP_BLUE_BUTTON, POPUP_WHITE_BUTTON, Popup } from "@/components/ui/Popup";
import { Spinner } from "@/components/ui/Spinner";
import { kulturPosterText, setKulturPosterText } from "@/lib/actions/kulturPoster";
import type { PosterText } from "@/lib/kulturPoster/titleParts";
import { pullKulturPoster } from "./kulturPosterPull";

const FORM_ID = "poster-text-form";

type Loaded = { title: string; auto: PosterText; override: PosterText | null };

// A Kultur Poster's Edit Poster Text: the lines its event's title was taken
// apart into, to set by hand where the rules got them wrong. Applies to all
// three of the poster's files (the A1 PDF and both images) and is kept for
// every pull after, until it's set back to automatic. Saving pulls straight
// away, so the poster is remade before it closes.
export function PosterTextDialog({ sourceKey, open, onClose }: { sourceKey: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [text, setText] = useState<PosterText | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Each open starts afresh…
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLoaded(null);
      setText(null);
      setError(null);
      setStatus(null);
    }
  }
  // …read off the site again: the title may have changed there.
  useEffect(() => {
    if (!open) return;
    let current = true;
    kulturPosterText(sourceKey).then(
      (result) => {
        if (!current) return;
        setLoaded(result);
        setText(result.override ?? result.auto);
      },
      (err) => current && setError(err instanceof Error ? err.message : "Couldn't read the event."),
    );
    return () => {
      current = false;
    };
  }, [open, sourceKey]);

  const busy = status !== null;

  async function apply(next: PosterText | null) {
    setError(null);
    try {
      setStatus("Saving…");
      // The rules' own text again is no override at all.
      await setKulturPosterText(sourceKey, next && loaded && same(next, loaded.auto) ? null : next);
      setStatus("Making posters…");
      const { failed } = await pullKulturPoster((done, total) => total && setStatus(`Making posters ${Math.min(done + 1, total)}/${total}…`));
      router.refresh();
      if (failed.length > 0) {
        setError(`Couldn't make: ${failed.join(", ")}`);
        setStatus(null);
        return;
      }
      setStatus(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
      setStatus(null);
    }
  }

  const field = (key: keyof PosterText) => ({
    value: text?.[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setText((t) => (t ? { ...t, [key]: e.target.value } : t)),
    disabled: busy,
  });

  return (
    <Popup
      open={open}
      onOpenChange={(next) => !next && !busy && onClose()}
      title="Poster Text"
      leading={
        <button type="button" onClick={onClose} disabled={busy} title="Cancel" aria-label="Cancel" className={POPUP_WHITE_BUTTON}>
          <CloseIcon className="h-5 w-5" />
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} disabled={busy || !text?.headline.trim()} title="Save" aria-label="Save" className={POPUP_BLUE_BUTTON}>
          {busy ? <Spinner className="h-5 w-5" /> : <CheckIcon className="h-5 w-5" />}
        </button>
      }
    >
      {!text ? (
        error ? (
          <p className="px-1 py-2 text-[13px] text-danger">{error}</p>
        ) : (
          <div className="flex justify-center py-6">
            <Spinner className="h-5 w-5 text-muted" />
          </div>
        )
      ) : (
        <form
          id={FORM_ID}
          onSubmit={(e) => {
            e.preventDefault();
            apply(text);
          }}
          className="flex flex-col gap-4 px-1"
        >
          <p className="text-[12px] text-muted">
            On Wix: <span className="text-foreground">{loaded?.title}</span>
          </p>
          <Field label="Above the name" placeholder="Series or format, e.g. Buchpremiere und Lesung" {...field("kicker")} />
          <Field label="Name" required autoFocus {...field("headline")} />
          <Field label="Below the name" placeholder="Subtitle or guest" {...field("subtitle")} />
          <Field label="Label" placeholder="e.g. AUSVERKAUFT" {...field("badge")} />
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted">{status ?? "Applies to the A1 Poster and both images."}</p>
            {loaded?.override && (
              <button type="button" disabled={busy} onClick={() => apply(null)} className="press-ghost shrink-0 text-[13px] text-accent disabled:opacity-40">
                Automatic
              </button>
            )}
          </div>
        </form>
      )}
    </Popup>
  );
}

function same(a: PosterText, b: PosterText) {
  const norm = (s: string | null) => s?.replace(/\s+/g, " ").trim() || null;
  return (["kicker", "headline", "subtitle", "badge"] as const).every((key) => norm(a[key]) === norm(b[key]));
}

function Field({ label, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      <input
        {...props}
        className="rounded-[var(--radius-sm)] border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-accent disabled:opacity-60"
      />
    </label>
  );
}
