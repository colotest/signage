"use client";

import { createContext, useContext, useRef, useState } from "react";
import { updateHandover } from "@/lib/actions/handover";
import type { EventSummary } from "@/lib/events";
import {
  applyHandoverPatch,
  emptyHandoverForm,
  isHandoverForm,
  type HandoverFormData,
  type HandoverFormKey,
  type HandoverItemAnswer,
  type HandoverPatch,
} from "@/lib/uebergabeprotokoll";

// The open event's Übergabeprotokoll, shared by its page and the venue
// map's pins (which pass and fail the same items): what either changes
// shows on both at once, ahead of the server — as the Checkliste's answers
// are (see checklistState).
export type HandoverState = {
  form: HandoverFormKey;
  data: HandoverFormData;
  item: (key: string) => HandoverItemAnswer | null;
  save: (patch: HandoverPatch) => void;
  // Once every save so far has landed (before emailing it, say).
  settled: () => Promise<void>;
  error: string | null;
};

export const HandoverStateContext = createContext<HandoverState | null>(null);

export function useHandover(): HandoverState {
  const state = useContext(HandoverStateContext);
  if (!state) throw new Error("useHandover needs a HandoverStateContext above it");
  return state;
}

// Which of the two is open, by the URL (?view=uebergabeprotokoll&form=…):
// the Ausgabe unless it says the Rückgabe.
export function handoverFormIn(params: URLSearchParams): HandoverFormKey {
  const form = params.get("form");
  return isHandoverForm(form) ? form : "ausgabe";
}

// Two patches as one, the later's over the earlier's.
function merge(a: HandoverPatch | undefined, b: HandoverPatch): HandoverPatch {
  return {
    ...a,
    ...b,
    items: { ...a?.items, ...b.items },
    signatures: { ...a?.signatures, ...b.signatures },
  };
}

export function useHandoverState(event: EventSummary | undefined, form: HandoverFormKey): HandoverState {
  // Changes made here, ahead of the server (which catches up on the next
  // render of the page), by form — for the open event; another starts afresh.
  const [edits, setEdits] = useState<Partial<Record<HandoverFormKey, HandoverPatch>>>({});
  const [error, setError] = useState<string | null>(null);
  const [editsFor, setEditsFor] = useState(event?.id);
  if (editsFor !== event?.id) {
    setEditsFor(event?.id);
    setEdits({});
    setError(null);
  }
  // Saves go one after another, so an older answer can't land after a newer.
  const saveChain = useRef(Promise.resolve());

  const stored = event?.handover[form] ?? emptyHandoverForm();
  const patch = edits[form];
  const data = patch ? applyHandoverPatch(stored, patch) : stored;
  return {
    form,
    data,
    item: (key) => data.items[key] ?? null,
    save: (change) => {
      if (!event) return;
      const id = event.id;
      setEdits((all) => ({ ...all, [form]: merge(all[form], change) }));
      saveChain.current = saveChain.current
        .then(async () => setError(await updateHandover(id, form, change)))
        .catch(() => setError("Konnte nicht gespeichert werden"));
    },
    settled: () => saveChain.current,
    error,
  };
}

// Today, the venue's (the browser's) own: YYYY-MM-DD.
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A photo's address, from its path in the (public) media bucket.
export function handoverPhotoUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/${path}`;
}
