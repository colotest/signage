// A Wix event title, taken apart for a poster: the name to set big, and
// whatever else the title carries on its own smaller lines — a series or
// format above it ("Buchpremiere und Lesung"), a subtitle below it ("with
// special guest Marlais"), and a status as a label ("AUSVERKAUFT"). Long
// titles read poorly in one block because they're usually several of
// these run together; set apart, the name itself can go much larger.
//
// By rule, from how the venue writes its titles — the first that applies:
//   Die Müll Message – Recycling Poetry Slam   a dash or colon between them
//   Lesung: Name                                …unless what's before it is a format
//   Peter Broderick … with special guest Marlais  a guest named after the act
//   Gysis Begegnungen mit … Eva Mattes          a series, then "…", then the guest
//   Buchpremiere und Lesung ICH KOMM’ NIE …     a lead-in, then the name in capitals
// A status word at the end comes off first. When the title has no subtitle
// of its own, Wix's short description is one if it reads like one: short,
// one phrase, not a sentence cut off. Anything else stays whole, as written.

export type PosterText = {
  kicker: string | null;
  headline: string;
  subtitle: string | null;
  badge: string | null;
};

// Said of the event, at the end of its title.
const STATUSES = ["ausverkauft", "zusatzshow", "zusatztermin", "zusatzkonzert", "neuer termin", "verlegt", "abgesagt", "sold out", "restkarten"];

// Kinds of evening: before a dash or colon, they're the lead-in, not the name.
const FORMATS =
  /^(buch)?premiere|^lesung|^konzert|^live[- ]?podcast|^podcast|^comedy|^kabarett|^vortrag|^gespräch|^talk|^release[- ]?party|^party|^show|^kino|^film|^screening|^festival/i;

// Where a guest is named after the act; the subtitle starts there.
const GUEST = /\s+(?=(?:with|w\/|plus|\+)?\s*(?:special guests?|feat\.|featuring|ft\.|support:|zu gast bei|mit gästen|& gäste|und gäste)\s)/i;

// Between a name and what follows it.
const SEPARATOR = /\s+[–—-]\s+|:\s+|\s+\|\s+/;

// How long a short description may be and still be a subtitle.
const SUBTITLE_MAX = 64;

export function titleParts(rawTitle: string, description = ""): PosterText {
  let title = rawTitle.replace(/\s+/g, " ").trim();
  let badge: string | null = null;
  for (const status of STATUSES) {
    const match = title.match(new RegExp(`[\\s–—-]+${status.replace(" ", "\\s+")}!?$`, "i"));
    if (match && match.index! > 0) {
      badge = status.toUpperCase();
      title = title.slice(0, match.index).trim();
      break;
    }
  }

  const parts = split(title);
  if (!parts.subtitle) parts.subtitle = subtitleFrom(description, title);
  return { ...parts, badge };
}

function split(title: string): Omit<PosterText, "badge"> {
  const whole = { kicker: null, headline: title, subtitle: null };

  const separator = title.match(SEPARATOR);
  if (separator && separator.index! > 0) {
    const before = title.slice(0, separator.index).trim();
    const after = title.slice(separator.index! + separator[0].length).trim();
    if (after) {
      return FORMATS.test(before) ? { kicker: before, headline: after, subtitle: null } : { kicker: null, headline: before, subtitle: after };
    }
  }

  const guest = title.match(GUEST);
  if (guest && guest.index! > 0) {
    return { kicker: null, headline: title.slice(0, guest.index).trim(), subtitle: title.slice(guest.index).trim() };
  }

  const ellipsis = title.match(/(…|\.\.\.)\s*/);
  if (ellipsis && ellipsis.index! > 0) {
    const after = title.slice(ellipsis.index! + ellipsis[0].length).trim();
    if (after) return { kicker: title.slice(0, ellipsis.index! + ellipsis[1].length).trim(), headline: after, subtitle: null };
  }

  // A lead-in in ordinary case, then the name in capitals, two words or
  // more of it, to the end.
  const words = title.split(" ");
  const caps = (word: string) => /\p{L}{2}/u.test(word) && word === word.toUpperCase();
  let from = words.length;
  while (from > 0 && (caps(words[from - 1]) || !/\p{L}/u.test(words[from - 1]))) from--;
  const lead = words.slice(0, from);
  if (words.length - from >= 2 && lead.length >= 1 && lead.some((word) => /\p{Ll}/u.test(word))) {
    return { kicker: lead.join(" "), headline: words.slice(from).join(" "), subtitle: null };
  }

  return whole;
}

function subtitleFrom(description: string, title: string): string | null {
  const text = description.replace(/\s+/g, " ").trim();
  if (!text || text.length > SUBTITLE_MAX) return null;
  // Cut off, or more than one sentence: a blurb, not a subtitle.
  if (/(…|\.\.\.)$/.test(text) || /[.!?]\s+\p{L}/u.test(text)) return null;
  // Saying nothing the title doesn't.
  if (text.toLowerCase() === title.toLowerCase()) return null;
  return text;
}
