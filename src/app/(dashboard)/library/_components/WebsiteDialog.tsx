"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons/PlaybackIcons";
import { POPUP_BLUE_BUTTON, POPUP_WHITE_BUTTON, Popup } from "@/components/ui/Popup";
import { Spinner } from "@/components/ui/Spinner";
import { setWebsiteUrl } from "@/lib/actions/media";
import type { MediaItem } from "@/types/domain";

const FORM_ID = "website-edit-form";

// The Website page's Edit Website, from its "⋯" in the library: the
// address every screen showing it loads, full screen, in its own browser
// (see screenPages/Website.tsx). Saving tells the screens straight away.
// Should the site look like it refuses to be framed, that's said here and
// the dialog stays open, the address saved all the same — the check is
// only a hint (see setWebsiteUrl).
export function WebsiteDialog({ item, open, onClose }: { item: MediaItem; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState(item.page_url ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Each open starts from what's saved.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUrl(item.page_url ?? "");
      setError(null);
      setWarning(null);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    setWarning(null);
    try {
      const result = await setWebsiteUrl(item.id, url);
      router.refresh();
      setUrl(result.url ?? "");
      if (result.warning) setWarning(result.warning);
      else onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popup
      open={open}
      onOpenChange={(next) => !next && !busy && onClose()}
      title="Edit Website"
      leading={
        <button type="button" onClick={onClose} disabled={busy} title="Cancel" aria-label="Cancel" className={POPUP_WHITE_BUTTON}>
          <CloseIcon className="h-5 w-5" />
        </button>
      }
      trailing={
        <button type="submit" form={FORM_ID} disabled={busy} title="Save" aria-label="Save" className={POPUP_BLUE_BUTTON}>
          {busy ? <Spinner className="h-5 w-5" /> : <CheckIcon className="h-5 w-5" />}
        </button>
      }
    >
      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        className="flex flex-col gap-4 px-1"
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] text-muted">Address</span>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            placeholder="https://…"
            value={url}
            disabled={busy}
            onChange={(e) => {
              setUrl(e.target.value);
              setWarning(null);
            }}
            className="rounded-[var(--radius-sm)] border border-border bg-transparent px-3 py-2 text-[15px] outline-none focus:border-accent disabled:opacity-60"
          />
        </label>
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {warning ? (
          <div className="flex items-start justify-between gap-3">
            <p className="text-[13px] text-danger">Saved, but: {warning}</p>
            <button type="button" onClick={onClose} className="press-ghost shrink-0 text-[13px] text-accent">
              Done
            </button>
          </div>
        ) : (
          <p className="text-[12px] text-muted">Shown full screen on every screen playing this page. Leave empty to show nothing.</p>
        )}
      </form>
    </Popup>
  );
}
