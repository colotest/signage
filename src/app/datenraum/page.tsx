import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Header } from "@/app/(dashboard)/_components/Header";
import { ViewerProvider } from "@/lib/auth/ViewerContext";
import { getCurrentUser } from "@/lib/auth/session";
import { fetchDatenraumGallery, fetchDatenraumImages, fetchDatenraumPins } from "@/lib/datenraumMedia";
import {
  DATENRAUM_LANG_COOKIE,
  DATENRAUM_THEME_COOKIE,
  parseDatenraumLang,
  parseDatenraumTheme,
} from "@/lib/datenraumPrefs";
import { brandFont } from "@/lib/fonts";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchUploaderNames } from "@/lib/uploads/uploaders";
import { decksWithPages } from "@/app/(dashboard)/library/page";
import type { GalleryLibrary } from "./_components/DatenraumGallery";
import { DatenraumPrefs, DatenraumSignIn } from "./_components/DatenraumPrefs";
import { DatenraumView } from "./_components/DatenraumView";

export const metadata: Metadata = { title: "Datenraum" };

// Who's signed in decides the header, cookies the theme and language, and
// the media library the pictures, so it's never served from a cache.
export const dynamic = "force-dynamic";

// The venue for guests: open to anyone, signed in or not (see proxy.ts),
// and reached from the header or a link. Signed in, it's one of the
// dashboard's pages, under its header; otherwise the header is the brand
// and a way to sign in. Dark and German unless switched (see
// DatenraumPrefs).
export default async function DatenraumPage() {
  const [user, cookieStore, images, gallery, pins] = await Promise.all([
    getCurrentUser(),
    cookies(),
    fetchDatenraumImages(),
    fetchDatenraumGallery(),
    fetchDatenraumPins(),
  ]);
  // Whoever's roles reach the Media page edits the picture collection, and
  // gets the library to pick from.
  const canEdit = !!user?.access.pages.media;
  const library = canEdit ? await fetchLibrary() : null;
  const view = <DatenraumView images={images} gallery={gallery} pins={pins} canEdit={canEdit} library={library} />;
  return (
    // As the dashboard's layout (see there), on the page's own surface.
    <DatenraumPrefs
      initialTheme={parseDatenraumTheme(cookieStore.get(DATENRAUM_THEME_COOKIE)?.value)}
      initialLang={parseDatenraumLang(cookieStore.get(DATENRAUM_LANG_COOKIE)?.value)}
      className="app-shell app-shell-height flex flex-col bg-surface text-foreground"
    >
      {user ? (
        <ViewerProvider viewer={user}>
          <Header />
        </ViewerProvider>
      ) : (
        <header className="header-top-safe-area sticky top-0 z-30 flex items-center justify-between border-b border-border header-surface px-5 pb-1.5 shadow-[var(--shadow-bar)]">
          <span className={`${brandFont.className} mt-[0.1em] text-[28.5px] uppercase tracking-tight`}>Colo Cloud</span>
          <DatenraumSignIn className="text-[15px] font-medium text-foreground/80 hover:text-foreground" />
        </header>
      )}
      <main className="app-main min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-6 pb-6">
        {/* Signed in, the library's file browser (for adding pictures)
            wants to know who's looking. */}
        {user ? <ViewerProvider viewer={user}>{view}</ViewerProvider> : view}
      </main>
    </DatenraumPrefs>
  );
}

// The library, as the dashboard's Playback Menu gets it, for picking
// pictures from.
async function fetchLibrary(): Promise<GalleryLibrary> {
  const admin = createAdminClient();
  const [{ data: folders }, { data: media }, { data: decks }, uploaders] = await Promise.all([
    admin.from("folders").select("*").order("name", { ascending: true }),
    admin.from("media_items").select("*").order("created_at", { ascending: false }),
    admin.from("decks").select("*").order("created_at", { ascending: false }),
    fetchUploaderNames(admin).catch(() => ({})),
  ]);
  return {
    folders: folders ?? [],
    media: media ?? [],
    decks: decksWithPages(decks ?? [], media ?? []),
    uploaders,
  };
}
