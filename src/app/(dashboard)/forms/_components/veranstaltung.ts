import { useCallback, useSyncExternalStore } from "react";

// What the venue map's cards record (so far, how the entrance is run), and
// where it's kept: this browser's localStorage for now — nothing is saved
// to the database yet, so it stays on the device it was set on.

export type EntryMode = "frei" | "ticketing";

export type Veranstaltung = {
  eingang: EntryMode | null;
};

export const ENTRY_MODES: { value: EntryMode; label: string; hint: string }[] = [
  { value: "frei", label: "Frei", hint: "Offener Einlass, keine Kontrolle" },
  { value: "ticketing", label: "Ticketing", hint: "Einlass mit Ticketkontrolle" },
];

const EMPTY: Veranstaltung = { eingang: null };

const STORAGE_KEY = "forms:veranstaltung:v1";

// A tiny external store over localStorage, so the server render and the
// first client render agree (both EMPTY) and the saved answers come in
// straight after, with no effect setting state.
let current: Veranstaltung | null = null;
const listeners = new Set<() => void>();

function read(): Veranstaltung {
  if (current) return current;
  current = EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) current = { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    // Private mode or blocked storage — start empty.
  }
  return current!;
}

function write(next: Veranstaltung) {
  current = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Not persisted; the page keeps working on what's in memory.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVeranstaltung() {
  const value = useSyncExternalStore(subscribe, read, () => EMPTY);
  const update = useCallback((patch: Partial<Veranstaltung>) => write({ ...read(), ...patch }), []);
  return [value, update] as const;
}
