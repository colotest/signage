import "server-only";
import { createHash } from "node:crypto";
import type { TicketEvent } from "./events";
import type { PosterImage } from "./posterPdf";

// A month's title page (see programmePdf): which month an event is in,
// and the three of its events' pictures that go on it.

const MONTH_NAMES = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export type ProgrammeMonth = {
  // "2026-12", for its poster's source key.
  key: string;
  // "Dezember".
  name: string;
  year: number;
};

// The month an event starts in, where it's on.
export function monthOf(event: TicketEvent): ProgrammeMonth {
  const part = (options: Intl.DateTimeFormatOptions) =>
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: event.timeZone, ...options }).format(new Date(event.start)));
  const year = part({ year: "numeric" });
  const month = part({ month: "numeric" });
  return { key: `${year}-${String(month).padStart(2, "0")}`, name: MONTH_NAMES[month - 1], year };
}

// Three of the pictures, picked at random — but the same three for as
// long as the month's events stay the same, so a pull doesn't remake its
// title page for nothing: shuffled by a seed taken from the month and
// the pictures themselves.
export function pickPictures(month: string, pictures: { id: string; image: PosterImage }[], count = 3): PosterImage[] {
  const sorted = [...pictures].sort((a, b) => a.id.localeCompare(b.id));
  const seed = createHash("sha256")
    .update(month + sorted.map((p) => p.id).join(","))
    .digest();
  let state = seed.readUInt32LE(0);
  // mulberry32: small, and the same on every server.
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = sorted.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
  }
  return sorted.slice(0, count).map((p) => p.image);
}
