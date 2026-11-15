"use client";

import { DndContext } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FileTree, type SortDir, type SortKey } from "@/app/(dashboard)/library/_components/FileTree";
import {
  addDatenraumImages,
  removeDatenraumImage,
  setDatenraumImageDetails,
  setDatenraumImageTags,
} from "@/lib/actions/datenraum";
import type { Lang } from "@/lib/datenraumContent";
import { GALLERY_TAG_GROUPS, MAX_GALLERY_EVENT_NAME, type GalleryImage } from "@/lib/datenraumGallery";
import { brandFont } from "@/lib/fonts";
import { cn } from "@/lib/utils/cn";
import { DatenraumPicture } from "./DatenraumPicture";
import type { DeckWithPages, Folder, MediaItem } from "@/types/domain";

// The library, for picking pictures from (editors only).
export type GalleryLibrary = {
  folders: Folder[];
  media: MediaItem[];
  decks: DeckWithPages[];
  uploaders: Record<string, string>;
};

const TEXT: Record<Lang, Record<string, string>> = {
  de: {
    empty: "Noch keine Bilder.",
    emptyEditor: "Noch keine Bilder — mit + aus der Mediathek hinzufügen.",
    noMatch: "Keine Bilder für diese Auswahl.",
    reset: "Zurücksetzen",
    add: "Bilder hinzufügen",
    addN: "Hinzufügen",
    cancel: "Abbrechen",
    remove: "Von der Seite entfernen",
    close: "Schließen",
    resolution: "Auflösung",
    event: "Event",
    date: "Datum",
    tags: "Merkmale",
  },
  en: {
    empty: "No pictures yet.",
    emptyEditor: "No pictures yet — add some from the library with +.",
    noMatch: "No pictures for this selection.",
    reset: "Reset",
    add: "Add pictures",
    addN: "Add",
    cancel: "Cancel",
    remove: "Remove from the page",
    close: "Close",
    resolution: "Resolution",
    event: "Event",
    date: "Date",
    tags: "Tags",
  },
};

const tagLabel = new Map(
  GALLERY_TAG_GROUPS.flatMap((group) => group.options.map((option) => [option.key, option.label] as const)),
);

