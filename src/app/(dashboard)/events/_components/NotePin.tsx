"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_PIN_NOTE } from "@/lib/eventPins";
import { MapCard } from "./VenueMap";

// Two taps (or clicks) this close together are a double tap.
const DOUBLE_TAP_MS = 350;
// How long typing rests before it's saved (leaving the field saves at once).
const NOTE_SAVE_MS = 800;

// A note on the map ("Notiz"): one of the event's own pins, its card
// holding text typed in freely. Placed, it opens to be written in; once
// it's been left, the text stays as it is, and only a double tap on the
// pin or its card (or a double click) opens it to be written in again. A
// tap on its title opens or closes it, as on any card. A note left empty
// goes (onDone with "").
export function NotePin({
  note,
  open,
  editing,
  canEdit,
  onOpenChange,
  onEdit,
  onSave,
  onDone,
}: {
  note: string;
  open: boolean;
  // Being written in.
  editing: boolean;
  // An event's own, open — not one shown in a preview.
  canEdit: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  // The text as it's typed, saved now and then.
  onSave: (text: string) => void;
  // Left: the text it's been left with.
  onDone: (text: string) => void;
}) {
  const lastTap = useRef(0);
  // A double tap writes in it; a single one does what it does elsewhere.
  function tap(single?: () => void) {
    const now = performance.now();
    if (canEdit && now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0;
      onEdit();
      return;
    }
    lastTap.current = now;
    single?.();
  }

  return (
    <MapCard title="Notiz" open={open} onToggle={() => tap(() => onOpenChange(!open))} onTitlePress={() => tap(() => onOpenChange(!open))}>
      {editing ? (
        <NoteEditor note={note} onSave={onSave} onDone={onDone} />
      ) : (
        <div onClick={() => tap()} className="flex flex-col gap-1.5">
          <p className="select-text whitespace-pre-wrap break-words text-[15px] leading-snug">{note}</p>
          {canEdit && <p className="text-[12px] text-muted">Doppeltippen zum Bearbeiten</p>}
        </div>
      )}
    </MapCard>
  );
}

// The note being written: saved as it's typed, and done with once it's
// left — the field blurred, or the card closed under it.
function NoteEditor({
  note,
  onSave,
  onDone,
}: {
  note: string;
  onSave: (text: string) => void;
  onDone: (text: string) => void;
}) {
  const [text, setText] = useState(note);
  const textRef = useRef(note);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const done = useRef(false);
  // The latest of the callbacks, for finishing up as it closes.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  function finish() {
    if (done.current) return;
    done.current = true;
    clearTimeout(timer.current);
    onDoneRef.current(textRef.current);
  }
  // Closed while still being written in (a tap on the map, say) — a moment
  // later, so a remount straight after (React's development double
  // mount) doesn't count as leaving it.
  const leaving = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    clearTimeout(leaving.current);
    return () => {
      leaving.current = setTimeout(finish, 0);
    };
  }, []);

  return (
    <textarea
      ref={(node) => {
        if (!node || node.dataset.ready) return;
        node.dataset.ready = "1";
        node.focus();
        node.setSelectionRange(node.value.length, node.value.length);
      }}
      value={text}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        textRef.current = next;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => onSave(next), NOTE_SAVE_MS);
      }}
      onBlur={finish}
      maxLength={MAX_PIN_NOTE}
      rows={4}
      placeholder="Notiz schreiben …"
      aria-label="Notiz"
      className="w-full resize-none select-text rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-[15px] leading-snug outline-none focus:border-accent"
    />
  );
}
