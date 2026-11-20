import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { COLOSSEUM_MARK } from "@/lib/colosseumMark";
import { eventImageUrl, type TicketEvent } from "./events";
import { hyphenationPieces } from "./hyphenate";
import { titleParts, type PosterText } from "./titleParts";

// A Kultur Poster: one event on one page, in three sizes — A1 for print, a
// 9:16 still for the portrait screens and a 16:9 one for the newsletter.
// On the house's warm white, in its deep red: the cursive Colosseum and
// PRÄSENTIERT under it; the event's name in capitals, as large as it
// fits, flush left — with the rest of its title on smaller lines of its
// own, a series or format above it, a subtitle below it and a status as a
// label (see titleParts); then its date, and the QR code to its tickets
// (in black, for the cameras). Upright, those run top to bottom, the date
// and QR code at the bottom centre; across, the title takes the left of
// the page at full height, and the rest stands in a column at its right,
// the brand at its top and the date and QR code at its foot. The type is
// all Colo (Compacta), the brand's own face, and everything is drawn as
// vectors (the QR code too), so A1 prints sharp. The newsletter's also
// carries the event's picture from the site, at its right, level with the
// title, and the date over it, level with the brand — and no QR code, a
// newsletter's reader being a click from the tickets anyway.
// Measurements are the house example's, on its 1080-wide still, scaled to
// the page.

export type PosterFormat = "a1" | "screen" | "newsletter";

export const POSTER_FORMATS: Record<PosterFormat, { label: string; width: number; height: number }> = {
  // 594 × 841 mm, in points.
  a1: { label: "A1 Poster", width: 1683.78, height: 2383.94 },
  // One point per pixel; the screen's is rendered at twice that (see
  // kulturPosterPull), so a 4K portrait screen gets it sharp too.
  screen: { label: "Screen 9:16", width: 1080, height: 1920 },
  newsletter: { label: "Newsletter 16:9", width: 1920, height: 1080 },
};

// Bumped whenever the layout changes, so the next pull redoes every
// poster rather than only those whose event changed (see
// planKulturPoster's hash).
export const POSTER_LAYOUT_VERSION = 8;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const PAPER = hex("#fdf9f9");
const RED = hex("#8b3535");
// The cursive mark sits a shade lighter than the type.
const MARK = hex("#934040");
const QR = hex("#000000");
// Colo's capitals stand 0.817 of its size (as in handoverPdf).
const CAP_HEIGHT = 0.817;

// What goes on a poster, beyond its size: hashed to tell whether one has
// to be made again. Its text is the title taken apart by rule, unless
// someone has set it by hand (see setKulturPosterText).
export function posterContent(event: TicketEvent, override?: PosterText | null) {
  return {
    text: override ?? titleParts(event.title, event.description),
    date: dateLines(event),
    ticketUrl: event.ticketUrl,
    image: event.image?.id ?? null,
  };
}

type Content = ReturnType<typeof posterContent>;

export async function posterPdf(event: TicketEvent, format: PosterFormat, override?: PosterText | null): Promise<Uint8Array> {
  const { width: W, height: H, label } = POSTER_FORMATS[format];
  const content = posterContent(event, override);

  const doc = await PDFDocument.create();
  doc.setTitle(`${event.title} – ${label}`);
  doc.setCreator("Colo Cloud");
  doc.registerFontkit(fontkit);
  const colo = await doc.embedFont(await readFile(join(process.cwd(), "src/fonts/colo.ttf")), { subset: true });

  const page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });
  if (W <= H) upright(page, colo, content, W, H);
  else if (event.image) acrossWithImage(page, colo, content, W, H, await embedEventImage(doc, event.image, H));
  else across(page, colo, content, W, H);
  return doc.save();
}

// The A1 and the screen's: top to bottom, all centred but the title.
function upright(page: PDFPage, colo: PDFFont, content: Content, W: number, H: number) {
  const u = W / 1080;
  // The date's and PRÄSENTIERT's room across, as in the example; the
  // title takes a quarter of its margins, to be set that much larger.
  const measure = W - 109 * u * 2;
  const titleMargin = 27 * u;

  const presentsBaseline = drawBrand(page, colo, W / 2, H - 96 * u, measure, u);
  const dateTop = drawDateAndQr(page, colo, content, W / 2, 101 * u, measure, u);
  drawTitle(page, colo, content.text, titleMargin, W - titleMargin * 2, presentsBaseline - 100 * u, dateTop + 100 * u, u);
}

