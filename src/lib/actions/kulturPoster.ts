"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { plural, recordActivity } from "@/lib/activity";
import { requirePage } from "@/lib/auth/session";
import { requireEditable } from "@/lib/auth/owned";
import { fetchTicketEvents } from "@/lib/kulturPoster/events";
import { POSTER_FORMATS, POSTER_LAYOUT_VERSION, posterContent, posterPdf, type PosterFormat } from "@/lib/kulturPoster/posterPdf";
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
  const [events, { data: decks, error: decksError }, archiveId] = await Promise.all([
    fetchTicketEvents(),
    admin.from("decks").select("id, folder_id, source_key, source_hash").like("source_key", `${KEY_PREFIX}%`),
    archiveFolderId(admin, feedId, false),
  ]);
  if (decksError) throw new Error(decksError.message);
  const byKey = new Map((decks ?? []).map((deck) => [deck.source_key!, deck]));

  const jobs: PosterJob[] = [];
  const listed = new Set<string>();
  const restore: string[] = [];
  let unchanged = 0;
  for (const event of events) {
    for (const format of Object.keys(POSTER_FORMATS) as PosterFormat[]) {
      const sourceKey = `${KEY_PREFIX}${event.id}:${format}`;
      const hash = createHash("sha256")
        .update(JSON.stringify({ v: POSTER_LAYOUT_VERSION, format, ...posterContent(event) }))
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
        name: posterName(event.title, format),
        deckId: existing?.id ?? null,
        pdf: Buffer.from(await posterPdf(event, format)).toString("base64"),
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

function posterName(title: string, format: PosterFormat) {
  return `${title} · ${POSTER_FORMATS[format].label}`;
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
