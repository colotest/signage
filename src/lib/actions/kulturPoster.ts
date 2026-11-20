"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { plural, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { fetchTicketEvents, type TicketEvent } from "@/lib/kulturPoster/events";
import { POSTER_FORMATS, POSTER_LAYOUT_VERSION, dayLabel, posterContent, posterPdf, type PosterFormat } from "@/lib/kulturPoster/posterPdf";
import { titleParts, type PosterText } from "@/lib/kulturPoster/titleParts";
import { createAdminClient } from "@/lib/supabase/admin";
import { writePosterFiles, type PosterFilesInput } from "@/lib/uploads/posters";

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
// unless it's been set by hand from the poster's own menu, which is kept
// in kultur_poster_texts for every pull after.

const FEED = "kultur_poster";
const ARCHIVE_FEED = "kultur_poster_archiv";
const KEY_PREFIX = "wix-event:";
const BUCKET = "media";

type Admin = ReturnType<typeof createAdminClient>;

export type PosterJob = {
  sourceKey: string;
  hash: string;
  name: string;
  // Its event's ticket page.
  linkUrl: string;
  // The poster to remake, or none for a new one.
  posterId: string | null;
  // Each file's PDF, base64; the images are rendered from theirs.
  pdfs: Record<PosterFormat, string>;
};

export async function planKulturPoster(): Promise<{ jobs: PosterJob[]; unchanged: number; archived: number }> {
  const user = await requirePage("media");
  const admin = createAdminClient();
  const feedId = await feedFolderId(admin);
  const [events, { data: posters, error: postersError }, archiveId, overrides] = await Promise.all([
    fetchTicketEvents(),
    admin.from("posters").select("id, folder_id, source_key, source_hash").like("source_key", `${KEY_PREFIX}%`),
    archiveFolderId(admin, feedId, false),
    posterTexts(admin),
    dropSinglePosterPdfs(admin),
  ]);
  if (postersError) throw new Error(postersError.message);
  const byKey = new Map((posters ?? []).map((poster) => [poster.source_key!, poster]));

  const jobs: PosterJob[] = [];
  const listed = new Set<string>();
  const restore: string[] = [];
  let unchanged = 0;
  for (const event of events) {
    const override = overrides.get(event.id) ?? null;
    const sourceKey = `${KEY_PREFIX}${event.id}`;
    const name = posterName(event);
    const hash = createHash("sha256")
      .update(JSON.stringify({ v: POSTER_LAYOUT_VERSION, name, ...posterContent(event, override) }))
      .digest("hex");
    listed.add(sourceKey);
    const existing = byKey.get(sourceKey);
    if (existing?.source_hash === hash) {
      if (archiveId && existing.folder_id === archiveId) restore.push(existing.id);
      unchanged++;
      continue;
    }
    const pdfs = {} as Record<PosterFormat, string>;
    for (const format of Object.keys(POSTER_FORMATS) as PosterFormat[]) {
      pdfs[format] = Buffer.from(await posterPdf(event, format, override)).toString("base64");
    }
    jobs.push({ sourceKey, hash, name, linkUrl: event.ticketUrl, posterId: existing?.id ?? null, pdfs });
  }

  // Only from the folder itself: one moved somewhere else on purpose stays
  // where it was put.
  const stale = (posters ?? []).filter((poster) => !listed.has(poster.source_key!) && poster.folder_id === feedId).map((poster) => poster.id);
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
  linkUrl: string;
  posterId: string | null;
  files: PosterFilesInput;
}) {
  if (!sourceKey.startsWith(KEY_PREFIX)) throw new Error("Not a Kultur Poster");
  const user = await requirePage("media");
  const admin = createAdminClient();
  const feedId = await feedFolderId(admin);

  if (posterId) {
    const { data: poster, error } = await admin.from("posters").select("id, folder_id").eq("id", posterId).eq("source_key", sourceKey).single();
    if (error) throw new Error(error.message);
    // Named for the event as it's called now, its files too.
    await writePosterFiles(admin, { id: poster.id, name }, files, user.id);
    const archiveId = await archiveFolderId(admin, feedId, false);
    const { error: updateError } = await admin
      .from("posters")
      .update({ name, link_url: linkUrl, source_hash: hash, ...(poster.folder_id === archiveId ? { folder_id: feedId } : {}) })
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

// ── Poster text set by hand ──

// What a poster's text is now and would be by rule, for its Edit Poster
// Text: read off the site afresh, since the title may have changed there.
export async function kulturPosterText(sourceKey: string): Promise<{ title: string; auto: PosterText; override: PosterText | null }> {
  await requirePage("media");
  const eventId = eventIdOf(sourceKey);
  const admin = createAdminClient();
  const [events, overrides] = await Promise.all([fetchTicketEvents(), posterTexts(admin, eventId)]);
  const event = events.find((e) => e.id === eventId);
  if (!event) throw new Error("This event isn't on colosseumberlin.com/event any more.");
  return { title: event.title, auto: titleParts(event.title, event.description), override: overrides.get(eventId) ?? null };
}

// Sets the text for all of an event's poster's files, or (null) hands it back to
// the rules. The posters themselves are remade by the pull that follows.
export async function setKulturPosterText(sourceKey: string, text: PosterText | null) {
  const user = await requirePage("media");
  const eventId = eventIdOf(sourceKey);
  const admin = createAdminClient();
  if (!text) {
    const { error } = await admin.from("kultur_poster_texts").delete().eq("event_id", eventId);
    if (error) throw new Error(error.message);
  } else {
    const clean = (s: string | null) => s?.replace(/\s+/g, " ").trim() || null;
    const headline = clean(text.headline);
    if (!headline) throw new Error("The poster needs a name to show.");
    const { error } = await admin.from("kultur_poster_texts").upsert({
      event_id: eventId,
      kicker: clean(text.kicker),
      headline,
      subtitle: clean(text.subtitle),
      badge: clean(text.badge),
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
  }
  recordActivity(user, {
    action: "kultur_poster.text",
    summary: text ? `Set the Kultur Poster text for "${text.headline}"` : "Set a Kultur Poster's text back to automatic",
  });
}

function eventIdOf(sourceKey: string) {
  const match = sourceKey.match(/^wix-event:([^:]+)$/);
  if (!match) throw new Error("Not a Kultur Poster");
  return match[1];
}

async function posterTexts(admin: Admin, eventId?: string): Promise<Map<string, PosterText>> {
  let query = admin.from("kultur_poster_texts").select("event_id, kicker, headline, subtitle, badge");
  if (eventId) query = query.eq("event_id", eventId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map(({ event_id, ...text }) => [event_id, text]));
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