// The newsletter's, for an event without a picture: the title at the
// left, at full height; the brand and the date in a column at the right.
function across(page: PDFPage, colo: PDFFont, content: Content, W: number, H: number) {
  const u = H / 1080;
  const margin = 72 * u;
  const columnWidth = 560 * u;
  const columnCentre = W - margin - columnWidth / 2;
  const titleMargin = 54 * u;

  drawBrand(page, colo, columnCentre, H - margin, columnWidth, u);
  drawDateAndQr(page, colo, content, columnCentre, margin, columnWidth, u, false);
  const titleWidth = W - margin - columnWidth - 64 * u - titleMargin;
  drawTitle(page, colo, content.text, titleMargin, titleWidth, H - margin, margin, u);
}

// The newsletter's with the event's picture: the brand at the top left
// and the title under it, as large as it fits; at the right, out to the
// page's edge, the picture, its middle level with the title's name, and
// the date over it, flush with its left edge and level with the brand.
// The picture is as wide always, and as tall as its own shape asks within
// bounds, so a wide one (often lettered: a festival's line-up, a book's
// cover) loses little at its sides, and a tall one little at its top and
// foot.
const PANEL_WIDTH = 880;
// At most the room between the date and the page's bottom margin.
const PANEL_HEIGHT = { min: 500, max: 690 };
const ACROSS_MARGIN = 72;
const PANEL_GAP = 64;

function panelSize(image: NonNullable<TicketEvent["image"]>, u: number) {
  const height = Math.min(PANEL_HEIGHT.max, Math.max(PANEL_HEIGHT.min, (PANEL_WIDTH * image.height) / image.width));
  return { width: PANEL_WIDTH * u, height: height * u };
}

function acrossWithImage(page: PDFPage, colo: PDFFont, content: Content, W: number, H: number, image: PDFImage) {
  const u = H / 1080;
  const margin = ACROSS_MARGIN * u;
  const titleMargin = 54 * u;
  // As cut to its panel (see embedEventImage).
  const panelWidth = image.width / 2;
  const panelHeight = image.height / 2;
  const panelX = W - panelWidth;

  // The brand flush left at the top, a little smaller than upright.
  const markWidth = 400 * u;
  const markScale = markWidth / COLOSSEUM_MARK.width;
  const markTop = H - margin;
  page.drawSvgPath(COLOSSEUM_MARK.path, { x: titleMargin, y: markTop, scale: markScale, color: MARK });
  const presentsSize = 84 * u;
  const presentsBaseline = markTop - COLOSSEUM_MARK.height * markScale - 26 * u - presentsSize * CAP_HEIGHT;
  page.drawText("PRÄSENTIERT", { x: titleMargin, y: presentsBaseline, size: presentsSize, font: colo, color: RED });

  // The date level with it: its last line on PRÄSENTIERT's baseline, its
  // first's capitals as high as the mark's top — or smaller, if it
  // wouldn't fit across.
  const lines = content.date.map((line) => writable(colo, line.toUpperCase()));
  const brandHeight = markTop - presentsBaseline;
  const dateWidth = W - margin - panelX;
  const size = Math.min(
    brandHeight / ((lines.length - 1) + CAP_HEIGHT),
    ...lines.map((line) => (dateWidth / colo.widthOfTextAtSize(line, 100)) * 100),
  );
  let baseline = presentsBaseline;
  for (const line of [...lines].reverse()) {
    page.drawText(line, { x: panelX, y: baseline, size, font: colo, color: RED });
    baseline += size;
  }

  const titleWidth = panelX - 64 * u - titleMargin;
  const name = drawTitle(page, colo, content.text, titleMargin, titleWidth, presentsBaseline - 90 * u, margin, u);

  // The picture's middle level with the name's, so far as it fits between
  // the date and the bottom margin.
  const highest = presentsBaseline - PANEL_GAP * u;
  const middle = Math.min(highest - panelHeight / 2, Math.max(margin + panelHeight / 2, (name.top + name.bottom) / 2));
  page.drawImage(image, { x: panelX, y: middle - panelHeight / 2, width: panelWidth, height: panelHeight });
}