// The picture collection: a grid of the pictures picked for it, sorted by
// their tags (any of the picked options within a group, every group with
// one picked); a picture tapped opens large beside its tags and details.
// Editors (whoever's roles reach the Media page) can add pictures from the
// library, take them off again, and tag them.
export function DatenraumGallery({
  images,
  lang,
  canEdit,
  library,
}: {
  images: GalleryImage[];
  lang: Lang;
  canEdit: boolean;
  library: GalleryLibrary | null;
}) {
  const text = TEXT[lang];
  const router = useRouter();
  // Kept here so an edit shows at once; the server's copy takes over again
  // whenever it arrives.
  const [items, setItems] = useState(images);
  const [prevImages, setPrevImages] = useState(images);
  if (images !== prevImages) {
    setPrevImages(images);
    setItems(images);
  }
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const visible = items.filter((image) =>
    GALLERY_TAG_GROUPS.every((group) => {
      const wanted = group.options.filter((o) => picked.has(o.key));
      return wanted.length === 0 || wanted.some((o) => image.tags.includes(o.key));
    }),
  );
  const shownImage = items.find((image) => image.id === shown) ?? null;

  // An edit that doesn't go through (signed out meanwhile, say) is put
  // right by the server's copy, which comes back either way.
  async function save(run: () => Promise<void>) {
    try {
      await run();
    } catch {
      // See above.
    }
    router.refresh();
  }

  function remove(id: string) {
    setItems((list) => list.filter((image) => image.id !== id));
    if (shown === id) setShown(null);
    void save(() => removeDatenraumImage(id));
  }

  function toggleTag(image: GalleryImage, tag: string) {
    const tags = image.tags.includes(tag) ? image.tags.filter((t) => t !== tag) : [...image.tags, tag];
    setItems((list) => list.map((i) => (i.id === image.id ? { ...i, tags } : i)));
    void save(() => setDatenraumImageTags(image.id, tags));
  }

  function saveDetails(image: GalleryImage, eventName: string, takenOn: string) {
    if ((image.eventName ?? "") === eventName.trim() && (image.takenOn ?? "") === takenOn) return;
    setItems((list) =>
      list.map((i) => (i.id === image.id ? { ...i, eventName: eventName.trim() || null, takenOn: takenOn || null } : i)),
    );
    void save(() => setDatenraumImageDetails(image.id, { eventName, takenOn }));
  }

  return (
    <div className="pb-10 pt-2">
      {/* The filters, and for editors, adding from the library. */}
      <div className="relative z-20 flex flex-wrap items-center gap-2">
        {GALLERY_TAG_GROUPS.map((group) => {
          const count = group.options.filter((o) => picked.has(o.key)).length;
          const open = openGroup === group.id;
          return (
            <div key={group.id} className="relative">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpenGroup(open ? null : group.id)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] font-medium transition-colors",
                  count > 0
                    ? "border-foreground bg-foreground text-surface"
                    : "border-border hover:bg-black/[.04] dark:hover:bg-white/[.08]",
                )}
              >
                {group.label[lang]}
                {count > 0 && <span className="tabular-nums opacity-70">{count}</span>}
                <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                  <polyline points="6 9 12 15 18 9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              {open && (
                <FilterMenu onClose={() => setOpenGroup(null)}>
                  {group.options.map((option) => {
                    const on = picked.has(option.key);
                    return (
                      <button
                        key={option.key}
                        type="button"
                        role="menuitemcheckbox"
                        aria-checked={on}
                        onClick={() =>
                          setPicked((current) => {
                            const next = new Set(current);
                            if (!next.delete(option.key)) next.add(option.key);
                            return next;
                          })
                        }
                        className="flex w-full items-center gap-2.5 rounded-[calc(var(--radius-md)-4px)] px-2.5 py-1.5 text-left text-[14px] hover:bg-black/[.04] dark:hover:bg-white/[.08]"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-[5px] border",
                            on ? "border-accent bg-accent text-accent-contrast" : "border-muted/60",
                          )}
                        >
                          {on && <Check />}
                        </span>
                        {option.label[lang]}
                      </button>
                    );
                  })}
                </FilterMenu>
              )}
            </div>
          );
        })}
        {picked.size > 0 && (
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            className="h-9 px-2 text-[14px] font-medium text-muted hover:text-foreground"
          >
            {text.reset}
          </button>
        )}
        {canEdit && library && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label={text.add}
            title={text.add}
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-contrast shadow-[var(--shadow-control)]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-[15px] text-muted">
          {items.length === 0 ? (canEdit ? text.emptyEditor : text.empty) : text.noMatch}
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((image) => (
            <div key={image.id} className="group relative aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] bg-black/[.06] dark:bg-white/[.06]">
              <button
                type="button"
                onClick={() => setShown(image.id)}
                aria-label={image.name}
                className="no-press block h-full w-full cursor-zoom-in"
              >
                <DatenraumPicture
                  src={image.url}
                  alt={image.name}
                  // As wide as a column of the grid (see its classes).
                  sizes="(min-width: 1280px) 300px, (min-width: 1024px) 33vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => remove(image.id)}
                  aria-label={text.remove}
                  title={text.remove}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <Cross className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {shownImage && (
        <Lightbox
          key={shownImage.id}
          image={shownImage}
          lang={lang}
          canEdit={canEdit}
          onClose={() => setShown(null)}
          onToggleTag={(tag) => toggleTag(shownImage, tag)}
          onSaveDetails={(eventName, takenOn) => saveDetails(shownImage, eventName, takenOn)}
        />
      )}

      {picking && library && (
        <LibraryPicker
          library={library}
          lang={lang}
          already={new Set(items.map((image) => image.mediaItemId))}
          onClose={() => setPicking(false)}
          onAdd={(ids) => {
            setPicking(false);
            void save(() => addDatenraumImages(ids));
          }}
        />
      )}
    </div>
  );
}

// A filter group's options, under its pill; a tap anywhere else closes it.
function FilterMenu({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!ref.current?.parentElement?.contains(e.target as Node)) onCloseRef.current();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, []);
  return (
    <div
      ref={ref}
      role="menu"
      className="pop-in absolute left-0 top-full mt-2 min-w-[200px] origin-top-left rounded-[var(--radius-md)] border border-border bg-surface p-1 shadow-[var(--shadow-float)]"
    >
      {children}
    </div>
  );
}

