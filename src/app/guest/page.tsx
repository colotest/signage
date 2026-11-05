import Link from "next/link";
import { Header } from "@/app/(dashboard)/_components/Header";
import { ViewerProvider } from "@/lib/auth/ViewerContext";
import { getCurrentUser } from "@/lib/auth/session";
import { brandFont } from "@/lib/fonts";
import { GuestView } from "./_components/GuestView";

// Who's signed in decides the header, so it's never served from a cache.
export const dynamic = "force-dynamic";

// The venue for guests, and where colo-cloud.app itself leads: open to
// anyone, signed in or not (see proxy.ts). Signed in, it's one of the
// dashboard's pages, under its header; otherwise the header is the brand
// and a way to sign in.
export default async function GuestPage() {
  const user = await getCurrentUser();
  return (
    // As the dashboard's layout (see there), but white.
    <div className="app-shell app-shell-height flex flex-col bg-surface">
      {user ? (
        <ViewerProvider viewer={user}>
          <Header />
        </ViewerProvider>
      ) : (
        <header className="header-top-safe-area sticky top-0 z-30 flex items-center justify-between border-b border-border header-surface px-5 pb-1.5 shadow-[var(--shadow-bar)]">
          <span className={`${brandFont.className} mt-[0.1em] text-[28.5px] uppercase tracking-tight`}>Colo Cloud</span>
          <Link href="/login" className="text-[15px] font-medium text-foreground/80 hover:text-foreground">
            Anmelden
          </Link>
        </header>
      )}
      <main className="app-main min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-6 pb-6">
        <GuestView />
      </main>
    </div>
  );
}
