"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons/PlaybackIcons";
import { POPUP_BLUE_BUTTON, POPUP_WHITE_BUTTON, Popup } from "@/components/ui/Popup";
import { Spinner } from "@/components/ui/Spinner";
import { kulturPosterEdit, setKulturPoster, type PosterChange, type PosterEdit } from "@/lib/actions/kulturPoster";
import { createPosterImageUploadUrl } from "@/lib/actions/posters";
import type { PosterText } from "@/lib/kulturPoster/titleParts";
import { createBrowserClient } from "@/lib/supabase/client";
import { pullKulturPoster } from "./kulturPosterPull";

const FORM_ID = "poster-edit-form";

// A picture's longest side once uploaded: the newsletter's panel at 4K is
// 1760 wide, so this leaves room to cut from.
const PICTURE_LONG_SIDE = 2400;

// The picture as it's to be: as it is, a new one chosen, or none (an
// event's own again, for an event's poster).
type Picture = { kind: "keep" } | { kind: "new"; file: File; preview: string } | { kind: "remove" };

// A Kultur Poster's Edit Poster: the lines its event's title was taken
// apart into, to set by hand where the rules got them wrong, and a picture
// of its own for the newsletter's in place of the event's. A poster made
// by hand (from the folder's +) has its date and ticket link set here too.
// What's set applies to all three of its files and is kept for every pull
// after (an event's text until it's set back to automatic). Saving pulls
// straight away, so the poster is remade before it closes.
export function PosterTextDialog({ sourceKey, open, onClose }: { sourceKey: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<PosterEdit | null>(null);
  const [text, setText] = useState<PosterText | null>(null);
  const [date, setDate] = useState(["", ""]);
  const [ticketUrl, setTicketUrl] = useState("");
  const [picture, setPicture] = useState<Picture>({ kind: "keep" });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  // Each open starts afresh…
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setLoaded(null);
      setText(null);
      setPicture({ kind: "keep" });
      setError(null);
      setStatus(null);
    }
  }
  // …read off the site again: the title may have changed there.
  useEffect(() => {
    if (!open) return;
    let current = true;
    kulturPosterEdit(sourceKey).then(
      (result) => {
        if (!current) return;
        setLoaded(result);
        setText(result.text);
        setDate([result.date[0] ?? "", result.date[1] ?? ""]);
        setTicketUrl(result.ticketUrl ?? "");
      },
      (err) => current && setError(err instanceof Error ? err.message : "Couldn't read the poster."),
    );
    return () => {
      current = false;
    };
  }, [open, sourceKey]);
  const busy = status !== null;
  const manual = loaded?.manual ?? false;

  async function apply(next: PosterText | null) {
    if (!loaded) return;
    setError(null);
    try {
      let image: PosterChange["image"];
      if (picture.kind === "new") {
        setStatus("Uploading the picture…");
        image = await uploadPicture(picture.file);
      } else if (picture.kind === "remove") {
        image = null;
      }
      setStatus("Saving…");
      await setKulturPoster(sourceKey, {
        // The rules' own text again is no override at all.
        text: next && !manual && loaded.auto && same(next, loaded.auto) ? null : next,
        ...(manual ? { date, ticketUrl } : {}),
        image,
      });
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

  // A chosen picture, shown from the file itself — the one chosen before
  // it let go of.
  function choose(file: File | undefined) {
    if (!file) return;
    if (picture.kind === "new") URL.revokeObjectURL(picture.preview);
    setPicture({ kind: "new", file, preview: URL.createObjectURL(file) });
  }

  const field = (key: keyof PosterText) => ({
    value: text?.[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setText((t) => (t ? { ...t, [key]: e.target.value } : t)),
    disabled: busy,
  });

  // What the picture is to be, to show.
  const shown =
    picture.kind === "new"
      ? picture.preview
      : picture.kind === "remove"
        ? loaded?.siteImageUrl
        : (loaded?.uploadedImageUrl ?? loaded?.siteImageUrl);
  const hasUpload = picture.kind === "new" || (picture.kind === "keep" && !!loaded?.uploadedImageUrl);

  return (
    <Popup
      open={open}
      onOpenChange={(next) => !next && !busy && onClose()}
      title="Edit Poster"
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
          {loaded?.siteTitle && (
            <p className="text-[12px] text-muted">
              On Wix: <span className="text-foreground">{loaded.siteTitle}</span>
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted">Picture, on the Newsletter 16:9</span>
            <div className="flex items-center gap-3">
              <div className="flex h-[72px] w-[128px] shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] border border-border bg-black/[.03] dark:bg-white/[.04]">
                {shown ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a local preview or a remote one, shown as it is
                  <img src={shown} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[12px] text-muted">None</span>
                )}
              </div>
              <div className="flex flex-col items-start gap-1">
                <button type="button" disabled={busy} onClick={() => fileInput.current?.click()} className="press-ghost text-[13px] text-accent disabled:opacity-40">
                  {shown ? "Replace…" : "Upload…"}
                </button>
                {hasUpload && (
                  <button type="button" disabled={busy} onClick={() => setPicture({ kind: "remove" })} className="press-ghost text-[13px] text-accent disabled:opacity-40">
                    {manual ? "Remove" : "Use the site's picture"}
                  </button>
                )}
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  choose(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <Field label="Above the name" placeholder="Series or format, e.g. Buchpremiere und Lesung" {...field("kicker")} />
          <Field label="Name" required autoFocus {...field("headline")} />
          <Field label="Below the name" placeholder="Subtitle or guest" {...field("subtitle")} />
          <Field label="Label" placeholder="e.g. AUSVERKAUFT" {...field("badge")} />
          {manual && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date" placeholder="e.g. Samstag, 28. Nov" value={date[0]} disabled={busy} onChange={(e) => setDate([e.target.value, date[1]])} />
                <Field label="Time" placeholder="e.g. 20:00 Uhr" value={date[1]} disabled={busy} onChange={(e) => setDate([date[0], e.target.value])} />
              </div>
              <Field
                label="Ticket link"
                type="url"
                placeholder="https://… (for the QR code and the Ticket button)"
                value={ticketUrl}
                disabled={busy}
                onChange={(e) => setTicketUrl(e.target.value)}
              />
            </>
          )}
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] text-muted">{status ?? "Applies to the A1 Poster and both images."}</p>
            {loaded?.textSet && !manual && (
              <button type="button" disabled={busy} onClick={() => apply(null)} className="press-ghost shrink-0 text-[13px] text-accent disabled:opacity-40">
                Automatic text
              </button>
            )}
          </div>
        </form>
      )}
    </Popup>
  );
}

// The chosen picture as a JPEG, no longer than it needs to be, into the
// media bucket — on white, should it have see-through parts.
async function uploadPicture(file: File): Promise<{ path: string; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  let blob: Blob | null;
  let width: number;
  let height: number;
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, PICTURE_LONG_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    width = Math.round(image.naturalWidth * scale);
    height = Math.round(image.naturalHeight * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  } catch {
    throw new Error("That picture couldn't be read.");
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!blob) throw new Error("That picture couldn't be read.");
  const slot = await createPosterImageUploadUrl();
  const { error } = await createBrowserClient()
    .storage.from("media")
    .uploadToSignedUrl(slot.storagePath, slot.token, blob, { contentType: "image/jpeg" });
  if (error) throw new Error(error.message);
  return { path: slot.storagePath, width, height };
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
