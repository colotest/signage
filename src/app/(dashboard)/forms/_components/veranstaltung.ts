import { useCallback, useSyncExternalStore } from "react";

// The 'Veranstaltung' form: what it asks, and where its answers are kept.
// For now that's this browser's localStorage — nothing is saved to the
// database yet, so notes stay on the device they were taken on.

export type EventType = "tagung" | "premiere" | "markt";
export type Duration = "frueh" | "spaet" | "ganztags" | "plus";
export type EntryMode = "frei" | "ticketing";

export type Veranstaltung = {
  typ: EventType | null;
  gaeste: number;
  dauer: Duration | null;
  eingang: EntryMode | null;
};

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: "tagung", label: "Tagung" },
  { value: "premiere", label: "Prämiere" },
  { value: "markt", label: "Markt" },
];

export const DURATIONS: { value: Duration; label: string }[] = [
  { value: "frueh", label: "Früh" },
  { value: "spaet", label: "Spät" },
  { value: "ganztags", label: "Ganztags" },
  { value: "plus", label: "+" },
];

export const ENTRY_MODES: { value: EntryMode; label: string; hint: string }[] = [
  { value: "frei", label: "Frei", hint: "Offener Einlass, keine Kontrolle" },
  { value: "ticketing", label: "Ticketing", hint: "Einlass mit Ticketkontrolle" },
];

export const GUESTS_MAX = 5000;

const EMPTY: Veranstaltung = { typ: null, gaeste: 0, dauer: null, eingang: null };

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
