import "server-only";

// The events on sale at colosseumberlin.com/event, read off the page
// itself: it's a Wix site, and the Events widget ships its list in the
// page as JSON (the "wix-warmup-data" script) before any of it is drawn.
// Only what the page first shows, though — the widget loads the rest on
// scrolling — so events far enough out may be missing until they move up.
// Wix's Events API (with the site's own key) would give all of them; this
// is the stand-in until that's set up.

const SOURCE = "https://www.colosseumberlin.com/event";
const SITE = "https://www.colosseumberlin.com";

export type TicketEvent = {
  // Wix's own id, which stays put when the event is renamed or moved.
  id: string;
  title: string;
  // Wix's short description, which is often a subtitle ("Schauspielerin",
  // "10 Jahre „Nur zu Besuch“") and sometimes a blurb's first sentence.
  description: string;
  // ISO instants, and the time zone the venue gives them in.
  start: string;
  end: string;
  timeZone: string;
  // Where tickets are sold: Wix's own event page, or the outside shop the
  // event links to.
  ticketUrl: string;
  // The event's picture on the site (Wix's file id, for its image
  // service), if it has one.
  image: { id: string; width: number; height: number } | null;
};

// Wix's registration statuses that mean tickets can be had: its own
// checkout (OPEN_TICKETS) or a link out to another shop (OPEN_EXTERNAL).
const ON_SALE = new Set([5, 6]);
const EXTERNAL = 3;

type WixEvent = {
  id?: string;
  title?: string;
  description?: string;
  slug?: string;
  status?: number;
  scheduling?: { config?: { startDate?: string; endDate?: string; timeZoneId?: string; scheduleTbd?: boolean } };
  registration?: { type?: number; status?: number; external?: { registration?: string } | null };
  mainImage?: { id?: string; width?: number; height?: number } | null;
};

export async function fetchTicketEvents(): Promise<TicketEvent[]> {
  const res = await fetch(SOURCE, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ColoCloud)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`colosseumberlin.com/event answered ${res.status}`);
  const html = await res.text();

  const match = html.match(/<script[^>]*id="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) throw new Error("colosseumberlin.com/event no longer carries its events in the page");
  const events = findEvents(JSON.parse(match[1]));
  // Nothing at all is far likelier the page changing than the venue having
  // nothing on — and an empty list would put every poster in the archive.
  if (events.length === 0) throw new Error("No events found on colosseumberlin.com/event");
  return events;
}

// Any object with a title, a slug and a schedule is an event, wherever
// in the warmup data Wix keeps it (its keys there are the widget's ids,
// which change when the page is edited). The same event can sit in more
// than one list, so each is taken once — and an event duplicated in Wix
// (the copy's title ends "(1)") is the same event: one with the same title
// and start is taken once too, the original over its copy.
function findEvents(data: unknown): TicketEvent[] {
  const found = new Map<string, TicketEvent>();
  const copies = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const event = node as WixEvent;
    if (event.id && event.title && event.slug && event.scheduling?.config) {
      const parsed = toTicketEvent(event);
      if (parsed && !found.has(parsed.event.id)) {
        found.set(parsed.event.id, parsed.event);
        if (parsed.copy) copies.add(parsed.event.id);
      }
      return;
    }
    Object.values(node).forEach(walk);
  };
  walk(data);

  const once = new Map<string, TicketEvent>();
  for (const event of found.values()) {
    const key = `${event.title.toLowerCase()}|${event.start}`;
    const kept = once.get(key);
    if (!kept || (copies.has(kept.id) && !copies.has(event.id))) once.set(key, event);
  }
  return [...once.values()].sort((a, b) => a.start.localeCompare(b.start));
}

// Wix's numbering of a duplicated event's title.
const COPY_SUFFIX = /\s*\(\d+\)$/;

function toTicketEvent(event: WixEvent): { event: TicketEvent; copy: boolean } | null {
  const config = event.scheduling!.config!;
  const registration = event.registration;
  if (!config.startDate || config.scheduleTbd) return null;
  if (!registration || !ON_SALE.has(registration.status ?? -1)) return null;
  // Over and done with, should the page still list it.
  if (new Date(config.endDate ?? config.startDate) < new Date()) return null;

  const own = `${SITE}/event-details/${event.slug}`;
  const external = registration.type === EXTERNAL ? registration.external?.registration?.trim() : undefined;
  const title = event.title!.replace(/\s+/g, " ").trim();
  return {
    event: {
      id: event.id!,
      // As written on the site, but with its stray double spaces closed up
      // ("Elena Gruschka  AUSVERKAUFT") and a copy's "(1)" left off.
      title: title.replace(COPY_SUFFIX, ""),
      description: (event.description ?? "").trim(),
      start: config.startDate,
      end: config.endDate ?? config.startDate,
      timeZone: config.timeZoneId ?? "Europe/Berlin",
      ticketUrl: ascii(external && !pointsHome(external) ? external : own),
      image: imageOf(event),
    },
    copy: COPY_SUFFIX.test(title),
  };
}

// The event's picture cut to exactly width × height, from its middle, by
// Wix's own image service — always a JPEG, whatever was uploaded.
export function eventImageUrl(image: NonNullable<TicketEvent["image"]>, width: number, height: number) {
  return `https://static.wixstatic.com/media/${encodeURIComponent(image.id)}/v1/fill/w_${Math.round(width)},h_${Math.round(height)},al_c,q_85/image.jpg`;
}

function imageOf(event: WixEvent): TicketEvent["image"] {
  const { id, width, height } = event.mainImage ?? {};
  return id && width && height ? { id, width, height } : null;
}

// Escaped, as a browser would send it ("dreißig" in a path): not every
// phone's camera reads a QR code's non-ASCII the same way.
function ascii(url: string) {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

// An outside link that's only the site's own front page (one event has
// "http://www.colosseumberlin.com") says nothing a QR code should send
// people to: the event's own page does better.
function pointsHome(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "") === "colosseumberlin.com" && parsed.pathname.replace(/\/+$/, "") === "";
  } catch {
    return true;
  }
}
