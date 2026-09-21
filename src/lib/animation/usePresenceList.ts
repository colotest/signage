import { useCallback, useState } from "react";

export type PresenceState = "entering" | "present" | "exiting";

export type PresenceEntry<T> = {
  // Stable across an item's id changing (see matchKey below) — use it as
  // the React key so the row isn't remounted.
  renderKey: string;
  key: string;
  item: T;
  state: PresenceState;
};

// Tracks a list's items across updates so rows can animate in and out:
// items that weren't there before arrive "entering"; items that vanish are
// kept, in place, as "exiting" until their row calls onExited once its exit
// animation is done. Whatever's there on first render is simply "present".
//
// matchKey pairs an item that vanished with one that appeared in the same
// update — an optimistic row being swapped for its saved copy, which gets a
// new id but is still the same entry on screen. Paired items carry straight
// on (keeping the old renderKey) instead of animating out and back in.
export function usePresenceList<T>(
  items: T[],
  getKey: (item: T) => string,
  matchKey?: (item: T) => string,
): [PresenceEntry<T>[], (renderKey: string) => void] {
  const [prevItems, setPrevItems] = useState(items);
  const [entries, setEntries] = useState<PresenceEntry<T>[]>(() =>
    items.map((item) => ({ renderKey: getKey(item), key: getKey(item), item, state: "present" })),
  );

  let current = entries;
  if (items !== prevItems) {
    current = reconcile(entries, items, getKey, matchKey);
    setPrevItems(items);
    setEntries(current);
  }

  const onExited = useCallback((renderKey: string) => {
    setEntries((list) => list.filter((e) => !(e.renderKey === renderKey && e.state === "exiting")));
  }, []);

  return [current, onExited];
}

function reconcile<T>(
  previous: PresenceEntry<T>[],
  items: T[],
  getKey: (item: T) => string,
  matchKey?: (item: T) => string,
): PresenceEntry<T>[] {
  const previousByKey = new Map(previous.map((e) => [e.key, e]));
  const nextKeys = new Set(items.map(getKey));

  // Rows that just left, available for pairing with a newcomer.
  const departed = previous.filter((e) => e.state !== "exiting" && !nextKeys.has(e.key));
  const unpaired = new Set(departed);

  const next: PresenceEntry<T>[] = items.map((item) => {
    const key = getKey(item);
    const existing = previousByKey.get(key);
    // Includes a row brought back mid-exit (e.g. a failed delete restored).
    if (existing) return { renderKey: existing.renderKey, key, item, state: "present" };

    const match = matchKey?.(item);
    const partner =
      match !== undefined ? departed.find((e) => unpaired.has(e) && matchKey?.(e.item) === match) : undefined;
    if (partner) {
      unpaired.delete(partner);
      return { renderKey: partner.renderKey, key, item, state: "present" };
    }
    return { renderKey: key, key, item, state: "entering" };
  });

  // Put leaving rows back where they were, so they animate out in place.
  previous.forEach((entry, index) => {
    const leaving = entry.state === "exiting" ? !nextKeys.has(entry.key) : unpaired.has(entry);
    if (!leaving) return;
    next.splice(Math.min(index, next.length), 0, { ...entry, state: "exiting" });
  });

  return next;
}
