import type { AreaPoint } from "@/lib/eventAreas";
import { VENUE_AREAS } from "@/lib/venueAreas";
import type { Floor } from "@/lib/venueFloors";

// The Guests page (/guests): the venue introduced one place at a time, in
// the order the page reads, each with its spot on the venue map. A tap on
// that spot (or inside its area) scrolls the page to it, and scrolling to it
// brings it up on the map.
//
// Placed like the map's pins — u and v as a fraction of the plan's width and
// height, on one floor — and an area, if it has one, like an event's.
// Pictures live in public/guests/.
export type GuestPicture = { src: string; alt: string; caption?: string };

export type GuestTopic = {
  id: string;
  title: string;
  floor: Floor;
  u: number;
  v: number;
  area?: AreaPoint[];
  // Paragraphs.
  body: string[];
  pictures?: GuestPicture[];
};

// TODO: text and pictures from the venue's Craft document. The places and
// their spots are the map's own standing pins (see EventsView's
// DEFAULT_PINS); a topic with no body shows as still to come.
export const GUEST_TOPICS: GuestTopic[] = [
  { id: "eingang-gleimstrasse", title: "Eingang Gleimstraße", floor: "eg", u: 0.5293, v: 0.9119, body: [] },
  { id: "eingang-schoenhauser", title: "Eingang Schönhauser Allee", floor: "eg", u: 0.9006, v: 0.7699, body: [] },
  { id: "garderobe", title: "Garderobe", floor: "eg", u: 0.4669, v: 0.5777, body: [] },
  { id: "halle", title: "Halle", floor: "eg", u: 0.283, v: 0.5576, area: VENUE_AREAS.H.points, body: [] },
  { id: "main-bar", title: "Main Bar", floor: "eg", u: 0.1674, v: 0.4862, body: [] },
  { id: "kino-1", title: "Kino 1", floor: "eg", u: 0.7541, v: 0.7169, body: [] },
  {
    id: "zwischenebene",
    title: "Zwischenebene",
    floor: "zwischen",
    u: 0.477,
    v: 0.5235,
    area: VENUE_AREAS.ZW.points,
    body: [],
  },
  { id: "galerie", title: "Galerie", floor: "og", u: 0.1941, v: 0.5202, area: VENUE_AREAS.OG.points, body: [] },
  { id: "galerie-bar", title: "Galerie Bar", floor: "og", u: 0.4054, v: 0.5179, body: [] },
  { id: "barrierefreiheit", title: "Barrierefreiheit", floor: "eg", u: 0.4652, v: 0.8454, body: [] },
];