// The event's picture, cut to its panel by Wix's image service — at twice
// the panel's size, for sharpness, which acrossWithImage reads back.
async function embedEventImage(doc: PDFDocument, image: NonNullable<TicketEvent["image"]>, H: number) {
  const panel = panelSize(image, H / 1080);
  const url = eventImageUrl(image, panel.width * 2, panel.height * 2);
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`The event's picture couldn't be had from Wix (${res.status})`);
  return doc.embedJpg(new Uint8Array(await res.arrayBuffer()));
}

// The cursive Colosseum, its top at markTop, and PRÄSENTIERT under it —
// centred on centreX, no wider than measure. Returns PRÄSENTIERT's
// baseline.
function drawBrand(page: PDFPage, colo: PDFFont, centreX: number, markTop: number, measure: number, u: number) {
  const markWidth = Math.min(463 * u, measure);
  const markScale = markWidth / COLOSSEUM_MARK.width;
  page.drawSvgPath(COLOSSEUM_MARK.path, { x: centreX - markWidth / 2, y: markTop, scale: markScale, color: MARK });
  const presentsSize = Math.min(100 * u, (measure / colo.widthOfTextAtSize("PRÄSENTIERT", 100)) * 100);
  const presentsBaseline = markTop - COLOSSEUM_MARK.height * markScale - 31 * u - presentsSize * CAP_HEIGHT;
  centred(page, colo, "PRÄSENTIERT", presentsSize, presentsBaseline, centreX);
  return presentsBaseline;
}

// The QR code, its foot at qrBottom, and the date's two lines above it,
// centred on centreX — both the same size: the example's, or less if the
// longer wouldn't fit across measure. Without the QR code, the date stands
// at qrBottom itself. Returns the date's top.
function drawDateAndQr(page: PDFPage, colo: PDFFont, content: Content, centreX: number, qrBottom: number, measure: number, u: number, qr = true) {
  const qrSize = 170 * u;
  if (qr) drawQr(page, content.ticketUrl, centreX - qrSize / 2, qrBottom, qrSize);

  const lines = content.date.map((line) => writable(colo, line.toUpperCase()));
  const size = Math.min(100 * u, ...lines.map((line) => (measure / colo.widthOfTextAtSize(line, 100)) * 100));
  let baseline = qr ? qrBottom + qrSize + 32 * u : qrBottom;
  // Bottom line first, up from the QR code.
  for (const line of [...lines].reverse()) {
    centred(page, colo, line, size, baseline, centreX);
    baseline += size * 1.0;
  }
  return baseline - size * (1 - CAP_HEIGHT);
}

// The title, flush left at x across width, in the room from boxTop down to
// boxBottom: its name as large as the rest of its lines leave room for,
// the whole group centred there.
function drawTitle(page: PDFPage, colo: PDFFont, text: PosterText, x: number, width: number, boxTop: number, boxBottom: number, u: number) {
  const { kicker, headline, subtitle, badge } = text;
  const gap = 40 * u;
  // The smaller lines on the scale of PRÄSENTIERT and the date: as large
  // as they are, at most, so they read from as far.
  const small = (line: string | null) => (line ? fitSmall(colo, line.toUpperCase(), width, 100 * u, 64 * u, 2) : null);
  const above = small(kicker);
  const below = small(subtitle);
  const label = badge ? { text: writable(colo, badge.toUpperCase()), size: 90 * u, padX: 28 * u, padY: 22 * u } : null;
  const labelHeight = label ? label.size * CAP_HEIGHT + label.padY * 2 : 0;
  const others =
    (above ? blockHeight(above) + gap : 0) + (below ? blockHeight(below) + gap : 0) + (label ? labelHeight + gap : 0);
  const title = fitTitle(colo, headline.toUpperCase(), width, boxTop - boxBottom - others, 700 * u, 60 * u);
  const total = others + blockHeight(title);

  // From the top of the group down, each block's first baseline a cap
  // height below where it starts.
  let top = boxBottom + (boxTop - boxBottom + total) / 2;
  const drawBlock = (block: TextBlock) => {
    const blockTop = top;
    let y = top - block.size * CAP_HEIGHT;
    for (const line of block.lines) {
      page.drawText(line, { x, y, size: block.size, font: colo, color: RED });
      y -= block.leading;
    }
    top -= blockHeight(block) + gap;
    return { top: blockTop, bottom: blockTop - blockHeight(block) };
  };
  if (above) drawBlock(above);
  const name = drawBlock(title);
  if (below) drawBlock(below);
  if (label) {
    // Paper-coloured capitals on a red bar.
    const textWidth = colo.widthOfTextAtSize(label.text, label.size);
    page.drawRectangle({ x, y: top - labelHeight, width: textWidth + label.padX * 2, height: labelHeight, color: RED });
    page.drawText(label.text, { x: x + label.padX, y: top - label.padY - label.size * CAP_HEIGHT, size: label.size, font: colo, color: PAPER });
  }
  // Where the name stands, for the newsletter's picture to stand level
  // with.
  return name;
}

