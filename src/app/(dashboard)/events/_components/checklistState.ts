"use client";

import { createContext, useContext, useRef, useState } from "react";
import { updateChecklist, updateEvent } from "@/lib/actions/events";
import { expandChange, presetChange } from "@/lib/checklistPresets";
import type { EventSummary } from "@/lib/events";
import { EVENT_TYPES, type EventTypeKey } from "@/lib/eventTypes";

export type Answer = true | string | null;

// The open event's Checkliste answers, shared by its setup page and the
// venue map's pins (which tick some of the same boxes): what either changes
// shows on both at once, ahead of the server.
export type ChecklistState = {
  answer: (key: string) => Answer;
  // Several fields at once (a pin that ticks one box and unticks another);
  // null clears one. exact: saved just as it is, without what would
  // follow from it — a change that already has its consequences in it (a
  // reviewed type switch).
  save: (patch: Record<string, Answer>, exact?: boolean) => void;
  error: string | null;
};

export const ChecklistStateContext = createContext<ChecklistState | null>(null);

export function useChecklist(): ChecklistState {
  const state = useContext(ChecklistStateContext);
  if (!state) throw new Error("useChecklist needs a ChecklistStateContext above it");
  return state;
}

export function useChecklistState(event: EventSummary | undefined): ChecklistState {
  // Changes made here, ahead of the server (which catches up on the next
  // render of the page) — for the open event; another one starts afresh.
  const [edits, setEdits] = useState<Record<string, Answer>>({});
  const [error, setError] = useState<string | null>(null);
  const [editsFor, setEditsFor] = useState(event?.id);
  if (editsFor !== event?.id) {
    setEditsFor(event?.id);
    setEdits({});
    setError(null);
  }
  // Saves go one after another, so an older answer can't land after a newer.
  const saveChain = useRef(Promise.resolve());

  const answer = (key: string): Answer => (key in edits ? edits[key] : (event?.checklist[key] ?? null));
  return {
    answer,
    save: (change, exact = false) => {
      if (!event) return;
      const id = event.id;
      // With what follows from it (Kino 2 or 3 bringing Wagenhalle 'Kino',
      // the halls deciding exklusiv; in a one-answer section, a tick taking
      // the others away) — saved as one change.
      const patch = exact ? change : expandChange(change, answer);
      setEdits((all) => ({ ...all, ...patch }));
      saveChain.current = saveChain.current
        .then(async () => setError(await updateChecklist(id, patch)))
        .catch(() => setError("Konnte nicht gespeichert werden"));
    },
    error,
  };
}

// The type a switch to which is being reviewed (see ChecklistReview), by
// the URL (?view=checkliste&review=…) — not one the event has already
// (come back to after it was saved): that's just its Checkliste.
export function reviewTypeIn(params: URLSearchParams, event: EventSummary | undefined): EventTypeKey | null {
  if (!event || params.get("view") !== "checkliste") return null;
  const type = EVENT_TYPES.find((t) => t.key === params.get("review"))?.key ?? null;
  return type !== event.eventType ? type : null;
}

// The options a reviewed switch ticks (shown green while they stay ticked)
// and unticks (red, with an ✕, while they stay unticked) — on the
// Checkliste and the map's pins alike.
export type ReviewMarks = { checked: Set<string>; unchecked: Set<string> };

export type ChecklistReviewState = {
  type: EventTypeKey;
  marks: ReviewMarks;
  // The Checkliste as the switch leaves it: changed here, saved nowhere.
  state: ChecklistState;
  // Saves it, and the type.
  commit: () => void;
};

export const ChecklistReviewContext = createContext<ChecklistReviewState | null>(null);

export function useReviewMarks(): ReviewMarks | null {
  return useContext(ChecklistReviewContext)?.marks ?? null;
}

// A switch to type being reviewed, as a draft over the event's own answers
// (real): worked out as the list stands when the review opens, and dropped
// when it closes.
export function useChecklistReview(
  event: EventSummary | undefined,
  type: EventTypeKey | null,
  real: ChecklistState,
): ChecklistReviewState | null {
  const key = event && type ? `${event.id}:${type}` : null;
  const [review, setReview] = useState<{
    key: string;
    marks: ReviewMarks;
    displaced: Record<string, string[]>;
    draft: Record<string, Answer>;
  } | null>(null);
  if ((review?.key ?? null) !== key) {
    if (!event || !type || !key) setReview(null);
    else {
      const change = presetChange(event.eventType, type, real.answer);
      setReview({
        key,
        marks: { checked: new Set(change.checked), unchecked: new Set(change.unchecked) },
        displaced: change.displaced,
        draft: change.patch,
      });
    }
  }
  if (!event || !type || !review || review.key !== key) return null;

  const { draft } = review;
  const answer = (k: string): Answer => (k in draft ? draft[k] : real.answer(k));
  return {
    type,
    marks: review.marks,
    state: {
      answer,
      save: (change) => {
        // An option the switch ticked, unticked again, brings back what it
        // pushed out (see presetChange) — as the list's own rules have it.
        const full = { ...change };
        for (const [k, value] of Object.entries(change)) {
          if (value !== null || answer(k) !== true) continue;
          for (const out of review.displaced[k] ?? []) if (!(out in full) && answer(out) !== true) full[out] = true;
        }
        setReview((r) => (r ? { ...r, draft: { ...r.draft, ...expandChange(full, answer) } } : r));
      },
      error: real.error,
    },
    commit: () => {
      const changed = Object.fromEntries(Object.entries(draft).filter(([k, value]) => value !== real.answer(k)));
      if (Object.keys(changed).length) real.save(changed, true);
      void updateEvent(event.id, { eventType: type }).catch(() => {});
    },
  };
}