// A picture large, filling three quarters of the screen, beside its title,
// tags and details. Editors see every tag, the ones it has to take off and
// the rest greyed, to put on; and can fill in the event and the day.
function Lightbox({
  image,
  lang,
  canEdit,
  onClose,
  onToggleTag,
  onSaveDetails,
}: {
  image: GalleryImage;
  lang: Lang;
  canEdit: boolean;
  onClose: () => void;
  onToggleTag: (tag: string) => void;
  onSaveDetails: (eventName: string, takenOn: string) => void;
}) {
  const text = TEXT[lang];
  const [eventName, setEventName] = useState(image.eventName ?? "");
  const [takenOn, setTakenOn] = useState(image.takenOn ?? "");
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const date = image.takenOn
    ? new Date(`${image.takenOn}T12:00:00`).toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={image.name}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pop-in flex h-[75vh] w-[75vw] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sheet)] md:flex-row"
      >
        <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center bg-black">
          <DatenraumPicture src={image.url} alt={image.name} sizes="75vw" urgent className="object-contain" />
        </div>
        <aside className="flex max-h-[45%] w-full shrink-0 flex-col overflow-y-auto border-t border-border p-5 md:max-h-none md:w-[300px] md:border-l md:border-t-0">
          <div className="flex items-start justify-between gap-3">
            <h3 className={`${brandFont.className} min-w-0 break-words text-[30px] uppercase leading-none tracking-tight`}>
              {image.name}
            </h3>
            <button
              type="button"
              onClick={onClose}
              aria-label={text.close}
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-black/[.05] hover:text-foreground dark:hover:bg-white/[.08]"
            >
              <Cross className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-3">
            {canEdit ? (
              GALLERY_TAG_GROUPS.map((group) => (
                <div key={group.id}>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{group.label[lang]}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {group.options.map((option) => {
                      const on = image.tags.includes(option.key);
                      return (
                        <button
                          key={option.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => onToggleTag(option.key)}
                          className={cn(
                            "flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-medium transition-[opacity,background-color,color]",
                            on
                              ? "border-accent bg-accent text-accent-contrast"
                              : "border-border text-foreground opacity-40 hover:opacity-100",
                          )}
                        >
                          {option.label[lang]}
                          {on && <Cross className="h-2.5 w-2.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            ) : image.tags.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label={text.tags}>
                {image.tags.map((tag) => (
                  <li key={tag} className="rounded-full border border-border px-2.5 py-1 text-[12px] font-medium text-foreground/80">
                    {tagLabel.get(tag)?.[lang] ?? tag}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <dl className="mt-auto grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5 border-t border-border pt-4 text-[13px]">
            {image.width && image.height && (
              <>
                <dt className="text-muted">{text.resolution}</dt>
                <dd className="tabular-nums">
                  {image.width} × {image.height} px
                </dd>
              </>
            )}
            {canEdit ? (
              <>
                <dt className="text-muted">{text.event}</dt>
                <dd>
                  <input
                    value={eventName}
                    maxLength={MAX_GALLERY_EVENT_NAME}
                    onChange={(e) => setEventName(e.target.value)}
                    onBlur={() => onSaveDetails(eventName, takenOn)}
                    className="w-full rounded-[8px] border border-border bg-transparent px-2 py-1 outline-none focus:border-accent"
                  />
                </dd>
                <dt className="text-muted">{text.date}</dt>
                <dd>
                  <input
                    type="date"
                    value={takenOn}
                    onChange={(e) => setTakenOn(e.target.value)}
                    onBlur={() => onSaveDetails(eventName, takenOn)}
                    className="w-full rounded-[8px] border border-border bg-transparent px-2 py-1 outline-none focus:border-accent"
                  />
                </dd>
              </>
            ) : (
              <>
                {image.eventName && (
                  <>
                    <dt className="text-muted">{text.event}</dt>
                    <dd>{image.eventName}</dd>
                  </>
                )}
                {date && (
                  <>
                    <dt className="text-muted">{text.date}</dt>
                    <dd>{date}</dd>
                  </>
                )}
              </>
            )}
          </dl>
        </aside>
      </div>
    </div>
  );
}

// The library's file browser, to tick pictures to add. Only images show
// (no PDFs' pages); those already on the page are left out.
function LibraryPicker({
  library,
  lang,
  already,
  onClose,
  onAdd,
}: {
  library: GalleryLibrary;
  lang: Lang;
  already: Set<string>;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const text = TEXT[lang];
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [target, setTarget] = useState<string | null>(null);
  const media = library.media.filter((item) => item.media_type === "image" && !item.deck_id && !already.has(item.id));

  const pick = (ids: string[], on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  return (
    <div role="dialog" aria-modal="true" aria-label={text.add} onClick={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        onClick={(e) => e.stopPropagation()}
        className="pop-in flex h-[80vh] w-[min(960px,92vw)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface shadow-[var(--shadow-sheet)]"
      >
        {/* Above the file browser's blurred top edge, which reaches up
            over whatever's above it (as in the Playback Menu). */}
        <div className="relative z-10 flex items-center gap-3 border-b border-border bg-surface px-5 py-3">
          <h3 className="text-[17px] font-semibold">{text.add}</h3>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-full px-4 text-[14px] font-medium text-muted hover:text-foreground">
              {text.cancel}
            </button>
            <button
              type="button"
              disabled={selected.size === 0}
              onClick={() => onAdd([...selected])}
              className="h-9 rounded-full bg-accent px-4 text-[14px] font-semibold text-accent-contrast disabled:opacity-40"
            >
              {text.addN}
              {selected.size > 0 && ` (${selected.size})`}
            </button>
          </div>
        </div>
        {/* FileTree's own draggables need a DndContext above them; nothing
            here is dragged. */}
        <DndContext sensors={[]}>
          <FileTree
            className="min-h-0 flex-1 px-3"
            folders={library.folders}
            media={media}
            decks={[]}
            uploaders={library.uploaders}
            selectionMode
            selectedIds={selected}
            onToggleMedia={(id) => pick([id], !selected.has(id))}
            onToggleFolderIds={pick}
            uploadTargetId={target}
            onActivateFolder={setTarget}
            sortKey={sortKey}
            sortDir={sortDir}
            onToggleSort={(key) => {
              if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
              else {
                setSortKey(key);
                setSortDir("asc");
              }
            }}
            creatingIn={undefined}
            onCreatingChange={() => {}}
            dropTargetFolderId={undefined}
          />
        </DndContext>
      </div>
    </div>
  );
}

function Cross({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="5 12.5 10 17 19 7" />
    </svg>
  );
}
