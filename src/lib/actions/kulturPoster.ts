"use server";

import { createHash, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { plural, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { eventImageUrl, fetchTicketEvents, type TicketEvent } from "@/lib/kulturPoster/events";
import {
  POSTER_FORMATS,
  POSTER_LAYOUT_VERSION,
  dayLabel,
  posterContent,
  posterPdf,
  type PosterContent,
  type PosterFormat,
  type PosterImage,
} from "@/lib/kulturPoster/posterPdf";
import { titleParts, type PosterText } from "@/lib/kulturPoster/titleParts";
import { createAdminClient } from "@/lib/supabase/admin";
import { writePosterFiles, type PosterFilesInput } from "@/lib/uploads/posters";
import type { Database } from "@/types/database.types";
import { mediaPublicUrl } from "@/types/domain";

// Kultur Poster: the folder's reload button pulls the events on sale from
// colosseumberlin.com/event and makes each a Poster (see 0051_posters.sql)
// of three files: an A1 PDF for print, a 9:16 PNG for the portrait screens
// and a 16:9 PNG for the newsletter. The PDFs are made here; the browser
// then renders the images from them and uploads the lot (see
// kulturPosterPull) — so the screen's image is an ordinary one, for
// playlists like anything else.
//
// Each poster remembers its event (source_key) and a hash of what went
// into it, so a pull only redoes the posters whose event changed, and a
// changed one is replaced in place: a screen showing it shows the new one.
// A poster whose event is no longer listed goes to the folder's Archiv,
// and comes back out if the event does.
//
// A poster's text is the event's title taken apart by rule (titleParts),
// unless it's been set by hand from the poster's own Edit Poster, which
// is kept in kultur_poster_texts for every pull after — as is a picture
// uploaded there in place of the event's. And the folder's + button makes
// a poster by hand altogether (addManualPoster): no event's, so a pull
// never archives or replaces it, only makes it again from what's been set
// for it, when that changes.

const FEED = "kultur_poster";
const ARCHIVE_FEED = "kultur_poster_archiv";
const KEY_PREFIX = "wix-event:";
const MANUAL_PREFIX = "manual:";
const BUCKET = "media";

type Admin = ReturnType<typeof createAdminClient>;
type SetRow = Database["public"]["Tables"]["kultur_poster_texts"]["Row"];

export type PosterJob = {
  sourceKey: string;
  hash: string;
  name: string;
  // Its tickets, if it has any.
  linkUrl: string | null;
  // The poster to remake, or none for a new one.
  posterId: string | null;
  // Each file's PDF, base64; the images are rendered from theirs.
  pdfs: Record<PosterFormat, string>;
};

export async function planKulturPoster(): Promise<{ jobs: PosterJob[]; unchanged: number; archived: number }> {
  const user = await requirePage("media");
  const admin = createAdminClient();
  const feedId = await feedFolderId(admin);
  const [events, { data: posters, error: postersError }, archiveId, sets] = await Promise.all([
    fetchTicketEvents(),
    admin.from("posters").select("id, folder_id, source_key, source_hash").not("source_key", "is", null),
    archiveFolderId(admin, feedId, false),
    posterSets(admin),
    dropSinglePosterPdfs(admin),
  ]);
  if (postersError) throw new Error(postersError.message);
  const byKey = new Map((posters ?? []).map((poster) => [poster.source_key!, poster]));

  const jobs: PosterJob[] = [];
  const listed = new Set<string>();
  const restore: string[] = [];
  let unchanged = 0;
  // Made if new, made again if what goes into it changed; otherwise left.
  const plan = async (sourceKey: string, name: string, content: PosterContent) => {
    const hash = createHash("sha256").update(JSON.stringify({ v: POSTER_LAYOUT_VERSION, name, ...content })).digest("hex");
    const existing = byKey.get(sourceKey);
    if (existing?.source_hash === hash) {
      unchanged++;
      return existing;
    }
    jobs.push({ sourceKey, hash, name, linkUrl: content.ticketUrl, posterId: existing?.id ?? null, pdfs: await pdfsOf(content, name) });
    return null;
  };

  for (const event of events) {
    const sourceKey = `${KEY_PREFIX}${event.id}`;
    const set = sets.get(event.id);
    listed.add(sourceKey);
    const kept = await plan(sourceKey, posterName(event), posterContent(event, set && { text: setText(set), image: setImage(set) }));
    if (kept && archiveId && kept.folder_id === archiveId) restore.push(kept.id);
  }
  for (const set of sets.values()) {
    if (set.event_id.startsWith(MANUAL_PREFIX)) await plan(set.event_id, manualName(set), manualContent(set));
  }

  // Only from the folder itself: one moved somewhere else on purpose stays
  // where it was put. And only an event's: one made by hand has no event
  // to go off sale.
  const stale = (posters ?? [])
    .filter((poster) => poster.source_key!.startsWith(KEY_PREFIX) && !listed.has(poster.source_key!) && poster.folder_id === feedId)
    .map((poster) => poster.id);
  if (stale.length > 0) {
    const archive = archiveId ?? (await archiveFolderId(admin, feedId, true))!;
    const { error } = await admin.from("posters").update({ folder_id: archive }).in("id", stale);
    if (error) throw new Error(error.message);
  }
  if (restore.length > 0) {
    const { error } = await admin.from("posters").update({ folder_id: feedId }).in("id", restore);
    if (error) throw new Error(error.message);
  }

  recordActivity(user, {
    action: "kultur_poster.pull",
    summary:
      `Pulled Kultur Poster from colosseumberlin.com: ${plural(events.length, "event")}, ` +
      `${plural(jobs.length, "poster")} to make` +
      (stale.length ? `, ${plural(stale.length, "poster")} archived` : ""),
  });
  revalidatePath("/library");
  return { jobs, unchanged, archived: stale.length };
}

async function pdfsOf(content: PosterContent, name: string) {
  const pdfs = {} as Record<PosterFormat, string>;
  for (const format of Object.keys(POSTER_FORMATS) as PosterFormat[]) {
    pdfs[format] = Buffer.from(await posterPdf(content, format, name)).toString("base64");
  }
  return pdfs;
}

// One poster's files, once they're in storage: a new poster in the folder,
// or swapped in under the one it replaces.
export async function saveKulturPoster({
  sourceKey,
  hash,
  name,
  linkUrl,
  posterId,
  files,
}: {
  sourceKey: string;
  hash: string;
  name: string;
  linkUrl: string | null;
  posterId: string | null;
  files: PosterFilesInput;
}) {
  if (!sourceKey.startsWith(KEY_PREFIX) && !sourceKey.startsWith(MANUAL_PREFIX)) throw new Error("Not a Kultur Poster");
  const user = await requirePage("media");
  const admin = createAdminClient();
  const feedId = await feedFolderId(admin);

  if (posterId) {
    const { data: poster, error } = await admin.from("posters").select("id, folder_id").eq("id", posterId).eq("source_key", sourceKey).single();
    if (error) throw new Error(error.message);
    // Named for the event as it's called now, its files too.
    await writePosterFiles(admin, { id: poster.id, name }, files, user.id);
    // An event's back on sale comes back out of the Archiv.
    const archiveId = sourceKey.startsWith(KEY_PREFIX) ? await archiveFolderId(admin, feedId, false) : null;
    const { error: updateError } = await admin
      .from("posters")
      .update({ name, link_url: linkUrl, source_hash: hash, ...(archiveId && poster.folder_id === archiveId ? { folder_id: feedId } : {}) })
      .eq("id", posterId);
    if (updateError) throw new Error(updateError.message);
  } else {
    // Hashed only once all three files are in: a poster that failed half
    // way is made again by the next pull.
    const { data: poster, error } = await admin
      .from("posters")
      .insert({ name, link_url: linkUrl, folder_id: feedId, source_key: sourceKey, uploaded_by: user.id })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await writePosterFiles(admin, { id: poster.id, name }, files, user.id);
    const { error: hashError } = await admin.from("posters").update({ source_hash: hash }).eq("id", poster.id);
    if (hashError) throw new Error(hashError.message);
  }

  revalidatePath("/library");
  revalidatePath("/dashboard");
}

// Dated, so one event on two days (Wix lists them apart) reads apart.
function posterName(event: TicketEvent) {
  return `${event.title} · ${dayLabel(event)}`;
}

// Before Posters, each event was two PDFs of its own (an A1 and a
// 1080×1920), each its own feed-made deck; the Posters replace them.
async function dropSinglePosterPdfs(admin: Admin) {
  const { data: decks, error } = await admin
    .from("decks")
    .select("id, storage_path")
    .like("source_key", `${KEY_PREFIX}%`)
    .is("poster_id", null);
  if (error) throw new Error(error.message);
  if (!decks?.length) return;
  const ids = decks.map((deck) => deck.id);
  const { data: pages, error: pagesError } = await admin.from("media_items").select("storage_path").in("deck_id", ids);
  if (pagesError) throw new Error(pagesError.message);
  const { error: deleteError } = await admin.from("decks").delete().in("id", ids);
  if (deleteError) throw new Error(deleteError.message);
  const objects = [...decks, ...(pages ?? [])].map((row) => row.storage_path);
  const { error: removeError } = await admin.storage.from(BUCKET).remove(objects);
  if (removeError) console.error(`Failed to remove ${objects.length} objects of the old poster PDFs:`, removeError.message);
}

// ── Posters made by hand ──

// What a poster made by hand starts as, until it's set from its Edit
// Poster: words that say what goes where.
const PLACEHOLDER = {
  kicker: "Reihe oder Format",
  headline: "Titel",
  subtitle: "Untertitel",
  date: ["Wochentag, 1. Jan", "20:00 Uhr"],
};

// A new poster made by hand, in the folder: made by the pull that follows
// (see KulturPosterButton). Resolves to its key, for its Edit Poster.
export async function addManualPoster(): Promise<string> {
  const user = await requirePage("media");
  const admin = createAdminClient();
  const sourceKey = `${MANUAL_PREFIX}${randomUUID()}`;
  const { error } = await admin.from("kultur_poster_texts").insert({
    event_id: sourceKey,
    kicker: PLACEHOLDER.kicker,
    headline: PLACEHOLDER.headline,
    subtitle: PLACEHOLDER.subtitle,
    date_lines: PLACEHOLDER.date,
    updated_by: user.id,
  });
  if (error) throw new Error(error.message);
  recordActivity(user, { action: "kultur_poster.add", summary: "Added a Kultur Poster by hand" });
  return sourceKey;
}

function manualContent(set: SetRow): PosterContent {
  return {
    text: setText(set) ?? { kicker: PLACEHOLDER.kicker, headline: PLACEHOLDER.headline, subtitle: PLACEHOLDER.subtitle, badge: null },
    date: set.date_lines ?? [],
    ticketUrl: set.ticket_url,
    image: setImage(set),
  };
}

function manualName(set: SetRow) {
  const date = set.date_lines?.find(Boolean);
  return [set.headline ?? PLACEHOLDER.headline, date].filter(Boolean).join(" · ");
}

// ── Set by hand ──

export type PosterEdit = {
  // Made by hand, rather than from an event.
  manual: boolean;
  // An event's: its title on the site, and its text by rule.
  siteTitle: string | null;
  auto: PosterText | null;
  // Its text now, and whether that's been set by hand.
  text: PosterText;
  textSet: boolean;
  // Made by hand: its date's lines and its tickets.
  date: string[];
  ticketUrl: string | null;
  // Its pictures, to show: one uploaded for it, and an event's own.
  uploadedImageUrl: string | null;
  siteImageUrl: string | null;
};

// What a poster is now, for its Edit Poster — an event's read off the
// site afresh, since its title or picture may have changed there.
export async function kulturPosterEdit(sourceKey: string): Promise<PosterEdit> {
  await requirePage("media");
  const key = setKey(sourceKey);
  const admin = createAdminClient();
  const uploaded = (set: SetRow | undefined) => {
    const image = set && setImage(set);
    return image?.source === "upload" ? mediaPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL!, image.path) : null;
  };

  if (sourceKey.startsWith(MANUAL_PREFIX)) {
    const set = (await posterSets(admin, key)).get(key);
    if (!set) throw new Error("This poster is gone.");
    const content = manualContent(set);
    return {
      manual: true,
      siteTitle: null,
      auto: null,
      text: content.text,
      textSet: true,
      date: content.date,
      ticketUrl: content.ticketUrl,
      uploadedImageUrl: uploaded(set),
      siteImageUrl: null,
    };
  }

  const [events, sets] = await Promise.all([fetchTicketEvents(), posterSets(admin, key)]);
  const event = events.find((e) => e.id === key);
  if (!event) throw new Error("This event isn't on colosseumberlin.com/event any more.");
  const set = sets.get(key);
  const auto = titleParts(event.title, event.description);
  const text = set && setText(set);

  return {
    manual: false,
    siteTitle: event.title,
    auto,
    text: text ?? auto,
    textSet: !!text,
    date: [],
    ticketUrl: null,
    uploadedImageUrl: uploaded(set),
    siteImageUrl: event.image && eventImageUrl(event.image, 640, (640 * event.image.height) / event.image.width),
  };
}

export type PosterChange = {
  // The text, or (an event's) null to hand it back to the rules.
  text: PosterText | null;
  // Made by hand: its date's lines and its tickets.
  date?: string[];
  ticketUrl?: string | null;
  // A picture uploaded for it (see createPosterImageUploadUrl), or null to
  // go back to the event's own (or, made by hand, to none); left out,
  // it stays as it is.
  image?: { path: string; width: number; height: number } | null;
};

// Sets what's set by hand for a poster. The poster itself is remade by
// the pull that follows.
export async function setKulturPoster(sourceKey: string, change: PosterChange) {
  const user = await requirePage("media");
  const key = setKey(sourceKey);
  const manual = sourceKey.startsWith(MANUAL_PREFIX);
  const admin = createAdminClient();
  const clean = (s: string | null | undefined) => s?.replace(/\s+/g, " ").trim() || null;

  const text = change.text && {
    kicker: clean(change.text.kicker),
    headline: clean(change.text.headline),
    subtitle: clean(change.text.subtitle),
    badge: clean(change.text.badge),
  };
  if (text && !text.headline) throw new Error("The poster needs a name to show.");
  if (manual && !text) throw new Error("The poster needs a name to show.");
  const ticketUrl = change.ticketUrl === undefined ? undefined : clean(change.ticketUrl);
  if (ticketUrl && !/^https?:\/\/\S+$/i.test(ticketUrl)) throw new Error("The ticket link should be a web address, starting https://");

  const { data: before, error: readError } = await admin.from("kultur_poster_texts").select("*").eq("event_id", key).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (manual && !before) throw new Error("This poster is gone.");

  const next = {
    event_id: key,
    ...(text ?? { kicker: null, headline: null, subtitle: null, badge: null }),
    ...(manual && change.date ? { date_lines: change.date.map((line) => clean(line) ?? "").filter(Boolean) } : {}),
    ...(manual && ticketUrl !== undefined ? { ticket_url: ticketUrl } : {}),
    ...(change.image !== undefined
      ? { image_path: change.image?.path ?? null, image_width: change.image?.width ?? null, image_height: change.image?.height ?? null }
      : {}),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  };
  const imagePath = change.image !== undefined ? next.image_path : before?.image_path;
  if (!manual && !text && !imagePath) {
    // Nothing set by hand any more: the event's poster is the rules' again.
    const { error } = await admin.from("kultur_poster_texts").delete().eq("event_id", key);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await admin.from("kultur_poster_texts").upsert(next);
    if (error) throw new Error(error.message);
  }
  // The picture it had, once it's been replaced.
  if (before?.image_path && before.image_path !== imagePath) {
    const { error } = await admin.storage.from(BUCKET).remove([before.image_path]);
    if (error) console.error("Failed to remove a poster's old picture:", error.message);
  }

  recordActivity(user, {
    action: "kultur_poster.text",
    summary: text ? `Set the Kultur Poster "${text.headline}"` : "Set a Kultur Poster's text back to automatic",
  });
}

// The key a poster's settings are kept under: an event's id, or a poster
// made by hand's whole key.
function setKey(sourceKey: string) {
  if (sourceKey.startsWith(MANUAL_PREFIX)) return sourceKey;
  const match = sourceKey.match(/^wix-event:([^:]+)$/);
  if (!match) throw new Error("Not a Kultur Poster");
  return match[1];
}

function setText(set: SetRow): PosterText | null {
  return set.headline ? { kicker: set.kicker, headline: set.headline, subtitle: set.subtitle, badge: set.badge } : null;
}

function setImage(set: SetRow): PosterImage | null {
  return set.image_path && set.image_width && set.image_height
    ? { source: "upload", path: set.image_path, width: set.image_width, height: set.image_height }
    : null;
}

async function posterSets(admin: Admin, key?: string): Promise<Map<string, SetRow>> {
  let query = admin.from("kultur_poster_texts").select("*");
  if (key) query = query.eq("event_id", key);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((set) => [set.event_id, set]));
}

async function feedFolderId(admin: Admin) {
  const { data, error } = await admin.from("folders").select("id").eq("feed", FEED).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The Kultur Poster folder is gone");
  return data.id;
}

// The Archiv inside it, made the first time a poster goes there.
async function archiveFolderId(admin: Admin, feedId: string, create: boolean): Promise<string | null> {
  const { data, error } = await admin.from("folders").select("id").eq("feed", ARCHIVE_FEED).maybeSingle();
  if (error) throw new Error(error.message);
  if (data || !create) return data?.id ?? null;
  const { data: made, error: makeError } = await admin
    .from("folders")
    .insert({ name: "Archiv", parent_id: feedId, feed: ARCHIVE_FEED })
    .select("id")
    .single();
  if (makeError) throw new Error(makeError.message);
  return made.id;
}