// The months as the posters write them: their first three letters.
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// "13. Dez": the day it starts, for a poster's name in the library.
export function dayLabel(event: TicketEvent) {
  const part = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: event.timeZone, ...options }).format(new Date(event.start));
  return `${Number(part({ day: "numeric" }))}. ${MONTHS[Number(part({ month: "numeric" })) - 1]}`;
}

// "Freitag, 20. Nov" over "20:00 Uhr" — no year; an event over several
// days as "28. – 29. Nov" (or "30. Nov – 2. Dez") over when it opens.
export function dateLines(event: TicketEvent): string[] {
  const part = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("de-DE", { timeZone: event.timeZone, ...options }).format(new Date(iso));
  const day = (iso: string) => Number(part(iso, { day: "numeric" }));
  const month = (iso: string) => MONTHS[Number(part(iso, { month: "numeric" })) - 1];
  const sameDay = (a: string, b: string) => part(a, { dateStyle: "short" }) === part(b, { dateStyle: "short" });
  const time = part(event.start, { hour: "2-digit", minute: "2-digit", hour12: false });

  if (sameDay(event.start, event.end)) {
    return [`${part(event.start, { weekday: "long" })}, ${day(event.start)}. ${month(event.start)}`, `${time} Uhr`];
  }
  const range =
    month(event.start) === month(event.end)
      ? `${day(event.start)}. – ${day(event.end)}. ${month(event.end)}`
      : `${day(event.start)}. ${month(event.start)} – ${day(event.end)}. ${month(event.end)}`;
  return [range, `ab ${time} Uhr`];
}

type TextBlock = { size: number; leading: number; lines: string[] };

// From the first line's cap tops to the last line's baseline.
function blockHeight(block: TextBlock) {
  return (block.lines.length - 1) * block.leading + block.size * CAP_HEIGHT;
}

// A smaller line — the series above the name, the subtitle below it — at
// the largest size from max down to min that sets it in no more than
// maxLines with its words whole; failing that, at min, as many as it
// takes. Spaced for umlauts, which these lines are full of.
function fitSmall(font: PDFFont, raw: string, width: number, max: number, min: number, maxLines: number): TextBlock {
  const words = writable(font, raw).split(" ").map(hyphenationPieces);
  for (let size = max; size >= min; size *= 0.98) {
    const set = wrap(font, words, size, width, false);
    if (!set.broken && set.lines.length <= maxLines) return { size, leading: size, lines: set.lines };
  }
  return { size: min, leading: min, lines: wrap(font, words, min, width, true).lines };
}

// A hyphen at a line's end asks a little more of the reader, so the title
// is hyphenated to fill its lines only when that sets it this much larger
// than keeping its words whole would.
const HYPHEN_GAIN = 1.05;

// The title as large as it fits — read from a distance, size is what
// counts. Two ways to set it, each at the largest size (max down to min)
// at which it takes no more height than it has: its words whole (save one
// too long for any line, broken at a syllable), or hyphenated wherever
// that fills a line. Then its lines are evened out: as narrow as they can
// be while staying as many, so a title doesn't end on one word alone.
function fitTitle(font: PDFFont, raw: string, width: number, height: number, max: number, min: number) {
  const words = writable(font, raw).split(" ").map(hyphenationPieces);
  // Capitals set tight, as in the example — looser when an umlaut's dots
  // (0.14 of the size above the capitals) would all but touch the line
  // above.
  const leadingOf = (size: number, lines: string[]) => size * (lines.slice(1).some((line) => /[ÄÖÜ]/.test(line)) ? 1.0 : 0.92);
  const heightOf = (lines: string[], size: number) => (lines.length - 1) * leadingOf(size, lines) + size * CAP_HEIGHT;

  const largest = (fill: boolean) => {
    for (let size = max; size >= min; size *= 0.99) {
      const set = wrap(font, words, size, width, fill);
      if (!set.broken && heightOf(set.lines, size) <= height) return { size, set, fill };
    }
    return null;
  };
  const whole = largest(false);
  const filled = largest(true);
  const pick =
    (filled && (!whole || filled.size >= whole.size * HYPHEN_GAIN) ? filled : whole) ??
    // Too long to fit even at min: set at min regardless, run long.
    { size: min, set: wrap(font, words, min, width, true), fill: true };

  // Narrower and narrower, so long as it takes no more lines or hyphens.
  const { size, set, fill } = pick;
  let lo = 0;
  let hi = width;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    const tried = wrap(font, words, size, mid, fill);
    if (!tried.broken && tried.lines.length === set.lines.length && tried.hyphens <= set.hyphens) hi = mid;
    else lo = mid;
  }
  const even = wrap(font, words, size, hi, fill);
  const lines = !even.broken && even.lines.length === set.lines.length && even.hyphens <= set.hyphens ? even.lines : set.lines;
  return { size, leading: leadingOf(size, lines), lines };
}

