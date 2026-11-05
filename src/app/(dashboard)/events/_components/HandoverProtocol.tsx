"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckIcon, CloseIcon } from "@/components/icons/PlaybackIcons";
import { Spinner } from "@/components/ui/Spinner";
import { createHandoverPhotoUpload, emailHandover } from "@/lib/actions/handover";
import type { EventPerson, EventSummary } from "@/lib/events";
import { createBrowserClient } from "@/lib/supabase/client";
import {
  formatHandoverDay,
  HANDOVER_FORMS,
  MAX_HANDOVER_NAME,
  MAX_HANDOVER_NOTE,
  MAX_HANDOVER_PHOTOS,
  visibleProtocol,
  type HandoverFormKey,
  type HandoverItem,
  type HandoverItemAnswer,
  type HandoverSection,
  type HandoverSigner,
} from "@/lib/uebergabeprotokoll";
import { cn } from "@/lib/utils/cn";
import { useChecklist } from "./checklistState";
import { eventTitle, useIsClient } from "./eventFormat";
import { SubPage } from "./EventOverview";
import { handoverPhotoUrl, todayIso, useHandover, type HandoverState } from "./handoverState";
import { SegmentedSlider } from "./SegmentedSlider";
import { ShareMenu } from "./ShareChecklist";

// How long typing in a note rests before it's saved (leaving it saves at once).
const NOTE_SAVE_MS = 800;
// A photo's long side, in pixels: plenty to see a scratch by, small enough
// for a dozen in one email.
const PHOTO_LONG_SIDE = 1600;
const PHOTO_QUALITY = 0.82;

// What new events start with in place of their contact (see
// createPresetEvent): not a name to sign under.
const named = (value: string | null) => {
  const text = value?.trim() ?? "";
  return text && text !== "Contact Name" ? text : null;
};

