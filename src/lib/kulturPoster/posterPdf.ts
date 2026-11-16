import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { COLOSSEUM_MARK } from "@/lib/colosseumMark";
import type { TicketEvent } from "./events";
import { hyphenationPieces } from "./hyphenate";

// A Kultur Poster: one event on one page, in two sizes — A1 for print and
// a 1080×1920 still for the portrait screens. On the house's warm white, in
// its deep red, top to bottom: the cursive Colosseum and PRÄSENTIERT under
// it; the event's title in capitals, as large as it fits, flush left; then
// its date, and the QR code to its tickets (in black, for the cameras) at
// the bottom centre. The type is all Colo (Compacta), the brand's own
// face, and everything is drawn as vectors (the QR code too), so A1
// prints sharp. Measurements are the house example's, on its 1080-wide
// still, scaled to the page.

export type PosterFormat = "a1" | "screen";

export const POSTER_FORMATS: Record<PosterFormat, { label: string; width: number; height: number }> = {
  // 594 × 841 mm, in points.
  a1: { label: "A1", width: 1683.78, height: 2383.94 },
  // One point per pixel; the Library renders it at twice that (see
  // renderPdfPages), so a 4K portrait screen gets it sharp too.
  screen: { label: "1080×1920", width: 1080, height: 1920 },
};

// Bumped whenever the layout changes, so the next pull redoes every
// poster rather than only those whose event changed (see
// planKulturPoster's hash).
export const POSTER_LAYOUT_VERSION = 4;

const hex = (h: string) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
const PAPER = hex("#fdf9f9");
const RED = hex("#8b3535");
// The cursive mark sits a shade lighter than the type.
const MARK = hex("#934040");
const QR = hex("#000000");
// Colo's capitals stand 0.817 of its size (as in handoverPdf).
const CAP_HEIGHT = 0.817;

// What goes on a poster, beyond its size: hashed to tell whether one has
// to be made again.
export function posterContent(event: TicketEvent) {
  return { title: event.title, date: dateLines(event), ticketUrl: event.ticketUrl };
}

export async function posterPdf(event: TicketEvent, format: PosterFormat): Promise<Uint8Array> {
  const { width: W, height: H } = POSTER_FORMATS[format];
  const content = posterContent(event);
  const u = W / 1080;
  // The date's and PRÄSENTIERT's room across, as in the example; the
  // title takes a quarter of its margins, to be set that much larger.
  const measure = W - 109 * u * 2;
  const titleMargin = 27 * u;

  const doc = await PDFDocument.create();
  doc.setTitle(`${content.title} – ${POSTER_FORMATS[format].label}`);
  doc.setCreator("Colo Cloud");
  doc.registerFontkit(fontkit);
  const colo = await doc.embedFont(await readFile(join(process.cwd(), "src/fonts/colo.ttf")), { subset: true });

  const page = doc.addPage([W, H]);
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: PAPER });

  // ── The brand, at the top: the cursive Colosseum, and PRÄSENTIERT ──
  const markWidth = 463 * u;
  const markScale = markWidth / COLOSSEUM_MARK.width;
  const markTop = H - 96 * u;
  page.drawSvgPath(COLOSSEUM_MARK.path, { x: (W - markWidth) / 2, y: markTop, scale: markScale, color: MARK });
  const presentsSize = 100 * u;
  const presentsBaseline = markTop - COLOSSEUM_MARK.height * markScale - 31 * u - presentsSize * CAP_HEIGHT;
  centred(page, colo, "PRÄSENTIERT", presentsSize, presentsBaseline, W);

  // ── The QR code at the bottom centre, and the date above it ──
  const qrSize = 170 * u;
  const qrBottom = 101 * u;
  drawQr(page, content.ticketUrl, (W - qrSize) / 2, qrBottom, qrSize);

  // Both lines the same size: the example's, or less if the longer one
  // wouldn't fit across.
  const dateLinesUpper = content.date.map((line) => writable(colo, line.toUpperCase()));
  const dateSize = Math.min(100 * u, ...dateLinesUpper.map((line) => (measure / colo.widthOfTextAtSize(line, 100)) * 100));
  let baseline = qrBottom + qrSize + 32 * u;
  // Bottom line first, up from the QR code.
  for (const line of [...dateLinesUpper].reverse()) {
    centred(page, colo, line, dateSize, baseline, W);
    baseline += dateSize * 1.0;
  }
  const dateTop = baseline - dateSize * (1 - CAP_HEIGHT);

  // ── The title, in the room between ──
  const boxTop = presentsBaseline - 100 * u;
  const boxBottom = dateTop + 100 * u;
  const title = fitTitle(colo, content.title.toUpperCase(), W - titleMargin * 2, boxTop - boxBottom, 700 * u, 60 * u);
  // Centred on the box by its capitals: the first line's cap tops to the
  // last line's baseline.
  const block = (title.lines.length - 1) * title.leading + title.size * CAP_HEIGHT;
  let y = boxBottom + (boxTop - boxBottom + block) / 2 - title.size * CAP_HEIGHT;
  for (const line of title.lines) {
    page.drawText(line, { x: titleMargin, y, size: title.size, font: colo, color: RED });
    y -= title.leading;
  }

  return doc.save();
}

// The months as the posters write them: their first three letters.
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

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

// A line of red centred across the page.
function centred(page: PDFPage, font: PDFFont, raw: string, size: number, baseline: number, pageWidth: number) {
  const text = writable(font, raw);
  page.drawText(text, { x: (pageWidth - font.widthOfTextAtSize(text, size)) / 2, y: baseline, size, font, color: RED });
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