// Words (each in its hyphenation pieces) set in lines no wider than width.
// A word that doesn't fit where it would go is hyphenated there — when
// fill is on, or when it wouldn't fit a line of its own either — at the
// last syllable that fits; failing any, it's cut between letters, which
// `broken` reports.
function wrap(font: PDFFont, words: string[][], size: number, width: number, fill: boolean) {
  const fits = (t: string) => font.widthOfTextAtSize(t, size) <= width;
  const dash = (piece: string) => (piece.endsWith("-") ? "" : "-");
  const lines: string[] = [];
  let line = "";
  let hyphens = 0;
  let broken = false;
  for (const pieces of words) {
    let rest = pieces;
    while (rest.length > 0) {
      const whole = rest.join("");
      const lead = line ? `${line} ` : "";
      if (fits(lead + whole)) {
        line = lead + whole;
        break;
      }
      if (fill || !fits(whole)) {
        const head = (k: number) => lead + rest.slice(0, k).join("") + dash(rest[k - 1]);
        let k = rest.length - 1;
        while (k > 0 && !fits(head(k))) k--;
        if (k > 0) {
          lines.push(head(k));
          if (dash(rest[k - 1])) hyphens++;
          line = "";
          rest = rest.slice(k);
          continue;
        }
      }
      if (line) {
        lines.push(line);
        line = "";
        continue;
      }
      // Not one syllable fits a line of its own: letters, then.
      broken = true;
      const [first, ...after] = rest;
      let n = first.length - 1;
      while (n > 1 && !fits(`${first.slice(0, n)}-`)) n--;
      if (n < 1) {
        lines.push(first);
        rest = after;
        continue;
      }
      lines.push(`${first.slice(0, n)}-`);
      rest = [first.slice(n), ...after];
    }
  }
  if (line) lines.push(line);
  return { lines, hyphens, broken };
}

// A line of red centred on centreX.
function centred(page: PDFPage, font: PDFFont, raw: string, size: number, baseline: number, centreX: number) {
  const text = writable(font, raw);
  page.drawText(text, { x: centreX - font.widthOfTextAtSize(text, size) / 2, y: baseline, size, font, color: RED });
}

// The QR code as one vector shape — each row's dark runs as rectangles in
// a single path, so no hairlines show between neighbouring modules. The
// light around it is the page's own, so only its 4-module quiet zone has
// to be kept clear, which the layout does.
function drawQr(page: PDFPage, value: string, x: number, y: number, size: number) {
  const { modules } = QRCode.create(value, { errorCorrectionLevel: "M" });
  const n = modules.size;
  let path = "";
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; ) {
      if (!modules.get(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < n && modules.get(row, col)) col++;
      path += `M${start} ${row}h${col - start}v1h${start - col}z`;
    }
  }
  // drawSvgPath draws downwards from y, as SVG does.
  page.drawSvgPath(path, { x, y: y + size, scale: size / n, color: QR });
}

// What the font can write, the rest dropped (an emoji in a title, say).
const known = new WeakMap<PDFFont, Set<number>>();
function writable(font: PDFFont, s: string) {
  let set = known.get(font);
  if (!set) known.set(font, (set = new Set(font.getCharacterSet())));
  let out = "";
  for (const ch of s) out += set.has(ch.codePointAt(0)!) ? ch : "";
  return out.replace(/\s+/g, " ").trim();
}