// Scrolls the page to the heading with this id, just below its title bar,
// which stays over the top of the list. (Not with scrollIntoView, which
// would scroll whatever holds the page as well.)
export function scrollPageTo(id: string) {
  const heading = document.getElementById(id);
  let scroller = heading?.parentElement ?? null;
  while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
  if (!heading || !scroller) return;
  const bar = scroller.querySelector(".sticky")?.getBoundingClientRect().height ?? 0;
  const top = heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - bar - 8;
  scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

// An event's Übergabeprotokoll: the Ausgabe or the Rückgabe (picked at the
// very top, the same form either way), each part of the venue the
// Checkliste brings in a card of items to pass (✓) or fail (✕) — a failed
// one opening for a photo and a note — and at the end the Bestätigung, to
// be signed by the customer's contact and the venue. Its share button
// emails it as a PDF.
export function HandoverPage({
  event,
  people,
  onBack,
  onPickForm,
}: {
  event: EventSummary;
  people: EventPerson[];
  onBack: () => void;
  onPickForm: (form: HandoverFormKey) => void;
}) {
  const state = useHandover();
  const { answer } = useChecklist();
  const sections = visibleProtocol(answer);

  return (
    <SubPage
      title="Übergabeprotokoll"
      backLabel={`Back to ${eventTitle(event)}`}
      onBack={onBack}
      trailing={
        <ShareMenu
          event={event}
          people={people}
          label="Übergabeprotokoll senden"
          send={async (ids, emails) => {
            await state.settled();
            return emailHandover(event.id, state.form, ids, emails, formatHandoverDay(todayIso()));
          }}
        />
      }
    >
      <SegmentedSlider
        options={HANDOVER_FORMS.map((f) => ({ value: f.key, label: f.label }))}
        value={state.form}
        onChange={onPickForm}
        label="Ausgabe oder Rückgabe"
        className="mb-7"
      />
      {state.error && (
        <p role="alert" className="mb-5 rounded-[var(--radius-md)] bg-danger/10 px-3 py-2 text-[14px] text-danger">
          {state.error}
        </p>
      )}
      {/* Keyed by the form, so a note half typed in one doesn't carry over. */}
      <div key={state.form} className="flex flex-col gap-9">
        {sections.map((section, i) => (
          <Section key={section.key} section={section} next={sections[i + 1]?.key ?? "bestaetigung"} eventId={event.id} />
        ))}
        <Confirmation event={event} />
      </div>
    </SubPage>
  );
}

function Section({ section, next, eventId }: { section: HandoverSection; next: string; eventId: string }) {
  const state = useHandover();
  const items = section.groups.flatMap((g) => g.items);
  return (
    <section id={`protokoll-${section.key}`} className="flex scroll-mt-4 flex-col gap-4">
      {/* The ✓ that passes the whole part sits over the rows' ✓s. */}
      <div className="flex items-center gap-3 pr-[47px]">
        <h2 className="min-w-0 flex-1 text-[22px] font-semibold tracking-tight">{section.title}</h2>
        <AcceptAll
          items={items}
          state={state}
          label={section.title}
          onAccepted={() => scrollPageTo(`protokoll-${next}`)}
        />
      </div>
      {section.groups.map((group) => (
        <div key={group.key} id={group.key !== section.key ? `protokoll-${group.key}` : undefined} className="scroll-mt-4">
          {group.title && <h3 className="mb-1.5 px-1 text-[15px] font-semibold">{group.title}</h3>}
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface">
            {group.items.map((item) => (
              <li key={item.key}>
                <ItemRow item={item} eventId={eventId} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

// Passes every item of a part at once — blue while they all are, and
// pressed then, puts them all back to open. Gone while any of them has
// failed. onAccepted: once it's passed them (not on taking it back).
export function AcceptAll({
  items,
  state,
  label,
  onAccepted,
  small = false,
}: {
  items: HandoverItem[];
  state: HandoverState;
  label: string;
  onAccepted?: () => void;
  small?: boolean;
}) {
  const answers = items.map((item) => state.item(item.key));
  if (answers.some((a) => a?.state === "issue")) return null;
  const all = answers.every((a) => a?.state === "ok");
  return (
    <ResultBox
      kind="ok"
      picked={all}
      small={small}
      label={all ? `${label}: alle zurücksetzen` : `${label}: alle bestanden`}
      onPress={() => {
        state.save({
          items: Object.fromEntries(
            items.map((item, i) => [item.key, all ? { ...answers[i], state: null } : { ...answers[i], state: "ok" }]),
          ),
        });
        if (!all) onAccepted?.();
      }}
    />
  );
}

// A ✓ or ✕ box: the mark faint in an outline until it's picked, then
// blue (✓) or red (✕), filled.
export function ResultBox({
  kind,
  picked,
  label,
  onPress,
  small = false,
}: {
  kind: "ok" | "issue";
  picked: boolean;
  label: string;
  onPress: () => void;
  small?: boolean;
}) {
  const Icon = kind === "ok" ? CheckIcon : CloseIcon;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={picked}
      aria-label={label}
      title={label}
      onClick={onPress}
      className={cn(
        "no-press flex shrink-0 items-center justify-center border-2 transition-colors duration-200",
        small ? "h-[22px] w-[22px] rounded-[6px]" : "h-[26px] w-[26px] rounded-[7px]",
        picked
          ? kind === "ok"
            ? "border-accent bg-accent text-white"
            : "border-danger bg-danger text-white"
          : "border-border text-muted/40 hover:text-muted/70",
      )}
    >
      <Icon className={small ? "h-3 w-3" : "h-3.5 w-3.5"} />
    </button>
  );
}

// Sets an item passed or failed — or, the one it is already, open again.
// The note and photos stay with it either way (see HandoverItemAnswer).
export function pickResult(state: HandoverState, key: string, kind: "ok" | "issue") {
  const current = state.item(key);
  state.save({ items: { [key]: { ...current, state: current?.state === kind ? null : kind } } });
}

function ItemRow({ item, eventId }: { item: HandoverItem; eventId: string }) {
  const state = useHandover();
  const answer = state.item(item.key);
  const failed = answer?.state === "issue";
  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-2.5 text-[15px]">
        <span className="w-9 shrink-0 text-[13px] tabular-nums text-muted">{item.number}</span>
        <span className="min-w-0 flex-1">{item.label}</span>
        <ResultBox
          kind="ok"
          picked={answer?.state === "ok"}
          label={`${item.label}: in Ordnung`}
          onPress={() => pickResult(state, item.key, "ok")}
        />
        <ResultBox
          kind="issue"
          picked={failed}
          label={`${item.label}: Mangel`}
          onPress={() => pickResult(state, item.key, "issue")}
        />
      </div>
      {/* Failed, it opens for a photo and a note: the row grows from
          nothing to their height. */}
      <div
        inert={!failed}
        className={cn("grid transition-[grid-template-rows] duration-300 ease-out", failed ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-2.5 pb-3 pl-[56px] pr-3">
            <Photos item={item} answer={answer} eventId={eventId} />
            <NoteField item={item} answer={answer} />
          </div>
        </div>
      </div>
    </div>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.5-2h5.6l1.5 2h2.2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

// A failed item's photos: "Foto" takes one (or picks some from the
// library), each shrunk in the browser and sent straight to storage; a
// thumbnail opens it, its ✕ takes it away.
function Photos({ item, answer, eventId }: { item: HandoverItem; answer: HandoverItemAnswer | null; eventId: string }) {
  const state = useHandover();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // The item as it is once the uploads are done, not as it was when they began.
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  const photos = answer?.photos ?? [];
  const room = MAX_HANDOVER_PHOTOS - photos.length - uploading;

  async function add(files: File[]) {
    const picked = files.slice(0, Math.max(0, room));
    if (!picked.length) return;
    setError(null);
    setUploading((n) => n + picked.length);
    const paths: string[] = [];
    for (const file of picked) {
      try {
        const jpeg = await shrinkPhoto(file);
        const slot = await createHandoverPhotoUpload(eventId);
        if ("error" in slot) throw new Error(slot.error);
        const { error: uploadError } = await createBrowserClient()
          .storage.from("media")
          .uploadToSignedUrl(slot.path, slot.token, jpeg, { contentType: "image/jpeg" });
        if (uploadError) throw new Error(uploadError.message);
        paths.push(slot.path);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Das Foto konnte nicht hochgeladen werden");
      } finally {
        setUploading((n) => n - 1);
      }
    }
    if (!paths.length) return;
    const current = latest.current.item(item.key);
    latest.current.save({
      items: { [item.key]: { ...current, state: current?.state ?? "issue", photos: [...(current?.photos ?? []), ...paths] } },
    });
  }

  function remove(path: string) {
    const current = state.item(item.key);
    state.save({
      items: { [item.key]: { ...current, state: current?.state ?? null, photos: (current?.photos ?? []).filter((p) => p !== path) } },
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label
        className={cn(
          "flex h-16 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius-md)] bg-[var(--control-fill)] text-[12px] font-medium hover:bg-[var(--control-fill-hover)]",
          room <= 0 && "pointer-events-none opacity-40",
        )}
      >
        <CameraIcon className="h-6 w-6" />
        Foto
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={room <= 0}
          className="sr-only"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void add(files);
          }}
        />
      </label>
      {photos.map((path) => (
        <div key={path} className="relative h-16 w-16 shrink-0">
          <a href={handoverPhotoUrl(path)} target="_blank" rel="noreferrer" className="block h-full w-full">
            {/* eslint-disable-next-line @next/next/no-img-element -- a storage photo, shown as it is */}
            <img src={handoverPhotoUrl(path)} alt="" className="h-full w-full rounded-[var(--radius-md)] object-cover" />
          </a>
          <button
            type="button"
            onClick={() => remove(path)}
            aria-label="Foto entfernen"
            className="no-press absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-surface shadow-[0_1px_3px_rgba(0,0,0,0.3)]"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </div>
      ))}
      {Array.from({ length: uploading }, (_, i) => (
        <div key={`up-${i}`} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-black/[.04] dark:bg-white/[.06]">
          <Spinner className="h-4 w-4" />
        </div>
      ))}
      {error && <p className="w-full text-[13px] text-danger">{error}</p>}
    </div>
  );
}

// A failed item's note: saved once typing rests a moment, or at once when
// it's left.
function NoteField({ item, answer }: { item: HandoverItem; answer: HandoverItemAnswer | null }) {
  const state = useHandover();
  const [draft, setDraft] = useState(answer?.note ?? "");
  const saved = useRef(answer?.note ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(state);
  useEffect(() => {
    latest.current = state;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  function flush(text: string) {
    clearTimeout(timer.current);
    if (text === saved.current) return;
    saved.current = text;
    const current = latest.current.item(item.key);
    latest.current.save({ items: { [item.key]: { ...current, state: current?.state ?? "issue", note: text } } });
  }

  return (
    <textarea
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(text), NOTE_SAVE_MS);
      }}
      onBlur={(e) => flush(e.target.value)}
      maxLength={MAX_HANDOVER_NOTE}
      placeholder="Anmerkung"
      aria-label={`Anmerkung zu ${item.label}`}
      rows={2}
      className="block min-h-[3.5rem] w-full resize-none select-text rounded-[var(--radius-md)] border border-border bg-transparent px-3 py-2 text-[15px] outline-none [field-sizing:content] placeholder:text-muted focus:border-accent"
    />
  );
}

// The end of the form: where and when (today's date, until it's first
// signed — that day's, from then on), and two places to sign — the
// customer's contact (whose name can be changed for this form alone) and
// the venue.
function Confirmation({ event }: { event: EventSummary }) {
  const state = useHandover();
  const isClient = useIsClient();
  const { data } = state;
  const day = data.signedOn ?? (isClient ? todayIso() : null);

  function sign(signer: HandoverSigner, png: string | null) {
    const signatures = { ...data.signatures, [signer]: png ?? undefined };
    const any = Object.values(signatures).some(Boolean);
    state.save({
      signatures: { [signer]: png },
      // Dated the day it's first signed; undated again with no signature left.
      ...(any && !data.signedOn ? { signedOn: todayIso() } : !any && data.signedOn ? { signedOn: null } : {}),
    });
  }

  return (
    <section id="protokoll-bestaetigung" className="flex scroll-mt-4 flex-col gap-4">
      <h2 className="text-[22px] font-semibold tracking-tight">Bestätigung</h2>
      <div className="rounded-[var(--radius-md)] border border-border bg-surface px-4 pb-5 pt-4">
        <p className="text-[15px]" suppressHydrationWarning>
          Berlin, den <span className="font-medium tabular-nums">{day ? formatHandoverDay(day) : ""}</span>
        </p>
        <div className="mt-4 flex flex-col gap-6">
          <div>
            <SignaturePad value={data.signatures.veranstalter ?? null} onChange={(png) => sign("veranstalter", png)} label="Unterschrift Veranstalter" />
            <ContactName event={event} />
            <p className="text-[13px] text-muted">Unterschrift Veranstalter</p>
          </div>
          <div>
            <SignaturePad value={data.signatures.eigentuemer ?? null} onChange={(png) => sign("eigentuemer", png)} label="Unterschrift Eigentümer" />
            <p className="mt-2 text-[13px] text-muted">Unterschrift Eigentümer</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// The contact signing for the customer — the event's own, unless changed
// here ("Bearbeiten") for this form alone; cleared, the event's again.
function ContactName({ event }: { event: EventSummary }) {
  const state = useHandover();
  const [editing, setEditing] = useState(false);
  const own = named(event.contactName);
  const name = state.data.contactName ?? own;

  function commit(text: string) {
    setEditing(false);
    const next = text.trim();
    if (next === (name ?? "")) return;
    state.save({ contactName: next && next !== own ? next : null });
  }

  return (
    <div className="mt-2 flex h-[34px] items-center gap-2">
      {editing ? (
        <input
          ref={(node) => {
            if (!node || node.dataset.ready) return;
            node.dataset.ready = "1";
            node.focus();
            node.select();
          }}
          defaultValue={name ?? ""}
          placeholder={own ?? "Name"}
          aria-label="Name des Veranstalters"
          maxLength={MAX_HANDOVER_NAME}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") setEditing(false);
          }}
          className="min-w-0 flex-1 select-text rounded-[6px] bg-black/[.04] px-1.5 py-0.5 text-[15px] font-semibold outline-none ring-1 ring-accent dark:bg-white/[.06]"
        />
      ) : (
        <span className={cn("min-w-0 truncate text-[15px] font-semibold", !name && "font-normal text-muted")}>
          {name ?? "Kein Kontakt"}
        </span>
      )}
      {!editing && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="shrink-0 rounded-full bg-[var(--control-fill)] px-2.5 py-0.5 text-[13px] font-medium hover:bg-[var(--control-fill-hover)]"
        >
          Bearbeiten
        </button>
      )}
    </div>
  );
}

// A place to sign, with a finger or a pen: strokes drawn as they're made,
// saved as a PNG each time one's finished (in black, shown inverted in
// dark mode); "Löschen" takes it away.
function SignaturePad({ value, onChange, label }: { value: string | null; onChange: (png: string | null) => void; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<{ id: number; last: { x: number; y: number } } | null>(null);
  // What's on the canvas, as last drawn or saved — a new value from
  // elsewhere (the server, the other device) is drawn in its place.
  const shown = useRef<string | null>(null);
  const [empty, setEmpty] = useState(!value);

  // Sized to its box, in device pixels, and the value drawn in.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.round(rect.width * dpr);
      const height = Math.round(rect.height * dpr);
      if (canvas.width === width && canvas.height === height) return;
      canvas.width = width;
      canvas.height = height;
      shown.current = null;
      paint(canvas, value);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
    // Only on mount: a new value is drawn by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || shown.current === value) return;
    paint(canvas, value);
  }, [value]);

  function paint(canvas: HTMLCanvasElement, png: string | null) {
    shown.current = png;
    const context = canvas.getContext("2d")!;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setEmpty(!png);
    if (!png) return;
    const image = new Image();
    image.onload = () => {
      if (shown.current !== png) return;
      // Fitted, as it may have been drawn on a canvas another size.
      const scale = Math.min(canvas.width / image.width, canvas.height / image.height);
      context.drawImage(image, 0, 0, image.width * scale, image.height * scale);
    };
    image.src = png;
  }

  function point(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  }

  function stroke(canvas: HTMLCanvasElement, from: { x: number; y: number }, to: { x: number; y: number }) {
    const context = canvas.getContext("2d")!;
    context.strokeStyle = "#000";
    context.lineWidth = Math.max(2, canvas.width / 260);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        aria-label={label}
        role="img"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const at = point(e);
          drawing.current = { id: e.pointerId, last: at };
          // A dot, for a tap.
          stroke(e.currentTarget, at, { x: at.x + 0.1, y: at.y + 0.1 });
          setEmpty(false);
        }}
        onPointerMove={(e) => {
          const d = drawing.current;
          if (!d || d.id !== e.pointerId) return;
          // Every point the pointer passed through, not just the last.
          const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
          const rect = e.currentTarget.getBoundingClientRect();
          for (const ev of events) {
            const at = {
              x: ((ev.clientX - rect.left) / rect.width) * e.currentTarget.width,
              y: ((ev.clientY - rect.top) / rect.height) * e.currentTarget.height,
            };
            stroke(e.currentTarget, d.last, at);
            d.last = at;
          }
        }}
        onPointerUp={(e) => {
          if (drawing.current?.id !== e.pointerId) return;
          drawing.current = null;
          const png = e.currentTarget.toDataURL("image/png");
          shown.current = png;
          onChange(png);
        }}
        onPointerCancel={() => {
          drawing.current = null;
        }}
        className="block h-32 w-full touch-none rounded-[var(--radius-md)] border border-border bg-black/[.02] dark:bg-white/[.03] dark:invert"
      />
      {/* The line to sign on. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-4 bottom-6 h-px bg-border" />
      {empty ? (
        <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center text-[14px] text-muted">
          Hier unterschreiben
        </span>
      ) : (
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current;
            if (canvas) paint(canvas, null);
            onChange(null);
          }}
          className="absolute right-2 top-2 rounded-full bg-[var(--control-fill)] px-2.5 py-0.5 text-[13px] font-medium hover:bg-[var(--control-fill-hover)]"
        >
          Löschen
        </button>
      )}
    </div>
  );
}

// A photo as it's sent: upright, its long side at most PHOTO_LONG_SIDE, as
// a JPEG — whatever the camera gave (HEIC on an iPhone, say).
async function shrinkPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, PHOTO_LONG_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext("2d")!;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", PHOTO_QUALITY));
    if (!blob) throw new Error("Das Foto konnte nicht gelesen werden");
    return blob;
  } catch (err) {
    throw err instanceof Error && err.message.startsWith("Das") ? err : new Error("Das Foto konnte nicht gelesen werden");
  } finally {
    URL.revokeObjectURL(url);
  }
}
