"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { plural, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { requireEditable } from "@/lib/auth/owned";
import { fetchTicketEvents, type TicketEvent } from "@/lib/kulturPoster/events";
import { POSTER_FORMATS, POSTER_LAYOUT_VERSION, dayLabel, posterContent, posterPdf, type PosterFormat } from "@/lib/kulturPoster/posterPdf";
import { titleParts, type PosterText } from "@/lib/kulturPoster/titleParts";
import { createAdminClient } from "@/lib/supabase/admin";
import { insertDeck, type DeckPageInput } from "@/lib/uploads/insertDeck";
import { replaceDeckFiles } from "@/lib/uploads/replace";

// Kultur Poster: the folder's reload button pulls the events on sale from
// colosseumberlin.com/event and makes each an A1 poster and a 1080×1920
// still. The PDFs are made here; the browser then turns their pages into
// images and uploads them, as for any PDF (see KulturPosterButton) — so
// the posters are ordinary decks, for playlists like anything else.
//
// Each deck remembers its event and format (source_key) and a hash of
// what went into it, so a pull only redoes the posters whose event
// changed, and a changed one is replaced in place: a screen showing it
// shows the new one. A poster whose event is no longer listed goes to
// the folder's Archiv, and comes back out if the event does.
//
// A poster's text is the event's title taken apart by rule (titleParts),
// unless it's been set by hand from the poster's own menu, which is kept
// in kultur_poster_texts for every pull after.

const FEED = "kultur_poster";
const ARCHIVE_FEED = "kultur_poster_archiv";
const KEY_PREFIX = "wix-event:";

type Admin = ReturnType<typeof createAdminClient>;

export type PosterJob = {
  sourceKey: string;
  hash: string;
  name: string;
  // The deck to replace, or none for a new poster.
  deckId: string | null;
  // The PDF, base64.
  pdf: string;
};

export async function planKulturPoster(): Promise<{ jobs: PosterJob[]; unchanged: number; archived: number }> {
  const user = await requirePage("media");
  const admin = createAdminClient();
  const feedId = await feedFolderId(admin);
  const [events, { data: decks, error: decksError }, archiveId, overrides] = await Promise.all([
    fetchTicketEvents(),
    admin.from("decks").select("id, folder_id, source_key, source_hash").like("source_key", `${KEY_PREFIX}%`),
    archiveFolderId(admin, feedId, false),
    posterTexts(admin),
  ]);
  if (decksError) throw new Error(decksError.message);
  const byKey = new Map((decks ?? []).map((deck) => [deck.source_key!, deck]));

  const jobs: PosterJob[] = [];
  const listed = new Set<string>();
  const restore: string[] = [];
  let unchanged = 0;
  for (const event of events) {
    const override = overrides.get(event.id) ?? null;
    for (const format of Object.keys(POSTER_FORMATS) as PosterFormat[]) {
      const sourceKey = `${KEY_PREFIX}${event.id}:${format}`;
      const name = posterName(event, format);
      const hash = createHash("sha256")
        .update(JSON.stringify({ v: POSTER_LAYOUT_VERSION, format, name, ...posterContent(event, override) }))
        .digest("hex");
      listed.add(sourceKey);
      const existing = byKey.get(sourceKey);
      if (existing?.source_hash === hash) {
        if (archiveId && existing.folder_id === archiveId) restore.push(existing.id);
        unchanged++;
        continue;
      }
      jobs.push({
        sourceKey,
        hash,
        name,
        deckId: existing?.id ?? null,
        pdf: Buffer.from(await posterPdf(event, format, override)).toString("base64"),
      });
    }
  }

  // Only from the folder itself: one moved somewhere else on purpose stays
  // where it was put.
  const stale = (decks ?? []).filter((deck) => !listed.has(deck.source_key!) && deck.folder_id === feedId).map((deck) => deck.id);
  if (stale.length > 0) {
    const archive = archiveId ?? (await archiveFolderId(admin, feedId, true))!;
    const { error } = await admin.from("decks").update({ folder_id: archive }).in("id", stale);
    if (error) throw new Error(error.message);
  }
  if (restore.length > 0) {
    const { error } = await admin.from("decks").update({ folder_id: feedId }).in("id", restore);
    if (error) throw new Error(error.message);
  }

  recordActivity(user, {
    action: "kultur_poster.pull",
    summary:
      `Pulled Kultur Poster from colosseumberlin.com: ${plural(events.length, "event")}, ` +
      `${plural(jobs.length, "poster")} to make` +
      (stale.length ? `, ${plural(stale.length, "poster")} archived` : ""),
  });
  if (stale.length > 0 || restore.length > 0) revalidatePath("/library");
  return { jobs, unchanged, archived: stale.length };
}

// One poster's pages, once they're in storage: a new deck in the folder,
// or swapped in under the one it replaces.
export async function saveKulturPoster({
  sourceKey,
  hash,
  name,
  deckId,
  storagePath,
  sizeBytes,
  pages,
}: {
  sourceKey: string;
  hash: string;
  name: string;
  deckId: string | null;
  storagePath: string;
  sizeBytes: number;
  pages: DeckPageInput[];
}) {
  if (!sourceKey.startsWith(KEY_PREFIX)) throw new Error("Not a Kultur Poster");
  const admin = createAdminClient();

  if (deckId) {
    // A poster someone has limited to certain roles is theirs to keep up
    // to date, like any other PDF.
    await requireEditable("deck", deckId);
    const { data: deck, error } = await admin.from("decks").select("*").eq("id", deckId).eq("source_key", sourceKey).single();
    if (error) throw new Error(error.message);
    // Named for the event as it's called now, its pages too.
    await replaceDeckFiles(admin, { ...deck, name }, { storagePath, sizeBytes, pages });
    const feedId = await feedFolderId(admin);
    const archiveId = await archiveFolderId(admin, feedId, false);
    const { error: updateError } = await admin
      .from("decks")
      .update({ name, source_hash: hash, ...(deck.folder_id === archiveId ? { folder_id: feedId } : {}) })
      .eq("id", deckId);
    if (updateError) throw new Error(updateError.message);
  } else {
    const user = await requirePage("media");
    const feedId = await feedFolderId(admin);
    const deck = await insertDeck(admin, { name, folderId: feedId, storagePath, sizeBytes, pages, uploadedBy: user.id });
    const { error } = await admin.from("decks").update({ source_key: sourceKey, source_hash: hash }).eq("id", deck.id);
    if (error) throw new Error(error.message);
  }

  revalidatePath("/library");
  revalidatePath("/dashboard");
}

// Dated, so one event on two days (Wix lists them apart) reads apart.
function posterName(event: TicketEvent, format: PosterFormat) {
  return `${event.title} · ${dayLabel(event)} · ${POSTER_FORMATS[format].label}`;
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

// Sets the text for both of an event's posters, or (null) hands it back to
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
  const match = sourceKey.match(/^wix-event:(.+):(a1|screen)$/);
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
