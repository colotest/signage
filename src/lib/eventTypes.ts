// The kinds of event the Forms page knows (events.event_type, 0037), in the
// order its picker shows them. Shared by the page and the action that
// checks what it's sent; the migration's check lists the same keys.
// stacked: the name broken over two lines, for the type's square tile,
// where it wouldn't fit on one.
export const EVENT_TYPES = [
  { key: "messe", label: "Messe" },
  { key: "kongress", label: "Kongress/Tagung", stacked: "Kongress/\nTagung" },
  { key: "firmenfeier", label: "Firmenfeier", stacked: "Firmen-\nfeier" },
  { key: "konzert", label: "Konzert" },
  { key: "screening", label: "Screening" },
  { key: "sonstiges", label: "Sonstiges" },
] as const;

export type EventTypeKey = (typeof EVENT_TYPES)[number]["key"];
