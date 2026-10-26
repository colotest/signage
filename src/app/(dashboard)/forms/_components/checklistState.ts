"use client";

import { createContext, useContext, useRef, useState } from "react";
import { updateChecklist } from "@/lib/actions/events";
import { exclusiveWith, withConsequences } from "@/lib/checkliste";
import type { EventSummary } from "@/lib/events";

export type Answer = true | string | null;

// The open event's Checkliste answers, shared by its setup page and the
// venue map's pins (which tick some of the same boxes): what either changes
// shows on both at once, ahead of the server.
export type ChecklistState = {
  answer: (key: string) => Answer;
  // Several fields at once (a pin that ticks one box and unticks another);
  // null clears one.
  save: (patch: Record<string, Answer>) => void;
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
    save: (change) => {
      if (!event) return;
      const id = event.id;
      // With what follows from it (Kino 2 or 3 bringing Wagenhalle 'Kino',
      // the halls deciding exklusiv) — saved as one change.
      const patch = withConsequences(change, answer);
      // In a one-answer section a tick takes the others' away (the server
      // does the same; this shows it at once).
      const full = { ...patch };
      for (const [key, value] of Object.entries(patch)) {
        if (value === true) for (const other of exclusiveWith(key)) if (!(other in patch)) full[other] = null;
      }
      setEdits((all) => ({ ...all, ...full }));
      saveChain.current = saveChain.current
        .then(async () => setError(await updateChecklist(id, patch)))
        .catch(() => setError("Konnte nicht gespeichert werden"));
    },
    error,
  };
}
